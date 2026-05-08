'use strict';

const WebSocket = require('ws');
const http      = require('http');
const fs        = require('fs');
const path      = require('path');
const GameRoom  = require('./game/GameRoom');
const PublicRoomManager = require('./game/PublicRoomManager');

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
  // TODO Sprint 3: trigger Death Chronicle NFT mint
  console.log(`[ELIMINATION] room=${roomId} player=${stats.name} score=${stats.score}`);
}

function onSessionEnd(roomId, data) {
  // TODO Sprint 3: trigger Tournament Chronicle for private rooms
  console.log(`[SESSION_END] room=${roomId} winner=${data.winner?.name || 'none'}`);
}

const publicRooms = new PublicRoomManager({ onElimination, onSessionEnd });

// ── WebSocket server ──────────────────────────────────────────────────────────
const wss = new WebSocket.Server({ server: httpServer });

wss.on('connection', ws => {
  let assignedRoomId = null;
  let assignedPlayerId = null;
  let isJudge = false;

  ws.on('message', raw => {
    try {
      const d = JSON.parse(raw);

      // ── JOIN PUBLIC ROOM ──
      if (d.t === 'join_public') {
        const room = publicRooms.findOpenRoom();
        if (!room) {
          ws.send(JSON.stringify({ t: 'error', msg: 'All public rooms are full. Try again soon.' }));
          return;
        }
        const pid = room.addPlayer(ws, (d.n || 'Snake').slice(0, 16), d.ht || 0);
        if (!pid) { ws.send(JSON.stringify({ t: 'error', msg: 'Room full' })); return; }
        assignedRoomId   = room.id;
        assignedPlayerId = pid;
        return;
      }

      // ── CREATE PRIVATE ROOM ──
      if (d.t === 'create_private') {
        const roomId = 'prv_' + Math.random().toString(36).slice(2, 7).toUpperCase();
        const pass   = (d.pass || '').slice(0, 20);
        const room   = new GameRoom(roomId, 'private', {
          password:   pass,
          botCount:   0,
          respawn:    true,
          maxPlayers: 30,
          onElimination,
          onSessionEnd,
        });
        privateRooms.set(roomId, room);
        const pid = room.addPlayer(ws, (d.n || 'Snake').slice(0, 16), d.ht || 0);
        assignedRoomId   = roomId;
        assignedPlayerId = pid;
        ws.send(JSON.stringify({ t: 'room_created', roomId, pass }));
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
          assignedRoomId = d.roomId;
          isJudge = true;
          return;
        }

        const pid = room.addPlayer(ws, (d.n || 'Snake').slice(0, 16), d.ht || 0);
        if (!pid) { ws.send(JSON.stringify({ t: 'error', msg: 'Room full' })); return; }
        assignedRoomId   = d.roomId;
        assignedPlayerId = pid;
        if (!room.sessionActive) room.startSession();
        return;
      }

      // ── GET ROOM LIST (for lobby) ──
      if (d.t === 'get_rooms') {
        ws.send(JSON.stringify({ t: 'rooms', public: publicRooms.getRoomList() }));
        return;
      }

      // ── IN-GAME MESSAGES ──
      if (assignedRoomId && assignedPlayerId) {
        const room = privateRooms.get(assignedRoomId) || publicRooms.getRoomById(assignedRoomId);
        if (room) room.handleMessage(assignedPlayerId, d);
      }

    } catch (e) { console.error('WS parse error:', e.message); }
  });

  ws.on('close', () => {
    if (!assignedRoomId) return;
    const room = privateRooms.get(assignedRoomId) || publicRooms.getRoomById(assignedRoomId);
    if (!room) return;
    if (isJudge) { room.judgeWs = null; room.judgeId = null; return; }
    if (assignedPlayerId) room.removePlayer(assignedPlayerId);
    if (privateRooms.has(assignedRoomId) && room.humanCount() === 0) {
      room.stopSession();
      privateRooms.delete(assignedRoomId);
    }
  });
});

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => console.log(`\n  → http://localhost:${PORT}\n`));
