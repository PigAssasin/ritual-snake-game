'use strict';
// ritual/test_ritual_llm.js
// Run: node ritual/test_ritual_llm.js
// Tests LLM precompile 0x0802 with GLM-4.7-FP8.
// Logs tx hash, polls for receipt, decodes response.

const {
  createPublicClient, createWalletClient, http, defineChain,
  encodeAbiParameters, decodeAbiParameters, parseAbiParameters,
} = require('viem');
const { privateKeyToAccount } = require('viem/accounts');
require('dotenv').config();

const LLM_PRECOMPILE = '0x0000000000000000000000000000000000000802';
const TEE_REGISTRY   = '0x9644e8562cE0Fe12b4deeC4163c064A8862Bf47F';

const ritualChain = defineChain({
  id: 1979, name: 'Ritual',
  nativeCurrency: { name: 'RITUAL', symbol: 'RITUAL', decimals: 18 },
  rpcUrls: { default: { http: [process.env.RITUAL_RPC_URL || 'https://rpc.ritualfoundation.org'] } },
});

const TEE_REGISTRY_ABI = [{
  inputs: [{ name: 'capability', type: 'uint8' }, { name: 'checkValidity', type: 'bool' }],
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
    { name: 'isValid', type: 'bool' }, { name: 'workloadId', type: 'bytes32' },
  ]}],
  stateMutability: 'view', type: 'function',
}];

async function main() {
  const pk = process.env.PRIVATE_KEY;
  if (!pk) { console.error('PRIVATE_KEY missing'); process.exit(1); }

  const account      = privateKeyToAccount(pk.startsWith('0x') ? pk : `0x${pk}`);
  const publicClient = createPublicClient({ chain: ritualChain, transport: http() });
  const walletClient = createWalletClient({ account, chain: ritualChain, transport: http() });

  console.log('Account:', account.address);
  const balance = await publicClient.getBalance({ address: account.address });
  console.log('Balance:', Number(balance) / 1e18, 'RITUAL');

  // 1. Get executor
  const services = await publicClient.readContract({
    address: TEE_REGISTRY, abi: TEE_REGISTRY_ABI,
    functionName: 'getServicesByCapability', args: [1, true],
  });
  console.log('Executor count:', services.length);
  if (!services.length) { console.error('No executors available'); process.exit(1); }
  const executor = services[0].node.teeAddress;
  console.log('Executor:', executor);

  // 2. Build 30-field LLM call
  const messagesJson = JSON.stringify([
    { role: 'system', content: 'You write exactly 2 sentences — dark, poetic epitaphs for fallen snake warriors.' },
    { role: 'user',   content: 'Player: TestSnake. Score: 420. Kills: 3. Length: 88. Killed by: wall. Write the epitaph.' },
  ]);

  const encoded = encodeAbiParameters(
    parseAbiParameters([
      'address, bytes[], uint256, bytes[], bytes,',
      'string, string, int256, string, bool, int256, string, string,',
      'uint256, bool, int256, string, bytes, int256, string, string, bool,',
      'int256, bytes, bytes, int256, int256, string, bool,',
      '(string,string,string)',
    ].join('')),
    [
      executor,
      [],           // encryptedSecrets
      300n,         // ttl: 300 blocks
      [],           // secretSignatures
      '0x',         // userPublicKey
      messagesJson, // messagesJson
      'zai-org/GLM-4.7-FP8',
      0n, '', false,
      4096n,        // maxCompletionTokens (reasoning model needs >=4096)
      '', '',
      1n, true, 0n, 'medium', '0x', -1n, 'auto', '',
      false,        // stream
      700n, '0x', '0x', -1n, 1000n, '', false,
      ['', '', ''], // convoHistory (empty)
    ],
  );

  // 3. Send tx
  console.log('\nSending LLM tx...');
  const hash = await walletClient.sendTransaction({
    to: LLM_PRECOMPILE,
    data: encoded,
    gas: 3_000_000n,
  });
  console.log('TX hash:', hash);

  // 4. Poll for receipt (up to 5 minutes)
  console.log('Polling every 6s (up to 5 min)...');
  const deadline = Date.now() + 300_000;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 6000));
    const tx = await publicClient.request({ method: 'eth_getTransactionByHash', params: [hash] }).catch(() => null);
    if (!tx) { process.stdout.write('.'); continue; }
    console.log('\nTX known | block:', tx.blockNumber);
    const receipt = await publicClient.request({ method: 'eth_getTransactionReceipt', params: [hash] }).catch(() => null);
    if (!receipt) { console.log('No receipt yet...'); continue; }
    console.log('Receipt status:', receipt.status);
    console.log('logs count:', receipt.logs?.length || 0);
    console.log('spcCalls:', JSON.stringify(receipt.spcCalls ?? null));

    if (receipt.spcCalls?.length) {
      try {
        const outputHex = receipt.spcCalls[0].output;
        console.log('spcCalls[0].output (first 300):', outputHex?.slice(0, 300));
        const [hasError, completionData, , errorMessage] = decodeAbiParameters(
          parseAbiParameters('bool, bytes, bytes, string, (string,string,string)'),
          outputHex,
        );
        console.log('hasError:', hasError);
        console.log('errorMessage:', errorMessage);
        if (!hasError && completionData && completionData !== '0x') {
          const [id, , , , , , , choicesData] = decodeAbiParameters(
            parseAbiParameters('string, string, uint256, string, string, string, uint256, bytes[], bytes'),
            completionData,
          );
          console.log('completion id:', id);
          if (choicesData?.length) {
            const [, finishReason, messageData] = decodeAbiParameters(
              parseAbiParameters('uint256, string, bytes, bytes'),
              choicesData[0],
            );
            console.log('finish_reason:', finishReason);
            const [role, content] = decodeAbiParameters(
              parseAbiParameters('string, string, bytes, string'),
              messageData,
            );
            console.log('role:', role);
            console.log('\nCONTENT:\n', content);
          }
        }
      } catch (e) {
        console.error('Decode error:', e.message);
      }
    }
    break;
  }
  if (Date.now() >= deadline) console.log('\nTIMEOUT — tx never settled in 5 minutes');
}

main().catch(e => { console.error(e.message); process.exit(1); });
