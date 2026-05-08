# Ritual Snake v2 — Feature Design Spec
**Date:** 2026-05-08  
**Status:** Approved

---

## Overview

7 feature groups for Ritual Snake v2. Covers game mechanics tuning, UX polish, in-game event feed, Ritual network status, public room queue system, skin market, NFT card for public matches, and chronicle system for private matches.

---

## Group 1: Quick Fixes

### 1a. Snake Growth Rate
**Files:** `game/GameRoom.js`

- `FOOD_GROWTH` → `[0.5, 0.83, 2.5]` (was `[0.2, 0.333, 1.0]`) — x2.5 length growth per food
- `R_MIN` → `20` (was `14`), `R_MAX` → `44` (was `32`) — ~40% larger body radius for x2 visual size
- `VISUAL_REF` unchanged at `150`

### 1b. Turn Speed –20%
**Files:** `game/GameRoom.js`

- `TURN` → `0.136` (was `0.17`)

### 1c. Remove HUD Room Label
**Files:** `public/index.html`

- Remove the `hud-room` element and its update in `handleMsg('ok')` — keep the game screen clean

### 1d. Ping Color Coding
**Files:** `public/index.html`

- `hud-ping` element text color set each frame:
  - `pingMs < 80` → `var(--green)`
  - `pingMs < 180` → `var(--gold)`
  - `pingMs >= 180` → `var(--red)`

---

## Group 2: In-Game Event Feed

### Server
**Files:** `game/GameRoom.js`

- In `_eliminatePlayer(id, p, killedBy)`: broadcast `{t:'kill_event', killer: killerName, victim: p.name, killedBy: killedByType}` to all players in room via `_broadcastAll()` in addition to the existing per-player `eliminated` message.
- `killedBy` types: `'wall'` (hit boundary), player name (killed by player), `'bot'` (killed by bot)

### Client
**Files:** `public/index.html`

- `eventFeed = []` — array of `{text, color, ts}` objects, max 8 entries
- On `kill_event` message: push entry, prune entries older than 5000ms
- Rendered in `render()` as overlay panel: bottom-left of canvas, stacked vertically
- Style: monospace 11px, semi-transparent background pill per line
- Colors: kills by player = `var(--pink)`, kills by wall/bot = `var(--g4)`
- Format: `● {victim} eliminated by {killer}`; own kills: `★ You eliminated {victim}`

---

## Group 3: Ritual Network Status Badge

**Files:** `public/index.html`

### Logic
- On lobby load and every 30s: send `eth_blockNumber` JSON-RPC call to `https://rpc.ritualfoundation.org`
- Measure response time:
  - <2000ms → **Active** (green `var(--green)`)
  - 2000–5000ms → **Congested** (yellow `var(--gold)`)
  - timeout (>5000ms) or error → **Error** (red `var(--red)`)
- Badge element added to `.l-nav-right` in lobby: `<div id="ritual-status-badge">● Ritual · Active</div>`

### Styling
- Same pill style as existing wallet badge: border, rounded, monospace font
- Dot color matches status; text: `Ritual · Active` / `Ritual · Congested` / `Ritual · Error`

---

## Group 4: Public Room Queue System

### PublicRoomManager
**Files:** `game/PublicRoomManager.js`

#### Staggered starts
- In `_init()`: each room starts with offset `i * 90_000ms` delay so the 5 rooms are spread across 7.5 minutes
- Room 1 starts immediately, room 2 starts +90s, room 3 +180s, etc.

#### Smart room selection
- `findOpenRoom()` new logic:
  1. Filter rooms: not full AND `timeRemaining() > 120_000` (>2 min left)
  2. Among qualifying rooms: pick the one with the **highest** `timeRemaining()` (most time left)
  3. If none qualify → return `null` (player goes to queue)

#### Queue
- `this._queue = []` — array of `{ws, name, skin}` objects
- `addToQueue(ws, name, skin)` — push to queue, send `{t:'queued', position, nextRoomIn}` message
- On room reset/start: `_drainQueue()` — dequeue up to (maxPlayers - currentPlayers) entries, call `room.addPlayer()` for each
- Queue position updates: broadcast `{t:'queue_update', position, nextRoomIn}` to all queued players every 10s

### Server
**Files:** `server.js`

- `join_public` handler: try `findOpenRoom()` first; if null → `addToQueue()`

### Client
**Files:** `public/index.html`

- New screen `#screen-queue` — terminal style:
```
ritual-snake ~ queue --waiting

  You are #3 in queue
  Next session opens in  2:34

  [Cancel]
```
- On `queued` message → show `#screen-queue`
- On `queue_update` → update position and countdown
- On `ok` → hide queue screen, proceed to game as normal
- Cancel button → send `leave_queue`, back to lobby

---

## Group 5: Skin Market

### Skin Definitions
**Files:** `public/skins.js` (new file, included via `<script>`)

Each skin object:
```js
{
  id: 'snowflake',
  name: 'Snowflake',
  color: '#7DD3FC',     // base body color
  drawHead(ctx, x, y, r, angle) { ... },   // draws pattern on top of head circle
  drawBodyMark(ctx, x, y, r, idx) { ... }  // draws small mark at body segment position
}
```

10 skins: `default`, `snowflake`, `fire`, `neon`, `sakura`, `cyber`, `venom`, `ocean`, `galaxy`, `gold`

**Default skin** = current behavior (solid color, no extra marks). All other skins add decorative canvas drawing on top.

### Skin Storage
- `getSkin(walletAddress)` → `localStorage['skin_' + walletAddress] || 'default'`
- `setSkin(walletAddress, skinId)` → `localStorage['skin_' + walletAddress] = skinId`
- If no wallet connected → always `default`

### Skin Market UI
- Button "◆ Skins" in `.l-nav-right` on lobby — opens skin market modal overlay
- Modal: `#skin-market-modal` — full-screen semi-transparent overlay
- Grid 2×5, each card:
  - Mini canvas (120×80px) with animated snake preview using that skin
  - Skin name
  - "Equipped" badge if currently selected
  - Click to select (instant, saves to localStorage)
- Close button top-right

### Protocol
- Skin ID sent with join: `{t:'join_public', n: name, skin: skinId}`
- Server passes skin in `_payload()` as `sk` field
- Client renderer calls `skin.drawHead()` and `skin.drawBodyMark()` after base body draw

### Rendering
**Files:** `public/index.html` — `drawSnake()`

- Look up skin by `p.sk` (or `'default'`)
- After drawing base body/head: call `skin.drawHead(ctx, sx, sy, r, angle)`
- For each rendered body segment at `(bx, by)`: call `skin.drawBodyMark(ctx, bx, by, r*0.35, i)` at ~every 3rd segment (performance)

---

## Group 6: NFT Card (Public Match)

### When shown
- After `eliminated` message in public room → replace `#screen-eliminated` with `#screen-nft-card`
- After `session_end` in public room → replace `#screen-results` with `#screen-nft-card` (for the current player only, showing their own stats)

### Card Design
**Files:** `public/index.html` — new `#screen-nft-card` screen

Matches screenshot: dark card with colored border, rank badge top-right, snake portrait canvas center-left, three stat boxes (Score / Length / Kills), epitaph quote, session metadata row, token ID footer.

- Snake portrait: `<canvas id="nft-portrait" width="180" height="200">` — renders the player's snake coiled using their skin + color
- Rank badge: gold (#1), silver (#2), bronze (#3), gray (other)
- Epitaph: randomly selected from a fixed pool of 8 phrases (no Ritual LLM call — keeps it instant):
  `"They fought with everything they had. The grid took note."`,
  `"The arena remembers those who dared."`,
  `"Speed was their weapon. The wall, their end."`,
  `"Not all snakes survive. This one left a mark."`,
  `"The longest shadow on the grid."`,
  `"Born of chaos. Returned to it."`,
  `"Every score tells a story. This one ends here."`,
  `"The grid is undefeated. But they came close."`
- Session info: date, room, player count, "Ritual Chain 1979"
- Token ID: `RITUAL-SNAKE-{7-digit random}` generated client-side on screen show

### Buttons
- **Mint as NFT** — calls `ChronicleNFT.mint()` via ethers.js. If wallet not connected → trigger wallet connect first, then proceed. Shows loading state during tx. On success: shows "Minted!" + tx hash.
- **Share on X** — opens `https://x.com/intent/tweet?text=...` with stats. No wallet needed.
- After mint completes OR user clicks Share → show "Back to Lobby" button

---

## Group 7: Chronicle (Private Match)

### Server — Event Tracking
**Files:** `game/GameRoom.js`

- `this._chronicleEvents = []` — reset on each session start
- Push events during session:
  - `session_start`: `{time:0, type:'session_start', detail: 'N players registered · Xmin session'}`
  - On kill: `{time, type:'kill'|'eliminated', killer, victim, score}`
  - Milestone: when a player's `targetLen` crosses 50/100/200 → `{time, type:'milestone', name, length}`
  - `session_end`: `{time, type:'session_end', detail: 'winner · final score'}`
- Time field = `Math.floor((Date.now() - sessionStartTime) / 1000)` → format `MM:SS`
- On `session_end`: include `chronicleEvents` in the `session_end` broadcast for private rooms only

### Client — Chronicle Screen
**Files:** `public/index.html`

New screen `#screen-chronicle` shown instead of `#screen-results` for private rooms:

```
ritual-snake ~ chronicle --room {roomId} --log

# — Match Event Log ———————————————
# Room {roomId} · Private · Xmin session

TIME   EVENT        DETAIL
—————————————————————————————————————
00:00  session_start  7 players · 10min session
00:23  eliminated     ghost_nn killed by BOT_Apex · score: 890
03:10  kill ★         NHEO killed w0rmhole · score: 2,100
09:48  session_end    BOT_Apex survivor · final score: 12,840

$ ritual chronicle commit --room {roomId} --onchain
```

- Footer: 30s countdown `Auto-committing in 0:30...`
- **Chronicle Committed** button → calls `ritual/tournamentChronicle.js` via server endpoint `POST /api/chronicle` (graceful fallback: if viem not installed, endpoint returns `{ok:false, fallback:true}` and button still shows `✓ Chronicle Committed` with a "(simulated)" note). On real success: shows tx hash link.
- **Skip** button (small, top-right) → confirm popup: `"Are you sure? Chronicle will be lost"` → [Confirm / Cancel]. Confirm → back to lobby.
- After 30s auto-commit → show `✓ Chronicle Committed`, then **New Session** and **Back to Lobby** buttons appear.

---

## Data Flow Summary

```
GameRoom._eliminatePlayer()
  → ws.send('eliminated')          [to dead player only]
  → _broadcastAll('kill_event')    [to all players]
  → _chronicleEvents.push()        [private only]

GameRoom._endSession()
  → _broadcastAll('session_end', { ..., chronicleEvents })  [private includes events]

Client public:
  'eliminated' → #screen-nft-card
  'session_end' → #screen-nft-card

Client private:
  'session_end' → #screen-chronicle
```

---

## Files Changed

| File | Changes |
|------|---------|
| `game/GameRoom.js` | Growth constants, TURN, kill_event broadcast, chronicle event tracking, session_end payload |
| `game/PublicRoomManager.js` | Staggered starts, smart room selection, queue system |
| `server.js` | join_public → queue fallback, leave_queue handler |
| `public/index.html` | Ping color, remove hud-room, event feed, queue screen, nft-card screen, chronicle screen, ritual status badge, skin market modal, drawSnake() skin calls |
| `public/skins.js` | New file — 10 skin definitions |
