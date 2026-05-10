'use strict';
// ritual/httpPrecompile.js
// Shared Ritual HTTP precompile (0x0801) helper.
// Constraint: max 1 async precompile TX per sender per block — serial queue enforced here.

const {
  createPublicClient, createWalletClient, http, defineChain,
  encodeAbiParameters, decodeAbiParameters, toHex,
} = require('viem');
const { privateKeyToAccount } = require('viem/accounts');
require('dotenv').config();

const HTTP_PRECOMPILE = '0x0000000000000000000000000000000000000801';
const TEE_REGISTRY    = '0x9644e8562cE0Fe12b4deeC4163c064A8862Bf47F';

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

const HTTP_REQUEST_ABI = [
  { type: 'address' }, { type: 'bytes[]' }, { type: 'uint256' }, { type: 'bytes[]' },
  { type: 'bytes' }, { type: 'string' }, { type: 'uint8' }, { type: 'string[]' },
  { type: 'string[]' }, { type: 'bytes' }, { type: 'uint256' }, { type: 'uint8' }, { type: 'bool' },
];

const HTTP_RESPONSE_ABI = [
  { type: 'uint16' }, { type: 'string[]' }, { type: 'string[]' }, { type: 'bytes' }, { type: 'string' },
];

// ── Serial queue (1 async TX per sender per block) ────────────────────────────
let _busy = false;
const _queue = [];

function _enqueue(job) {
  return new Promise((resolve, reject) => {
    _queue.push({ ...job, resolve, reject });
    _drain();
  });
}

function _drain() {
  if (_busy || _queue.length === 0) return;
  _busy = true;
  const job = _queue.shift();
  _execute(job)
    .then(job.resolve, job.reject)
    .finally(() => { _busy = false; _drain(); });
}

// ── Executor cache ────────────────────────────────────────────────────────────
let _executorCache = null;

async function _getExecutor(publicClient) {
  if (_executorCache) return _executorCache;
  const services = await publicClient.readContract({
    address: TEE_REGISTRY, abi: TEE_REGISTRY_ABI,
    functionName: 'getServicesByCapability', args: [0, true], // capability 0 = HTTP
  });
  if (!services.length) throw new Error('No HTTP executors (cap 0)');
  _executorCache = services[0].node.teeAddress;
  console.log('[httpPrecompile] Executor:', _executorCache);
  return _executorCache;
}

// ── Core HTTP call ────────────────────────────────────────────────────────────
async function _execute({ url, method, headerKeys, headerValues, body }) {
  const pk = process.env.PRIVATE_KEY;
  if (!pk) throw new Error('No PRIVATE_KEY');

  const account      = privateKeyToAccount(pk.startsWith('0x') ? pk : `0x${pk}`);
  const publicClient = createPublicClient({ chain: ritualChain, transport: http() });
  const walletClient = createWalletClient({ account, chain: ritualChain, transport: http() });

  const executor = await _getExecutor(publicClient);

  const encoded = encodeAbiParameters(HTTP_REQUEST_ABI, [
    executor,
    [],       // encryptedSecrets (plaintext API key in header for now)
    100n,     // ttl: 100 blocks
    [],       // secretSignatures
    '0x',     // userPublicKey
    url,
    method,   // 1=GET, 2=POST
    headerKeys,
    headerValues,
    body,     // hex-encoded body
    0n,       // dkmsKeyIndex
    0,        // dkmsKeyFormat
    false,    // piiEnabled
  ]);

  const hash = await walletClient.sendTransaction({
    to: HTTP_PRECOMPILE,
    data: encoded,
    gas: 2_000_000n,
    maxFeePerGas: 30_000_000_000n,
    maxPriorityFeePerGas: 2_000_000_000n,
  });
  console.log('[httpPrecompile] TX:', hash);

  // Poll for spcCalls (typically 1 block = ~6s)
  const deadline = Date.now() + 90_000; // 90s max
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 4000));
    const receipt = await publicClient.request({
      method: 'eth_getTransactionReceipt', params: [hash],
    }).catch(() => null);
    if (!receipt?.spcCalls?.length) continue;

    const [statusCode, , , respBody, errorMessage] = decodeAbiParameters(
      HTTP_RESPONSE_ABI, receipt.spcCalls[0].output,
    );
    const code = Number(statusCode);
    if (errorMessage) throw new Error(`Ritual HTTP executor error: ${errorMessage}`);
    if (code >= 400) {
      const text = Buffer.from(respBody.slice(2), 'hex').toString('utf8');
      throw new Error(`HTTP ${code}: ${text.slice(0, 200)}`);
    }
    return Buffer.from(respBody.slice(2), 'hex').toString('utf8');
  }
  throw new Error('HTTP precompile timeout after 90s');
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Call DeepSeek (or any OpenAI-compatible LLM) via Ritual HTTP precompile.
 * Returns the assistant message content string.
 */
async function callDeepSeekLLM(messages, maxTokens = 300) {
  const apiKey   = process.env.OPENAI_API_KEY;
  const apiBase  = process.env.LLM_API_BASE  || 'https://api.openai.com/v1';
  const model    = process.env.LLM_MODEL     || 'gpt-4o-mini';

  if (!apiKey) throw new Error('No OPENAI_API_KEY');

  const reqBody = JSON.stringify({
    model, messages, max_tokens: maxTokens, temperature: 0.9,
  });

  const responseText = await _enqueue({
    url: `${apiBase}/chat/completions`,
    method: 2, // POST
    headerKeys:   ['Content-Type', 'Authorization'],
    headerValues: ['application/json', `Bearer ${apiKey}`],
    body: toHex(reqBody),
  });

  const json    = JSON.parse(responseText);
  const content = json.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error('Empty LLM response via Ritual HTTP');
  return content;
}

module.exports = { callDeepSeekLLM };
