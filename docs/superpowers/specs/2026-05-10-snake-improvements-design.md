# Snake Game Improvements — Design Spec
**Date:** 2026-05-10

## Overview
Four independent improvements to Ritual Snake: growth mechanics, public room config, skin head rendering, and animated background.

---

## 1. Growth Mechanics

**Goal:** Snake grows longer faster but gets fatter slower, rewarding skilled players with impressive length without overwhelming screen width.

**Changes in `game/GameRoom.js`:**
- `FOOD_GROWTH`: `[0.5, 0.83, 2.5]` → `[1.0, 1.66, 5.0]` (2× length gain per food)
- `VISUAL_REF`: `150` → `215` (radius reaches max 30% slower)

**Result:** Same food eaten = 2× longer snake, but snake width at any given length is ~30% smaller than before. R_MIN/R_MAX unchanged (20–44px), just takes more length to get there.

---

## 2. Public Room Config

**Goal:** Reduce resource usage and prevent players joining nearly-expired sessions.

**Changes in `game/PublicRoomManager.js`:**
- `PUBLIC_ROOM_COUNT`: `5` → `1` (single room, server is low-traffic)
- `STAGGER_MS`: remove (irrelevant with 1 room)
- Minimum join threshold: `120_000` → `240_000` (4 minutes instead of 2)

**Behavior:** When the 1 public room has < 4 min left, new players queue and see a "Waiting for fresh room..." message. Queue drains on room reset.

---

## 3. Skin Head Rendering

**Goal:** Each skin has a unique head icon instead of the generic circle+eyes. Makes skins feel meaningfully different visually.

**Architecture:**
- In `public/index.html` draw loop, before drawing head: check if `skin.id === 'default'`
  - Default: draw plain circle (same color as body), no eyes
  - All others: skip circle + skip eyes, call `skin.drawHead()` at scale r×1.8 (larger than current decoration size)
- Each skin's `drawHead()` in `public/skins.js` upgraded to be full icon (standalone, not decoration on top)

**Icon mapping (all drawn with canvas paths, not emoji):**
| Skin | Icon | Style |
|------|------|-------|
| Default | ○ Plain circle | Snake color, no eyes |
| Snowflake | ❄️ 6-arm snowflake | White stroke, existing code scaled up |
| Fire | 🔥 Teardrop flame | Yellow/orange fill |
| Neon | ⚡ Lightning bolt | Yellow stroke + glow |
| Sakura | 🌸 5-petal flower | Pink petals |
| Cyber | 💠 Hexagon | Cyan stroke + glow |
| Venom | ☠️ Skull | White fill, dark eye sockets |
| Ocean | 🌊 Wave curl | Cyan stroke |
| Galaxy | ⭐ 5-point star | White fill + outer glow |
| Gold | 👑 Crown | Gold fill, 3 points |

**Note:** Icons rotate with snake direction (angle `a` param already passed to drawHead).

---

## 4. Animated Background

**Goal:** Visually rich background with cyberpunk neon aesthetic and animated snakes to make the lobby/game feel alive.

**Architecture — two layers:**

### Layer A: Static neon background image
- Generate via Higgsfield: cyberpunk neon grid, purple/cyan glow, dark base
- Saved to `public/bg.jpg`
- Applied as CSS `background-image` on `<body>` or behind canvas

### Layer B: Background canvas (snake animation)
- New `<canvas id="bgCanvas">` added before game canvas in DOM
- CSS: `position: fixed; top:0; left:0; z-index: 0`
- Game canvas: `z-index: 1; background: transparent`
- `bgCanvas` draws 5 simple neon snake shapes that:
  - Move autonomously with smooth sine-wave turning
  - Wrap around screen edges
  - Are drawn as thick stroked paths (neon glow via `shadowBlur`)
  - Colors: cyan `#00FFFF`, magenta `#FF00FF`, neon green `#39FF14`, purple `#BF00FF`, orange `#FF6600`
  - Semi-transparent so background image shows through
  - Update at 30fps via `requestAnimationFrame`

**Implementation file:** New `<script>` block in `public/index.html` (or separate `public/bg.js`)

**Performance:** bgCanvas snakes are simple polylines (~20 segments each), well within 60fps budget. No physics, just angle + speed integration.

---

## Files Changed

| File | Change |
|------|--------|
| `game/GameRoom.js` | FOOD_GROWTH, VISUAL_REF constants |
| `game/PublicRoomManager.js` | PUBLIC_ROOM_COUNT=1, threshold=240_000 |
| `public/skins.js` | Upgrade all drawHead() to full icons |
| `public/index.html` | Skip circle+eyes for non-default skins; add bgCanvas; load bg.jpg |
| `public/bg.jpg` | New — Higgsfield generated |

---

## Out of Scope
- Private room changes
- Bot behavior
- Mobile layout
- Wallet/NFT flows
