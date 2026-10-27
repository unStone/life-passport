import { prepareEncoder } from './audio.mjs';
const names = ['AUDIBLE_NORMAL', 'AUDIBLE_FAST', 'AUDIBLE_FASTEST', 'ULTRASOUND_NORMAL', 'ULTRASOUND_FAST', 'ULTRASOUND_FASTEST', 'DT_NORMAL', 'DT_FAST', 'DT_FASTEST'];
export class Decoder {
  instance = -1;
  static async create(sampleRate) {
    if (sampleRate !== 48000) throw new Error(`解码需要浏览器将收音转换为48000Hz，实际为${sampleRate}Hz`);
    const decoder = new Decoder(); decoder.sdk = await prepareEncoder(); const sdk = decoder.sdk;
    for (const name of names) sdk.rxToggleProtocol(sdk.ProtocolId[`GGWAVE_PROTOCOL_${name}`], Number(['AUDIBLE_FASTEST', 'DT_FASTEST'].includes(name)));
    const parameters = sdk.getDefaultParameters();
    parameters.payloadLength = 16; parameters.sampleRate = parameters.sampleRateOut = 48000;
    parameters.sampleRateInp = sampleRate; parameters.samplesPerFrame = 1024;
    parameters.sampleFormatInp = sdk.SampleFormat.GGWAVE_SAMPLE_FORMAT_F32;
    parameters.operatingMode = sdk.GGWAVE_OPERATING_MODE_RX | sdk.GGWAVE_OPERATING_MODE_USE_DSS;
    decoder.instance = sdk.init(parameters);
    if (decoder.instance < 0) throw new Error('浏览器声音解码器初始化失败');
    return decoder;
  }
  feed(samples) {
    if (this.instance < 0 || !(samples instanceof Float32Array) || samples.length > 4096 || samples.some(x => !Number.isFinite(x))) throw new Error('解码器状态或录音采样无效');
    const result = this.sdk.decode(this.instance, new Uint8Array(samples.buffer, samples.byteOffset, samples.byteLength));
    return result?.byteLength ? Uint8Array.from(new Uint8Array(result.buffer, result.byteOffset, result.byteLength)) : null;
  }
  close() { if (this.instance >= 0) this.sdk.free(this.instance); this.instance = -1; }
}
