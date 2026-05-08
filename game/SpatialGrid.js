'use strict';

class SpatialGrid {
  constructor(worldW, worldH, cellSize = 200) {
    this.cellSize = cellSize;
    this.cells = new Map();
  }

  _key(cx, cy) { return (cx << 16) | (cy & 0xFFFF); }

  insert(x, y, data) {
    const cx = Math.floor(x / this.cellSize);
    const cy = Math.floor(y / this.cellSize);
    const k = this._key(cx, cy);
    if (!this.cells.has(k)) this.cells.set(k, []);
    this.cells.get(k).push(data);
  }

  query(x, y, radius) {
    const results = [];
    const r = Math.ceil(radius / this.cellSize);
    const cx = Math.floor(x / this.cellSize);
    const cy = Math.floor(y / this.cellSize);
    for (let dx = -r; dx <= r; dx++) {
      for (let dy = -r; dy <= r; dy++) {
        const bucket = this.cells.get(this._key(cx + dx, cy + dy));
        if (bucket) for (const item of bucket) results.push(item);
      }
    }
    return results;
  }

  clear() { this.cells.clear(); }
}

module.exports = SpatialGrid;
