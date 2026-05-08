'use strict';

const GameRoom = require('./GameRoom');

const PUBLIC_ROOM_COUNT = 5;

class PublicRoomManager {
  /**
   * @param {object} opts
   * @param {Function} opts.onElimination  - (roomId, playerId, stats) → void
   * @param {Function} opts.onSessionEnd   - (roomId, results) → void
   */
  constructor(opts = {}) {
    this.rooms = new Map();
    this._onElimination = opts.onElimination || null;
    this._onSessionEnd  = opts.onSessionEnd  || null;
    this._init();
  }

  _init() {
    for (let i = 1; i <= PUBLIC_ROOM_COUNT; i++) {
      const id = `pub_${i}`;
      const room = new GameRoom(id, 'public', {
        botCount:  5,
        respawn:   false,
        maxPlayers: 10,
        onElimination: this._onElimination,
        onSessionEnd:  this._onSessionEnd,
      });
      room.startSession();
      this.rooms.set(id, room);
    }
  }

  findOpenRoom() {
    for (const room of this.rooms.values()) {
      if (!room.isFull()) return room;
    }
    return null;
  }

  getRoomById(id) { return this.rooms.get(id) || null; }

  getRoomList() {
    return [...this.rooms.values()].map(r => ({
      id:          r.id,
      players:     r.humanCount(),
      maxPlayers:  r.maxPlayers,
      timeLeft:    r.timeRemaining(),
      sessionNum:  r.sessionNumber,
    }));
  }
}

module.exports = PublicRoomManager;
