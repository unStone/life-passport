import moduleData from './image-modules.json' with { type: 'json' };
import { COUNT, COLS, ROWS, checkCells, stepCells, loopPeriod } from './world.mjs';

function gray(data) {
  if (!(data instanceof Uint8Array || data instanceof Uint8ClampedArray) || data.length !== COUNT * 4) throw new Error('图片采样必须为36×32个RGBA像素');
  return Uint8Array.from({ length: COUNT }, (_, i) => {
    const at = i * 4, alpha = data[at + 3] / 255;
    return Math.round((.2126 * data[at] + .7152 * data[at + 1] + .0722 * data[at + 2]) * alpha + 255 * (1 - alpha));
  });
}
export function automaticThreshold(rgba) {
  const levels = gray(rgba), histogram = new Uint32Array(256);
  let sum = 0; for (const value of levels) { histogram[value]++; sum += value; }
  let count = 0, partial = 0, best = -1, start = 0, end = 0;
  for (let t = 0; t < 255; t++) {
    count += histogram[t]; partial += histogram[t] * t;
    if (!count || count === COUNT) continue;
    const delta = partial / count - (sum - partial) / (COUNT - count);
    const variance = count * (COUNT - count) * delta * delta;
    if (variance > best + 1e-6) { best = variance; start = end = t; }
    else if (Math.abs(variance - best) <= 1e-6 && t === end + 1) end = t;
  }
  return best < 0 ? Math.min(254, levels[0]) : Math.floor((start + end) / 2);
}
export function maskImage(rgba, threshold, invert) {
  const levels = gray(rgba);
  if (!Number.isInteger(threshold) || threshold < 0 || threshold > 255 || typeof invert !== 'boolean') throw new Error('图片阈值或反相设置无效');
  return Uint8Array.from(levels, (value, i) => Number(rgba[4 * i + 3] > 0 && (invert ? value > threshold : value <= threshold)));
}
export function compareTarget(target, cells) {
  checkCells(target); checkCells(cells);
  let expected = 0, actual = 0, intersection = 0, error = 0;
  target.forEach((value, i) => { expected += value; actual += cells[i]; intersection += value && cells[i]; if (value !== cells[i]) error += value ? 4 : 1; });
  return { expected, actual, intersection, error, dice: expected + actual ? 2 * intersection / (expected + actual) : 1 };
}
export function cycleInfo(cells, wrap, period) {
  checkCells(cells);
  if (![2, 3, 4].includes(period) || typeof wrap !== 'boolean') throw new Error('图片生成周期应为2、3或4代，边界必须明确');
  if (loopPeriod(cells, wrap, period) !== period) throw new Error('生成图案未通过生命规则和真实周期校验');
  const phases = [cells.slice()];
  for (let i = 1; i < period; i++) phases.push(stepCells(phases.at(-1), wrap));
  return { phases, changed: cells.reduce((sum, value, i) => sum + (value !== phases[1][i]), 0) };
}
function variants(period) {
  const module = moduleData.modules.find(x => x.period === period);
  if (!module) throw new Error(`缺少周期${period}的构造数据`);
  const result = [], seen = new Set();
  for (const phase of module.phases) for (const flip of [false, true]) for (let rotation = 0; rotation < 4; rotation++) {
    const width = rotation % 2 ? module.height : module.width, height = rotation % 2 ? module.width : module.height;
    const points = phase.map(([x, y]) => {
      if (flip) x = module.width - 1 - x;
      if (rotation === 1) return [module.height - 1 - y, x];
      if (rotation === 2) return [module.width - 1 - x, module.height - 1 - y];
      if (rotation === 3) return [y, module.width - 1 - x];
      return [x, y];
    });
    const key = JSON.stringify(points.slice().sort((a, b) => a[1] - b[1] || a[0] - b[0]));
    if (!seen.has(key)) { seen.add(key); result.push({ width, height, points }); }
  }
  return result;
}
function gain(target, item, x, y) { return item.points.reduce((score, [dx, dy]) => score + (target[(y + dy) * COLS + x + dx] ? 4 : -1), 0); }
function stamp(cells, item, x, y) { for (const [dx, dy] of item.points) cells[(y + dy) * COLS + x + dx] = 1; }
export function constructCycle(target, period) {
  checkCells(target); const choices = variants(period), cells = new Uint8Array(COUNT);
  const side = Math.max(...choices.map(x => Math.max(x.width, x.height))), pitch = side + 2;
  const columns = Math.floor(COLS / pitch), rows = Math.floor(ROWS / pitch);
  const left = Math.floor((COLS - columns * pitch) / 2), top = Math.floor((ROWS - rows * pitch) / 2);
  for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
    let best = null, score = 0;
    for (const item of choices) for (let dy = 0; dy <= side - item.height; dy++) for (let dx = 0; dx <= side - item.width; dx++) {
      const x = left + column * pitch + 1 + dx, y = top + row * pitch + 1 + dy, value = gain(target, item, x, y);
      if (value > score) { score = value; best = { item, x, y }; }
    }
    if (best) stamp(cells, best.item, best.x, best.y);
  }
  if (!cells.some(Boolean)) {
    let best = null, score = -Infinity, distance = Infinity;
    for (const item of choices) for (let y = 0; y <= ROWS - item.height; y++) for (let x = 0; x <= COLS - item.width; x++) {
      const value = gain(target, item, x, y), center = (x + item.width / 2 - COLS / 2) ** 2 + (y + item.height / 2 - ROWS / 2) ** 2;
      if (value > score || (value === score && center < distance)) { best = { item, x, y }; score = value; distance = center; }
    }
    stamp(cells, best.item, best.x, best.y);
  }
  cycleInfo(cells, true, period); cycleInfo(cells, false, period);
  return cells;
}
export function imageWindows(target, cells) {
  checkCells(target); checkCells(cells);
  const windows = [];
  for (const offset of [0, 3, 0]) {
    const xs = [...new Set([0, 28, ...Array.from({ length: 5 }, (_, i) => Math.min(28, offset + i * 6))])].sort((a, b) => a - b);
    const ys = [...new Set([0, 24, ...Array.from({ length: 5 }, (_, i) => Math.min(24, offset + i * 6))])].sort((a, b) => a - b);
    const pass = [];
    for (const y of ys) for (const x of xs) {
      let error = 0;
      for (let dy = 0; dy < 8; dy++) for (let dx = 0; dx < 8; dx++) { const bit = (y + dy) * COLS + x + dx; if (target[bit] !== cells[bit]) error += target[bit] ? 4 : 1; }
      pass.push({ x, y, width: 8, height: 8, error });
    }
    pass.sort((a, b) => b.error - a.error); windows.push(...pass);
  }
  return windows;
}
