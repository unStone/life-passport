import { Capture } from './capture.mjs';
import { readFrame, keyBoard } from './codec.mjs';
import { BoardReceiver } from './board-transport.mjs';
import { renderBoard } from './board-editor.mjs';
import { boardInfo } from './world.mjs';

export class ReceiveUI {
  active = false; pending = null; epoch = 0; counts = { valid: 0, rejected: 0, duplicate: 0 }; lastView = 0; maxMs = 0;
  constructor({ apply, changed, error }) {
    this.apply = apply; this.changed = changed; this.error = error; this.$ = id => document.getElementById(id);
    this.rx = new BoardReceiver();
    this.capture = new Capture({ decoded: data => this.decoded(data), failed: error => this.fail(error) });
    this.$('listen-start').addEventListener('click', () => this.start());
    this.$('listen-stop').addEventListener('click', () => this.stop().catch(error));
    this.$('receive-file').addEventListener('change', e => { const file = e.target.files[0]; e.target.value = ''; if (file) this.start(file); });
    this.$('receive-apply').addEventListener('click', () => {
      if (!this.pending) return;
      const seed = this.pending; this.pending = null; this.$('received-preview').hidden = true;
      this.status('已应用到编辑器'); this.buttons(); this.apply(seed);
    });
    this.$('receive-cancel').addEventListener('click', () => { this.pending = null; this.$('received-preview').hidden = true; this.status('已放弃接收内容，原编辑稿保持不变'); this.buttons(); });
    this.buttons();
  }
  buttons() {
    this.$('listen-start').disabled = this.active || Boolean(this.pending);
    this.$('receive-file').disabled = this.active || Boolean(this.pending);
    this.$('listen-stop').disabled = !this.active;
    this.changed?.();
  }
  status(text) { this.$('receive-status').textContent = text; }
  async start(file) {
    if (this.active || this.pending) return;
    const token = ++this.epoch;
    this.active = true; this.rx.reset(); this.counts = { valid: 0, rejected: 0, duplicate: 0 }; this.maxMs = 0;
    this.$('receive-progress').value = 0; this.status(file ? '正在解码声音文件…' : '正在准备收音，请处理浏览器权限提示…'); this.buttons();
    try {
      const info = file ? await this.capture.file(file) : await this.capture.microphone();
      if (token !== this.epoch) return;
      if (file) { this.active = false; this.status('文件已读完，尚未收齐有效棋盘；编辑稿未改变'); this.buttons(); }
      else if (info) this.status(`监听中 · ${info.sampleRate}Hz · 请让另一台设备播放`);
    } catch (error) { if (token === this.epoch) this.fail(error); }
  }
  decoded(data) {
    if (!this.active) return;
    this.maxMs = Math.max(this.maxMs, data.decodeMs);
    const now = performance.now();
    if (this.rx.expire(now)) { this.$('receive-progress').value = 0; this.status('分片接收超时，请重新播放完整声音'); }
    if (data.frame) {
      try {
        const packet = readFrame(new Uint8Array(data.frame)); let seed;
        if (packet.kind === 'key') seed = { ...keyBoard(packet.key), wrap: Boolean(packet.flags & 4), interval: [125, 200, 500, 1000][(packet.flags >> 3) & 3], key: packet.key };
        else if (packet.type >= 2) {
          const result = this.rx.feed(packet, now); seed = result.seed;
          if (result.duplicate) this.counts.duplicate++;
          if (result.total) {
            this.$('receive-progress').max = result.total; this.$('receive-progress').value = result.received;
            this.status(`正在接收棋盘 · ${result.received}/${result.total}片`);
          }
        } else this.status(`诊断包序号${packet.seq}已通过，未改变棋盘`);
        this.counts.valid++;
        if (seed) this.complete(seed);
      } catch (error) { this.counts.rejected++; this.status(`已拒绝：${error.message}；编辑稿未改变`); }
    }
    if (now - this.lastView > 200 || data.frame) {
      this.lastView = now;
      this.$('receive-signal').textContent = `信号 ${data.dbfs.toFixed(1)}dBFS · 单块解码最大${this.maxMs.toFixed(1)}ms`;
      this.$('receive-counts').textContent = `通过${this.counts.valid} · 拒绝${this.counts.rejected} · 重复${this.counts.duplicate}`;
    }
  }
  complete(seed) {
    this.pending = seed;
    this.stop(true).then(() => {
      if (this.pending !== seed) return;
      const info = boardInfo(seed.cells);
      renderBoard(this.$('received-board'), seed.cells);
      this.$('received-population').textContent = `${info.population} 个生命`;
      this.$('received-info').textContent = `${seed.key ? `世界码 ${seed.key} · ` : '手绘棋盘 · '}CRC ${info.crc.toString(16).padStart(8, '0').toUpperCase()} · ${seed.interval}ms · ${seed.wrap ? '环绕' : '有限'}边界`;
      this.$('received-preview').hidden = false; this.status('完整校验通过，接收已停止；请确认是否应用'); this.buttons();
    }).catch(error => this.fail(error));
  }
  async stop(keepPending = false) {
    ++this.epoch; this.active = false;
    await this.capture.stop(); this.rx.reset();
    if (!keepPending) { this.pending = null; this.$('received-preview').hidden = true; this.status('已停止接收并释放麦克风，编辑稿未改变'); }
    this.buttons();
  }
  fail(error) { this.stop().then(() => { this.status(`收音失败：${error.message}`); this.error(error); }, cleanup => this.error(new Error(`${error.message}；清理失败：${cleanup.message}`))); }
}
