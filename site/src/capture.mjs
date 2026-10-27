export class Capture {
  session = null; epoch = 0;
  constructor({ decoded, failed }) { this.decoded = decoded; this.failed = failed; }
  async open(live = true) {
    if (this.session) throw new Error('已有收音任务，请先停止');
    ++this.epoch;
    const Audio = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!Audio || !globalThis.Worker || !globalThis.AudioWorkletNode) throw new Error('当前浏览器缺少AudioWorklet或Worker，请使用新版Safari／Chrome');
    const context = new Audio({ sampleRate: 48000 });
    const session = { context, stream: null, worker: null, source: null, node: null, gain: null, pending: 0, waiting: null, cancelled: false };
    this.session = session;
    try {
      if (live) await context.resume();
      if (live && context.state !== 'running') throw new Error('浏览器未允许音频处理，请再次点击收音');
      if (context.sampleRate !== 48000) throw new Error(`浏览器没有提供所需48000Hz音频图，实际为${context.sampleRate}Hz`);
      session.worker = new Worker(new URL('./decode-worker.mjs', import.meta.url), { type: 'module' });
      session.worker.onerror = event => { event.preventDefault(); this.fail(session, new Error(event.message || '声音解码Worker启动失败')); };
      await new Promise((resolve, reject) => {
        const deadline = setTimeout(() => { session.waiting = null; reject(new Error('声音解码器加载超时')); }, 15000);
        session.waiting = error => { clearTimeout(deadline); session.waiting = null; error ? reject(error) : resolve(); };
        session.worker.onmessage = ({ data }) => {
          if (this.session !== session) return;
          if (data.type === 'ready') session.waiting?.();
          else if (data.type === 'error') this.fail(session, new Error(data.message));
          else if (data.type === 'decoded') {
            session.pending--;
            this.decoded(data);
            session.next?.(); session.next = null;
          }
        };
        session.worker.postMessage({ type: 'init', sampleRate: context.sampleRate });
      });
      if (session.cancelled) throw new Error('收音已取消');
      return session;
    } catch (error) { if (this.session === session) await this.stop(); throw error; }
  }
  send(session, samples) {
    if (this.session !== session) return;
    if (++session.pending > 4) { this.fail(session, new Error('收音处理来不及，已停止以避免丢弃采样')); return; }
    session.worker.postMessage({ type: 'pcm', samples }, [samples]);
  }
  async microphone() {
    if (!globalThis.isSecureContext || !navigator.mediaDevices?.getUserMedia) throw new Error('麦克风需要HTTPS或localhost，请打开正式网页');
    const session = await this.open();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: false, noiseSuppression: false, autoGainControl: false }, video: false });
      if (this.session !== session) { stream.getTracks().forEach(track => track.stop()); return; }
      session.stream = stream;
      for (const track of stream.getTracks()) track.addEventListener('ended', () => this.fail(session, new Error('麦克风连接已中断')));
      await session.context.audioWorklet.addModule(new URL('./capture-worklet.mjs', import.meta.url));
      if (this.session !== session) return;
      session.source = session.context.createMediaStreamSource(stream);
      session.node = new AudioWorkletNode(session.context, 'life-capture', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1] });
      session.node.onprocessorerror = () => this.fail(session, new Error('麦克风AudioWorklet处理失败'));
      session.node.port.onmessage = ({ data }) => this.send(session, data);
      session.gain = session.context.createGain(); session.gain.gain.value = 0;
      session.source.connect(session.node).connect(session.gain).connect(session.context.destination);
      session.context.onstatechange = () => { if (this.session === session && session.context.state !== 'running') this.fail(session, new Error('浏览器暂停了收音，请重新开始')); };
      return { sampleRate: session.context.sampleRate, trackSettings: stream.getAudioTracks()[0]?.getSettings() };
    } catch (error) { if (this.session === session) await this.stop(); throw error; }
  }
  async file(file) {
    if (!file || file.size > 15000000) throw new Error('音频文件不能超过15MB');
    const session = await this.open(false);
    try {
      const buffer = await session.context.decodeAudioData(await file.arrayBuffer());
      if (this.session !== session) return;
      if (buffer.duration > 120 || buffer.numberOfChannels > 2) throw new Error('音频最多120秒、双声道');
      const mono = new Float32Array(buffer.length);
      for (let c = 0; c < buffer.numberOfChannels; c++) {
        const channel = buffer.getChannelData(c);
        for (let i = 0; i < mono.length; i++) mono[i] += channel[i] / buffer.numberOfChannels;
      }
      for (let i = 0; i < mono.length && this.session === session; i += 2048) {
        await new Promise(resolve => { session.next = resolve; this.send(session, mono.slice(i, i + 2048).buffer); });
      }
      if (this.session === session) { await this.stop(); return true; }
    } catch (error) { if (this.session === session) await this.stop(); throw error; }
  }
  fail(session, error) {
    if (this.session !== session) return;
    session.waiting?.(error);
    const stopped = this.stop(), token = this.epoch;
    stopped.then(() => { if (token === this.epoch) this.failed(error); }, cleanup => { if (token === this.epoch) this.failed(new Error(`${error.message}；清理失败：${cleanup.message}`)); });
  }
  async stop() {
    ++this.epoch;
    const session = this.session; if (!session) return;
    this.session = null; session.cancelled = true;
    session.waiting?.(new Error('收音已停止')); session.next?.(); session.next = null;
    if (session.node) { session.node.port.onmessage = null; session.node.onprocessorerror = null; session.node.disconnect(); }
    session.source?.disconnect(); session.gain?.disconnect();
    session.stream?.getTracks().forEach(track => track.stop());
    session.worker?.terminate(); session.context.onstatechange = null;
    if (session.context.state !== 'closed') await session.context.close();
  }
}
