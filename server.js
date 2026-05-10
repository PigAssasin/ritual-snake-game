'use strict';

const WebSocket = require('ws');
const http      = require('http');
const fs        = require('fs');
const path      = require('path');
const GameRoom  = require('./game/GameRoom');
const PublicRoomManager = require('./game/PublicRoomManager');
// Ritual AI features — optional, only active when viem + ethers are installed
let generateDeathChronicle      = async () => null;
let generateTournamentChronicle = async () => null;
try {
  generateDeathChronicle      = require('./ritual/deathChronicle').generateDeathChronicle;
  generateTournamentChronicle = require('./ritual/tournamentChronicle').generateTournamentChronicle;
} catch (_) {
  console.log('  [ritual] viem/ethers not installed — AI features disabled');
}

// ── HTTP ──────────────────────────────────────────────────────────────────────
const httpServer = http.createServer((req, res) => {
  const fp = path.join(__dirname, 'public', req.url === '/' ? 'index.html' : req.url);
  fs.readFile(fp, (err, data) => {
    if (err) { res.writeHead(404); res.end(); return; }
    const ext = path.extname(fp);
    const mime = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css' };
    res.writeHead(200, { 'Content-Type': mime[ext] || 'application/octet-stream' });
    res.end(data);
  });
});

// ── Room managers ─────────────────────────────────────────────────────────────
const privateRooms = new Map();

function onElimination(roomId, playerId, stats) {
  console.log(`[ELIMINATION] room=${roomId} player=${stats.name} score=${stats.score}`);
  const room = publicRooms.getRoomById(roomId);
  const playerWs = room?.wsMap.get(playerId) || null;
  generateDeathChronicle(stats, playerWs).catch(err =>
    console.error('[deathChronicle]', err.message)
  );
}

function onSessionEnd(roomId, data) {
  console.log(`[SESSION_END] room=${roomId} winner=${data.winner?.name || 'none'}`);
  if (data.mode !== 'private') return;
  const room = privateRooms.get(roomId) || null;
  generateTournamentChronicle(
    { roomId, sessionNumber: 1, results: data.results, winner: data.winner },
    room
  ).catch(err => console.error('[tournamentChronicle]', err.message));
}

const publicRooms = new PublicRoomManager({ onElimination, onSessionEnd });

// ── WebSocket server ──────────────────────────────────────────────────────────
const wss = new WebSocket.Server({ server: httpServer });

wss.on('connection', ws => {
  const state = { roomId: null, playerId: null, isJudge: false };

  function getRoom() {
    if (!state.roomId) return null;
    return privateRooms.get(state.roomId) || publicRooms.getRoomById(state.roomId);
  }

  ws.on('message', raw => {
    try {
      const d = JSON.parse(raw);

      // ── JOIN PUBLIC ROOM ──
      if (d.t === 'join_public') {
        const name          = (d.n || 'Snake').slice(0, 16);
        const skin          = d.skin || 'default';
        const walletAddress = d.walletAddress || null;
        const room = publicRooms.findBestRoom();
        if (!room) {
          publicRooms.addToQueue(ws, name, skin, walletAddress, (assignedRoom, pid) => {
            state.roomId   = assignedRoom.id;
            state.playerId = pid;
          });
          return;
        }
        const pid = room.addPlayer(ws, name, 0, skin, walletAddress);
        if (!pid) { ws.send(JSON.stringify({ t: 'error', msg: 'Room full' })); return; }
        state.roomId   = room.id;
        state.playerId = pid;
        return;
      }

      // ── LEAVE QUEUE ──
      if (d.t === 'leave_queue') {
        publicRooms.removeFromQueue(ws);
        ws.send(JSON.stringify({ t: 'queue_left' }));
        return;
      }

      // ── CREATE PRIVATE ROOM ──
      if (d.t === 'create_private') {
        const roomId = 'prv_' + Math.random().toString(36).slice(2, 7).toUpperCase();
        const pass   = (d.pass || '').slice(0, 20);
        const skin   = d.skin || 'default';
        const room   = new GameRoom(roomId, 'private', {
          password:   pass,
          botCount:   0,
          respawn:    true,
          maxPlayers: 30,
          onElimination,
          onSessionEnd,
        });
        privateRooms.set(roomId, room);
        const pid = room.addPlayer(ws, (d.n || 'Snake').slice(0, 16), 0, skin, d.walletAddress || null);
        state.roomId   = roomId;
        state.playerId = pid;
        return;
      }

      // ── JOIN PRIVATE ROOM ──
      if (d.t === 'join_private') {
        const room = privateRooms.get(d.roomId);
        if (!room) { ws.send(JSON.stringify({ t: 'error', msg: 'Room not found' })); return; }
        if (room.password && room.password !== d.pass) {
          ws.send(JSON.stringify({ t: 'error', msg: 'Wrong password' })); return;
        }
        if (room.isFull()) { ws.send(JSON.stringify({ t: 'error', msg: 'Room is full' })); return; }
        if (d.role === 'judge') {
          if (room.judgeId) { ws.send(JSON.stringify({ t: 'error', msg: 'Judge slot taken' })); return; }
          room.setJudge(ws, (d.n || 'Judge').slice(0, 16));
          state.roomId  = d.roomId;
          state.isJudge = true;
          return;
        }
        const pid = room.addPlayer(ws, (d.n || 'Snake').slice(0, 16), 0, d.skin || 'default', d.walletAddress || null);
        if (!pid) { ws.send(JSON.stringify({ t: 'error', msg: 'Room full' })); return; }
        state.roomId   = d.roomId;
        state.playerId = pid;
        return;
      }

      // ── GET ROOM LIST ──
      if (d.t === 'get_rooms') {
        ws.send(JSON.stringify({ t: 'rooms', public: publicRooms.getRoomList() }));
        return;
      }

      // ── HOST START ──
      if (d.t === 'host_start' && state.roomId) {
        const room = privateRooms.get(state.roomId);
        if (room) room.hostStartGame(state.playerId, d.durationMin);
        return;
      }

      // ── CHRONICLE COMMIT ──
      if (d.t === 'chronicle_commit' && state.roomId) {
        const room = getRoom();
        generateTournamentChronicle(
          { roomId: state.roomId, events: d.events || [], results: d.results || [] },
          room
        ).then(result => {
          ws.send(JSON.stringify({ t: 'chronicle_committed', txHash: result?.txHash || null }));
        }).catch(() => {
          ws.send(JSON.stringify({ t: 'chronicle_committed', txHash: null }));
        });
        return;
      }

      // ── IN-GAME MESSAGES ──
      if (state.roomId && state.playerId) {
        const room = getRoom();
        if (room) room.handleMessage(state.playerId, d);
      }

    } catch (e) { console.error('WS parse error:', e.message); }
  });

  ws.on('close', () => {
    publicRooms.removeFromQueue(ws);
    if (!state.roomId) return;
    const room = getRoom();
    if (!room) return;
    if (state.isJudge) { room.judgeWs = null; room.judgeId = null; return; }
    if (state.playerId) room.removePlayer(state.playerId);
    if (privateRooms.has(state.roomId) && room.humanCount() === 0) {
      room.stopSession();
      privateRooms.delete(state.roomId);
    }
  });
});

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => console.log(`\n  → http://localhost:${PORT}\n`));
