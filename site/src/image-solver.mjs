import Logic from 'logic-solver';
import { COUNT, COLS, ROWS, checkCells } from './world.mjs';
import { cycleInfo, compareTarget } from './image-math.mjs';

export function lifeFormula(current, neighbors) {
  const count = Logic.sum(neighbors);
  return Logic.or(Logic.equalBits(count, Logic.constantBits(3)), Logic.and(current, Logic.equalBits(count, Logic.constantBits(2))));
}
export function createPatchProblem(cells, target, { period, wrap, rectangle, minimumChange }) {
  checkCells(target);
  const { phases, changed } = cycleInfo(cells, wrap, period), r = rectangle;
  if (!r || ![r.x, r.y, r.width, r.height, minimumChange].every(Number.isInteger) || r.x < 0 || r.y < 0 || r.width < 1 || r.height < 1 || r.width > 10 || r.height > 10 || r.x + r.width > COLS || r.y + r.height > ROWS || minimumChange < 1 || minimumChange > changed) throw new Error('图片求解区域或最小变化量无效');
  const inside = (x, y) => x >= r.x && x < r.x + r.width && y >= r.y && y < r.y + r.height;
  const indices = [];
  for (let y = r.y; y < r.y + r.height; y++) for (let x = r.x; x < r.x + r.width; x++) indices.push(y * COLS + x);
  const names = phases.map((_, t) => new Map(indices.map(bit => [bit, `p${t}_${bit}`])));
  const at = (t, x, y) => {
    if (wrap) { x = (x + COLS) % COLS; y = (y + ROWS) % ROWS; }
    if (x < 0 || y < 0 || x >= COLS || y >= ROWS) return Logic.FALSE;
    const bit = y * COLS + x;
    return names[t].get(bit) ?? (phases[t][bit] ? Logic.TRUE : Logic.FALSE);
  };
  const solver = new Logic.Solver();
  // The one-cell halo keeps every fixed outside transition consistent with the patch.
  for (let t = 0; t < period; t++) for (let y = r.y - 1; y <= r.y + r.height; y++) for (let x = r.x - 1; x <= r.x + r.width; x++) {
    if (!wrap && (x < 0 || y < 0 || x >= COLS || y >= ROWS)) continue;
    const neighbors = [];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (dx || dy) neighbors.push(at(t, x + dx, y + dy));
    solver.require(Logic.equiv(at((t + 1) % period, x, y), lifeFormula(at(t, x, y), neighbors)));
  }
  for (let divisor = 1; divisor < period; divisor++) if (period % divisor === 0) {
    let outsideChanged = 0;
    for (let bit = 0; bit < COUNT; bit++) if (!inside(bit % COLS, Math.floor(bit / COLS)) && phases[0][bit] !== phases[divisor][bit]) outsideChanged++;
    const differences = indices.map(bit => Logic.xor(names[0].get(bit), names[divisor].get(bit)));
    const needed = divisor === 1 ? Math.max(0, minimumChange - outsideChanged) : outsideChanged ? 0 : 1;
    if (needed) solver.require(Logic.greaterThanOrEqual(Logic.sum(differences), Logic.constantBits(needed)));
  }
  const fixed = names.flatMap((map, t) => indices.map(bit => phases[t][bit] ? map.get(bit) : Logic.not(map.get(bit))));
  const initial = solver.solveAssuming(Logic.and(fixed));
  if (!initial) throw new Error('已验证的周期图案未满足求解约束，已停止计算');
  const terms = indices.map(bit => target[bit] ? Logic.not(names[0].get(bit)) : names[0].get(bit));
  const weights = indices.map(bit => target[bit] ? 4 : 1), sum = Logic.weightedSum(terms, weights);
  const decode = solution => { const result = cells.slice(); for (const bit of indices) result[bit] = Number(solution.evaluate(names[0].get(bit))); return result; };
  return { solver, initial, terms, weights, sum, decode };
}
export function improvePatch(cells, target, options, candidate) {
  const problem = createPatchProblem(cells, target, options);
  let current = cells, solution = problem.initial, cost = solution.getWeightedSum(problem.terms, problem.weights);
  for (let attempt = 0; attempt < 3 && cost > 0; attempt++) {
    const next = problem.solver.solveAssuming(Logic.lessThan(problem.sum, Logic.constantBits(cost)));
    if (!next) break;
    const result = problem.decode(next), verified = cycleInfo(result, options.wrap, options.period);
    const nextCost = next.getWeightedSum(problem.terms, problem.weights);
    if (verified.changed < options.minimumChange || nextCost >= cost || compareTarget(target, result).error >= compareTarget(target, current).error) throw new Error('求解结果未通过周期或目标函数复验');
    current = result; solution = next; cost = nextCost; candidate(current);
  }
  return current;
}
