import CRC32 from 'crc-32';

export const KEY_LIMIT = 3656158440062976n;
const MASK = (1n << 64n) - 1n;
export const crc32 = (bytes) => CRC32.buf(bytes) >>> 0;
export const hex = (bytes) => Array.from(bytes, (x) => x.toString(16).padStart(2, '0')).join('').toUpperCase();

export function keyValue(text) {
  if (typeof text !== 'string' || !/^[0-9a-z]{10}$/i.test(text.trim())) throw new Error('请输入10位数字或英文字母');
  return BigInt(Number.parseInt(text.trim(), 36));
}
export function keyText(value) {
  if (typeof value !== 'bigint' || value < 0n || value >= KEY_LIMIT) throw new Error('种子编号超出10位范围');
  return value.toString(36).toUpperCase().padStart(10, '0');
}
export function randomKey() {
  let value;
  do {
    const bytes = crypto.getRandomValues(new Uint8Array(7));
    bytes[6] &= 15;
    value = bytes.reduce((n, byte, i) => n | (BigInt(byte) << BigInt(i * 8)), 0n);
  } while (value >= KEY_LIMIT);
  return keyText(value);
}
export function keyBoard(text) {
  let state = keyValue(text) || 0x9e3779b97f4a7c15n;
  const cells = new Uint8Array(1152), bits = new Uint8Array(144);
  let population = 0;
  for (let bit = 0; bit < cells.length; bit++) {
    state ^= state >> 12n;
    state ^= (state << 25n) & MASK;
    state ^= state >> 27n;
    const alive = ((state * 2685821657736338717n) & MASK) % 100n < 28n;
    if (alive) { cells[bit] = 1; bits[bit >> 3] |= 1 << (bit & 7); population++; }
  }
  return { cells, bits, population, crc: crc32(bits) };
}
export function dataPattern(name) {
  if (name === 'random') return crypto.getRandomValues(new Uint8Array(7));
  if (!['zero', 'ones', 'alternating', 'ramp'].includes(name)) throw new Error('未知测试数据');
  return Uint8Array.from({ length: 7 }, (_, i) => name === 'ones' ? 255 : name === 'alternating' ? (i % 2 ? 170 : 85) : name === 'ramp' ? i : 0);
}
export function makeFrame({ kind = 'key', key, seq, wrap = true, interval = 200, data, corrupt = false }) {
  if (!Number.isInteger(seq) || seq < 0 || seq > 255) throw new Error('序号必须为0到255');
  const frame = new Uint8Array(16);
  frame.set([76, 80, 1, 0, seq]);
  if (kind === 'key') {
    const speed = [125, 200, 500, 1000].indexOf(interval);
    if (speed < 0) throw new Error('不支持该演化间隔');
    frame[3] = 1 | (wrap ? 4 : 0) | (speed << 3);
    const value = keyValue(key);
    for (let i = 0; i < 7; i++) frame[i + 5] = Number((value >> BigInt(i * 8)) & 255n);
  } else if (kind === 'diag') {
    if (!(data instanceof Uint8Array) || data.length !== 7) throw new Error('诊断内容必须为7字节');
    frame.set(data, 5);
  } else throw new Error('未知数据类型');
  new DataView(frame.buffer).setUint32(12, crc32(frame.subarray(0, 12)), true);
  if (corrupt) frame[15] ^= 128;
  return frame;
}
export function readFrame(frame) {
  if (!(frame instanceof Uint8Array) || frame.length !== 16) throw new Error('声音帧必须为16字节');
  const checksum = new DataView(frame.buffer, frame.byteOffset, frame.byteLength).getUint32(12, true);
  if (checksum !== crc32(frame.subarray(0, 12))) throw new Error('CRC校验失败');
  const type = frame[3] & 3;
  if (frame[0] !== 76 || frame[1] !== 80 || frame[2] !== 1 || (frame[3] & 224) || type > 1 || (!type && frame[3])) throw new Error('不支持该帧格式');
  const payload = frame.slice(5, 12), result = { kind: type ? 'key' : 'diag', seq: frame[4], payload, checksum };
  if (type) result.key = keyText(payload.reduce((n, byte, i) => n | (BigInt(byte) << BigInt(i * 8)), 0n));
  return result;
}
