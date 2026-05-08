'use strict';

/**
 * tournamentChronicle.js — Ritual Sovereign Agent
 *
 * At end of Private Room session:
 *   1. Call Ritual Sovereign Agent (0x080C) with match stats
 *   2. Agent writes a tournament narrative (4-6 sentences)
 *   3. Store chronicle onchain via SnakeGame.setChronicle()
 *   4. Broadcast to all players still connected
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

// ── Ritual Chain ─────────────────────────────────────────────────────────────
const ritualChain = defineChain({
  id: 1979,
  name: 'Ritual',
  nativeCurrency: { name: 'RITUAL', symbol: 'RITUAL', decimals: 18 },
  rpcUrls: { default: { http: [process.env.RITUAL_RPC_URL || 'https://rpc.ritualfoundation.org'] } },
});

// ── Contract addresses ───────────────────────────────────────────────────────
const SOVEREIGN_AGENT = '0x000000000000000000000000000000000000080C';
const TEE_REGISTRY    = '0x9644e8562cE0Fe12b4deeC4163c064A8862Bf47F';
const RITUAL_WALLET   = '0x532F0dF0896F353d8C3DD8cc134e8129DA2a3948';

// ── ABIs ─────────────────────────────────────────────────────────────────────
const TEE_REGISTRY_ABI = [{
  inputs: [
    { name: 'capability', type: 'uint8'  },
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

const SNAKE_GAME_ABI = [
  'function recordSession(string roomId, string winnerName, address winnerAddr, uint256 winnerScore) external',
  'function setChronicle(uint256 sessionId, string chronicle) external',
  'function sessionCount() external view returns (uint256)',
];

// ── Main export ──────────────────────────────────────────────────────────────

/**
 * Generate and store a tournament chronicle for a completed private room session.
 *
 * @param {object} sessionData
 *   { roomId, sessionNumber, results: [{name, score, kills, deaths}], winner }
 * @param {GameRoom} room — room instance (to broadcast result)
 */
async function generateTournamentChronicle(sessionData, room = null) {
  const privateKey       = process.env.PRIVATE_KEY;
  const contractAddr     = process.env.CONTRACT_ADDRESS;

  // Broadcast pending notice immediately
  if (room) {
    room._broadcastAll({ t: 'chronicle_pending', msg: 'RITUAL AI IS WRITING THE CHRONICLE...' });
  }

  // If no key configured, use fallback and still broadcast
  if (!privateKey) {
    console.warn('[tournamentChronicle] No PRIVATE_KEY — using fallback chronicle');
    const fallback = _fallbackChronicle(sessionData);
    if (room) room._broadcastAll({ t: 'tournament_chronicle', chronicle: fallback, results: sessionData.results, winner: sessionData.winner });
    return fallback;
  }

  const account      = privateKeyToAccount(privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`);
  const publicClient = createPublicClient({ chain: ritualChain, transport: http() });
  const walletClient = createWalletClient({ account, chain: ritualChain, transport: http() });

  try {
    // Ensure wallet deposit
    await _ensureWalletDeposit(publicClient, walletClient, account.address);

    // Get executor (capability 1 = LLM, used as fallback for agent)
    const executor = await _getExecutor(publicClient, 1);
    if (!executor) throw new Error('No executor available');

    // Call Sovereign Agent
    const chronicle = await _callSovereignAgent(walletClient, publicClient, executor, sessionData);
    console.log(`[tournamentChronicle] Chronicle: "${chronicle.slice(0, 80)}..."`);

    // Store onchain
    if (contractAddr) {
      await _storeOnchain(contractAddr, sessionData, chronicle);
    }

    // Broadcast to room
    if (room) {
      room._broadcastAll({
        t:         'tournament_chronicle',
        chronicle,
        results:   sessionData.results,
        winner:    sessionData.winner,
      });
    }

    return chronicle;

  } catch (err) {
    console.error('[tournamentChronicle] Error:', err.message);
    const fallback = _fallbackChronicle(sessionData);
    if (room) room._broadcastAll({ t: 'tournament_chronicle', chronicle: fallback, results: sessionData.results, winner: sessionData.winner });
    return fallback;
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
  if (balance >= BigInt('100000000000000000')) return;
  const hash = await walletClient.writeContract({
    address: RITUAL_WALLET,
    abi: RITUAL_WALLET_ABI,
    functionName: 'deposit',
    args: [5000n],
    value: BigInt('500000000000000000'),
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

async function _callSovereignAgent(walletClient, publicClient, executor, data) {
  const statsText = data.results.map((r, i) => {
    const weighted = r.score + r.kills * 10 - r.deaths * 3;
    return `${i + 1}. ${r.name}: score=${r.score}, kills=${r.kills}, deaths=${r.deaths}, weighted=${weighted}`;
  }).join('\n');

  const task = `You are a dramatic tournament commentator for a competitive snake battle game.
Write a 4-6 sentence tournament chronicle for Session #${data.sessionNumber} in room ${data.roomId}.
Tone: epic, like a sports broadcaster + fantasy narrator. Mention the winner by name and 1-2 standout performances.
Do NOT mention technical details like "weighted score" or "food eaten" — use in-universe language like "claimed X victories" or "devoured X segments".

Match results:
${statsText}

Winner: ${data.winner?.name || 'none'} (score: ${data.winner?.score || 0}, kills: ${data.winner?.kills || 0})

Write the chronicle:`;

  // Encode Sovereign Agent call
  // ABI: (executor, model, task, tools[], max_tokens, ttl, encrypted_secrets[], secret_signatures[], user_public_key)
  const encoded = encodeAbiParameters(
    [
      { type: 'address'  },  // executor
      { type: 'string'   },  // model
      { type: 'string'   },  // task
      { type: 'string[]' },  // tools (empty)
      { type: 'uint256'  },  // max_tokens
      { type: 'uint256'  },  // ttl (blocks)
      { type: 'bytes[]'  },  // encrypted_secrets
      { type: 'bytes[]'  },  // secret_signatures
      { type: 'bytes'    },  // user_public_key
    ],
    [executor, 'claude-haiku-4-5-20251001', task, [], 400n, 300n, [], [], '0x']
  );

  const hash = await walletClient.sendTransaction({
    to:                   SOVEREIGN_AGENT,
    data:                 encoded,
    gas:                  3_000_000n,
    maxFeePerGas:         20_000_000_000n,
    maxPriorityFeePerGas: 2_000_000_000n,
  });

  console.log(`[tournamentChronicle] Agent tx: ${hash}`);

  // Poll for spcCalls result (up to 5 minutes)
  const result = await _pollForResult(publicClient, hash, 300_000);
  return result || _fallbackChronicle(data);
}

async function _pollForResult(publicClient, hash, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 5000));
    try {
      const raw = await publicClient.request({ method: 'eth_getTransactionReceipt', params: [hash] });
      if (raw?.spcCalls?.length) {
        const [content] = decodeAbiParameters([{ type: 'string' }], raw.spcCalls[0].output);
        if (content) return content;
      }
    } catch (_) {}
  }
  return null;
}

async function _storeOnchain(contractAddr, data, chronicle) {
  const pk = process.env.PRIVATE_KEY;
  const provider = new ethers.JsonRpcProvider(process.env.RITUAL_RPC_URL || 'https://rpc.ritualfoundation.org');
  const signer   = new ethers.Wallet(pk.startsWith('0x') ? pk : `0x${pk}`, provider);
  const contract = new ethers.Contract(contractAddr, SNAKE_GAME_ABI, signer);

  const tx1 = await contract.recordSession(
    data.roomId,
    data.winner?.name || '',
    ethers.ZeroAddress,
    BigInt(data.winner?.score || 0)
  );
  await tx1.wait();

  const count = await contract.sessionCount();
  const tx2   = await contract.setChronicle(count, chronicle);
  await tx2.wait();

  console.log(`[tournamentChronicle] Stored onchain — session #${count}`);
}

function _fallbackChronicle(data) {
  const winner = data.winner;
  if (!winner) return `Session #${data.sessionNumber} in room ${data.roomId} concluded with no survivors standing.`;
  const runnerUp = data.results[1];
  const rivalry  = runnerUp ? ` ${winner.name} edged out ${runnerUp.name} in a fierce contest.` : '';
  return `Session #${data.sessionNumber} — ${winner.name} claimed dominion over room ${data.roomId} with ${winner.score} points and ${winner.kills} kills.${rivalry} ${data.results.length} warriors entered; only legends remain.`;
}

module.exports = { generateTournamentChronicle };
