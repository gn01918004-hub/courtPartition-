/*
 * 共有物分割複丈費分擔 — 計算核心（純函式，瀏覽器與 Node 共用）
 *
 * 依據：114.7.17「研商登記機關受理囑託非屬建築物之位置與面積測量及部分共有人
 * 申辦共有物分割複丈案件之收費原則事宜」會議紀錄 議題二
 *   1. 分割複丈規費（基本費＋施測費）依分割後筆數均分，由分割後所有權人繳納。
 *   2. 分割後維持共有者，再依各共有人持分比例分算。
 *   3. 採無條件捨去至整數，餘數由申請人繳納。
 *   4. 確定分割界址點費用由申請人繳納。
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

  /**
   * @param {object} c 案件資料
   *   baseFee, surveyFee   全案基本費、施測費（元）
   *   halve                 法院確定判決等，規費減半
   *   roundMode             'final'  ：每筆均分後不先捨去，算到個人時一次捨去（同原 Excel v2.1）
   *                         'parcel' ：每筆均分額先捨去至整數，再依持分分算後捨去
   *   pointFee              確定分割界址點費用（申請人負擔，不均分）
   *   parcels[]             { landNo, owners[]: { name, den, num, note } }
   *   persons{}             { [姓名]: { applicant, paid, note } }
   *   remainderTo           餘數負擔人（申請人姓名）；空白＝第一位申請人
   */
  function compute(c) {
    const warnings = [];
    const base = toInt(c.baseFee) || 0;
    const survey = toInt(c.surveyFee) || 0;
    const pointFee = toInt(c.pointFee) || 0;
    const parcels = c.parcels || [];
    const N = parcels.length;

    // 半元單位
    const fullHalf = (base + survey) * 2;
    const feeHalf = c.halve ? (base + survey) : fullHalf; // 減半後之「半元」數
    const fee = feeHalf / 2;

    if (!Number.isInteger(base) || !Number.isInteger(survey) || base < 0 || survey < 0)
      warnings.push({ level: 'error', msg: '基本費／施測費必須為非負整數。' });
    if (N === 0) warnings.push({ level: 'warn', msg: '尚未建立任何分割後地號。' });

    const perParcelHalf = N ? feeHalf / N : 0; // 可能非整數
    const perParcelRounded = N ? Math.floor(feeHalf / (2 * N)) : 0; // 'parcel' 模式（元）

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
        if (!name) {
          warnings.push({ level: 'warn', msg: `${label} 第 ${oi + 1} 列未填姓名。`, parcel: pi });
        }
        if (!isPosInt(den) || !isNonNegInt(num)) {
          ok = false;
          warnings.push({ level: 'error', msg: `${label}「${name || '第 ' + (oi + 1) + ' 列'}」持分分母／分子須為整數且分母大於 0。`, parcel: pi });
        } else if (num > den) {
          ok = false;
          warnings.push({ level: 'error', msg: `${label}「${name}」分子大於分母。`, parcel: pi });
        }
        if (ok && N) {
          if (c.roundMode === 'parcel') {
            due = Math.floor((perParcelRounded * num) / den);
          } else {
            // floor( (feeHalf/2) / N * num/den ) = floor(feeHalf*num / (2*N*den))
            due = Math.floor((feeHalf * num) / (2 * N * den));
          }
        }
        parcelDue += due;
        return { name, den, num, due, ok, note: o.note || '' };
      });

      const share = sumShares(owners);
      const shareOk = share.n === share.d && share.d === 1n;
      if (owners.length && !shareOk)
        warnings.push({
          level: 'error',
          msg: `${label} 持分合計為 ${share.n}/${share.d}，不等於 1。`,
          parcel: pi,
        });
      allocatedHalf += parcelDue * 2;
      return { landNo: p.landNo, rows, parcelDue, share, shareOk };
    });

    const remainderHalf = feeHalf - allocatedHalf;
    const remainder = remainderHalf / 2;

    // ---- 個人彙總（同一人跨多筆合併計算） ----
    const persons = c.persons || {};
    const order = [];
    const map = new Map();
    for (const pr of parcelResults) {
      for (const r of pr.rows) {
        if (!r.name) continue;
        if (!map.has(r.name)) {
          map.set(r.name, { name: r.name, due: 0, parcels: [] });
          order.push(r.name);
        }
        const m = map.get(r.name);
        m.due += r.due;
        m.parcels.push(`${pr.landNo || '?'}(${r.num}/${r.den})`);
      }
    }
    // 申請人可能未取得分割後土地，仍需列入
    for (const [name, info] of Object.entries(persons)) {
      const k = personKey(name);
      if (k && info && info.applicant && !map.has(k)) {
        map.set(k, { name: k, due: 0, parcels: [] });
        order.push(k);
      }
    }

    const applicants = order.filter((n) => persons[n] && persons[n].applicant);
    let bearer = personKey(c.remainderTo);
    if (!bearer || !applicants.includes(bearer)) bearer = applicants[0] || '';
    if (!applicants.length)
      warnings.push({ level: 'error', msg: '尚未指定申請人，餘數與界址點費用無人負擔。' });

    const people = order.map((name) => {
      const m = map.get(name);
      const info = persons[name] || {};
      const isApplicant = !!info.applicant;
      const isBearer = name === bearer;
      const extra = isBearer ? remainder + pointFee : 0;
      const total = m.due + extra;
      const paid = toInt(info.paid) || 0;
      const diff = paid - total;
      let status;
      if (diff > 0) status = isApplicant ? '溢繳應退' : '溢繳';
      else if (diff < 0) status = isApplicant ? '應補繳' : '註記欠繳';
      else status = '已繳清';
      return {
        name, isApplicant, isBearer,
        parcels: m.parcels,
        due: m.due, remainder: isBearer ? remainder : 0, pointFee: isBearer ? pointFee : 0,
        total, paid,
        over: diff > 0 ? diff : 0,
        owe: diff < 0 ? -diff : 0,
        status, note: info.note || '',
      };
    });

    const sum = (k) => people.reduce((a, p) => a + p[k], 0);
    return {
      N, base, survey, pointFee,
      grossFee: base + survey,
      fee,
      perParcel: N ? perParcelHalf / 2 : 0,
      perParcelRounded,
      allocated: allocatedHalf / 2,
      remainder,
      bearer, applicants,
      parcels: parcelResults,
      people,
      totals: { due: sum('total'), paid: sum('paid'), over: sum('over'), owe: sum('owe') },
      warnings,
    };
  }

  return { compute, sumShares, personKey, toInt };
});
