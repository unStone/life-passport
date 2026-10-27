import { improvePatch } from './image-solver.mjs';
import { checkCells } from './world.mjs';
self.onmessage = ({ data }) => {
  try {
    const target = new Uint8Array(data.target); let state = new Uint8Array(data.state);
    checkCells(target); checkCells(state);
    if (!Array.isArray(data.windows) || !Number.isInteger(data.index) || data.index < 0 || data.index >= data.windows.length) throw new Error('图片计算任务进度无效');
    let index = data.index;
    // A short batch bounds retained MiniSat heaps on mobile browsers.
    for (; index < Math.min(data.index + 4, data.windows.length); index++) {
      state = improvePatch(state, target, { period: data.period, wrap: data.wrap, minimumChange: data.minimumChange, rectangle: data.windows[index] }, cells => {
        const copy = cells.slice().buffer; self.postMessage({ type: 'candidate', cells: copy }, [copy]);
      });
    }
    self.postMessage({ type: 'checkpoint', state: state.buffer, index }, [state.buffer]);
  } catch (error) { self.postMessage({ type: 'error', message: error.message }); }
  self.close();
};
