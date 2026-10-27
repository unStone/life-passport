import './style.css';
import './editor.css';
import './catalog.css';
import './image.css';
import { makeFrame, dataPattern, hex } from './codec.mjs';
import { Player, prepareEncoder, encodeFrame, toneWave, joinWaves, wavBytes } from './audio.mjs';
import { cases } from './cases.mjs';
import { loadRecords, saveRecord } from './records.mjs';
import { BoardEditor } from './board-editor.mjs';
import { boardFrames, encodeBoard } from './board-transport.mjs';
import { boardInfo } from './world.mjs';
import { ReceiveUI } from './receive-ui.mjs';
import { CatalogUI } from './catalog-ui.mjs';
import { ImageUI } from './image-ui.mjs';

const $ = (id) => document.getElementById(id);
const player = new Player();
let active = 'seed', ready = false, busy = false, epoch = 0, seq = crypto.getRandomValues(new Uint8Array(1))[0];
let prepared, records, currentFrame;
let editor, receiverUI, imageUI;
const error = (value) => { $('error').textContent = value instanceof Error ? value.message : String(value); $('error').hidden = false; };
const clearError = () => { $('error').hidden = true; };
function controls() {
  const receiving = receiverUI?.active || Boolean(receiverUI?.pending), blocked = busy || receiving || Boolean(imageUI?.active);
  for (const field of document.querySelectorAll('input,select')) field.disabled = blocked;
  for (const tab of document.querySelectorAll('[data-tab]')) tab.disabled = busy || Boolean(receiverUI?.pending);
  $('count').disabled = blocked || $('loop').checked;
  $('wrap').disabled = blocked || Boolean(editor?.preview);
  $('play').disabled = blocked || Boolean(editor?.preview) || ['records', 'receive'].includes(active) || (active !== 'tones' && !ready);
  $('download').disabled = $('play').disabled;
  $('listen-start').disabled = blocked || Boolean(editor?.preview);
  $('loop-label').textContent = active === 'seed' && !editor?.model.key ? '重复播放声音 · 最长180秒' : '重复播放声音 · 最长60秒';
  editor?.setLocked(blocked);
  $('play').textContent = active === 'seed' ? '播放种子音 ▶' : active === 'tones' ? '播放测试音 ▶' : '播放数据音 ▶';
}
editor = new BoardEditor({ changed: () => refresh(), error, saveFile });
receiverUI = new ReceiveUI({ apply: seed => { editor.apply(seed); document.querySelector('[data-tab=seed]').click(); }, changed: controls, error });
new CatalogUI({ apply: (cells, name, periods) => editor.preset(cells, name, periods), error, boundary: () => $('wrap').checked, interval: () => Number($('interval').value) });
imageUI = new ImageUI({ apply: seed => editor.apply(seed), changed: controls, error, boundary: () => $('wrap').checked, interval: () => Number($('interval').value) });
function preparePacket() {
  if (active === 'seed') {
    const { cells, key } = editor.model, wrap = $('wrap').checked, interval = Number($('interval').value);
    prepared = { kind: key ? 'key' : 'board', key, cells: cells.slice(), wrap, interval };
    const count = key ? 1 : 1 + Math.ceil(encodeBoard(cells).data.length / 5), info = boardInfo(cells);
    $('send-mode').textContent = key ? '发送方式：世界码短包' : '发送方式：完整手绘棋盘';
    $('send-summary').textContent = `${count}包 · ${info.population}个生命 · CRC ${info.crc.toString(16).padStart(8, '0').toUpperCase()}。${key ? '保留快速世界码同步。' : '收齐并校验后才会预览；可循环补齐丢失分片。'}`;
    return;
  }
  prepared = { kind: 'diag', data: dataPattern($('pattern').value), corrupt: $('corrupt').checked };
  currentFrame = makeFrame({ ...prepared, seq });
  $('packet').textContent = hex(currentFrame);
  $('packet-info').textContent = `序号 ${seq} · 内容 ${hex(currentFrame.slice(5, 12))}${prepared.corrupt ? ' · 错误CRC测试' : ''}`;
}
function stop() { epoch++; player.stop(); busy = false; $('progress').value = 0; $('stop').disabled = true; controls(); $('status').textContent = '播放已停止'; }
function refresh() {
  clearError();
  try { if (active === 'seed') editor.render(); if (active === 'seed' || active === 'data') preparePacket(); } catch (failure) { error(failure); }
  controls();
}
for (const button of document.querySelectorAll('[data-tab]')) button.addEventListener('click', async () => {
  stop();
  try { if (receiverUI.active && button.dataset.tab !== 'receive') await receiverUI.stop(); }
  catch (failure) { error(failure); return; }
  if (editor.preview) editor.endPreview(true);
  active = button.dataset.tab;
  document.querySelector('.player').hidden = ['receive', 'records'].includes(active);
  document.querySelector('.transport').hidden = ['receive', 'records'].includes(active);
  for (const item of document.querySelectorAll('[data-tab]')) item.setAttribute('aria-selected', String(item === button));
  for (const panel of document.querySelectorAll('.panel')) panel.hidden = panel.id !== active;
  refresh();
});
for (const id of ['pattern', 'corrupt']) $(id).addEventListener('change', refresh);
$('volume').addEventListener('input', () => { $('volume-value').textContent = `${$('volume').value}%`; });
$('loop').addEventListener('change', () => { if ($('loop').checked) $('count').value = '1'; $('count').disabled = $('loop').checked; });
$('stop').addEventListener('click', stop);

async function waveform(rate, token) {
  const volume = Number($('volume').value);
  if (active === 'tones') {
    const tone = $('tone').value;
    if (tone === 'sweep') return joinWaves([1000, 2000, 3000, 4000, 5000, 6000, 7000].map((hz) => toneWave([hz], rate, 1, volume)), .25);
    const frequencies = tone === 'dual' ? [1000, 3000] : tone === 'six' ? [1875, 2625, 3375, 4125, 4875, 5625] : [Number(tone)];
    return joinWaves([toneWave(frequencies, rate, 1, volume)]);
  }
  if (!['seed', 'data'].includes(active)) throw new Error('请切换到编辑、数据或频段页面后播放');
  preparePacket();
  const count = active === 'data' ? Number($('count').value) : 1;
  const waves = [], first = seq;
  const snapshot = { ...prepared }, frames = snapshot.kind === 'board' ? boardFrames(snapshot.cells, snapshot) : Array.from({ length: count }, (_, i) => makeFrame({ ...snapshot, seq: (first + i) & 255 }));
  for (let i = 0; i < frames.length; i++) {
    if (token !== epoch) throw new Error('声音生成已取消');
    currentFrame = frames[i];
    const encoded = await encodeFrame(currentFrame, { protocol: $('protocol').value, sampleRate: rate, volume });
    if (token !== epoch) throw new Error('声音生成已取消');
    waves.push(encoded);
    $('status').textContent = `正在生成声音 · ${i + 1}/${frames.length}包`;
  }
  seq = (first + count) & 255;
  $('packet').textContent = hex(currentFrame);
  $('packet-info').textContent = `末包序号 ${currentFrame[4]} · 内容 ${hex(currentFrame.slice(5, 12))}${prepared.corrupt ? ' · 错误CRC测试' : ''}`;
  $('details').textContent = snapshot.kind === 'board' ? `完整棋盘 · ${frames.length - 1}分片 · 请对照接收端CRC` : `${count}帧 · 序号${first}–${currentFrame[4]} · 末包内容${hex(currentFrame.slice(5, 12))}`;
  return { ...joinWaves(waves), loopSeconds: snapshot.kind === 'board' ? 180 : 60 };
}
async function action(download = false) {
  stop(); clearError(); const token = epoch;
  busy = true; controls(); $('stop').disabled = false; $('status').textContent = '正在准备声音…';
  try {
    // Resume is requested inside the click gesture before waiting for WASM.
    const rate = download ? 48000 : await player.resume();
    const wave = await waveform(rate, token);
    if (token !== epoch) return;
    if (download) {
      saveFile(wavBytes(wave), 'LifePassport-LP1.wav', 'audio/wav');
      $('status').textContent = 'WAV已生成，请查看下载文件'; busy = false; controls(); $('stop').disabled = true;
      return;
    }
    $('status').textContent = `播放中 · 一轮${wave.seconds.toFixed(2)}秒${$('loop').checked ? ' · 循环' : ''}`;
    const started = performance.now();
    player.play(wave, $('loop').checked, () => {
      if (token !== epoch) return;
      busy = false; controls(); $('stop').disabled = true; $('progress').value = 1;
      $('status').textContent = '播放结束，请查看设备结果';
    }, wave.loopSeconds ?? 60);
    const tick = () => {
      if (token !== epoch || !player.source) return;
      $('progress').value = ((performance.now() - started) / 1000 % wave.seconds) / wave.seconds;
      requestAnimationFrame(tick);
    };
    tick();
  } catch (failure) {
    if (token === epoch) { player.stop(); busy = false; controls(); $('stop').disabled = true; $('status').textContent = '本次操作失败'; error(failure); }
  }
}
$('play').addEventListener('click', () => action());
$('download').addEventListener('click', () => action(true));
function saveFile(data, name, type) {
  const url = URL.createObjectURL(new Blob([data], { type })), link = document.createElement('a');
  link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 30000);
}
for (const item of cases) {
  const details = document.createElement('details'), summary = document.createElement('summary');
  summary.textContent = `${item.id} · ${item.title}`; details.append(summary);
  for (const text of [item.steps, `预期：${item.expected}`]) { const p = document.createElement('p'); p.textContent = text; details.append(p); }
  $('cases').append(details);
  $('case-id').add(new Option(`${item.id} ${item.title}`, item.id));
}
function renderRecords() {
  $('record-list').replaceChildren();
  if (records.length === 0) { $('record-list').textContent = '还没有记录，按用例测试后填写结果。'; return; }
  for (const item of [...records].reverse()) {
    const row = document.createElement('div'); row.className = 'record-row';
    const title = document.createElement('strong'), note = document.createElement('small');
    title.textContent = `${item.caseId} · ${item.successes}/${item.attempts} · ${item.distance}cm`;
    note.textContent = `${item.phone} · ${item.protocol} · 编码音量${item.volume}% · ${item.notes}`;
    row.append(title, note); $('record-list').append(row);
  }
}
try { records = loadRecords(localStorage); renderRecords(); } catch (failure) { records = null; error(new Error(`记录读取失败：${failure.message}`)); $('record-list').textContent = '本机记录读取失败，原数据未覆盖'; $('record-form').querySelector('[type=submit]').disabled = true; $('export').disabled = true; }
$('record-form').addEventListener('submit', (event) => {
  event.preventDefault(); clearError();
  try {
    if (!records) throw new Error('记录不可用，未覆盖原数据');
    records = saveRecord(localStorage, records, { date: new Date().toISOString(), caseId: $('case-id').value, phone: $('phone').value.trim(), distance: Number($('distance').value), successes: Number($('successes').value), attempts: Number($('attempts').value), notes: $('notes').value.trim(), protocol: $('protocol').value, volume: Number($('volume').value), version: 'LP1' });
    renderRecords();
  } catch (failure) { error(failure); }
});
$('export').addEventListener('click', () => { if (records) saveFile(JSON.stringify({ v: 1, records }, null, 2), 'LifePassport-test-results.json', 'application/json'); });
function suspend() {
  stop();
  if (editor.preview) editor.endPreview(true);
  receiverUI.stop(Boolean(receiverUI.pending)).catch(error);
}
window.addEventListener('pagehide', suspend);
document.addEventListener('visibilitychange', () => { if (document.hidden) suspend(); });
refresh();
prepareEncoder().then(() => { ready = true; $('encoder-state').textContent = '声码已就绪 · 发送无需麦克风权限，收音时才申请'; controls(); }).catch((failure) => { $('encoder-state').textContent = '声码加载失败'; error(failure); });
