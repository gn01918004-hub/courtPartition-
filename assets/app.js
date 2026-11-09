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
  const blankOwner = () => ({ name: '', share: '', den: '', num: '', note: '' });
  const blankPre = () => ({ landNo: '', area: '', tier: 0, qty: 1 });
  const shareText = (o) => (o.num !== '' && o.den !== '' && o.num != null && o.den != null ? `${o.num}/${o.den}` : '');
  // 持分欄：解析「1/4」「四分之一」等，同步存回分母／分子
  function setShare(o, text) {
    o.share = text;
    const sh = Calc.parseShare(text);
    o.den = sh ? sh.den : '';
    o.num = sh ? sh.num : '';
    return sh;
  }
  const blankParcel = () => ({ landNo: '', owners: [blankOwner()] });
  const rocDate = (d = new Date()) => `中華民國 ${d.getFullYear() - 1911} 年 ${d.getMonth() + 1} 月 ${d.getDate()} 日`;

  function newCase() {
    return {
      id: uid(), caseNo: '', receiptNo: '', clerk: '',
      feeAuto: true, preParcels: [blankPre()], lines: '',
      baseFee: '', surveyFee: '', pointCount: '', courtBased: true, needSurvey: false,
      parcels: [blankParcel()], persons: {}, applicant: '',
      updatedAt: Date.now(),
    };
  }

  function sampleCase() {
    // 與 Excel v2.1 清冊範例相同
    const owners = ['劉玉英', '劉玉美', '劉玉春', '劉筱帆'].map((name) => ({ name, share: '1/4', den: 4, num: 1, note: '' }));
    return Object.assign(newCase(), {
      caseNo: '（範例）114年度訴字第0000號', receiptNo: '114年通數土字第00000號',
      feeAuto: false, baseFee: 3000, surveyFee: 1500, courtBased: true, needSurvey: false, applicant: '劉玉美',
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
    // v3.5：持分改為單一欄位；規費可依分割前地號自動計算（舊案件已填金額者維持手動）
    (c.parcels || []).forEach((p) => (p.owners || []).forEach((o) => { if (o.share === undefined) o.share = shareText(o); }));
    if (c.feeAuto === undefined) c.feeAuto = !(Number(c.baseFee) || Number(c.surveyFee));
    if (!Array.isArray(c.preParcels) || !c.preParcels.length) c.preParcels = [blankPre()];
    if (c.lines === undefined) c.lines = '';
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
            <button class="btn ghost sm" data-act="paste" title="從判決書、Excel 貼上姓名與持分">📋 貼上名單</button>
            ${pi > 0 ? '<button class="btn ghost sm" data-act="copyPrev" title="複製上一筆的共有人名單">⧉ 沿用上一筆名單</button>' : ''}
            <button class="btn ghost sm danger" data-act="delParcel" title="刪除此筆">刪除</button>
          </div>
        </header>
        <div class="table-wrap">
          <table class="tbl">
            <thead><tr><th class="n">#</th><th>共有人姓名</th><th>持分</th><th class="num">應繳測量費</th><th>備註</th><th></th></tr></thead>
            <tbody>
              ${p.owners.map((o, oi) => `
              <tr data-oi="${oi}">
                <td class="n">${oi + 1}</td>
                <td><input data-o="name" value="${esc(o.name)}" placeholder="姓名（公同共有請寫在同一列）" list="nameList"></td>
                <td><input data-o="share" value="${esc(o.share)}" placeholder="1/4、四分之一" class="share ${o.share && o.den === '' ? 'bad' : ''}"></td>
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
    if (el.dataset.o) {
      const o = p.owners[+el.closest('tr').dataset.oi];
      if (el.dataset.o === 'share') el.classList.toggle('bad', !!el.value.trim() && !setShare(o, el.value));
      else o[el.dataset.o] = el.value;
    }
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
        if ((o.name || o.share) && !confirm(`確定刪除「${o.name || '此列'}」？`)) return;
        p.owners.splice(oi, 1);
        if (!p.owners.length) p.owners.push(blankOwner());
        break;
      }
      case 'copyPrev':
        if (hasData(p) && !confirm('此筆已有資料，確定以上一筆的名單覆蓋？')) return;
        p.owners = c.parcels[pi - 1].owners.map((o) => ({ ...o, note: '' }));
        break;
      case 'paste':
        openPaste(pi);
        return;
      case 'delParcel':
        if (hasData(p) && !confirm(`確定刪除第 ${pi + 1} 筆（地號 ${p.landNo || '未填'}）？`)) return;
        c.parcels.splice(pi, 1);
        break;
      default: return;
    }
    save();
    renderParcels();
  }

  const hasData = (p) => !!(String(p.landNo).trim() || p.owners.some((o) => o.name || o.share));

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

  // ---------- 分割前地號（自動計算基本費） ----------
  function renderPre() {
    const c = cur();
    $('#preTbl').innerHTML = `
      <thead><tr><th>分割前地號</th><th class="num">面積（㎡，選填）</th><th>面積級距</th><th class="num">筆數</th><th class="num">基本費</th><th></th></tr></thead>
      <tbody>${c.preParcels.map((r, i) => `
        <tr data-ri="${i}">
          <td><input data-r="landNo" value="${esc(r.landNo)}" placeholder="例：566"></td>
          <td class="num"><input data-r="area" value="${esc(r.area)}" inputmode="decimal" class="short" placeholder="自動分級"></td>
          <td><select data-r="tier">${Calc.TIERS.map((t, k) => `<option value="${k}">${t}</option>`).join('')}</select></td>
          <td class="num"><input data-r="qty" value="${esc(r.qty)}" inputmode="numeric" class="short"></td>
          <td class="num due" data-pre="${i}">0</td>
          <td><button class="btn icon sm" data-act="delPre" aria-label="刪除此列">✕</button></td>
        </tr>`).join('')}</tbody>`;
  }
  function onPreInput(e) {
    const el = e.target, tr = el.closest('tr[data-ri]');
    if (!tr || !el.dataset.r) return;
    cur().preParcels[+tr.dataset.ri][el.dataset.r] = el.value;
    save();
    refresh();
  }
  function onPreClick(e) {
    const act = e.target.closest('[data-act]')?.dataset.act;
    const c = cur();
    if (act === 'addPre') c.preParcels.push(blankPre());
    else if (act === 'delPre') {
      c.preParcels.splice(+e.target.closest('tr').dataset.ri, 1);
      if (!c.preParcels.length) c.preParcels.push(blankPre());
    } else return;
    save();
    renderPre();
    refresh();
  }

  // ---------- 貼上名單 ----------
  let pasteTarget = 0, pasteRows = [];
  function openPaste(pi) {
    pasteTarget = pi;
    const p = cur().parcels[pi];
    $('#pTarget').textContent = `第 ${pi + 1} 筆${p.landNo ? `（地號 ${p.landNo}）` : ''}`;
    $('#pText').value = '';
    previewPaste();
    $('#pdlg').showModal();
    $('#pText').focus();
  }
  function previewPaste() {
    const { rows, skipped } = Calc.parseRoster($('#pText').value);
    pasteRows = rows;
    $('#pPreview').innerHTML = rows.length || skipped.length ? `
      ${rows.length ? `<table class="tbl"><thead><tr><th class="n">#</th><th>姓名</th><th>持分</th></tr></thead><tbody>
        ${rows.map((r, i) => `<tr><td class="n">${i + 1}</td><td>${esc(r.name)}</td><td>${r.num}/${r.den}</td></tr>`).join('')}</tbody></table>` : ''}
      ${skipped.length ? `<p class="small muted">看不懂、已略過 ${skipped.length} 行：${skipped.map((x) => `「${esc(x.slice(0, 30))}」`).join('、')}</p>` : ''}` : '';
    $('#pCount').textContent = rows.length ? `辨識出 ${rows.length} 位，請核對後套用` : '';
    $('#pReplace').disabled = $('#pAppend').disabled = !rows.length;
  }
  function applyPaste(replace) {
    const p = cur().parcels[pasteTarget];
    const owners = pasteRows.map((r) => ({ name: r.name, share: `${r.num}/${r.den}`, den: r.den, num: r.num, note: r.note || '' }));
    const keep = p.owners.filter((o) => o.name || o.share);
    p.owners = replace ? owners : [...keep, ...owners];
    $('#pdlg').close();
    save();
    renderParcels();
    toast(`已${replace ? '套用' : '加入'} ${owners.length} 位共有人`);
  }

  // ---------- 複製明細（貼到公文、簽稿） ----------
  function buildCopyText() {
    const c = cur(), r = Calc.compute(c);
    const L = [];
    L.push('共有物分割土地複丈費分擔明細');
    L.push(`案號：${c.caseNo || '—'}　收件字號：${c.receiptNo || '—'}`);
    L.push(`規費：基本費 ${money(r.base)} 元＋施測費 ${money(r.survey)} 元＝${money(r.grossFee)} 元，${r.halved ? '依收費標準第 6 條半數計收' : '原價計收'} ${money(r.fee)} 元（新臺幣${Calc.toChineseAmount(r.fee)}）`);
    L.push(`分割後 ${r.N} 筆，每筆均分 ${money(r.perParcel)} 元，依持分分算後無條件捨去，差額 ${money(r.remainder)} 元由申請人負擔${r.pointFee ? `；確定界址點 ${r.pointCount} 點計 ${money(r.pointFee)} 元由申請人負擔` : ''}。`);
    r.parcels.forEach((pr) => {
      L.push(`地號 ${pr.landNo || '（未填）'}：${pr.rows.filter((x) => !x.mergedTo && x.name).map((x) => `${x.name} ${x.shareN}/${x.shareD} 應繳 ${money(x.due)} 元`).join('；')}`);
    });
    L.push('各共有人：');
    r.people.forEach((p) => {
      const extra = p.remainder || p.pointFee ? `（含差額${p.pointFee ? '及界址點費用' : ''} ${money(p.remainder + p.pointFee)} 元）` : '';
      const tail = p.over ? `，溢繳 ${money(p.over)} 元` : p.owe ? `，${p.status} ${money(p.owe)} 元` : '，已繳清';
      L.push(`${p.name}${p.isApplicant ? '（申請人）' : ''} 應繳 ${money(p.total)} 元${extra}，已繳 ${money(p.paid)} 元${tail}`);
    });
    return L.join('\n');
  }
  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
    } catch (e) {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    toast('已複製明細，可直接貼到公文或簽稿');
  }

  // ---------- 深色／淺色 ----------
  const THEME_KEY = 'courtPartition.theme';
  function setTheme(t) {
    document.documentElement.dataset.theme = t;
    const b = $('#themeBtn');
    if (b) b.textContent = t === 'light' ? '🌙 深色' : '☀ 淺色';
    try { localStorage.setItem(THEME_KEY, t); } catch (e) { /* 略過 */ }
  }

  // ---------- 計算與畫面更新 ----------
  let last;
  function refresh() {
    const c = cur();
    const r = (last = Calc.compute(c));

    // 規費：自動計算時，基本費／施測費欄顯示計算結果且不可修改
    $('#autoFee').hidden = !c.feeAuto;
    [['baseFee', r.base], ['surveyFee', r.survey]].forEach(([k, v]) => {
      const el = $(`[data-f="${k}"]`);
      el.readOnly = !!c.feeAuto;
      if (document.activeElement !== el) el.value = c.feeAuto ? v : c[k] ?? '';
    });
    if (r.auto) {
      r.auto.rows.forEach((row, i) => {
        const td = $(`[data-pre="${i}"]`);
        if (td) td.textContent = money(row.fee);
        const sel = $(`#preTbl tr[data-ri="${i}"] [data-r="tier"]`);
        if (sel) { sel.value = row.tier; sel.disabled = row.area != null; }
      });
      $('#preSum').textContent = `基本費 ${money(r.auto.base)} ＋ 施測費 ${money(r.auto.survey)}（${r.auto.lines} 線 × ${Calc.SPLIT_LINE}）`;
    }

    // 地號卡片計算值
    r.parcels.forEach((pr, pi) => {
      pr.rows.forEach((row, oi) => {
        const td = $(`[data-due="${pi}-${oi}"]`);
        if (!td) return;
        td.classList.toggle('merged', !!row.mergedTo);
        if (!row.ok) td.textContent = '—';
        else if (row.mergedTo) td.innerHTML = `<small>併入第 ${row.mergedTo} 列</small>`;
        else if (row.count > 1) td.innerHTML = `${money(row.due)}<small>合併 ${row.shareN}/${row.shareD}</small>`;
        else td.textContent = money(row.due);
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
      [r.halved ? '減半後應徵' : '應徵規費（原價）', r.fee, `${r.halved ? '第 6 條半數計收' : '不適用減半'}・${Calc.toChineseAmount(r.fee)}`],
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

  // 合併後的列：備註併列原本各列的持分，方便核對
  const mergedNote = (pr, row) => {
    if (row.count < 2) return row.note;
    const parts = pr.rows.filter((x) => x.name === row.name && x.ok).map((x) => `${x.num}/${x.den}`);
    const notes = pr.rows.filter((x) => x.name === row.name && x.note).map((x) => x.note);
    return [`合併 ${parts.join('＋')}`, ...notes].join('；');
  };

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
        <tbody>${pr.rows.filter((row) => !row.mergedTo).map((row, i) => `
          <tr><td class="c">${i + 1}</td><td>${esc(row.name)}</td><td class="c">${row.shareN}/${row.shareD}</td><td class="r">${money(row.due)}</td><td>${esc(mergedNote(pr, row))}</td></tr>`).join('')}
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
        <tr><td colspan="${c.needSurvey ? 9 : 8}" class="cn">應徵規費新臺幣 ${Calc.toChineseAmount(r.fee)}${r.pointFee ? `，另確定界址點費用新臺幣 ${Calc.toChineseAmount(r.pointFee)}` : ''}${r.auto ? `　（基本費：分割前地號 ${r.auto.rows.map((x) => `${esc(x.landNo || '—')} ${Calc.TIERS[x.tier]}${x.qty > 1 ? '×' + x.qty : ''}`).join('、')}；施測費：${r.auto.lines} 線段）` : ''}</td></tr>
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
    a.hidden = true;
    // 開著對話框時頁面其他部分是 inert，連結要放在對話框內檔名才會生效
    ($('dialog[open]') || document.body).appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  const fileBase = () => `複丈費清冊_${(cur().caseNo || '未命名').replace(/[\\/:*?"<>|]/g, '_')}`;

  function exportCsv() {
    const r = Calc.compute(cur());
    const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = [['地號', '共有人姓名', '分母', '分子', '應繳測量費', '備註']];
    r.parcels.forEach((pr) => pr.rows.filter((row) => !row.mergedTo)
      .forEach((row) => lines.push([pr.landNo, row.name, row.shareD, row.shareN, row.due, mergedNote(pr, row)])));
    const pt = cur().needSurvey;
    lines.push([], ['姓名', '身分', '應繳', '差額', ...(pt ? ['界址點費'] : []), '應繳合計', '已繳', '溢繳', '欠繳', '處理', '備註']);
    r.people.forEach((p) => lines.push([p.name, p.isApplicant ? '申請人' : '未會同', p.due, p.remainder, ...(pt ? [p.pointFee] : []), p.total, p.paid, p.over, p.owe, p.status, p.note]));
    download(fileBase() + '.csv', '﻿' + lines.map((l) => l.map(q).join(',')).join('\r\n'), 'text/csv;charset=utf-8');
  }

  function importJson(file) {
    const fr = new FileReader();
    fr.onload = () => {
      try {
        const data = JSON.parse(fr.result);
        const list = data && data.app === 'court-partition' && Array.isArray(data.cases) ? data.cases : [data];
        if (!list.length || list.some((c) => !c || !Array.isArray(c.parcels))) throw new Error('不是本系統的案件或備份檔');
        if (list.length > 1 && !confirm(`備份檔內有 ${list.length} 件案件，要全部匯入嗎？（會加在現有案件之後，不會覆蓋）`)) return;
        list.forEach((c) => {
          c.id = uid();
          c.persons = c.persons || {};
          c.updatedAt = c.updatedAt || Date.now();
          migrate(c);
          db.cases[c.id] = c;
          db.current = c.id;
        });
        save();
        loadCurrent();
        toast(list.length > 1 ? `已匯入 ${list.length} 件案件` : '已匯入案件');
      } catch (e) {
        alert('匯入失敗：' + e.message);
      }
    };
    fr.readAsText(file);
  }

  // ---------- 版本紀錄與檢查更新 ----------
  // 單檔版讀 GitHub 公開倉庫的 version.json；網頁版讀同站的 version.json
  const SITE = 'https://gn01918004-hub.github.io/courtPartition-/';
  const UPDATE_URL = 'https://raw.githubusercontent.com/gn01918004-hub/courtPartition-/HEAD/version.json';
  const DOWNLOAD_URL = 'https://github.com/gn01918004-hub/courtPartition-/releases/latest';
  const SKIP_KEY = 'courtPartition.updateSkip';
  const STANDALONE = !!window.STANDALONE;

  const vcmp = (a, b) => {
    const x = String(a).split('.').map(Number), y = String(b).split('.').map(Number);
    for (let i = 0; i < 3; i++) { const d = (x[i] || 0) - (y[i] || 0); if (d) return d; }
    return 0;
  };
  const vnew = (v, date, note, title, items) => `
    <section class="vnew">
      <div class="vh"><span class="badge-new">NEW</span><span class="vv">v${esc(v)}</span><span class="vd">${esc(date || '')}・${note}</span></div>
      <h3>${esc(title)}</h3>
      ${items && items.length ? `<ul>${items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>` : ''}
    </section>`;

  function openVer() {
    const [now, ...past] = window.CHANGELOG;
    $('#vBody').innerHTML = vnew(now.version, now.date, '目前版本', '本版新功能：' + now.title, now.highlights) + `
      <div class="row-gap"><button class="btn sm" id="vCheck">檢查更新</button><span class="muted small">開啟時也會自動檢查</span></div>
      <div class="vtl">${past.map((r, i) => `
        <details${i === 0 ? ' open' : ''}><summary><b>v${esc(r.version)}</b><span>${esc(r.title)}</span><small>${esc(r.date)}</small></summary>
          <ul>${r.highlights.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></details>`).join('')}</div>`;
    $('#udlg').open && $('#udlg').close();
    $('#vdlg').showModal();
    try { localStorage.setItem(SEEN_KEY, APP_VERSION); } catch (e) { /* 略過 */ }
    $('#verDot').hidden = true;
  }

  let updInfo = null;
  const shown = new Set(); // 同一次開啟中，每個版本只自動跳出一次
  async function checkUpdate(manual) {
    if (!STANDALONE && location.protocol === 'file:') { if (manual) toast('請用網頁版或單檔版檢查更新'); return; }
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 8000);
    try {
      const res = await fetch(`${STANDALONE ? UPDATE_URL : 'version.json'}?t=${Date.now()}`, { cache: 'no-store', signal: ctl.signal });
      if (!res.ok) throw new Error(res.status);
      const info = await res.json();
      if (!info || !info.version) throw new Error('bad');
      let skipped = null;
      try { skipped = localStorage.getItem(SKIP_KEY); } catch (e) { /* 略過 */ }
      if (vcmp(info.version, APP_VERSION) > 0) {
        if (manual) showUpdate(info);
        else if (skipped !== info.version && !shown.has(info.version)) {
          shown.add(info.version);
          showUpdate(info);
          pushNotify(info);
        }
      } else if (manual) toast(`目前已是最新版本 v${APP_VERSION}`);
    } catch (e) {
      if (manual) toast('無法檢查更新，請確認網路連線後再試');
    } finally {
      clearTimeout(t);
    }
  }

  function showUpdate(info) {
    updInfo = info;
    const steps = STANDALONE
      ? ['建議先按「先下載備份」保存目前的資料', '按「下載新版」，下載新的 html 檔', '用新的 html 檔取代舊檔，用同一個瀏覽器開啟，原本的資料會保留']
      : ['建議先按「先下載備份」保存目前的資料', '按「立即更新」重新載入頁面，原本的資料會保留'];
    $('#uBody').innerHTML = vnew(info.version, info.date, `你目前使用 v${APP_VERSION}`, info.title || '新版本', info.items || info.highlights) + `
      <div><b class="small">更新方式</b><ol class="ustep">${steps.map((x) => `<li>${x}</li>`).join('')}</ol></div>`;
    const get = $('#uGet');
    if (STANDALONE) {
      get.textContent = '下載新版';
      get.href = /^https:\/\/github\.com\//.test(info.download || '') ? info.download : DOWNLOAD_URL;
      get.target = '_blank';
    } else {
      get.textContent = '立即更新';
      get.href = `${location.pathname}?v=${encodeURIComponent(info.version)}`;
      get.removeAttribute('target');
    }
    $('#vdlg').open && $('#vdlg').close();
    if (!$('#udlg').open) $('#udlg').showModal();
    get.focus();
  }

  function exportBackup() {
    const d = new Date();
    const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const data = { app: 'court-partition', version: 1, appVersion: APP_VERSION, exportedAt: d.toISOString(), current: db.current, cases: Object.values(db.cases) };
    download(`court-partition-backup-${ymd}.json`, JSON.stringify(data, null, 1), 'application/json'); // 英文檔名：各系統都能存
    toast(`已下載備份（${data.cases.length} 件案件）`);
  }

  // ---------- 新版桌面通知 ----------
  const NOTIFIED_KEY = 'courtPartition.notifiedVersion';
  function pushNotify(v) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    let done = null;
    try { done = localStorage.getItem(NOTIFIED_KEY); } catch (e) { /* 略過 */ }
    if (done === v.version) return; // 每個版本只通知一次
    try {
      const n = new Notification(`共有物分割複丈費清冊 v${v.version} 已發布`, {
        body: [v.title, ...(v.items || v.highlights || []).slice(0, 3).map((h) => '・' + h)].filter(Boolean).join('\n'),
        icon: SITE + 'assets/icon-180.png',
        tag: 'courtPartition-update',
      });
      n.onclick = () => { window.focus(); showUpdate(v); };
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
      checkUpdate(true);
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
    renderPre();
    renderCaseSelect();
    renderParcels();
  }

  function onToolbar(e) {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act) e.target.closest('details')?.removeAttribute('open'); // 選完就收起選單
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
      case 'backup': exportBackup(); break;
      case 'delete': {
        if (!confirm(`確定刪除案件「${c.caseNo || '未命名'}」？此動作無法復原。`)) return;
        delete db.cases[c.id];
        const rest = Object.values(db.cases).sort((a, b) => b.updatedAt - a.updatedAt);
        if (!rest.length) { const n = newCase(); db.cases[n.id] = n; rest.push(n); }
        db.current = rest[0].id; save(); loadCurrent(); break;
      }
      case 'print': doPrint(); break;
      case 'notify': enableNotify(); break;
      case 'rules': $('#rdlg').showModal(); break;
      case 'copy': copyText(buildCopyText()); break;
      case 'theme': setTheme(document.documentElement.dataset.theme === 'light' ? 'dark' : 'light'); break;
    }
  }

  document.addEventListener('click', (e) => { // 點選單外面就收起
    $$('details.menu[open]').forEach((d) => { if (!d.contains(e.target)) d.removeAttribute('open'); });
  });
  document.addEventListener('DOMContentLoaded', () => {
    let theme = 'dark';
    try { theme = localStorage.getItem(THEME_KEY) || 'dark'; } catch (e) { /* 略過 */ }
    setTheme(theme);
    $('#verTag').textContent = 'v' + APP_VERSION;
    $('#footVer').textContent = `版本 v${APP_VERSION}（${window.CHANGELOG[0].date}）`;
    $('#versionBtn').onclick = openVer;
    $$('dialog').forEach((d) => d.addEventListener('click', (e) => {
      if (e.target.matches('[data-close]') || e.target === d) d.close(); // 點按鈕或背景關閉
    }));
    $('#vBody').addEventListener('click', (e) => { if (e.target.id === 'vCheck') checkUpdate(true); });
    $('#uSkip').onclick = () => {
      try { localStorage.setItem(SKIP_KEY, updInfo.version); } catch (e) { /* 略過 */ }
      $('#udlg').close();
      toast(`已略過 v${updInfo.version}，有更新的版本時會再通知`);
    };
    $('#uBackup').onclick = exportBackup;
    $('#uGet').addEventListener('click', () => {
      if (STANDALONE) setTimeout(() => toast('下載完成後，用新的 html 檔取代舊檔即可'), 300);
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

    $('#autoFee').addEventListener('input', onPreInput);
    $('#autoFee').addEventListener('change', onPreInput);
    $('#autoFee').addEventListener('click', onPreClick);
    $('#pText').addEventListener('input', previewPaste);
    $('#pReplace').onclick = () => applyPaste(true);
    $('#pAppend').onclick = () => applyPaste(false);

    bindForm();
    loadCurrent();
    window.addEventListener('beforeprint', buildPrint);

    // 還沒看過本版更新內容時，版本按鈕顯示紅點
    try { $('#verDot').hidden = localStorage.getItem(SEEN_KEY) === APP_VERSION; } catch (e) { $('#verDot').hidden = false; }
    renderNotifyBtn();
    setTimeout(() => checkUpdate(false), 1200);
    // 頁面一直開著時，定期檢查（搭配桌面通知）
    setInterval(() => checkUpdate(false), 30 * 60 * 1000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) checkUpdate(false); });
  });
})();
