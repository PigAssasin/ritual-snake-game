'use strict';

const SpatialGrid = require('./SpatialGrid');

const W = 8000, H = 8000;
const TICK         = 33;
const SPEED        = 5.6;
const BOOST_SPEED  = SPEED * 1.5;
const BOOST_TICKS  = 44;
const COOLDOWN_T   = 111;
const TURN         = 0.136;
const FOOD_N       = 1400;
const INIT_LEN     = 55;
const MAX_LEN      = 450;
const RESPAWN_T    = 55;
const VIEW_W       = 1600;
const VIEW_H       = 1100;
const SESSION_MS   = 7 * 60 * 1000;

const FOOD_GROWTH = [0.5, 0.83, 2.5];
const FOOD_RADIUS = [3, 5, 7];
const R_MIN = 20, R_MAX = 44, VISUAL_REF = 150;

const COLORS = [
  '#4ade80','#f97316','#3b82f6','#ec4899',
  '#a855f7','#eab308','#06b6d4','#ef4444',
  '#10b981','#f43f5e','#8b5cf6','#22d3ee',
  '#fb923c','#34d399','#818cf8','#f472b6',
];

const BOT_NAMES = ['Viper','Blitz','Grudge','Frost','Spike','Hunter','Cobra','Shadow','Striker','Venom'];

function rnd(n) { return Math.random() * n; }
function d2(ax, ay, bx, by) { const dx=ax-bx,dy=ay-by; return dx*dx+dy*dy; }
function angleDiff(a, b) {
  let d = a - b;
  while (d >  Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}
function segR(tlen) {
  const t = Math.min(1, (tlen - INIT_LEN) / (VISUAL_REF - INIT_LEN));
  return R_MIN + Math.sqrt(t) * (R_MAX - R_MIN);
}

class GameRoom {
  /**
   * @param {string} id - room identifier
   * @param {'public'|'private'} mode
   * @param {object} opts
   * @param {string}  [opts.password]   - private room password
   * @param {number}  [opts.maxPlayers] - override max (default: 10 public, 30 private)
   * @param {number}  [opts.botCount]   - bots to spawn (default: 5 public, 0 private)
   * @param {boolean} [opts.respawn]    - allow respawn (default: false public, true private)
   * @param {Function} [opts.onSessionEnd] - callback(roomId, results) when session ends
   * @param {Function} [opts.onElimination] - callback(roomId, playerId, stats) on public room kill
   */
  constructor(id, mode, opts = {}) {
    this.id       = id;
    this.mode     = mode;
    this.password = opts.password || null;
    this.maxPlayers = opts.maxPlayers ?? (mode === 'public' ? 10 : 30);
    this.botCount   = opts.botCount  ?? (mode === 'public' ? 5  : 0);
    this.allowRespawn = opts.respawn ?? (mode === 'private');
    this.onSessionEnd    = opts.onSessionEnd    || null;
    this.onElimination   = opts.onElimination   || null;

    this.players  = {};
    this.food     = [];
    this.wsMap    = new Map();
    this.judgeWs  = null;
    this.judgeId  = null;

    this._nextPlayerId = 1;
    this._colIdx       = 0;
    this._nextTick     = 0;
    this._tickTimer    = null;
    this._sessionTimer = null;

    this.sessionActive    = false;
    this.sessionStartTime = null;
    this.sessionNumber    = 0;

    this.sessionDurationMs  = SESSION_MS;
    this.lobbyActive        = (mode === 'private');
    this.lobbyPlayers       = new Map(); // id → { name, color, headType }
    this.hostId             = null;
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  playerCount() { return Object.keys(this.players).length; }
  humanCount()  { return Object.values(this.players).filter(p => !p.isBot).length + this.lobbyPlayers.size; }
  isFull()      { return this.humanCount() >= this.maxPlayers; }

  startSession() {
    if (this.sessionActive) return;
    this.sessionActive    = true;
    this.sessionStartTime = Date.now();
    this.sessionNumber++;
    this._fillFood();
    this._spawnBots();
    this._nextTick = Date.now();
    this._scheduleTick();
    this._sessionTimer = setTimeout(() => this._endSession(), this.sessionDurationMs);
    this._broadcastAll({ t: 'session_start', sessionNum: this.sessionNumber, duration: this.sessionDurationMs });
  }

  stopSession() {
    this.sessionActive = false;
    clearTimeout(this._sessionTimer);
    clearTimeout(this._tickTimer);
  }

  addPlayer(ws, name, headType) {
    if (this.isFull()) return null;
    const id = String(this._nextPlayerId++);
    this.wsMap.set(id, ws);

    if (this.lobbyActive) {
      const color = COLORS[this._colIdx++ % COLORS.length];
      this.lobbyPlayers.set(id, { name, color, headType });
      if (!this.hostId) this.hostId = id;
      ws.send(JSON.stringify({
        t: 'lobby_state', id,
        roomId: this.id, mode: this.mode, pass: this.password || '',
        isHost: id === this.hostId,
        players: this._getLobbyPlayerList(),
      }));
      this._broadcastLobbyUpdate();
      return id;
    }

    this.players[id] = this._mkSnake(name, COLORS[this._colIdx++ % COLORS.length], false, headType);
    ws.send(JSON.stringify({ t: 'ok', id, roomId: this.id, mode: this.mode }));
    // 3s countdown for public rooms
    let sec = 3;
    const cd = () => {
      this.wsMap.get(id)?.send?.(JSON.stringify({ t: 'countdown', sec }));
      sec--;
      if (sec > 0) setTimeout(cd, 1000);
    };
    cd();
    if (!this.sessionActive) this.startSession();
    return id;
  }

  setJudge(ws, name) {
    this.judgeWs = ws;
    this.judgeId = 'judge';
    ws.send(JSON.stringify({ t: 'ok', id: 'judge', roomId: this.id, mode: this.mode, isJudge: true }));
  }

  removePlayer(id) {
    delete this.players[id];
    this.wsMap.delete(id);
    if (this.lobbyPlayers.has(id)) {
      this.lobbyPlayers.delete(id);
      if (this.hostId === id) {
        this.hostId = this.lobbyPlayers.keys().next().value || null;
      }
      this._broadcastLobbyUpdate();
    }
    if (this.humanCount() === 0 && this.mode === 'private') this.stopSession();
  }

  handleMessage(id, d) {
    if (d.t === 'a' && this.players[id]?.alive) {
      this.players[id].targetAngle = d.a;
    }
    if (d.t === 'boost' && this.players[id]?.alive &&
        !this.players[id].boostActive && !this.players[id].boostCooldown) {
      this.players[id].boostActive = true;
      this.players[id].boostTimer  = BOOST_TICKS;
    }
  }

  timeRemaining() {
    if (!this.sessionActive || !this.sessionStartTime) return this.sessionDurationMs;
    return Math.max(0, this.sessionDurationMs - (Date.now() - this.sessionStartTime));
  }

  // ── Internal ────────────────────────────────────────────────────────────────

  _scheduleTick() {
    this._tickTimer = setTimeout(() => {
      this._tick();
      this._nextTick += TICK;
      if (this.sessionActive) {
        this._tickTimer = setTimeout(() => this._scheduleTick(), Math.max(0, this._nextTick - Date.now()));
      }
    }, Math.max(0, this._nextTick - Date.now()));
  }

  _tick() {
    const entries = Object.entries(this.players);

    for (const [, p] of entries) { if (p.isBot) this._botAI(p); }

    const foodGrid = new SpatialGrid(W, H, 200);
    for (let i = 0; i < this.food.length; i++) {
      foodGrid.insert(this.food[i][0], this.food[i][1], i);
    }

    for (const [id, p] of entries) {
      if (!p.alive) {
        if (this.allowRespawn) {
          if (--p.respawn <= 0) {
            const fresh = this._mkSnake(p.name, p.color, p.isBot, p.headType);
            Object.assign(p, fresh);
          }
        }
        continue;
      }

      const diff = angleDiff(p.targetAngle, p.angle);
      p.angle += Math.sign(diff) * Math.min(Math.abs(diff), TURN);

      if (p.boostActive) {
        if (--p.boostTimer <= 0) { p.boostActive = false; p.boostCooldown = COOLDOWN_T; }
      }
      if (p.boostCooldown > 0) p.boostCooldown--;

      const spd = p.boostActive ? BOOST_SPEED : SPEED;
      const [hx, hy] = p.segs[0];
      const nx = Math.round(hx + Math.cos(p.angle) * spd);
      const ny = Math.round(hy + Math.sin(p.angle) * spd);

      if (nx < 0 || nx > W || ny < 0 || ny > H) {
        this._eliminatePlayer(id, p, 'wall');
        continue;
      }

      p.segs.unshift([nx, ny]);

      const myR = segR(p.targetLen);
      const nearFood = foodGrid.query(nx, ny, myR + 14);
      const toRemove = new Set();
      for (const fi of nearFood) {
        const f = this.food[fi];
        if (!f) continue;
        const eatD2 = (myR + FOOD_RADIUS[f[3]]) ** 2;
        if (d2(nx, ny, f[0], f[1]) < eatD2) {
          toRemove.add(fi);
          p.growthAcc += FOOD_GROWTH[f[3]];
          while (p.growthAcc >= 1) {
            p.targetLen = Math.min(p.targetLen + 1, MAX_LEN);
            p.growthAcc -= 1;
          }
          p.score++;
        }
      }
      for (const fi of [...toRemove].sort((a, b) => b - a)) {
        this.food.splice(fi, 1);
      }

      if (p.segs.length > p.targetLen) p.segs.length = p.targetLen;
    }

    const bodyGrid = new SpatialGrid(W, H, 200);
    const alive = entries.filter(([, p]) => p.alive && p.segs.length > 0);

    for (const [id, p] of alive) {
      const step = Math.max(2, Math.floor(segR(p.targetLen) / SPEED));
      for (let i = step; i < p.segs.length; i += step) {
        bodyGrid.insert(p.segs[i][0], p.segs[i][1], { ownerId: id, seg: p.segs[i] });
      }
    }

    for (const [id, p] of alive) {
      if (!p.alive) continue;
      const [hx, hy] = p.segs[0];
      const myR = segR(p.targetLen);
      const killD2 = (myR * 0.75) ** 2 * 4;
      const nearSegs = bodyGrid.query(hx, hy, myR * 1.5);
      for (const { ownerId, seg } of nearSegs) {
        if (ownerId === id) continue;
        if (d2(hx, hy, seg[0], seg[1]) < killD2) {
          const killer = this.players[ownerId];
          if (killer && !killer.isBot) killer.kills++;
          this._eliminatePlayer(id, p, ownerId);
          break;
        }
      }
    }

    this._fillFood();
    this._broadcast();
  }

  _eliminatePlayer(id, p, killedBy) {
    const killerName = typeof killedBy === 'string'
      ? killedBy
      : (this.players[killedBy]?.name || 'unknown');
    const stats = {
      playerId: id,
      name:     p.name,
      score:    p.score,
      kills:    p.kills,
      length:   p.segs.length,
      killedBy: killerName,
    };

    this._broadcastAll({
      t: 'kill_event',
      victim: p.name,
      killer: killerName,
      isWall: killedBy === 'wall',
    });

    this._dropFood(p.segs);
    p.alive   = false;
    p.respawn = RESPAWN_T;
    p.segs    = [];
    p._lastHead = null;

    if (!p.isBot && !this.allowRespawn) {
      const ws = this.wsMap.get(id);
      if (ws?.readyState === 1) {
        ws.send(JSON.stringify({ t: 'eliminated', stats }));
      }
      if (this.onElimination) this.onElimination(this.id, id, stats);
      setTimeout(() => this.removePlayer(id), 3000);
    }
  }

  _endSession() {
    this.sessionActive = false;
    clearTimeout(this._tickTimer);

    const allPlayers = Object.values(this.players).filter(p => !p.isBot);
    const results = allPlayers.map(p => ({
      name:    p.name,
      score:   p.score,
      kills:   p.kills,
      deaths:  p.deaths || 0,
      maxLen:  p.maxLen  || p.segs.length,
    })).sort((a, b) => {
      if (this.mode === 'private') {
        return (b.score + b.kills * 10 - b.deaths * 3) -
               (a.score + a.kills * 10 - a.deaths * 3);
      }
      return b.score - a.score;
    });

    const winner = results[0] || null;
    this._broadcastAll({ t: 'session_end', results, winner });

    if (this.onSessionEnd) this.onSessionEnd(this.id, { results, winner, mode: this.mode });

    if (this.mode === 'public') {
      setTimeout(() => {
        this.players = {};
        this.food    = [];
        this.wsMap.forEach((ws) => {
          if (ws.readyState === 1) ws.send(JSON.stringify({ t: 'room_reset' }));
        });
        this.wsMap.clear();
        this.startSession();
      }, 10000);
    }
  }

  _broadcast() {
    const lb = {};
    for (const [pid, p] of Object.entries(this.players)) {
      lb[pid] = { n: p.name, sc: p.score, kl: p.kills, alive: p.alive, bot: p.isBot, tlen: p.targetLen, c: p.color };
    }
    const timeLeft = this.timeRemaining();

    for (const [cid, cws] of this.wsMap) {
      if (cws.readyState !== 1) continue;
      const me = this.players[cid];
      if (!me) continue;

      const center = (me.alive && me.segs.length) ? me.segs[0] : [W/2, H/2];
      const [cx, cy] = center;

      const visP = {};
      for (const [pid, p] of Object.entries(this.players)) {
        if (pid === cid) { visP[pid] = this._payload(p); continue; }
        if (!p.segs.length) continue;
        const [px, py] = p.segs[0];
        if (Math.abs(px - cx) > VIEW_W || Math.abs(py - cy) > VIEW_H) continue;
        visP[pid] = this._payload(p);
      }

      const visF = this.food.filter(([fx, fy]) =>
        Math.abs(fx - cx) <= VIEW_W && Math.abs(fy - cy) <= VIEW_H
      );

      cws.send(JSON.stringify({ t: 's', p: visP, f: visF, lb, timeLeft }));
    }

    if (this.judgeWs?.readyState === 1) {
      const allP = {};
      for (const [pid, p] of Object.entries(this.players)) allP[pid] = this._payload(p);
      this.judgeWs.send(JSON.stringify({ t: 's', p: allP, f: this.food, lb, timeLeft, isJudge: true }));
    }
  }

  _payload(p, thin = true) {
    let segs = p.segs;
    if (thin && segs.length > 1) {
      const R = segR(p.targetLen);
      const step = Math.max(2, Math.floor(R / SPEED));
      const thinned = [segs[0]];
      for (let i = step; i < segs.length; i += step) thinned.push(segs[i]);
      if (thinned[thinned.length - 1] !== segs[segs.length - 1]) thinned.push(segs[segs.length - 1]);
      segs = thinned;
    }
    return { s: segs, a: p.angle, c: p.color, n: p.name, ht: p.headType,
             alive: p.alive, rt: p.respawn, sc: p.score, kl: p.kills,
             len: p.segs.length, tlen: p.targetLen, bo: p.boostActive, bcd: p.boostCooldown, bot: p.isBot };
  }

  _broadcastAll(msg) {
    const data = JSON.stringify(msg);
    for (const ws of this.wsMap.values()) {
      if (ws.readyState === 1) ws.send(data);
    }
    if (this.judgeWs?.readyState === 1) this.judgeWs.send(data);
  }

  _mkSnake(name, color, isBot = false, headType = 0) {
    const x = 500 + rnd(W - 1000);
    const y = 500 + rnd(H - 1000);
    const a = rnd(Math.PI * 2);
    const segs = [];
    for (let i = 0; i < INIT_LEN; i++) {
      segs.push([Math.round(x - Math.cos(a)*i*SPEED), Math.round(y - Math.sin(a)*i*SPEED)]);
    }
    return { name, color, isBot, headType, segs, angle: a, targetAngle: a,
             targetLen: INIT_LEN, growthAcc: 0, score: 0, kills: 0, deaths: 0, maxLen: INIT_LEN,
             alive: true, respawn: 0, boostActive: false, boostTimer: 0, boostCooldown: 0,
             _lastHead: null, _botTick: 0, _botTarget: null };
  }

  _spawnBots() {
    for (let i = 0; i < this.botCount; i++) {
      const id = `bot_${this.id}_${i}`;
      this.players[id] = this._mkSnake(BOT_NAMES[i % BOT_NAMES.length],
        COLORS[this._colIdx++ % COLORS.length], true, Math.floor(rnd(5)));
    }
  }

  _botAI(bot) {
    if (!bot.alive) return;
    const [hx, hy] = bot.segs[0];
    bot._botTick++;
    const margin = 500;
    if (hx < margin || hx > W - margin || hy < margin || hy > H - margin) {
      bot.targetAngle = Math.atan2(H/2 - hy, W/2 - hx) + (rnd(1) - 0.5) * 0.2;
      return;
    }
    if (bot._botTick % 30 === 0 || !bot._botTarget) {
      let best = null, bestScore = Infinity;
      const n = Math.min(this.food.length, 80);
      for (let i = 0; i < n; i++) {
        const f = this.food[Math.floor(rnd(this.food.length))];
        if (!f) continue;
        const dd = d2(hx, hy, f[0], f[1]);
        const score = dd / (f[3] + 1);
        if (score < bestScore) { bestScore = score; best = f; }
      }
      bot._botTarget = best;
    }
    if (bot._botTarget) {
      bot.targetAngle = Math.atan2(bot._botTarget[1] - hy, bot._botTarget[0] - hx) + (rnd(1) - 0.5) * 0.15;
      if (d2(hx, hy, bot._botTarget[0], bot._botTarget[1]) < 625) bot._botTarget = null;
    }
    if (!bot.boostActive && !bot.boostCooldown && rnd(1) < 0.006) {
      bot.boostActive = true; bot.boostTimer = BOOST_TICKS;
    }
  }

  _fillFood() {
    while (this.food.length < FOOD_N) {
      const r = Math.random();
      const type = r < 0.60 ? 0 : r < 0.90 ? 1 : 2;
      this.food.push([Math.round(rnd(W)), Math.round(rnd(H)), Math.floor(rnd(COLORS.length)), type]);
    }
  }

  _dropFood(segs) {
    const step = Math.max(1, Math.floor(segs.length / 30));
    for (let i = 0; i < segs.length; i += step) {
      const [fx, fy] = segs[i];
      this.food.push([
        Math.round(Math.max(10, Math.min(W - 10, fx + rnd(22) - 11))),
        Math.round(Math.max(10, Math.min(H - 10, fy + rnd(22) - 11))),
        Math.floor(rnd(COLORS.length)), 1,
      ]);
    }
  }

  hostStartGame(requesterId, durationMin) {
    if (requesterId !== this.hostId) return;
    this.lobbyActive = false;
    this.sessionDurationMs = Math.max(3, Math.min(15, durationMin || 7)) * 60 * 1000;

    // Create snakes for all lobby players
    for (const [id, lp] of this.lobbyPlayers) {
      this.players[id] = this._mkSnake(lp.name, lp.color, false, lp.headType);
      const ws = this.wsMap.get(id);
      if (ws?.readyState === 1) {
        ws.send(JSON.stringify({ t: 'ok', id, roomId: this.id, mode: this.mode }));
      }
    }
    this.lobbyPlayers.clear();

    // 3s countdown then start
    let sec = 3;
    const cd = () => {
      this._broadcastAll({ t: 'countdown', sec });
      sec--;
      if (sec > 0) setTimeout(cd, 1000);
      else setTimeout(() => this.startSession(), 1000);
    };
    cd();
  }

  _getLobbyPlayerList() {
    return [...this.lobbyPlayers.entries()].map(([id, p]) => ({
      id, name: p.name, color: p.color, isHost: id === this.hostId,
    }));
  }

  _broadcastLobbyUpdate() {
    const data = JSON.stringify({ t: 'lobby_update', players: this._getLobbyPlayerList() });
    for (const ws of this.wsMap.values()) {
      if (ws.readyState === 1) ws.send(data);
    }
  }
}

module.exports = GameRoom;
