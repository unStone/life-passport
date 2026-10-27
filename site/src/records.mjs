const STORE = 'life-passport-acoustic-records-v1';
function validate(record) {
  if (!record || !/^TC(?:0[1-9]|1[0-4])$/.test(record.caseId) || !['six', 'dual'].includes(record.protocol) || record.version !== 'LP1' || !Number.isFinite(Date.parse(record.date)) || typeof record.phone !== 'string' || record.phone.length > 80 || typeof record.notes !== 'string' || record.notes.length > 300 || !Number.isInteger(record.volume) || record.volume < 5 || record.volume > 50) throw new Error('测试记录格式无效，未覆盖原数据');
  if (!Number.isInteger(record.attempts) || record.attempts < 1 || record.attempts > 100 || !Number.isInteger(record.successes) || record.successes < 0 || record.successes > record.attempts || !Number.isFinite(record.distance) || record.distance < 1 || record.distance > 1000) throw new Error('请检查总次数、成功次数和距离');
}
export function loadRecords(storage) {
  const text = storage.getItem(STORE);
  if (text === null) return [];
  const data = JSON.parse(text);
  if (data.v !== 1 || !Array.isArray(data.records) || data.records.length > 1000) throw new Error('本机记录格式无效，未覆盖原数据');
  data.records.forEach(validate);
  return data.records;
}
export function saveRecord(storage, records, record) {
  validate(record);
  if (records.length >= 1000) throw new Error('本机会话记录已满，请先导出结果');
  const next = [...records, record];
  storage.setItem(STORE, JSON.stringify({ v: 1, records: next }));
  return next;
}
