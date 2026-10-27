import { unpackCells, boardInfo } from './world.mjs';

export function decodePreset(entry) {
  if (!entry || typeof entry.id !== 'string' || !entry.id || typeof entry.name !== 'string' || typeof entry.label !== 'string' || typeof entry.description !== 'string' || !Array.isArray(entry.bits) || entry.bits.length !== 144 || entry.bits.some(x => !Number.isInteger(x) || x < 0 || x > 255) || !Number.isInteger(entry.width) || entry.width < 1 || entry.width > 36 || !Number.isInteger(entry.height) || entry.height < 1 || entry.height > 32 || (entry.aliases !== undefined && (!Array.isArray(entry.aliases) || entry.aliases.some(x => typeof x !== 'string')))) throw new Error('图鉴条目格式或尺寸无效');
  const bytes = Uint8Array.from(entry.bits), cells = unpackCells(bytes), info = boardInfo(cells);
  if (info.population !== entry.population || info.crc !== entry.crc) throw new Error(`图鉴${entry.name}校验失败`);
  if (entry.category === 'oscillator' && (!entry.loopPeriods || !Number.isInteger(entry.loopPeriods.wrap) || entry.loopPeriods.wrap < 2 || entry.loopPeriods.wrap > 256 || !['wrap', 'finite'].every(key => entry.loopPeriods[key] === null || (Number.isInteger(entry.loopPeriods[key]) && entry.loopPeriods[key] >= 1 && entry.loopPeriods[key] <= 256)))) throw new Error(`循环种子${entry.name}周期信息无效`);
  let left = 36, top = 32, right = -1, bottom = -1;
  cells.forEach((alive, bit) => { if (alive) { const x = bit % 36, y = Math.floor(bit / 36); left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y); } });
  if (right - left + 1 !== entry.width || bottom - top + 1 !== entry.height || left !== Math.floor((36 - entry.width) / 2) || top !== Math.floor((32 - entry.height) / 2) || new URL(entry.source).protocol !== 'https:') throw new Error(`图鉴${entry.name}来源或边界无效`);
  return cells;
}
export function validateCatalog(data) {
  if (!data || data.v !== 1 || data.w !== 36 || data.h !== 32 || data.rule !== 'B3/S23' || data.license !== 'CC-BY-SA-3.0' || !Array.isArray(data.entries) || data.entries.length < 200 || data.entries.length > 10000 || !Array.isArray(data.categories)) throw new Error('图鉴版本、许可或数量无效');
  const ids = new Set(), bitmaps = new Set(), categories = new Set(data.categories.map(x => x.id)), cells = new Map();
  for (const entry of data.entries) {
    const bitmap = JSON.stringify(entry.bits);
    if (ids.has(entry.id) || bitmaps.has(bitmap) || !categories.has(entry.category)) throw new Error('图鉴包含重复或未分类条目');
    ids.add(entry.id); bitmaps.add(bitmap); cells.set(entry.id, decodePreset(entry));
  }
  for (const category of data.categories) if (category.count !== data.entries.filter(x => x.category === category.id).length) throw new Error('图鉴分类计数不一致');
  return { data, cells };
}
