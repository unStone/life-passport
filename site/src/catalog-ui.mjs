import { validateCatalog } from './catalog.mjs';
const PAGE_SIZE = 24;

export class CatalogUI {
  loaded = null; loading = false; category = ''; page = 0; filter = ''; result = [];
  constructor({ apply, error, boundary, interval }) {
    this.apply = apply; this.error = error; this.boundary = boundary; this.interval = interval; this.$ = id => document.getElementById(id);
    this.dialog = this.$('catalog-dialog');
    this.$('catalog-open').addEventListener('click', () => this.open());
    this.$('catalog-close').addEventListener('click', () => this.dialog.close());
    this.$('catalog-retry').addEventListener('click', () => this.load());
    this.$('catalog-search').addEventListener('input', e => { this.filter = e.target.value.toLocaleLowerCase().trim(); this.page = 0; this.render(); });
    this.$('catalog-prev').addEventListener('click', () => { if (this.page) this.page--; this.render(); });
    this.$('catalog-next').addEventListener('click', () => { if ((this.page + 1) * PAGE_SIZE < this.result.length) this.page++; this.render(); });
  }
  period(entry) { return entry.loopPeriods?.[this.boundary() ? 'wrap' : 'finite'] ?? null; }
  eligible(entry) { return entry.category !== 'oscillator' || this.period(entry) > 1; }
  open() {
    this.category = ''; this.page = 0; this.filter = ''; this.$('catalog-search').value = '';
    this.dialog.showModal();
    if (!this.loaded) this.load(); else { this.categories(); this.render(); }
  }
  async load() {
    if (this.loading) return;
    this.loading = true;
    const controller = new AbortController(), deadline = setTimeout(() => controller.abort(), 20000);
    this.$('catalog-status').textContent = '正在加载并校验图鉴…'; this.$('catalog-retry').hidden = true;
    try {
      const response = await fetch(new URL('patterns/catalog.json', document.baseURI), { signal: controller.signal });
      if (!response.ok) throw new Error(`图鉴加载失败：HTTP ${response.status}`);
      const text = await response.text(); if (text.length > 4000000) throw new Error('图鉴文件超出4MB限制');
      this.loaded = validateCatalog(JSON.parse(text)); this.categories(); this.render();
    } catch (error) { this.loaded = null; this.$('catalog-status').textContent = error.message; this.$('catalog-retry').hidden = false; this.error(error); }
    finally { clearTimeout(deadline); this.loading = false; }
  }
  categories() {
    this.$('catalog-categories').replaceChildren();
    const items = [{ id: '', label: '全部', count: this.loaded.data.entries.length }, ...this.loaded.data.categories.map(item => item.id === 'oscillator' ? { ...item, count: this.loaded.data.entries.filter(x => x.category === item.id && this.eligible(x)).length } : item)];
    for (const item of items) {
      const button = document.createElement('button'); button.type = 'button'; button.dataset.category = item.id;
      button.textContent = `${item.label} ${item.count}`;
      button.addEventListener('click', () => { this.category = item.id; this.page = 0; this.render(); });
      this.$('catalog-categories').append(button);
    }
  }
  thumbnail(canvas, entry) {
    const context = canvas.getContext('2d'), cells = this.loaded.cells.get(entry.id);
    context.fillStyle = '#0a2520'; context.fillRect(0, 0, canvas.width, canvas.height);
    const size = Math.min(20, (canvas.width - 24) / entry.width, (canvas.height - 24) / entry.height);
    const dx = (canvas.width - entry.width * size) / 2, dy = (canvas.height - entry.height * size) / 2;
    const x0 = Math.floor((36 - entry.width) / 2), y0 = Math.floor((32 - entry.height) / 2);
    context.fillStyle = '#d9ef85';
    for (let y = 0; y < entry.height; y++) for (let x = 0; x < entry.width; x++) if (cells[(y0 + y) * 36 + x0 + x]) context.fillRect(dx + x * size + 1, dy + y * size + 1, Math.max(1, size - 2), Math.max(1, size - 2));
  }
  render() {
    if (!this.loaded) return;
    const { data } = this.loaded;
    this.result = data.entries.filter(entry => (!this.category || (this.category === entry.category && this.eligible(entry))) && `${entry.label} ${entry.name} ${entry.aliases?.join(' ') ?? ''} ${entry.description}`.toLocaleLowerCase().includes(this.filter));
    for (const button of this.$('catalog-categories').querySelectorAll('button')) button.setAttribute('aria-pressed', String(button.dataset.category === this.category));
    this.$('catalog-grid').replaceChildren();
    const start = this.page * PAGE_SIZE, end = Math.min(start + PAGE_SIZE, this.result.length);
    this.$('catalog-status').textContent = this.result.length ? `找到${this.result.length}个 · 显示${start + 1}–${end} · 载入后可撤销` : '没有匹配图案，试试其他名称或分类';
    this.$('catalog-prev').disabled = this.page === 0;
    this.$('catalog-next').disabled = end >= this.result.length;
    for (const entry of this.result.slice(start, end)) {
      const card = document.createElement('article'); card.className = 'preset-card';
      const button = document.createElement('button'); button.type = 'button'; button.className = 'preset-load'; button.dataset.presetId = entry.id;
      button.setAttribute('aria-label', `载入${entry.label}`);
      const canvas = document.createElement('canvas'); canvas.width = 300; canvas.height = 160; canvas.setAttribute('aria-hidden', 'true');
      const name = document.createElement('strong'); name.textContent = entry.label;
      const original = document.createElement('small'); original.textContent = entry.label === entry.name ? `${entry.width}×${entry.height} · ${entry.population}个细胞` : `${entry.name} · ${entry.width}×${entry.height}`;
      const description = document.createElement('p'); description.textContent = entry.description;
      const period = this.period(entry);
      if (period > 1) description.textContent = `自然循环：${period}代回到原图案，约${Number((period * this.interval() / 1000).toFixed(2))}秒一轮。`;
      const source = document.createElement('a'); source.href = entry.source; source.target = '_blank'; source.rel = 'noopener noreferrer'; source.textContent = '原始来源 ↗';
      button.append(canvas, name, original);
      button.addEventListener('click', () => { this.apply(this.loaded.cells.get(entry.id), entry.label, entry.loopPeriods); this.dialog.close(); });
      card.append(button, description, source); this.$('catalog-grid').append(card); this.thumbnail(canvas, entry);
    }
    this.$('catalog-count').textContent = `${data.entries.length}个完整图案 · Life Lexicon`;
  }
}
