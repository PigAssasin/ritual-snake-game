'use strict';

const { ethers } = require('ethers');
require('dotenv').config();

const SNAKE_GAME_ABI = [
  'function recordSession(string roomId, string winnerName, address winnerAddr, uint256 winnerScore) external',
  'function setChronicle(uint256 sessionId, string chronicle) external',
  'function sessionCount() external view returns (uint256)',
];

async function generateTournamentChronicle(sessionData, room = null) {
  const privateKey   = process.env.PRIVATE_KEY;
  const contractAddr = process.env.CONTRACT_ADDRESS;

  if (room) {
    room._broadcastAll({ t: 'chronicle_pending', msg: 'RITUAL AI IS WRITING THE CHRONICLE...' });
  }

  if (!privateKey) {
    console.warn('[tournamentChronicle] No PRIVATE_KEY — using fallback');
    const fallback = _fallbackChronicle(sessionData);
    if (room) room._broadcastAll({ t: 'tournament_chronicle', chronicle: fallback, results: sessionData.results, winner: sessionData.winner });
    return fallback;
  }

  let chronicle;
  try {
    chronicle = await _callLLM(sessionData);
    console.log(`[tournamentChronicle] chronicle: "${chronicle.slice(0, 80)}..."`);
  } catch (err) {
    console.error('[tournamentChronicle] LLM failed:', err.message);
    chronicle = _fallbackChronicle(sessionData);
  }

  // Store onchain (fire and forget)
  if (contractAddr) {
    _storeOnchain(contractAddr, sessionData, chronicle).catch(err =>
      console.error('[tournamentChronicle] onchain store failed:', err.message)
    );
  }

  if (room) {
    room._broadcastAll({ t: 'tournament_chronicle', chronicle, results: sessionData.results, winner: sessionData.winner });
  }
  return chronicle;
}

// ── LLM via Ritual HTTP precompile with direct fallback ───────────────────────

async function _callLLM(data) {
  const statsText = data.results.map((r, i) =>
    `${i + 1}. ${r.name}: score=${r.score}, kills=${r.kills}`
  ).join('\n');

  const messages = [
    {
      role: 'system',
      content: 'You are a dramatic tournament commentator for a competitive snake battle game. Write exactly 4-6 sentences — epic, like a sports broadcaster + fantasy narrator. Mention the winner by name. Use in-universe language like "claimed X victories" or "devoured the arena". Never mention game mechanics.',
    },
    {
      role: 'user',
      content: `Match results:\n${statsText}\n\nWinner: ${data.winner?.name || 'none'} (score: ${data.winner?.score || 0}, kills: ${data.winner?.kills || 0})\n\nWrite the tournament chronicle for Session #${data.sessionNumber} in room ${data.roomId}:`,
    },
  ];

  // Try Ritual HTTP precompile first
  try {
    const { callDeepSeekLLM } = require('./httpPrecompile');
    const result = await callDeepSeekLLM(messages, 300);
    console.log('[tournamentChronicle] Ritual HTTP precompile success');
    return result;
  } catch (err) {
    console.warn('[tournamentChronicle] HTTP precompile failed, using direct fetch:', err.message);
  }

  // Fallback: direct DeepSeek
  return _callLLMDirect(messages);
}

async function _callLLMDirect(messages) {
  const apiKey   = process.env.OPENAI_API_KEY;
  const apiBase  = process.env.LLM_API_BASE  || 'https://api.openai.com/v1';
  const apiModel = process.env.LLM_MODEL     || 'gpt-4o-mini';
  if (!apiKey) throw new Error('No OPENAI_API_KEY');

  const res = await fetch(`${apiBase}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({ model: apiModel, messages, max_tokens: 300, temperature: 0.9 }),
  });
  if (!res.ok) { const t = await res.text().catch(() => ''); throw new Error(`DeepSeek ${res.status}: ${t.slice(0, 200)}`); }
  const json    = await res.json();
  const content = json.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error('Empty DeepSeek response');
  return content;
}

// ── Onchain storage ───────────────────────────────────────────────────────────

async function _storeOnchain(contractAddr, data, chronicle) {
  const pk       = process.env.PRIVATE_KEY;
  const provider = new ethers.JsonRpcProvider(process.env.RITUAL_RPC_URL || 'https://rpc.ritualfoundation.org');
  const signer   = new ethers.Wallet(pk.startsWith('0x') ? pk : `0x${pk}`, provider);
  const contract = new ethers.Contract(contractAddr, SNAKE_GAME_ABI, signer);

  const tx1 = await contract.recordSession(
    data.roomId, data.winner?.name || '',
    ethers.ZeroAddress, BigInt(data.winner?.score || 0)
  );
  await tx1.wait();
  const count = await contract.sessionCount();
  const tx2   = await contract.setChronicle(count, chronicle);
  await tx2.wait();
  console.log(`[tournamentChronicle] Stored onchain — session #${count}`);
}

// ── Fallback ──────────────────────────────────────────────────────────────────

function _fallbackChronicle(data) {
  const winner  = data.winner;
  if (!winner) return `Session #${data.sessionNumber} in room ${data.roomId} concluded with no survivors standing.`;
  const runnerUp = data.results[1];
  const rivalry  = runnerUp ? ` ${winner.name} edged out ${runnerUp.name} in a fierce contest.` : '';
  return `Session #${data.sessionNumber} — ${winner.name} claimed dominion over room ${data.roomId} with ${winner.score} points and ${winner.kills} kills.${rivalry} ${data.results.length} warriors entered; only legends remain.`;
}

module.exports = { generateTournamentChronicle };
