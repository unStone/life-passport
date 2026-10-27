import test from 'node:test';
import assert from 'node:assert/strict';
import { Capture } from '../src/capture.mjs';

test('Capture closes real ownership boundaries on permission rejection and stop during pending permission', async () => {
  const contexts = [], workers = [];
  class Context {
    state = 'suspended'; sampleRate = 48000; destination = {};
    constructor() { contexts.push(this); }
    async resume() { this.state = 'running'; }
    async close() { this.state = 'closed'; }
  }
  class Worker {
    constructor() { workers.push(this); }
    postMessage(data) { if (data.type === 'init') queueMicrotask(() => this.onmessage?.({ data: { type: 'ready' } })); }
    terminate() { this.terminated = true; }
  }
  const original = new Map(['AudioContext', 'Worker', 'AudioWorkletNode', 'isSecureContext', 'navigator'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  let requested, permission, stopped = 0;
  const setup = getUserMedia => {
    for (const [key, value] of Object.entries({ AudioContext: Context, Worker, AudioWorkletNode: class {}, isSecureContext: true, navigator: { mediaDevices: { getUserMedia } } })) Object.defineProperty(globalThis, key, { value, configurable: true });
  };
  try {
    setup(async () => { throw new Error('NotAllowedError'); });
    const capture = new Capture({ decoded() {}, failed() {} });
    await assert.rejects(capture.microphone(), /NotAllowedError/);
    assert.equal(capture.session, null); assert.equal(contexts.at(-1).state, 'closed'); assert(workers.at(-1).terminated);
    const called = new Promise(resolve => { requested = resolve; });
    setup(() => { requested(); return new Promise(resolve => { permission = resolve; }); });
    const pending = capture.microphone(); await called;
    await capture.stop();
    permission({ getTracks: () => [{ stop: () => stopped++ }] }); await pending;
    assert.equal(stopped, 1); assert.equal(capture.session, null); assert.equal(contexts.at(-1).state, 'closed'); assert(workers.at(-1).terminated);
  } finally {
    for (const [key, descriptor] of original) descriptor ? Object.defineProperty(globalThis, key, descriptor) : delete globalThis[key];
  }
});
