import { crc32 } from './codec.mjs';
import { COUNT, COLS, ROWS, checkCells, packCells, unpackCells } from './world.mjs';

function sparse(cells, alive) {
  const indices = []; cells.forEach((cell, i) => { if (cell === alive) indices.push(i); });
  if (indices.length > 103) return null;
  const data = new Uint8Array(1 + Math.ceil(indices.length * 11 / 8)); data[0] = indices.length;
  indices.forEach((value, i) => { for (let b = 0; b < 11; b++) data[1 + ((i * 11 + b) >> 3)] |= ((value >> b) & 1) << ((i * 11 + b) & 7); });
  return data;
}
export function encodeBoard(cells) {
  checkCells(cells);
  const candidates = [{ codec: 0, data: packCells(cells) }];
  let left = COLS, top = ROWS, right = -1, bottom = -1;
  cells.forEach((alive, bit) => { if (alive) { const x = bit % COLS, y = Math.floor(bit / COLS); left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y); } });
  if (right >= left) {
    const w = right - left + 1, h = bottom - top + 1;
    const data = new Uint8Array(3 + Math.ceil(w * h / 8)), header = left | (top << 6) | ((w - 1) << 11) | ((h - 1) << 17);
    for (let i = 0; i < 3; i++) data[i] = (header >> (8 * i)) & 255;
    for (let i = 0; i < w * h; i++) if (cells[(top + Math.floor(i / w)) * COLS + left + i % w]) data[3 + (i >> 3)] |= 1 << (i & 7);
    candidates.push({ codec: 1, data });
  }
  for (const alive of [1, 0]) { const data = sparse(cells, alive); if (data) candidates.push({ codec: alive ? 2 : 3, data }); }
  return candidates.reduce((best, item) => item.data.length < best.data.length ? item : best);
}
function padding(data, usedBits, offset) {
  if (usedBits % 8 && data.at(-1) >> (usedBits % 8)) throw new Error('棋盘编码的填充位必须为零');
  if (data.length !== offset + Math.ceil(usedBits / 8)) throw new Error('棋盘编码长度不匹配');
}
export function decodeBoard(codec, data) {
  if (!(data instanceof Uint8Array) || !data.length || data.length > 144) throw new Error('棋盘编码长度应为1到144字节');
  if (codec === 0) return unpackCells(data);
  const cells = new Uint8Array(COUNT);
  if (codec === 1) {
    if (data.length < 4) throw new Error('裁剪棋盘数据不完整');
    const header = data[0] | (data[1] << 8) | (data[2] << 16);
    const x = header & 63, y = (header >> 6) & 31, w = ((header >> 11) & 63) + 1, h = ((header >> 17) & 31) + 1;
    if (header >> 22 || x + w > COLS || y + h > ROWS) throw new Error('裁剪棋盘越界');
    padding(data, w * h, 3);
    for (let i = 0; i < w * h; i++) cells[(y + Math.floor(i / w)) * COLS + x + i % w] = (data[3 + (i >> 3)] >> (i & 7)) & 1;
  } else if (codec === 2 || codec === 3) {
    const count = data[0]; if (count > 103) throw new Error('稀疏棋盘数量越界'); padding(data, count * 11, 1);
    cells.fill(codec === 3 ? 1 : 0); let previous = -1;
    for (let i = 0; i < count; i++) {
      let index = 0; for (let b = 0; b < 11; b++) index |= ((data[1 + ((i * 11 + b) >> 3)] >> ((i * 11 + b) & 7)) & 1) << b;
      if (index >= COUNT || index <= previous) throw new Error('稀疏棋盘坐标无效或重复');
      cells[index] = codec === 2 ? 1 : 0; previous = index;
    }
  } else throw new Error('未知棋盘编码');
  return cells;
}
export function boardFrames(cells, { transferId, wrap = true, interval = 200 } = {}) {
  if (transferId === undefined) transferId = crypto.getRandomValues(new Uint16Array(1))[0];
  const speed = [125, 200, 500, 1000].indexOf(interval);
  if (!Number.isInteger(transferId) || transferId < 0 || transferId > 65535 || speed < 0 || typeof wrap !== 'boolean') throw new Error('棋盘传输参数无效');
  const { codec, data } = encodeBoard(cells), flags = (wrap ? 4 : 0) | (speed << 3) | (codec << 5);
  const frame = (type, index) => { const f = new Uint8Array(16); f.set([76, 80, 1, flags | type, index, transferId & 255, transferId >> 8]); return f; };
  const header = frame(3, 255); header[7] = data.length; new DataView(header.buffer).setUint32(8, crc32(packCells(cells)), true);
  const frames = [header];
  for (let i = 0; i < Math.ceil(data.length / 5); i++) { const f = frame(2, i); f.set(data.slice(i * 5, i * 5 + 5), 7); frames.push(f); }
  for (const f of frames) new DataView(f.buffer).setUint32(12, crc32(f.subarray(0, 12)), true);
  return frames;
}
export class BoardReceiver {
  state = null;
  reset() { this.state = null; }
  expire(now) {
    if (this.state && !this.state.complete && (now < this.state.last || now - this.state.last > 15000 || now - this.state.start > 120000)) { this.reset(); return true; }
    return false;
  }
  feed(packet, now) {
    this.expire(now);
    const { type, flags, seq: index, payload, checksum } = packet;
    if (type !== 2 && type !== 3) throw new Error('需要棋盘分片');
    const id = payload[0] | (payload[1] << 8), settings = flags & 124;
    if (type === 3) {
      const length = payload[2], crc = new DataView(payload.buffer, payload.byteOffset + 3, 4).getUint32(0, true);
      if (index !== 255 || length < 1 || length > 144) throw new Error('棋盘头部长度或序号无效');
      if (this.state?.id === id) {
        if (this.state.settings !== settings || this.state.crc !== crc || this.state.length !== length) { this.reset(); throw new Error('同一传输编号的棋盘内容发生冲突'); }
        this.state.last = now; return { duplicate: true, received: this.state.received, total: this.state.total };
      }
      this.state = { id, settings, crc, length, data: new Uint8Array(length), mask: 0, received: 0, total: Math.ceil(length / 5), start: now, last: now, seedId: checksum || 1, complete: false };
    } else {
      const s = this.state;
      if (!s || id !== s.id) return {};
      if (settings !== s.settings || index >= s.total) throw new Error('棋盘分片设置或编号冲突');
      const count = Math.min(5, s.length - index * 5), part = payload.subarray(2, 2 + count);
      if (payload.subarray(2 + count).some(x => x)) throw new Error('末分片填充无效');
      if (s.mask & (1 << index)) {
        if (!part.every((x, i) => x === s.data[index * 5 + i])) { this.reset(); throw new Error('重复分片内容冲突'); }
        s.last = now; return { duplicate: true, received: s.received, total: s.total };
      }
      s.data.set(part, index * 5); s.mask |= 1 << index; s.received++; s.last = now;
      if (s.received === s.total) {
        let cells;
        try { cells = decodeBoard(settings >> 5, s.data); if (crc32(packCells(cells)) !== s.crc) throw new Error('完整棋盘CRC不匹配'); }
        catch (error) { this.reset(); throw error; }
        s.complete = true;
        return { received: s.received, total: s.total, seed: { cells, crc: s.crc, wrap: Boolean(settings & 4), interval: [125, 200, 500, 1000][(settings >> 3) & 3], id: s.seedId } };
      }
    }
    return { received: this.state.received, total: this.state.total };
  }
}
