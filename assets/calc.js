/*
 * 共有物分割複丈費分擔 — 計算核心（純函式，瀏覽器與 Node 共用）
 *
 * 依據：114.7.17「研商登記機關受理囑託非屬建築物之位置與面積測量及部分共有人
 * 申辦共有物分割複丈案件之收費原則事宜」會議紀錄 議題二
 *   1. 分割複丈規費（基本費＋施測費）依分割後筆數均分，由分割後所有權人繳納。
 *   2. 分割後維持共有者，再依各共有人持分比例分算。
 *   3. 採無條件捨去至整數，餘數由申請人繳納。
 *   4. 確定分割界址點費用由申請人繳納。
 * 減半依「土地複丈費及建築改良物測量費收費標準」第 6 條：依法院確定判決等
 * 申請、依已核定測量成果辦理而無需實地測量者，按半數計收；需實地測量或
 * 確定界址點者原價計收。
 *
 * 所有金額以「半元」為單位做整數運算（規費減半時可能出現 .5），
 * 避免 Excel / 浮點數 ROUNDDOWN(562.5/3*3) 之類的誤差。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Calc = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const toInt = (v) => {
    const n = Number(String(v ?? '').replace(/[,\s]/g, ''));
    return Number.isFinite(n) ? n : NaN;
  };
  const isPosInt = (n) => Number.isInteger(n) && n > 0;
  const isNonNegInt = (n) => Number.isInteger(n) && n >= 0;

  function bgcd(a, b) {
    a = a < 0n ? -a : a;
    b = b < 0n ? -b : b;
    while (b) [a, b] = [b, a % b];
    return a;
  }

  /** 持分加總（分數，BigInt 精確） → {n, d} 已約分 */
  function sumShares(rows) {
    let n = 0n, d = 1n;
    for (const r of rows) {
      const rn = toInt(r.num), rd = toInt(r.den);
      if (!isNonNegInt(rn) || !isPosInt(rd)) continue;
      n = n * BigInt(rd) + BigInt(rn) * d;
      d = d * BigInt(rd);
      const g = bgcd(n, d) || 1n;
      n /= g; d /= g;
    }
    return { n, d };
  }

  const personKey = (name) => String(name ?? '').trim().replace(/\s+/g, ' ');

  const POINT_UNIT = 200; // 收費標準附表一附註三：確定界址點每點 200 元

  /** 是否減半：收費標準第 6 條，依法院確定判決／調處結果申請，且無需實地測量 */
  function isHalved(c) {
    const courtBased = c.courtBased ?? c.halve ?? true; // 舊版欄位 halve 相容
    return !!courtBased && !c.needSurvey;
  }

  /** 申請人（一位）；相容舊版 persons[姓名].applicant 勾選 */
  function applicantOf(c) {
    const a = personKey(c.applicant);
    if (a) return a;
    const legacy = Object.entries(c.persons || {}).find(([, v]) => v && v.applicant);
    return legacy ? personKey(legacy[0]) : '';
  }

  /**
   * @param {object} c 案件資料
   *   baseFee, surveyFee   全案基本費、施測費（元，原價）
   *   courtBased            依法院確定判決或同一效力文件、調處結果申請
   *   needSurvey            需實地測量或確定界址點 → 不適用第 6 條減半，原價計收
   *   pointCount            確定界址點數（每點 200 元，由申請人負擔，不均分）
   *   parcels[]             { landNo, owners[]: { name, den, num, note } }
   *   applicant             申請人姓名；捨去後的差額、界址點費用全部由申請人負擔
   *   persons{}             { [姓名]: { paid, note } }
   * 捨去方式：每筆均分額不先捨去，依持分算到個人時一次無條件捨去。
   */
  function compute(c) {
    const warnings = [];
    const base = toInt(c.baseFee) || 0;
    const survey = toInt(c.surveyFee) || 0;
    const pointCount = c.pointCount === undefined || c.pointCount === ''
      ? Math.round((toInt(c.pointFee) || 0) / POINT_UNIT) // 舊版以金額儲存
      : toInt(c.pointCount);
    const pointFee = (Number.isInteger(pointCount) && pointCount > 0 ? pointCount : 0) * POINT_UNIT;
    const parcels = c.parcels || [];
    const N = parcels.length;
    const halved = isHalved(c);

    // 以「半元」為單位，減半時才可能出現 .5
    const feeHalf = halved ? base + survey : (base + survey) * 2;
    const fee = feeHalf / 2;

    if (!Number.isInteger(base) || !Number.isInteger(survey) || base < 0 || survey < 0)
      warnings.push({ level: 'error', msg: '基本費／施測費必須為非負整數。' });
    if (c.pointCount !== undefined && c.pointCount !== '' && !(Number.isInteger(pointCount) && pointCount >= 0))
      warnings.push({ level: 'error', msg: '確定界址點數必須為非負整數。' });
    if (pointFee && !c.needSurvey)
      warnings.push({ level: 'warn', msg: '有確定界址點時應勾選「需實地測量或確定界址點」（不適用減半）。' });
    if (N === 0) warnings.push({ level: 'warn', msg: '尚未建立任何分割後地號。' });

    let allocatedHalf = 0;
    const parcelResults = parcels.map((p, pi) => {
      const label = p.landNo ? `地號 ${p.landNo}` : `第 ${pi + 1} 筆`;
      if (!String(p.landNo ?? '').trim())
        warnings.push({ level: 'warn', msg: `第 ${pi + 1} 筆尚未填寫地號。`, parcel: pi });
      const owners = p.owners || [];
      if (!owners.length) warnings.push({ level: 'error', msg: `${label} 沒有任何所有權人。`, parcel: pi });

      let parcelDue = 0;
      const rows = owners.map((o, oi) => {
        const den = toInt(o.den), num = toInt(o.num);
        const name = personKey(o.name);
        let due = 0, ok = true;
        if (!name) warnings.push({ level: 'warn', msg: `${label} 第 ${oi + 1} 列未填姓名。`, parcel: pi });
        if (!isPosInt(den) || !isNonNegInt(num)) {
          ok = false;
          warnings.push({ level: 'error', msg: `${label}「${name || '第 ' + (oi + 1) + ' 列'}」持分分母／分子須為整數且分母大於 0。`, parcel: pi });
        } else if (num > den) {
          ok = false;
          warnings.push({ level: 'error', msg: `${label}「${name}」分子大於分母。`, parcel: pi });
        }
        // floor( fee / N × num/den )，整數運算
        if (ok && N) due = Math.floor((feeHalf * num) / (2 * N * den));
        parcelDue += due;
        return { name, den, num, due, ok, note: o.note || '' };
      });

      const share = sumShares(owners);
      const shareOk = share.n === share.d && share.d === 1n;
      if (owners.length && !shareOk)
        warnings.push({ level: 'error', msg: `${label} 持分合計為 ${share.n}/${share.d}，不等於 1。`, parcel: pi });
      allocatedHalf += parcelDue * 2;
      return { landNo: p.landNo, rows, parcelDue, share, shareOk };
    });

    const remainder = (feeHalf - allocatedHalf) / 2;

    // ---- 個人彙總（同一人跨多筆合併計算） ----
    const persons = c.persons || {};
    const order = [];
    const map = new Map();
    for (const pr of parcelResults) {
      for (const r of pr.rows) {
        if (!r.name) continue;
        if (!map.has(r.name)) {
          map.set(r.name, { due: 0, parcels: [] });
          order.push(r.name);
        }
        const m = map.get(r.name);
        m.due += r.due;
        m.parcels.push(`${pr.landNo || '?'}(${r.num}/${r.den})`);
      }
    }

    const applicant = applicantOf(c);
    if (!applicant) {
      warnings.push({ level: 'error', msg: '尚未指定申請人，差額與界址點費用無人負擔。' });
    } else if (!map.has(applicant)) {
      warnings.push({ level: 'warn', msg: `申請人「${applicant}」不在分割後所有權人名單中，請確認姓名。` });
      map.set(applicant, { due: 0, parcels: [] });
      order.push(applicant);
    }

    const people = order.map((name) => {
      const m = map.get(name);
      const info = persons[name] || {};
      const isApplicant = name === applicant;
      const extra = isApplicant ? remainder + pointFee : 0;
      const total = m.due + extra;
      const paid = toInt(info.paid) || 0;
      const diff = paid - total;
      let status;
      if (diff > 0) status = isApplicant ? '溢繳應退' : '溢繳';
      else if (diff < 0) status = isApplicant ? '應補繳' : '註記欠繳';
      else status = '已繳清';
      return {
        name, isApplicant,
        parcels: m.parcels,
        due: m.due, remainder: isApplicant ? remainder : 0, pointFee: isApplicant ? pointFee : 0,
        total, paid,
        over: diff > 0 ? diff : 0,
        owe: diff < 0 ? -diff : 0,
        status, note: info.note || '',
      };
    });

    const sum = (k) => people.reduce((a, p) => a + p[k], 0);
    return {
      N, base, survey, pointCount: pointFee / POINT_UNIT, pointFee, pointUnit: POINT_UNIT,
      halved,
      grossFee: base + survey,
      fee,
      perParcel: N ? fee / N : 0,
      allocated: allocatedHalf / 2,
      remainder,
      applicant,
      names: order,
      parcels: parcelResults,
      people,
      totals: { due: sum('total'), paid: sum('paid'), over: sum('over'), owe: sum('owe') },
      warnings,
    };
  }

  return { compute, sumShares, personKey, toInt, isHalved, POINT_UNIT };
});
