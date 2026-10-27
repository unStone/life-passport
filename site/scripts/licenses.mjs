import { readFile, writeFile } from 'node:fs/promises';
const root = new URL('../../', import.meta.url);
const sources = [
  ['Life Passport — MIT', new URL('LICENSE', root)],
  ['GGWave npm 0.4.0 / native 060aec73 — MIT', new URL('components/ggwave/upstream/LICENSE', root)],
  ['GGWave Reed-Solomon dependency', new URL('components/ggwave/upstream/src/reed-solomon/LICENSE', root)],
  ['crc-32 1.2.2 — Apache-2.0', new URL('../node_modules/crc-32/LICENSE', import.meta.url)],
  ['wavefile 11.0.0 — MIT', new URL('../node_modules/wavefile/LICENSE', import.meta.url)],
  ['Noto Sans SC copyright', new URL('assets/fonts/NOTICE.txt', root)],
  ['Noto Sans SC — OFL-1.1', new URL('assets/fonts/OFL.txt', root)],
];
const sections = [];
sections.push('FFT routines: Copyright Takuya OOURA, 1996–2001. https://www.kurims.kyoto-u.ac.jp/~ooura/fft.html');
for (const [name, path] of sources) {
  const license = (await readFile(path, 'utf8')).split(/\r?\n/).map((line) => line.trimEnd()).join('\n');
  sections.push(`${name}\n\n${license}`);
}
await writeFile(new URL('../public/LICENSES.txt', import.meta.url), sections.join('\n\n'));
