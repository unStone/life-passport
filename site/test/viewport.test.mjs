import test from 'node:test';
import assert from 'node:assert/strict';
import { clampScale, zoomAt, touchPair } from '../src/viewport.mjs';
test('Pinch zoom preserves its content anchor and pan does not mutate board coordinates', () => {
  const view = { scale: 1, left: 100, top: 50 };
  assert.deepEqual(zoomAt(view, 2, [50, 75]), { scale: 2, left: 250, top: 175 });
  assert.deepEqual(zoomAt(view, 1, [100, 100], [120, 80]), { scale: 1, left: 80, top: 70 });
  assert.equal(clampScale(.1), 1); assert.equal(clampScale(100), 6);
  assert.throws(() => clampScale(NaN));
  assert.deepEqual(touchPair([[10, 20], [30, 20]]), { center: [20, 20], distance: 20 });
  assert.equal(touchPair([[1, 1], [1, 1]]).distance, 1);
});
