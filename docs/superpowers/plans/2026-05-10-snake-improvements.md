# Snake Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Four independent improvements — growth mechanics, public room config, custom skin heads, and animated cyberpunk background.

**Architecture:** Each task is self-contained and commits independently. Tasks 1–2 are server-side constants. Task 3 rewrites canvas rendering in client. Task 4 adds a background canvas layer + Higgsfield image.

**Tech Stack:** Node.js (server), Vanilla JS + Canvas (client), Higgsfield API (image generation)

---

## Task 1: Growth Mechanics

**Files:**
- Modify: `game/GameRoom.js` lines 20–22

- [ ] **Step 1: Edit constants**

In `game/GameRoom.js`, change lines 20–22:
```js
// BEFORE
const FOOD_GROWTH = [0.5, 0.83, 2.5];
const FOOD_RADIUS = [3, 5, 7];
const R_MIN = 20, R_MAX = 44, VISUAL_REF = 150;

// AFTER
const FOOD_GROWTH = [1.0, 1.66, 5.0];
const FOOD_RADIUS = [3, 5, 7];
const R_MIN = 20, R_MAX = 44, VISUAL_REF = 215;
```

- [ ] **Step 2: Commit**
```bash
git add game/GameRoom.js
git commit -m "feat: 2x length growth per food, 30% slower width gain"
```

**Checkpoint 1 ✅** — Restart server, ăn đồ ăn và kiểm tra rắn dài hơn nhanh hơn nhưng béo chậm hơn.

---

## Task 2: Public Room — 1 Room + 4-min Threshold

**Files:**
- Modify: `game/PublicRoomManager.js` lines 5–6, 41

- [ ] **Step 1: Edit constants and threshold**

In `game/PublicRoomManager.js`:

```js
// Line 5-6: BEFORE
const PUBLIC_ROOM_COUNT = 5;
const STAGGER_MS = 90_000; // 90s between room starts

// AFTER
const PUBLIC_ROOM_COUNT = 1;
```

Delete the `STAGGER_MS` line entirely (unused with 1 room).

```js
// Line 28: BEFORE
setTimeout(() => room.startSession(), i * STAGGER_MS);

// AFTER
setTimeout(() => room.startSession(), 0);
```

```js
// Line 41: BEFORE
if (t <= 120_000) continue;

// AFTER
if (t <= 240_000) continue;  // 4 minutes minimum
```

- [ ] **Step 2: Commit**
```bash
git add game/PublicRoomManager.js
git commit -m "feat: 1 public room only, 4-min join threshold"
```

**Checkpoint 2 ✅** — Kiểm tra server log chỉ tạo 1 phòng public. Vào game thử join public room.

---

## Task 3: Skin Heads — Custom Icons (No Circle, No Eyes)

**Files:**
- Modify: `public/index.html` (head draw block ~lines 1450–1482)
- Modify: `public/skins.js` (all `drawHead` functions)

### Step 3a: Update draw loop in index.html

- [ ] **Step 1: Replace head + eyes block**

Find the comment `// Head` at line ~1450 in `public/index.html`. Replace the entire block from `// Head` through `skin.drawHead(...)` with:

```js
  // Head
  const angle = p.a || 0;
  if (!skin || skin.id === 'default') {
    // Default: plain circle, no eyes
    ctx.beginPath();
    ctx.arc(sx, sy, r, 0, Math.PI * 2);
    ctx.fillStyle = bodyColor;
    ctx.fill();
  } else {
    // Custom skin: icon replaces circle+eyes entirely
    skin.drawHead(ctx, sx, sy, r, angle);
  }

  // Body marks
  if (skin && segs.length > 2) {
    for (let i = 2; i < segs.length; i += 3) {
      const bx = segs[i][0] - camX, by = segs[i][1] - camY;
      if (bx < -20 || bx > W + 20 || by < -20 || by > H + 20) continue;
      skin.drawBodyMark(ctx, bx, by, r * 0.38);
    }
  }
```

The old block to replace (lines 1450–1482):
```js
  // Head
  ctx.beginPath();
  ctx.arc(sx, sy, r, 0, Math.PI*2);
  ctx.fillStyle = bodyColor;
  ctx.fill();

  // Eyes
  const angle = p.a || 0;
  const fwdX  = Math.cos(angle), fwdY = Math.sin(angle);
  const perpX = -fwdY, perpY = fwdX;
  const eyeR  = r * 0.22;
  const pupR  = eyeR * 0.55;

  for (const s of [-1, 1]) {
    const ex = sx + fwdX * r * 0.35 + perpX * r * 0.55 * s;
    const ey = sy + fwdY * r * 0.35 + perpY * r * 0.55 * s;
    ctx.beginPath(); ctx.arc(ex, ey, eyeR, 0, Math.PI*2);
    ctx.fillStyle = 'rgba(0,0,0,0.9)'; ctx.fill();
    ctx.beginPath(); ctx.arc(ex - eyeR*0.3, ey - eyeR*0.3, pupR, 0, Math.PI*2);
    ctx.fillStyle = '#fff'; ctx.fill();
  }

  // Skin decorations
  if (skin) {
    skin.drawHead(ctx, sx, sy, r, angle);
    if (segs.length > 2) {
      for (let i = 2; i < segs.length; i += 3) {
        const bx = segs[i][0] - camX, by = segs[i][1] - camY;
        if (bx < -20 || bx > W + 20 || by < -20 || by > H + 20) continue;
        skin.drawBodyMark(ctx, bx, by, r * 0.38);
      }
    }
  }
```

### Step 3b: Rewrite all drawHead functions in skins.js

- [ ] **Step 2: Replace entire `public/skins.js`** with the following (all drawHead scaled to r, rotate with angle):

```js
'use strict';
/* global window */

window.SKINS = [
  {
    id: 'default', name: 'Default', color: null,
    drawHead(_ctx, _x, _y, _r, _a) {},
    drawBodyMark(_ctx, _x, _y, _r) {},
  },
  {
    id: 'snowflake', name: 'Snowflake', color: '#93C5FD',
    drawHead(ctx, x, y, r, a) {
      const s = r;
      ctx.save(); ctx.translate(x, y); ctx.rotate(a);
      ctx.strokeStyle = 'rgba(255,255,255,0.92)'; ctx.lineWidth = 2.5;
      for (let i = 0; i < 6; i++) {
        ctx.save(); ctx.rotate((i * Math.PI) / 3);
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -s); ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, -s * 0.55); ctx.lineTo(s * 0.25, -s * 0.75);
        ctx.moveTo(0, -s * 0.55); ctx.lineTo(-s * 0.25, -s * 0.75);
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
    drawHead(ctx, x, y, r, a) {
      const s = r * 1.1;
      ctx.save(); ctx.translate(x, y); ctx.rotate(a);
      ctx.beginPath();
      ctx.moveTo(0, s * 0.5);
      ctx.bezierCurveTo(-s * 0.6, s * 0.1, -s * 0.5, -s * 0.6, 0, -s);
      ctx.bezierCurveTo(s * 0.5, -s * 0.6, s * 0.6, s * 0.1, 0, s * 0.5);
      ctx.fillStyle = '#F97316'; ctx.fill();
      ctx.beginPath();
      ctx.moveTo(0, s * 0.2);
      ctx.bezierCurveTo(-s * 0.3, -s * 0.1, -s * 0.2, -s * 0.55, 0, -s * 0.72);
      ctx.bezierCurveTo(s * 0.3, -s * 0.55, s * 0.3, -s * 0.1, 0, s * 0.2);
      ctx.fillStyle = 'rgba(255,220,60,0.92)'; ctx.fill();
      ctx.restore();
    },
    drawBodyMark(ctx, x, y, r) {
      ctx.beginPath(); ctx.arc(x, y, Math.max(1.5, r * 0.3), 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,210,60,0.55)'; ctx.fill();
    },
  },
  {
    id: 'neon', name: 'Neon', color: '#A855F7',
    drawHead(ctx, x, y, r, a) {
      const s = r;
      ctx.save(); ctx.translate(x, y); ctx.rotate(a);
      ctx.strokeStyle = 'rgba(240,240,80,0.95)';
      ctx.lineWidth = 3; ctx.shadowColor = 'rgba(240,240,80,0.8)'; ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.moveTo(s * 0.3, -s); ctx.lineTo(-s * 0.15, -s * 0.08);
      ctx.lineTo(s * 0.2, -s * 0.08); ctx.lineTo(-s * 0.3, s);
      ctx.stroke(); ctx.shadowBlur = 0; ctx.restore();
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
    drawHead(ctx, x, y, r, a) {
      const s = r;
      ctx.save(); ctx.translate(x, y); ctx.rotate(a);
      for (let i = 0; i < 5; i++) {
        ctx.save(); ctx.rotate((i * 2 * Math.PI) / 5 - Math.PI / 2);
        ctx.beginPath(); ctx.ellipse(0, -s * 0.55, s * 0.28, s * 0.42, 0, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,190,215,0.92)'; ctx.fill(); ctx.restore();
      }
      ctx.beginPath(); ctx.arc(0, 0, s * 0.22, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,230,100,0.95)'; ctx.fill();
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
    drawHead(ctx, x, y, r, a) {
      const s = r;
      ctx.save(); ctx.translate(x, y); ctx.rotate(a);
      ctx.strokeStyle = 'rgba(0,255,255,0.92)'; ctx.lineWidth = 2.5;
      ctx.shadowColor = 'rgba(0,255,255,0.7)'; ctx.shadowBlur = 10;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const ang = (i * Math.PI) / 3 - Math.PI / 6;
        i === 0 ? ctx.moveTo(Math.cos(ang) * s, Math.sin(ang) * s)
                : ctx.lineTo(Math.cos(ang) * s, Math.sin(ang) * s);
      }
      ctx.closePath(); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, s * 0.2, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0,255,255,0.9)'; ctx.fill();
      ctx.shadowBlur = 0; ctx.restore();
    },
    drawBodyMark(ctx, x, y, r) {
      const s = Math.max(1.5, r * 0.28);
      ctx.fillStyle = 'rgba(0,255,255,0.35)';
      ctx.fillRect(x - s, y - s, s * 2, s * 2);
    },
  },
  {
    id: 'venom', name: 'Venom', color: '#7C3AED',
    drawHead(ctx, x, y, r, a) {
      const s = r;
      ctx.save(); ctx.translate(x, y); ctx.rotate(a);
      // Skull dome
      ctx.beginPath(); ctx.arc(0, -s * 0.08, s * 0.72, Math.PI, 0);
      ctx.lineTo(s * 0.52, s * 0.32); ctx.lineTo(-s * 0.52, s * 0.32);
      ctx.closePath();
      ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.fill();
      // Eye sockets
      for (const dx of [-s * 0.26, s * 0.26]) {
        ctx.beginPath(); ctx.arc(dx, -s * 0.18, s * 0.18, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(60,0,100,0.95)'; ctx.fill();
      }
      // Nose hole
      ctx.beginPath(); ctx.arc(0, s * 0.05, s * 0.09, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(60,0,100,0.75)'; ctx.fill();
      // Teeth
      ctx.fillStyle = 'rgba(60,0,100,0.82)';
      for (let i = -1; i <= 1; i++) {
        ctx.fillRect(i * s * 0.33 - s * 0.09, s * 0.2, s * 0.18, s * 0.27);
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
    drawHead(ctx, x, y, r, a) {
      const s = r;
      ctx.save(); ctx.translate(x, y); ctx.rotate(a);
      ctx.strokeStyle = 'rgba(255,255,255,0.88)'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(-s, 0);
      for (let i = 0; i <= 12; i++) {
        const wx = -s + (i / 12) * s * 2;
        const wy = Math.sin(i * Math.PI * 0.75) * s * 0.5;
        ctx.lineTo(wx, wy);
      }
      ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-s, s * 0.38);
      for (let i = 0; i <= 12; i++) {
        const wx = -s + (i / 12) * s * 2;
        const wy = s * 0.38 + Math.sin(i * Math.PI * 0.75 + Math.PI * 0.5) * s * 0.3;
        ctx.lineTo(wx, wy);
      }
      ctx.stroke(); ctx.restore();
    },
    drawBodyMark(ctx, x, y, r) {
      const s = Math.max(1.5, r * 0.3);
      ctx.beginPath(); ctx.arc(x, y, s, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,255,255,0.28)'; ctx.lineWidth = 1; ctx.stroke();
    },
  },
  {
    id: 'galaxy', name: 'Galaxy', color: '#6366F1',
    drawHead(ctx, x, y, r, a) {
      const s = r;
      ctx.save(); ctx.translate(x, y); ctx.rotate(a);
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const ang = (i * Math.PI) / 5 - Math.PI / 2;
        const len = i % 2 === 0 ? s : s * 0.4;
        const px = Math.cos(ang) * len, py = Math.sin(ang) * len;
        i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fillStyle = 'rgba(255,255,200,0.92)';
      ctx.shadowColor = 'rgba(255,255,200,0.8)'; ctx.shadowBlur = 12;
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
    drawHead(ctx, x, y, r, a) {
      const s = r;
      ctx.save(); ctx.translate(x, y); ctx.rotate(a);
      ctx.beginPath();
      ctx.moveTo(-s * 0.85, s * 0.4); ctx.lineTo(-s * 0.85, -s * 0.05);
      ctx.lineTo(-s * 0.55, -s * 0.72);
      ctx.lineTo(-s * 0.22, -s * 0.15);
      ctx.lineTo(0, -s);
      ctx.lineTo(s * 0.22, -s * 0.15);
      ctx.lineTo(s * 0.55, -s * 0.72);
      ctx.lineTo(s * 0.85, -s * 0.05);
      ctx.lineTo(s * 0.85, s * 0.4);
      ctx.closePath();
      ctx.fillStyle = 'rgba(255,215,50,0.92)'; ctx.fill();
      ctx.strokeStyle = 'rgba(200,140,0,0.7)'; ctx.lineWidth = 1.5; ctx.stroke();
      for (const [gx, gy] of [[0, -s * 0.1], [-s * 0.52, s * 0.12], [s * 0.52, s * 0.12]]) {
        ctx.beginPath(); ctx.arc(gx, gy, s * 0.1, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,80,80,0.88)'; ctx.fill();
      }
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

- [ ] **Step 3: Commit**
```bash
git add public/index.html public/skins.js
git commit -m "feat: custom icon heads for all skins, no circle/eyes"
```

**Checkpoint 3 ✅** — Mở game, equip từng skin, kiểm tra:
- Default: vòng tròn đơn giản (không mắt)
- Snowflake: bông tuyết 6 cánh
- Fire: ngọn lửa hai màu
- Neon: tia sét vàng phát sáng
- Sakura: hoa 5 cánh + nhụy vàng
- Cyber: hexagon cyan phát sáng
- Venom: đầu lâu trắng
- Ocean: sóng nước 2 lớp
- Galaxy: ngôi sao 5 cánh phát sáng
- Gold: vương miện vàng 3 đỉnh + đá đỏ

---

## Task 4: Animated Cyberpunk Background

**Files:**
- New: `public/bg.jpg` (Higgsfield generated)
- Modify: `public/index.html` (add bgCanvas + background image + animation script)

### Step 4a: Generate background image via Higgsfield

- [ ] **Step 1: Invoke Higgsfield**

Use the `higgsfield-generate` skill to generate:
> "Cyberpunk neon city grid background, dark black base, glowing cyan and magenta neon lines forming a perspective grid floor, purple atmospheric glow, subtle particle effects, 1920x1080, seamless loop frame, game background, no text, no characters, ultra wide"

Save result to `public/bg.jpg`.

### Step 4b: Wire up background in index.html

- [ ] **Step 2: Add body background CSS**

Find the `<style>` block in `public/index.html`. Add to `body` rule:
```css
body {
  /* existing rules... */
  background-image: url('bg.jpg');
  background-size: cover;
  background-position: center;
  background-attachment: fixed;
}
```

- [ ] **Step 3: Add bgCanvas element**

Find the main `<canvas id="c"` element. Add a bgCanvas BEFORE it:
```html
<canvas id="bgCanvas" style="position:fixed;top:0;left:0;width:100%;height:100%;z-index:0;pointer-events:none;"></canvas>
```

Ensure the game canvas has `z-index:1` in its style (check current styles and update if needed).

- [ ] **Step 4: Add background snake animation script**

Add this `<script>` block just before `</body>`:
```html
<script>
(function () {
  const bgCanvas = document.getElementById('bgCanvas');
  const bgCtx = bgCanvas.getContext('2d');

  function resize() {
    bgCanvas.width = window.innerWidth;
    bgCanvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener('resize', resize);

  const COLORS = ['#00FFFF', '#FF00FF', '#39FF14', '#BF00FF', '#FF6600'];
  const NUM_SEGS = 28;

  const snakes = COLORS.map((color, i) => {
    const x = Math.random() * window.innerWidth;
    const y = Math.random() * window.innerHeight;
    const angle = Math.random() * Math.PI * 2;
    const segs = [];
    for (let j = 0; j < NUM_SEGS; j++) {
      segs.push({ x: x - Math.cos(angle) * j * 9, y: y - Math.sin(angle) * j * 9 });
    }
    return { x, y, angle, turnRate: (Math.random() - 0.5) * 0.04,
             speed: 1.2 + Math.random() * 0.8, color, r: 6 + i * 1.5, segs };
  });

  function tick() {
    const W = bgCanvas.width, H = bgCanvas.height;
    bgCtx.clearRect(0, 0, W, H);

    for (const sn of snakes) {
      sn.turnRate += (Math.random() - 0.5) * 0.008;
      sn.turnRate = Math.max(-0.055, Math.min(0.055, sn.turnRate));
      sn.angle += sn.turnRate;
      sn.x += Math.cos(sn.angle) * sn.speed;
      sn.y += Math.sin(sn.angle) * sn.speed;
      if (sn.x < -60) sn.x = W + 60;
      if (sn.x > W + 60) sn.x = -60;
      if (sn.y < -60) sn.y = H + 60;
      if (sn.y > H + 60) sn.y = -60;

      sn.segs.unshift({ x: sn.x, y: sn.y });
      if (sn.segs.length > NUM_SEGS) sn.segs.length = NUM_SEGS;

      if (sn.segs.length < 2) continue;
      bgCtx.beginPath();
      bgCtx.moveTo(sn.segs[0].x, sn.segs[0].y);
      for (let i = 1; i < sn.segs.length; i++) bgCtx.lineTo(sn.segs[i].x, sn.segs[i].y);
      bgCtx.lineCap = 'round';
      bgCtx.lineJoin = 'round';
      bgCtx.lineWidth = sn.r * 2;
      bgCtx.strokeStyle = sn.color + '44';
      bgCtx.shadowColor = sn.color;
      bgCtx.shadowBlur = 14;
      bgCtx.stroke();
      bgCtx.shadowBlur = 0;
    }

    requestAnimationFrame(tick);
  }

  tick();
})();
</script>
```

- [ ] **Step 5: Make game canvas transparent**

Find `<canvas id="c"` in index.html. Ensure its CSS has `background: transparent` (remove any `background-color` set on canvas element or in CSS for `#c`).

- [ ] **Step 6: Commit**
```bash
git add public/index.html public/bg.jpg
git commit -m "feat: cyberpunk neon background + animated snake layer"
```

**Checkpoint 4 ✅** — Mở game kiểm tra:
- Nền cyberpunk neon hiện ra phía sau
- 5 con rắn neon màu sắc khác nhau chạy quanh màn hình
- Game canvas trong suốt, gameplay không bị ảnh hưởng
- Performance ổn (không lag khi chơi)

---

## Deploy

```bash
pscp -pw PASSWORD -r game ritual server.js public root@168.144.142.150:/root/snake-game/
plink -ssh -pw PASSWORD root@168.144.142.150 "cd /root/snake-game && npm install && pm2 restart snake-game"
```
