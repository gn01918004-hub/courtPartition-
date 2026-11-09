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
  // 收費標準附表一項次四 土地分割複丈費：基本費依分割前每筆地號面積分級，施測費以線段計
  const SPLIT_BASE = [1500, 2000, 2500, 3000];
  const SPLIT_LINE = 500;
  const TIERS = ['未滿 200 ㎡', '200 以上未滿 1,000 ㎡', '1,000 以上未滿 10,000 ㎡', '10,000 ㎡ 以上'];
  const tierOf = (a) => (a < 200 ? 0 : a < 1000 ? 1 : a < 10000 ? 2 : 3);

  /** 依分割前地號（面積或級距、筆數）與線段數計算基本費、施測費 */
  function splitFee(preParcels, lines) {
    let base = 0;
    const rows = (preParcels || []).map((r) => {
      const area = Number(String(r.area ?? '').replace(/[,\s]/g, ''));
      const tier = area > 0 ? tierOf(area) : Math.min(3, Math.max(0, Number(r.tier) || 0));
      const q = toInt(r.qty);
      const qty = Number.isInteger(q) && q > 0 ? q : 1;
      const filled = area > 0 || !!String(r.landNo ?? '').trim(); // 空白列不計費
      const fee = filled ? SPLIT_BASE[tier] * qty : 0;
      base += fee;
      return { landNo: r.landNo || '', area: area > 0 ? area : null, tier, qty, fee, filled };
    });
    const l = toInt(lines);
    const lineCount = Number.isInteger(l) && l > 0 ? l : 0;
    return { base, survey: lineCount * SPLIT_LINE, lines: lineCount, rows };
  }

  // ---- 持分與名單解析（支援 1/4、4分之1、四分之一、萬分之二三四五、全部） ----
  const CN_DIGIT = { 〇: 0, 零: 0, 一: 1, 壹: 1, 二: 2, 貳: 2, 兩: 2, 三: 3, 參: 3, 四: 4, 肆: 4, 五: 5, 伍: 5, 六: 6, 陸: 6, 七: 7, 柒: 7, 八: 8, 捌: 8, 九: 9, 玖: 9 };
  const CN_UNIT = { 十: 10, 拾: 10, 百: 100, 佰: 100, 千: 1000, 仟: 1000 };
  const NUM_CHARS = '0-9〇零一壹二貳兩三參四肆五伍六陸七柒八捌九玖十拾百佰千仟萬億';
  const toHalfWidth = (s) => String(s ?? '')
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[／∕]/g, '/').replace(/\u3000/g, ' ');

  function parseNumber(t) {
    t = String(t).trim();
    if (/^\d+$/.test(t)) return Number(t);
    if (!t || !new RegExp(`^[${NUM_CHARS}]+$`).test(t)) return NaN;
    // 只有數字字元（如「二三四五」）→ 逐位讀
    if (!/[十拾百佰千仟萬億]/.test(t)) return Number([...t].map((c) => CN_DIGIT[c]).join(''));
    let total = 0, section = 0, num = 0;
    for (const c of t) {
      if (c in CN_DIGIT) num = CN_DIGIT[c];
      else if (c in CN_UNIT) { section += (num || 1) * CN_UNIT[c]; num = 0; }
      else if (c === '萬' || c === '億') {
        total = (total + section + num || 1) * (c === '萬' ? 10000 : 100000000); // 開頭的「萬」＝一萬
        section = 0; num = 0;
      } else if (/\d/.test(c)) num = num * 10 + Number(c);
    }
    return total + section + num;
  }

  /** 解析單一持分文字 → { num, den } 或 null */
  function parseShare(text) {
    let t = toHalfWidth(text).replace(/\s+/g, '')
      .replace(/^(權利範圍|應有部分|持分)[:：]?/, '').replace(/^(公同共有)/, '');
    if (!t) return null;
    if (/^(全部|單獨所有|1\/1)$/.test(t)) return { num: 1, den: 1 };
    let m = t.match(/^(\d+)\/(\d+)$/);
    if (m) return { num: Number(m[1]), den: Number(m[2]) };
    m = t.match(new RegExp(`^([${NUM_CHARS}]+)分之([${NUM_CHARS}]+)$`));
    if (m) {
      const den = parseNumber(m[1]), num = parseNumber(m[2]);
      if (Number.isInteger(den) && Number.isInteger(num) && den > 0) return { num, den };
    }
    return null;
  }

  const SHARE_RE = new RegExp(`([${NUM_CHARS}]+分之[${NUM_CHARS}]+|\\d+\\/\\d+|全部|單獨所有)`);
  const NOISE = /(原告|被告|反訴原告|反訴被告|共有人|姓名|分歸|分配予?|取得|由|按|其|應有部分|權利範圍|持分|維持共有|保持共有|所有|比例)/g;

  /**
   * 解析貼上的名單文字（判決書主文、Excel 複製、逐行「姓名 持分」）
   * 回傳 { rows:[{name,num,den,note}], skipped:[原文] }
   */
  function parseRoster(text) {
    const rows = [], skipped = [];
    const lines = toHalfWidth(text).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    for (const line of lines) {
      // Excel／Tab 分隔：姓名 分母 分子（或分子 分母）
      const cells = line.split(/\t|\s{2,}|,/).map((c) => c.trim()).filter(Boolean);
      if (cells.length >= 3 && /^\d+$/.test(cells[1]) && /^\d+$/.test(cells[2]) && !SHARE_RE.test(cells[0])) {
        const a = Number(cells[1]), b = Number(cells[2]);
        rows.push({ name: cells[0], den: Math.max(a, b), num: Math.min(a, b), note: cells.slice(3).join(' ') });
        continue;
      }
      let found = false;
      for (const seg of line.split(/[，,；;。]/)) {
        const m = seg.match(SHARE_RE);
        if (!m) continue;
        const share = parseShare(m[1]);
        if (!share) continue;
        const joint = /公同共有/.test(seg);
        const each = /各/.test(seg.slice(0, m.index));
        let names = seg.slice(0, m.index)
          .replace(/^\s*[\d一二三四五六七八九十]+[.、．)）]\s*/, '')
          .replace(/公同共有/g, '').replace(NOISE, '').replace(/各/g, '')
          .replace(/[:：()（）「」\s]/g, ' ').trim();
        if (!names) continue;
        found = true;
        const list = names.split(/[、及與和\s]+/).filter(Boolean);
        if (joint) rows.push({ name: `${list.join('、')}（公同共有）`, ...share, note: '' });
        else if (each && list.length > 1) list.forEach((n) => rows.push({ name: n, ...share, note: '' }));
        else rows.push({ name: list.join('、'), ...share, note: '' });
      }
      if (!found) skipped.push(line);
    }
    return { rows, skipped };
  }

  // ---- 金額大寫（新臺幣○○元整） ----
  function toChineseAmount(v) {
    const D = '零壹貳參肆伍陸柒捌玖', U = ['', '拾', '佰', '仟'], BIG = ['', '萬', '億'];
    let n = Math.floor(Math.abs(v));
    const jiao = Math.round((Math.abs(v) - n) * 10);
    if (n === 0 && !jiao) return '零元整';
    let out = '', g = 0, zero = false;
    while (n > 0) {
      const part = n % 10000;
      if (part) {
        let s = '', z = false;
        for (let i = 0; i < 4; i++) {
          const d = Math.floor(part / 10 ** i) % 10;
          if (d) { s = D[d] + U[i] + (z ? '零' : '') + s; z = false; }
          else if (s) z = true;
        }
        out = s + BIG[g] + (zero ? '零' : '') + out;
        zero = part < 1000;
      } else if (out) zero = true;
      n = Math.floor(n / 10000); g++;
    }
    return (out ? out + '元' : '') + (jiao ? D[jiao] + '角' : '整');
  }


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
   *   pointCount            確定界址點數（每點 200 元，由申請人負擔，不均分；僅 needSurvey 時計收）
   *   parcels[]             { landNo, owners[]: { name, den, num, note } }
   *   applicant             申請人姓名；捨去後的差額、界址點費用全部由申請人負擔
   *   persons{}             { [姓名]: { paid, note } }
   * 捨去方式：每筆均分額不先捨去，依持分算到個人時一次無條件捨去。
   */
  function compute(c) {
    const warnings = [];
    const auto = c.feeAuto ? splitFee(c.preParcels, c.lines) : null;
    const base = auto ? auto.base : toInt(c.baseFee) || 0;
    const survey = auto ? auto.survey : toInt(c.surveyFee) || 0;
    if (auto && !auto.rows.some((r) => r.filled)) warnings.push({ level: 'warn', msg: '尚未填寫分割前地號（地號或面積），基本費為 0。' });
    if (auto && !auto.lines) warnings.push({ level: 'warn', msg: '線段數為 0，施測費為 0。' });
    const pointCount = c.pointCount === undefined || c.pointCount === ''
      ? Math.round((toInt(c.pointFee) || 0) / POINT_UNIT) // 舊版以金額儲存
      : toInt(c.pointCount);
    // 界址點只有在勾選「需實地測量或確定界址點」時才計收
    const pointFee = c.needSurvey && Number.isInteger(pointCount) && pointCount > 0 ? pointCount * POINT_UNIT : 0;
    const parcels = c.parcels || [];
    const N = parcels.length;
    const halved = isHalved(c);

    // 以「半元」為單位，減半時才可能出現 .5
    const feeHalf = halved ? base + survey : (base + survey) * 2;
    const fee = feeHalf / 2;

    if (!Number.isInteger(base) || !Number.isInteger(survey) || base < 0 || survey < 0)
      warnings.push({ level: 'error', msg: '基本費／施測費必須為非負整數。' });
    if (c.needSurvey && c.pointCount !== undefined && c.pointCount !== '' && !(Number.isInteger(pointCount) && pointCount >= 0))
      warnings.push({ level: 'error', msg: '確定界址點數必須為非負整數。' });
    if (N === 0) warnings.push({ level: 'warn', msg: '尚未建立任何分割後地號。' });

    let allocatedHalf = 0;
    const parcelResults = parcels.map((p, pi) => {
      const label = p.landNo ? `地號 ${p.landNo}` : `第 ${pi + 1} 筆`;
      if (!String(p.landNo ?? '').trim())
        warnings.push({ level: 'warn', msg: `第 ${pi + 1} 筆尚未填寫地號。`, parcel: pi });
      const owners = p.owners || [];
      if (!owners.length) warnings.push({ level: 'error', msg: `${label} 沒有任何所有權人。`, parcel: pi });

      // 第一輪：檢查每列，並把同一筆地號內同名的列合併（登記上同一人只會登記一次）
      const groups = new Map(); // 姓名 → { first, n, d, count }
      const rows = owners.map((o, oi) => {
        const den = toInt(o.den), num = toInt(o.num);
        const name = personKey(o.name);
        let ok = true;
        if (!name) warnings.push({ level: 'warn', msg: `${label} 第 ${oi + 1} 列未填姓名。`, parcel: pi });
        if (!isPosInt(den) || !isNonNegInt(num)) {
          ok = false;
          warnings.push({ level: 'error', msg: `${label}「${name || '第 ' + (oi + 1) + ' 列'}」持分填寫有誤（例：1/4、四分之一）。`, parcel: pi });
        } else if (num > den) {
          ok = false;
          warnings.push({ level: 'error', msg: `${label}「${name}」分子大於分母。`, parcel: pi });
        }
        const row = { name, den, num, due: 0, ok, note: o.note || '', mergedTo: 0, count: 1, shareN: num, shareD: den };
        if (ok && name) {
          const g = groups.get(name);
          if (g) {
            row.mergedTo = g.first + 1; // 併入第幾列（1 起算）
            const sn = g.n * BigInt(den) + BigInt(num) * g.d, sd = g.d * BigInt(den), k = bgcd(sn, sd) || 1n;
            g.n = sn / k; g.d = sd / k; g.count++;
          } else {
            groups.set(name, { first: oi, n: BigInt(num), d: BigInt(den), count: 1 });
          }
        }
        return row;
      });

      // 第二輪：以合併後的持分計算 floor( fee / N × n/d )，整數運算
      let parcelDue = 0;
      rows.forEach((row, oi) => {
        if (!row.ok || !N || row.mergedTo) return;
        let n = BigInt(row.num), d = BigInt(row.den);
        const g = row.name && groups.get(row.name);
        if (g && g.count > 1) {
          n = g.n; d = g.d;
          row.count = g.count; row.shareN = String(n); row.shareD = String(d);
          warnings.push({ level: 'warn', parcel: pi,
            msg: `${label}「${row.name}」輸入了 ${g.count} 列，已合併為持分 ${n}/${d} 計算。若是同名同姓的不同人，請在姓名後加註區別，例如「${row.name}（A12）」。` });
        }
        row.due = Number.isInteger(feeHalf)
          ? Number((BigInt(feeHalf) * n) / (2n * BigInt(N) * d))
          : Math.floor((feeHalf * Number(n)) / (2 * N * Number(d)));
        parcelDue += row.due;
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
        if (!r.name || r.mergedTo) continue;
        if (!map.has(r.name)) {
          map.set(r.name, { due: 0, parcels: [] });
          order.push(r.name);
        }
        const m = map.get(r.name);
        m.due += r.due;
        m.parcels.push(`${pr.landNo || '?'}(${r.shareN}/${r.shareD})`);
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
      if (diff > 0) status = '溢繳';
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
      feeMode: auto ? 'auto' : 'manual', auto,
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

  return { compute, sumShares, personKey, toInt, isHalved, POINT_UNIT, SPLIT_BASE, SPLIT_LINE, TIERS, tierOf, splitFee, parseNumber, parseShare, parseRoster, toChineseAmount };
});
