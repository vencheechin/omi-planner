'use strict';
// ---------- S-Team / PD Plan: pick several entries at once ----------
// Shift-click (or Cmd/Ctrl-click) entries to select them; on a phone tap "Select" first.
// Then drag any selected entry and they all move together, keeping their spacing in months
// and rows. Copy (or Cmd/Ctrl+C) and click a month (or Cmd/Ctrl+V over it) to paste copies;
// copies get their own Planner tasks. Delete sends the selection to the recycle bin.

ui.bpSel = [];       // keys "group|row|month|index", as on each entry's data-id
ui.bpClip = null;    // [{ dr, dm, item }] relative to the top-left entry
ui.bpSelMode = false;

const bpSelOn = () => ['halfplan', 'pdplan'].includes(ui.route?.view) && typeof stCurrent === 'function' && stCanEdit(stCurrent());
/** Every brand and item row, top to bottom. */
const bpFlatRows = () => bp().groups.flatMap((g) => g.rows.flatMap((r) => [r, ...(r.items || [])].map((row) => ({ g: g.id, row }))));
const bpMonthAdd = (k, d) => { const [y, m] = k.split('-').map(Number); const n = y * 12 + (m - 1) + d; return `${Math.floor(n / 12)}-${String((n % 12) + 1).padStart(2, '0')}`; };
const bpMonthDiff = (a, b) => { const [y1, m1] = a.split('-').map(Number); const [y2, m2] = b.split('-').map(Number); return (y2 * 12 + m2) - (y1 * 12 + m1); };
/** The selected entries that still exist, with where they sit. */
function bpSelected() {
  const rows = bpFlatRows();
  return ui.bpSel.map((key) => {
    const [, r, m, n] = key.split('|');
    const at = rows.findIndex((x) => x.row.id === r);
    const item = at >= 0 ? cellItems(rows[at].row.cells[m])[Number(n)] : null;
    return item ? { key, at, row: rows[at].row, m, n: Number(n), item } : null;
  }).filter(Boolean);
}
const bpClearSel = () => { ui.bpSel = []; };

function bpSelToggle(key) {
  ui.bpSel = ui.bpSel.includes(key) ? ui.bpSel.filter((k) => k !== key) : [...ui.bpSel, key];
  bpSelPaint();
}
/** Takes entries out of their cells (by identity, so indexes don't shift under us). */
function bpTakeOut(sel) {
  const byCell = new Map();
  sel.forEach((x) => { const k = `${x.row.id}|${x.m}`; if (!byCell.has(k)) byCell.set(k, { row: x.row, m: x.m, drop: new Set() }); byCell.get(k).drop.add(x.n); });
  for (const { row, m, drop } of byCell.values()) {
    const keep = cellItems(row.cells[m]).filter((_, i) => !drop.has(i));
    if (keep.length) row.cells[m] = { items: keep }; else delete row.cells[m];
  }
}
function bpPutIn(rows, at, m, item) {
  const row = rows[Math.max(0, Math.min(rows.length - 1, at))].row;
  row.cells[m] = { items: [...cellItems(row.cells[m]), item] };
}

/** Drag of a selected entry: everything selected moves by the same rows and months. */
function bpSelMove(s, drop) {
  if (!bpSelOn() || ui.bpSel.length < 2 || !ui.bpSel.includes(String(s.id))) return false;
  const t = s.target;
  const sel = bpSelected();
  const anchor = sel.find((x) => x.key === String(s.id));
  if (!drop || !t || !anchor || (t.r === anchor.row.id && t.m === anchor.m)) { render(); return true; }
  const rows = bpFlatRows();
  const dRow = rows.findIndex((x) => x.row.id === t.r) - anchor.at;
  const dMonth = bpMonthDiff(anchor.m, t.m);
  const moves = sel.map((x) => ({ at: x.at + dRow, m: bpMonthAdd(x.m, dMonth), item: x.item }));
  bpTakeOut(sel);
  moves.forEach((x) => bpPutIn(rows, x.at, x.m, x.item));
  bpClearSel();
  commit();
  toast(`Moved ${moves.length} entries.`);
  return true;
}
function bpCopy() {
  const sel = bpSelected();
  if (!sel.length) return;
  const top = Math.min(...sel.map((x) => x.at));
  const first = sel.map((x) => x.m).sort()[0];
  ui.bpClip = sel.map((x) => {
    const { task, ln, ...item } = x.item; // Copies get tasks of their own.
    return { dr: x.at - top, dm: bpMonthDiff(first, x.m), item };
  });
  bpClearSel();
  bpSelPaint();
  toast(`Copied ${ui.bpClip.length} ${ui.bpClip.length === 1 ? 'entry' : 'entries'}. Click a month to paste.`);
}
function bpPaste(cell) {
  if (!ui.bpClip?.length || !cell) return;
  const rows = bpFlatRows();
  const at = rows.findIndex((x) => x.row.id === cell.dataset.r);
  if (at < 0) return;
  ui.bpClip.forEach((c) => bpPutIn(rows, at + c.dr, bpMonthAdd(cell.dataset.m, c.dm), clone(c.item)));
  commit();
  toast(`Pasted ${ui.bpClip.length} ${ui.bpClip.length === 1 ? 'entry' : 'entries'}.`);
}
async function bpSelDelete() {
  const sel = bpSelected();
  if (!sel.length) return;
  if (!await confirmDlg(`Delete ${sel.length} ${sel.length === 1 ? 'entry' : 'entries'}?`, 'They go to the recycle bin. Click the bin to restore them.', 'Delete')) return;
  const p = stCurrent();
  sel.forEach((x) => {
    const parent = bpParentOf(bpFlatRows()[x.at].g, x.row.id);
    const rowName = parent ? `${parent.brand || 'Brand'} · ${x.row.brand || 'Item'}` : (x.row.brand || 'Brand');
    binAdd({ kind: 'stitem', title: x.item.text || 'Month entry', where: `${stName(p)} · ${rowName} · ${bpMonthLabel(x.m)}`, data: { plan: p.id, gid: bpFlatRows()[x.at].g, rid: x.row.id, m: x.m, item: clone(x.item) } });
  });
  bpTakeOut(sel);
  bpClearSel();
  commit();
  toast('Moved to the recycle bin.', { action: { label: 'Open bin', run: () => actions.binOpen() } });
}

// ---------- Showing it ----------
function bpSelPaint() {
  $$('.bp-sel').forEach((n) => n.classList.remove('bp-sel'));
  document.body.classList.toggle('bp-pasting', !!ui.bpClip && bpSelOn());
  document.body.classList.toggle('bp-selecting', ui.bpSelMode && bpSelOn());
  if (!bpSelOn()) { $('.bp-selbar')?.remove(); return; }
  ui.bpSel = ui.bpSel.filter((key) => { const n = $(`[data-drag="bpitem"][data-id="${CSS.escape(key)}"]`); n?.classList.add('bp-sel'); return !!n; });
  const n = ui.bpSel.length;
  const html = n
    ? `<b>${n} selected</b><span class="small muted">Drag one to move them all</span><button class="btn sm" data-act="bpSelCopy">${icon('copy', 13)} Copy</button><button class="btn sm ghost danger" data-act="bpSelDelete">${icon('trash', 13)} Delete</button><button class="btn sm ghost" data-act="bpSelClear">Done</button>`
    : ui.bpClip ? `<b>${ui.bpClip.length} copied</b><span class="small muted">Click a month to paste</span><button class="btn sm ghost" data-act="bpClipClear">Done</button>`
      : ui.bpSelMode ? `<b>Select entries</b><span class="small muted">Tap entries to pick them</span><button class="btn sm ghost" data-act="bpSelClear">Done</button>` : '';
  let bar = $('.bp-selbar');
  if (!html) { bar?.remove(); return; }
  if (!bar) { bar = document.createElement('div'); bar.className = 'bp-selbar'; bar.setAttribute('role', 'toolbar'); bar.setAttribute('aria-label', 'Selected entries'); document.body.append(bar); }
  bar.innerHTML = html;
}
const origRenderSel = render;
// eslint-disable-next-line no-global-assign
render = function renderWithSelection() { const out = origRenderSel.apply(this, arguments); bpSelPaint(); return out; };

// ---------- Input ----------
// Runs before the app's own click handling (window comes before document).
window.addEventListener('click', (e) => {
  if (!bpSelOn()) return;
  const entry = e.target.closest?.('.bp-cell [data-drag="bpitem"]');
  if (entry && (e.shiftKey || e.metaKey || e.ctrlKey || ui.bpSelMode)) {
    e.preventDefault(); e.stopImmediatePropagation();
    bpSelToggle(entry.dataset.id);
    return;
  }
  const cell = ui.bpClip && e.target.closest?.('.bp-cell');
  if (cell && !e.target.closest('.bp-edit')) { e.preventDefault(); e.stopImmediatePropagation(); bpPaste(cell); }
}, true);
let bpHoverCell = null;
document.addEventListener('pointermove', (e) => { bpHoverCell = e.target.closest?.('.bp-cell') || bpHoverCell; }, { passive: true });
document.addEventListener('keydown', (e) => {
  if (!bpSelOn() || e.target.closest?.('input, textarea, select, [contenteditable="true"], dialog[open]')) return;
  const mod = e.metaKey || e.ctrlKey;
  if (mod && e.key.toLowerCase() === 'c' && ui.bpSel.length) { e.preventDefault(); bpCopy(); }
  else if (mod && e.key.toLowerCase() === 'v' && ui.bpClip && bpHoverCell?.isConnected) { e.preventDefault(); bpPaste(bpHoverCell); }
  else if ((e.key === 'Delete' || e.key === 'Backspace') && ui.bpSel.length) { e.preventDefault(); bpSelDelete(); }
  else if (e.key === 'Escape' && (ui.bpSel.length || ui.bpClip || ui.bpSelMode)) { ui.bpSel = []; ui.bpClip = null; ui.bpSelMode = false; bpSelPaint(); }
});

Object.assign(actions, {
  bpSelCopy: () => bpCopy(),
  bpSelDelete: () => bpSelDelete(),
  bpSelClear: () => { ui.bpSel = []; ui.bpSelMode = false; bpSelPaint(); },
  bpClipClear: () => { ui.bpClip = null; bpSelPaint(); },
  bpSelMode: () => { ui.bpSelMode = !ui.bpSelMode; if (!ui.bpSelMode) ui.bpSel = []; bpSelPaint(); },
});
