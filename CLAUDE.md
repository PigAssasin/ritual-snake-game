# Ritual Snake — CLAUDE.md

## Project Overview
Multiplayer Snake.io game with Ritual Chain integration. Players compete in rooms, deaths generate AI-written NFT chronicles via Ritual precompiles.

**Live:** http://168.144.142.150:3000

## Tech Stack
- **Server:** Node.js + ws (WebSocket), no framework
- **Client:** Single-file vanilla JS + Canvas (`public/index.html`)
- **Contracts:** Solidity 0.8.20 + Hardhat, deploy target = Ritual Chain (Chain ID 1979)
- **Ritual AI:** viem + ethers.js v6 for precompile calls

## Repository Structure
```
server.js                    — WebSocket server, room manager, delegates to game/
public/index.html            — Full game client (Canvas + wallet connect + lobby UI)
public/skins.js              — 10 skin definitions with custom drawHead() icons per skin
public/bg.jpg                — Ritual-brand lobby background (Higgsfield generated)
game/
  GameRoom.js                — Self-contained game instance (tick loop, bots, food, collision)
  PublicRoomManager.js       — 1 persistent public room, auto-assigns players
  SpatialGrid.js             — O(1) spatial hash for collision + food pickup
ritual/
  deathChronicle.js          — Ritual LLM (0x0802) epitaph + Image (0x0818) portrait → NFT
  tournamentChronicle.js     — Ritual Sovereign Agent (0x080C) match narrative → onchain
contracts/
  SnakeGame.sol              — Score storage + session results + chronicle text onchain
  ChronicleNFT.sol           — ERC-721, fully onchain metadata (epitaph + portrait base64)
scripts/
  deploy.js                  — Deploys SnakeGame + ChronicleNFT, prints addresses
hardhat.config.js            — Ritual testnet config (chainId 1979)
.env.example                 — Template: PRIVATE_KEY, RITUAL_RPC_URL, CONTRACT_ADDRESS
```

## VPS Deploy
```bash
# Upload changed files (examples)
pscp -pw PASSWORD "public/index.html" root@168.144.142.150:/root/snake-game/public/
pscp -pw PASSWORD "public/skins.js"   root@168.144.142.150:/root/snake-game/public/
pscp -pw PASSWORD "game/GameRoom.js"  root@168.144.142.150:/root/snake-game/game/
pscp -pw PASSWORD -r game             root@168.144.142.150:/root/snake-game/

# Restart
plink -ssh -pw PASSWORD root@168.144.142.150 "pm2 restart snake-game"
```
- VPS: 168.144.142.150 (DigitalOcean Singapore)
- PM2 process: `snake-game` (id 0), path `/root/snake-game/`
- Bot project at `/root/axisbot/` — do NOT touch

## Game Config (server constants)
```
W = H = 8000          — world size
TICK = 33ms           — 30Hz game loop
SPEED = 5.6           — base movement speed
BOOST_SPEED = ×1.5    — 2s duration, 5s cooldown
FOOD_N = 1400         — target food count on map
FOOD_GROWTH = [1.2, 1.66, 5.0]  — length gain per food type (common/medium/rare)
BOT_COUNT = 5 (public) / 0 (private)
SESSION_MS = 7min     — public room session duration
VIEW_W/H = 1600/1100  — per-client viewport culling
```

### Snake Size Formula (GameRoom.js + client)
```js
// Hyperbolic: grows fast early, asymptotic toward R_MAX
R_MIN = 12, R_MAX = 44, WIDTH_K = 200
segR(tlen) = R_MIN + (R_MAX - R_MIN) * s / (s + WIDTH_K)
// where s = tlen - INIT_LEN (INIT_LEN = 55)
```
| Length gained | Width % of max |
|--------------|---------------|
| ~10 food     | ~9%           |
| ~50 food     | ~33%          |
| ~150 food    | ~55%          |
| ~350 food    | ~74%          |

## Room System
| Mode | Respawn | Max Players | Bots | Session | Min join time |
|------|---------|-------------|------|---------|--------------|
| Public | No (elimination) | 10/room × 1 room | 5 | 7 min, auto-reset | ≥4 min left |
| Private | Yes | 30 | 0 | 7 min, 1 judge slot | — |

**WS message types (client → server):**
- `join_public` — join first available public room
- `create_private` — create private room with password
- `join_private` — join by roomId + password (role:'judge' for spectator)
- `get_rooms` — fetch public room list for lobby
- `a` — send angle (mouse direction)
- `boost` — activate boost

**WS message types (server → client):**
- `ok` — joined, contains `id`, `roomId`, `mode`
- `s` — game state tick: `{p, f, lb, timeLeft}`
- `eliminated` — public room permanent death
- `session_end` — session over, contains `results`, `winner`
- `room_created` — private room created, contains `roomId`, `pass`
- `chronicle_ready` — Ritual LLM epitaph ready
- `tournament_chronicle` — Ritual Agent narrative ready

## Ritual Chain
```
Chain ID:  1979
RPC:       https://rpc.ritualfoundation.org
Explorer:  https://explorer.ritualfoundation.org

Precompiles:
  LLM:            0x0000000000000000000000000000000000000802
  Image:          0x0000000000000000000000000000000000000818
  Sovereign Agent: 0x000000000000000000000000000000000000080C

Infrastructure:
  RitualWallet:         0x532F0dF0896F353d8C3DD8cc134e8129DA2a3948
  TEEServiceRegistry:   0x9644e8562cE0Fe12b4deeC4163c064A8862Bf47F
  SovereignAgentFactory: 0x9dC4C054e53bCc4Ce0A0Ff09E890A7a8e817f304
  AsyncJobTracker:      0xC069FFCa0389f44eCA2C626e55491b0ab045AEF5
```

## Deploy Contracts (Sprint 2)
```bash
# 1. Fill .env (copy from .env.example)
# 2. Get testnet RITUAL from faucet
npm install --save-dev hardhat @nomicfoundation/hardhat-toolbox @openzeppelin/contracts dotenv viem
npx hardhat run scripts/deploy.js --network ritual
# 3. Paste CONTRACT_ADDRESS + CHRONICLE_NFT_ADDRESS into .env and public/index.html
```

## Skin System (public/skins.js)
- 10 skins: default, snowflake, fire, neon, sakura, cyber, venom, ocean, galaxy, gold
- Each skin has `drawHead(ctx, x, y, r, a)` — draws a **custom icon** replacing the default circle+eyes
- Default skin = plain circle (no eyes); all other skins = unique canvas-drawn icon (rotates with snake direction)
- `drawBodyMark(ctx, x, y, r)` — optional body decoration drawn every 3rd segment
- Draw loop in `index.html`: if `skin.id !== 'default'`, skip circle+eyes and call `skin.drawHead()` directly

## Lobby UI (public/index.html)
- **Background canvas** (`#lobbyCanvas`): 2 animated neon snakes (green #19D184 + lime #BFF000) with grid background
  - Snake 1: 320 segments (long), Snake 2: 160 segments
  - Snakes avoid each other when within 200px
  - Grid: 72px cells, rgba(255,255,255,0.035)
- **? button** bottom-right: CSS hover tooltip with contact info (X/Telegram/Discord)
- **"Made by nheoweb3"** tag bottom-left
- Game canvas (`#cvs`) is z-index 1; lobby canvas is z-index 0

## Key Implementation Notes
- **Ritual AI is optional:** ritual/ requires `viem` + `ethers`. Server gracefully falls back if not installed.
- **Sender lock:** Ritual allows only 1 async precompile tx per EOA at a time. deathChronicle.js handles this by chaining LLM → Image → mint sequentially.
- **Segment thinning:** Server sends every Nth segment (step = floor(R/SPEED)) — ~80% bandwidth reduction. Client renders with same step formula to ensure circles overlap.
- **Spatial grid:** Cell size 200 on 8000×8000 = 40×40 = 1600 cells. Food + body collision rebuilt each tick from scratch (clear + insert).
- **Viewport culling:** Each client only receives players/food within VIEW_W×VIEW_H of their camera center.
- **Judge slot:** Private rooms have 1 judge WebSocket — receives unculled full-map state.
- **Client extrapolation:** Own snake uses mouseAngle for instant response; others use server angle. Both extrapolate position = head + angle * speed * (timeSinceLastTick/TICK_MS).
- **Public room join guard:** `findBestRoom()` skips rooms with < 240s (4 min) remaining — players queue and wait for next reset.
