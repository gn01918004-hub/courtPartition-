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
    baseFee: 3000, surveyFee: 1500, courtBased: true, applicant: '劉玉美',
    parcels: [{ landNo: '566', owners: owners([['劉玉英', 1, 4], ['劉玉美', 1, 4], ['劉玉春', 1, 4], ['劉筱帆', 1, 4]]) }],
    persons: { 劉玉美: { paid: 3500 } },
  });
  assert.equal(r.fee, 2250);
  assert.equal(r.allocated, 2248);
  assert.equal(r.remainder, 2);
  const by = Object.fromEntries(r.people.map((p) => [p.name, p]));
  assert.equal(by['劉玉英'].owe, 562);
  assert.equal(by['劉玉美'].total, 564);
  assert.equal(by['劉玉美'].over, 2936); // 同 Excel F11
  assert.equal(by['劉玉美'].status, '溢繳');
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
    baseFee: 3000, surveyFee: 1500, courtBased: true, applicant: '甲',
    parcels: [
      { landNo: '566', owners: owners([['甲', 1, 3], ['乙', 2, 3]]) },
      { landNo: '566-1', owners: owners([['甲', 1, 1]]) },
      { landNo: '566-2', owners: owners([['丙', 1, 1]]) },
    ],
    persons: { 甲: { paid: 2250 } },
  });
  // 2250/3 = 750；甲 250 + 750 = 1000；乙 500；丙 750
  const by = Object.fromEntries(r.people.map((p) => [p.name, p]));
  assert.equal(by['甲'].due, 1000);
  assert.equal(r.remainder, 0);
  assert.equal(by['甲'].over, 1250);
  assert.equal(by['乙'].owe, 500);
  assert.equal(r.totals.due, 2250);
});

test('最後一次捨去，差額全部歸申請人', () => {
  const r = compute({
    baseFee: 3000, surveyFee: 1500, courtBased: true, applicant: '乙',
    parcels: [
      { landNo: '1', owners: owners([['甲', 2, 3], ['乙', 1, 3]]) },
      { landNo: '2', owners: owners([['丙', 1, 1]]) },
      { landNo: '3', owners: owners([['丁', 1, 1]]) },
      { landNo: '4', owners: owners([['戊', 1, 1]]) },
    ],
  });
  // 每筆 562.5：甲 375、乙 187；丙丁戊 562
  assert.equal(r.parcels[0].rows[0].due, 375);
  assert.equal(r.parcels[0].rows[1].due, 187);
  assert.equal(r.remainder, 2250 - 375 - 187 - 562 * 3);
  const yi = r.people.find((p) => p.name === '乙');
  assert.equal(yi.total, 187 + r.remainder);
  assert.equal(r.totals.due, 2250);
});

test('第 6 條：需實地測量或確定界址點時原價計收，界址點每點 200 元歸申請人', () => {
  const base = {
    baseFee: 3000, surveyFee: 1500, courtBased: true, applicant: '甲',
    parcels: [{ landNo: '1', owners: owners([['甲', 1, 2], ['乙', 1, 2]]) }],
  };
  assert.equal(compute(base).fee, 2250);
  const r = compute({ ...base, needSurvey: true, pointCount: 3 });
  assert.equal(r.halved, false);
  assert.equal(r.fee, 4500);
  assert.equal(r.pointFee, 600);
  const by = Object.fromEntries(r.people.map((p) => [p.name, p]));
  assert.equal(by['甲'].total, 2250 + 600);
  assert.equal(by['乙'].total, 2250);
  // 非依判決申請也不減半
  assert.equal(compute({ ...base, courtBased: false }).fee, 4500);
  // 未勾選實地測量時，界址點不計收（欄位隱藏，殘留的點數不影響結果）
  const hidden = compute({ ...base, pointCount: 2 });
  assert.equal(hidden.pointFee, 0);
  assert.equal(hidden.fee, 2250);
});

test('相容 v3.0 舊資料（halve、persons.applicant、pointFee）', () => {
  const r = compute({
    baseFee: 1000, surveyFee: 0, halve: true, needSurvey: true, pointFee: 400,
    parcels: [{ landNo: '1', owners: owners([['甲', 1, 1]]) }],
    persons: { 甲: { applicant: true } },
  });
  assert.equal(r.fee, 1000);
  assert.equal(r.applicant, '甲');
  assert.equal(r.pointFee, 400);
  assert.equal(compute({ halve: true, baseFee: 1000, parcels: [] }).fee, 500);
});

test('減半後出現 .5 元時，餘數保留 .5 給申請人', () => {
  const r = compute({
    baseFee: 1001, surveyFee: 0, courtBased: true, applicant: '甲',
    parcels: [{ landNo: '1', owners: owners([['甲', 1, 1]]) }],
  });
  assert.equal(r.fee, 500.5);
  assert.equal(r.remainder, 0.5);
});

test('界址點費用與錯誤檢核', () => {
  const r = compute({
    baseFee: 1000, surveyFee: 0, courtBased: false, needSurvey: true, pointCount: 4, applicant: '乙',
    parcels: [{ landNo: '', owners: owners([['甲', 1, 2], ['乙', 1, 3]]) }],
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

test('dist 單檔版已重新產生（執行 npm run build）', async () => {
  const { build, OUT } = await import('../scripts/build.mjs');
  const built = build();
  assert.ok(!/<script src=|<link rel="stylesheet"/.test(built), '仍有外部檔案引用');
  assert.equal(readFileSync(new URL('../' + OUT, import.meta.url), 'utf8'), built, 'dist 過期，請執行 npm run build');
  const { versionJson } = await import('../scripts/build.mjs');
  assert.equal(readFileSync(new URL('../version.json', import.meta.url), 'utf8'), versionJson(), 'version.json 過期，請執行 npm run build');
});
