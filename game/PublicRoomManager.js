'use strict';

const GameRoom = require('./GameRoom');

const PUBLIC_ROOM_COUNT = 1;

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
      setTimeout(() => room.startSession(), 0);
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
      if (t <= 240_000) continue;  // 4 minutes minimum
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
    return min === Infinity ? 60_000 : min + 12_000;
  }
}

module.exports = PublicRoomManager;
