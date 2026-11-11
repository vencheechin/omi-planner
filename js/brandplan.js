'use strict';
/* H1 / H2 Plan: a half-year table like the Monthly Brand Status Review.
   Groups (OMI, LHS) hold brands; each brand has a PIC and one cell per month with the month's
   focus and a status: Green = on plan, Yellow = off plan but recoverable, Red = needs CEO support.
   It's shared with your team (cloud sync or the shared folder). Each group syncs on its own, so
   two people editing different groups never overwrite each other; within a group the latest edit wins. */

Object.assign(ICON, { table: 'M3 5h18v14H3zM3 10h18M3 15h18M9 5v14', target: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8M12 12.5a.5.5 0 1 0 0-1 .5.5 0 0 0 0 1' });

const BP_STATUS = [
  { v: 'green', label: 'Green', meaning: 'On plan' },
  { v: 'yellow', label: 'Yellow', meaning: 'Off plan, recoverable' },
  { v: 'red', label: 'Red', meaning: 'Needs CEO support' },
];
// ---------- Many plans: one per department (run by its DIC) and one per person ----------
const stPlans = () => (S.stPlans = Array.isArray(S.stPlans) ? S.stPlans : []);
const org = () => (S.org = S.org && typeof S.org === 'object' ? S.org : { depts: [], admins: [] });
const deptById = (id) => (org().depts || []).find((d) => d.id === id);
const possessive = (n) => `${n}${/s$/i.test(n) ? "'" : "'s"}`;
/** Admins see and edit every plan and run Settings › Admin. With cloud sync the team's admins;
    in a shared folder the people listed as admins (until someone is, everyone is); on your own, you. */
function stAdmin() {
  if (typeof Cloud !== 'undefined' && Cloud.team) return isAdmin();
  if (typeof Team !== 'undefined' && Team.dir) { const a = org().admins || []; return !a.length || a.includes(S.meId); }
  return true;
}
function stCanSee(p) {
  if (!p || p.deleted) return false;
  if (stAdmin() || p.owner === S.meId || (p.viewers || []).includes(S.meId)) return true;
  const d = p.kind === 'dept' && deptById(p.dept);
  return !!d && (d.dic === S.meId || (d.members || []).includes(S.meId));
}
/** Submitted, approved or waiting on a change request: locked for everyone but admins. */
const stLocked = (p) => ['submitted', 'approved', 'change-requested'].includes(p?.approval?.status);
function stCanEdit(p) {
  if (!p) return false;
  if (stAdmin()) return true;
  if (stLocked(p)) return false;
  if (p.owner === S.meId) return true;
  const d = p.kind === 'dept' && deptById(p.dept);
  return !!d && d.dic === S.meId;
}
/** Everyone who can see a plan (for the access list and, with cloud sync, the server's rules). */
function stAudience(p) {
  const ids = new Set([p.owner, ...(p.viewers || [])]);
  const d = p.kind === 'dept' && deptById(p.dept);
  if (d) { if (d.dic) ids.add(d.dic); (d.members || []).forEach((m) => ids.add(m)); }
  return [...ids].filter(Boolean);
}
const stName = (p) => (p.kind === 'dept' ? (deptById(p.dept) ? `${deptById(p.dept).name} S-Team Plan` : (p.name || 'S-Team Plan')) : `${possessive(person(p.owner)?.name || 'Someone')} S-Team Plan`);
function stVisible() {
  return stPlans().filter(stCanSee).sort((a, b) => (a.kind === b.kind ? stName(a).localeCompare(stName(b)) : a.kind === 'dept' ? -1 : 1));
}
function stCurrent() {
  const v = stVisible();
  let p = v.find((x) => x.id === ui.stPlanId);
  if (!p) { p = v.find((x) => x.kind === 'dept') || v[0]; ui.stPlanId = p?.id; }
  return p || null;
}
const bp = () => stCurrent() || { groups: [], none: true };
function normalizeStPlan(p) {
  return {
    id: String(p.id), kind: p.kind === 'personal' ? 'personal' : 'dept', dept: p.dept || null, owner: p.owner || null, name: String(p.name || ''),
    viewers: Array.isArray(p.viewers) ? p.viewers.filter((x) => typeof x === 'string') : [], deleted: !!p.deleted,
    approval: p.approval && typeof p.approval === 'object' ? p.approval : null,
    ...normalizeBrandPlan(p),
  };
}
function normalizeOrg(o) {
  if (!o || typeof o !== 'object') return { depts: [], admins: [] };
  return {
    ...(o._v && typeof o._v === 'object' ? { _v: o._v } : {}),
    depts: (Array.isArray(o.depts) ? o.depts : []).filter((d) => d && d.id).map((d) => ({ id: String(d.id), name: String(d.name || 'Department'), dic: d.dic || null, members: Array.isArray(d.members) ? d.members.filter((x) => typeof x === 'string') : [] })),
    admins: Array.isArray(o.admins) ? o.admins.filter((x) => typeof x === 'string') : [],
    reportsTo: o.reportsTo && typeof o.reportsTo === 'object' ? Object.fromEntries(Object.entries(o.reportsTo).filter(([k, v]) => typeof k === 'string' && typeof v === 'string')) : {},
  };
}
/** One key per person on every device: their email when known. */
const pkey = (id) => (person(id)?.email ? `e:${person(id).email}` : id);
const managerOf = (id) => org().reportsTo?.[pkey(id)] || null;
const hierarchyOn = () => Object.keys(org().reportsTo || {}).length > 0;
/** True when `boss` is somewhere above `id` in the reporting lines. */
function isAbove(boss, id) {
  const b = pkey(boss);
  const seen = new Set();
  for (let m = managerOf(id); m && !seen.has(m); m = org().reportsTo?.[m]) { if (m === b) return true; seen.add(m); }
  return false;
}
/** You delegate downwards only, once Admin has set reporting lines (until then, to anyone). */
const canDelegateTo = (id) => pkey(id) === pkey(S.meId) || !hierarchyOn() || isAbove(S.meId, id);
/** Plans from before there were several: the single shared plan becomes "legacy", the same id on every device. */
function migrateStPlans(raw, meId) {
  const list = (Array.isArray(raw.stPlans) ? raw.stPlans : []).filter((p) => p && p.id).map(normalizeStPlan);
  if (raw.brandPlan && Array.isArray(raw.brandPlan.groups) && raw.brandPlan.groups.length && !list.some((p) => p.id === 'legacy')) {
    list.push(normalizeStPlan({ ...raw.brandPlan, id: 'legacy', kind: 'dept', dept: null, owner: meId, name: 'S-Team Plan' }));
  }
  return list;
}
function normalizeBrandPlan(b) {
  if (!b || !Array.isArray(b.groups)) return { groups: [], ...(b && b._v ? { _v: b._v } : {}), ...(b && b.cfg ? { cfg: b.cfg } : {}) };
  return {
    ...(b._v && typeof b._v === 'object' ? { _v: b._v } : {}),
    ...(b.cfg && typeof b.cfg === 'object' ? { cfg: { start: Number(b.cfg.start) || 4, h1: Number(b.cfg.h1) || 6, h2: Number(b.cfg.h2) || 6 } } : {}),
    groups: b.groups.filter((g) => g && g.id).map((g) => ({
      id: String(g.id), name: String(g.name || 'Group'),
      rows: (Array.isArray(g.rows) ? g.rows : []).filter((r) => r && r.id).map((r) => ({
        id: String(r.id), brand: String(r.brand || ''), pic: String(r.pic || ''),
        cells: Object.fromEntries(Object.entries(r.cells && typeof r.cells === 'object' ? r.cells : {})
          .filter(([k, c]) => /^\d{4}-\d{2}$/.test(k) && c)
          .map(([k, c]) => [k, { items: cellItems(c) }]).filter(([, c]) => c.items.length)),
      })),
    })),
  };
}
/** A cell's tasks. Older cells kept one text (maybe several lines), one PIC and one status. */
function cellItems(c) {
  const ok = (s) => (BP_STATUS.some((x) => x.v === s) ? s : '');
  const pg = (n) => ([0, 10, 50, 80, 100].includes(Number(n)) ? Number(n) : 0);
  if (Array.isArray(c?.items)) return c.items.filter((i) => i && (i.text || i.pic || i.status || i.progress)).map((i) => ({ text: String(i.text || ''), pic: String(i.pic || ''), status: ok(i.status), progress: pg(i.progress) }));
  if (!c || !(c.text || c.pic || c.status)) return [];
  const lines = String(c.text || '').split('\n').map((x) => x.trim()).filter(Boolean);
  return (lines.length ? lines : ['']).map((text, n) => ({ text, pic: n === 0 ? String(c.pic || '') : '', status: ok(c.status), progress: 0 }));
}

// ---------- Periods ----------
/* The year starts in H1's first month (default April). H1 runs to its end month (default
   September) and H2 is the rest of the year (October to March). Shared with the team. */
const bpCfg = () => { const c = bp().cfg || {}; const ok = (n) => Number.isInteger(n) && n >= 1 && n <= 12; const start = ok(c.start) ? c.start : 4; const h1 = ok(c.h1) ? c.h1 : 6; return { start, h1, h2: ok(c.h2) ? c.h2 : 6 }; };
const bpKey = (y, m) => { const d = new Date(y, m - 1, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
const bpRange = (y, m, n) => Array.from({ length: n }, (_, i) => bpKey(y, m + i));
const MONTH_NAMES = Array.from({ length: 12 }, (_, i) => new Date(2000, i, 1).toLocaleDateString(undefined, { month: 'long' }));
/** What's shown: a half, a full year or a custom range. Starts on the half that contains today. */
function bpHalf() {
  if (!ui.bpHalf) {
    const { start, h1 } = bpCfg();
    const d = new Date();
    const into = (d.getMonth() + 1 - start + 12) % 12;
    const year = d.getFullYear() - (d.getMonth() + 1 < start ? 1 : 0);
    ui.bpHalf = { mode: 'half', year, half: into < h1 ? 1 : 2, from: bpKey(year, start), to: bpKey(year, start + 11) };
  }
  ui.bpHalf.mode = ui.bpHalf.mode || 'half';
  return ui.bpHalf;
}
function bpMonths(h) {
  const { start, h1, h2 } = bpCfg();
  if (h.mode === 'year') return bpRange(h.year, start, h1 + h2);
  if (h.mode === 'custom') {
    const [fy, fm] = (h.from || bpKey(h.year, start)).split('-').map(Number);
    const [ty, tm] = (h.to || bpKey(h.year, start + 11)).split('-').map(Number);
    const n = Math.max(1, Math.min(36, (ty - fy) * 12 + tm - fm + 1));
    return bpRange(fy, fm, n);
  }
  return h.half === 1 ? bpRange(h.year, start, h1) : bpRange(h.year, start + h1, h2);
}
/** "H1: Apr – Sep · H2: Oct – Mar" for the period box. */
function bpSpanText(start, h1, h2) {
  const m = (n) => MONTH_NAMES[((n - 1) % 12 + 12) % 12].slice(0, 3);
  return `H1: ${m(start)} – ${m(start + h1 - 1)} · H2: ${m(start + h1)} – ${m(start + h1 + h2 - 1)}`;
}
/** Years to choose from: five either side of this year (and the one shown, if further). */
const bpYears = (cur) => { const now = new Date().getFullYear(); const list = Array.from({ length: 11 }, (_, i) => now - 5 + i); return [...new Set([...list, cur])].sort((a, b) => a - b); };
/** Month and year dropdowns for a custom range end ("from" or "to"). */
function bpMonthYear(label, which, key) {
  const [y, m] = String(key || bpKey(new Date().getFullYear(), new Date().getMonth() + 1)).split('-').map(Number);
  return `<span class="bp-my" role="group" aria-label="${label}">
    <select data-change="bpRange" data-which="${which}" data-part="m" aria-label="${label} month">${MONTH_NAMES.map((n, i) => `<option value="${i + 1}" ${i + 1 === m ? 'selected' : ''}>${n.slice(0, 3)}</option>`).join('')}</select>
    <select data-change="bpRange" data-which="${which}" data-part="y" aria-label="${label} year">${bpYears(y).map((v) => `<option value="${v}" ${v === y ? 'selected' : ''}>${v}</option>`).join('')}</select></span>`;
}
const bpShort = (k) => new Date(Number(k.slice(0, 4)), Number(k.slice(5)) - 1, 1).toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
function bpPeriodLabel(h, months) {
  const span = `${bpShort(months[0])} – ${bpShort(months[months.length - 1])}`;
  if (h.mode === 'year') return `FY${h.year} · ${span}`;
  if (h.mode === 'custom') return span;
  return `H${h.half} ${h.year} · ${span}`;
}
function bpPeriodPicker() {
  const { start, h1, h2 } = bpCfg();
  const opts = (sel) => MONTH_NAMES.map((n, i) => `<option value="${i + 1}" ${i + 1 === sel ? 'selected' : ''}>${n}</option>`).join('');
  const nums = (sel) => Array.from({ length: 12 }, (_, i) => `<option value="${i + 1}" ${i + 1 === sel ? 'selected' : ''}>${i + 1} month${i ? 's' : ''}</option>`).join('');
  return `<form class="picker bp-period" data-submit="bpPeriodSave"><h4>Half Years</h4>
    <label class="field"><span>H1 Starts</span><select name="start">${opts(start)}</select></label>
    <div class="task-fields two"><label class="field"><span>Months in H1</span><select name="h1">${nums(h1)}</select></label>
    <label class="field"><span>Months in H2</span><select name="h2">${nums(h2)}</select></label></div>
    <p class="small" data-role="sum">${esc(bpSpanText(start, h1, h2))}</p>
    <div class="row"><span class="spacer"></span><button class="btn primary sm">Save</button></div></form>`;
}
const bpMonthLabel = (k) => new Date(Number(k.slice(0, 4)), Number(k.slice(5)) - 1, 1).toLocaleDateString(undefined, { month: 'short', year: 'numeric' });

function renderBrandPlan() {
  const p = stCurrent();
  if (!p) {
    const mine = stPlans().some((x) => x.kind === 'personal' && x.owner === S.meId && !x.deleted);
    return `<div class="page bp-page"><header class="bp-head"><h1>S-Team Plan</h1></header>
      <div class="empty"><h2>No S-Team Plan yet</h2><div class="row" style="justify-content:center">
        ${mine ? '' : `<button class="btn primary" data-act="stNewPersonal">${icon('plus', 14)} My S-Team Plan</button>`}
        ${stAdmin() ? `<button class="btn ghost" data-act="stNewDept">${icon('plus', 14)} Department S-Team Plan</button>` : ''}</div></div></div>`;
  }
  const ro = !stCanEdit(p);
  const h = bpHalf();
  const months = bpMonths(h);
  const groups = bp().groups;
  const cell = (g, r, k) => {
    const items = cellItems(r.cells[k]);
    const one = items.length === 1 ? items[0] : null;
    const label = items.map((i) => `${i.text}${i.pic ? ` (${i.pic})` : ''}${i.status ? `, ${i.status}` : ''}`).join('; ') || 'empty';
    const drag = (n) => (ro ? '' : `data-drag="bpitem" data-id="${esc(`${g.id}|${r.id}|${k}|${n}`)}"`);
    const body = one
      ? `<div class="bp-one" ${drag(0)}>${one.text ? `<span class="bp-ctext">${esc(one.text)}</span>` : ''}${one.pic ? `<small class="bp-cpic">${esc(one.pic)}</small>` : ''}${bpBar(one.progress)}</div>`
      : items.length ? `<ul class="bp-list">${items.map((i, n) => `<li class="${i.status ? `bp-li-${i.status}` : ''}" ${drag(n)}><i class="bp-dot ${i.status ? `bp-${i.status}` : 'bp-none'}"></i><span>${esc(i.text)}${i.pic ? ` <small>(${esc(i.pic)})</small>` : ''}${bpBar(i.progress)}</span></li>`).join('')}</ul>` : '';
    return `<td class="bp-cell ${one?.status ? `bp-${one.status}` : ''} ${items.length > 1 ? 'multi' : ''}" ${ro ? '' : 'data-act="bpCell"'} data-g="${esc(g.id)}" data-r="${esc(r.id)}" data-m="${k}" tabindex="0" aria-label="${esc(`${r.brand}, ${bpMonthLabel(k)}: ${label}`)}">${body}</td>`;
  };
  return `<div class="page bp-page">
    <header class="bp-head">
      <div><h1>${esc(stName(p))} <span class="bp-sub">${esc(bpPeriodLabel(h, months))}</span></h1>
        ${ro ? `<p class="small muted">${icon('lock', 11)} ${stLocked(p) && !stAdmin() ? 'Locked' : 'View only'}</p>` : ''}${approvalBarHTML(p)}</div>
      <div class="spacer"></div>
      <select class="st-switch" data-change="stSwitch" aria-label="Which S-Team Plan">${stVisible().map((x) => `<option value="${esc(x.id)}" ${x.id === p.id ? 'selected' : ''}>${esc(stName(x))}</option>`).join('')}</select>
      <button class="icon-btn" data-act="stNew" aria-label="New S-Team Plan" title="New S-Team Plan">${icon('plus', 17)}</button>
      <div class="seg">${[['half', 'Half Year'], ['year', 'Full Year'], ['custom', 'Custom']].map(([v, l]) => `<button class="${h.mode === v ? 'on' : ''}" data-act="bpMode" data-v="${v}">${l}</button>`).join('')}</div>
      ${h.mode === 'half' ? `<div class="seg">${[1, 2].map((n) => `<button class="${h.half === n ? 'on' : ''}" data-act="bpHalf" data-v="${n}">H${n}</button>`).join('')}</div>` : ''}
      ${h.mode === 'custom'
        ? `<div class="row bp-custom">${bpMonthYear('From', 'from', h.from)}<span class="muted">to</span>${bpMonthYear('To', 'to', h.to)}</div>`
        : `<div class="row bp-year"><button class="icon-btn" data-act="bpYear" data-d="-1" aria-label="Previous year">${icon('chevL')}</button><select class="bp-ysel" data-change="bpYearSel" aria-label="Year">${bpYears(h.year).map((y) => `<option value="${y}" ${y === h.year ? 'selected' : ''}>${h.mode === 'year' ? 'FY' : ''}${y}</option>`).join('')}</select><button class="icon-btn" data-act="bpYear" data-d="1" aria-label="Next year">${icon('chevR')}</button></div>`}
      ${ro ? '' : `<button class="icon-btn" data-act="bpPeriod" aria-label="Half year months" title="Half year months">${icon('gear', 17)}</button>`}
    </header>
    ${groups.length ? `<div class="bp-scroll"><table class="bp-table ${ro ? 'ro' : ''}" style="--bp-cols:${months.length}">
      <thead><tr><th class="bp-brand">Brand</th><th class="bp-pic">PIC</th>${months.map((k) => `<th>${esc(bpMonthLabel(k))}</th>`).join('')}<th class="bp-x"></th></tr></thead>
      <tbody>${groups.map((g) => `
        <tr class="bp-group"><th colspan="2" class="bp-brand"><input value="${esc(g.name)}" data-change="bpGroupName" data-g="${esc(g.id)}" aria-label="Group name" ${ro ? 'disabled' : ''}></th><td colspan="${months.length}"></td>
          <td class="bp-x">${ro ? '' : `<button class="icon-btn" data-act="bpDelGroup" data-g="${esc(g.id)}" aria-label="Delete group ${esc(g.name)}">${icon('close', 13)}</button>`}</td></tr>
        ${g.rows.map((r) => `<tr>
          <th class="bp-brand"><input value="${esc(r.brand)}" placeholder="Brand" data-change="bpRow" data-k="brand" data-g="${esc(g.id)}" data-r="${esc(r.id)}" aria-label="Brand" ${ro ? 'disabled' : ''}></th>
          <td class="bp-pic"><input value="${esc(r.pic)}" placeholder="PIC" data-change="bpRow" data-k="pic" data-g="${esc(g.id)}" data-r="${esc(r.id)}" aria-label="PIC" ${ro ? 'disabled' : ''}></td>
          ${months.map((k) => cell(g, r, k)).join('')}
          <td class="bp-x">${ro ? '' : `<button class="icon-btn" data-act="bpDelRow" data-g="${esc(g.id)}" data-r="${esc(r.id)}" aria-label="Delete ${esc(r.brand || 'brand')}">${icon('close', 13)}</button>`}</td></tr>`).join('')}
        ${ro ? '' : `<tr class="bp-add"><td colspan="${months.length + 3}"><button class="btn ghost sm" data-act="bpAddRow" data-g="${esc(g.id)}">${icon('plus', 13)} Brand</button></td></tr>`}`).join('')}
      </tbody></table></div>` : `<div class="empty"><h2>No brands yet</h2>${ro ? '' : '<div class="row" style="justify-content:center"><button class="btn primary" data-act="bpExample">Start with OMI and LHS</button></div>'}</div>`}
    ${ro ? '' : `<div class="row"><button class="btn ghost sm" data-act="bpAddGroup">${icon('plus', 13)} Group</button></div>`}
    <div class="bp-legend">${BP_STATUS.map((s) => `<span><i class="bp-dot bp-${s.v}"></i><b>${s.label}</b> ${esc(s.meaning)}</span>`).join('')}</div>
  </div>`;
}
/** A small progress bar with the percentage (shown once work has started). */
const bpBar = (p) => (p > 0 ? `<span class="bp-bar ${p === 100 ? 'done' : ''}"><span><i style="width:${p}%"></i></span><b>${p}%</b></span>` : '');
/** One task line in the cell editor: task, PIC, progress and its own traffic light. */
function bpItemRow(it, n) {
  return `<div class="bp-item" data-n="${n}">
    <input name="text" value="${esc(it.text)}" placeholder="Task" aria-label="Task" autocomplete="off">
    <input name="pic" value="${esc(it.pic)}" placeholder="PIC" aria-label="PIC" autocomplete="off">
    <select name="progress" aria-label="Progress">${[0, 10, 50, 80, 100].map((v) => `<option value="${v}" ${Number(it.progress || 0) === v ? 'selected' : ''}>${v}%</option>`).join('')}</select>
    <div class="bp-tl" role="radiogroup" aria-label="Traffic light">${BP_STATUS.map((s) => `<label title="${esc(`${s.label}: ${s.meaning}`)}"><input type="radio" name="st${n}" value="${s.v}" ${it.status === s.v ? 'checked' : ''}><i class="bp-dot bp-${s.v}"></i></label>`).join('')}</div>
    <button type="button" class="icon-btn" data-role="del" aria-label="Remove task">${icon('close', 12)}</button></div>`;
}
function bpCellPicker(g, r, k) {
  const items = cellItems(r.cells[k]);
  return `<form class="picker bp-pick" data-autosave data-submit="bpCellSave" data-g="${esc(g.id)}" data-r="${esc(r.id)}" data-m="${k}">
    <h4>${esc(r.brand || 'Brand')} · ${esc(bpMonthLabel(k))}</h4>
    <div class="bp-items">${(items.length ? items : [{ text: '', pic: '', status: '' }]).map(bpItemRow).join('')}</div>
    <div class="row"><button class="btn ghost sm" type="button" data-role="add">${icon('plus', 13)} Task</button><button class="btn ghost sm" type="button" data-act="bpCellClear">Clear</button><span class="spacer"></span><button class="btn primary sm">Save</button></div></form>`;
}
/** Reads the editor's task rows. */
const bpReadItems = (form) => $$('.bp-item', form).map((row) => ({
  text: row.querySelector('[name=text]').value.trim(), pic: row.querySelector('[name=pic]').value.trim().slice(0, 60),
  status: row.querySelector('input[type=radio]:checked')?.value || '',
  progress: Number(row.querySelector('[name=progress]').value) || 0,
})).filter((i) => i.text || i.pic || i.status || i.progress);
// ---------- Sharing: each plan is its own record (one field per group, plus order, period and who) ----------
const stMeta = (p) => ({ name: p.name || '', kind: p.kind, dept: p.dept || null, owner: p.owner || null, viewers: p.viewers || [], deleted: !!p.deleted });
const stRecord = (p) => ({ meta: stMeta(p), approval: p.approval || null, order: p.groups.map((g) => g.id), cfg: p.cfg || null, ...Object.fromEntries(p.groups.map((g) => [`g:${g.id}`, g])) });
/** The fields to stamp: every group now, plus ones that were deleted (so the deletion syncs). */
function stFields(p) {
  const f = new Set(p.groups.map((g) => `g:${g.id}`));
  [...Object.keys(S.sync?.shadow?.[`st:${p.id}`] || {}), ...Object.keys(p._v || {})].forEach((k) => { if (k.startsWith('g:')) f.add(k); });
  return ['meta', 'approval', 'order', 'cfg', ...f];
}
const stWire = (p) => ({ id: p.id, ...stRecord(p), _v: clone(p._v || {}) });
const orgRecord = () => ({ depts: org().depts, admins: org().admins, reportsTo: org().reportsTo || {} });
const orgWire = () => ({ ...orgRecord(), _v: clone(org()._v || {}) });
function applyOrg(d) {
  if (!d || typeof d !== 'object') return false;
  const o = org();
  o._v = o._v || {};
  const sh = (S.sync.shadow.org = S.sync.shadow.org || {});
  let changed = false;
  for (const f of ['depts', 'admins', 'reportsTo']) {
    const rv = d._v?.[f];
    if (!rv || !newer(rv, o._v[f])) continue;
    o[f] = normalizeOrg({ [f]: d[f] })[f];
    o._v[f] = rv;
    sh[f] = fieldHash(orgRecord()[f]);
    changed = true;
  }
  return changed;
}
/** Applies a teammate's copy of one plan, field by field (newest wins). Returns true when anything changed. */
function applyStPlan(id, d) {
  if (!d || typeof d !== 'object' || !id) return false;
  let b = stPlans().find((x) => x.id === id);
  if (!b) { b = normalizeStPlan({ id, kind: id === 'legacy' ? 'dept' : 'personal', groups: [] }); stPlans().push(b); }
  b._v = b._v || {};
  const sh = (S.sync.shadow[`st:${id}`] = S.sync.shadow[`st:${id}`] || {});
  const v = d._v || {};
  let changed = false;
  let order = null;
  for (const [f, rv] of Object.entries(v)) {
    if ((f !== 'order' && f !== 'cfg' && f !== 'meta' && f !== 'approval' && !f.startsWith('g:')) || !newer(rv, b._v[f])) continue;
    if (f === 'approval') { const before = b.approval?.status; b.approval = d.approval && typeof d.approval === 'object' ? d.approval : null; stApprovalNotice(b, before); }
    else
    if (f === 'meta') { if (d.meta && typeof d.meta === 'object') { const m = normalizeStPlan({ id, ...d.meta, groups: [] }); Object.assign(b, { name: m.name, kind: m.kind, dept: m.dept, owner: m.owner, viewers: m.viewers, deleted: m.deleted }); } }
    else if (f === 'order') order = Array.isArray(d.order) ? d.order : null;
    else if (f === 'cfg') b.cfg = d.cfg && typeof d.cfg === 'object' ? { start: Number(d.cfg.start) || 4, h1: Number(d.cfg.h1) || 6, h2: Number(d.cfg.h2) || 6 } : null;
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
  if (changed) { const rec = stRecord(b); Object.keys(v).forEach((f) => { if (f in rec || f.startsWith('g:')) sh[f] = fieldHash(rec[f]); }); }
  return changed;
}
// ---------- Approval: DIC submits, CEO approves; changes after approval need the CEO's OK ----------
/** Who can approve: the team's admins (or, without cloud sync, the admins set in Settings › Admin). */
function stApprovers() {
  let ids = [];
  if (typeof Cloud !== 'undefined' && Cloud.team) ids = (Cloud.team.admins || []).map((e) => S.people.find((p) => p.email === e)?.id).filter(Boolean);
  else ids = [...(org().admins || [])];
  ids = ids.filter((id) => id !== S.meId && person(id));
  return ids.length ? ids : S.people.filter((p) => p.id !== S.meId).map((p) => p.id);
}
const STATUS_TEXT = { submitted: 'Waiting for approval', approved: 'Approved', 'change-requested': 'Change requested' };
/** The status badge and the buttons for whoever's turn it is. */
function approvalBarHTML(p) {
  const a = p.approval || {};
  const me = S.meId;
  const name = (id) => (id === me ? 'you' : person(id)?.name || 'someone');
  const owner = p.owner === me || (p.kind === 'dept' && deptById(p.dept)?.dic === me);
  const btn = (act, label, primary) => `<button class="btn ${primary ? 'primary' : 'ghost'} sm" data-act="${act}" data-id="${esc(p.id)}">${label}</button>`;
  let badge = '';
  let actions = '';
  if (a.status === 'submitted') {
    badge = `${STATUS_TEXT.submitted} · ${esc(name(a.to))}`;
    if (a.to === me) actions = btn('stApprove', `${icon('check', 13)} Approve`, true) + btn('stReturn', 'Return');
  } else if (a.status === 'approved') {
    badge = `Approved by ${esc(name(a.to))} · ${esc(fmtDate(toISO(new Date(a.decidedAt || a.at))))}`;
    if (owner) actions = btn('stRequestChange', 'Request change');
  } else if (a.status === 'change-requested') {
    badge = `${STATUS_TEXT['change-requested']} · ${esc(name(a.to))}`;
    if (a.to === me) actions = btn('stAllowChange', 'Allow changes', true) + btn('stDeclineChange', 'Decline');
  } else {
    if (a.last === 'returned') badge = `Returned by ${esc(name(a.to))}`;
    else if (a.last === 'allowed') badge = `Changes allowed by ${esc(name(a.to))}`;
    if (owner || stAdmin()) actions = btn('stSubmit', 'Submit for approval', true);
  }
  return badge || actions ? `<div class="st-approval">${badge ? `<span class="st-badge st-${esc(a.status === 'draft' && a.last === 'returned' ? 'returned' : a.status || 'draft')}">${badge}</span>` : ''}${a.note ? `<small class="muted">“${esc(a.note)}”</small>` : ''}${actions}</div>` : '';
}
/** A notification when a plan's approval changes on someone else's device. */
function stApprovalNotice(p, before) {
  const a = p.approval;
  if (!a || a.status === before) return;
  const who = person(a.status === 'submitted' || a.status === 'change-requested' ? a.by : a.to)?.name || 'Someone';
  const plan = stName(p);
  let text = '';
  if (a.status === 'submitted' && a.to === S.meId) text = `${who} submitted ${plan} for approval`;
  else if (a.status === 'change-requested' && a.to === S.meId) text = `${who} asked to change ${plan}`;
  else if (a.by === S.meId && a.status === 'approved') text = before === 'change-requested' ? `${who} declined your change request for ${plan}` : `${who} approved ${plan}`;
  else if (a.by === S.meId && a.last === 'returned') text = `${who} returned ${plan}`;
  else if (a.by === S.meId && a.last === 'allowed') text = `${who} allowed changes to ${plan}`;
  if (text) notify({ id: uid(), at: Date.now(), read: false, kind: a.status === 'approved' || a.last === 'allowed' ? 'completed' : 'review', text, note: a.note || '', taskId: null, route: '#/halfplan', stPlanId: p.id });
}

/** Marks plans for upload again (their access may have changed). */
const stTouchAll = () => { S.sync.dirty = S.sync.dirty || {}; stPlans().forEach((p) => { S.sync.dirty[`st:${p.id}`] = 1; }); };

// ---------- Settings › Admin ----------
function adminSettingsHTML() {
  if (!stAdmin()) return '';
  const people = S.people.slice().sort((a, b) => a.name.localeCompare(b.name));
  const pick = (act, attrs, exclude = []) => `<select data-change="${act}" ${attrs} aria-label="Add person"><option value="">Add person…</option>${people.filter((x) => !exclude.includes(x.id)).map((x) => `<option value="${esc(x.id)}">${esc(x.name)}</option>`).join('')}</select>`;
  const chip = (id, act, attrs) => `<span class="rem-chip">${esc(person(id)?.name || 'Someone')}<button class="chip-x" data-act="${act}" ${attrs} data-p="${esc(id)}" aria-label="Remove">${icon('close', 10)}</button></span>`;
  const cloud = typeof Cloud !== 'undefined' && Cloud.team;
  const admins = org().admins || [];
  return `
    <div class="adm-block"><b>Admins</b>
      ${cloud ? `<p class="small">${(Cloud.team.admins || []).map(esc).join(', ') || 'None'} · change in Cloud Sync</p>`
        : `<div class="adm-chips">${admins.map((id) => chip(id, 'stAdminDel', '')).join('') || '<span class="small muted">Everyone, until someone is added</span>'}${pick('stAdminAdd', '', admins)}</div>`}</div>
    <div class="adm-block"><b>Departments</b>
      ${(org().depts || []).map((d) => `<div class="adm-dept">
        <div class="row"><input value="${esc(d.name)}" data-change="stDeptName" data-d="${esc(d.id)}" aria-label="Department name">
          <label class="mini">DIC <select data-change="stDeptDic" data-d="${esc(d.id)}"><option value="">—</option>${people.map((x) => `<option value="${esc(x.id)}" ${x.id === d.dic ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label>
          <button class="icon-btn" data-act="stDeptDel" data-d="${esc(d.id)}" aria-label="Delete ${esc(d.name)}">${icon('trash', 14)}</button></div>
        <div class="adm-chips"><span class="small muted">Members</span>${(d.members || []).map((id) => chip(id, 'stDeptDelMember', `data-d="${esc(d.id)}"`)).join('')}${pick('stDeptAddMember', `data-d="${esc(d.id)}"`, d.members || [])}</div></div>`).join('')}
      <button class="btn ghost sm" data-act="stDeptAdd">${icon('plus', 13)} Department</button></div>
    <div class="adm-block"><b>Who Reports to Whom</b>
      ${[...new Map(people.map((x) => [pkey(x.id), x])).values()].map((x) => { const m = org().reportsTo?.[pkey(x.id)] || ''; return `<div class="adm-row"><span>${esc(x.name)}</span>
        <label class="mini">Reports to <select data-change="orgReportsTo" data-p="${esc(pkey(x.id))}"><option value="">— Top</option>${[...new Map(people.map((y) => [pkey(y.id), y])).values()].filter((y) => pkey(y.id) !== pkey(x.id)).map((y) => `<option value="${esc(pkey(y.id))}" ${pkey(y.id) === m ? 'selected' : ''}>${esc(y.name)}</option>`).join('')}</select></label></div>`; }).join('')}</div>
    <div class="adm-block"><b>Who Can See Each S-Team Plan</b>
      ${stPlans().filter((p) => !p.deleted).map((p) => {
        const auto = stAudience({ ...p, viewers: [] });
        return `<div class="adm-plan"><span>${esc(stName(p))}</span>
          <div class="adm-chips"><span class="small muted">${auto.map((id) => esc(person(id)?.name || '')).filter(Boolean).join(', ') || '—'}${auto.length ? ' ·' : ''} admins</span>
          ${(p.viewers || []).map((id) => chip(id, 'stViewerDel', `data-plan="${esc(p.id)}"`)).join('')}${pick('stViewerAdd', `data-plan="${esc(p.id)}"`, [...auto, ...(p.viewers || [])])}</div></div>`;
      }).join('') || '<p class="small muted">No plans yet.</p>'}</div>`;
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
