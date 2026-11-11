'use strict';
/* H1 / H2 Plan: a half-year table like the Monthly Brand Status Review.
   Groups (OMI, LHS) hold brands; each brand has a PIC and one cell per month with the month's
   focus and a status: Green = on plan, Yellow = off plan but recoverable, Red = needs CEO support.
   It's kept with your settings and syncs to your own devices. */

Object.assign(ICON, { table: 'M3 5h18v14H3zM3 10h18M3 15h18M9 5v14' });

const BP_STATUS = [
  { v: 'green', label: 'Green', meaning: 'On plan' },
  { v: 'yellow', label: 'Yellow', meaning: 'Off plan, recoverable' },
  { v: 'red', label: 'Red', meaning: 'Needs CEO support' },
];
const bp = () => (S.brandPlan = S.brandPlan && Array.isArray(S.brandPlan.groups) ? S.brandPlan : { groups: [] });
function normalizeBrandPlan(b) {
  if (!b || !Array.isArray(b.groups)) return { groups: [] };
  return {
    groups: b.groups.filter((g) => g && g.id).map((g) => ({
      id: String(g.id), name: String(g.name || 'Group'),
      rows: (Array.isArray(g.rows) ? g.rows : []).filter((r) => r && r.id).map((r) => ({
        id: String(r.id), brand: String(r.brand || ''), pic: String(r.pic || ''),
        cells: Object.fromEntries(Object.entries(r.cells && typeof r.cells === 'object' ? r.cells : {})
          .filter(([k, c]) => /^\d{4}-\d{2}$/.test(k) && c && (c.text || c.status))
          .map(([k, c]) => [k, { text: String(c.text || ''), status: BP_STATUS.some((s) => s.v === c.status) ? c.status : '' }])),
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
    return `<td class="bp-cell ${c?.status ? `bp-${c.status}` : ''}" data-act="bpCell" data-g="${esc(g.id)}" data-r="${esc(r.id)}" data-m="${k}" tabindex="0" aria-label="${esc(`${r.brand}, ${bpMonthLabel(k)}: ${c?.text || 'empty'}${c?.status ? `, ${c.status}` : ''}`)}">${esc(c?.text || '')}</td>`;
  };
  return `<div class="page bp-page">
    <header class="bp-head">
      <div><h1>H${h.half} ${h.year} Plan</h1></div>
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
    <div class="bp-status">${[{ v: '', label: 'None', meaning: '' }, ...BP_STATUS].map((s) => `<label class="bp-opt"><input type="radio" name="status" value="${s.v}" ${c.status === s.v ? 'checked' : ''}><i class="bp-dot ${s.v ? `bp-${s.v}` : 'bp-none'}"></i><span>${esc(s.label)}</span></label>`).join('')}</div>
    <div class="row"><button class="btn ghost sm" type="button" data-act="bpCellClear">Clear</button><span class="spacer"></span><button class="btn primary sm">Save</button></div></form>`;
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
