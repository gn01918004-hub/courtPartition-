import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const { compute, sumShares } = require('../assets/calc.js');

const owners = (list) => list.map(([name, num, den]) => ({ name, num, den }));

test('Excel v2.1 範例：結果與原試算表一致', () => {
  const r = compute({
    baseFee: 3000, surveyFee: 1500, halve: true,
    parcels: [{ landNo: '566', owners: owners([['劉玉英', 1, 4], ['劉玉美', 1, 4], ['劉玉春', 1, 4], ['劉筱帆', 1, 4]]) }],
    persons: { 劉玉美: { applicant: true, paid: 3500 } },
  });
  assert.equal(r.fee, 2250);
  assert.equal(r.allocated, 2248);
  assert.equal(r.remainder, 2);
  const by = Object.fromEntries(r.people.map((p) => [p.name, p]));
  assert.equal(by['劉玉英'].owe, 562);
  assert.equal(by['劉玉美'].total, 564);
  assert.equal(by['劉玉美'].over, 2936); // 同 Excel F11
  assert.equal(r.warnings.filter((w) => w.level === 'error').length, 0);
});

test('不同分母的持分合計可正確檢核', () => {
  const s = sumShares(owners([['a', 1, 2], ['b', 1, 4], ['c', 1, 4]]));
  assert.deepEqual([s.n, s.d], [1n, 1n]);
  const bad = sumShares(owners([['a', 1, 2], ['b', 1, 3]]));
  assert.deepEqual([bad.n, bad.d], [5n, 6n]);
});

test('申請人出現在多筆時，餘數只負擔一次、已繳只計一次', () => {
  const r = compute({
    baseFee: 3000, surveyFee: 1500, halve: true,
    parcels: [
      { landNo: '566', owners: owners([['甲', 1, 3], ['乙', 2, 3]]) },
      { landNo: '566-1', owners: owners([['甲', 1, 1]]) },
      { landNo: '566-2', owners: owners([['丙', 1, 1]]) },
    ],
    persons: { 甲: { applicant: true, paid: 2250 } },
  });
  // 2250/3 = 750；甲 250 + 750 = 1000；乙 500；丙 750
  const by = Object.fromEntries(r.people.map((p) => [p.name, p]));
  assert.equal(by['甲'].due, 1000);
  assert.equal(r.remainder, 0);
  assert.equal(by['甲'].over, 1250);
  assert.equal(by['乙'].owe, 500);
  assert.equal(r.totals.due, 2250);
});

test('兩種捨去方式', () => {
  const c = {
    baseFee: 3000, surveyFee: 1500, halve: true,
    parcels: [
      { landNo: '1', owners: owners([['甲', 2, 3], ['乙', 1, 3]]) },
      { landNo: '2', owners: owners([['丙', 1, 1]]) },
      { landNo: '3', owners: owners([['丁', 1, 1]]) },
      { landNo: '4', owners: owners([['戊', 1, 1]]) },
    ],
    persons: { 甲: { applicant: true } },
  };
  const a = compute({ ...c, roundMode: 'final' }); // 562.5×2/3 = 375
  assert.equal(a.parcels[0].rows[0].due, 375);
  assert.equal(a.parcels[0].rows[1].due, 187);
  assert.equal(a.allocated + a.remainder, 2250);
  const b = compute({ ...c, roundMode: 'parcel' }); // 562×2/3 = 374.67 → 374
  assert.equal(b.parcels[0].rows[0].due, 374);
  assert.equal(b.allocated + b.remainder, 2250);
});

test('減半後出現 .5 元時，餘數保留 .5 給申請人', () => {
  const r = compute({
    baseFee: 1001, surveyFee: 0, halve: true,
    parcels: [{ landNo: '1', owners: owners([['甲', 1, 1]]) }],
    persons: { 甲: { applicant: true } },
  });
  assert.equal(r.fee, 500.5);
  assert.equal(r.remainder, 0.5);
});

test('界址點費用與錯誤檢核', () => {
  const r = compute({
    baseFee: 1000, surveyFee: 0, halve: false, pointFee: 800,
    parcels: [{ landNo: '', owners: owners([['甲', 1, 2], ['乙', 1, 3]]) }],
    persons: { 乙: { applicant: true } },
  });
  const b = r.people.find((p) => p.name === '乙');
  assert.equal(b.pointFee, 800);
  assert.ok(r.warnings.some((w) => w.msg.includes('5/6')));
  assert.ok(r.warnings.some((w) => w.msg.includes('尚未填寫地號')));
});

test('version.json 與 changelog 最新版本一致', () => {
  const ctx = { window: {} };
  vm.runInNewContext(readFileSync(new URL('../assets/changelog.js', import.meta.url), 'utf8'), ctx);
  const v = JSON.parse(readFileSync(new URL('../version.json', import.meta.url), 'utf8'));
  assert.equal(v.version, ctx.window.CHANGELOG[0].version);
  assert.equal(v.date, ctx.window.CHANGELOG[0].date);
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(pkg.version, v.version);
});
