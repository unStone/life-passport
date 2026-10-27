import test from 'node:test';
import assert from 'node:assert/strict';
import { keyBoard, readFrame } from '../src/codec.mjs';
import { packCells, unpackCells, Editor, stepCells, exportWorld, importWorld } from '../src/world.mjs';
import { encodeBoard, decodeBoard, boardFrames, BoardReceiver } from '../src/board-transport.mjs';

test('Paint is one undo step, cancelling restores content, preview uses exact B3/S23', () => {
  const editor = new Editor(new Uint8Array(1152));
  editor.begin(); editor.line(0, 0, 35, 31, true); editor.commit();
  assert(editor.cells.reduce((a, b) => a + b, 0) >= 36);
  editor.undo(); assert.equal(editor.cells.reduce((a, b) => a + b, 0), 0);
  editor.redo(); const before = editor.cells.slice();
  editor.begin(); editor.line(0, 0, 35, 31, false); editor.cancel();
  assert.deepEqual(editor.cells, before);
  const blinker = new Uint8Array(1152); blinker.set([1, 1, 1], 15 * 36 + 16);
  assert.deepEqual(stepCells(stepCells(blinker, false), false), blinker);
  assert.deepEqual(unpackCells(packCells(before)), before);
  assert.throws(() => packCells(new Uint8Array(100)));
  assert.throws(() => new Editor(new Uint8Array(1152), '0000000001'));
  const original = keyBoard('0000000001').cells, recipe = new Editor(original, '0000000001');
  recipe.begin(); recipe.line(0, 0, 0, 0, Boolean(original[0])); recipe.commit();
  assert.equal(recipe.key, '0000000001');
  editor.replace(original, null, 'Catalog pattern');
  editor.begin(); editor.line(0, 0, 0, 0, !Boolean(original[0])); editor.commit();
  assert.equal(editor.name, null); editor.undo(); assert.equal(editor.name, 'Catalog pattern');
  const saved = exportWorld(before, false, 125);
  assert.deepEqual(importWorld(saved).cells, before);
  const invalid = JSON.parse(saved); invalid.bits[0] ^= 1;
  assert.throws(() => importWorld(JSON.stringify(invalid)), /CRC/);
  invalid.bits[0] = 1.5; assert.throws(() => importWorld(JSON.stringify(invalid)));
});

test('All board codecs round trip; bounds, padding, loss, conflict and timeout cannot apply partial boards', () => {
  const fixtures = [new Uint8Array(1152), new Uint8Array(1152).fill(1), keyBoard('0123456789').cells];
  const glider = new Uint8Array(1152); for (const [x, y] of [[1, 0], [2, 1], [0, 2], [1, 2], [2, 2]]) glider[(y + 10) * 36 + x + 10] = 1;
  fixtures.push(glider);
  const corners = new Uint8Array(1152); for (const bit of [0, 35, 1116, 1151]) corners[bit] = 1;
  fixtures.push(corners);
  assert.equal(encodeBoard(glider).codec, 1);
  assert.equal(encodeBoard(corners).codec, 2);
  for (const cells of fixtures) {
    const encoded = encodeBoard(cells);
    assert(encoded.data.length <= 144);
    assert.deepEqual(decodeBoard(encoded.codec, encoded.data), cells);
    const frames = boardFrames(cells, { transferId: 17, wrap: false, interval: 500 });
    const rx = new BoardReceiver();
    assert.equal(rx.feed(readFrame(frames[1]), 0).seed, undefined);
    rx.feed(readFrame(frames[0]), 1);
    let result, now = 2;
    for (let i = frames.length - 1; i >= 1; i--) result = rx.feed(readFrame(frames[i]), now++);
    assert.deepEqual(result.seed.cells, cells); assert.equal(result.seed.interval, 500);
    assert.equal(rx.feed(readFrame(frames[1]), 100).duplicate, true);
    const missing = new BoardReceiver(); missing.feed(readFrame(frames[0]), 0);
    for (const frame of frames.slice(2)) assert.equal(missing.feed(readFrame(frame), 100).seed, undefined);
    assert.equal(missing.expire(15101), true);
    assert.throws(() => decodeBoard(0, new Uint8Array(143)));
  }
});
test('Applying a received or generated world and undo/redo preserve boundary, interval and provenance atomically', () => {
  const cells = keyBoard('0000000001').cells, editor = new Editor(cells, '0000000001');
  const blinker = new Uint8Array(1152); blinker.set([1, 1, 1], 15 * 36 + 16);
  editor.replace(blinker, null, 'Image', { wrap: null, finite: 2 }, { wrap: false, interval: 500 });
  assert.equal(editor.wrap, false); assert.equal(editor.interval, 500);
  editor.undo(); assert.deepEqual(editor.cells, cells); assert.equal(editor.key, '0000000001');
  assert.equal(editor.wrap, true); assert.equal(editor.interval, 200); assert.equal(editor.name, null);
  editor.redo(); assert.deepEqual(editor.cells, blinker); assert.equal(editor.name, 'Image');
  assert.deepEqual(editor.loopPeriods, { wrap: null, finite: 2 });
  assert.equal(editor.wrap, false); assert.equal(editor.interval, 500);
  editor.settings(true, 125); editor.undo(); assert.equal(editor.wrap, false); assert.equal(editor.interval, 500);
});
test('Conflicting chunks, wrong metadata, invalid padding and old transaction cannot produce a board', () => {
  const cells = keyBoard('HELLOWORLD').cells, frames = boardFrames(cells, { transferId: 1 });
  const rx = new BoardReceiver(); rx.feed(readFrame(frames[0]), 0); rx.feed(readFrame(frames[1]), 1);
  const conflict = readFrame(frames[1]); conflict.payload[2] ^= 1;
  assert.throws(() => rx.feed(conflict, 2)); assert.equal(rx.state, null);
  rx.feed(readFrame(frames[0]), 3);
  const wrong = readFrame(frames[1]); wrong.flags ^= 4; assert.throws(() => rx.feed(wrong, 4));
  const another = boardFrames(cells, { transferId: 2 }); rx.feed(readFrame(another[0]), 5);
  assert.equal(rx.feed(readFrame(frames[1]), 6).seed, undefined); assert.equal(rx.state.received, 0);
  assert.throws(() => decodeBoard(2, Uint8Array.of(1, 0, 128)));
  assert.throws(() => decodeBoard(1, Uint8Array.of(63, 0, 0, 1)));
});
