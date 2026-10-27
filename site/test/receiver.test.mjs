import test from 'node:test';
import assert from 'node:assert/strict';
import { readFrame, makeFrame, keyBoard } from '../src/codec.mjs';
import { boardFrames, BoardReceiver } from '../src/board-transport.mjs';
import { encodeFrame, joinWaves, wavBytes } from '../src/audio.mjs';
import { Decoder } from '../src/decoder.mjs';
import wavefile from 'wavefile';

async function decode(frames, protocol, sampleRate) {
  const waves = []; for (const frame of frames) waves.push(await encodeFrame(frame, { protocol, sampleRate }));
  const wave = joinWaves(waves), captured = new wavefile.WaveFile(wavBytes(wave));
  // The production AudioContext and decodeAudioData resample into a 48kHz graph.
  captured.toSampleRate(48000, { method: 'sinc' });
  const samples = Float32Array.from(captured.getSamples(true, Int16Array), x => x / 32768);
  const decoder = await Decoder.create(48000), results = [];
  try {
    for (let i = 0; i < samples.length; i += 2048) {
      const data = decoder.feed(samples.subarray(i, i + 2048));
      if (data) results.push(readFrame(data));
    }
  } finally { decoder.close(); }
  return results;
}
test('Browser RX decodes real WASM key and multipart board audio at actual input rates', async () => {
  const cells = new Uint8Array(1152); for (const bit of [37, 74, 108, 109, 110]) cells[bit] = 1;
  for (const protocol of ['six', 'dual']) for (const sampleRate of [24000, 44100, 48000]) {
    const key = await decode([makeFrame({ key: '0123456789', seq: 9 })], protocol, sampleRate);
    assert.equal(key.at(-1)?.key, '0123456789', `${protocol}/${sampleRate}: key`);
    const frames = boardFrames(cells, { transferId: 19, interval: 200, wrap: true });
    const packets = await decode(frames, protocol, sampleRate), rx = new BoardReceiver();
    let seed; for (const packet of packets) seed = rx.feed(packet, 0).seed ?? seed;
    assert.deepEqual(seed?.cells, cells, `${protocol}/${sampleRate}: board`);
  }
});
test('Dense edited board audio reaches complete CRC-checked preview in the browser', async () => {
  const cells = keyBoard('HELLOWORLD').cells, frames = boardFrames(cells, { transferId: 22 });
  const packets = await decode(frames, 'six', 48000), rx = new BoardReceiver(); let seed;
  for (const packet of packets) seed = rx.feed(packet, 0).seed ?? seed;
  assert.deepEqual(seed?.cells, cells);
});
