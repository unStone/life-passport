import test from 'node:test';
import assert from 'node:assert/strict';
import Logic from 'logic-solver';
import { lifeFormula, createPatchProblem, improvePatch } from '../src/image-solver.mjs';
import { constructCycle, cycleInfo, compareTarget } from '../src/image-math.mjs';

test('SAT Life transition agrees with all 512 local B3/S23 neighborhoods', () => {
  const solver = new Logic.Solver(), neighbors = Array.from({ length: 8 }, (_, i) => `n${i}`);
  solver.require(Logic.equiv('next', lifeFormula('center', neighbors)));
  for (let mask = 0; mask < 512; mask++) {
    const count = neighbors.reduce((sum, _, bit) => sum + ((mask >> bit) & 1), 0), center = Boolean(mask & 256);
    const expected = count === 3 || (center && count === 2);
    const fixed = neighbors.map((name, bit) => (mask >> bit) & 1 ? name : Logic.not(name)); fixed.push(center ? 'center' : '-center');
    assert(solver.solveAssuming(Logic.and(fixed, expected ? 'next' : '-next')));
    assert.equal(solver.solveAssuming(Logic.and(fixed, expected ? '-next' : 'next')), null);
  }
});
test('A local SAT improvement remains a genuine global oscillator and does not worsen weighted image error', () => {
  const target = new Uint8Array(1152);
  for (let y = 10; y < 20; y++) for (let x = 10; x < 23; x++) if (x < 14 || y > 16) target[y * 36 + x] = 1;
  const initial = constructCycle(target, 2), options = { period: 2, wrap: true, minimumChange: 1, rectangle: { x: 9, y: 9, width: 8, height: 8 } };
  const problem = createPatchProblem(initial, target, options);
  assert(problem.initial);
  const improved = improvePatch(initial, target, options, () => {});
  assert.equal(cycleInfo(improved, true, 2).phases.length, 2);
  assert(compareTarget(target, improved).error <= compareTarget(target, initial).error);
});
