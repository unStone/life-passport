import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { validateCatalog } from '../src/catalog.mjs';
import { boardFrames } from '../src/board-transport.mjs';
import { packCells } from '../src/world.mjs';
const asset = new URL('../../assets/patterns/catalog.json', import.meta.url);
const raw = readFileSync(asset), data = JSON.parse(raw);

test('Catalog has 200+ distinct complete named patterns, reviewed provenance, and matching deployed data', () => {
  const catalog = validateCatalog(data), symmetries = new Set();
  assert(catalog.cells.size >= 200);
  for (const name of ['glider', 'blinker', 'pulsar', 'R-pentomino', 'Gosper glider gun']) assert(data.entries.some(x => x.name === name), `Missing familiar named pattern: ${name}`);
  assert(data.entries.filter(x => x.category !== 'still').length >= 200);
  assert.equal(data.source.commit, '19eeabbf84b94f6a53791774e4377e766e10c0c6');
  assert.equal(data.source.source_sha256, '0e828cf69196ef1a98936ebb40c8791dd9da049f76c4b37386e7dd7389c930c8');
  assert(data.source.credits.COPYING.includes('CC BY-SA 3.0'));
  assert(raw.equals(readFileSync(new URL('../public/patterns/catalog.json', import.meta.url))));
  for (const entry of data.entries) {
    const cells = catalog.cells.get(entry.id), coordinates = [];
    cells.forEach((alive, bit) => { if (alive) coordinates.push([bit % 36, Math.floor(bit / 36)]); });
    const keys = [];
    for (const swap of [false, true]) for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
      const points = coordinates.map(([x, y]) => swap ? [y * sy, x * sx] : [x * sx, y * sy]);
      const minX = Math.min(...points.map(x => x[0])), minY = Math.min(...points.map(x => x[1]));
      keys.push(points.map(([x, y]) => (y - minY) * 64 + x - minX).sort((a, b) => a - b).join(','));
    }
    assert(!keys.some(key => symmetries.has(key)), `Symmetry duplicate: ${entry.name}`);
    keys.forEach(key => symmetries.add(key));
  }
  const corrupt = structuredClone(data); corrupt.entries[0].crc ^= 1;
  assert.throws(() => validateCatalog(corrupt));
  const duplicate = structuredClone(data); duplicate.entries[1] = duplicate.entries[0];
  assert.throws(() => validateCatalog(duplicate));
});
test('Every catalog preset transfers through the production C complete-board receiver exactly', () => {
  const { cells } = validateCatalog(data);
  const host = fileURLToPath(new URL('../../work/acoustic-host/acoustic_host', import.meta.url));
  const directory = fileURLToPath(new URL('../../work/catalog-test/', import.meta.url)); mkdirSync(directory, { recursive: true });
  let sequence = 0;
  for (const entry of data.entries) {
    const board = cells.get(entry.id), frames = boardFrames(board, { transferId: sequence++, wrap: true, interval: 200 });
    const file = `${directory}/frames.bin`; writeFileSync(file, Buffer.concat(frames.map(x => Buffer.from(x))));
    const result = JSON.parse(execFileSync(host, ['--frames', file], { encoding: 'utf8' }));
    assert.equal(result.bits, Buffer.from(packCells(board)).toString('hex').toUpperCase(), entry.name);
    assert.equal(result.population, entry.population); assert.equal(result.crc, entry.crc);
  }
});
