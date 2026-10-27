import factory from 'ggwave';
import wavefile from 'wavefile';

const names = ['AUDIBLE_NORMAL', 'AUDIBLE_FAST', 'AUDIBLE_FASTEST', 'ULTRASOUND_NORMAL', 'ULTRASOUND_FAST', 'ULTRASOUND_FASTEST', 'DT_NORMAL', 'DT_FAST', 'DT_FASTEST'];
let modulePromise;
export function prepareEncoder() {
  modulePromise ??= factory().then((sdk) => { sdk.disableLog(); return sdk; });
  return modulePromise;
}
export async function encodeFrame(frame, { protocol = 'six', sampleRate = 48000, volume = 25 } = {}) {
  if (!(frame instanceof Uint8Array) || frame.length !== 16) throw new Error('编码内容必须为16字节');
  if (!['six', 'dual'].includes(protocol) || ![24000, 44100, 48000].includes(sampleRate)) throw new Error('声码配置不受支持');
  if (!Number.isInteger(volume) || volume < 1 || volume > 50) throw new Error('编码音量应在1到50之间');
  const sdk = await prepareEncoder();
  for (const name of names) sdk.txToggleProtocol(sdk.ProtocolId[`GGWAVE_PROTOCOL_${name}`], 0);
  const selected = sdk.ProtocolId[protocol === 'six' ? 'GGWAVE_PROTOCOL_AUDIBLE_FASTEST' : 'GGWAVE_PROTOCOL_DT_FASTEST'];
  sdk.txToggleProtocol(selected, 1);
  const parameters = sdk.getDefaultParameters();
  parameters.payloadLength = 16;
  // Canonical encoder resolution; 48k/1024 and receiver 24k/512 have identical bins.
  parameters.sampleRate = parameters.sampleRateInp = 48000;
  parameters.sampleRateOut = sampleRate;
  parameters.samplesPerFrame = 1024;
  parameters.sampleFormatOut = sdk.SampleFormat.GGWAVE_SAMPLE_FORMAT_F32;
  parameters.operatingMode = sdk.GGWAVE_OPERATING_MODE_TX | sdk.GGWAVE_OPERATING_MODE_USE_DSS;
  const instance = sdk.init(parameters);
  if (instance < 0) throw new Error('声码编码器初始化失败');
  try {
    const encoded = sdk.encode(instance, frame, selected, volume);
    if (!encoded?.byteLength || encoded.byteLength % 4) throw new Error('声码没有生成有效PCM');
    const bytes = Uint8Array.from(new Uint8Array(encoded.buffer, encoded.byteOffset, encoded.byteLength));
    const samples = new Float32Array(bytes.buffer);
    if (!samples.every(Number.isFinite)) throw new Error('声音包含无效采样');
    return { samples, sampleRate, seconds: samples.length / sampleRate };
  } finally { sdk.free(instance); }
}
export function toneWave(frequencies, sampleRate = 48000, seconds = 1, volume = 25) {
  if (!frequencies.length || frequencies.some((hz) => hz < 100 || hz > 7000) || volume < 1 || volume > 50) throw new Error('测试音配置无效');
  const samples = new Float32Array(Math.round(sampleRate * seconds));
  for (let i = 0; i < samples.length; i++) {
    const fade = Math.min(1, i / (sampleRate * .01), (samples.length - i - 1) / (sampleRate * .01));
    samples[i] = frequencies.reduce((sum, hz) => sum + Math.sin(2 * Math.PI * hz * i / sampleRate), 0) / frequencies.length * volume / 100 * fade;
  }
  return { samples, sampleRate, seconds };
}
export function joinWaves(waves, gapSeconds = .35) {
  if (!waves.length || waves.some((wave) => wave.sampleRate !== waves[0].sampleRate)) throw new Error('声音采样率必须一致');
  const sampleRate = waves[0].sampleRate, gap = Math.round(sampleRate * gapSeconds);
  const samples = new Float32Array(waves.reduce((n, wave) => n + wave.samples.length + gap, 0));
  let offset = 0;
  for (const wave of waves) { samples.set(wave.samples, offset); offset += wave.samples.length + gap; }
  return { samples, sampleRate, seconds: samples.length / sampleRate };
}
export function wavBytes(wave) {
  const pcm = Int16Array.from(wave.samples, (x) => Math.round(Math.max(-1, Math.min(1, x)) * (x < 0 ? 32768 : 32767)));
  const wav = new wavefile.WaveFile();
  wav.fromScratch(1, wave.sampleRate, '16', pcm);
  return wav.toBuffer();
}

export class Player {
  context;
  source;
  deadline;
  async resume() {
    const Audio = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!Audio) throw new Error('此浏览器不支持音频，请使用Safari或Chrome');
    this.context ??= new Audio();
    await this.context.resume();
    if (this.context.state !== 'running') throw new Error('浏览器尚未允许播放，请再次点击播放');
    return this.context.sampleRate;
  }
  stop() {
    clearTimeout(this.deadline);
    if (this.source) { this.source.onended = null; this.source.stop(); this.source.disconnect(); this.source = null; }
  }
  play(wave, loop, ended, maxSeconds = 60) {
    this.stop();
    if (this.context?.state !== 'running' || wave.sampleRate !== this.context.sampleRate || ![60, 180].includes(maxSeconds)) throw new Error('音频上下文、采样率或循环时长不匹配');
    const buffer = this.context.createBuffer(1, wave.samples.length, wave.sampleRate);
    buffer.copyToChannel(wave.samples, 0);
    const source = this.context.createBufferSource();
    source.buffer = buffer; source.loop = loop; source.connect(this.context.destination);
    this.source = source;
    source.onended = () => { source.disconnect(); if (this.source === source) this.source = null; ended(); };
    source.start();
    if (loop) this.deadline = setTimeout(() => { this.stop(); ended(); }, maxSeconds * 1000);
  }
}
