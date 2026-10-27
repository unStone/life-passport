import { crc32, keyBoard } from './codec.mjs';
export const COLS = 36, ROWS = 32, COUNT = COLS * ROWS;
export function checkCells(cells) {
  if (!(cells instanceof Uint8Array) || cells.length !== COUNT || cells.some(x => x > 1)) throw new Error('棋盘必须包含36×32个生死状态');
}
export function packCells(cells) {
  checkCells(cells); const bits = new Uint8Array(144);
  cells.forEach((alive, bit) => { bits[bit >> 3] |= alive << (bit & 7); });
  return bits;
}
export function unpackCells(bits) {
  if (!(bits instanceof Uint8Array) || bits.length !== 144) throw new Error('棋盘位图必须为144字节');
  return Uint8Array.from({ length: COUNT }, (_, bit) => (bits[bit >> 3] >> (bit & 7)) & 1);
}
export function boardInfo(cells) { return { population: cells.reduce((a, b) => a + b, 0), crc: crc32(packCells(cells)) }; }
export function stepCells(cells, wrap) {
  checkCells(cells); const result = new Uint8Array(COUNT);
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
    let neighbors = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      let nx = x + dx, ny = y + dy;
      if (wrap) { nx = (nx + COLS) % COLS; ny = (ny + ROWS) % ROWS; }
      if (nx >= 0 && nx < COLS && ny >= 0 && ny < ROWS) neighbors += cells[ny * COLS + nx];
    }
    result[y * COLS + x] = Number(neighbors === 3 || (neighbors === 2 && cells[y * COLS + x]));
  }
  return result;
}
export function loopPeriod(cells, wrap, limit = 256) {
  checkCells(cells);
  if (typeof wrap !== 'boolean' || !Number.isInteger(limit) || limit < 1 || limit > 256) throw new Error('循环验证的边界或代数无效');
  let current = cells;
  for (let period = 1; period <= limit; period++) {
    current = stepCells(current, wrap);
    if (current.every((cell, bit) => cell === cells[bit])) return period;
  }
  return null;
}
export class Editor {
  past = []; future = []; stroke = null; name = null; loopPeriods = null; wrap = true; interval = 200;
  constructor(cells = keyBoard('0000000001').cells, key = null) { checkCells(cells); this.origin(cells, key); this.cells = cells.slice(); this.key = key; }
  origin(cells, key) { if (key !== null && !keyBoard(key).cells.every((x, i) => x === cells[i])) throw new Error('世界码与棋盘内容不一致'); }
  snapshot() { return { cells: this.cells.slice(), key: this.key, name: this.name, loopPeriods: this.loopPeriods, wrap: this.wrap, interval: this.interval }; }
  remember(before) {
    if (this.wrap === before.wrap && this.interval === before.interval && this.cells.every((x, i) => x === before.cells[i])) { this.key = before.key; this.name = before.name; this.loopPeriods = before.loopPeriods; return false; }
    this.past.push(before); if (this.past.length > 100) this.past.shift(); this.future = []; return true;
  }
  begin() { if (this.stroke) throw new Error('上一笔尚未结束'); this.stroke = this.snapshot(); }
  line(x0, y0, x1, y1, alive) {
    if (!this.stroke || typeof alive !== 'boolean' || ![x0, x1].every(x => Number.isInteger(x) && x >= 0 && x < COLS) || ![y0, y1].every(y => Number.isInteger(y) && y >= 0 && y < ROWS)) throw new Error('绘制位置、生死状态或笔画无效');
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
    for (let i = 0; i <= steps; i++) {
      const t = steps ? i / steps : 0, x = Math.round(x0 + (x1 - x0) * t), y = Math.round(y0 + (y1 - y0) * t);
      this.cells[y * COLS + x] = Number(alive);
    }
    this.key = null; this.name = null; this.loopPeriods = null;
  }
  commit() { if (!this.stroke) throw new Error('没有可提交的笔画'); const before = this.stroke; this.stroke = null; return this.remember(before); }
  cancel() { if (this.stroke) { const before = this.stroke; this.stroke = null; Object.assign(this, before); } }
  replace(cells, key = null, name = null, loopPeriods = null, settings = { wrap: this.wrap, interval: this.interval }) {
    checkCells(cells); this.origin(cells, key);
    if (typeof settings.wrap !== 'boolean' || ![125, 200, 500, 1000].includes(settings.interval) || (loopPeriods !== null && (typeof loopPeriods !== 'object' || Array.isArray(loopPeriods) || !['wrap', 'finite'].every(mode => loopPeriods[mode] === null || (Number.isInteger(loopPeriods[mode]) && loopPeriods[mode] >= 1 && loopPeriods[mode] <= 256))))) throw new Error('世界的边界、速度或周期信息无效');
    this.cancel(); const before = this.snapshot();
    this.cells = cells.slice(); this.key = key; this.name = name; this.loopPeriods = loopPeriods;
    this.wrap = settings.wrap; this.interval = settings.interval;
    if (!this.remember(before)) { this.key = key; this.name = name; this.loopPeriods = loopPeriods; }
  }
  settings(wrap, interval) { this.cancel(); this.replace(this.cells, this.key, this.name, this.loopPeriods, { wrap, interval }); }
  undo() { this.cancel(); if (this.past.length) { this.future.push(this.snapshot()); Object.assign(this, this.past.pop()); } }
  redo() { this.cancel(); if (this.future.length) { this.past.push(this.snapshot()); Object.assign(this, this.future.pop()); } }
}
export function exportWorld(cells, wrap, interval) {
  return JSON.stringify({ v: 1, w: COLS, h: ROWS, bits: [...packCells(cells)], crc: boardInfo(cells).crc, wrap, interval }, null, 2);
}
export function importWorld(text) {
  if (typeof text !== 'string' || text.length > 10000) throw new Error('棋盘文件超出10KB限制');
  const data = JSON.parse(text);
  if (data.v !== 1 || data.w !== COLS || data.h !== ROWS || !Array.isArray(data.bits) || data.bits.length !== 144 || data.bits.some(x => !Number.isInteger(x) || x < 0 || x > 255) || typeof data.wrap !== 'boolean' || ![125, 200, 500, 1000].includes(data.interval)) throw new Error('棋盘文件版本、尺寸或设置无效');
  const bits = Uint8Array.from(data.bits);
  if (data.crc !== crc32(bits)) throw new Error('棋盘文件CRC不匹配，未替换当前内容');
  return { cells: unpackCells(bits), wrap: data.wrap, interval: data.interval };
}
