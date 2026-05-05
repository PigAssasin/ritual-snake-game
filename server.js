const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');

// ── Config ──
const W = 8000, H = 8000;
const TICK         = 45;
const SPEED        = 7.0;           // -30% from original
const BOOST_SPEED  = SPEED * 1.5;   // +50% boost
const BOOST_TICKS  = 44;            // 2s boost
const COOLDOWN_T   = 111;           // 5s cooldown
const TURN         = 0.17;
const FOOD_N       = 1400;          // -30% food count
const INIT_LEN     = 55;
const MAX_LEN      = 450;
const RESPAWN_T    = 55;
const BOT_COUNT    = 5;

// Food types: 0=small, 1=medium, 2=large
const FOOD_GROWTH = [0.2, 1/3, 1.0]; // segments per eat (need 5/3/1 to gain 1 segment)
const FOOD_RADIUS = [3, 5, 7];        // -50% smaller food

const R_MIN = 14, R_MAX = 32, VISUAL_REF = 150; // growth formula params

const COLORS = [
  '#4ade80','#f97316','#3b82f6','#ec4899',
  '#a855f7','#eab308','#06b6d4','#ef4444',
  '#10b981','#f43f5e','#8b5cf6','#22d3ee',
  '#fb923c','#34d399','#818cf8','#f472b6',
];

const BOT_NAMES = [
  'Viper','Blitz','Grudge','Frost','Spike',
  'Hunter','Cobra','Shadow','Striker','Venom',
  'Axel','Nova','Rex',
];

// ── HTTP ──
const httpServer = http.createServer((req, res) => {
  const fp = path.join(__dirname, 'public', req.url === '/' ? 'index.html' : req.url);
  fs.readFile(fp, (err, data) => {
    if (err) { res.writeHead(404); res.end(); return; }
    res.writeHead(200); res.end(data);
  });
});

const wss = new WebSocket.Server({ server: httpServer });

let players = {};
let food = [];
let nextId = 1;
let colIdx = 0;

// ── Utils ──
function rnd(n) { return Math.random() * n; }
function d2(ax, ay, bx, by) { const dx=ax-bx,dy=ay-by; return dx*dx+dy*dy; }
function angleDiff(a, b) {
  let d = a - b;
  while (d >  Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

// Visual segment radius — grows with targetLen (sqrt curve = fast initial growth)
function segR(tlen) {
  const t = Math.min(1, (tlen - INIT_LEN) / (VISUAL_REF - INIT_LEN));
  return R_MIN + Math.sqrt(t) * (R_MAX - R_MIN);
}

// ── Snake factory ──
function mkSnake(name, color, isBot=false, headType=0) {
  const x = 500 + rnd(W - 1000);
  const y = 500 + rnd(H - 1000);
  const a = rnd(Math.PI * 2);
  const segs = [];
  for (let i = 0; i < INIT_LEN; i++) {
    segs.push([x - Math.cos(a)*i*SPEED, y - Math.sin(a)*i*SPEED]);
  }
  return {
    name, color, isBot, headType,
    segs, angle: a, targetAngle: a,
    targetLen: INIT_LEN, growthAcc: 0, score: 0, kills: 0,
    alive: true, respawn: 0,
    boostActive: false, boostTimer: 0, boostCooldown: 0,
    _botTick: 0, _botTarget: null,
  };
}

// ── Food ──
function fillFood() {
  while (food.length < FOOD_N) {
    const r = Math.random();
    const type = r < 0.60 ? 0 : r < 0.90 ? 1 : 2; // 60% small, 30% medium, 10% large
    food.push([Math.round(rnd(W)), Math.round(rnd(H)), Math.floor(rnd(COLORS.length)), type]);
  }
}

function dropFood(segs) {
  const step = Math.max(1, Math.floor(segs.length / 30));
  for (let i = 0; i < segs.length; i += step) {
    const [fx, fy] = segs[i];
    // Drop as medium food
    food.push([
      Math.round(Math.max(10, Math.min(W-10, fx + rnd(22)-11))),
      Math.round(Math.max(10, Math.min(H-10, fy + rnd(22)-11))),
      Math.floor(rnd(COLORS.length)), 1,
    ]);
  }
}

// ── Bot AI ──
function botAI(bot) {
  if (!bot.alive) return;
  const [hx, hy] = bot.segs[0];
  bot._botTick++;

  // Wall avoidance — priority
  const margin = 500;
  if (hx < margin || hx > W-margin || hy < margin || hy > H-margin) {
    const toCenter = Math.atan2(H/2 - hy, W/2 - hx);
    bot.targetAngle = toCenter + (rnd(1)-0.5)*0.2;
    if (!bot.boostActive && !bot.boostCooldown) {
      bot.boostActive = true; bot.boostTimer = BOOST_TICKS;
    }
    return;
  }

  // Chase nearest large food first, else any food (sample 80 items)
  if (bot._botTick % 30 === 0 || !bot._botTarget) {
    let best = null, bestScore = Infinity;
    const n = Math.min(food.length, 80);
    for (let i = 0; i < n; i++) {
      const f = food[Math.floor(rnd(food.length))];
      const dd = d2(hx, hy, f[0], f[1]);
      const score = dd / (f[3]+1); // prefer large food (type 2)
      if (score < bestScore) { bestScore = score; best = f; }
    }
    bot._botTarget = best;
  }

  if (bot._botTarget) {
    bot.targetAngle = Math.atan2(bot._botTarget[1]-hy, bot._botTarget[0]-hx) + (rnd(1)-0.5)*0.15;
    if (d2(hx, hy, bot._botTarget[0], bot._botTarget[1]) < 625) bot._botTarget = null;
  }

  // Random boost
  if (!bot.boostActive && !bot.boostCooldown && rnd(1) < 0.006) {
    bot.boostActive = true; bot.boostTimer = BOOST_TICKS;
  }
}

// ── Bots init ──
function initBots() {
  for (let i = 0; i < BOT_COUNT; i++) {
    players[`bot_${i}`] = mkSnake(BOT_NAMES[i], COLORS[colIdx++ % COLORS.length], true, Math.floor(rnd(5)));
  }
}

// ── Game loop ──
function tick() {
  const entries = Object.entries(players);

  // Bot AI
  for (const [, p] of entries) { if (p.isBot) botAI(p); }

  // Move all snakes
  for (const [, p] of entries) {
    if (!p.alive) {
      if (--p.respawn <= 0) Object.assign(p, mkSnake(p.name, p.color, p.isBot, p.headType));
      continue;
    }

    // Turn
    const diff = angleDiff(p.targetAngle, p.angle);
    p.angle += Math.sign(diff) * Math.min(Math.abs(diff), TURN);

    // Boost timer
    if (p.boostActive) {
      if (--p.boostTimer <= 0) { p.boostActive = false; p.boostCooldown = COOLDOWN_T; }
    }
    if (p.boostCooldown > 0) p.boostCooldown--;

    const spd = p.boostActive ? BOOST_SPEED : SPEED;
    const [hx, hy] = p.segs[0];
    const nx = hx + Math.cos(p.angle) * spd;
    const ny = hy + Math.sin(p.angle) * spd;

    // Wall → die
    if (nx < 0 || nx > W || ny < 0 || ny > H) {
      dropFood(p.segs);
      p.alive = false; p.respawn = RESPAWN_T; p.segs = [];
      continue;
    }

    p.segs.unshift([nx, ny]);

    // Eat food
    const myR = segR(p.targetLen);
    for (let i = food.length-1; i >= 0; i--) {
      const [fx, fy, , ftype] = food[i];
      const eatD2 = (myR + FOOD_RADIUS[ftype]) ** 2;
      if (d2(nx, ny, fx, fy) < eatD2) {
        food.splice(i, 1);
        p.growthAcc += FOOD_GROWTH[ftype];
        while (p.growthAcc >= 1) {
          p.targetLen = Math.min(p.targetLen + 1, MAX_LEN);
          p.growthAcc -= 1;
        }
        p.score++;
      }
    }

    if (p.segs.length > p.targetLen) p.segs.length = p.targetLen;
  }

  // ── Collision: head touches OTHER snake's body → die ──
  // No self-collision. No wall re-check (already handled above).
  const alive = entries.filter(([,p]) => p.alive && p.segs.length > 0);
  for (const [id, p] of alive) {
    if (!p.alive) continue;
    const [hx, hy] = p.segs[0];
    const myR = segR(p.targetLen);

    for (const [oid, other] of alive) {
      if (oid === id) continue; // skip self
      const oR = segR(other.targetLen);
      const killD2 = (myR * 0.75 + oR * 0.75) ** 2;

      // Check other snake body (skip first 2 segs near their head)
      for (let i = 2; i < other.segs.length; i += 2) {
        if (d2(hx, hy, other.segs[i][0], other.segs[i][1]) < killD2) {
          dropFood(p.segs);
          p.alive = false; p.respawn = RESPAWN_T; p.segs = [];
          if (!other.isBot) other.kills++;
          break;
        }
      }
      if (!p.alive) break;
    }
  }

  fillFood();

  // Broadcast
  const msg = JSON.stringify({
    t: 's',
    p: Object.fromEntries(entries.map(([id, p]) => [id, {
      s: p.segs,
      a: p.angle,
      c: p.color,
      n: p.name,
      ht: p.headType,
      alive: p.alive,
      rt: p.respawn,
      sc: p.score,
      kl: p.kills,
      len: p.segs.length,
      tlen: p.targetLen,
      bo: p.boostActive,
      bcd: p.boostCooldown,
      bot: p.isBot,
    }])),
    f: food,
  });

  wss.clients.forEach(ws => { if (ws.readyState === 1) ws.send(msg); });
}

fillFood();
initBots();
setInterval(tick, TICK);

wss.on('connection', ws => {
  const id = String(nextId++);
  ws.on('message', raw => {
    try {
      const d = JSON.parse(raw);
      if (d.t === 'join') {
        players[id] = mkSnake((d.n||'Snake').slice(0,16), COLORS[colIdx++ % COLORS.length], false, d.ht||0);
        ws.send(JSON.stringify({ t: 'ok', id }));
      }
      if (d.t === 'a' && players[id]?.alive) {
        players[id].targetAngle = d.a;
      }
      if (d.t === 'boost' && players[id]?.alive && !players[id].boostActive && !players[id].boostCooldown) {
        players[id].boostActive = true;
        players[id].boostTimer  = BOOST_TICKS;
      }
    } catch {}
  });
  ws.on('close', () => delete players[id]);
});

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => console.log(`\n  → http://localhost:${PORT}\n`));
