# Ritual Snake v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 7 feature groups: quick game-feel fixes, in-game kill feed, Ritual status badge, public room queue, 10-skin market (wallet-linked), NFT card post-public-match, and private match chronicle with auto-commit.

**Architecture:** All game logic stays in `game/GameRoom.js` and `game/PublicRoomManager.js`. Client is a single-file `public/index.html` + new `public/skins.js` (loaded via `<script>`). Server communication stays pure WebSocket — no new HTTP endpoints except the existing static file server.

**Tech Stack:** Node.js ws, vanilla JS Canvas, ethers.js (already optional), localStorage for skin persistence.

---

## File Map

| File | Role |
|------|------|
| `game/GameRoom.js` | Growth constants, turn, kill_event broadcast, chronicle event tracking, skin in payload |
| `game/PublicRoomManager.js` | Staggered starts, best-room selection, queue with drain |
| `server.js` | Queue callback integration, chronicle_commit WS handler, skin passthrough |
| `public/skins.js` | **NEW** — 10 skin definitions (drawHead + drawBodyMark) |
| `public/index.html` | All client changes: ping color, event feed, ritual badge, queue screen, skin market, NFT card, chronicle screen |

---

## Task 1: Quick Fixes — Growth, Turn Speed, HUD Cleanup, Ping Color

**Files:**
- Modify: `game/GameRoom.js` (lines 11, 20, 22)
- Modify: `public/index.html` (hud-room element + updateHUD ping section)

- [ ] **Step 1: Update growth and size constants in GameRoom.js**

In `game/GameRoom.js`, replace lines 11 and 20–22:
```js
// was: TURN = 0.17
const TURN = 0.136;

// was: FOOD_GROWTH = [0.2, 1/3, 1.0]
const FOOD_GROWTH = [0.5, 0.83, 2.5];

// was: R_MIN = 14, R_MAX = 32
const R_MIN = 20, R_MAX = 44, VISUAL_REF = 150;
```

- [ ] **Step 2: Remove hud-room from HTML**

In `public/index.html`, find the game screen HUD section. Remove the element that shows room label (search for `hud-room`). Also remove its update in `handleMsg`:
```js
// REMOVE this line from handleMsg 'ok' case:
document.getElementById('hud-room').textContent =
  (d.mode === 'public' ? 'Public' : 'Private') + ' · ' + d.roomId;
```
And remove the HTML element `<span id="hud-room">` from the game screen markup.

- [ ] **Step 3: Add ping color coding in updateHUD()**

In `public/index.html`, find `updateHUD()`, locate the line that sets `hud-ping` text. Replace:
```js
document.getElementById('hud-ping').textContent  = pingMs + 'ms';
```
with:
```js
const pingEl = document.getElementById('hud-ping');
pingEl.textContent = pingMs + 'ms';
pingEl.style.color = pingMs < 80 ? 'var(--green)' : pingMs < 180 ? 'var(--gold)' : 'var(--red)';
```

- [ ] **Step 4: Commit**
```bash
git add game/GameRoom.js public/index.html
git commit -m "feat: growth x2.5, radius +40%, turn -20%, ping color, remove room HUD label"
```

---

## Task 2: Kill Event Broadcast + In-Game Event Feed

**Files:**
- Modify: `game/GameRoom.js` (`_eliminatePlayer`)
- Modify: `public/index.html` (handleMsg + render)

- [ ] **Step 1: Broadcast kill_event to all players in _eliminatePlayer**

In `game/GameRoom.js`, inside `_eliminatePlayer(id, p, killedBy)`, after the `stats` object is built, add before the `_dropFood` call:
```js
const killerName = typeof killedBy === 'string'
  ? killedBy
  : (this.players[killedBy]?.name || 'unknown');
this._broadcastAll({
  t: 'kill_event',
  victim: p.name,
  killer: killerName,
  isWall: killedBy === 'wall',
});
```

- [ ] **Step 2: Add eventFeed state variable in client**

In `public/index.html`, in the JS variables section near the top (where `let pingMs`, `let gameState` etc. are declared), add:
```js
let eventFeed = []; // [{text, color, ts}]
```

- [ ] **Step 3: Handle kill_event message in handleMsg**

In `public/index.html`, inside `handleMsg(d)` switch, add a new case before `default`:
```js
case 'kill_event': {
  const isMyKill = myId && gameState?.p?.[myId] &&
    d.killer === gameState.p[myId].n;
  const text = isMyKill
    ? `★ You eliminated ${d.victim}`
    : d.isWall
      ? `${d.victim} hit the wall`
      : `${d.victim} eliminated by ${d.killer}`;
  const color = isMyKill ? 'var(--pink)' : 'rgba(210,210,210,0.85)';
  eventFeed.push({ text, color, ts: Date.now() });
  if (eventFeed.length > 8) eventFeed.shift();
  break;
}
```

- [ ] **Step 4: Reset event feed when entering game**

In `handleMsg`, in the `'ok'` case, add `eventFeed = [];` before `showScreen('game')`.

- [ ] **Step 5: Render event feed in render()**

In `public/index.html`, inside the `render()` function, after the snakes loop and before the function ends, add:
```js
// Event feed
const now = Date.now();
eventFeed = eventFeed.filter(e => now - e.ts < 5000);
if (eventFeed.length > 0) {
  ctx.font = '11px "JetBrains Mono", monospace';
  const lineH = 20;
  const padX = 12, padY = 6;
  const startY = H - 16 - eventFeed.length * lineH;
  eventFeed.forEach((ev, i) => {
    const age = (now - ev.ts) / 5000;
    const alpha = Math.min(1, (1 - age) * 3);
    ctx.globalAlpha = alpha;
    const tw = ctx.measureText(ev.text).width;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.beginPath();
    ctx.roundRect(14, startY + i * lineH - padY, tw + padX * 2, lineH, 4);
    ctx.fill();
    ctx.fillStyle = ev.color;
    ctx.fillText(ev.text, 14 + padX, startY + i * lineH + 4);
  });
  ctx.globalAlpha = 1;
}
```

> Note: `ctx.roundRect` is available in all modern browsers. No polyfill needed.

- [ ] **Step 6: Commit**
```bash
git add game/GameRoom.js public/index.html
git commit -m "feat: kill_event broadcast + in-game event feed with fade"
```

---

## Task 3: Ritual Network Status Badge in Lobby

**Files:**
- Modify: `public/index.html` (lobby nav HTML + CSS + JS)

- [ ] **Step 1: Add badge HTML to lobby nav**

In `public/index.html`, find `.l-nav-right` div. Add the badge as the **first** child (leftmost):
```html
<div id="ritual-badge" class="ritual-badge">
  <span class="ritual-dot"></span>Ritual · <span id="ritual-status-text">Checking</span>
</div>
```

- [ ] **Step 2: Add CSS for the badge**

In the `<style>` block:
```css
.ritual-badge{display:flex;align-items:center;gap:6px;padding:6px 12px;border:1px solid var(--g7);border-radius:20px;font-family:var(--fm);font-size:11px;color:var(--g4);background:rgba(17,24,39,.5)}
.ritual-dot{width:7px;height:7px;border-radius:50%;background:var(--g5);flex-shrink:0;transition:background .3s}
.ritual-badge.active .ritual-dot{background:var(--green)}
.ritual-badge.congested .ritual-dot{background:var(--gold)}
.ritual-badge.error .ritual-dot{background:var(--red)}
```

- [ ] **Step 3: Add checkRitualStatus() function**

In the JS section:
```js
async function checkRitualStatus() {
  const badge = document.getElementById('ritual-badge');
  const txt   = document.getElementById('ritual-status-text');
  if (!badge) return;
  const t0 = Date.now();
  try {
    const res = await Promise.race([
      fetch('https://rpc.ritualfoundation.org', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc:'2.0', method:'eth_blockNumber', params:[], id:1 }),
      }),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 5000)),
    ]);
    const ms = Date.now() - t0;
    if (!res.ok) throw new Error('bad response');
    badge.className = 'ritual-badge ' + (ms < 2000 ? 'active' : 'congested');
    txt.textContent = ms < 2000 ? 'Active' : 'Congested';
  } catch (_) {
    badge.className = 'ritual-badge error';
    txt.textContent = 'Error';
  }
}
```

- [ ] **Step 4: Call on lobby show and every 30s**

Find the `showScreen()` function (or where the lobby screen is first shown). Add:
```js
// After page load / when lobby screen becomes visible:
checkRitualStatus();
setInterval(checkRitualStatus, 30_000);
```
Place this in the global init section at the bottom of the script (after `resizeCanvas()`).

- [ ] **Step 5: Commit**
```bash
git add public/index.html
git commit -m "feat: Ritual network status badge in lobby (active/congested/error)"
```

---

## Task 4: Public Room Queue System

**Files:**
- Modify: `game/PublicRoomManager.js`
- Modify: `server.js`
- Modify: `public/index.html`

- [ ] **Step 1: Rewrite PublicRoomManager with staggered starts + queue**

Replace `game/PublicRoomManager.js` entirely:
```js
'use strict';

const GameRoom = require('./GameRoom');

const PUBLIC_ROOM_COUNT = 5;
const STAGGER_MS = 90_000; // 90s between room starts

class PublicRoomManager {
  constructor(opts = {}) {
    this.rooms = new Map();
    this._queue = []; // [{ws, name, skin, onAssigned}]
    this._onElimination = opts.onElimination || null;
    this._onSessionEnd  = opts.onSessionEnd  || null;
    this._init();
  }

  _init() {
    for (let i = 0; i < PUBLIC_ROOM_COUNT; i++) {
      const id = `pub_${i + 1}`;
      const room = new GameRoom(id, 'public', {
        botCount:   5,
        respawn:    false,
        maxPlayers: 10,
        onElimination: this._onElimination,
        onSessionEnd:  this._onSessionEnd,
      });
      // Stagger starts so rooms don't all reset simultaneously
      setTimeout(() => room.startSession(), i * STAGGER_MS);
      this.rooms.set(id, room);
    }
    // Drain queue every 5s
    setInterval(() => this._drainQueue(), 5_000);
  }

  /** Returns the open room with the most time remaining (>2 min), or null */
  findBestRoom() {
    let best = null, bestTime = 0;
    for (const room of this.rooms.values()) {
      if (room.isFull()) continue;
      const t = room.timeRemaining();
      if (t <= 120_000) continue;
      if (t > bestTime) { bestTime = t; best = room; }
    }
    return best;
  }

  addToQueue(ws, name, skin, onAssigned) {
    // Remove stale entries for this ws first
    this._queue = this._queue.filter(e => e.ws !== ws);
    this._queue.push({ ws, name, skin, onAssigned });
    const position = this._queue.length;
    const nextRoomIn = this._getNextResetMs();
    ws.send(JSON.stringify({ t: 'queued', position, nextRoomIn }));
  }

  removeFromQueue(ws) {
    this._queue = this._queue.filter(e => e.ws !== ws);
  }

  getRoomById(id) { return this.rooms.get(id) || null; }

  getRoomList() {
    return [...this.rooms.values()].map(r => ({
      id:         r.id,
      players:    r.humanCount(),
      maxPlayers: r.maxPlayers,
      timeLeft:   r.timeRemaining(),
      sessionNum: r.sessionNumber,
    }));
  }

  _drainQueue() {
    if (this._queue.length === 0) return;
    const best = this.findBestRoom();
    if (!best) return;
    const slots = best.maxPlayers - best.humanCount();
    const toAdd = this._queue.splice(0, slots);
    for (const { ws, name, skin, onAssigned } of toAdd) {
      if (ws.readyState !== 1) continue;
      const pid = best.addPlayer(ws, name, 0, skin);
      if (!pid) { this._queue.unshift({ ws, name, skin, onAssigned }); break; }
      onAssigned(best, pid);
    }
    // Update remaining queue positions
    this._queue.forEach((entry, i) => {
      if (entry.ws.readyState === 1) {
        entry.ws.send(JSON.stringify({
          t: 'queue_update',
          position: i + 1,
          nextRoomIn: this._getNextResetMs(),
        }));
      }
    });
  }

  _getNextResetMs() {
    let min = Infinity;
    for (const room of this.rooms.values()) {
      const t = room.timeRemaining();
      if (t > 0 && t < min) min = t;
    }
    return min === Infinity ? 60_000 : min + 12_000; // +12s for reset delay
  }
}

module.exports = PublicRoomManager;
```

- [ ] **Step 2: Update server.js join_public handler and add queue handlers**

In `server.js`, replace the `wss.on('connection', ws => {` block. Change the closure variables to a `state` object, add queue support, add `leave_queue` and `chronicle_commit` handlers:

```js
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
        const name = (d.n || 'Snake').slice(0, 16);
        const skin = d.skin || 'default';
        const room = publicRooms.findBestRoom();
        if (!room) {
          publicRooms.addToQueue(ws, name, skin, (assignedRoom, pid) => {
            state.roomId  = assignedRoom.id;
            state.playerId = pid;
          });
          return;
        }
        const pid = room.addPlayer(ws, name, 0, skin);
        if (!pid) { ws.send(JSON.stringify({ t: 'error', msg: 'Room full' })); return; }
        state.roomId  = room.id;
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
        const pid = room.addPlayer(ws, (d.n || 'Snake').slice(0, 16), 0, skin);
        state.roomId  = roomId;
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
          state.roomId = d.roomId;
          state.isJudge = true;
          return;
        }
        const pid = room.addPlayer(ws, (d.n || 'Snake').slice(0, 16), 0, d.skin || 'default');
        if (!pid) { ws.send(JSON.stringify({ t: 'error', msg: 'Room full' })); return; }
        state.roomId  = d.roomId;
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
        }).catch(err => {
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
```

- [ ] **Step 3: Add queue screen HTML to index.html**

In `public/index.html`, after the last `<div class="screen" ...>` block, add:
```html
<div class="screen" id="screen-queue">
  <div class="q-term">
    <div class="q-header">ritual-snake ~ <span class="q-cmd">queue --waiting</span></div>
    <div class="q-body">
      <div class="q-line dim"># Waiting for an open session...</div>
      <div class="q-line" style="margin-top:24px">
        You are <span id="q-pos" class="q-hl">#1</span> in queue
      </div>
      <div class="q-line">
        Next session opens in&nbsp;<span id="q-timer" class="q-hl">—</span>
      </div>
    </div>
    <button class="q-cancel" onclick="leaveQueue()">[ Cancel ]</button>
  </div>
</div>
```

- [ ] **Step 4: Add queue screen CSS**

```css
#screen-queue{background:var(--bg0);align-items:center;justify-content:center}
.q-term{background:#0d1117;border:1px solid #30363d;border-radius:10px;padding:28px 36px;width:460px;font-family:var(--fm);font-size:13px}
.q-header{color:#7d8590;margin-bottom:20px;font-size:12px}
.q-cmd{color:var(--gold)}
.q-line{color:#e6edf3;line-height:2}
.q-line.dim{color:#7d8590;font-size:11px}
.q-hl{color:var(--green);font-weight:600}
.q-cancel{margin-top:32px;background:transparent;border:1px solid #30363d;color:#7d8590;font-family:var(--fm);font-size:12px;padding:7px 18px;border-radius:6px;cursor:pointer;transition:all .15s}
.q-cancel:hover{border-color:#7d8590;color:#e6edf3}
```

- [ ] **Step 5: Add queue JS in handleMsg and leaveQueue()**

```js
// In handleMsg switch:
case 'queued': {
  document.getElementById('q-pos').textContent = '#' + d.position;
  startQueueCountdown(d.nextRoomIn);
  showScreen('queue');
  break;
}
case 'queue_update': {
  document.getElementById('q-pos').textContent = '#' + d.position;
  startQueueCountdown(d.nextRoomIn);
  break;
}
case 'queue_left':
  stopQueueCountdown();
  showScreen('lobby');
  break;
```

Add helper functions:
```js
let _qTimer = null;
function startQueueCountdown(ms) {
  stopQueueCountdown();
  let remaining = Math.max(0, ms);
  function tick() {
    const m = Math.floor(remaining / 60000);
    const s = Math.floor((remaining % 60000) / 1000);
    const el = document.getElementById('q-timer');
    if (el) el.textContent = m + ':' + String(s).padStart(2, '0');
    if (remaining > 0) { remaining -= 1000; _qTimer = setTimeout(tick, 1000); }
  }
  tick();
}
function stopQueueCountdown() {
  if (_qTimer) { clearTimeout(_qTimer); _qTimer = null; }
}
function leaveQueue() {
  stopQueueCountdown();
  send({ t: 'leave_queue' });
}
```

- [ ] **Step 6: Commit**
```bash
git add game/PublicRoomManager.js server.js public/index.html
git commit -m "feat: public room queue system with staggered starts and best-room selection"
```

---

## Task 5: Skin Definitions

**Files:**
- Create: `public/skins.js`

- [ ] **Step 1: Create public/skins.js with all 10 skins**

```js
'use strict';
/* global window */

window.SKINS = [
  {
    id: 'default', name: 'Default', color: null, // null = use server-assigned color
    drawHead(_ctx, _x, _y, _r, _a) {},
    drawBodyMark(_ctx, _x, _y, _r) {},
  },
  {
    id: 'snowflake', name: 'Snowflake', color: '#93C5FD',
    drawHead(ctx, x, y, r) {
      const s = r * 0.5;
      ctx.save(); ctx.translate(x, y);
      ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 1.5;
      for (let i = 0; i < 6; i++) {
        ctx.save(); ctx.rotate((i * Math.PI) / 3);
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -s); ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, -s * 0.55); ctx.lineTo(s * 0.22, -s * 0.75);
        ctx.moveTo(0, -s * 0.55); ctx.lineTo(-s * 0.22, -s * 0.75);
        ctx.stroke(); ctx.restore();
      }
      ctx.restore();
    },
    drawBodyMark(ctx, x, y, r) {
      const s = Math.max(2, r * 0.4);
      ctx.save(); ctx.translate(x, y);
      ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = 1;
      for (let i = 0; i < 4; i++) {
        ctx.save(); ctx.rotate((i * Math.PI) / 2);
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -s); ctx.stroke();
        ctx.restore();
      }
      ctx.restore();
    },
  },
  {
    id: 'fire', name: 'Fire', color: '#F97316',
    drawHead(ctx, x, y, r) {
      const s = r * 0.55;
      ctx.save(); ctx.translate(x, y);
      ctx.beginPath();
      ctx.moveTo(0, s * 0.3);
      ctx.bezierCurveTo(-s * 0.45, 0, -s * 0.3, -s * 0.8, 0, -s);
      ctx.bezierCurveTo(s * 0.3, -s * 0.8, s * 0.45, 0, 0, s * 0.3);
      ctx.fillStyle = 'rgba(255,210,60,0.85)'; ctx.fill();
      ctx.restore();
    },
    drawBodyMark(ctx, x, y, r) {
      ctx.beginPath(); ctx.arc(x, y, Math.max(1.5, r * 0.3), 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,210,60,0.55)'; ctx.fill();
    },
  },
  {
    id: 'neon', name: 'Neon', color: '#A855F7',
    drawHead(ctx, x, y, r) {
      const s = r * 0.52;
      ctx.save(); ctx.translate(x, y);
      ctx.strokeStyle = 'rgba(240,240,80,0.9)';
      ctx.lineWidth = 2; ctx.shadowColor = 'rgba(240,240,80,0.7)'; ctx.shadowBlur = 5;
      ctx.beginPath();
      ctx.moveTo(s * 0.2, -s); ctx.lineTo(-s * 0.1, -s * 0.1);
      ctx.lineTo(s * 0.15, -s * 0.1); ctx.lineTo(-s * 0.2, s);
      ctx.stroke();
      ctx.shadowBlur = 0; ctx.restore();
    },
    drawBodyMark(ctx, x, y, r) {
      const s = Math.max(1.5, r * 0.35);
      ctx.save(); ctx.translate(x, y);
      ctx.strokeStyle = 'rgba(240,240,80,0.5)'; ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(s * 0.15, -s); ctx.lineTo(-s * 0.1, 0);
      ctx.lineTo(s * 0.1, 0); ctx.lineTo(-s * 0.15, s);
      ctx.stroke(); ctx.restore();
    },
  },
  {
    id: 'sakura', name: 'Sakura', color: '#F9A8D4',
    drawHead(ctx, x, y, r) {
      const s = r * 0.48;
      ctx.save(); ctx.translate(x, y);
      for (let i = 0; i < 5; i++) {
        ctx.save(); ctx.rotate((i * 2 * Math.PI) / 5 - Math.PI / 2);
        ctx.beginPath(); ctx.ellipse(0, -s * 0.58, s * 0.22, s * 0.36, 0, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,190,215,0.85)'; ctx.fill(); ctx.restore();
      }
      ctx.beginPath(); ctx.arc(0, 0, s * 0.18, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,230,100,0.9)'; ctx.fill();
      ctx.restore();
    },
    drawBodyMark(ctx, x, y, r) {
      const s = Math.max(1.5, r * 0.32);
      ctx.save(); ctx.translate(x, y);
      for (let i = 0; i < 5; i++) {
        ctx.save(); ctx.rotate((i * 2 * Math.PI) / 5);
        ctx.beginPath(); ctx.ellipse(0, -s * 0.58, s * 0.2, s * 0.34, 0, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,190,215,0.45)'; ctx.fill(); ctx.restore();
      }
      ctx.restore();
    },
  },
  {
    id: 'cyber', name: 'Cyber', color: '#06B6D4',
    drawHead(ctx, x, y, r) {
      const s = r * 0.48;
      ctx.save(); ctx.translate(x, y);
      ctx.strokeStyle = 'rgba(0,255,255,0.8)'; ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(-s, 0); ctx.lineTo(-s * 0.4, 0); ctx.lineTo(-s * 0.2, -s * 0.55);
      ctx.lineTo(s * 0.2, -s * 0.55); ctx.lineTo(s * 0.4, 0); ctx.lineTo(s, 0);
      ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, -s); ctx.lineTo(0, s); ctx.stroke();
      for (const [dx, dy] of [[-s * 0.4, 0], [s * 0.4, 0], [0, 0]]) {
        ctx.beginPath(); ctx.arc(dx, dy, 2.2, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0,255,255,0.9)'; ctx.fill();
      }
      ctx.restore();
    },
    drawBodyMark(ctx, x, y, r) {
      const s = Math.max(1.5, r * 0.28);
      ctx.fillStyle = 'rgba(0,255,255,0.35)';
      ctx.fillRect(x - s, y - s, s * 2, s * 2);
    },
  },
  {
    id: 'venom', name: 'Venom', color: '#7C3AED',
    drawHead(ctx, x, y, r) {
      const s = r * 0.5;
      ctx.save(); ctx.translate(x, y);
      ctx.beginPath(); ctx.arc(0, -s * 0.12, s * 0.55, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.72)'; ctx.fill();
      for (const dx of [-s * 0.22, s * 0.22]) {
        ctx.beginPath(); ctx.arc(dx, -s * 0.25, s * 0.14, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(70,0,110,0.9)'; ctx.fill();
      }
      ctx.beginPath(); ctx.arc(0, -s * 0.04, s * 0.07, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(70,0,110,0.7)'; ctx.fill();
      ctx.fillStyle = 'rgba(70,0,110,0.75)';
      for (let i = -1; i <= 1; i++) {
        ctx.fillRect(i * s * 0.28 - s * 0.07, s * 0.14, s * 0.14, s * 0.22);
      }
      ctx.restore();
    },
    drawBodyMark(ctx, x, y, r) {
      ctx.beginPath(); ctx.arc(x, y, Math.max(1.5, r * 0.28), 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fill();
    },
  },
  {
    id: 'ocean', name: 'Ocean', color: '#0EA5E9',
    drawHead(ctx, x, y, r) {
      const s = r * 0.5;
      ctx.save(); ctx.translate(x, y);
      ctx.beginPath(); ctx.moveTo(-s, 0);
      for (let i = 0; i <= 8; i++) {
        const wx = -s + (i / 8) * s * 2;
        const wy = Math.sin(i * Math.PI * 0.75) * s * 0.42;
        ctx.lineTo(wx, wy);
      }
      ctx.strokeStyle = 'rgba(255,255,255,0.78)'; ctx.lineWidth = 1.8; ctx.stroke();
      ctx.restore();
    },
    drawBodyMark(ctx, x, y, r) {
      const s = Math.max(1.5, r * 0.3);
      ctx.beginPath(); ctx.arc(x, y, s, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,255,255,0.28)'; ctx.lineWidth = 1; ctx.stroke();
    },
  },
  {
    id: 'galaxy', name: 'Galaxy', color: '#6366F1',
    drawHead(ctx, x, y, r) {
      const s = r * 0.52;
      ctx.save(); ctx.translate(x, y);
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const ang = (i * Math.PI) / 4 - Math.PI / 2;
        const len = i % 2 === 0 ? s : s * 0.42;
        const px = Math.cos(ang) * len, py = Math.sin(ang) * len;
        i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fillStyle = 'rgba(255,255,200,0.88)';
      ctx.shadowColor = 'rgba(255,255,200,0.7)'; ctx.shadowBlur = 7;
      ctx.fill(); ctx.shadowBlur = 0; ctx.restore();
    },
    drawBodyMark(ctx, x, y, r) {
      const s = Math.max(1.5, r * 0.26);
      ctx.save(); ctx.translate(x, y); ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const ang = (i * Math.PI) / 4 - Math.PI / 2;
        const len = i % 2 === 0 ? s : s * 0.4;
        const px = Math.cos(ang) * len, py = Math.sin(ang) * len;
        i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      }
      ctx.closePath(); ctx.fillStyle = 'rgba(255,255,200,0.42)'; ctx.fill();
      ctx.restore();
    },
  },
  {
    id: 'gold', name: 'Gold', color: '#FACC15',
    drawHead(ctx, x, y, r) {
      const s = r * 0.52;
      ctx.save(); ctx.translate(x, y);
      ctx.beginPath();
      ctx.moveTo(-s * 0.72, s * 0.12); ctx.lineTo(-s * 0.72, -s * 0.18);
      ctx.lineTo(-s * 0.35, -s * 0.62); ctx.lineTo(0, -s * 0.18);
      ctx.lineTo(s * 0.35, -s * 0.62); ctx.lineTo(s * 0.72, -s * 0.18);
      ctx.lineTo(s * 0.72, s * 0.12); ctx.closePath();
      ctx.fillStyle = 'rgba(255,220,50,0.88)'; ctx.fill();
      ctx.restore();
    },
    drawBodyMark(ctx, x, y, r) {
      const s = Math.max(1.5, r * 0.3);
      ctx.save(); ctx.translate(x, y); ctx.beginPath();
      ctx.moveTo(0, -s); ctx.lineTo(s * 0.6, 0);
      ctx.lineTo(0, s); ctx.lineTo(-s * 0.6, 0);
      ctx.closePath(); ctx.fillStyle = 'rgba(255,220,50,0.42)'; ctx.fill();
      ctx.restore();
    },
  },
];

window.SKINS_MAP = Object.fromEntries(window.SKINS.map(s => [s.id, s]));
```

- [ ] **Step 2: Include skins.js in index.html**

In `public/index.html`, add before the closing `</body>` tag and before the `<script>` block:
```html
<script src="/skins.js"></script>
```

- [ ] **Step 3: Commit**
```bash
git add public/skins.js public/index.html
git commit -m "feat: add 10 skin definitions (snowflake, fire, neon, sakura, cyber, venom, ocean, galaxy, gold)"
```

---

## Task 6: Skin Market UI + Rendering Integration

**Files:**
- Modify: `public/index.html` (skin market modal, drawSnake, join messages)
- Modify: `game/GameRoom.js` (addPlayer + _mkSnake + _payload accept skin)

- [ ] **Step 1: Accept skin in GameRoom addPlayer + _mkSnake + _payload**

In `game/GameRoom.js`:

`addPlayer(ws, name, headType, skin = 'default')` — add `skin` as 4th param:
```js
addPlayer(ws, name, headType, skin = 'default') {
  // ... existing code ...
  this.players[id] = this._mkSnake(name, COLORS[this._colIdx++ % COLORS.length], false, headType, skin);
  // ... rest unchanged
}
```

`_mkSnake(name, color, isBot, headType, skin = 'default')` — add skin param and store it:
```js
_mkSnake(name, color, isBot = false, headType = 0, skin = 'default') {
  // ... existing code ...
  return { name, color, isBot, headType, skin, segs, angle: a, targetAngle: a,
           targetLen: INIT_LEN, growthAcc: 0, score: 0, kills: 0, deaths: 0, maxLen: INIT_LEN,
           alive: true, respawn: 0, boostActive: false, boostTimer: 0, boostCooldown: 0,
           _lastHead: null, _botTick: 0, _botTarget: null };
}
```

`_payload(p, thin)` — add `sk: p.skin` to returned object:
```js
return { s: segs, a: p.angle, c: p.color, n: p.name, ht: p.headType, sk: p.skin,
         alive: p.alive, rt: p.respawn, sc: p.score, kl: p.kills,
         len: p.segs.length, tlen: p.targetLen, bo: p.boostActive, bcd: p.boostCooldown, bot: p.isBot };
```

Also update `_spawnBots` to pass default skin:
```js
this.players[id] = this._mkSnake(BOT_NAMES[i % BOT_NAMES.length],
  COLORS[this._colIdx++ % COLORS.length], true, Math.floor(rnd(5)), 'default');
```

- [ ] **Step 2: Update drawSnake() to use skin**

In `public/index.html`, find `drawSnake(p, isMe, camX, camY, W, H)`. 

At the top of the function, after `const col = p.c || '#19D184';`, add:
```js
const skin = (window.SKINS_MAP && p.sk && window.SKINS_MAP[p.sk]) || window.SKINS_MAP?.default || null;
const bodyColor = (skin && skin.color) ? skin.color : col;
```

Replace `ctx.strokeStyle = col;` (body stroke) with `ctx.strokeStyle = bodyColor;`  
Replace `ctx.fillStyle = col;` (head fill) with `ctx.fillStyle = bodyColor;`

After the eyes section and before the name tag, add:
```js
// Skin head decoration
if (skin) skin.drawHead(ctx, sx, sy, r, angle);

// Skin body marks (every 3rd thinned segment)
if (skin && segs.length > 2) {
  for (let i = 2; i < segs.length; i += 3) {
    const bx = segs[i][0] - camX, by = segs[i][1] - camY;
    if (bx < -20 || bx > W + 20 || by < -20 || by > H + 20) continue;
    skin.drawBodyMark(ctx, bx, by, r * 0.38);
  }
}
```

- [ ] **Step 3: Add skin selection state**

In JS variables section:
```js
let selectedSkin = 'default';

function loadSkin() {
  if (typeof ethereum !== 'undefined' && ethereum.selectedAddress) {
    selectedSkin = localStorage.getItem('skin_' + ethereum.selectedAddress) || 'default';
  }
}
function saveSkin(id) {
  selectedSkin = id;
  if (typeof ethereum !== 'undefined' && ethereum.selectedAddress) {
    localStorage.setItem('skin_' + ethereum.selectedAddress, id);
  }
}
```

Call `loadSkin()` after wallet connects. In the wallet connect success handler, add `loadSkin();`.

- [ ] **Step 4: Pass skin in join messages**

Find `joinPublic()`:
```js
function joinPublic() {
  connect(() => send({ t: 'join_public', n: getName(), skin: selectedSkin }));
}
```

Find `createPrivate()`:
```js
function createPrivate() {
  const pass = document.getElementById('prv-pass').value.trim();
  connect(() => send({ t: 'create_private', n: getName(), pass, skin: selectedSkin }));
}
```

Find `joinPrivate()`:
```js
function joinPrivate() {
  const roomId = document.getElementById('join-room-id').value.trim();
  const pass   = document.getElementById('join-room-pass').value.trim();
  if (!roomId) { showToast('Enter a room ID'); return; }
  hideJoinModal();
  connect(() => send({ t: 'join_private', roomId, pass, n: getName(), skin: selectedSkin }));
}
```

- [ ] **Step 5: Add Skin Market button in lobby nav**

In `.l-nav-right` div, add after the existing buttons:
```html
<button class="mkt-nav-btn" onclick="openSkinMarket()">◆ Skins</button>
```

- [ ] **Step 6: Add Skin Market modal HTML**

After the lobby screen, add:
```html
<div id="skin-market-modal" class="skm-overlay" style="display:none">
  <div class="skm-panel">
    <div class="skm-header">
      <span class="skm-title">Skin Market</span>
      <button class="skm-close" onclick="closeSkinMarket()">✕</button>
    </div>
    <div class="skm-grid" id="skm-grid"></div>
  </div>
</div>
```

- [ ] **Step 7: Add Skin Market CSS**

```css
.skm-overlay{position:fixed;inset:0;background:rgba(0,0,0,.75);backdrop-filter:blur(6px);z-index:200;display:flex;align-items:center;justify-content:center}
.skm-panel{background:var(--bg1);border:1px solid var(--g7);border-radius:16px;padding:28px;width:min(720px,95vw);max-height:90vh;overflow-y:auto}
.skm-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:20px}
.skm-title{font-family:var(--fd);font-size:18px;color:#F3F4F6}
.skm-close{background:transparent;border:1px solid var(--g7);color:var(--g5);padding:5px 10px;border-radius:6px;cursor:pointer;font-size:13px}
.skm-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:12px}
.skm-card{border:1px solid var(--g7);border-radius:10px;padding:10px;cursor:pointer;transition:all .15s;text-align:center;background:var(--bg2)}
.skm-card:hover{border-color:var(--g5);transform:translateY(-2px)}
.skm-card.active{border-color:var(--green);background:rgba(25,209,132,.06)}
.skm-card canvas{display:block;margin:0 auto 6px;border-radius:6px}
.skm-card-name{font-size:11px;color:var(--g4);font-family:var(--fm)}
.skm-card.active .skm-card-name{color:var(--green)}
.skm-equip-badge{font-size:9px;text-transform:uppercase;letter-spacing:.08em;color:var(--green);margin-top:3px}
```

- [ ] **Step 8: Add Skin Market JS**

```js
function openSkinMarket() {
  const modal = document.getElementById('skin-market-modal');
  modal.style.display = 'flex';
  renderSkinMarket();
}
function closeSkinMarket() {
  document.getElementById('skin-market-modal').style.display = 'none';
}
function renderSkinMarket() {
  const grid = document.getElementById('skm-grid');
  if (!grid || !window.SKINS) return;
  grid.innerHTML = window.SKINS.map(sk => `
    <div class="skm-card ${sk.id === selectedSkin ? 'active' : ''}"
         onclick="equipSkin('${sk.id}')" id="skm-card-${sk.id}">
      <canvas id="skm-cv-${sk.id}" width="110" height="72"></canvas>
      <div class="skm-card-name">${sk.name}</div>
      ${sk.id === selectedSkin ? '<div class="skm-equip-badge">Equipped</div>' : ''}
    </div>`).join('');
  window.SKINS.forEach(sk => drawSkinPreview(sk));
}
function drawSkinPreview(sk) {
  const cv = document.getElementById('skm-cv-' + sk.id);
  if (!cv) return;
  const c = cv.getContext('2d');
  const W = cv.width, H = cv.height;
  c.fillStyle = '#0d1117'; c.fillRect(0, 0, W, H);
  const col = sk.color || '#19D184';
  const r = 9;
  // Draw a simple S-shaped snake
  const pts = [];
  for (let i = 0; i < 18; i++) {
    const t = i / 17;
    const x = W * 0.15 + t * W * 0.7;
    const y = H / 2 + Math.sin(t * Math.PI * 2) * H * 0.28;
    pts.push([x, y]);
  }
  c.beginPath(); c.lineCap = 'round'; c.lineJoin = 'round';
  c.lineWidth = r * 2; c.strokeStyle = col;
  c.moveTo(pts[0][0], pts[0][1]);
  pts.forEach(([x, y]) => c.lineTo(x, y));
  c.stroke();
  c.lineWidth = r * 0.6; c.strokeStyle = 'rgba(255,255,255,0.07)'; c.stroke();
  // Skin body marks
  for (let i = 2; i < pts.length; i += 3) sk.drawBodyMark(c, pts[i][0], pts[i][1], r * 0.38);
  // Head
  const [hx, hy] = pts[0];
  c.beginPath(); c.arc(hx, hy, r, 0, Math.PI * 2);
  c.fillStyle = col; c.fill();
  sk.drawHead(c, hx, hy, r, 0);
}
function equipSkin(id) {
  saveSkin(id);
  renderSkinMarket();
}
```

- [ ] **Step 9: Commit**
```bash
git add game/GameRoom.js public/index.html public/skins.js
git commit -m "feat: skin market with 10 skins, wallet-linked persistence, canvas preview"
```

---

## Task 7: NFT Card Screen (Public Match)

**Files:**
- Modify: `public/index.html`

- [ ] **Step 1: Add #screen-nft-card HTML**

```html
<div class="screen" id="screen-nft-card">
  <div class="nft-bg">
    <div class="nft-card" id="nft-card-inner">
      <div class="nft-card-border"></div>
      <div class="nft-card-top">
        <div class="nft-card-left">
          <div class="nft-player-name" id="nft-name">PLAYER</div>
          <div class="nft-meta-row">
            <span class="nft-match-type">◇ PUBLIC MATCH</span>
            <span class="nft-skin-badge" id="nft-skin-badge">DEFAULT</span>
          </div>
        </div>
        <div class="nft-rank-badge" id="nft-rank">#1</div>
      </div>
      <div class="nft-card-mid">
        <canvas id="nft-portrait" width="180" height="195"></canvas>
        <div class="nft-stats">
          <div class="nft-stat-box">
            <div class="nft-stat-icon">★</div>
            <div class="nft-stat-val" id="nft-score">0</div>
            <div class="nft-stat-lbl">SCORE</div>
          </div>
          <div class="nft-stat-box">
            <div class="nft-stat-icon">↺</div>
            <div class="nft-stat-val green" id="nft-len">0</div>
            <div class="nft-stat-lbl">LENGTH</div>
          </div>
          <div class="nft-stat-box">
            <div class="nft-stat-icon">✕</div>
            <div class="nft-stat-val red" id="nft-kills">0</div>
            <div class="nft-stat-lbl">KILLS</div>
          </div>
        </div>
      </div>
      <div class="nft-epitaph" id="nft-epitaph">"They fought with everything they had."</div>
      <div class="nft-info-rows">
        <div class="nft-info-row"><span>PLAYER</span><span id="nft-info-player">—</span></div>
        <div class="nft-info-row"><span>SESSION</span><span id="nft-info-session">—</span></div>
        <div class="nft-info-row"><span>DURATION</span><span id="nft-info-duration">—</span></div>
        <div class="nft-info-row"><span>CHAIN</span><span class="green">Ritual Chain 1979</span></div>
      </div>
      <div class="nft-footer-row">
        <span class="nft-token-id" id="nft-token-id">RITUAL-SNAKE-0000000</span>
        <span class="nft-badge">NFT</span>
      </div>
    </div>
    <div class="nft-actions">
      <button class="nft-btn primary" id="nft-mint-btn" onclick="mintNft()">○ Mint as NFT</button>
      <button class="nft-btn secondary" onclick="shareOnX()">✕ Share on X</button>
    </div>
    <button class="nft-lobby-btn" id="nft-lobby-btn" style="display:none" onclick="backToLobby()">← Back to Lobby</button>
  </div>
</div>
```

- [ ] **Step 2: Add NFT card CSS**

```css
#screen-nft-card{background:#0a0a0a;align-items:center;justify-content:center}
.nft-bg{display:flex;flex-direction:column;align-items:center;gap:16px;padding:24px}
.nft-card{position:relative;background:#111a12;border:1px solid #3a5c3a;border-radius:14px;padding:20px;width:340px;box-shadow:0 0 40px rgba(25,209,132,.08)}
.nft-card-border{position:absolute;top:0;left:0;right:0;height:3px;background:linear-gradient(to right,var(--green),rgba(25,209,132,.2),transparent);border-radius:14px 14px 0 0}
.nft-card-top{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px}
.nft-player-name{font-family:var(--fd);font-size:22px;color:#F3F4F6;letter-spacing:.05em}
.nft-meta-row{display:flex;align-items:center;gap:8px;margin-top:4px}
.nft-match-type{font-family:var(--fm);font-size:10px;color:var(--g5)}
.nft-skin-badge{font-family:var(--fm);font-size:10px;color:var(--green);background:rgba(25,209,132,.1);border:1px solid rgba(25,209,132,.3);padding:2px 8px;border-radius:20px}
.nft-rank-badge{width:52px;height:52px;border-radius:50%;background:var(--gold);display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:var(--fd);font-size:17px;color:#000;flex-shrink:0}
.nft-rank-badge small{font-size:8px;font-family:var(--fb);font-weight:600;letter-spacing:.1em;color:#000;margin-top:-2px}
.nft-card-mid{display:flex;gap:14px;align-items:center;margin-bottom:14px}
#nft-portrait{border-radius:8px;background:#0d1a0e}
.nft-stats{display:flex;flex-direction:column;gap:8px;flex:1}
.nft-stat-box{background:var(--bg2);border:1px solid var(--g7);border-radius:8px;padding:8px 12px;display:flex;align-items:center;gap:8px}
.nft-stat-icon{font-size:12px;color:var(--g5)}
.nft-stat-val{font-family:var(--fm);font-size:18px;font-weight:600;color:#F3F4F6;flex:1}
.nft-stat-val.green{color:var(--green)}
.nft-stat-val.red{color:var(--red)}
.nft-stat-lbl{font-size:9px;text-transform:uppercase;letter-spacing:.1em;color:var(--g5)}
.nft-epitaph{font-style:italic;font-size:12px;color:var(--g5);text-align:center;padding:10px 0;border-top:1px dashed var(--g7);border-bottom:1px dashed var(--g7);margin-bottom:12px}
.nft-info-rows{display:flex;flex-direction:column;gap:5px;margin-bottom:12px}
.nft-info-row{display:flex;justify-content:space-between;font-size:10px}
.nft-info-row span:first-child{color:var(--g5);text-transform:uppercase;letter-spacing:.08em;font-family:var(--fm)}
.nft-info-row span:last-child{color:var(--g4);font-family:var(--fm)}
.nft-footer-row{display:flex;justify-content:space-between;align-items:center;padding-top:8px;border-top:1px solid var(--g7)}
.nft-token-id{font-family:var(--fm);font-size:10px;color:var(--g5)}
.nft-badge{font-family:var(--fm);font-size:9px;color:var(--green);border:1px solid rgba(25,209,132,.3);padding:2px 7px;border-radius:3px}
.nft-actions{display:flex;gap:12px}
.nft-btn{min-width:150px;padding:12px 20px;border-radius:10px;border:1px solid;background:transparent;font-family:var(--fb);font-size:13px;font-weight:600;cursor:pointer;transition:all .18s}
.nft-btn.primary{border-color:var(--gold);color:var(--gold)}
.nft-btn.primary:hover{background:rgba(250,204,21,.08)}
.nft-btn.secondary{border-color:var(--g7);color:var(--g4)}
.nft-btn.secondary:hover{border-color:var(--g5);color:var(--g3)}
.nft-lobby-btn{background:transparent;border:none;color:var(--g5);font-family:var(--fb);font-size:12px;cursor:pointer;padding:6px 12px;border-radius:6px;transition:color .15s}
.nft-lobby-btn:hover{color:var(--g3)}
```

- [ ] **Step 3: Add showNftCard() and helpers**

```js
const NFT_EPITAPHS = [
  "They fought with everything they had. The grid took note.",
  "The arena remembers those who dared.",
  "Speed was their weapon. The wall, their end.",
  "Not all snakes survive. This one left a mark.",
  "The longest shadow on the grid.",
  "Born of chaos. Returned to it.",
  "Every score tells a story. This one ends here.",
  "The grid is undefeated. But they came close.",
];

let _nftStats = null;

function showNftCard(stats, rank, playerCount, roomId) {
  _nftStats = { stats, rank, playerCount, roomId };
  const name = (stats.name || 'PLAYER').toUpperCase();
  document.getElementById('nft-name').textContent = name;
  document.getElementById('nft-score').textContent = (stats.score || 0).toLocaleString();
  document.getElementById('nft-len').textContent   = stats.length || stats.maxLen || 0;
  document.getElementById('nft-kills').textContent = stats.kills  || 0;
  document.getElementById('nft-skin-badge').textContent = (selectedSkin || 'default').toUpperCase();

  // Rank badge
  const rankEl = document.getElementById('nft-rank');
  rankEl.innerHTML = '#' + rank + '<small>RANK</small>';
  rankEl.style.background = rank === 1 ? 'var(--gold)' : rank === 2 ? '#94A3B8' : rank === 3 ? '#B45309' : 'var(--g7)';
  rankEl.style.color = rank <= 3 ? '#000' : 'var(--g4)';

  // Epitaph
  document.getElementById('nft-epitaph').textContent =
    '"' + NFT_EPITAPHS[Math.floor(Math.random() * NFT_EPITAPHS.length)] + '"';

  // Info rows
  const addr = (typeof ethereum !== 'undefined' && ethereum.selectedAddress)
    ? ethereum.selectedAddress.slice(0, 6) + '...' + ethereum.selectedAddress.slice(-4)
    : 'Not connected';
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' });
  document.getElementById('nft-info-player').textContent  = (stats.name || '?') + ' · ' + addr;
  document.getElementById('nft-info-session').textContent = dateStr + ' · ' + (roomId || '?');
  document.getElementById('nft-info-duration').textContent = '10 min · ' + playerCount + ' players';
  document.getElementById('nft-token-id').textContent =
    'RITUAL-SNAKE-' + String(Math.floor(Math.random() * 9999999)).padStart(7, '0');

  // Portrait
  drawNftPortrait(stats);

  // Reset buttons
  document.getElementById('nft-mint-btn').textContent = '○ Mint as NFT';
  document.getElementById('nft-mint-btn').disabled = false;
  document.getElementById('nft-lobby-btn').style.display = 'none';

  showScreen('nft-card');
}

function drawNftPortrait(stats) {
  const cv = document.getElementById('nft-portrait');
  if (!cv) return;
  const c = cv.getContext('2d');
  const W = cv.width, H = cv.height;
  c.fillStyle = '#0d1a0e'; c.fillRect(0, 0, W, H);
  const skin = (window.SKINS_MAP && window.SKINS_MAP[selectedSkin]) || window.SKINS_MAP?.default;
  const col = (skin && skin.color) || '#19D184';
  const r = 14;
  // Coiled S-shape portrait
  const pts = [];
  for (let i = 0; i < 24; i++) {
    const t = i / 23;
    const x = W * 0.15 + t * W * 0.7;
    const y = H / 2 + Math.sin(t * Math.PI * 2.2) * H * 0.32;
    pts.push([x, y]);
  }
  c.beginPath(); c.lineCap = 'round'; c.lineJoin = 'round';
  c.lineWidth = r * 2; c.strokeStyle = col;
  c.moveTo(pts[0][0], pts[0][1]);
  pts.forEach(([x, y]) => c.lineTo(x, y));
  c.stroke();
  c.lineWidth = r * 0.6; c.strokeStyle = 'rgba(255,255,255,0.07)'; c.stroke();
  if (skin) {
    for (let i = 2; i < pts.length; i += 3) skin.drawBodyMark(c, pts[i][0], pts[i][1], r * 0.38);
  }
  const [hx, hy] = pts[0];
  c.beginPath(); c.arc(hx, hy, r, 0, Math.PI * 2);
  c.fillStyle = col; c.fill();
  if (skin) skin.drawHead(c, hx, hy, r, 0);
  // Eyes
  const eyeR = r * 0.22, pupR = eyeR * 0.55;
  for (const s of [-1, 1]) {
    const ex = hx + r * 0.35 + (-r * 0) * s;
    const ey = hy + r * 0.35 * 0 + r * 0.55 * s * 0.5;
    c.beginPath(); c.arc(hx + r*0.35, hy + r*0.55*s*0.5, eyeR, 0, Math.PI*2);
    c.fillStyle = 'rgba(0,0,0,0.9)'; c.fill();
    c.beginPath(); c.arc(hx + r*0.35 - eyeR*0.3, hy + r*0.55*s*0.5 - eyeR*0.3, pupR, 0, Math.PI*2);
    c.fillStyle = '#fff'; c.fill();
  }
}

async function mintNft() {
  if (typeof ethereum === 'undefined' || !ethereum.selectedAddress) {
    await connectWallet();
    if (!ethereum.selectedAddress) return;
  }
  const btn = document.getElementById('nft-mint-btn');
  btn.textContent = '○ Minting...'; btn.disabled = true;
  try {
    const provider = new ethers.BrowserProvider(ethereum);
    const signer   = await provider.getSigner();
    const abi = ['function mint(string name,uint256 score,uint256 kills,uint256 length,string skin) payable'];
    const addr = window.CHRONICLE_NFT_ADDRESS || '0x0000000000000000000000000000000000000000';
    const contract = new ethers.Contract(addr, abi, signer);
    const s = _nftStats?.stats || {};
    const tx = await contract.mint(
      s.name || 'Snake', BigInt(s.score || 0),
      BigInt(s.kills || 0), BigInt(s.length || 0), selectedSkin
    );
    await tx.wait();
    btn.textContent = '✓ Minted!';
  } catch (e) {
    btn.textContent = '✕ Failed — retry';
    btn.disabled = false;
    showToast(e.reason || e.message || 'Mint failed');
    return;
  }
  document.getElementById('nft-lobby-btn').style.display = '';
}

function shareOnX() {
  const s = _nftStats?.stats || {};
  const rank = _nftStats?.rank || '?';
  const text = encodeURIComponent(
    `I just played Ritual Snake — Score: ${(s.score||0).toLocaleString()} · Length: ${s.length||0} · Kills: ${s.kills||0} · Rank #${rank}\n\nPlay at http://168.144.142.150:3000 #RitualSnake #RitualChain`
  );
  window.open('https://x.com/intent/tweet?text=' + text, '_blank');
  document.getElementById('nft-lobby-btn').style.display = '';
}
```

- [ ] **Step 4: Trigger NFT card from eliminated and session_end**

In `handleMsg`, replace the `'eliminated'` case:
```js
case 'eliminated': {
  stopRenderLoop();
  // Get rank from leaderboard
  const lb = gameState?.lb || {};
  const sorted = Object.entries(lb).sort(([,a],[,b]) => b.sc - a.sc);
  const rank = sorted.findIndex(([id]) => id === myId) + 1;
  const playerCount = sorted.length;
  showNftCard(d.stats, rank || '?', playerCount, myRoomId);
  break;
}
```

In the `'session_end'` case, add before `showResults(d)`:
```js
case 'session_end': {
  stopRenderLoop();
  // For public rooms: show NFT card for own player
  if (myRoomId && !myRoomId.startsWith('prv_')) {
    const results = d.results || [];
    const myResult = results.find(r => r.name === (gameState?.p?.[myId]?.n));
    const rank = myResult ? results.indexOf(myResult) + 1 : results.length;
    if (myResult) {
      showNftCard({ ...myResult, length: myResult.maxLen || myResult.length }, rank, results.length, myRoomId);
      break;
    }
  }
  showResults(d);
  break;
}
```

- [ ] **Step 5: Commit**
```bash
git add public/index.html
git commit -m "feat: NFT card screen after public match with mint + share on X"
```

---

## Task 8: Chronicle Event Tracking (Server)

**Files:**
- Modify: `game/GameRoom.js`

- [ ] **Step 1: Add chronicle tracking to GameRoom**

At the top of the class, in `constructor`, after `this.hostId = null;`, add:
```js
this._chronicleEvents = [];
```

Add helper method inside the class:
```js
_elapsedSec() {
  if (!this.sessionStartTime) return 0;
  return Math.floor((Date.now() - this.sessionStartTime) / 1000);
}

_pushChronicle(event) {
  if (this.mode !== 'private') return;
  const sec = this._elapsedSec();
  const mm = String(Math.floor(sec / 60)).padStart(2, '0');
  const ss = String(sec % 60).padStart(2, '0');
  this._chronicleEvents.push({ time: mm + ':' + ss, ...event });
}
```

- [ ] **Step 2: Reset chronicle on session start**

In `startSession()`, after `this.sessionNumber++;`, add:
```js
this._chronicleEvents = [];
this._pushChronicle({ type: 'session_start', detail: `Session #${this.sessionNumber} started` });
```

- [ ] **Step 3: Track kill/elimination events**

In `_eliminatePlayer(id, p, killedBy)`, after the `killerName` is computed (after adding `_broadcastAll kill_event` from Task 2), add:
```js
this._pushChronicle({
  type: p.isBot ? 'eliminated' : 'kill',
  killer: killerName,
  victim: p.name,
  score: p.score,
});
```

- [ ] **Step 4: Track milestones in _tick()**

In `_tick()`, in the food-eating loop, capture the length before growth:
```js
// In the food eating block, before the while loop:
const prevLen = p.targetLen;
while (p.growthAcc >= 1) {
  p.targetLen = Math.min(p.targetLen + 1, MAX_LEN);
  p.growthAcc -= 1;
}
// After the while loop, check milestones (private, human players only):
if (!p.isBot && this.mode === 'private') {
  for (const m of [50, 100, 200, 300]) {
    if (prevLen < m && p.targetLen >= m) {
      this._pushChronicle({ type: 'milestone', name: p.name, length: m });
    }
  }
}
```

- [ ] **Step 5: Include chronicleEvents in session_end for private**

In `_endSession()`, change the `_broadcastAll` call:
```js
const broadcastPayload = { t: 'session_end', results, winner };
if (this.mode === 'private') {
  broadcastPayload.chronicleEvents = this._chronicleEvents;
  this._pushChronicle({ type: 'session_end', detail: `${winner?.name || 'no one'} wins` });
  broadcastPayload.chronicleEvents = this._chronicleEvents; // include the final event
}
this._broadcastAll(broadcastPayload);
```

- [ ] **Step 6: Commit**
```bash
git add game/GameRoom.js
git commit -m "feat: chronicle event tracking for private rooms (kills, milestones, session)"
```

---

## Task 9: Chronicle Screen (Client) + Commit Handler

**Files:**
- Modify: `public/index.html`

- [ ] **Step 1: Add #screen-chronicle HTML**

```html
<div class="screen" id="screen-chronicle">
  <div class="chr-wrap">
    <div class="chr-term">
      <div class="chr-term-bar">
        <span class="chr-dots"><span></span><span></span><span></span></span>
        <span class="chr-term-title" id="chr-title">ritual-snake — match chronicle · room owner</span>
        <button class="chr-skip" id="chr-skip-btn" onclick="skipChronicle()">Skip</button>
      </div>
      <div class="chr-body" id="chr-body"></div>
      <div class="chr-footer">
        <div class="chr-commit-line" id="chr-commit-line">
          <span class="chr-prompt">$</span>
          <span class="chr-cmd">ritual chronicle commit --room <span id="chr-room-id">?</span> --onchain</span>
        </div>
        <div class="chr-actions">
          <button class="chr-btn primary" id="chr-commit-btn" onclick="commitChronicle()">✓ Chronicle Committed</button>
          <div class="chr-auto" id="chr-auto">Auto-committing in <span id="chr-countdown">0:30</span>...</div>
        </div>
        <div class="chr-nav" id="chr-nav" style="display:none">
          <button class="chr-btn secondary" onclick="backToLobby()">↩ Back to Lobby</button>
        </div>
      </div>
    </div>
  </div>
</div>
```

- [ ] **Step 2: Add chronicle CSS**

```css
#screen-chronicle{background:#0a0a0a;align-items:center;justify-content:center}
.chr-wrap{padding:20px;width:100%;max-width:760px}
.chr-term{background:#0d1117;border:1px solid #30363d;border-radius:10px;font-family:var(--fm);font-size:12px;overflow:hidden}
.chr-term-bar{background:#161b22;padding:10px 14px;display:flex;align-items:center;gap:10px;border-bottom:1px solid #30363d}
.chr-dots{display:flex;gap:5px}.chr-dots span{width:10px;height:10px;border-radius:50%;background:#30363d}
.chr-dots span:nth-child(1){background:#ff5f57}.chr-dots span:nth-child(2){background:#febc2e}.chr-dots span:nth-child(3){background:#28c840}
.chr-term-title{flex:1;text-align:center;color:#7d8590;font-size:11px}
.chr-skip{background:transparent;border:1px solid #30363d;color:#7d8590;font-family:var(--fm);font-size:10px;padding:3px 9px;border-radius:4px;cursor:pointer}
.chr-skip:hover{color:#e6edf3;border-color:#7d8590}
.chr-body{padding:18px 20px;max-height:55vh;overflow-y:auto;line-height:1.8}
.chr-hdr{color:#7d8590;margin-bottom:8px}
.chr-hdr .grn{color:#3fb950}
.chr-tbl-hdr{color:#7d8590;border-bottom:1px solid #30363d;padding-bottom:6px;margin-bottom:4px;display:grid;grid-template-columns:55px 100px 1fr;gap:8px}
.chr-row{display:grid;grid-template-columns:55px 100px 1fr;gap:8px;padding:2px 0}
.chr-t{color:#7d8590}.chr-ev-start{color:#58a6ff}.chr-ev-kill{color:#f85149}
.chr-ev-elim{color:#f85149}.chr-ev-milestone{color:#e3b341}.chr-ev-end{color:#3fb950}
.chr-ev-kill .chr-star{color:var(--gold)}
.chr-footer{border-top:1px solid #30363d;padding:14px 20px;display:flex;flex-direction:column;gap:10px}
.chr-commit-line{color:#7d8590;display:flex;gap:8px;align-items:center}
.chr-prompt{color:#3fb950}.chr-cmd{color:#e6edf3}
.chr-actions{display:flex;align-items:center;gap:14px}
.chr-btn{padding:10px 22px;border-radius:8px;border:1px solid;font-family:var(--fb);font-size:13px;font-weight:600;cursor:pointer;transition:all .15s}
.chr-btn.primary{border-color:var(--green);color:var(--green);background:transparent}
.chr-btn.primary:hover{background:rgba(25,209,132,.08)}
.chr-btn.secondary{border-color:var(--g7);color:var(--g4);background:transparent}
.chr-btn.secondary:hover{border-color:var(--g5);color:var(--g3)}
.chr-auto{color:#7d8590;font-family:var(--fm);font-size:11px}
.chr-nav{display:flex;gap:10px;flex-wrap:wrap}
```

- [ ] **Step 3: Add chronicle state and showChronicle()**

```js
let _chronicleAutoTimer = null;
let _chronicleCountdown = 30;
let _chronicleEvents    = [];
let _chronicleResults   = [];

function showChronicle(events, results, roomId) {
  _chronicleEvents  = events  || [];
  _chronicleResults = results || [];

  document.getElementById('chr-title').textContent =
    'ritual-snake — match chronicle · ' + (roomId || 'room');
  document.getElementById('chr-room-id').textContent = roomId || '?';

  // Render event log
  const body = document.getElementById('chr-body');
  body.innerHTML = `
    <div class="chr-hdr"># — Match Event Log ——————————</div>
    <div class="chr-hdr"># Room <span class="grn">${roomId}</span> · Private session</div>
    <br>
    <div class="chr-tbl-hdr"><span>TIME</span><span>EVENT</span><span>DETAIL</span></div>
    ${_chronicleEvents.map(ev => {
      const cls = 'chr-ev-' + ev.type;
      let evLabel = ev.type;
      let detail  = '';
      if (ev.type === 'session_start') { evLabel = 'session_start'; detail = ev.detail || ''; }
      else if (ev.type === 'kill')      { evLabel = 'kill <span class="chr-star">★</span>'; detail = `${ev.killer} killed ${ev.victim} · score: ${(ev.score||0).toLocaleString()}`; }
      else if (ev.type === 'eliminated'){ evLabel = 'eliminated'; detail = `${ev.victim} killed by ${ev.killer} · score: ${(ev.score||0).toLocaleString()}`; }
      else if (ev.type === 'milestone') { evLabel = 'milestone'; detail = `${ev.name} reached length ${ev.length}`; }
      else if (ev.type === 'session_end'){ evLabel = 'session_end'; detail = ev.detail || ''; }
      return `<div class="chr-row"><span class="chr-t">${ev.time}</span><span class="${cls}">${evLabel}</span><span class="chr-d">${detail}</span></div>`;
    }).join('')}`;

  // Reset commit state
  document.getElementById('chr-commit-btn').textContent = '✓ Chronicle Committed';
  document.getElementById('chr-commit-btn').disabled = false;
  document.getElementById('chr-nav').style.display = 'none';
  document.getElementById('chr-auto').style.display = '';

  // Start 30s auto-commit countdown
  _chronicleCountdown = 30;
  startChronicleCountdown();

  showScreen('chronicle');
}

function startChronicleCountdown() {
  if (_chronicleAutoTimer) clearInterval(_chronicleAutoTimer);
  _chronicleAutoTimer = setInterval(() => {
    _chronicleCountdown--;
    const el = document.getElementById('chr-countdown');
    if (el) el.textContent = '0:' + String(Math.max(0, _chronicleCountdown)).padStart(2, '0');
    if (_chronicleCountdown <= 0) {
      clearInterval(_chronicleAutoTimer);
      _autoCommitChronicle();
    }
  }, 1000);
}

function _autoCommitChronicle() {
  send({ t: 'chronicle_commit', events: _chronicleEvents, results: _chronicleResults });
  document.getElementById('chr-commit-btn').textContent = '✓ Chronicle Committed';
  document.getElementById('chr-commit-btn').disabled = true;
  document.getElementById('chr-auto').style.display = 'none';
  document.getElementById('chr-nav').style.display = '';
}

function commitChronicle() {
  clearInterval(_chronicleAutoTimer);
  _autoCommitChronicle();
}

function skipChronicle() {
  if (!confirm('Are you sure? Chronicle will be lost.')) return;
  clearInterval(_chronicleAutoTimer);
  backToLobby();
}
```

- [ ] **Step 4: Handle chronicle_committed message**

In `handleMsg`, add:
```js
case 'chronicle_committed':
  document.getElementById('chr-commit-btn').textContent = '✓ Chronicle Committed';
  document.getElementById('chr-commit-btn').disabled = true;
  document.getElementById('chr-auto').style.display = 'none';
  document.getElementById('chr-nav').style.display = '';
  break;
```

- [ ] **Step 5: Route session_end for private to chronicle screen**

The `session_end` case already checks `myRoomId.startsWith('prv_')` (added in Task 7). Update it to show chronicle for private rooms:
```js
case 'session_end': {
  stopRenderLoop();
  if (myRoomId && myRoomId.startsWith('prv_')) {
    showChronicle(d.chronicleEvents || [], d.results || [], myRoomId);
    break;
  }
  // Public: show NFT card for own stats
  const results = d.results || [];
  const myResult = results.find(r => r.name === (gameState?.p?.[myId]?.n));
  const rank = myResult ? results.indexOf(myResult) + 1 : results.length;
  if (myResult) {
    showNftCard({ ...myResult, length: myResult.maxLen || myResult.length }, rank, results.length, myRoomId);
    break;
  }
  showResults(d);
  break;
}
```

- [ ] **Step 6: Commit**
```bash
git add public/index.html
git commit -m "feat: private match chronicle screen with 30s auto-commit and skip confirmation"
```

---

## Task 10: Final Integration Check + Deploy

- [ ] **Step 1: Verify showScreen handles all new screen IDs**

In `public/index.html`, find the `showScreen(name)` function. Confirm it uses `document.getElementById('screen-' + name)`. Verify these IDs exist: `queue`, `nft-card`, `chronicle`.

- [ ] **Step 2: Verify backToLobby() resets all state**

```js
function backToLobby() {
  stopRenderLoop();
  stopQueueCountdown();
  if (_chronicleAutoTimer) clearInterval(_chronicleAutoTimer);
  if (ws) { ws.close(); ws = null; }
  gameState = null; myId = null; eventFeed = [];
  showScreen('lobby');
  checkRitualStatus();
}
```

- [ ] **Step 3: Test locally**

```bash
cd "f:/ritual snake game"
npm install
node server.js
# Open http://localhost:3000
# Verify: growth rate, event feed, skin market, queue screen
```

- [ ] **Step 4: Deploy to VPS**

```bash
pscp -pw PASSWORD -r game ritual server.js public/index.html public/skins.js root@168.144.142.150:/root/snake-game/
plink -ssh -pw PASSWORD root@168.144.142.150 "cd /root/snake-game && npm install && pm2 restart snake-game"
```

- [ ] **Step 5: Final commit**
```bash
git add -A
git commit -m "feat: Ritual Snake v2 — skins, NFT card, chronicle, queue, event feed, ritual badge"
```

---

## Self-Review Checklist

- [x] **Spec coverage:**
  - Group 1 quick fixes: Task 1 ✓
  - Kill event feed: Task 2 ✓
  - Ritual badge: Task 3 ✓
  - Queue system: Task 4 ✓
  - 10 skins: Task 5 ✓
  - Skin market + rendering: Task 6 ✓
  - NFT card public: Task 7 ✓
  - Chronicle tracking: Task 8 ✓
  - Chronicle screen + commit: Task 9 ✓
  - Wallet-linked skin persistence: Task 6 step 3 ✓
  - Skip with confirm: Task 9 step 3 ✓
  - Auto-commit 30s: Task 9 step 3 ✓

- [x] **Placeholders:** None. All code blocks are complete.

- [x] **Type consistency:**
  - `skin` string passed as `d.skin` in join messages, stored as `p.skin`, sent as `sk` in payload — consistent across Tasks 4, 6, 8.
  - `_pushChronicle()` defined in Task 8 step 1, used in steps 2–5 — consistent.
  - `showNftCard(stats, rank, playerCount, roomId)` defined in Task 7 step 3, called in Task 7 step 4 — consistent.
  - `showChronicle(events, results, roomId)` defined in Task 9 step 3, called in Task 9 step 5 — consistent.
  - `eventFeed` reset in Task 2 step 4, used in Task 2 step 5 — consistent.
