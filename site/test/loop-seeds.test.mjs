import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loopPeriod, packCells } from '../src/world.mjs';
import { validateCatalog } from '../src/catalog.mjs';
test('A changing oscillator naturally returns to the original board under B3/S23', () => {
  const cells = new Uint8Array(1152); cells.set([1, 1, 1], 15 * 36 + 15);
  assert.equal(loopPeriod(cells, true), 2); assert.equal(loopPeriod(cells, false), 2);
  assert.equal(loopPeriod(new Uint8Array(1152), true), 1);
});
test('Every offered loop period returns the exact initial board with production C, for both boundary modes', () => {
  const data = JSON.parse(readFileSync(new URL('../../assets/patterns/catalog.json', import.meta.url))), catalog = validateCatalog(data);
  const host = fileURLToPath(new URL('../../work/acoustic-host/acoustic_host', import.meta.url));
  const directory = fileURLToPath(new URL('../../work/loop-seeds/', import.meta.url)); mkdirSync(directory, { recursive: true });
  for (const [name, period] of [['blinker', 2], ['pulsar', 3], ['pentadecathlon', 15]]) assert.equal(data.entries.find(x => x.name === name)?.loopPeriods?.wrap, period);
  let checked = 0;
  for (const entry of data.entries) for (const boundary of ['wrap', 'finite']) {
    const period = entry.loopPeriods?.[boundary]; if (!period || period < 2) continue;
    const bits = packCells(catalog.cells.get(entry.id)), file = `${directory}/board.bin`; writeFileSync(file, bits);
    const result = JSON.parse(execFileSync(host, ['--evolve', file, String(period), boundary === 'wrap' ? '1' : '0'], { encoding: 'utf8' }));
    assert.equal(result.bits, Buffer.from(bits).toString('hex').toUpperCase(), `${entry.name}/${boundary}`);
    assert.equal(result.stableSeen, false); checked++;
  }
  assert(checked >= 188);
});
