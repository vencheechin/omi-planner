'use strict';
/* H1 / H2 Plan: a half-year table like the Monthly Brand Status Review.
   Groups (OMI, LHS) hold brands; each brand has a PIC and one cell per month with the month's
   focus and a status: Green = on plan, Yellow = off plan but recoverable, Red = needs CEO support.
   It's shared with your team (cloud sync or the shared folder). Each group syncs on its own, so
   two people editing different groups never overwrite each other; within a group the latest edit wins. */

Object.assign(ICON, { table: 'M3 5h18v14H3zM3 10h18M3 15h18M9 5v14' });

const BP_STATUS = [
  { v: 'green', label: 'Green', meaning: 'On plan' },
  { v: 'yellow', label: 'Yellow', meaning: 'Off plan, recoverable' },
  { v: 'red', label: 'Red', meaning: 'Needs CEO support' },
];
const bp = () => (S.brandPlan = S.brandPlan && Array.isArray(S.brandPlan.groups) ? S.brandPlan : { groups: [] });
function normalizeBrandPlan(b) {
  if (!b || !Array.isArray(b.groups)) return { groups: [], ...(b && b._v ? { _v: b._v } : {}) };
  return {
    ...(b._v && typeof b._v === 'object' ? { _v: b._v } : {}),
    groups: b.groups.filter((g) => g && g.id).map((g) => ({
      id: String(g.id), name: String(g.name || 'Group'),
      rows: (Array.isArray(g.rows) ? g.rows : []).filter((r) => r && r.id).map((r) => ({
        id: String(r.id), brand: String(r.brand || ''), pic: String(r.pic || ''),
        cells: Object.fromEntries(Object.entries(r.cells && typeof r.cells === 'object' ? r.cells : {})
          .filter(([k, c]) => /^\d{4}-\d{2}$/.test(k) && c && (c.text || c.status || c.pic))
          .map(([k, c]) => [k, { text: String(c.text || ''), pic: String(c.pic || ''), status: BP_STATUS.some((s) => s.v === c.status) ? c.status : '' }])),
      })),
    })),
  };
}
/** The half shown: H1 = Jan–Jun, H2 = Jul–Dec. Starts on the current half. */
function bpHalf() {
  if (!ui.bpHalf) { const d = new Date(); ui.bpHalf = { year: d.getFullYear(), half: d.getMonth() < 6 ? 1 : 2 }; }
  return ui.bpHalf;
}
const bpMonths = ({ year, half }) => Array.from({ length: 6 }, (_, i) => `${year}-${String((half - 1) * 6 + i + 1).padStart(2, '0')}`);
const bpMonthLabel = (k) => new Date(Number(k.slice(0, 4)), Number(k.slice(5)) - 1, 1).toLocaleDateString(undefined, { month: 'short', year: 'numeric' });

function renderBrandPlan() {
  const h = bpHalf();
  const months = bpMonths(h);
  const groups = bp().groups;
  const cell = (g, r, k) => {
    const c = r.cells[k];
    return `<td class="bp-cell ${c?.status ? `bp-${c.status}` : ''}" data-act="bpCell" data-g="${esc(g.id)}" data-r="${esc(r.id)}" data-m="${k}" tabindex="0" aria-label="${esc(`${r.brand}, ${bpMonthLabel(k)}: ${c?.text || 'empty'}${c?.status ? `, ${c.status}` : ''}${c?.pic ? `, PIC ${c.pic}` : ''}`)}">${c?.text ? `<span class="bp-ctext">${esc(c.text)}</span>` : ''}${c?.pic ? `<small class="bp-cpic">${esc(c.pic)}</small>` : ''}</td>`;
  };
  return `<div class="page bp-page">
    <header class="bp-head">
      <div><h1>S-Team Plan <span class="bp-sub">H${h.half} ${h.year}</span></h1></div>
      <div class="spacer"></div>
      <div class="seg">${[1, 2].map((n) => `<button class="${h.half === n ? 'on' : ''}" data-act="bpHalf" data-v="${n}">H${n}</button>`).join('')}</div>
      <div class="row bp-year"><button class="icon-btn" data-act="bpYear" data-d="-1" aria-label="Previous year">${icon('chevL')}</button><b>${h.year}</b><button class="icon-btn" data-act="bpYear" data-d="1" aria-label="Next year">${icon('chevR')}</button></div>
    </header>
    ${groups.length ? `<div class="bp-scroll"><table class="bp-table">
      <thead><tr><th class="bp-brand">Brand</th><th class="bp-pic">PIC</th>${months.map((k) => `<th>${esc(bpMonthLabel(k))}</th>`).join('')}<th class="bp-x"></th></tr></thead>
      <tbody>${groups.map((g) => `
        <tr class="bp-group"><th colspan="2" class="bp-brand"><input value="${esc(g.name)}" data-change="bpGroupName" data-g="${esc(g.id)}" aria-label="Group name"></th><td colspan="${months.length}"></td>
          <td class="bp-x"><button class="icon-btn" data-act="bpDelGroup" data-g="${esc(g.id)}" aria-label="Delete group ${esc(g.name)}">${icon('close', 13)}</button></td></tr>
        ${g.rows.map((r) => `<tr>
          <th class="bp-brand"><input value="${esc(r.brand)}" placeholder="Brand" data-change="bpRow" data-k="brand" data-g="${esc(g.id)}" data-r="${esc(r.id)}" aria-label="Brand"></th>
          <td class="bp-pic"><input value="${esc(r.pic)}" placeholder="PIC" data-change="bpRow" data-k="pic" data-g="${esc(g.id)}" data-r="${esc(r.id)}" aria-label="PIC"></td>
          ${months.map((k) => cell(g, r, k)).join('')}
          <td class="bp-x"><button class="icon-btn" data-act="bpDelRow" data-g="${esc(g.id)}" data-r="${esc(r.id)}" aria-label="Delete ${esc(r.brand || 'brand')}">${icon('close', 13)}</button></td></tr>`).join('')}
        <tr class="bp-add"><td colspan="${months.length + 3}"><button class="btn ghost sm" data-act="bpAddRow" data-g="${esc(g.id)}">${icon('plus', 13)} Brand</button></td></tr>`).join('')}
      </tbody></table></div>` : `<div class="empty"><h2>No brands yet</h2><div class="row" style="justify-content:center"><button class="btn primary" data-act="bpExample">Start with OMI and LHS</button></div></div>`}
    <div class="row"><button class="btn ghost sm" data-act="bpAddGroup">${icon('plus', 13)} Group</button></div>
    <div class="bp-legend">${BP_STATUS.map((s) => `<span><i class="bp-dot bp-${s.v}"></i><b>${s.label}</b> ${esc(s.meaning)}</span>`).join('')}</div>
  </div>`;
}
function bpCellPicker(g, r, k) {
  const c = r.cells[k] || { text: '', status: '' };
  return `<form class="picker bp-pick" data-submit="bpCellSave" data-g="${esc(g.id)}" data-r="${esc(r.id)}" data-m="${k}">
    <h4>${esc(r.brand || 'Brand')} · ${esc(bpMonthLabel(k))}</h4>
    <textarea name="text" rows="2" aria-label="Focus for the month">${esc(c.text)}</textarea>
    <input name="pic" value="${esc(c.pic || '')}" placeholder="PIC" aria-label="PIC" autocomplete="off">
    <div class="bp-status">${[{ v: '', label: 'None', meaning: '' }, ...BP_STATUS].map((s) => `<label class="bp-opt"><input type="radio" name="status" value="${s.v}" ${c.status === s.v ? 'checked' : ''}><i class="bp-dot ${s.v ? `bp-${s.v}` : 'bp-none'}"></i><span>${esc(s.label)}</span></label>`).join('')}</div>
    <div class="row"><button class="btn ghost sm" type="button" data-act="bpCellClear">Clear</button><span class="spacer"></span><button class="btn primary sm">Save</button></div></form>`;
}
// ---------- Sharing: one record, one field per group plus the order of the groups ----------
const bpRecord = () => ({ order: bp().groups.map((g) => g.id), ...Object.fromEntries(bp().groups.map((g) => [`g:${g.id}`, g])) });
/** The fields to stamp: every group now, plus ones that were deleted (so the deletion syncs). */
function bpFieldsOf() {
  const f = new Set(bp().groups.map((g) => `g:${g.id}`));
  [...Object.keys(S.sync?.shadow?.brandplan || {}), ...Object.keys(bp()._v || {})].forEach((k) => { if (k.startsWith('g:')) f.add(k); });
  return ['order', ...f];
}
const bpWire = () => ({ ...bpRecord(), _v: clone(bp()._v || {}) });
/** Applies a teammate's copy, field by field (newest wins). Returns true when anything changed. */
function applyBrandPlanData(d) {
  if (!d || typeof d !== 'object') return false;
  const b = bp();
  b._v = b._v || {};
  const sh = (S.sync.shadow.brandplan = S.sync.shadow.brandplan || {});
  const v = d._v || {};
  let changed = false;
  let order = null;
  for (const [f, rv] of Object.entries(v)) {
    if ((f !== 'order' && !f.startsWith('g:')) || !newer(rv, b._v[f])) continue;
    if (f === 'order') order = Array.isArray(d.order) ? d.order : null;
    else {
      const id = f.slice(2);
      const i = b.groups.findIndex((g) => g.id === id);
      const val = d[f];
      if (val && val.id) {
        const g = normalizeBrandPlan({ groups: [val] }).groups[0];
        if (i >= 0) b.groups[i] = g; else b.groups.push(g);
      } else if (i >= 0) b.groups.splice(i, 1);
    }
    b._v[f] = rv;
    changed = true;
  }
  if (order) b.groups.sort((x, y) => ((order.indexOf(x.id) + 1) || 1e9) - ((order.indexOf(y.id) + 1) || 1e9));
  if (changed) { const rec = bpRecord(); Object.keys(v).forEach((f) => { if (f === 'order' || f.startsWith('g:')) sh[f] = fieldHash(rec[f]); }); }
  return changed;
}
const bpGroup = (id) => bp().groups.find((g) => g.id === id);
const bpRowOf = (gid, rid) => bpGroup(gid)?.rows.find((r) => r.id === rid);
function bpExample() {
  const row = (brand, pic) => ({ id: uid(), brand, pic, cells: {} });
  bp().groups = [
    { id: uid(), name: 'OMI', rows: ['OMI 380', 'OMI Wagyu', 'OMI Sushi', 'Matcha Bar', 'OMI Bekari', 'OMI Gelato', 'OMI 5 Series', 'OMI 3 Series'].map((b) => row(b, '')) },
    { id: uid(), name: 'LHS', rows: [] },
  ];
}
