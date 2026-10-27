import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import wavefile from 'wavefile';
import { makeFrame, dataPattern, hex } from '../src/codec.mjs';
import { encodeFrame, joinWaves, wavBytes } from '../src/audio.mjs';
import { boardFrames } from '../src/board-transport.mjs';
import { packCells } from '../src/world.mjs';
import { keyBoard } from '../src/codec.mjs';

const host = fileURLToPath(new URL('../../work/acoustic-host/acoustic_host', import.meta.url));
const work = fileURLToPath(new URL('../../work/acoustic-waves/', import.meta.url));
mkdirSync(work, { recursive: true });
const fixtures = JSON.parse(readFileSync(new URL('../../tests/audio_vectors.json', import.meta.url)));
test('Browser WebAssembly waveforms decode with native production packet/key code', async () => {
  for (const protocol of ['six', 'dual']) for (const sampleRate of [24000, 44100, 48000]) {
    const fixture = fixtures.at(-1);
    const frame = makeFrame({ key: fixture.key, seq: fixture.seq });
    const waveform = joinWaves([await encodeFrame(frame, { protocol, sampleRate })]);
    const name = `${work}/${protocol}-${sampleRate}`;
    writeFileSync(`${name}.wav`, wavBytes(waveform));
    // Model the device's fixed 24kHz ADC; it does not use GGWave input resampling.
    const captured = new wavefile.WaveFile(wavBytes(waveform));
    captured.toSampleRate(24000, { method: 'sinc' });
    const samples = captured.getSamples(true, Int16Array);
    writeFileSync(`${name}.pcm`, Buffer.from(samples.buffer));
    const result = JSON.parse(execFileSync(host, ['--pcm', `${name}.pcm`, '24000'], { encoding: 'utf8' }));
    assert.equal(result.key, fixture.key); assert.equal(result.crc, fixture.board_crc);
    assert.equal(result.population, fixture.population);
  }
});
test('Complete edited boards survive real WASM audio and production C multipart reception', async () => {
  const small = new Uint8Array(1152); small.set([1, 1, 1], 15 * 36 + 15);
  for (const [name, cells] of [['small', small], ['dense', keyBoard('HELLOWORLD').cells]]) for (const protocol of ['six', 'dual']) {
    const waves = [];
    for (const frame of boardFrames(cells, { transferId: 77 })) waves.push(await encodeFrame(frame, { protocol }));
    const wave = joinWaves(waves), path = `${work}/edited-${name}-${protocol}`;
    writeFileSync(`${path}.wav`, wavBytes(wave));
    const captured = new wavefile.WaveFile(wavBytes(wave)); captured.toSampleRate(24000, { method: 'sinc' });
    const pcm = captured.getSamples(true, Int16Array); writeFileSync(`${path}.pcm`, Buffer.from(pcm.buffer));
    const result = JSON.parse(execFileSync(host, ['--pcm', `${path}.pcm`, '24000'], { encoding: 'utf8' }));
    assert.equal(result.bits, hex(packCells(cells)), `${name}/${protocol}`);
  }
});
test('Native C validates reference packets; all-FF binary survives WASM, wrong CRC is refused', async () => {
  for (const fixture of fixtures) {
    const result = JSON.parse(execFileSync(host, ['--packet', fixture.packet_hex], { encoding: 'utf8' }));
    assert.equal(result.crc, fixture.board_crc); assert.equal(result.population, fixture.population);
  }
  for (const corrupt of [false, true]) {
    const data = dataPattern('ones'), frame = makeFrame({ kind: 'diag', data, seq: 42, corrupt });
    const wave = joinWaves([await encodeFrame(frame)]);
    const pcm = Int16Array.from(wave.samples, (x) => Math.round(Math.max(-1, Math.min(1, x)) * 32767));
    writeFileSync(`${work}/diag.pcm`, Buffer.from(pcm.buffer));
    const result = spawnSync(host, ['--pcm', `${work}/diag.pcm`, '48000'], { encoding: 'utf8' });
    if (corrupt) assert.equal(result.status, 3);
    else { assert.equal(result.status, 0); assert.equal(JSON.parse(result.stdout).payload, hex(data)); }
  }
});
