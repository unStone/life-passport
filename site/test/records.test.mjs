import test from 'node:test';
import assert from 'node:assert/strict';
import { loadRecords, saveRecord } from '../src/records.mjs';
import { cases } from '../src/cases.mjs';
test('Every displayed acceptance case can be recorded; unknown cases fail before storage changes', () => {
  let data = null;
  const storage = { getItem: () => data, setItem: (_, value) => { data = value; } };
  const record = { protocol: 'six', version: 'LP1', date: '2026-10-27T00:00:00Z', phone: '', notes: '', volume: 20, successes: 1, attempts: 1, distance: 10 };
  let records = [];
  for (const item of cases) records = saveRecord(storage, records, { ...record, caseId: item.id });
  assert.equal(loadRecords(storage).length, cases.length);
  const before = data;
  assert.throws(() => saveRecord(storage, records, { ...record, caseId: 'TC99' })); assert.equal(data, before);
});
test('Record validation and storage failure preserve the previous result', () => {
  let data = null;
  const storage = { getItem: () => data, setItem: (_, value) => { data = value; } };
  assert.deepEqual(loadRecords(storage), []);
  const record = { caseId: 'TC01', protocol: 'six', version: 'LP1', date: '2026-10-27T00:00:00Z', phone: '', notes: '', volume: 20, successes: 0, attempts: 10, distance: 10 };
  const results = saveRecord(storage, [], record), before = data;
  assert.deepEqual(loadRecords(storage), results);
  assert.throws(() => saveRecord(storage, results, { ...record, successes: 11 }));
  assert.equal(data, before);
  assert.throws(() => saveRecord({ setItem: () => { throw new Error('quota'); } }, results, record));
  assert.equal(results.length, 1);
  data = '{broken'; assert.throws(() => loadRecords(storage));
});
