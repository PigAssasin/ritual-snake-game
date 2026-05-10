'use strict';

const { ethers } = require('ethers');
require('dotenv').config();

const CHRONICLE_NFT_ABI = [
  'function mint(address to, string name, uint256 score, uint256 kills, uint256 length, string killedBy, string epitaph, string portraitUri) external returns (uint256)',
];

async function generateDeathChronicle(stats, playerWs = null) {
  const privateKey       = process.env.PRIVATE_KEY;
  const chronicleNftAddr = process.env.CHRONICLE_NFT_ADDRESS;

  if (!privateKey) {
    console.warn('[deathChronicle] No PRIVATE_KEY — skipping');
    return null;
  }

  try {
    const epitaph = await _callLLM(stats);
    console.log(`[deathChronicle] epitaph: "${epitaph.slice(0, 80)}…"`);

    // Send card immediately — don't wait for mint
    if (playerWs?.readyState === 1) {
      playerWs.send(JSON.stringify({
        t: 'chronicle_ready', epitaph, portraitUri: null, tokenId: null, stats,
      }));
    }

    // Mint in background if wallet connected
    if (chronicleNftAddr && stats.walletAddress) {
      _mintInBackground(stats, epitaph, chronicleNftAddr, playerWs);
    }

    return { epitaph, portraitUri: null, tokenId: null };

  } catch (err) {
    console.error('[deathChronicle] Error:', err.message);
    const fallback = _fallbackEpitaph(stats);
    if (playerWs?.readyState === 1) {
      playerWs.send(JSON.stringify({
        t: 'chronicle_ready', epitaph: fallback, portraitUri: null, tokenId: null, stats,
      }));
    }
    return null;
  }
}

async function _mintInBackground(stats, epitaph, contractAddr, playerWs) {
  try {
    const tokenId = await _mintNFTParallel(stats, epitaph, '', contractAddr);
    console.log(`[deathChronicle] minted tokenId=${tokenId}`);
    if (playerWs?.readyState === 1) {
      playerWs.send(JSON.stringify({ t: 'chronicle_minted', tokenId, stats }));
    }
  } catch (err) {
    console.error('[deathChronicle] mint failed:', err.message);
  }
}

// ── LLM via Ritual HTTP precompile (0x0801) with direct-DeepSeek fallback ────

async function _callLLM(stats) {
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

  // Try Ritual HTTP precompile first
  try {
    const { callDeepSeekLLM } = require('./httpPrecompile');
    const result = await callDeepSeekLLM(messages, 150);
    console.log('[deathChronicle] Ritual HTTP precompile success');
    return result;
  } catch (err) {
    console.warn('[deathChronicle] HTTP precompile failed, using direct fetch:', err.message);
  }

  // Fallback: direct DeepSeek fetch
  return _callLLMDirect(messages);
}

async function _callLLMDirect(messages) {
  const apiKey   = process.env.OPENAI_API_KEY;
  const apiBase  = process.env.LLM_API_BASE  || 'https://api.openai.com/v1';
  const apiModel = process.env.LLM_MODEL     || 'gpt-4o-mini';

  if (!apiKey) throw new Error('No OPENAI_API_KEY in .env');

  const res = await fetch(`${apiBase}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({ model: apiModel, messages, max_tokens: 150, temperature: 0.9 }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`LLM API ${res.status}: ${text.slice(0, 200)}`);
  }
  const data    = await res.json();
  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error('Empty LLM response');
  return content;
}

// ── Parallel NFT minting (explicit nonce, no serial wait) ────────────────────
// Each _mintInBackground call gets its own nonce immediately and submits without
// waiting for the previous mint to confirm. Result: 10 mints in ~20s not ~200s.

let _pendingNonce  = null;
let _nonceLoading  = false;

async function _getNextNonce(provider, address) {
  // Lazy init: fetch once from chain, then increment locally
  while (_nonceLoading) await new Promise(r => setTimeout(r, 30));
  if (_pendingNonce === null) {
    _nonceLoading  = true;
    _pendingNonce  = await provider.getTransactionCount(address, 'pending');
    _nonceLoading  = false;
  }
  const nonce = _pendingNonce;
  _pendingNonce++;
  return nonce;
}

async function _mintNFTParallel(stats, epitaph, portraitUri, contractAddr) {
  const provider = new ethers.JsonRpcProvider(
    process.env.RITUAL_RPC_URL || 'https://rpc.ritualfoundation.org'
  );
  const pk      = process.env.PRIVATE_KEY;
  const signer  = new ethers.Wallet(pk.startsWith('0x') ? pk : `0x${pk}`, provider);
  const contract = new ethers.Contract(contractAddr, CHRONICLE_NFT_ABI, signer);

  const nonce = await _getNextNonce(provider, signer.address);

  const tx = await contract.mint(
    stats.walletAddress, stats.name,
    BigInt(stats.score), BigInt(stats.kills), BigInt(stats.length),
    stats.killedBy, epitaph, portraitUri,
    { nonce },
  );
  const receipt = await tx.wait();

  const iface = new ethers.Interface([
    'event ChroniclesMinted(uint256 indexed tokenId, address indexed player, string playerName)',
  ]);
  for (const log of receipt.logs) {
    try {
      const p = iface.parseLog(log);
      if (p) return p.args.tokenId.toString();
    } catch (_) {}
  }
  return null;
}

// ── Fallback ──────────────────────────────────────────────────────────────────

function _fallbackEpitaph(stats) {
  return `${stats.name} fought valiantly, claiming ${stats.kills} souls before their ${stats.length}-segment form was undone by ${stats.killedBy}. They fade into the digital abyss, ${stats.score} points their only legacy.`;
}

module.exports = { generateDeathChronicle };
