'use strict';

/**
 * deathChronicle.js — Ritual LLM + Image precompile
 *
 * Flow:
 *   1. Call Ritual LLM precompile (0x0802) → epitaph text (2 sentences)
 *   2. Call Ritual Image precompile (0x0818) → portrait (base64 PNG)
 *   3. Mint ChronicleNFT via ChronicleNFT.sol
 *
 * All steps are async and run in background after player elimination.
 * Player gets a WS notification when NFT is ready.
 */

const {
  createPublicClient,
  createWalletClient,
  http,
  defineChain,
  encodeAbiParameters,
  decodeAbiParameters,
} = require('viem');
const { privateKeyToAccount } = require('viem/accounts');
const { ethers } = require('ethers');
require('dotenv').config();

// ── Ritual Chain definition ──────────────────────────────────────────────────
const ritualChain = defineChain({
  id: 1979,
  name: 'Ritual',
  nativeCurrency: { name: 'RITUAL', symbol: 'RITUAL', decimals: 18 },
  rpcUrls: { default: { http: [process.env.RITUAL_RPC_URL || 'https://rpc.ritualfoundation.org'] } },
});

// ── Contract addresses ───────────────────────────────────────────────────────
const LLM_PRECOMPILE   = '0x0000000000000000000000000000000000000802';
const IMAGE_PRECOMPILE = '0x0000000000000000000000000000000000000818';
const TEE_REGISTRY     = '0x9644e8562cE0Fe12b4deeC4163c064A8862Bf47F';
const RITUAL_WALLET    = '0x532F0dF0896F353d8C3DD8cc134e8129DA2a3948';

// ── ABIs ─────────────────────────────────────────────────────────────────────
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

// ── Main export ──────────────────────────────────────────────────────────────

/**
 * Generate Death Chronicle for an eliminated player.
 * Returns { tokenId, epitaph, portraitUri } or null on failure.
 *
 * @param {object} stats
 *   { playerId, name, score, kills, length, killedBy, walletAddress? }
 * @param {WebSocket|null} playerWs  — WS to notify when done (optional)
 */
async function generateDeathChronicle(stats, playerWs = null) {
  const privateKey       = process.env.PRIVATE_KEY;
  const chronicleNftAddr = process.env.CHRONICLE_NFT_ADDRESS;

  if (!privateKey) {
    console.warn('[deathChronicle] No PRIVATE_KEY — skipping Ritual calls');
    return null;
  }

  const account      = privateKeyToAccount(privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`);
  const publicClient = createPublicClient({ chain: ritualChain, transport: http() });
  const walletClient = createWalletClient({ account, chain: ritualChain, transport: http() });

  try {
    // Step 1: Ensure RitualWallet has enough balance
    await _ensureWalletDeposit(publicClient, walletClient, account.address);

    // Step 2: Get LLM executor
    const executor = await _getExecutor(publicClient, 1);
    if (!executor) throw new Error('No LLM executor available');

    // Step 3: Generate epitaph via LLM precompile
    const epitaph = await _callLLM(walletClient, publicClient, executor, stats);
    console.log(`[deathChronicle] Epitaph: "${epitaph}"`);

    // Step 4: Generate portrait via Image precompile
    const portraitUri = await _callImage(walletClient, publicClient, executor, stats, epitaph);
    console.log(`[deathChronicle] Portrait generated: ${portraitUri ? 'yes' : 'no'}`);

    // Step 5: Mint NFT (if contract is deployed and player has a wallet)
    let tokenId = null;
    if (chronicleNftAddr && stats.walletAddress) {
      tokenId = await _mintNFT(stats, epitaph, portraitUri || '', chronicleNftAddr);
      console.log(`[deathChronicle] NFT minted: tokenId=${tokenId}`);
    }

    // Step 6: Notify player via WebSocket
    if (playerWs?.readyState === 1) {
      playerWs.send(JSON.stringify({
        t: 'chronicle_ready',
        epitaph,
        portraitUri,
        tokenId,
        stats,
      }));
    }

    return { tokenId, epitaph, portraitUri };

  } catch (err) {
    console.error('[deathChronicle] Error:', err.message);
    // Still notify player with whatever we have (fallback epitaph)
    const fallback = _fallbackEpitaph(stats);
    if (playerWs?.readyState === 1) {
      playerWs.send(JSON.stringify({ t: 'chronicle_ready', epitaph: fallback, portraitUri: null, tokenId: null, stats }));
    }
    return null;
  }
}

// ── Internal helpers ─────────────────────────────────────────────────────────

async function _ensureWalletDeposit(publicClient, walletClient, address) {
  const balance = await publicClient.readContract({
    address: RITUAL_WALLET,
    abi: RITUAL_WALLET_ABI,
    functionName: 'balanceOf',
    args: [address],
  });
  if (balance >= BigInt('100000000000000000')) return; // >= 0.1 RITUAL, ok
  const hash = await walletClient.writeContract({
    address: RITUAL_WALLET,
    abi: RITUAL_WALLET_ABI,
    functionName: 'deposit',
    args: [5000n],
    value: BigInt('500000000000000000'), // 0.5 RITUAL
  });
  await publicClient.waitForTransactionReceipt({ hash });
}

async function _getExecutor(publicClient, capability) {
  const services = await publicClient.readContract({
    address: TEE_REGISTRY,
    abi: TEE_REGISTRY_ABI,
    functionName: 'getServicesByCapability',
    args: [capability, true],
  });
  return services[0]?.node?.teeAddress || null;
}

async function _callLLM(walletClient, publicClient, executor, stats) {
  const messages = [
    {
      role: 'system',
      content: 'You write exactly 2 sentences — dark, poetic epitaphs for fallen snake warriors. Be dramatic. Mention how they died. Never mention game mechanics.',
    },
    {
      role: 'user',
      content: `Player: ${stats.name}. Score: ${stats.score}. Kills: ${stats.kills}. Length: ${stats.length}. Killed by: ${stats.killedBy}. Write the epitaph.`,
    },
  ];

  const encoded = encodeAbiParameters(
    [
      { type: 'address' },   // executor
      { type: 'string'  },   // model
      { type: 'tuple[]', components: [{ name: 'role', type: 'string' }, { name: 'content', type: 'string' }] },
      { type: 'uint256' },   // max_tokens
      { type: 'uint256' },   // temperature ×100 (80 = 0.8)
      { type: 'uint256' },   // ttl (blocks)
      { type: 'bytes[]' },   // encrypted_secrets
      { type: 'bytes[]' },   // secret_signatures
      { type: 'bytes'   },   // user_public_key
      { type: 'uint256' },   // stream (0=false)
    ],
    [executor, 'claude-haiku-4-5-20251001', messages, 120n, 80n, 200n, [], [], '0x', 0n]
  );

  const hash = await walletClient.sendTransaction({
    to:                    LLM_PRECOMPILE,
    data:                  encoded,
    gas:                   2_000_000n,
    maxFeePerGas:          20_000_000_000n,
    maxPriorityFeePerGas:  2_000_000_000n,
  });

  const rawReceipt = await _waitForSpcReceipt(publicClient, hash, 120_000);
  if (!rawReceipt?.spcCalls?.length) return _fallbackEpitaph(stats);

  const [content] = decodeAbiParameters(
    [{ type: 'string' }, { type: 'string' }, { type: 'uint256' }, { type: 'uint256' }],
    rawReceipt.spcCalls[0].output
  );
  return content || _fallbackEpitaph(stats);
}

async function _callImage(walletClient, publicClient, executor, stats, epitaph) {
  const prompt = `Dark fantasy portrait of a fallen snake warrior named ${stats.name}. ${epitaph} Style: digital art, dark background, neon accents, moody.`;

  const encoded = encodeAbiParameters(
    [
      { type: 'address' },  // executor
      { type: 'string'  },  // model
      { type: 'string'  },  // prompt
      { type: 'uint256' },  // width
      { type: 'uint256' },  // height
      { type: 'uint256' },  // steps
      { type: 'uint256' },  // ttl (blocks)
      { type: 'bytes[]' },  // encrypted_secrets
      { type: 'bytes[]' },  // secret_signatures
      { type: 'bytes'   },  // user_public_key
    ],
    [executor, 'stable-diffusion-xl', prompt, 512n, 512n, 20n, 300n, [], [], '0x']
  );

  const hash = await walletClient.sendTransaction({
    to:                    IMAGE_PRECOMPILE,
    data:                  encoded,
    gas:                   3_000_000n,
    maxFeePerGas:          20_000_000_000n,
    maxPriorityFeePerGas:  2_000_000_000n,
  });

  const rawReceipt = await _waitForSpcReceipt(publicClient, hash, 180_000);
  if (!rawReceipt?.spcCalls?.length) return null;

  const [imageB64] = decodeAbiParameters([{ type: 'string' }], rawReceipt.spcCalls[0].output);
  return imageB64 ? `data:image/png;base64,${imageB64}` : null;
}

async function _mintNFT(stats, epitaph, portraitUri, contractAddr) {
  const provider = new ethers.JsonRpcProvider(process.env.RITUAL_RPC_URL || 'https://rpc.ritualfoundation.org');
  const pk = process.env.PRIVATE_KEY;
  const signer   = new ethers.Wallet(pk.startsWith('0x') ? pk : `0x${pk}`, provider);
  const contract = new ethers.Contract(contractAddr, CHRONICLE_NFT_ABI, signer);

  const tx = await contract.mint(
    stats.walletAddress,
    stats.name,
    BigInt(stats.score),
    BigInt(stats.kills),
    BigInt(stats.length),
    stats.killedBy,
    epitaph,
    portraitUri
  );
  const receipt = await tx.wait();
  // Parse tokenId from event logs
  const iface = new ethers.Interface(['event ChroniclesMinted(uint256 indexed tokenId, address indexed player, string playerName)']);
  for (const log of receipt.logs) {
    try {
      const parsed = iface.parseLog(log);
      if (parsed) return parsed.args.tokenId.toString();
    } catch (_) {}
  }
  return null;
}

async function _waitForSpcReceipt(publicClient, hash, timeoutMs) {
  await publicClient.waitForTransactionReceipt({ hash, timeout: timeoutMs });
  return publicClient.request({ method: 'eth_getTransactionReceipt', params: [hash] });
}

function _fallbackEpitaph(stats) {
  return `${stats.name} fought valiantly, claiming ${stats.kills} souls before their ${stats.length}-segment form was undone by ${stats.killedBy}. They fade into the digital abyss, ${stats.score} fragments of sustenance their only legacy.`;
}

module.exports = { generateDeathChronicle };
