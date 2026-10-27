import { readFile, writeFile, copyFile } from 'node:fs/promises';
import { unpackCells, stepCells, loopPeriod } from '../../site/src/world.mjs';
const root = new URL('../../', import.meta.url);
const catalog = JSON.parse(await readFile(new URL('assets/patterns/catalog.json', root), 'utf8'));
const modules = [];
for (const period of [2, 3, 4]) {
  const candidates = [];
  for (const entry of catalog.entries) {
    if (entry.loopPeriods?.finite !== period || entry.loopPeriods.wrap !== period) continue;
    let cells = unpackCells(Uint8Array.from(entry.bits));
    const phases = [];
    for (let t = 0; t < period; t++) {
      const points = []; cells.forEach((alive, bit) => { if (alive) points.push([bit % 36, Math.floor(bit / 36)]); });
      phases.push(points); cells = stepCells(cells, false);
    }
    const all = phases.flat(), left = Math.min(...all.map(x => x[0])), top = Math.min(...all.map(x => x[1]));
    const right = Math.max(...all.map(x => x[0])), bottom = Math.max(...all.map(x => x[1]));
    if (left < 2 || top < 2 || right > 33 || bottom > 29 || loopPeriod(cells, false) !== period) continue;
    const width = right - left + 1, height = bottom - top + 1;
    candidates.push({ period, name: entry.name, source: entry.source, width, height,
      phases: phases.map(points => points.map(([x, y]) => [x - left, y - top])) });
  }
  candidates.sort((a, b) => Math.max(a.width, a.height) - Math.max(b.width, b.height) || a.phases[0].length - b.phases[0].length || a.name.localeCompare(b.name));
  if (!candidates.length) throw new Error(`No verified isolated module for period ${period}`);
  modules.push(candidates[0]);
}
const data = { v: 1, license: 'CC-BY-SA-3.0', sourceCommit: catalog.source.commit, modules };
const output = new URL('assets/patterns/image-modules.json', root);
await writeFile(output, JSON.stringify(data) + '\n');
await copyFile(output, new URL('site/src/image-modules.json', root));
console.log(JSON.stringify(modules.map(({ period, name, width, height }) => ({ period, name, width, height }))));
