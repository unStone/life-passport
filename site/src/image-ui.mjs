import { automaticThreshold, maskImage, constructCycle, compareTarget, cycleInfo, imageWindows } from './image-math.mjs';
import { renderBoard } from './board-editor.mjs';
import { checkCells, stepCells } from './world.mjs';

export class ImageUI {
  active = false; rgba = null; best = null; thumbnail = null; worker = null; epoch = 0; fileEpoch = 0;
  deadline = null; heartbeat = null; previewTimer = null; revision = 0; bestRevision = -1;
  constructor({ apply, changed, error, boundary, interval }) {
    this.apply = apply; this.changed = changed; this.error = error; this.boundary = boundary; this.interval = interval;
    this.$ = id => document.getElementById(id); this.dialog = this.$('photo-dialog');
    this.$('photo-open').addEventListener('click', () => {
      this.dialog.showModal();
      if (this.best && this.params.wrap !== this.boundary()) this.invalidate('边界已改变，请重新计算');
      if (this.best) { this.params.interval = this.interval(); this.animate(); }
      this.$('photo-boundary').textContent = this.boundary() ? '环绕边界' : '有限边界';
    });
    this.$('photo-close').addEventListener('click', () => this.dialog.close());
    this.dialog.addEventListener('close', () => { this.stop('已停止，编辑稿未改变'); this.pausePreview(); ++this.fileEpoch; });
    this.$('photo-file').addEventListener('change', e => { const file = e.target.files[0]; e.target.value = ''; if (file) this.readImage(file); });
    for (const id of ['photo-threshold', 'photo-invert', 'photo-period']) this.$(id).addEventListener('input', () => {
      this.invalidate('设置已改变，请重新计算'); this.targetView();
    });
    this.$('photo-generate').addEventListener('click', () => this.generate());
    this.$('photo-stop').addEventListener('click', () => this.stop('已停止计算，保留当前已验证结果'));
    this.$('photo-apply').addEventListener('click', () => this.accept());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { this.stop('页面进入后台，已停止计算并保留结果'); this.pausePreview(); }
      else if (this.dialog.open && this.best) this.animate();
    });
    this.buttons();
  }
  status(text) { this.$('photo-status').textContent = text; }
  buttons() {
    this.$('photo-generate').disabled = !this.rgba || this.active;
    this.$('photo-stop').disabled = !this.active;
    this.$('photo-apply').disabled = !this.best;
    this.changed();
  }
  stop(message) {
    ++this.epoch; this.active = false; this.worker?.terminate(); this.worker = null;
    clearTimeout(this.deadline); clearInterval(this.heartbeat);
    if (message && this.dialog.open) this.status(message);
    this.buttons();
  }
  invalidate(message) {
    this.stop(message); this.best = null; this.state = null; this.bestRevision = -1; ++this.revision;
    this.pausePreview(); renderBoard(this.$('photo-result'), new Uint8Array(1152)); this.$('photo-metrics').textContent = '尚无验证结果'; this.buttons();
  }
  async readImage(file) {
    this.invalidate('正在读取图片…'); this.rgba = null; this.buttons();
    this.$('photo-source').hidden = true;
    renderBoard(this.$('photo-target'), new Uint8Array(1152));
    const token = ++this.fileEpoch, image = new Image(); let url;
    try {
      if (file.size > 20 * 1024 * 1024) throw new Error('图片不能超过20MB');
      url = URL.createObjectURL(file); image.src = url; await image.decode();
      if (token !== this.fileEpoch || !this.dialog.open) return;
      if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth * image.naturalHeight > 36000000) throw new Error('图片尺寸无效或超过3600万像素');
      const preview = document.createElement('canvas'); preview.width = 360; preview.height = 320;
      const context = preview.getContext('2d'), scale = Math.min(360 / image.naturalWidth, 320 / image.naturalHeight);
      const width = image.naturalWidth * scale, height = image.naturalHeight * scale;
      context.drawImage(image, (360 - width) / 2, (320 - height) / 2, width, height);
      const sampling = document.createElement('canvas'); sampling.width = 36; sampling.height = 32;
      const pixels = sampling.getContext('2d', { willReadFrequently: true }); pixels.drawImage(preview, 0, 0, 36, 32);
      const rgba = pixels.getImageData(0, 0, 36, 32).data.slice();
      const blob = await new Promise(resolve => preview.toBlob(resolve, 'image/png'));
      if (token !== this.fileEpoch || !this.dialog.open) return;
      if (!blob) throw new Error('图片缩略图生成失败');
      if (this.thumbnail) URL.revokeObjectURL(this.thumbnail);
      this.thumbnail = URL.createObjectURL(blob); this.$('photo-source').src = this.thumbnail; this.$('photo-source').hidden = false;
      this.rgba = rgba; this.$('photo-threshold').value = String(automaticThreshold(rgba));
      this.targetView(); this.status('图片已读取，点击计算生成；原编辑稿尚未改变'); this.buttons();
    } catch (error) {
      if (token === this.fileEpoch) { this.status(`读取失败：${error.message}。可尝试PNG、JPEG或WebP格式`); this.error(error); }
    } finally { image.src = ''; if (url) URL.revokeObjectURL(url); }
  }
  targetView() {
    if (!this.rgba) return;
    const threshold = Number(this.$('photo-threshold').value); this.$('photo-threshold-value').textContent = String(threshold);
    this.target = maskImage(this.rgba, threshold, this.$('photo-invert').checked); renderBoard(this.$('photo-target'), this.target);
  }
  generate() {
    if (!this.rgba || this.active) return;
    this.stop(); this.targetView();
    try {
      if (!this.target.some(Boolean)) throw new Error('当前阈值没有提取出轮廓，请调整阈值或反相后重新计算');
      const period = Number(this.$('photo-period').value), wrap = this.boundary(), interval = this.interval();
      const seconds = Number(this.$('photo-seconds').value);
      if (![10, 20, 40].includes(seconds)) throw new Error('计算时长应为10、20或40秒');
      const reusable = this.best && this.bestRevision === this.revision && this.params.period === period && this.params.wrap === wrap;
      const state = reusable ? this.best.cells.slice() : constructCycle(this.target, period), info = cycleInfo(state, wrap, period);
      this.params = { period, wrap, interval }; this.state = state; this.plan = imageWindows(this.target, state); this.index = 0;
      this.minimumChange = reusable ? this.minimumChange : Math.max(1, Math.ceil(info.changed / 4));
      this.active = true; const token = ++this.epoch;
      this.started = performance.now(); this.budget = seconds * 1000;
      this.offer(state); this.status('已生成可循环图案，正在优化图片轮廓…'); this.buttons();
      this.deadline = setTimeout(() => { if (token === this.epoch) this.stop('已到计算时限，保留当前已验证结果'); }, this.budget);
      this.heartbeat = setInterval(() => {
        if (token !== this.epoch) return;
        const elapsed = Math.min(seconds, (performance.now() - this.started) / 1000);
        this.$('photo-progress').value = elapsed / seconds;
        this.status(`正在优化轮廓 · ${elapsed.toFixed(1)}/${seconds}秒 · 当前匹配${Math.round(this.best.match.dice * 100)}%`);
      }, 250);
      this.batch(token);
    } catch (error) { this.fail(error); }
  }
  offer(cells) {
    const verified = cycleInfo(cells, this.params.wrap, this.params.period), match = compareTarget(this.target, cells);
    if (verified.changed < this.minimumChange) throw new Error('生成结果变化量未通过复验');
    if (this.best && this.bestRevision === this.revision && match.dice < this.best.match.dice - 1e-9) return;
    this.best = { cells: cells.slice(), match, changed: verified.changed }; this.bestRevision = this.revision;
    this.$('photo-metrics').textContent = `自然周期${this.params.period}代 · 目标轮廓匹配${Math.round(match.dice * 100)}% · 首步变化${verified.changed}格`;
    this.animate(); this.buttons();
  }
  batch(token) {
    if (token !== this.epoch || !this.active) return;
    if (this.index >= this.plan.length) { this.stop('本轮计算完成，结果已通过生命规则与周期校验'); return; }
    const worker = new Worker(new URL('./image-worker.mjs', import.meta.url), { type: 'module' }); this.worker = worker;
    worker.onerror = event => { event.preventDefault(); if (token === this.epoch) this.fail(new Error(event.message || '图片优化任务启动失败')); };
    worker.onmessage = ({ data }) => {
      if (token !== this.epoch || this.worker !== worker) return;
      try {
        if (data.type === 'candidate') this.offer(new Uint8Array(data.cells));
        else if (data.type === 'checkpoint') {
          const state = new Uint8Array(data.state); checkCells(state);
          const info = cycleInfo(state, this.params.wrap, this.params.period);
          if (info.changed < this.minimumChange || !Number.isInteger(data.index) || data.index <= this.index || data.index > this.plan.length) throw new Error('图片优化任务状态无效');
          this.state = state; this.index = data.index; worker.terminate(); this.worker = null; this.batch(token);
        } else throw new Error(data.message || '图片优化任务返回未知状态');
      } catch (error) { this.fail(error); }
    };
    const target = this.target.slice().buffer, state = this.state.slice().buffer;
    worker.postMessage({ target, state, windows: this.plan, index: this.index, period: this.params.period, wrap: this.params.wrap, minimumChange: this.minimumChange }, [target, state]);
  }
  fail(error) { this.stop(`优化失败：${error.message}；已有验证结果可预览`); this.error(error); }
  animate() {
    this.pausePreview(); if (!this.best || !this.dialog.open) return;
    let cells = this.best.cells.slice(), generation = 0;
    const frame = () => {
      if (!this.dialog.open || !this.best || document.hidden) return;
      renderBoard(this.$('photo-result'), cells); this.$('photo-phase').textContent = `第${generation}代`;
      cells = stepCells(cells, this.params.wrap); generation++;
      this.previewTimer = setTimeout(frame, this.params.interval);
    };
    frame();
  }
  pausePreview() { clearTimeout(this.previewTimer); this.previewTimer = null; }
  accept() {
    if (!this.best) return;
    try {
      cycleInfo(this.best.cells, this.params.wrap, this.params.period);
      const seed = { cells: this.best.cells.slice(), wrap: this.params.wrap, interval: this.params.interval, name: '图片生成', loopPeriods: { wrap: null, finite: null, [this.params.wrap ? 'wrap' : 'finite']: this.params.period } };
      this.stop(); this.apply(seed); this.dialog.close();
    } catch (error) { this.fail(error); }
  }
}
