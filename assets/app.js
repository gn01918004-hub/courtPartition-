/* 共有物分割複丈費清冊 — 介面 */
(function () {
  'use strict';

  const APP_VERSION = window.CHANGELOG[0].version;
  const STORE_KEY = 'courtPartition.v3';
  const SEEN_KEY = 'courtPartition.seenVersion';
  const COPIES = [
    { no: '第一聯', use: '附卷' },
    { no: '第二聯', use: '移送登記課' },
  ];

  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = (n) => (Number.isFinite(n) ? n.toLocaleString('zh-TW', { maximumFractionDigits: 2 }) : '—');
  const uid = () => Math.random().toString(36).slice(2, 10);
  const blankOwner = () => ({ name: '', den: '', num: '', note: '' });
  const blankParcel = () => ({ landNo: '', owners: [blankOwner()] });
  const rocDate = (d = new Date()) => `中華民國 ${d.getFullYear() - 1911} 年 ${d.getMonth() + 1} 月 ${d.getDate()} 日`;

  function newCase() {
    return {
      id: uid(), caseNo: '', receiptNo: '', clerk: '',
      baseFee: '', surveyFee: '', pointCount: '', courtBased: true, needSurvey: false,
      parcels: [blankParcel()], persons: {}, applicant: '',
      updatedAt: Date.now(),
    };
  }

  function sampleCase() {
    // 與 Excel v2.1 清冊範例相同
    const owners = ['劉玉英', '劉玉美', '劉玉春', '劉筱帆'].map((name) => ({ name, den: 4, num: 1, note: '' }));
    return Object.assign(newCase(), {
      caseNo: '（範例）114年度訴字第0000號', receiptNo: '114年通數土字第00000號',
      baseFee: 3000, surveyFee: 1500, courtBased: true, needSurvey: false, applicant: '劉玉美',
      parcels: [{ landNo: '566', owners }],
      persons: { '劉玉美': { paid: 3500, note: '' } },
    });
  }

  // 舊版（v3.0）案件資料轉換
  function migrate(c) {
    if (c.courtBased === undefined) c.courtBased = c.halve ?? true;
    if (c.needSurvey === undefined) c.needSurvey = false;
    if (c.applicant === undefined) {
      const hit = Object.entries(c.persons || {}).find(([, v]) => v && v.applicant);
      c.applicant = c.remainderTo || (hit ? hit[0] : '');
    }
    if (c.pointCount === undefined) {
      c.pointCount = c.pointFee ? String(Math.round(Number(c.pointFee) / Calc.POINT_UNIT)) : '';
      if (Number(c.pointFee) > 0) c.needSurvey = true; // 有界址點即需實地作業
    }
    delete c.halve; delete c.roundMode; delete c.remainderTo; delete c.pointFee;
    Object.values(c.persons || {}).forEach((v) => v && delete v.applicant);
    return c;
  }

  // ---------- 儲存 ----------
  let db = load();
  function load() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORE_KEY));
      if (raw && raw.cases && Object.keys(raw.cases).length) {
        Object.values(raw.cases).forEach(migrate);
        return raw;
      }
    } catch (e) { /* 無法讀取時使用新案件 */ }
    const c = newCase();
    return { current: c.id, cases: { [c.id]: c } };
  }
  let saveTimer;
  function save() {
    cur().updatedAt = Date.now();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try { localStorage.setItem(STORE_KEY, JSON.stringify(db)); } catch (e) { /* 私密模式等 */ }
    }, 250);
  }
  const cur = () => db.cases[db.current];

  // ---------- 案件資料表單 ----------
  function bindForm() {
    $$('[data-f]').forEach((el) => {
      el.addEventListener(el.type === 'checkbox' || el.tagName === 'SELECT' ? 'change' : 'input', () => {
        cur()[el.dataset.f] = el.type === 'checkbox' ? el.checked : el.value;
        save();
        if (el.dataset.f === 'caseNo') renderCaseSelect();
        refresh();
      });
    });
  }
  function fillForm() {
    const c = cur();
    $$('[data-f]').forEach((el) => {
      const v = c[el.dataset.f];
      if (el.type === 'checkbox') el.checked = !!v;
      else el.value = v ?? '';
    });
  }

  function renderCaseSelect() {
    const sel = $('#caseSelect');
    const list = Object.values(db.cases).sort((a, b) => b.updatedAt - a.updatedAt);
    sel.innerHTML = list.map((c) =>
      `<option value="${c.id}" ${c.id === db.current ? 'selected' : ''}>${esc(c.caseNo || '（未命名案件）')}</option>`).join('');
  }

  // ---------- 地號卡片 ----------
  function renderParcels() {
    const c = cur();
    $('#countInput').value = c.parcels.length;
    $('#parcels').innerHTML = c.parcels.map((p, pi) => `
      <article class="parcel" data-pi="${pi}" style="--i:${pi}">
        <header>
          <span class="pno">${pi + 1}</span>
          <label class="land">地號<input data-p="landNo" value="${esc(p.landNo)}" placeholder="地號"></label>
          <span class="chip" data-share="${pi}"></span>
          <span class="subtotal">小計 <b data-psum="${pi}">0</b> 元</span>
          <div class="pact">
            ${pi > 0 ? '<button class="btn ghost sm" data-act="copyPrev" title="複製上一筆的共有人名單">⧉ 沿用上一筆名單</button>' : ''}
            <button class="btn ghost sm danger" data-act="delParcel" title="刪除此筆">刪除</button>
          </div>
        </header>
        <div class="table-wrap">
          <table class="tbl">
            <thead><tr><th class="n">#</th><th>共有人姓名</th><th class="num">分母</th><th class="num">分子</th><th class="num">應繳測量費</th><th>備註</th><th></th></tr></thead>
            <tbody>
              ${p.owners.map((o, oi) => `
              <tr data-oi="${oi}">
                <td class="n">${oi + 1}</td>
                <td><input data-o="name" value="${esc(o.name)}" placeholder="姓名（公同共有請寫在同一列）" list="nameList"></td>
                <td class="num"><input data-o="den" value="${esc(o.den)}" inputmode="numeric" class="short"></td>
                <td class="num"><input data-o="num" value="${esc(o.num)}" inputmode="numeric" class="short"></td>
                <td class="num due" data-due="${pi}-${oi}">0</td>
                <td><input data-o="note" value="${esc(o.note)}"></td>
                <td><button class="btn icon sm" data-act="delOwner" aria-label="刪除此列">✕</button></td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>
        <button class="btn ghost sm add" data-act="addOwner">＋ 新增共有人</button>
      </article>`).join('') + '<datalist id="nameList"></datalist>';
    refresh();
  }

  function onParcelsInput(e) {
    const el = e.target;
    const card = el.closest('.parcel');
    if (!card) return;
    const p = cur().parcels[+card.dataset.pi];
    if (el.dataset.p) p[el.dataset.p] = el.value;
    if (el.dataset.o) p.owners[+el.closest('tr').dataset.oi][el.dataset.o] = el.value;
    save();
    refresh();
  }

  function onParcelsClick(e) {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const card = btn.closest('.parcel');
    const pi = +card.dataset.pi;
    const c = cur();
    const p = c.parcels[pi];
    switch (btn.dataset.act) {
      case 'addOwner':
        p.owners.push(blankOwner());
        break;
      case 'delOwner': {
        const oi = +btn.closest('tr').dataset.oi;
        const o = p.owners[oi];
        if ((o.name || o.den || o.num) && !confirm(`確定刪除「${o.name || '此列'}」？`)) return;
        p.owners.splice(oi, 1);
        if (!p.owners.length) p.owners.push(blankOwner());
        break;
      }
      case 'copyPrev':
        if (hasData(p) && !confirm('此筆已有資料，確定以上一筆的名單覆蓋？')) return;
        p.owners = c.parcels[pi - 1].owners.map((o) => ({ ...o, note: '' }));
        break;
      case 'delParcel':
        if (hasData(p) && !confirm(`確定刪除第 ${pi + 1} 筆（地號 ${p.landNo || '未填'}）？`)) return;
        c.parcels.splice(pi, 1);
        break;
      default: return;
    }
    save();
    renderParcels();
  }

  const hasData = (p) => !!(String(p.landNo).trim() || p.owners.some((o) => o.name || o.den || o.num));

  function applyCount(n) {
    const c = cur();
    n = Math.floor(Number(n));
    if (!Number.isFinite(n) || n < 1) { toast('分割後筆數至少為 1'); $('#countInput').value = c.parcels.length; return; }
    if (n > 200) { toast('筆數過多（上限 200）'); return; }
    if (n < c.parcels.length) {
      const removed = c.parcels.slice(n);
      const filled = removed.filter(hasData).length;
      if (filled && !confirm(`將移除最後 ${removed.length} 筆，其中 ${filled} 筆已有資料，確定？`)) {
        $('#countInput').value = c.parcels.length;
        return;
      }
      c.parcels.length = n;
    }
    while (c.parcels.length < n) c.parcels.push(blankParcel());
    save();
    renderParcels();
  }

  // ---------- 計算與畫面更新 ----------
  let last;
  function refresh() {
    const c = cur();
    const r = (last = Calc.compute(c));

    // 地號卡片計算值
    r.parcels.forEach((pr, pi) => {
      pr.rows.forEach((row, oi) => {
        const td = $(`[data-due="${pi}-${oi}"]`);
        if (td) td.textContent = row.ok ? money(row.due) : '—';
      });
      const sum = $(`[data-psum="${pi}"]`);
      if (sum) sum.textContent = money(pr.parcelDue);
      const chip = $(`[data-share="${pi}"]`);
      if (chip) {
        chip.textContent = pr.shareOk ? '持分合計 1 ✓' : `持分合計 ${pr.share.n}/${pr.share.d}`;
        chip.classList.toggle('bad', !pr.shareOk);
      }
    });
    $('#nameList') && ($('#nameList').innerHTML = r.people.map((p) => `<option value="${esc(p.name)}">`).join(''));

    $('#halveNote').textContent = r.halved
      ? '✓ 適用收費標準第 6 條：依已核定測量成果辦理，無需實地測量，規費按半數計收。'
      : c.needSurvey
        ? '✗ 需實地測量或確定界址點，不適用第 6 條減半，按原價計收。'
        : '✗ 非依法院確定判決／調處結果申請，按原價計收。';
    $('#halveNote').classList.toggle('on', r.halved);
    $('#pointField').hidden = !c.needSurvey;

    // KPI
    $('#kpis').innerHTML = [
      ['規費合計', r.grossFee, `基本費 ${money(r.base)} + 施測費 ${money(r.survey)}`],
      [r.halved ? '減半後應徵' : '應徵規費（原價）', r.fee, r.halved ? '收費標準第 6 條半數計收' : '不適用減半'],
      ['每筆均分', r.perParcel, `÷ 分割後 ${r.N} 筆`],
      ['已分配', r.allocated, '各共有人應繳合計'],
      ['差額（申請人）', r.remainder, r.applicant ? `由 ${r.applicant} 負擔` : '尚未指定申請人', 'accent'],
      ...(c.needSurvey ? [['界址點費用', r.pointFee, `${r.pointCount} 點 × ${r.pointUnit} 元，申請人負擔`]] : []),
      ['欠繳合計', r.totals.owe, '未會同人註記欠繳', r.totals.owe ? 'warn' : ''],
      ['溢繳合計', r.totals.over, '溢繳', r.totals.over ? 'ok' : ''],
    ].map(([k, v, s, cls]) => `<div class="kpi ${cls || ''}"><span class="k">${k}</span><span class="v">${money(v)}</span><span class="s">${esc(s)}</span></div>`).join('');

    renderPeople(r);
    renderWarnings(r);
  }

  function renderPeople(r) {
    const c = cur();
    const tbl = $('#people');
    const editing = tbl.contains(document.activeElement);
    if (editing) {
      // 正在輸入時只更新計算欄，避免游標跳走
      r.people.forEach((p) => {
        const tr = tbl.querySelector(`tr[data-name="${CSS.escape(p.name)}"]`);
        if (!tr) return;
        tr.querySelector('[data-c="extra"]').textContent = money(p.remainder + p.pointFee);
        tr.querySelector('[data-c="total"]').textContent = money(p.total);
        tr.querySelector('[data-c="over"]').textContent = money(p.over);
        tr.querySelector('[data-c="owe"]').textContent = money(p.owe);
        const st = tr.querySelector('[data-c="status"]');
        st.textContent = p.status;
        st.className = 'status ' + statusCls(p.status);
      });
    } else {
      tbl.innerHTML = `
        <thead><tr>
          <th>姓名</th><th>申請人</th><th>分配地號（持分）</th><th class="num">應繳</th><th class="num">${extraLabel()}</th>
          <th class="num">應繳合計</th><th class="num">已繳</th><th class="num">溢繳</th><th class="num">欠繳</th><th>狀態</th><th>備註</th>
        </tr></thead>
        <tbody>${r.people.map((p) => `
          <tr data-name="${esc(p.name)}" class="${p.isApplicant ? 'bearer' : ''}">
            <td><b>${esc(p.name)}</b></td>
            <td><label class="radio" title="設為申請人"><input type="radio" name="applicantRadio" data-pp="applicant" ${p.isApplicant ? 'checked' : ''}><span></span></label></td>
            <td class="muted">${esc(p.parcels.join('、'))}</td>
            <td class="num">${money(p.due)}</td>
            <td class="num" data-c="extra">${money(p.remainder + p.pointFee)}</td>
            <td class="num strong" data-c="total">${money(p.total)}</td>
            <td class="num"><input data-pp="paid" value="${esc((c.persons[p.name] || {}).paid ?? '')}" inputmode="numeric" class="short" placeholder="0"></td>
            <td class="num" data-c="over">${money(p.over)}</td>
            <td class="num" data-c="owe">${money(p.owe)}</td>
            <td><span data-c="status" class="status ${statusCls(p.status)}">${p.status}</span></td>
            <td><input data-pp="note" value="${esc(p.note)}"></td>
          </tr>`).join('') || '<tr><td colspan="11" class="muted center">請先在上方填寫共有人姓名</td></tr>'}
        </tbody>
        <tfoot><tr>
          <td colspan="5">合計</td><td class="num">${money(r.totals.due)}</td><td class="num">${money(r.totals.paid)}</td>
          <td class="num">${money(r.totals.over)}</td><td class="num">${money(r.totals.owe)}</td><td colspan="2"></td>
        </tr></tfoot>`;
    }
    const sel = $('#applicantSel');
    if (document.activeElement !== sel) {
      sel.innerHTML = '<option value="">（請選擇申請人）</option>' +
        r.names.map((n) => `<option ${n === r.applicant ? 'selected' : ''}>${esc(n)}</option>`).join('');
    }
  }

  const statusCls = (s) => ({ '註記欠繳': 'warn', '應補繳': 'warn', '溢繳': 'ok', '已繳清': 'done' }[s] || '');
  const extraLabel = () => (cur().needSurvey ? '差額＋界址點' : '差額');

  function onPeopleInput(e) {
    const el = e.target;
    const tr = el.closest('tr[data-name]');
    if (!tr || !el.dataset.pp) return;
    const name = tr.dataset.name;
    const persons = cur().persons;
    if (el.dataset.pp === 'applicant') {
      cur().applicant = name;
      el.blur();
    } else {
      const info = (persons[name] = persons[name] || {});
      info[el.dataset.pp] = el.value;
    }
    save();
    refresh();
  }

  function renderWarnings(r) {
    const ul = $('#warnings');
    const card = $('#warnCard');
    card.classList.toggle('clean', !r.warnings.length);
    ul.innerHTML = r.warnings.length
      ? r.warnings.map((w) => `<li class="${w.level}">${esc(w.msg)}</li>`).join('')
      : '<li class="ok">全部檢核通過，可以列印。</li>';
  }

  // ---------- 列印（1式2份） ----------
  function buildPrint() {
    const c = cur();
    const r = Calc.compute(c);
    const today = rocDate();
    const parcelsHtml = r.parcels.map((pr) => `
      <table class="ptbl">
        <thead>
          <tr><th colspan="5" class="cap">地號：${esc(pr.landNo || '（未填）')}　　持分合計：${pr.shareOk ? '1' : `${pr.share.n}/${pr.share.d}（有誤）`}</th></tr>
          <tr><th style="width:2.2em">#</th><th>共有人姓名</th><th style="width:6em">持分</th><th style="width:7em">應繳測量費</th><th>備註</th></tr>
        </thead>
        <tbody>${pr.rows.map((row, i) => `
          <tr><td class="c">${i + 1}</td><td>${esc(row.name)}</td><td class="c">${row.num}/${row.den}</td><td class="r">${money(row.due)}</td><td>${esc(row.note)}</td></tr>`).join('')}
        </tbody>
        <tfoot><tr><td colspan="3" class="r">小計</td><td class="r">${money(pr.parcelDue)}</td><td></td></tr></tfoot>
      </table>`).join('');

    const peopleHtml = `
      <table class="ptbl">
        <thead>
          <tr><th colspan="9" class="cap">各共有人應繳彙總</th></tr>
          <tr><th>姓名</th><th>身分</th><th>應繳</th><th>${extraLabel()}</th><th>應繳合計</th><th>已繳</th><th>溢繳</th><th>欠繳</th><th>處理</th></tr>
        </thead>
        <tbody>${r.people.map((p) => `
          <tr><td>${esc(p.name)}</td><td class="c">${p.isApplicant ? '申請人' : '未會同'}</td><td class="r">${money(p.due)}</td>
          <td class="r">${money(p.remainder + p.pointFee)}</td><td class="r b">${money(p.total)}</td><td class="r">${money(p.paid)}</td>
          <td class="r">${money(p.over)}</td><td class="r">${money(p.owe)}</td><td class="c">${p.status}${p.note ? '<br><small>' + esc(p.note) + '</small>' : ''}</td></tr>`).join('')}
        </tbody>
        <tfoot><tr><td colspan="4" class="r">合計</td><td class="r b">${money(r.totals.due)}</td><td class="r">${money(r.totals.paid)}</td>
          <td class="r">${money(r.totals.over)}</td><td class="r">${money(r.totals.owe)}</td><td></td></tr></tfoot>
      </table>`;

    const feeHtml = `
      <table class="ptbl fee">
        <tr><th>基本費</th><th>施測費</th><th>合計</th><th>${r.halved ? '規費減半' : '應徵規費(原價)'}</th><th>分割後筆數</th><th>每筆均分</th><th>已分配</th><th>差額（申請人）</th>${c.needSurvey ? '<th>界址點費用</th>' : ''}</tr>
        <tr><td>${money(r.base)}</td><td>${money(r.survey)}</td><td>${money(r.grossFee)}</td><td>${money(r.fee)}</td><td>${r.N}</td>
        <td>${money(r.perParcel)}</td><td>${money(r.allocated)}</td><td>${money(r.remainder)}</td>${c.needSurvey ? `<td>${money(r.pointFee)}<br><small>${r.pointCount}點</small></td>` : ''}</tr>
      </table>`;

    const copy = (cp) => `
      <section class="sheet">
        <div class="copy-tag">${cp.no}<br><small>${cp.use}</small></div>
        <h1>共有物分割土地複丈費分擔清冊</h1>
        <table class="meta">
          <tr><th>判決確定共有物分割案號</th><td>${esc(c.caseNo)}</td><th>收件字號</th><td>${esc(c.receiptNo)}</td></tr>
          <tr><th>製表日期</th><td>${today}</td><th>計收方式</th><td>${r.halved ? '依收費標準第 6 條半數計收' : (c.needSurvey ? '需實地測量／確定界址點，原價計收' : '原價計收')}</td></tr>
        </table>
        ${feeHtml}
        ${parcelsHtml}
        ${peopleHtml}
        <p class="basis">依據：114.7.17 研商部分共有人申辦共有物分割複丈案件收費原則會議紀錄議題二。規費依分割後筆數均分，維持共有者依持分分算，無條件捨去至整數，餘數及確定分割界址點費用由申請人繳納；依法院確定判決等申請而無需實地測量者，依收費標準第 6 條半數計收；未會同申請之共有人依內政部 90.6.22 台（90）內地字第 9073215 號函註記欠繳。</p>
        ${r.warnings.some((w) => w.level === 'error') ? '<p class="err">※ 本清冊仍有檢核錯誤，請修正後再列印。</p>' : ''}
        <div class="sign">
          <div>承辦人<span>${esc(c.clerk)}</span></div><div>課長<span></span></div><div>主任<span></span></div>
        </div>
        <div class="pfoot">${cp.no}（${cp.use}） · 共 2 聯 · 系統版本 v${APP_VERSION}</div>
      </section>`;
    $('#print-root').innerHTML = COPIES.map(copy).join('');
    return r;
  }

  function doPrint() {
    const r = buildPrint();
    const errs = r.warnings.filter((w) => w.level === 'error');
    if (errs.length && !confirm(`尚有 ${errs.length} 項檢核錯誤：\n\n${errs.map((w) => '・' + w.msg).join('\n')}\n\n仍要列印嗎？`)) return;
    const title = document.title;
    document.title = `複丈費清冊_${cur().caseNo || '未命名'}`;
    window.print();
    document.title = title;
  }

  // ---------- 匯出／匯入 ----------
  function download(name, content, type) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([content], { type }));
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  const fileBase = () => `複丈費清冊_${(cur().caseNo || '未命名').replace(/[\\/:*?"<>|]/g, '_')}`;

  function exportCsv() {
    const r = Calc.compute(cur());
    const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = [['地號', '共有人姓名', '分母', '分子', '應繳測量費', '備註']];
    r.parcels.forEach((pr) => pr.rows.forEach((row) => lines.push([pr.landNo, row.name, row.den, row.num, row.due, row.note])));
    const pt = cur().needSurvey;
    lines.push([], ['姓名', '身分', '應繳', '差額', ...(pt ? ['界址點費'] : []), '應繳合計', '已繳', '溢繳', '欠繳', '處理', '備註']);
    r.people.forEach((p) => lines.push([p.name, p.isApplicant ? '申請人' : '未會同', p.due, p.remainder, ...(pt ? [p.pointFee] : []), p.total, p.paid, p.over, p.owe, p.status, p.note]));
    download(fileBase() + '.csv', '﻿' + lines.map((l) => l.map(q).join(',')).join('\r\n'), 'text/csv;charset=utf-8');
  }

  function importJson(file) {
    const fr = new FileReader();
    fr.onload = () => {
      try {
        const c = JSON.parse(fr.result);
        if (!Array.isArray(c.parcels)) throw new Error('格式不符');
        c.id = uid();
        c.persons = c.persons || {};
        migrate(c);
        db.cases[c.id] = c;
        db.current = c.id;
        save();
        loadCurrent();
        toast('已匯入案件');
      } catch (e) {
        alert('匯入失敗：' + e.message);
      }
    };
    fr.readAsText(file);
  }

  // ---------- 版本 ----------
  function renderTimeline(highlight) {
    $('#tlList').innerHTML = window.CHANGELOG.map((v, i) => `
      <li class="${i === 0 ? 'latest' : ''} ${highlight === v.version ? 'fresh' : ''}">
        <div class="tl-head"><span class="tl-ver">v${esc(v.version)}</span><span class="tl-date">${esc(v.date)}</span>${i === 0 ? '<span class="tl-tag">目前版本</span>' : ''}</div>
        <div class="tl-title">${esc(v.title)}</div>
        <ul>${v.highlights.map((h) => `<li>${esc(h)}</li>`).join('')}</ul>
      </li>`).join('');
  }
  function openTimeline(highlight) {
    renderTimeline(highlight);
    $('#timeline').showModal();
  }

  const newer = (a, b) => {
    const pa = a.split('.').map(Number), pb = b.split('.').map(Number);
    for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
    return false;
  };
  const SITE = 'https://gn01918004-hub.github.io/courtPartition-/';
  const DOWNLOAD = 'https://github.com/gn01918004-hub/courtPartition-/releases/latest';
  async function checkUpdate() {
    const standalone = !!window.STANDALONE;
    if (!standalone && location.protocol === 'file:') return;
    try {
      const res = await fetch(`${standalone ? SITE : ''}version.json?t=${Date.now()}`, { cache: 'no-store' });
      const v = await res.json();
      if (v.version && newer(v.version, APP_VERSION)) {
        pushNotify(v, standalone);
        const b = $('#updateBanner');
        b.innerHTML = standalone
          ? `✨ 有新版本 v${esc(v.version)}，請下載新的 HTML 檔取代此檔（案件資料可先「匯出 JSON」備份） <a class="btn primary sm" href="${DOWNLOAD}" target="_blank" rel="noopener">下載新版</a>`
          : `✨ 有新版本 v${esc(v.version)} 可用 <button class="btn primary sm">立即更新</button>`;
        b.hidden = false;
        const btn = b.querySelector('button');
        if (btn) btn.onclick = () => { location.href = `${location.pathname}?v=${encodeURIComponent(v.version)}`; };
      }
    } catch (e) { /* 離線時略過 */ }
  }

  // ---------- 新版桌面通知 ----------
  const NOTIFIED_KEY = 'courtPartition.notifiedVersion';
  function pushNotify(v, standalone) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    let done = null;
    try { done = localStorage.getItem(NOTIFIED_KEY); } catch (e) { /* 略過 */ }
    if (done === v.version) return; // 每個版本只通知一次
    try {
      const n = new Notification(`共有物分割複丈費清冊 v${v.version} 已發布`, {
        body: [v.title, ...(v.highlights || []).slice(0, 3).map((h) => '・' + h)].filter(Boolean).join('\n'),
        icon: SITE + 'assets/icon-180.png',
        tag: 'courtPartition-update',
      });
      n.onclick = () => { window.focus(); if (standalone) window.open(DOWNLOAD, '_blank'); else location.href = `${location.pathname}?v=${encodeURIComponent(v.version)}`; };
      localStorage.setItem(NOTIFIED_KEY, v.version);
    } catch (e) { /* 部分瀏覽器不允許在此情境建立通知 */ }
  }
  function renderNotifyBtn() {
    const b = $('#notifyBtn');
    if (!('Notification' in window)) { b.hidden = true; return; }
    const p = Notification.permission;
    b.textContent = p === 'granted' ? '🔔 通知已開啟' : p === 'denied' ? '🔕 通知已封鎖' : '🔔 開啟更新通知';
    b.classList.toggle('accent', p === 'granted');
  }
  async function enableNotify() {
    if (!('Notification' in window)) return toast('此瀏覽器不支援通知');
    if (Notification.permission === 'denied') return alert('通知已被封鎖，請在瀏覽器網址列左側的網站設定中允許「通知」。');
    if (Notification.permission === 'granted') return toast('已開啟：有新版本時會跳出桌面通知');
    const p = await Notification.requestPermission();
    renderNotifyBtn();
    if (p === 'granted') {
      new Notification('更新通知已開啟', { body: '有新版本時會在這裡通知您（需保持本頁開啟）。', tag: 'courtPartition-update' });
      checkUpdate();
    }
  }

  function toast(msg) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2400);
  }

  // ---------- 啟動 ----------
  function loadCurrent() {
    fillForm();
    renderCaseSelect();
    renderParcels();
  }

  function onToolbar(e) {
    const act = e.target.closest('[data-act]')?.dataset.act;
    const c = cur();
    switch (act) {
      case 'new': {
        const n = newCase();
        db.cases[n.id] = n; db.current = n.id; save(); loadCurrent(); break;
      }
      case 'sample': {
        const s = sampleCase();
        db.cases[s.id] = s; db.current = s.id; save(); loadCurrent(); toast('已載入 Excel v2.1 範例'); break;
      }
      case 'import': $('#importFile').click(); break;
      case 'export': {
        const { id, ...data } = c;
        download(fileBase() + '.json', JSON.stringify({ ...data, appVersion: APP_VERSION }, null, 2), 'application/json');
        break;
      }
      case 'csv': exportCsv(); break;
      case 'delete': {
        if (!confirm(`確定刪除案件「${c.caseNo || '未命名'}」？此動作無法復原。`)) return;
        delete db.cases[c.id];
        const rest = Object.values(db.cases).sort((a, b) => b.updatedAt - a.updatedAt);
        if (!rest.length) { const n = newCase(); db.cases[n.id] = n; rest.push(n); }
        db.current = rest[0].id; save(); loadCurrent(); break;
      }
      case 'print': doPrint(); break;
      case 'notify': enableNotify(); break;
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    $('#versionBtn').textContent = 'v' + APP_VERSION;
    $('#footVer').textContent = `版本 v${APP_VERSION}（${window.CHANGELOG[0].date}）`;
    $('#versionBtn').onclick = () => openTimeline();
    $('#timeline').addEventListener('click', (e) => {
      if (e.target.matches('[data-close]') || e.target === $('#timeline')) $('#timeline').close();
    });

    $('.toolbar').addEventListener('click', onToolbar);
    $('#caseSelect').onchange = (e) => { db.current = e.target.value; save(); loadCurrent(); };
    $('#importFile').onchange = (e) => { if (e.target.files[0]) importJson(e.target.files[0]); e.target.value = ''; };

    const step = (d) => { const i = $('#countInput'); i.value = Math.max(1, (+i.value || 0) + d); };
    document.querySelector('.stepper').addEventListener('click', (e) => {
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (act === 'inc') step(1);
      if (act === 'dec') step(-1);
      if (act === 'apply') applyCount($('#countInput').value);
    });
    $('#countInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') applyCount(e.target.value); });

    $('#parcels').addEventListener('input', onParcelsInput);
    $('#parcels').addEventListener('click', onParcelsClick);
    $('#people').addEventListener('input', onPeopleInput);
    $('#people').addEventListener('focusout', () => setTimeout(() => last && !$('#people').contains(document.activeElement) && refresh()));
    $('#applicantSel').onchange = (e) => { cur().applicant = e.target.value; save(); e.target.blur(); refresh(); };

    bindForm();
    loadCurrent();
    window.addEventListener('beforeprint', buildPrint);

    // 首次開啟新版本時自動顯示更新重點
    let seen = null;
    try { seen = localStorage.getItem(SEEN_KEY); } catch (e) { /* 略過 */ }
    if (seen !== APP_VERSION) {
      if (seen) openTimeline(APP_VERSION);
      try { localStorage.setItem(SEEN_KEY, APP_VERSION); } catch (e) { /* 略過 */ }
    }
    renderNotifyBtn();
    checkUpdate();
    setInterval(checkUpdate, 30 * 60 * 1000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) checkUpdate(); });
  });
})();
