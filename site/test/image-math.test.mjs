import test from 'node:test';
import assert from 'node:assert/strict';
import { constructCycle, compareTarget, maskImage, automaticThreshold } from '../src/image-math.mjs';
import { loopPeriod, packCells } from '../src/world.mjs';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
test('Photo-derived construction depends on content and obeys exact Life periods under both boundaries', () => {
  const a = new Uint8Array(1152), b = new Uint8Array(1152);
  for (let y = 8; y < 24; y++) for (let x = 6; x < 30; x++) { if (x < 10 || y > 19) a[y * 36 + x] = 1; if (Math.abs(x - 18) + Math.abs(y - 16) < 11) b[y * 36 + x] = 1; }
  for (const period of [2, 3, 4]) {
    const one = constructCycle(a, period), two = constructCycle(b, period);
    assert.notDeepEqual(one, two);
    for (const cells of [one, two, constructCycle(new Uint8Array(1152), period)]) for (const wrap of [false, true]) assert.equal(loopPeriod(cells, wrap, period), period);
    assert(compareTarget(a, one).intersection > 0);
  }
});
test('Native-decoded RGBA thresholding handles alpha and inversion without changing source pixels', () => {
  const rgba = new Uint8ClampedArray(1152 * 4).fill(255); rgba.set([0, 0, 0, 255], 0); rgba.set([0, 0, 0, 0], 4);
  const threshold = automaticThreshold(rgba), cells = maskImage(rgba, threshold, false);
  assert.equal(cells[0], 1); assert.equal(cells[1], 0); assert.equal(cells[2], 0);
  const inverted = maskImage(rgba, threshold, true); assert.equal(inverted[0], 0); assert.equal(inverted[1], 0); assert.equal(inverted[2], 1);
  assert.throws(() => maskImage(rgba, NaN, false));
});
test('Image-generated boards naturally cycle in the exact production firmware model without stable pauses', () => {
  const host = fileURLToPath(new URL('../../work/acoustic-host/acoustic_host', import.meta.url));
  const directory = fileURLToPath(new URL('../../work/image-seeds/', import.meta.url)); mkdirSync(directory, { recursive: true });
  for (const period of [2, 3, 4]) {
    const target = new Uint8Array(1152);
    for (let y = 5; y < 27; y++) for (let x = 6; x < 30; x++) if (Math.abs(x - 18) + Math.abs(y - 16) < 12) target[y * 36 + x] = 1;
    const bits = packCells(constructCycle(target, period)), file = `${directory}/board.bin`; writeFileSync(file, bits);
    for (const wrap of [false, true]) {
      const result = JSON.parse(execFileSync(host, ['--evolve', file, String(period * 10), wrap ? '1' : '0'], { encoding: 'utf8' }));
      assert.equal(result.bits, Buffer.from(bits).toString('hex').toUpperCase()); assert.equal(result.stableSeen, false);
    }
  }
});
