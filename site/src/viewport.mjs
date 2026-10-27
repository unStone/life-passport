export function clampScale(value) {
  if (!Number.isFinite(value)) throw new Error('视野缩放比例无效');
  return Math.max(1, Math.min(6, value));
}
export function zoomAt(view, requested, from, to = from) {
  const scale = clampScale(requested), ratio = scale / view.scale;
  return { scale, left: (view.left + from[0]) * ratio - to[0], top: (view.top + from[1]) * ratio - to[1] };
}
export function touchPair(points) {
  if (points.length < 2) throw new Error('双指手势需要两个触点');
  const [a, b] = points;
  return { center: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], distance: Math.max(1, Math.hypot(a[0] - b[0], a[1] - b[1])) };
}
export class BoardView {
  scale = 1; gesture = null;
  constructor(canvas, label) { this.canvas = canvas; this.viewport = canvas.parentElement; this.label = label; }
  snapshot() { return { scale: this.scale, left: this.viewport.scrollLeft, top: this.viewport.scrollTop }; }
  local(x, y) { const box = this.viewport.getBoundingClientRect(); return [x - box.left, y - box.top]; }
  apply(view) {
    this.scale = view.scale; this.canvas.style.width = `${view.scale * 100}%`;
    this.viewport.scrollLeft = view.left; this.viewport.scrollTop = view.top;
    this.label.textContent = `${Math.round(view.scale * 100)}%`;
  }
  zoom(scale, point) { this.apply(zoomAt(this.snapshot(), scale, point)); }
  begin(points) { this.gesture = { ...this.snapshot(), ...touchPair(points) }; }
  move(points) {
    if (!this.gesture) return;
    const current = touchPair(points), start = this.gesture;
    this.apply(zoomAt(start, start.scale * current.distance / start.distance, start.center, current.center));
  }
  reset() { this.gesture = null; this.apply({ scale: 1, left: 0, top: 0 }); }
}
