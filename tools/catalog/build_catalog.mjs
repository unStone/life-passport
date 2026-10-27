import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { stepCells, packCells, boardInfo, loopPeriod } from '../../site/src/world.mjs';

const root = new URL('../../', import.meta.url);
const input = JSON.parse(await readFile(new URL('work/catalog/parsed.json', root), 'utf8'));
const source = JSON.parse(await readFile(new URL('work/catalog/source.json', root), 'utf8'));
const translations = {
  glider: '滑翔机', blinker: '闪烁器', beacon: '信标', toad: '蟾蜍', pulsar: '脉冲星', pentadecathlon: '十五项全能',
  lightweightspaceship: '轻型飞船', middleweightspaceship: '中型飞船', heavyweightspaceship: '重型飞船',
  gosperglidergun: '高斯帕滑翔机枪', acorn: '橡果', diehard: '顽强生命', rpentomino: 'R五连块',
  piheptomino: 'π七连块', thunderbird: '雷鸟', rabbits: '兔群', figureeight: '八字振荡器', clock: '时钟',
  pinwheel: '风车', tumbler: '翻滚器', queenbeeshuttle: '蜂后往返器', trafficlight: '交通灯', koksgalaxy: '科克星系',
  boat: '小船', ship: '船', beehive: '蜂巢', block: '方块', loaf: '面包', pond: '池塘', tub: '水盆',
  snake: '蛇', barge: '驳船', longboat: '长船', bookend: '书挡', eater1: '吞噬者一号', eater2: '吞噬者二号',
  lwss: '轻型飞船', mwss: '中型飞船', hwss: '重型飞船', figure8: '八字振荡器',
};
const categories = { spaceship: '飞船', oscillator: '振荡器', growing: '持续演化', transient: '演化与反应', spark: '消亡火花', still: '静物' };
const popular = ['rpentomino', 'acorn', 'diehard', 'gosperglidergun', 'glider', 'pulsar', 'pentadecathlon', 'koksgalaxy', 'queenbeeshuttle', 'lwss', 'mwss', 'hwss', 'lightweightspaceship', 'middleweightspaceship', 'heavyweightspaceship', 'thunderbird', 'rabbits', 'piheptomino', 'figureeight', 'figure8', 'clock', 'beacon', 'toad', 'blinker'];
const nameKey = name => name.toLowerCase().replace(/[^a-z0-9]/g, '');
const priority = name => { const rank = popular.indexOf(nameKey(name)); return rank < 0 ? 1000 : rank; };
function normalize(points) {
  if (!points.length) return { points: [], x: 0, y: 0, w: 0, h: 0, key: 'empty' };
  const x = Math.min(...points.map(p => p[0])), y = Math.min(...points.map(p => p[1]));
  const shifted = points.map(p => [p[0] - x, p[1] - y]).sort((a, b) => a[1] - b[1] || a[0] - b[0]);
  const w = Math.max(...shifted.map(p => p[0])) + 1, h = Math.max(...shifted.map(p => p[1])) + 1;
  return { points: shifted, x, y, w, h, key: `${w},${h}:${shifted.map(p => p.join(',')).join(';')}` };
}
function orientations(points) {
  const result = [];
  for (const reflect of [1, -1]) for (let rotate = 0; rotate < 4; rotate++) {
    const transformed = points.map(([x, y]) => {
      x *= reflect;
      for (let r = 0; r < rotate; r++) [x, y] = [-y, x];
      return [x, y];
    });
    result.push(normalize(transformed));
  }
  return result;
}
function canonical(points) { return orientations(points).map(p => p.key).sort()[0]; }
function pointsOf(cells) { const result = []; cells.forEach((x, i) => { if (x) result.push([i % 36, Math.floor(i / 36)]); }); return result; }
function analyze(initial) {
  let cells = initial, peak = boardInfo(initial).population, category = 'growing', period = null, lifetime = null;
  const history = new Map(), phases = []; let identity = canonical(pointsOf(initial));
  for (let generation = 0; generation <= 256; generation++) {
    const points = pointsOf(cells), shape = normalize(points); peak = Math.max(peak, points.length);
    if (!points.length) { category = 'spark'; lifetime = generation; break; }
    const previous = history.get(shape.key);
    if (previous) {
      period = generation - previous.generation;
      if (previous.generation === 0) {
        category = shape.x !== previous.x || shape.y !== previous.y ? 'spaceship' : period === 1 ? 'still' : 'oscillator';
        identity = phases.map(canonical).sort()[0];
      } else { category = 'transient'; lifetime = previous.generation; }
      break;
    }
    history.set(shape.key, { generation, x: shape.x, y: shape.y }); phases.push(points);
    cells = stepCells(cells, true);
  }
  return { identity, category, period, lifetime, peak };
}

const entries = [], identities = new Map(), rejected = { bounds: 0, duplicate: 0, trivial: 0 };
for (const item of [...input].sort((a, b) => priority(a.name) - priority(b.name))) {
  if (!Array.isArray(item.cells) || item.cells.some(p => p.length !== 2 || p.some(x => !Number.isInteger(x) || x < 0))) throw new Error(`Invalid parser coordinates: ${item.id}`);
  const original = normalize(item.cells);
  const fitted = orientations(item.cells).find(p => p.w <= 36 && p.h <= 32);
  if (!fitted) { rejected.bounds++; continue; }
  if (item.cells.length < 3) { rejected.trivial++; continue; }
  const cells = new Uint8Array(1152), dx = Math.floor((36 - fitted.w) / 2), dy = Math.floor((32 - fitted.h) / 2);
  fitted.points.forEach(([x, y]) => { cells[(y + dy) * 36 + x + dx] = 1; });
  const behavior = analyze(cells);
  if (['transient', 'spark'].includes(behavior.category) && behavior.lifetime < 4 && behavior.peak < item.cells.length + 4) { rejected.trivial++; continue; }
  if (identities.has(behavior.identity)) {
    const existing = identities.get(behavior.identity); existing.aliases ??= []; existing.aliases.push(item.name);
    rejected.duplicate++; continue;
  }
  const info = boardInfo(cells), bytes = packCells(cells), key = nameKey(item.name), rank = popular.indexOf(key);
  const description = behavior.category === 'still' ? '细胞分布保持不变，观察它的稳定结构。' : behavior.category === 'oscillator' ? `当前棋盘以${behavior.period}代为周期往复变化。` : behavior.category === 'spaceship' ? `图形在${behavior.period}代后重现并发生位移。` : behavior.category === 'spark' ? `演化${behavior.lifetime}代后消亡，过程峰值${behavior.peak}个细胞。` : behavior.category === 'transient' ? `前${behavior.lifetime}代持续变化，随后进入重复状态。` : `观察256代仍未发现重复形态，峰值${behavior.peak}个细胞。`;
  entries.push({ id: createHash('sha256').update(bytes).digest('hex').slice(0, 16), name: item.name,
    label: translations[key] ?? item.name, category: behavior.category, width: fitted.w, height: fitted.h,
    population: info.population, crc: info.crc, bits: [...bytes],
    period: behavior.period, lifetime: behavior.lifetime, peak: behavior.peak, description,
    loopPeriods: behavior.category === 'oscillator' ? { wrap: loopPeriod(cells, true), finite: loopPeriod(cells, false) } : null,
    source: item.source, reference: item.reference, sourceNote: item.sourceNote,
    sourceWidth: original.w, sourceHeight: original.h, rank: rank < 0 ? 1000 : rank });
  identities.set(behavior.identity, entries.at(-1));
  if (entries.length % 100 === 0) console.log(`Validated ${entries.length} distinct fitted patterns`);
}
entries.sort((a, b) => a.rank - b.rank || (a.category === 'still') - (b.category === 'still') || a.name.localeCompare(b.name, 'en'));
for (const item of entries) delete item.rank;
if (entries.length < 200) throw new Error(`Only ${entries.length} qualified patterns; at least 200 are required`);
const data = { v: 1, w: 36, h: 32, rule: 'B3/S23', license: source.license, source,
  categories: Object.entries(categories).map(([id, label]) => ({ id, label, count: entries.filter(x => x.category === id).length })), entries };
const assets = new URL('assets/patterns/', root), publicDir = new URL('site/public/patterns/', root);
await mkdir(assets, { recursive: true }); await mkdir(publicDir, { recursive: true });
await writeFile(new URL('catalog.json', assets), JSON.stringify(data) + '\n');
const notice = `${source.release}\nSource: ${source.repository}\nCommit: ${source.commit}\nSource SHA-256: ${source.source_sha256}\n\n${source.credits.COPYING}\n\nCREDITS\n${source.credits.CREDITS}\n\nLife Passport modifications: selected fitting named diagrams; parsed with ca-formats; translated selected names; centered/rotated complete patterns; deduplicated symmetry and periodic phases; measured bounded-board behavior; encoded JSON data.\nDerived catalog data: Creative Commons Attribution-ShareAlike 3.0 Unported.\nhttps://creativecommons.org/licenses/by-sa/3.0/\nApplication code remains under its own MIT license.\n`;
await writeFile(new URL('NOTICE.txt', assets), notice);
for (const name of ['catalog.json', 'NOTICE.txt', 'CC-BY-SA-3.0.txt']) await copyFile(new URL(name, assets), new URL(name, publicDir));
await writeFile(new URL('work/catalog/validation.json', root), JSON.stringify({ count: entries.length, categories: data.categories, rejected, source_sha256: source.source_sha256 }, null, 2) + '\n');
console.log(JSON.stringify({ count: entries.length, categories: data.categories, output: fileURLToPath(assets) }));
