import './style.css';
import { keyValue, keyText, keyBoard, randomKey, makeFrame, dataPattern, hex } from './codec.mjs';
import { Player, prepareEncoder, encodeFrame, toneWave, joinWaves, wavBytes } from './audio.mjs';
import { cases } from './cases.mjs';
import { loadRecords, saveRecord } from './records.mjs';

const $ = (id) => document.getElementById(id);
const player = new Player();
let active = 'seed', ready = false, busy = false, epoch = 0, seq = crypto.getRandomValues(new Uint8Array(1))[0];
let prepared, records, currentFrame;
const error = (value) => { $('error').textContent = value instanceof Error ? value.message : String(value); $('error').hidden = false; };
const clearError = () => { $('error').hidden = true; };
function controls() {
  for (const field of document.querySelectorAll('input,select,[data-tab],#random')) field.disabled = busy;
  $('count').disabled = busy || $('loop').checked;
  $('play').disabled = busy || active === 'records' || (active !== 'tones' && !ready);
  $('download').disabled = busy || active === 'records' || (active !== 'tones' && !ready);
  $('play').textContent = active === 'seed' ? '播放种子音 ▶' : active === 'tones' ? '播放测试音 ▶' : '播放数据音 ▶';
}
function drawBoard() {
  const canvas = $('board'), context = canvas.getContext('2d');
  context.fillStyle = '#0a2520'; context.fillRect(0, 0, canvas.width, canvas.height);
  try {
    const board = keyBoard($('key').value);
    $('population').textContent = `${board.population} 个生命`;
    $('board-crc').textContent = `CRC ${board.crc.toString(16).padStart(8, '0').toUpperCase()}`;
    for (let y = 0; y < 32; y++) for (let x = 0; x < 36; x++) {
      context.fillStyle = board.cells[y * 36 + x] ? '#d9ef85' : '#29443a';
      if (board.cells[y * 36 + x]) context.fillRect(x * 20 + 2, y * 20 + 2, 16, 16);
      else context.fillRect(x * 20 + 9, y * 20 + 9, 2, 2);
    }
  } catch (failure) { $('population').textContent = '待输入'; $('board-crc').textContent = 'CRC —'; throw failure; }
}
function preparePacket() {
  const kind = active === 'data' ? 'diag' : 'key';
  prepared = { kind, key: $('key').value, wrap: $('wrap').checked, interval: Number($('interval').value), data: kind === 'diag' ? dataPattern($('pattern').value) : undefined, corrupt: kind === 'diag' && $('corrupt').checked };
  currentFrame = makeFrame({ ...prepared, seq });
  $('packet').textContent = hex(currentFrame);
  $('packet-info').textContent = `序号 ${seq} · 内容 ${hex(currentFrame.slice(5, 12))}${prepared.corrupt ? ' · 错误CRC测试' : ''}`;
}
function stop() { epoch++; player.stop(); busy = false; $('progress').value = 0; $('stop').disabled = true; controls(); $('status').textContent = '播放已停止'; }
function refresh() {
  clearError();
  try { if (active === 'seed') drawBoard(); if (active !== 'tones' && active !== 'records') preparePacket(); } catch (failure) { error(failure); }
  controls();
}
for (const button of document.querySelectorAll('[data-tab]')) button.addEventListener('click', () => {
  stop(); active = button.dataset.tab;
  for (const item of document.querySelectorAll('[data-tab]')) item.setAttribute('aria-selected', String(item === button));
  for (const panel of document.querySelectorAll('.panel')) panel.hidden = panel.id !== active;
  refresh();
});
$('random').addEventListener('click', () => { $('key').value = randomKey(); seq = (seq + 1) & 255; refresh(); });
$('key').addEventListener('input', () => { seq = (seq + 1) & 255; refresh(); });
$('key').addEventListener('blur', () => { try { $('key').value = keyText(keyValue($('key').value)); refresh(); } catch (failure) { error(failure); } });
for (const id of ['wrap', 'interval', 'pattern', 'corrupt']) $(id).addEventListener('change', refresh);
$('volume').addEventListener('input', () => { $('volume-value').textContent = `${$('volume').value}%`; });
$('loop').addEventListener('change', () => { if ($('loop').checked) $('count').value = '1'; $('count').disabled = $('loop').checked; });
$('stop').addEventListener('click', stop);

async function waveform(rate) {
  const volume = Number($('volume').value);
  if (active === 'tones') {
    const tone = $('tone').value;
    if (tone === 'sweep') return joinWaves([1000, 2000, 3000, 4000, 5000, 6000, 7000].map((hz) => toneWave([hz], rate, 1, volume)), .25);
    const frequencies = tone === 'dual' ? [1000, 3000] : tone === 'six' ? [1875, 2625, 3375, 4125, 4875, 5625] : [Number(tone)];
    return joinWaves([toneWave(frequencies, rate, 1, volume)]);
  }
  preparePacket();
  const count = active === 'data' ? Number($('count').value) : 1;
  const waves = [], first = seq;
  for (let i = 0; i < count; i++) {
    currentFrame = makeFrame({ ...prepared, seq: (first + i) & 255 });
    waves.push(await encodeFrame(currentFrame, { protocol: $('protocol').value, sampleRate: rate, volume }));
  }
  seq = (first + count) & 255;
  $('packet').textContent = hex(currentFrame);
  $('packet-info').textContent = `末包序号 ${currentFrame[4]} · 内容 ${hex(currentFrame.slice(5, 12))}${prepared.corrupt ? ' · 错误CRC测试' : ''}`;
  $('details').textContent = `${count}帧 · 序号${first}–${currentFrame[4]} · 末包内容${hex(currentFrame.slice(5, 12))}`;
  return joinWaves(waves);
}
async function action(download = false) {
  stop(); clearError(); const token = epoch;
  busy = true; controls(); $('stop').disabled = false; $('status').textContent = '正在准备声音…';
  try {
    // Resume is requested inside the click gesture before waiting for WASM.
    const rate = download ? 48000 : await player.resume();
    const wave = await waveform(rate);
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
    });
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
window.addEventListener('pagehide', () => player.stop());
refresh();
prepareEncoder().then(() => { ready = true; $('encoder-state').textContent = '声码已就绪 · 手机不需要麦克风权限'; controls(); }).catch((failure) => { $('encoder-state').textContent = '声码加载失败'; error(failure); });
