'use strict';
// ---------- Yearly Planner ----------
// A year at a glance for the big things: one block per month, a row per day with Event,
// Itinerary, Transport and Hotel. It stands apart from tasks; any day can be turned into a task
// when there is something to do. Weekends are tinted, today is marked, and a day can be given a
// colour. Kept with your own settings and synced to your other devices.

const YR_COLS = [['ev', 'Event'], ['it', 'Itinerary'], ['tr', 'Transport'], ['ho', 'Hotel']];
const yr = () => (S.settings.yearly = S.settings.yearly && typeof S.settings.yearly === 'object' ? S.settings.yearly : { d: {} });
const yrDays = () => (yr().d = yr().d && typeof yr().d === 'object' ? yr().d : {});
const yrDay = (iso) => yrDays()[iso] || {};
const yrIso = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
/** Column order and widths: one layout for every month, or a month's own. Synced with your settings. */
const yrLayAll = () => (yr().layout = yr().layout && typeof yr().layout === 'object' ? yr().layout : {});
function yrLay(ym) { const L = yrLayAll(); return (L.m && L.m[ym]) || L.all || {}; }
function yrColsFor(ym) {
  const order = Array.isArray(yrLay(ym).order) ? yrLay(ym).order : [];
  const keys = [...order.filter((k) => YR_COLS.some(([x]) => x === k)), ...YR_COLS.map(([k]) => k).filter((k) => !order.includes(k))];
  return keys.map((k) => YR_COLS.find(([x]) => x === k));
}
const yrW = (ym, k) => { const w = yrLay(ym).w?.[k]; return Number.isFinite(w) ? w : null; };
const YR_WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const YR_MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function yrSet(iso, k, v) {
  const d = { ...yrDay(iso) };
  if (v === '' || v === null || v === undefined) delete d[k]; else d[k] = v;
  const days = yrDays();
  if (Object.keys(d).length) days[iso] = d; else delete days[iso];
}
/** Which months are on screen: H1, H2 or the whole year. */
function yrMonths() {
  const v = ui.yr || (ui.yr = { year: new Date().getFullYear(), span: new Date().getMonth() < 6 ? 'h1' : 'h2' });
  const ms = v.span === 'h1' ? [1, 2, 3, 4, 5, 6] : v.span === 'h2' ? [7, 8, 9, 10, 11, 12] : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  return ms.map((m) => ({ y: v.year, m }));
}

function yrMonthHTML({ y, m }) {
  const ym = yrIso(y, m, 1).slice(0, 7);
  const cols = yrColsFor(ym);
  const n = new Date(y, m, 0).getDate();
  const today = todayISO();
  const rows = [];
  for (let d = 1; d <= 31; d += 1) {
    if (d > n) { rows.push(`<tr class="yr-none"><td class="yr-dn"></td><td class="yr-wd"></td>${cols.map(() => '<td></td>').join('')}<td></td></tr>`); continue; }
    const iso = yrIso(y, m, d);
    const wd = new Date(y, m - 1, d).getDay();
    const day = yrDay(iso);
    const hol = typeof holidaysOn === 'function' ? holidaysOn(iso) : [];
    const pub = hol.find((h) => h.kind === 'pub');
    const sch = hol.find((h) => h.kind !== 'pub');
    rows.push(`<tr class="${wd === 0 || wd === 6 ? 'yr-we' : ''} ${iso === today ? 'yr-today' : ''} ${pub ? 'yr-pub' : ''} ${sch?.kind === 'school' ? 'yr-sch' : ''}" data-iso="${iso}" ${hol.length ? `title="${esc(hol.map(holLabel).join(' · '))}"` : ''}>
      <td class="yr-dn">${d}</td><td class="yr-wd">${YR_WD[wd]}</td>
      ${cols.map(([k, label]) => `<td class="yr-${k}" ${k === 'ev' && day.c ? `style="--yc:${esc(day.c)}"` : ''}><input value="${esc(day[k] || '')}" ${k === 'ev' && hol.length ? `placeholder="${esc(hol.map(holLabel).join(' · '))}"` : ''} data-change="yrCell" data-iso="${iso}" data-k="${k}" aria-label="${esc(`${label}, ${d} ${YR_MON[m - 1]} ${y}`)}" autocomplete="off"></td>`).join('')}
      <td class="yr-act">${day.task && taskById(day.task) ? `<button class="yr-tlink" data-open-task="${esc(day.task)}" title="Open its task" aria-label="Open its task">${icon('check', 12)}</button>` : ''}<button class="icon-btn yr-more" data-act="yrMenu" data-iso="${iso}" aria-label="Options for ${d} ${YR_MON[m - 1]}">${icon('more', 14)}</button></td></tr>`);
  }
  const cur = today.slice(0, 7) === yrIso(y, m, 1).slice(0, 7);
  return `<section class="yr-month ${cur ? 'yr-cur' : ''}" data-ym="${yrIso(y, m, 1).slice(0, 7)}"><table class="yr-tbl">
    <colgroup><col class="c-dn"><col class="c-wd">${cols.map(([k]) => `<col class="c-${k}" ${yrW(ym, k) ? `style="width:${yrW(ym, k)}px"` : ''}>`).join('')}<col class="c-act"></colgroup>
    <thead><tr class="yr-mh"><th colspan="${cols.length + 3}">${YR_MON[m - 1]} ${String(y).slice(2)}${cur ? '<span class="yr-curtag">This month</span>' : ''}</th></tr>
      <tr><th class="yr-dn"></th><th class="yr-wd"></th>${cols.map(([k, l]) => `<th class="yr-${k} yr-colh" data-ym="${ym}" data-k="${k}" title="Drag to move this column; drag its edge to resize">${l}<span class="yr-rsz" data-ym="${ym}" data-k="${k}" aria-hidden="true"></span></th>`).join('')}<th class="yr-act"></th></tr></thead>
    <tbody>${rows.join('')}</tbody></table></section>`;
}
function renderYearly() {
  const months = yrMonths();
  const v = ui.yr;
  const count = Object.keys(yrDays()).filter((k) => k.startsWith(`${v.year}-`) && yrDays()[k].ev).length;
  return `<div class="page yr-page">
    <header class="bp-head"><div><h1>Yearly Planner <span class="bp-sub">${v.year}</span></h1><p class="small muted">The big events of the year. Not linked to tasks; turn a day into a task from its ⋯ menu when needed.</p></div>
      <div class="spacer"></div>
      <div class="seg">${[['h1', 'Jan – Jun'], ['h2', 'Jul – Dec'], ['year', 'Full Year']].map(([k, l]) => `<button class="${v.span === k ? 'on' : ''}" data-act="yrSpan" data-v="${k}">${l}</button>`).join('')}</div>
      <div class="row bp-year"><button class="icon-btn" data-act="yrYear" data-d="-1" aria-label="Previous year">${icon('chevL')}</button><b>${v.year}</b><button class="icon-btn" data-act="yrYear" data-d="1" aria-label="Next year">${icon('chevR')}</button></div>
      <button class="btn ghost sm" data-act="holPick" title="Public and school holidays">${icon('flag', 13)} Holidays</button>
      <button class="btn ghost sm" data-act="yrThisMonth" title="Go to this month">${icon('cal', 14)} This month</button>
      <label class="yr-jump" title="Go to a month"><span class="sr-only">Go to month</span><input type="month" value="${esc(ui.yr.focus || `${v.year}-${String(yrMonths()[0].m).padStart(2, '0')}`)}" data-change="yrGo" aria-label="Go to month and year"></label>
    </header>
    <p class="small muted yr-count">${count} day${count === 1 ? '' : 's'} with an event in ${v.year}</p>
    <div class="yr-scroll" data-scroll="yearly"><div class="yr-months">${months.map(yrMonthHTML).join('')}</div></div>
  </div>`;
}

function yrMenuHTML(iso) {
  const day = yrDay(iso);
  const t = day.task && taskById(day.task);
  return `<div class="menu yr-menu" role="menu">
    <p class="yr-mlabel">${esc(dayLabel(iso))} · colour</p>
    <div class="yr-sw">${[{ v: '', label: 'None' }, ...tbColors(day.c).filter((c) => c.v)].map((c) => `<button class="yr-swb ${c.v === (day.c || '') ? 'on' : ''}" data-act="yrColour" data-iso="${iso}" data-v="${esc(c.v)}" title="${esc(c.label)}" aria-label="${esc(c.label)}" style="--yc:${c.v || 'transparent'}"></button>`).join('')}</div>
    <hr><button role="menuitem" data-act="yrRepeat" data-iso="${iso}">${icon('repeat', 15)}<span>Repeat to the next days…</span></button>
    ${t ? `<button role="menuitem" data-open-task="${esc(t.id)}">${icon('check', 15)}<span>Open its task</span></button>` : `<button role="menuitem" data-act="yrTask" data-iso="${iso}">${icon('plus', 15)}<span>Create a task for this day</span></button>`}
    <button role="menuitem" class="danger" data-act="yrClear" data-iso="${iso}">${icon('close', 15)}<span>Clear this day</span></button>
  </div>`;
}
const yrNext = (iso, n) => { const d = new Date(`${iso}T12:00:00`); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

Object.assign(actions, {
  yrSpan: (el) => { ui.yr.span = el.dataset.v; render(); },
  yrThisMonth: () => yrGoTo(todayISO().slice(0, 7)),
  yrYear: (el) => { ui.yr.year += Number(el.dataset.d); render(); },
  yrMenu: (el) => openPop(el, () => yrMenuHTML(el.dataset.iso)),
  yrColour: (el) => { yrSet(el.dataset.iso, 'c', el.dataset.v); closePop(); commit(); },
  yrClear: async (el) => {
    const iso = el.dataset.iso;
    closePop();
    if (!Object.keys(yrDay(iso)).length) return;
    const before = clone(yrDay(iso));
    delete yrDays()[iso];
    commit();
    toast('Day cleared.', { undo: () => { yrDays()[iso] = before; commit(); } });
  },
  yrRepeat: async (el) => {
    const iso = el.dataset.iso;
    closePop();
    const day = yrDay(iso);
    if (!YR_COLS.some(([k]) => day[k])) { toast('Write something on this day first.'); return; }
    const n = Number(await promptDlg('Repeat to the next days', 'How many more days?', '1', 'Repeat'));
    if (!Number.isInteger(n) || n < 1) return;
    const days = Math.min(n, 120);
    for (let i = 1; i <= days; i += 1) {
      const to = yrNext(iso, i);
      const keep = yrDay(to);
      yrDays()[to] = { ...keep, ...Object.fromEntries(YR_COLS.filter(([k]) => day[k]).map(([k]) => [k, day[k]])), ...(day.c ? { c: day.c } : {}) };
    }
    commit();
    toast(`Copied to the next ${days} day${days === 1 ? '' : 's'}.`);
  },
  yrTask: (el) => {
    const iso = el.dataset.iso;
    closePop();
    const day = yrDay(iso);
    const plan = personalPlan();
    const title = day.ev || day.it || `Plan for ${dayLabel(iso)}`;
    const notes = [day.it && `Itinerary: ${day.it}`, day.tr && `Transport: ${day.tr}`, day.ho && `Hotel: ${day.ho}`].filter(Boolean).join('\n');
    const t = addTask({ planId: plan.id, bucketId: plan.buckets[0]?.id || null, title, notes: `From the Yearly Planner · ${dayLabel(iso)}${notes ? `\n${notes}` : ''}`, due: iso, assignees: [S.meId] });
    yrSet(iso, 'task', t.id);
    commit();
    toast('Task created.', { action: { label: 'Open', run: () => openTask(t.id) } });
  },
});
Object.assign(changes, {
  yrGo: (el) => { if (/^\d{4}-\d{2}$/.test(el.value)) yrGoTo(el.value); },
  yrCell: (el) => { yrSet(el.dataset.iso, el.dataset.k, el.value.trim().slice(0, 300)); Store.save(); },
});
// Keep the fields of the row you were typing in when the page redraws (only the changed cell is saved; no redraw needed).

// ---------- Ranges: select, copy and paste blocks of cells (like a spreadsheet) ----------
// Drag across cells, or click one and Shift-click another, to select a block. Cmd/Ctrl+C copies it
// (it pastes into Excel too); Delete clears it. Pasting several cells (from here or from Excel)
// fills the days and columns from the cell you paste into.
let yrRange = null; // { a: {iso, c}, b: {iso, c} }
let yrPick = null;
const yrCol = (k, ym) => yrColsFor(ym).findIndex(([x]) => x === k);
const yrCellOf = (el) => { const i = el?.closest?.('td')?.querySelector('input[data-change="yrCell"]'); return i ? { iso: i.dataset.iso, c: yrCol(i.dataset.k, i.dataset.iso.slice(0, 7)), el: i } : null; };
function yrRangeCells() {
  if (!yrRange) return null;
  const [d1, d2] = [yrRange.a.iso, yrRange.b.iso].sort();
  const [c1, c2] = [yrRange.a.c, yrRange.b.c].sort((x, y) => x - y);
  const days = [];
  for (let d = d1, i = 0; d <= d2 && i < 400; d = yrNext(d, 1), i += 1) days.push(d);
  return { days, cols: yrColsFor(yrRange.a.iso.slice(0, 7)).slice(c1, c2 + 1).map(([k]) => k) };
}
function yrPaint() {
  $$('.yr-sel').forEach((n) => n.classList.remove('yr-sel'));
  const r = yrRangeCells();
  if (!r || (r.days.length === 1 && r.cols.length === 1)) return;
  r.days.forEach((d) => r.cols.forEach((k) => $(`input[data-iso="${d}"][data-k="${k}"]`)?.closest('td')?.classList.add('yr-sel')));
}
const yrMulti = () => { const r = yrRangeCells(); return !!r && r.days.length * r.cols.length > 1; };
document.addEventListener('pointerdown', (e) => {
  if (ui.route?.view !== 'yearly' || e.button !== 0) return;
  const cell = yrCellOf(e.target);
  if (!cell) { if (!e.target.closest?.('.yr-menu')) { yrRange = null; yrPaint(); } return; }
  if (e.shiftKey && yrRange) { e.preventDefault(); yrRange.b = cell; yrPaint(); return; }
  yrRange = { a: cell, b: cell };
  yrPick = { x: e.clientX, y: e.clientY, on: false };
  yrPaint();
});
document.addEventListener('pointermove', (e) => {
  if (!yrPick || !(e.buttons & 1)) return;
  if (!yrPick.on && Math.hypot(e.clientX - yrPick.x, e.clientY - yrPick.y) < 8) return;
  const cell = yrCellOf(document.elementFromPoint(e.clientX, e.clientY));
  if (!cell) return;
  if (!yrPick.on && cell.iso === yrRange.a.iso && cell.c === yrRange.a.c) return;
  yrPick.on = true;
  e.preventDefault();
  window.getSelection()?.removeAllRanges();
  document.activeElement?.blur?.();
  yrRange.b = cell;
  yrPaint();
});
document.addEventListener('pointerup', () => { yrPick = null; });
const yrTSV = (rows) => rows.map((r) => r.map((v) => (/[\t\n"]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)).join('\t')).join('\n');
function yrParseTSV(text) {
  const rows = [[]];
  let cur = '';
  let q = false;
  const t = text.replace(/\r\n?/g, '\n').replace(/\n$/, '');
  for (let i = 0; i < t.length; i += 1) {
    const ch = t[i];
    if (q) { if (ch === '"' && t[i + 1] === '"') { cur += '"'; i += 1; } else if (ch === '"') q = false; else cur += ch; }
    else if (ch === '"' && cur === '') q = true;
    else if (ch === '\t') { rows.at(-1).push(cur); cur = ''; }
    else if (ch === '\n') { rows.at(-1).push(cur); rows.push([]); cur = ''; }
    else cur += ch;
  }
  rows.at(-1).push(cur);
  return rows;
}
document.addEventListener('copy', (e) => {
  if (ui.route?.view !== 'yearly' || !yrMulti()) return;
  const r = yrRangeCells();
  e.preventDefault();
  e.clipboardData.setData('text/plain', yrTSV(r.days.map((d) => r.cols.map((k) => yrDay(d)[k] || ''))));
  toast(`Copied ${r.days.length} × ${r.cols.length} cells.`);
});
document.addEventListener('paste', (e) => {
  if (ui.route?.view !== 'yearly') return;
  const at = (yrMulti() && yrRangeCells()) ? { iso: yrRangeCells().days[0], c: yrCol(yrRangeCells().cols[0], yrRangeCells().days[0].slice(0, 7)) } : yrCellOf(document.activeElement);
  if (!at) return;
  const text = e.clipboardData?.getData('text/plain') || '';
  if (!/[\t\n]/.test(text.replace(/\n$/, ''))) return; // one value: the box takes it as usual
  e.preventDefault();
  const rows = yrParseTSV(text);
  let n = 0;
  rows.forEach((row, ri) => {
    const iso = yrNext(at.iso, ri);
    row.forEach((v, ci) => { const col = yrColsFor(at.iso.slice(0, 7))[at.c + ci]; if (col) { yrSet(iso, col[0], v.trim().slice(0, 300)); n += 1; } });
  });
  const last = yrNext(at.iso, rows.length - 1);
  yrRange = { a: { iso: at.iso, c: at.c }, b: { iso: last, c: Math.min(YR_COLS.length - 1, at.c + Math.max(...rows.map((r) => r.length)) - 1) } };
  commit();
  yrPaint();
  toast(`Pasted ${rows.length} day${rows.length === 1 ? '' : 's'}.`);
});
document.addEventListener('keydown', (e) => {
  if (ui.route?.view !== 'yearly' || !yrMulti()) return;
  if (e.key === 'Escape') { yrRange = null; yrPaint(); return; }
  if ((e.key === 'Delete' || e.key === 'Backspace') && !(document.activeElement?.matches?.('input') && document.activeElement.value && document.activeElement.selectionStart !== document.activeElement.selectionEnd)) {
    e.preventDefault();
    const r = yrRangeCells();
    r.days.forEach((d) => r.cols.forEach((k) => yrSet(d, k, '')));
    commit();
    yrPaint();
    toast('Cleared.');
  }
});
if (typeof render === 'function') {
  const origRenderYr = render;
  // eslint-disable-next-line no-global-assign
  render = function renderKeepRange() { const out = origRenderYr.apply(this, arguments); if (ui.route?.view === 'yearly') yrPaint(); return out; };
}

// ---------- Jump to a month ----------
/** Shows the year and half that hold this month, then scrolls it to the left edge. */
function yrGoTo(ym) {
  const [y, m] = ym.split('-').map(Number);
  ui.yr = ui.yr || { year: y, span: 'h1' };
  ui.yr.year = y;
  if (ui.yr.span !== 'year') ui.yr.span = m <= 6 ? 'h1' : 'h2';
  ui.yr.focus = ym;
  render();
  setTimeout(() => {
    const box = $('.yr-scroll');
    const sec = $(`.yr-month[data-ym="${ym}"]`);
    if (!box || !sec) return;
    box.scrollLeft += sec.getBoundingClientRect().left - box.getBoundingClientRect().left;
    sec.classList.add('yr-flash');
    setTimeout(() => sec.classList.remove('yr-flash'), 1200);
    // Today's row in view too, when going to this month.
    if (ym === todayISO().slice(0, 7)) $(`tr[data-iso="${todayISO()}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, 30);
}

// ---------- Column width and order (drag a heading's edge, or the heading itself) ----------
let yrColDrag = null;
async function yrSaveLayout(ym, order, w) {
  const v = await choiceDlg('Apply to all months?', '<p>Use this column layout for every month, or only this one?</p>',
    [{ v: 'all', label: 'All months', primary: true }, { v: 'this', label: 'Only this month' }, { v: 'cancel', label: 'Cancel' }]);
  const L = yrLayAll();
  if (v === 'all') { L.all = { order, w }; delete L.m; }
  else if (v === 'this') { L.m = { ...(L.m || {}), [ym]: { order, w } }; }
  commit();
}
document.addEventListener('pointerdown', (e) => {
  if (ui.route?.view !== 'yearly' || e.button !== 0) return;
  const rsz = e.target.closest?.('.yr-rsz');
  const th = e.target.closest?.('th.yr-colh');
  if (!rsz && !th) return;
  e.preventDefault();
  const ym = (rsz || th).dataset.ym;
  const k = (rsz || th).dataset.k;
  const sec = (rsz || th).closest('.yr-month');
  const col = sec.querySelector(`col.c-${k}`);
  yrColDrag = rsz
    ? { kind: 'size', ym, k, sec, col, x: e.clientX, w0: col.getBoundingClientRect().width || th?.offsetWidth || 100 }
    : { kind: 'move', ym, k, sec, th, x: e.clientX, y: e.clientY, on: false, before: null };
});
document.addEventListener('pointermove', (e) => {
  const d = yrColDrag;
  if (!d) return;
  if (d.kind === 'size') { d.w = Math.max(40, Math.min(420, Math.round(d.w0 + e.clientX - d.x))); d.col.style.width = `${d.w}px`; return; }
  if (!d.on && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 6) return;
  d.on = true;
  d.th.classList.add('yr-dragging');
  const ths = [...d.sec.querySelectorAll('th.yr-colh')];
  d.sec.querySelectorAll('.yr-drop-before, .yr-drop-after').forEach((n) => n.classList.remove('yr-drop-before', 'yr-drop-after'));
  const over = ths.find((t) => { const r = t.getBoundingClientRect(); return e.clientX >= r.left && e.clientX <= r.right; });
  if (!over) { d.before = null; return; }
  const r = over.getBoundingClientRect();
  const after = e.clientX > r.left + r.width / 2;
  over.classList.add(after ? 'yr-drop-after' : 'yr-drop-before');
  const i = ths.indexOf(over) + (after ? 1 : 0);
  d.before = i < ths.length ? ths[i].dataset.k : '';
});
document.addEventListener('pointerup', () => {
  const d = yrColDrag;
  yrColDrag = null;
  if (!d) return;
  const cur = yrColsFor(d.ym).map(([k]) => k);
  const widths = { ...(yrLay(d.ym).w || {}) };
  if (d.kind === 'size') {
    if (!d.w) return;
    widths[d.k] = d.w;
    yrSaveLayout(d.ym, cur, widths);
    return;
  }
  d.th.classList.remove('yr-dragging');
  d.sec.querySelectorAll('.yr-drop-before, .yr-drop-after').forEach((n) => n.classList.remove('yr-drop-before', 'yr-drop-after'));
  if (!d.on || d.before === null || d.before === d.k) return;
  const order = cur.filter((k) => k !== d.k);
  const at = d.before === '' ? order.length : order.indexOf(d.before);
  order.splice(at < 0 ? order.length : at, 0, d.k);
  if (order.join() === cur.join()) return;
  yrSaveLayout(d.ym, order, widths);
});
document.addEventListener('dblclick', (e) => {
  const rsz = e.target.closest?.('.yr-rsz');
  if (!rsz || ui.route?.view !== 'yearly') return;
  const ym = rsz.dataset.ym;
  const w = { ...(yrLay(ym).w || {}) };
  delete w[rsz.dataset.k];
  yrSaveLayout(ym, yrColsFor(ym).map(([k]) => k), w);
});
