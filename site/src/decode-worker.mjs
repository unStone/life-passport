import { Decoder } from './decoder.mjs';
let decoder;
self.onmessage = async ({ data }) => {
  try {
    if (data.type === 'init') {
      if (decoder) throw new Error('解码任务已启动');
      decoder = await Decoder.create(data.sampleRate); self.postMessage({ type: 'ready' });
    } else if (data.type === 'pcm') {
      if (!decoder) throw new Error('解码任务尚未就绪');
      const samples = new Float32Array(data.samples), before = performance.now(), frame = decoder.feed(samples);
      let sum = 0; for (const value of samples) sum += value * value;
      self.postMessage({ type: 'decoded', frame: frame?.buffer, dbfs: sum ? 10 * Math.log10(sum / samples.length) : -96, decodeMs: performance.now() - before }, frame ? [frame.buffer] : []);
    } else throw new Error('未知解码消息');
  } catch (error) { decoder?.close(); decoder = null; self.postMessage({ type: 'error', message: error.message }); }
};
