import { Editor, COLS, ROWS, COUNT, boardInfo, stepCells, exportWorld, importWorld } from './world.mjs';
import { keyBoard, keyText, keyValue, randomKey } from './codec.mjs';
import { BoardView } from './viewport.mjs';

export function renderBoard(canvas, cells, cursor) {
  const context = canvas.getContext('2d'), sx = canvas.width / COLS, sy = canvas.height / ROWS;
  context.fillStyle = '#0a2520'; context.fillRect(0, 0, canvas.width, canvas.height);
  for (let bit = 0; bit < COUNT; bit++) {
    const x = bit % COLS, y = Math.floor(bit / COLS);
    context.fillStyle = cells[bit] ? '#d9ef85' : '#29443a';
    context.fillRect(x * sx + (cells[bit] ? 2 : sx / 2 - 1), y * sy + (cells[bit] ? 2 : sy / 2 - 1), cells[bit] ? sx - 4 : 2, cells[bit] ? sy - 4 : 2);
  }
  if (cursor) { context.strokeStyle = '#ffc984'; context.lineWidth = 2; context.strokeRect(cursor[0] * sx + 1, cursor[1] * sy + 1, sx - 2, sy - 2); }
}
export class BoardEditor {
  model = new Editor(keyBoard('0000000001').cells, '0000000001');
  cursor = [0, 0]; pointer = null; locked = false; preview = null; timer = null; importId = 0;
  touches = new Map(); touchBlocked = false; spaceHeld = false; spaceDragged = false;
  constructor({ changed, error, saveFile }) {
    this.changed = changed; this.error = error; this.saveFile = saveFile;
    this.$ = id => document.getElementById(id); this.canvas = this.$('board');
    this.view = new BoardView(this.canvas, this.$('view-scale'));
    this.canvas.addEventListener('pointerdown', e => this.down(e));
    this.canvas.addEventListener('pointermove', e => this.move(e));
    this.canvas.addEventListener('pointerup', e => this.up(e));
    this.canvas.addEventListener('pointercancel', e => this.up(e, true));
    this.canvas.addEventListener('lostpointercapture', e => { if (this.pointer?.id === e.pointerId || this.touches.has(e.pointerId)) this.up(e, true); });
    this.canvas.addEventListener('contextmenu', e => e.preventDefault());
    this.canvas.addEventListener('keydown', e => {
      if (e.code === 'Space') {
        if (e.ctrlKey || e.metaKey) return;
        if (!e.repeat) this.spaceDragged = false;
        this.spaceHeld = true; this.canvas.classList.add('is-panning'); e.preventDefault();
      } else this.key(e);
    });
    this.canvas.addEventListener('keyup', e => {
      if (e.code !== 'Space') return;
      const toggle = this.spaceHeld && !this.spaceDragged;
      this.spaceHeld = false; this.canvas.classList.remove('is-panning');
      if (toggle) this.key(e);
    });
    this.canvas.addEventListener('blur', () => { this.spaceHeld = false; this.canvas.classList.remove('is-panning'); });
    this.canvas.parentElement.addEventListener('wheel', e => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault(); this.view.zoom(this.view.scale * Math.exp(-e.deltaY * .002), this.view.local(e.clientX, e.clientY));
    }, { passive: false });
    for (const button of document.querySelectorAll('[data-tool]')) button.addEventListener('click', () => {
      this.tool = button.dataset.tool;
      for (const item of document.querySelectorAll('[data-tool]')) item.setAttribute('aria-pressed', String(item === button));
    });
    this.tool = 'draw';
    this.$('reset-view').addEventListener('click', () => this.view.reset());
    for (const action of ['undo', 'redo']) this.$(action).addEventListener('click', () => { this.cancelPaint(); this.model[action](); this.update(); });
    this.$('clear-board').addEventListener('click', () => { this.cancelPaint(); this.model.replace(new Uint8Array(COUNT)); this.update(); });
    for (const id of ['wrap', 'interval']) this.$(id).addEventListener('change', () => {
      this.cancelPaint(); this.model.settings(this.$('wrap').checked, Number(this.$('interval').value)); this.update();
    });
    this.$('load-key').addEventListener('click', () => this.loadKey());
    this.$('random').addEventListener('click', () => { this.$('key').value = randomKey(); this.loadKey(); });
    this.$('preview-toggle').addEventListener('click', () => this.preview ? this.endPreview(true) : this.startPreview());
    this.$('preview-reset').addEventListener('click', () => this.endPreview(false));
    this.$('export-world').addEventListener('click', () => this.saveFile(exportWorld(this.model.cells, this.$('wrap').checked, Number(this.$('interval').value)), 'LifePassport-world.json', 'application/json'));
    this.$('import-world').addEventListener('change', async e => {
      const file = e.target.files[0]; if (!file) return;
      const token = ++this.importId;
      try {
        if (file.size > 10000) throw new Error('棋盘JSON文件超出10KB限制');
        const seed = importWorld(await file.text());
        if (token !== this.importId) return;
        if (this.locked || this.preview) throw new Error('正在发送、接收或预览，请结束后重新导入');
        this.apply(seed);
      } catch (failure) { this.error(failure); } finally { e.target.value = ''; }
    });
    this.update(false);
  }
  loadKey() {
    try { const key = keyText(keyValue(this.$('key').value)); this.cancelPaint(); this.model.replace(keyBoard(key).cells, key); this.$('key').value = key; this.update(); }
    catch (failure) { this.error(failure); }
  }
  point(e) {
    const box = this.canvas.getBoundingClientRect();
    if (e.clientX < box.left || e.clientY < box.top || e.clientX >= box.right || e.clientY >= box.bottom) return null;
    return [Math.floor((e.clientX - box.left) * COLS / box.width), Math.floor((e.clientY - box.top) * ROWS / box.height)];
  }
  down(e) {
    if (e.pointerType === 'touch') {
      e.preventDefault(); this.touches.set(e.pointerId, this.view.local(e.clientX, e.clientY)); this.canvas.setPointerCapture(e.pointerId);
      if (this.touches.size >= 2) {
        this.cancelPaint(false); this.touchBlocked = true; this.view.begin([...this.touches.values()]); this.update(); return;
      }
      if (this.touchBlocked) return;
    }
    if (this.locked || this.preview || this.pointer || ![0, 2].includes(e.button)) return;
    if (this.spaceHeld && e.pointerType === 'mouse' && e.button === 0) {
        const viewport = this.canvas.parentElement;
        this.pointer = { id: e.pointerId, pan: true, x: e.clientX, y: e.clientY, left: viewport.scrollLeft, top: viewport.scrollTop };
        this.spaceDragged = true; this.canvas.setPointerCapture(e.pointerId); e.preventDefault();
      return;
    }
    const at = this.point(e); if (!at) return;
    e.preventDefault(); this.canvas.focus({ preventScroll: true }); this.canvas.setPointerCapture(e.pointerId);
    this.model.begin(); this.pointer = { id: e.pointerId, at, alive: e.button === 2 ? false : this.tool === 'draw' };
    this.model.line(...at, ...at, this.pointer.alive); this.cursor = at; this.render();
  }
  move(e) {
    if (this.touches.has(e.pointerId)) {
      this.touches.set(e.pointerId, this.view.local(e.clientX, e.clientY));
      if (this.touchBlocked) { if (this.touches.size >= 2) this.view.move([...this.touches.values()]); return; }
    }
    if (this.pointer?.id !== e.pointerId) return;
    if (this.pointer.pan) { this.canvas.parentElement.scrollTo(this.pointer.left - (e.clientX - this.pointer.x), this.pointer.top - (e.clientY - this.pointer.y)); return; }
    const at = this.point(e); if (!at) return;
    this.model.line(...this.pointer.at, ...at, this.pointer.alive); this.pointer.at = this.cursor = at; this.render();
  }
  up(e, cancel = false) {
    if (this.touches.has(e.pointerId)) {
      this.touches.delete(e.pointerId);
      if (this.touchBlocked) {
        if (this.touches.size >= 2) this.view.begin([...this.touches.values()]); else this.view.gesture = null;
        if (!this.touches.size) this.touchBlocked = false;
        if (this.canvas.hasPointerCapture(e.pointerId)) this.canvas.releasePointerCapture(e.pointerId);
        return;
      }
    }
    if (this.pointer?.id !== e.pointerId) return;
    const pointer = this.pointer, id = pointer.id; this.pointer = null;
    if (!pointer.pan) {
      if (cancel) this.model.cancel();
      else { const at = this.point(e); if (at) this.model.line(...pointer.at, ...at, pointer.alive); this.model.commit(); }
    }
    if (this.canvas.hasPointerCapture(id)) this.canvas.releasePointerCapture(id);
    this.update();
  }
  key(e) {
    if (this.locked || this.preview || this.pointer) return;
    const moves = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (moves[e.key]) { e.preventDefault(); const [dx, dy] = moves[e.key]; this.cursor = [(this.cursor[0] + dx + COLS) % COLS, (this.cursor[1] + dy + ROWS) % ROWS]; this.render(); }
    else if ([' ', 'Enter', 'Backspace', 'Delete'].includes(e.key)) {
      e.preventDefault(); const [x, y] = this.cursor;
      const alive = e.key === ' ' ? !this.model.cells[y * COLS + x] : e.key === 'Enter';
      this.model.begin(); this.model.line(x, y, x, y, alive); this.model.commit(); this.update();
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); this.model[e.shiftKey ? 'redo' : 'undo'](); this.update(); }
  }
  startPreview() {
    if (this.locked || this.pointer) return;
    this.preview = { cells: this.model.cells.slice(), generation: 0, wrap: this.$('wrap').checked };
    const tick = () => {
      if (!this.preview) return;
      this.preview.cells = stepCells(this.preview.cells, this.preview.wrap); this.preview.generation++;
      this.render(); this.timer = setTimeout(tick, Number(this.$('interval').value));
    };
    this.timer = setTimeout(tick, Number(this.$('interval').value)); this.update();
  }
  endPreview(adopt) {
    clearTimeout(this.timer);
    if (this.preview && adopt) {
      const same = this.preview.cells.every((x, i) => x === this.model.cells[i]);
      const mode = this.preview.wrap ? 'wrap' : 'finite', period = this.model.loopPeriods?.[mode];
      const periods = same ? this.model.loopPeriods : period > 1 ? { wrap: null, finite: null, [mode]: period } : null;
      this.model.replace(this.preview.cells, same ? this.model.key : null, same || period > 1 ? this.model.name : null, periods);
    }
    this.preview = null; this.update();
  }
  setLocked(value) {
    if (value && this.pointer) {
      this.cancelPaint(); this.render();
    }
    this.locked = value; this.canvas.setAttribute('aria-disabled', String(value)); this.buttons();
  }
  cancelPaint(release = true) {
    const pointer = this.pointer; this.pointer = null; this.model.cancel();
    if (release && pointer && this.canvas.hasPointerCapture(pointer.id)) this.canvas.releasePointerCapture(pointer.id);
  }
  buttons() {
    for (const el of document.querySelectorAll('[data-edit]')) el.disabled = this.locked || Boolean(this.preview);
    this.$('undo').disabled ||= !this.model.past.length;
    this.$('redo').disabled ||= !this.model.future.length;
    this.$('preview-toggle').disabled = this.locked;
    this.$('preview-toggle').textContent = this.preview ? '暂停并采用当前代' : '预览演化';
    this.$('preview-reset').disabled = !this.preview;
  }
  render() {
    const cells = this.preview?.cells ?? this.model.cells, info = boardInfo(cells);
    renderBoard(this.canvas, cells, this.canvas === document.activeElement ? this.cursor : null);
    this.$('population').textContent = `${info.population} 个生命`;
    this.$('board-crc').textContent = `CRC ${info.crc.toString(16).padStart(8, '0').toUpperCase()}`;
    this.$('board-mode').textContent = this.preview ? `预览第${this.preview.generation}代` : this.model.key ? `世界码 ${this.model.key}` : this.model.name ? `图案：${this.model.name}` : '手绘棋盘';
    this.$('cell-position').textContent = `第${this.cursor[1] + 1}行 · 第${this.cursor[0] + 1}列`;
    const periods = this.model.loopPeriods, period = periods?.[this.$('wrap').checked ? 'wrap' : 'finite'];
    const cycle = this.$('cycle-info'); cycle.hidden = Boolean(this.preview) || !periods || !Object.values(periods).some(x => x > 1);
    cycle.textContent = period > 1 ? `自然循环 · ${period}代回到原图案 · 约${Number((period * Number(this.$('interval').value) / 1000).toFixed(2))}秒一轮` : '当前边界下未验证自然循环';
  }
  update(notify = true) { this.$('wrap').checked = this.model.wrap; this.$('interval').value = String(this.model.interval); this.render(); this.buttons(); if (notify) this.changed(); }
  apply(seed) { this.cancelPaint(); this.model.replace(seed.cells, seed.key ?? null, seed.name ?? null, seed.loopPeriods ?? null, { wrap: seed.wrap, interval: seed.interval }); this.update(); }
  preset(cells, name, periods) { this.cancelPaint(); this.model.replace(cells, null, name, periods ?? null); this.update(); }
}
