import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { keyValue, keyText, keyBoard, makeFrame, readFrame, dataPattern } from '../src/codec.mjs';

const vectors = JSON.parse(readFileSync(new URL('../../tests/audio_vectors.json', import.meta.url)));
for (const fixture of vectors) test(`Python/C/JS seed fixture ${fixture.key}`, () => {
  assert.equal(keyValue(fixture.key), BigInt(fixture.value));
  assert.equal(keyText(keyValue(fixture.key)), fixture.key);
  const board = keyBoard(fixture.key);
  assert.equal(Buffer.from(board.bits).toString('hex'), fixture.board_hex);
  assert.equal(board.crc, fixture.board_crc);
  assert.equal(board.population, fixture.population);
  const frame = makeFrame({ key: fixture.key, seq: fixture.seq });
  assert.equal(Buffer.from(frame).toString('hex'), fixture.packet_hex);
  assert.equal(readFrame(frame).key, fixture.key);
});
test('Key constraints, diagnostics and corruption rejection', () => {
  for (const invalid of ['1', '000000000!', '-000000001']) assert.throws(() => keyValue(invalid));
  for (const pattern of ['zero', 'ones', 'alternating', 'ramp', 'random']) {
    const data = dataPattern(pattern);
    const frame = makeFrame({ kind: 'diag', data, seq: 17 });
    assert.deepEqual(readFrame(frame).payload, data);
    for (let bit = 0; bit < 128; bit++) {
      const damaged = frame.slice(); damaged[bit >> 3] ^= 1 << (bit & 7);
      assert.throws(() => readFrame(damaged));
    }
  }
});
