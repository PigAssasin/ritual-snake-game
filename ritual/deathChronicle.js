'use strict';

const {
  createPublicClient,
  createWalletClient,
  http,
  defineChain,
  encodeAbiParameters,
  decodeAbiParameters,
  parseAbiParameters,
  keccak256,
  toHex,
} = require('viem');
const { privateKeyToAccount } = require('viem/accounts');
const { ethers } = require('ethers');
require('dotenv').config();

const ritualChain = defineChain({
  id: 1979,
  name: 'Ritual',
  nativeCurrency: { name: 'RITUAL', symbol: 'RITUAL', decimals: 18 },
  rpcUrls: { default: { http: [process.env.RITUAL_RPC_URL || 'https://rpc.ritualfoundation.org'] } },
});

const LLM_PRECOMPILE  = '0x0000000000000000000000000000000000000802';
const TEE_REGISTRY    = '0x9644e8562cE0Fe12b4deeC4163c064A8862Bf47F';
const RITUAL_WALLET   = '0x532F0dF0896F353d8C3DD8cc134e8129DA2a3948';

const TEE_REGISTRY_ABI = [{
  inputs: [
    { name: 'capability', type: 'uint8' },
    { name: 'checkValidity', type: 'bool' },
  ],
  name: 'getServicesByCapability',
  outputs: [{ type: 'tuple[]', components: [
    { name: 'node', type: 'tuple', components: [
      { name: 'paymentAddress', type: 'address' },
      { name: 'teeAddress',     type: 'address' },
      { name: 'teeType',        type: 'uint8'   },
      { name: 'publicKey',      type: 'bytes'   },
      { name: 'endpoint',       type: 'string'  },
      { name: 'certPubKeyHash', type: 'bytes32' },
      { name: 'capability',     type: 'uint8'   },
    ]},
    { name: 'isValid',    type: 'bool'    },
    { name: 'workloadId', type: 'bytes32' },
  ]}],
  stateMutability: 'view',
  type: 'function',
}];

const RITUAL_WALLET_ABI = [{
  inputs: [{ name: 'lockDuration', type: 'uint256' }],
  name: 'deposit',
  outputs: [],
  stateMutability: 'payable',
  type: 'function',
}, {
  inputs: [{ name: 'user', type: 'address' }],
  name: 'balanceOf',
  outputs: [{ type: 'uint256' }],
  stateMutability: 'view',
  type: 'function',
}];

const CHRONICLE_NFT_ABI = [
  'function mint(address to, string name, uint256 score, uint256 kills, uint256 length, string killedBy, string epitaph, string portraitUri) external returns (uint256)',
];

// 30-field LLM ABI layout (ritual-dapp-llm skill)
const LLM_ABI = [
  'address, bytes[], uint256, bytes[], bytes,',
  'string, string, int256, string, bool, int256, string, string,',
  'uint256, bool, int256, string, bytes, int256, string, string, bool,',
  'int256, bytes, bytes, int256, int256, string, bool,',
  '(string,string,string)',
].join('');

const PRECOMPILE_CALLED_TOPIC = keccak256(toHex('PrecompileCalled(address,bytes,bytes)'));

async function generateDeathChronicle(stats, playerWs = null) {
  const privateKey       = process.env.PRIVATE_KEY;
  const chronicleNftAddr = process.env.CHRONICLE_NFT_ADDRESS;

  if (!privateKey) {
    console.warn('[deathChronicle] No PRIVATE_KEY — skipping');
    return null;
  }

  const account      = privateKeyToAccount(privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`);
  const publicClient = createPublicClient({ chain: ritualChain, transport: http() });
  const walletClient = createWalletClient({ account, chain: ritualChain, transport: http() });

  try {
    await _ensureWalletDeposit(publicClient, walletClient, account.address);

    const executor = await _getExecutor(publicClient);
    if (!executor) throw new Error('No LLM executor available');
    console.log(`[deathChronicle] executor: ${executor}`);

    const epitaph = await _callLLM(walletClient, publicClient, executor, stats);
    console.log(`[deathChronicle] epitaph: "${epitaph}"`);

    const portraitUri = null; // Image precompile separate ABI — skip for now

    let tokenId = null;
    if (chronicleNftAddr && stats.walletAddress) {
      tokenId = await _mintNFT(stats, epitaph, portraitUri || '', chronicleNftAddr);
      console.log(`[deathChronicle] minted tokenId=${tokenId}`);
    }

    if (playerWs?.readyState === 1) {
      playerWs.send(JSON.stringify({ t: 'chronicle_ready', epitaph, portraitUri, tokenId, stats }));
    }

    return { tokenId, epitaph, portraitUri };

  } catch (err) {
    console.error('[deathChronicle] Error:', err.message);
    const fallback = _fallbackEpitaph(stats);
    if (playerWs?.readyState === 1) {
      playerWs.send(JSON.stringify({ t: 'chronicle_ready', epitaph: fallback, portraitUri: null, tokenId: null, stats }));
    }
    return null;
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function _ensureWalletDeposit(publicClient, walletClient, address) {
  const balance = await publicClient.readContract({
    address: RITUAL_WALLET, abi: RITUAL_WALLET_ABI,
    functionName: 'balanceOf', args: [address],
  });
  if (balance >= BigInt('320000000000000000')) return; // >= 0.32 RITUAL, ok
  console.log(`[deathChronicle] depositing 0.35 RITUAL (current: ${balance})`);
  const hash = await walletClient.writeContract({
    address: RITUAL_WALLET, abi: RITUAL_WALLET_ABI,
    functionName: 'deposit', args: [5000n],
    value: BigInt('350000000000000000'),
  });
  await publicClient.waitForTransactionReceipt({ hash });
}

async function _getExecutor(publicClient) {
  const services = await publicClient.readContract({
    address: TEE_REGISTRY, abi: TEE_REGISTRY_ABI,
    functionName: 'getServicesByCapability', args: [1, true],
  });
  return services[0]?.node?.teeAddress || null;
}

async function _callLLM(walletClient, publicClient, executor, stats) {
  const messagesJson = JSON.stringify([
    {
      role: 'system',
      content: 'You write exactly 2 sentences - dark, poetic epitaphs for fallen snake warriors. Be dramatic. Mention how they died. Never mention game mechanics.',
    },
    {
      role: 'user',
      content: `Player: ${stats.name}. Score: ${stats.score}. Kills: ${stats.kills}. Length: ${stats.length}. Killed by: ${stats.killedBy}. Write the epitaph.`,
    },
  ]);

  const encoded = encodeAbiParameters(
    parseAbiParameters(LLM_ABI),
    [
      executor, [], 300n, [], '0x',
      messagesJson,
      'zai-org/GLM-4.7-FP8',
      0n, '', false, 4096n, '', '',
      1n, true, 0n, 'medium', '0x', -1n, 'auto', '',
      false,           // stream
      700n, '0x', '0x', -1n, 1000n, '',
      false,           // piiEnabled
      ['', '', ''],   // convoHistory (none)
    ],
  );

  const hash = await walletClient.sendTransaction({
    to:                   LLM_PRECOMPILE,
    data:                 encoded,
    gas:                  3_000_000n,
    maxFeePerGas:         20_000_000_000n,
    maxPriorityFeePerGas:  2_000_000_000n,
  });
  console.log(`[deathChronicle] LLM commitment tx: ${hash}`);

  // Wait for commitment receipt first
  await publicClient.waitForTransactionReceipt({ hash, timeout: 60_000 });

  // Ritual async: fulfillment arrives in a later block — poll until PrecompileCalled event appears
  const resultHex = await _pollForFulfillment(publicClient, hash, LLM_PRECOMPILE, 240_000);
  if (!resultHex) {
    console.warn('[deathChronicle] LLM fulfillment timed out — using fallback');
    return _fallbackEpitaph(stats);
  }

  const content = _decodeLLMContent(resultHex);
  return content || _fallbackEpitaph(stats);
}

// Poll eth_getTransactionReceipt every 6s until PrecompileCalled event appears
async function _pollForFulfillment(publicClient, hash, precompileAddr, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const receipt = await publicClient.request({
        method: 'eth_getTransactionReceipt',
        params: [hash],
      });
      if (receipt) {
        const result = _extractPrecompileResult(receipt, precompileAddr);
        if (result) return result;
      }
    } catch (_) {}
    await _sleep(6000);
  }
  return null;
}

function _extractPrecompileResult(receipt, precompileAddr) {
  const topic = PRECOMPILE_CALLED_TOPIC.toLowerCase();
  for (const log of (receipt.logs || [])) {
    if (log.topics?.[0]?.toLowerCase() !== topic) continue;
    try {
      const [addr, , output] = decodeAbiParameters(
        parseAbiParameters('address, bytes, bytes'),
        log.data,
      );
      if (addr.toLowerCase() !== precompileAddr.toLowerCase()) continue;
      try {
        const [, actual] = decodeAbiParameters(parseAbiParameters('bytes, bytes'), output);
        return actual;
      } catch {
        return output;
      }
    } catch (e) {
      console.warn('[deathChronicle] log decode error:', e.message);
    }
  }
  return null;
}

function _decodeLLMContent(resultHex) {
  try {
    const [hasError, completionData, , errorMessage] = decodeAbiParameters(
      parseAbiParameters('bool, bytes, bytes, string, (string,string,string)'),
      resultHex,
    );
    if (hasError) {
      console.error('[deathChronicle] LLM hasError:', errorMessage);
      return null;
    }
    const [, , , , , , choicesCount, choicesData] = decodeAbiParameters(
      parseAbiParameters('string, string, uint256, string, string, string, uint256, bytes[], bytes'),
      completionData,
    );
    if (!choicesCount || !choicesData?.length) return null;
    const [, , messageData] = decodeAbiParameters(
      parseAbiParameters('uint256, string, bytes'),
      choicesData[0],
    );
    const [, content] = decodeAbiParameters(
      parseAbiParameters('string, string, string, uint256, bytes[]'),
      messageData,
    );
    // Strip GLM-4.7-FP8 reasoning block
    return content ? content.replace(/<think>[\s\S]*?<\/think>/g, '').trim() : null;
  } catch (e) {
    console.error('[deathChronicle] decode error:', e.message);
    return null;
  }
}

async function _mintNFT(stats, epitaph, portraitUri, contractAddr) {
  const provider = new ethers.JsonRpcProvider(process.env.RITUAL_RPC_URL || 'https://rpc.ritualfoundation.org');
  const pk = process.env.PRIVATE_KEY;
  const signer   = new ethers.Wallet(pk.startsWith('0x') ? pk : `0x${pk}`, provider);
  const contract = new ethers.Contract(contractAddr, CHRONICLE_NFT_ABI, signer);
  const tx = await contract.mint(
    stats.walletAddress, stats.name,
    BigInt(stats.score), BigInt(stats.kills), BigInt(stats.length),
    stats.killedBy, epitaph, portraitUri
  );
  const receipt = await tx.wait();
  const iface = new ethers.Interface(['event ChroniclesMinted(uint256 indexed tokenId, address indexed player, string playerName)']);
  for (const log of receipt.logs) {
    try { const p = iface.parseLog(log); if (p) return p.args.tokenId.toString(); } catch (_) {}
  }
  return null;
}

function _fallbackEpitaph(stats) {
  return `${stats.name} fought valiantly, claiming ${stats.kills} souls before their ${stats.length}-segment form was undone by ${stats.killedBy}. They fade into the digital abyss, ${stats.score} points their only legacy.`;
}

function _sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

module.exports = { generateDeathChronicle };
