import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { keyBoard, crc32 } from '../src/codec.mjs';
import { boardFrames } from '../src/board-transport.mjs';
import { packCells } from '../src/world.mjs';
const host = fileURLToPath(new URL('../../work/acoustic-host/acoustic_host', import.meta.url));
const dir = fileURLToPath(new URL('../../work/board-fixtures/', import.meta.url)); mkdirSync(dir, { recursive: true });
function native(frames) {
  writeFileSync(`${dir}/frames.bin`, Buffer.concat(frames.map(x => Buffer.from(x))));
  return spawnSync(host, ['--frames', `${dir}/frames.bin`], { encoding: 'utf8' });
}
test('Browser board codecs reconstruct the exact bitmap with production C, with shuffled frames and replay recovery', () => {
  const fixtures = [new Uint8Array(1152), new Uint8Array(1152).fill(1)];
  const small = new Uint8Array(1152); for (const bit of [37, 74, 108, 109, 110]) small[bit] = 1; fixtures.push(small);
  const corners = new Uint8Array(1152); for (const bit of [0, 35, 1116, 1151]) corners[bit] = 1; fixtures.push(corners, Uint8Array.from(corners, x => 1 - x));
  for (let seed = 0; seed < 30; seed++) fixtures.push(keyBoard(seed.toString(36).padStart(10, '0')).cells);
  for (const cells of fixtures) {
    const frames = boardFrames(cells, { transferId: 42, wrap: true, interval: 125 });
    const shuffled = native([frames[0], ...frames.slice(1).reverse()]);
    assert.equal(shuffled.status, 0, shuffled.stderr);
    assert.equal(JSON.parse(shuffled.stdout).bits, Buffer.from(packCells(cells)).toString('hex').toUpperCase());
    assert.equal(native([frames[0], ...frames.slice(2)]).status, 3);
    const replay = native([frames[0], ...frames.slice(2), frames[0], frames[1]]);
    assert.equal(replay.status, 0, replay.stderr);
    const corrupt = frames.map(x => x.slice()); corrupt[1][7] ^= 1;
    new DataView(corrupt[1].buffer).setUint32(12, crc32(corrupt[1].subarray(0, 12)), true);
    assert.equal(native(corrupt).status, 3);
  }
});
