'use strict';
// ---------- PD Plan: product pipeline (stage-gate) ----------
// Each product moves through checkpoints (Direction, Development 10% / 50% / 90%, Pre-Launch,
// Launch, Review). At every checkpoint each department has its own piece of work, which becomes a
// Planner task for that department's person in charge. When the work is done, an editor records
// the decision: advance, revise or stop. Analysis tracks the pipeline, time per stage, revisions,
// kill rate, success rate, learning rate and new-product sales.
// The framework (departments, checkpoints and the work in each) is set per PD Plan and can be
// imported from a JSON file, so a company's own process never needs to live in this code.

if (!ICON.layers) ICON.layers = 'M12 3l9 5-9 5-9-5 9-5zM3 13l9 5 9-5M3 17l9 5 9-5';

const PD_DEFAULT_FW = () => ({
  depts: [{ id: 'pd', name: 'PD' }, { id: 'mkt', name: 'Marketing' }, { id: 'ops', name: 'Operation' }, { id: 'ck', name: 'CK' }, { id: 'ceo', name: 'CEO' }].map((d) => ({ ...d, who: '' })),
  cps: [
    { id: 'dir', stage: 'Direction', label: 'Direction', lead: '', decision: 'Start development? Priority?' },
    { id: 'c10', stage: 'Development', label: '10% Concept approval', lead: '', decision: 'Advance / revise / stop' },
    { id: 'c50', stage: 'Development', label: '50% Product validation', lead: '', decision: 'Keep going?' },
    { id: 'c90', stage: 'Development', label: '90% Operations trial', lead: '', decision: 'Target launch date' },
    { id: 'pre', stage: 'Pre-Launch', label: '100% Pre-launch', lead: '', decision: 'Confirm launch date and RSP' },
    { id: 'launch', stage: 'Launch', label: 'Launch', lead: '', decision: 'Continue / adjust / pause' },
    { id: 'review', stage: 'Review', label: 'Review', lead: '', decision: 'Keep / optimise / delist' },
  ].map((c) => ({ ...c, work: {} })),
  base: 0,
});
const PD_STATUS = { active: 'In progress', stopped: 'Stopped', kept: 'Kept', delisted: 'Delisted' };
const pdStr = (v, n = 400) => String(v ?? '').slice(0, n);
const pdNum = (v) => (Number.isFinite(Number(v)) && v !== '' && v !== null ? Number(v) : null);

function pdNormFw(f) {
  if (!f || typeof f !== 'object' || !Array.isArray(f.cps) || !f.cps.length) return null;
  const depts = (Array.isArray(f.depts) ? f.depts : []).filter((d) => d && d.id).slice(0, 12).map((d) => ({ id: pdStr(d.id, 40), name: pdStr(d.name || 'Department', 60), who: pdStr(d.who, 120) }));
  const ids = new Set(depts.map((d) => d.id));
  const cps = f.cps.filter((c) => c && c.id).slice(0, 20).map((c) => ({
    id: pdStr(c.id, 40), stage: pdStr(c.stage, 60), label: pdStr(c.label || c.stage || 'Checkpoint', 80), lead: pdStr(c.lead, 120), decision: pdStr(c.decision, 200),
    work: Object.fromEntries(Object.entries(c.work && typeof c.work === 'object' ? c.work : {}).filter(([k, v]) => ids.has(k) && v).map(([k, v]) => [k, pdStr(v, 600)])),
  }));
  return { depts, cps, base: pdNum(f.base) || 0 };
}
function pdNormProduct(x) {
  if (!x || typeof x !== 'object' || !x.id) return null;
  return {
    id: pdStr(x.id, 40), name: pdStr(x.name || 'New product', 120), category: pdStr(x.category, 60), owner: pdStr(x.owner, 120), notes: pdStr(x.notes, 2000),
    cp: pdStr(x.cp, 40), status: PD_STATUS[x.status] ? x.status : 'active', created: Number(x.created) || Date.now(), enteredAt: Number(x.enteredAt) || Number(x.created) || Date.now(),
    rsp: pdNum(x.rsp), launchDate: /^\d{4}-\d{2}-\d{2}$/.test(x.launchDate || '') ? x.launchDate : '', targetWeekly: pdNum(x.targetWeekly), actualWeekly: pdNum(x.actualWeekly), cannibal: pdNum(x.cannibal),
    reviewDone: !!x.reviewDone, reviewNote: pdStr(x.reviewNote, 2000),
    history: (Array.isArray(x.history) ? x.history : []).filter((h) => h && h.d).slice(-200).map((h) => ({ cp: pdStr(h.cp, 40), at: Number(h.at) || 0, by: pdStr(h.by, 80), d: pdStr(h.d, 20), note: pdStr(h.note, 600), ...(h.to ? { to: pdStr(h.to, 40) } : {}) })),
    work: Object.fromEntries(Object.entries(x.work && typeof x.work === 'object' ? x.work : {}).filter(([, w]) => w && typeof w === 'object').map(([k, w]) => [pdStr(k, 90), { ...(w.task ? { task: pdStr(w.task, 40) } : {}), done: !!w.done }])),
  };
}
/** The plan's framework (the default one until someone edits or imports it). */
const pdFw = (p) => p?.fw || PD_DEFAULT_FW();
const pdProducts = (p) => (p ? (p.products = Array.isArray(p.products) ? p.products : []) : []);
const pdCp = (p, id) => pdFw(p).cps.find((c) => c.id === id) || null;
const pdCpIndex = (p, id) => pdFw(p).cps.findIndex((c) => c.id === id);
/** The person in charge of a department: someone picked in the framework. */
const pdWho = (dept) => (dept?.who ? personByKey(dept.who) : null);
const pdDirty = (p) => { S.sync.dirty = S.sync.dirty || {}; S.sync.dirty[`st:${p.id}`] = 1; };
const pdDays = (ms) => Math.max(0, Math.round(ms / 864e5));
const pdMe = () => person(S.meId)?.name || 'Someone';

// ---------- Moving through the checkpoints ----------
function pdDecide(p, x, d, note) {
  const cps = pdFw(p).cps;
  const i = pdCpIndex(p, x.cp);
  const now = Date.now();
  x.history.push({ cp: x.cp, at: now, by: pdMe(), d, note: pdStr(note, 600) });
  if (d === 'advance' && i < cps.length - 1) { x.cp = cps[i + 1].id; x.enteredAt = now; }
  else if (d === 'stop' || d === 'delist') x.status = d === 'stop' ? 'stopped' : 'delisted';
  else if (d === 'keep') x.status = 'kept';
  else if (d === 'optimise') { /* stays at Review */ }
  else if (d === 'reopen') { x.status = 'active'; x.enteredAt = now; }
  pdDirty(p);
}
/** "Stage · Checkpoint", without saying the same thing twice. */
const pdCpTitle = (cp) => (!cp ? '' : cp.stage && !cp.stage.includes(cp.label) && !cp.label.includes(cp.stage) ? `${cp.stage} · ${cp.label}` : (cp.stage.includes(cp.label) ? cp.stage : cp.label));
const pdIsLast = (p, x) => pdCpIndex(p, x.cp) === pdFw(p).cps.length - 1;
/** Work for this product at a checkpoint: one entry per department with something to do. */
const pdWorkAt = (p, x, cpId) => {
  const cp = pdCp(p, cpId);
  if (!cp) return [];
  return pdFw(p).depts.filter((d) => cp.work[d.id]).map((d) => {
    const w = x.work[`${cp.id}|${d.id}`] || {};
    const t = w.task ? taskById(w.task) : null;
    return { dept: d, text: cp.work[d.id], task: t, taskId: w.task, done: t ? t.progress === 100 : !!w.done };
  });
};

// ---------- Tasks for each department ----------
function pdPipeSync(p) {
  if (!p || p.module !== 'pd' || p.deleted || !stCanEdit(p) || !p.products?.length) return false;
  let changed = false;
  let plan = null;
  for (const x of pdProducts(p)) {
    if (x.status !== 'active') continue;
    const cp = pdCp(p, x.cp);
    if (!cp) continue;
    for (const d of pdFw(p).depts) {
      const text = cp.work[d.id];
      if (!text) continue;
      const key = `${cp.id}|${d.id}`;
      const w = x.work[key];
      if (!w) {
        plan = plan || stTaskPlan(p, true);
        const who = pdWho(d);
        const first = text.split('\n').map((s) => s.trim()).filter(Boolean).join(' · ');
        const t = addTask({ planId: plan.id, bucketId: stBucket(plan, cp.label), title: `${x.name} · ${first}`.slice(0, 200), notes: `${stName(p)} · ${x.name}\n${pdCpTitle(cp)} · ${d.name}\n\n${text}`, assignees: who ? [who.id] : [] });
        if (who && who.id !== S.meId) t.shared = true;
        x.work[key] = { task: t.id, done: false };
        changed = true;
      } else if (w.task) {
        const t = taskById(w.task);
        if (t && (t.progress === 100) !== w.done) { w.done = t.progress === 100; changed = true; }
      }
    }
  }
  if (changed) pdDirty(p);
  return changed;
}
if (typeof stSyncTasks === 'function') {
  const origStSync = stSyncTasks;
  // eslint-disable-next-line no-global-assign
  stSyncTasks = function stSyncWithPipeline(p) { const a = origStSync(p); const b = pdPipeSync(p); return a || b; };
}

// ---------- Numbers for Analysis ----------
function pdStats(p) {
  const fw = pdFw(p);
  const list = pdProducts(p);
  const idx = (id) => fw.cps.findIndex((c) => c.id === id);
  const launchI = Math.max(0, fw.cps.findIndex((c) => /launch/i.test(c.stage) && !/pre/i.test(c.stage)));
  const reached = (x, i) => idx(x.cp) >= i || x.history.some((h) => idx(h.cp) >= i);
  // Time spent in each checkpoint, from the history (the current one counts up to today).
  const spent = Object.fromEntries(fw.cps.map((c) => [c.id, []]));
  const concept = [];
  for (const x of list) {
    let from = x.created;
    const steps = x.history.filter((h) => h.d === 'advance' || h.d === 'move');
    steps.forEach((h) => { spent[h.cp]?.push(h.at - from); from = h.at; });
    if (x.status === 'active') spent[x.cp]?.push(Date.now() - x.enteredAt);
    const hit = steps.find((h) => idx(h.cp) < launchI && idx(h.d === 'move' ? h.to : fw.cps[idx(h.cp) + 1]?.id) >= launchI);
    if (hit) concept.push(hit.at - x.created);
  }
  const avg = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : null);
  const revisions = list.map((x) => ({ x, n: x.history.filter((h) => h.d === 'revise').length }));
  const firstGate = fw.cps[1]?.id || fw.cps[0]?.id;
  const atGate = list.filter((x) => reached(x, 1));
  const killedAtGate = list.filter((x) => x.status === 'stopped' && x.history.some((h) => h.d === 'stop' && h.cp === firstGate));
  const launched = list.filter((x) => reached(x, launchI));
  const judged = launched.filter((x) => x.targetWeekly && x.actualWeekly !== null);
  const hitTarget = judged.filter((x) => x.actualWeekly >= x.targetWeekly);
  const failed = list.filter((x) => x.status === 'stopped' || x.status === 'delisted' || (judged.includes(x) && !hitTarget.includes(x)));
  const reviewed = failed.filter((x) => x.reviewDone);
  const live = launched.filter((x) => x.status !== 'stopped' && x.status !== 'delisted');
  const sales = live.reduce((s, x) => s + (x.actualWeekly || 0), 0);
  const cannibal = live.reduce((s, x) => s + (x.cannibal || 0), 0);
  const cats = {};
  live.forEach((x) => { const c = x.category || 'No category'; cats[c] = cats[c] || { n: 0, sales: 0, cannibal: 0 }; cats[c].n += 1; cats[c].sales += x.actualWeekly || 0; cats[c].cannibal += x.cannibal || 0; });
  return {
    fw, list, spent: Object.fromEntries(Object.entries(spent).map(([k, a]) => [k, avg(a)])), concept: avg(concept), revisions,
    pipe: fw.cps.map((c) => ({ c, n: list.filter((x) => x.status === 'active' && x.cp === c.id).length })),
    kill: { n: killedAtGate.length, of: atGate.length, gate: fw.cps[1]?.label || '' },
    success: { n: hitTarget.length, of: judged.length, launched: launched.length },
    learning: { n: reviewed.length, of: failed.length, missing: failed.filter((x) => !x.reviewDone) },
    sales, cannibal, cats, base: fw.base || 0,
  };
}
const pdPct = (n, of) => (of ? `${Math.round((n / of) * 100)}%` : '–');
const pdMoney = (v) => (v === null || v === undefined ? '–' : Number(v).toLocaleString(undefined, { maximumFractionDigits: 0 }));

// ---------- Drawing ----------
ui.pdTab = ui.pdTab || 'pipeline';
const pdTabsHTML = () => `<div class="seg pd-tabs" role="tablist">${[['pipeline', 'Pipeline', 'layers'], ['timeline', 'Timeline', 'table'], ['analysis', 'Analysis', 'chart']].map(([v, l, ic]) => `<button role="tab" aria-selected="${ui.pdTab === v}" class="${ui.pdTab === v ? 'on' : ''}" data-act="pdTab" data-v="${v}">${icon(ic, 14)} ${l}</button>`).join('')}</div>`;

function pdCardHTML(p, x) {
  const cp = pdCp(p, x.cp);
  const work = pdWorkAt(p, x, x.cp);
  const done = work.filter((w) => w.done).length;
  const revs = x.history.filter((h) => h.d === 'revise' && h.cp === x.cp).length;
  const days = pdDays(Date.now() - x.enteredAt);
  return `<button class="pd-card ${x.status !== 'active' ? `pd-${x.status}` : ''}" data-act="pdOpen" data-id="${esc(x.id)}" ${x.status === 'active' && stCanEdit(p) ? 'data-pddrag="1"' : ''}>
    <b>${esc(x.name)}</b>
    ${x.category ? `<small class="pd-cat">${esc(x.category)}</small>` : ''}
    ${x.status === 'active' ? `<span class="pd-depts">${work.map((w) => `<i class="pd-dep ${w.done ? 'done' : ''}" title="${esc(`${w.dept.name}: ${w.done ? 'done' : 'to do'}`)}">${w.done ? icon('check', 10) : ''}${esc(w.dept.name)}</i>`).join('')}</span>` : `<span class="pd-tag">${esc(PD_STATUS[x.status])}${cp ? ` at ${esc(cp.label)}` : ''}</span>`}
    <span class="pd-meta">${x.status === 'active' ? `${days} day${days === 1 ? '' : 's'} here` : ''}${work.length && x.status === 'active' ? ` · ${done}/${work.length} done` : ''}${revs ? ` · ${revs} revision${revs === 1 ? '' : 's'}` : ''}${work.length && done === work.length && x.status === 'active' ? ' · <em>Ready for decision</em>' : ''}</span>
  </button>`;
}
function pdPipelineHTML(p) {
  const fw = pdFw(p);
  const ed = stCanEdit(p);
  const list = pdProducts(p);
  const active = list.filter((x) => x.status === 'active');
  const closed = list.filter((x) => x.status !== 'active').sort((a, b) => (b.history.at(-1)?.at || 0) - (a.history.at(-1)?.at || 0));
  const stages = [];
  fw.cps.forEach((c) => { const last = stages.at(-1); if (last && last.name === c.stage && c.stage) last.n += 1; else stages.push({ name: c.stage, n: 1 }); });
  return `<div class="pd-toolbar">${ed ? `<button class="btn primary sm" data-act="pdAdd">${icon('plus', 14)} Product</button><button class="btn ghost sm" data-act="pdFramework">${icon('gear', 14)} Framework</button>` : ''}
      <span class="small muted">${active.length} in development · click a product for its work, decisions and history</span></div>
    ${!fw.depts.some((d) => d.who) && ed ? `<p class="pd-hint">${icon('user', 13)} Pick the person in charge of each department in <button class="linklike" data-act="pdFramework">Framework</button>, so their work lands in their Planner.</p>` : ''}
    <div class="pd-board-wrap"><div class="pd-board" style="--pd-n:${fw.cps.length}">
      <div class="pd-stages">${stages.map((s) => `<div style="grid-column: span ${s.n}">${esc(s.name)}</div>`).join('')}</div>
      ${fw.cps.map((c) => {
        const here = active.filter((x) => x.cp === c.id);
        return `<section class="pd-col" data-cp="${esc(c.id)}"><header><b>${esc(c.label)}</b><em>${here.length}</em>${c.lead ? `<small>${esc(c.lead)}</small>` : ''}</header>
          <div class="pd-cards">${here.map((x) => pdCardHTML(p, x)).join('') || '<p class="pd-none">–</p>'}</div></section>`;
      }).join('')}
    </div></div>
    ${closed.length ? `<details class="pd-closed"><summary>Finished and stopped (${closed.length})</summary><div class="pd-closed-list">${closed.map((x) => pdCardHTML(p, x)).join('')}</div></details>` : ''}
    ${!list.length ? `<div class="empty"><h2>No products yet</h2>${ed ? '<p class="muted">Add a product to start it at Direction. Each department\'s work at each checkpoint becomes a task for its person in charge.</p>' : ''}</div>` : ''}`;
}

function pdProductHTML(p, x) {
  const ed = stCanEdit(p);
  const fw = pdFw(p);
  const cp = pdCp(p, x.cp);
  const work = pdWorkAt(p, x, x.cp);
  const ready = work.every((w) => w.done);
  const field = (k, label, type = 'text', extra = '') => `<label class="pd-f"><span>${label}</span><input type="${type}" value="${esc(x[k] ?? '')}" data-change="pdField" data-id="${esc(x.id)}" data-k="${k}" ${type === 'number' ? 'inputmode="decimal" step="any"' : ''} ${ed ? '' : 'disabled'} ${extra}></label>`;
  const decisions = x.status !== 'active'
    ? [['reopen', 'Reopen', '']]
    : pdIsLast(p, x) ? [['keep', 'Keep', 'primary'], ['optimise', 'Optimise', ''], ['delist', 'Delist', 'danger']]
      : [['advance', `Advance to ${esc(fw.cps[pdCpIndex(p, x.cp) + 1]?.label || 'next')}`, 'primary'], ['revise', 'Revise', ''], ['stop', 'Stop', 'danger']];
  const D = { move: 'Moved', start: 'Started', advance: 'Advanced', revise: 'Revise', stop: 'Stopped', keep: 'Kept', optimise: 'Optimise', delist: 'Delisted', reopen: 'Reopened' };
  return `<div class="pd-prod">
    <div class="pd-where">${x.status === 'active'
      ? `<span class="pd-step">${fw.cps.map((c, i) => `<i class="${i < pdCpIndex(p, x.cp) ? 'past' : c.id === x.cp ? 'now' : ''}" title="${esc(c.label)}"></i>`).join('')}</span><b>${esc(pdCpTitle(cp))}</b><small>${pdDays(Date.now() - x.enteredAt)} days here</small>`
      : `<b>${esc(PD_STATUS[x.status])}</b>${cp ? `<small>at ${esc(cp.label)}</small>` : ''}`}</div>
    <div class="pd-grid">
      ${field('name', 'Product')}${field('category', 'Category', 'text', 'list="pd-cats"')}
      <label class="pd-f"><span>Owner</span><select data-change="pdField" data-id="${esc(x.id)}" data-k="owner" ${ed ? '' : 'disabled'}><option value="">–</option>${S.people.map((m) => `<option value="${esc(pkey(m.id))}" ${pkey(m.id) === x.owner ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}</select></label>
      ${field('rsp', 'Target RSP', 'number')}${field('launchDate', 'Launch date', 'date')}
      ${field('targetWeekly', 'Target avg weekly sales', 'number')}${field('actualWeekly', 'Actual avg weekly sales', 'number')}
      ${field('cannibal', 'Weekly sales taken from existing products', 'number')}
    </div>
    <datalist id="pd-cats">${[...new Set(pdProducts(p).map((y) => y.category).filter(Boolean))].map((c) => `<option value="${esc(c)}">`).join('')}</datalist>
    ${x.status === 'active' && cp ? `<h3>Work at this checkpoint</h3>
      ${work.length ? `<ul class="pd-work">${work.map((w) => `<li class="${w.done ? 'done' : ''}" ${w.task ? `data-open-task="${esc(w.task.id)}" role="button" title="Open the task"` : ''}>
        <span class="pd-wtick">${w.done ? icon('check', 13) : ''}</span>
        <span class="pd-wtxt"><b>${esc(w.dept.name)}</b><span>${esc(w.text).replace(/\n/g, '<br>')}</span></span>
        <span class="pd-wwho">${pdWho(w.dept) ? `${avatar(pdWho(w.dept), 22)} ${esc(pdWho(w.dept).name)}` : '<small class="muted">No one in charge</small>'}</span></li>`).join('')}</ul>`
        : `<p class="small muted">No department work is set for this checkpoint.${ed ? ' Add it in Framework.' : ''}</p>`}
      ${cp.decision ? `<p class="pd-decq">${icon('flag', 13)} <b>Decision:</b> ${esc(cp.decision)}</p>` : ''}` : ''}
    ${ed ? `<div class="pd-decide"><input class="pd-note" id="pd-note" placeholder="Note for this decision (optional)" autocomplete="off">
      <div class="row">${decisions.map(([d, l, cls]) => `<button class="btn sm ${cls}" data-act="pdDecide" data-id="${esc(x.id)}" data-d="${d}">${l}</button>`).join('')}</div>
      ${x.status === 'active' && work.length && !ready ? `<p class="small muted">${work.length - work.filter((w) => w.done).length} department task${work.length - work.filter((w) => w.done).length === 1 ? '' : 's'} still open.</p>` : ''}</div>` : ''}
    <h3>Review</h3>
    <label class="pd-check"><input type="checkbox" data-change="pdField" data-id="${esc(x.id)}" data-k="reviewDone" ${x.reviewDone ? 'checked' : ''} ${ed ? '' : 'disabled'}> Review done: what we learned is written down</label>
    <textarea class="pd-ta" rows="3" placeholder="What worked, what didn't, what we'll do differently" data-change="pdField" data-id="${esc(x.id)}" data-k="reviewNote" ${ed ? '' : 'disabled'}>${esc(x.reviewNote)}</textarea>
    <h3>History</h3>
    <ol class="pd-hist">${[...x.history].reverse().map((h) => `<li><b>${esc(D[h.d] || h.d)}</b> · ${esc(pdCp(p, h.cp)?.label || '')}${h.to ? ` → ${esc(pdCp(p, h.to)?.label || '')}` : ''}<small>${esc(fmtDateTime(h.at))} · ${esc(h.by)}</small>${h.note ? `<p>${esc(h.note)}</p>` : ''}</li>`).join('')}</ol>
    ${ed ? `<div class="row"><span class="spacer"></span><button class="btn ghost sm danger" data-act="pdDelete" data-id="${esc(x.id)}">${icon('trash', 13)} Delete product</button></div>` : ''}
  </div>`;
}

function pdAnalysisHTML(p) {
  const s = pdStats(p);
  const ed = stCanEdit(p);
  const max = Math.max(1, ...s.pipe.map((x) => x.n));
  const card = (title, sub, body) => `<section class="pd-acard"><h3>${title}</h3>${sub ? `<p class="pd-asub">${sub}</p>` : ''}${body}</section>`;
  const big = (v, label) => `<div class="pd-big"><b>${v}</b><small>${label}</small></div>`;
  const total = s.base + s.sales;
  const topRev = s.revisions.filter((r) => r.n).sort((a, b) => b.n - a.n).slice(0, 5);
  return `<div class="pd-analysis">
    ${card('Pipeline', 'Products in development at each checkpoint', `<ul class="pd-bars">${s.pipe.map(({ c, n }) => `<li><span>${esc(c.label)}</span><i style="--w:${(n / max) * 100}%"></i><b>${n}</b></li>`).join('')}</ul>`)}
    ${card('Traceability', 'Time in each stage, and how often products were revised', `
      <div class="pd-bigs">${big(s.concept === null ? '–' : `${pdDays(s.concept)} days`, 'Average from concept to launch')}${big(s.revisions.length ? (s.revisions.reduce((a, r) => a + r.n, 0) / s.revisions.length).toFixed(1) : '–', 'Average revisions per product')}</div>
      <table class="pd-tbl"><tbody>${s.fw.cps.map((c) => `<tr><td>${esc(c.label)}</td><td>${s.spent[c.id] === null ? '–' : `${pdDays(s.spent[c.id])} days`}</td></tr>`).join('')}</tbody></table>
      ${topRev.length ? `<p class="pd-asub">Most revised</p><ul class="pd-plist">${topRev.map((r) => `<li><button class="linklike" data-act="pdOpen" data-id="${esc(r.x.id)}">${esc(r.x.name)}</button> · ${r.n}</li>`).join('')}</ul>` : ''}`)}
    ${card('Kill rate', `Stopped at ${esc(s.kill.gate || 'the first check')}`, big(pdPct(s.kill.n, s.kill.of), `${s.kill.n} of ${s.kill.of} products that reached it`))}
    ${card('Success rate', 'Launched products that reached their target weekly sales', `${big(pdPct(s.success.n, s.success.of), `${s.success.n} of ${s.success.of} with a target and actual sales`)}${s.success.launched > s.success.of ? `<p class="small muted">${s.success.launched - s.success.of} launched product${s.success.launched - s.success.of === 1 ? ' is' : 's are'} missing a target or actual sales.</p>` : ''}`)}
    ${card('Learning rate', 'Every product that failed has a review. Failing is fine; repeating a mistake is not.', `${big(pdPct(s.learning.n, s.learning.of), `${s.learning.n} of ${s.learning.of} failed products reviewed`)}${s.learning.missing.length ? `<p class="pd-asub">Review still to do</p><ul class="pd-plist">${s.learning.missing.map((x) => `<li><button class="linklike" data-act="pdOpen" data-id="${esc(x.id)}">${esc(x.name)}</button> · ${esc(PD_STATUS[x.status] === 'In progress' ? 'missed target' : PD_STATUS[x.status])}</li>`).join('')}</ul>` : ''}`)}
    ${card('Analysis', 'New product sales, category growth and cannibalisation (average weekly sales)', `
      <div class="pd-bigs">${big(pdMoney(s.sales), 'New product sales')}${big(pdMoney(s.cannibal), 'Taken from existing products')}${big(pdMoney(s.sales - s.cannibal), 'Net new sales')}${big(total ? pdPct(s.sales, total) : '–', 'Share of total sales')}</div>
      <label class="pd-f pd-base"><span>Existing products' avg weekly sales (for the share)</span><input type="number" inputmode="decimal" value="${esc(s.base || '')}" data-change="pdBase" ${ed ? '' : 'disabled'}></label>
      ${Object.keys(s.cats).length ? `<table class="pd-tbl"><thead><tr><th>Category</th><th>Launched</th><th>Weekly sales</th><th>Cannibalised</th></tr></thead><tbody>${Object.entries(s.cats).sort((a, b) => b[1].sales - a[1].sales).map(([c, v]) => `<tr><td>${esc(c)}</td><td>${v.n}</td><td>${pdMoney(v.sales)}</td><td>${pdMoney(v.cannibal)}</td></tr>`).join('')}</tbody></table>` : '<p class="small muted">Launched products with weekly sales show here by category.</p>'}`)}
  </div>`;
}

// The PD Plan page: tabs on top; Timeline is the month grid it had before.
const origRenderBrandPlan = renderBrandPlan;
// eslint-disable-next-line no-global-assign
renderBrandPlan = function renderPdPlan() {
  if (stMod() !== 'pd' || !stCurrent()) return origRenderBrandPlan.apply(this, arguments);
  const p = stCurrent();
  if (ui.pdTab === 'timeline') return origRenderBrandPlan.apply(this, arguments).replace('<header class="bp-head">', `${pdTabsHTML()}<header class="bp-head">`);
  const admin = stAdmin();
  return `<div class="page pd-page">${pdTabsHTML()}
    <header class="bp-head"><div><h1>${esc(stName(p))} <span class="bp-sub">${ui.pdTab === 'analysis' ? 'Product development tracking' : 'Product pipeline'}</span></h1>
      ${stCanEdit(p) ? '' : `<p class="small muted">${icon('lock', 11)} View only</p>`}</div>
      <div class="spacer"></div>
      ${stVisible().length > 1 ? `<select class="st-switch" data-change="stSwitch" aria-label="Which plan">${stVisible().map((x) => `<option value="${esc(x.id)}" ${x.id === p.id ? 'selected' : ''}>${esc(stName(x))}</option>`).join('')}</select>` : ''}
      ${admin ? `<button class="btn ghost sm" data-act="pdAccess" title="Choose who can view, suggest or edit">${icon('user', 14)} Access</button>` : ''}
    </header>
    ${ui.pdTab === 'analysis' ? pdAnalysisHTML(p) : pdPipelineHTML(p)}
  </div>`;
};

// ---------- Framework editor ----------
/** While the framework window is open you edit a draft; nothing is saved or synced until Save. */
const pdFwCur = (p) => ui.pdFwDraft || pdFw(p);
const pdFwChanged = (p) => !!ui.pdFwDraft && JSON.stringify(ui.pdFwDraft) !== JSON.stringify(pdFw(p));
function pdFrameworkHTML(p) {
  const fw = pdFwCur(p);
  return `<div class="pd-fw">
    <p class="small muted">The departments, the checkpoints every product passes, and each department's work at each checkpoint. Work becomes a Planner task for the department's person in charge when a product reaches that checkpoint.</p>
    <h3>Departments</h3>
    <ul class="pd-fwdepts">${fw.depts.map((d, i) => `<li><input value="${esc(d.name)}" data-change="pdFwDept" data-i="${i}" data-k="name" aria-label="Department name">
      <select data-change="pdFwDept" data-i="${i}" data-k="who" aria-label="Person in charge of ${esc(d.name)}"><option value="">Person in charge…</option>${S.people.map((m) => `<option value="${esc(pkey(m.id))}" ${pkey(m.id) === d.who ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}</select>
      <button class="icon-btn" data-act="pdFwDelDept" data-i="${i}" aria-label="Remove ${esc(d.name)}">${icon('close', 13)}</button></li>`).join('')}</ul>
    <button class="btn ghost sm" data-act="pdFwAddDept">${icon('plus', 13)} Department</button>
    <h3>Checkpoints</h3>
    <div class="pd-fwscroll"><table class="pd-fwtbl"><thead><tr><th>Stage</th><th>Checkpoint</th>${fw.depts.map((d) => `<th>${esc(d.name)}</th>`).join('')}<th>Decision</th><th></th></tr></thead>
      <tbody>${fw.cps.map((c, i) => `<tr>
        <td><input value="${esc(c.stage)}" data-change="pdFwCp" data-i="${i}" data-k="stage" aria-label="Stage"><input class="pd-lead" value="${esc(c.lead)}" placeholder="Lead" data-change="pdFwCp" data-i="${i}" data-k="lead" aria-label="Lead"></td>
        <td><input value="${esc(c.label)}" data-change="pdFwCp" data-i="${i}" data-k="label" aria-label="Checkpoint"></td>
        ${fw.depts.map((d) => `<td><textarea rows="3" data-change="pdFwWork" data-i="${i}" data-d="${esc(d.id)}" aria-label="${esc(`${d.name} at ${c.label}`)}">${esc(c.work[d.id] || '')}</textarea></td>`).join('')}
        <td><textarea rows="3" data-change="pdFwCp" data-i="${i}" data-k="decision" aria-label="Decision">${esc(c.decision)}</textarea></td>
        <td><button class="icon-btn" data-act="pdFwDelCp" data-i="${i}" aria-label="Remove checkpoint">${icon('close', 13)}</button></td></tr>`).join('')}</tbody></table></div>
    <div class="row"><button class="btn ghost sm" data-act="pdFwAddCp">${icon('plus', 13)} Checkpoint</button><span class="spacer"></span>
      <button class="btn ghost sm" data-act="pdFwImport">${icon('upload', 13)} Import</button><button class="btn ghost sm" data-act="pdFwExport">${icon('download', 13)} Export</button></div>
    <div class="dlg-foot pd-fw-foot"><button class="btn ghost" data-act="pdFwDiscard">Exit without saving</button><button class="btn primary" data-act="pdFwSave">${icon('check', 14)} Save</button></div>
  </div>`;
}
function pdFwEdit(fn) {
  const p = stCurrent();
  if (!p || !stCanEdit(p)) return;
  if (ui.pdFwDraft) { const fw = pdNormFw(clone(ui.pdFwDraft)) || PD_DEFAULT_FW(); fn(fw, p); ui.pdFwDraft = pdNormFw(fw) || fw; pdRefresh(); return; }
  p.fw = pdNormFw(clone(pdFw(p))) || PD_DEFAULT_FW();
  fn(p.fw, p);
  p.fw = pdNormFw(p.fw) || p.fw;
  pdDirty(p);
  commit();
}
function pdRefresh() {
  const p = stCurrent();
  if (!p) return;
  // Don't redraw under someone typing.
  const typing = (box) => box?.contains(document.activeElement) && document.activeElement.matches('input:not([type=checkbox]), textarea');
  const fwBody = $('dialog.pd-fw-dlg .dlg-body');
  if (fwBody && !typing(fwBody)) { const sx = $('.pd-fwscroll', fwBody)?.scrollLeft; const sy = fwBody.scrollTop; fwBody.innerHTML = pdFrameworkHTML(p); fwBody.scrollTop = sy; if (sx) $('.pd-fwscroll', fwBody).scrollLeft = sx; }
  const prodBody = $('dialog.pd-prod-dlg .dlg-body');
  if (prodBody && !typing(prodBody)) {
    const x = pdProducts(p).find((y) => y.id === ui.pdOpen);
    if (x) { const sy = prodBody.scrollTop; prodBody.innerHTML = pdProductHTML(p, x); prodBody.scrollTop = sy; $('dialog.pd-prod-dlg header h2').textContent = x.name; }
  }
}
const origRenderPd = render;
// eslint-disable-next-line no-global-assign
render = function renderWithPd() { const out = origRenderPd.apply(this, arguments); if (ui.route?.view === 'pdplan') pdRefresh(); return out; };

const pdFind = (id) => pdProducts(stCurrent()).find((x) => x.id === id);
Object.assign(actions, {
  pdTab: (el) => { ui.pdTab = el.dataset.v; render(); },
  pdAdd: async () => {
    const p = stCurrent();
    if (!p || !stCanEdit(p)) return;
    const name = await promptDlg('New product', 'Product name', '', 'Add');
    if (!name) return;
    const fw = pdFw(p);
    if (!p.fw) p.fw = fw;
    const x = pdNormProduct({ id: uid(), name: name.trim(), cp: fw.cps[0].id, owner: pkey(S.meId), created: Date.now(), history: [{ cp: fw.cps[0].id, at: Date.now(), by: pdMe(), d: 'start' }] });
    pdProducts(p).push(x);
    pdDirty(p);
    commit();
    actions.pdOpen({ dataset: { id: x.id } });
  },
  pdOpen: (el) => {
    const p = stCurrent();
    const x = pdFind(el.dataset.id);
    if (!x) return;
    ui.pdOpen = x.id;
    $$('dialog.pd-prod-dlg').forEach((d) => d.close());
    const d = showDialog({ title: x.name, html: pdProductHTML(p, x), wide: true, onClose: () => { ui.pdOpen = null; } });
    d?.classList?.add('pd-prod-dlg');
  },
  pdDecide: async (el) => {
    const p = stCurrent();
    const x = pdFind(el.dataset.id);
    if (!x || !stCanEdit(p)) return;
    const d = el.dataset.d;
    const note = $('#pd-note')?.value || '';
    if ((d === 'stop' || d === 'delist') && !await confirmDlg(`${d === 'stop' ? 'Stop' : 'Delist'} ${x.name}?`, 'It moves to Finished and stopped. Remember to write its review.', d === 'stop' ? 'Stop' : 'Delist')) return;
    pdDecide(p, x, d, note);
    commit();
    toast(d === 'advance' ? `${x.name} moved to ${pdCp(p, x.cp)?.label}. Its departments have new tasks.` : d === 'revise' ? 'Revision noted.' : `${x.name}: ${PD_STATUS[x.status]}.`);
  },
  pdDelete: async (el) => {
    const p = stCurrent();
    const x = pdFind(el.dataset.id);
    if (!x || !await confirmDlg(`Delete ${x.name}?`, 'Its history goes too, and it leaves the analysis. Its Planner tasks stay. To keep the record, Stop it instead.', 'Delete')) return;
    p.products = pdProducts(p).filter((y) => y !== x);
    if (Array.isArray(p.tastings)) p.tastings = p.tastings.filter((v) => v.pid !== x.id);
    pdDirty(p);
    $$('dialog.pd-prod-dlg').forEach((d) => d.close());
    commit();
  },
  pdFramework: () => {
    const p = stCurrent();
    if (!p || !stCanEdit(p)) return;
    $$('dialog.pd-fw-dlg').forEach((d) => d.close());
    ui.pdFwDraft = clone(pdFw(p));
    const d = showDialog({ title: 'PD framework', html: pdFrameworkHTML(p), wide: true, onClose: () => { ui.pdFwDraft = null; } });
    d?.classList?.add('pd-fw-dlg');
    // The top cross and Escape ask before throwing changes away.
    const x = $('header [data-act="closeDialog"]', d);
    if (x) x.dataset.act = 'pdFwClose';
    d?.addEventListener('cancel', (e) => { e.preventDefault(); actions.pdFwClose(); });
  },
  pdFwSave: () => {
    const p = stCurrent();
    if (p && ui.pdFwDraft && pdFwChanged(p)) { p.fw = pdNormFw(clone(ui.pdFwDraft)) || p.fw; pdDirty(p); commit(); toast('Framework saved.', { keep: true }); }
    ui.pdFwDraft = null;
    $('dialog.pd-fw-dlg')?.close();
  },
  pdFwDiscard: () => { ui.pdFwDraft = null; $('dialog.pd-fw-dlg')?.close(); },
  pdFwClose: async () => {
    const p = stCurrent();
    if (!p || !pdFwChanged(p)) { actions.pdFwDiscard(); return; }
    const v = await choiceDlg('Save your changes?', '<p>You changed the PD framework.</p>', [{ v: 'save', label: 'Save', primary: true }, { v: 'discard', label: 'Don’t save' }, { v: 'keep', label: 'Keep editing' }]);
    if (v === 'save') actions.pdFwSave();
    else if (v === 'discard') actions.pdFwDiscard();
  },
  pdFwAddDept: () => pdFwEdit((fw) => fw.depts.push({ id: uid(), name: 'Department', who: '' })),
  pdFwDelDept: async (el) => {
    const d = pdFwCur(stCurrent()).depts[Number(el.dataset.i)];
    if (d && await confirmDlg(`Remove ${d.name}?`, 'Its work at every checkpoint is removed too.', 'Remove')) pdFwEdit((fw) => { fw.depts.splice(Number(el.dataset.i), 1); });
  },
  pdFwAddCp: () => pdFwEdit((fw) => fw.cps.push({ id: uid(), stage: fw.cps.at(-1)?.stage || '', label: 'New checkpoint', lead: '', decision: '', work: {} })),
  pdFwDelCp: async (el) => {
    const p = stCurrent();
    const c = pdFwCur(p).cps[Number(el.dataset.i)];
    if (!c) return;
    if (pdFwCur(p).cps.length < 2) { toast('A framework needs at least one checkpoint.'); return; }
    if (pdProducts(p).some((x) => x.status === 'active' && x.cp === c.id)) { toast('Move the products at this checkpoint on first.'); return; }
    if (await confirmDlg(`Remove ${c.label}?`, '', 'Remove')) pdFwEdit((fw) => { fw.cps.splice(Number(el.dataset.i), 1); });
  },
  pdFwExport: () => {
    const p = stCurrent();
    const blob = new Blob([JSON.stringify({ type: 'pd-framework', v: 1, ...pdFw(p), depts: pdFw(p).depts.map(({ who, ...d }) => d) }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'pd-framework.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  },
  pdFwImport: () => {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = '.json,application/json';
    inp.onchange = async () => {
      const f = inp.files?.[0];
      if (!f) return;
      let fw = null;
      try { fw = pdNormFw(JSON.parse(await f.text())); } catch { fw = null; }
      if (!fw) { toast('That file is not a PD framework.'); return; }
      const p = stCurrent();
      const old = pdFw(p);
      // Keep who is in charge of departments that are still there.
      fw.depts.forEach((d) => { const was = old.depts.find((o) => o.id === d.id || o.name.toLowerCase() === d.name.toLowerCase()); if (was && !d.who) d.who = was.who; });
      const stranded = pdProducts(p).filter((x) => x.status === 'active' && !fw.cps.some((c) => c.id === x.cp));
      if (!await confirmDlg('Replace the framework?', `${fw.cps.length} checkpoints and ${fw.depts.length} departments.${stranded.length ? ` ${stranded.length} product(s) at a checkpoint that no longer exists go back to the first one.` : ''}`, 'Replace')) return;
      stranded.forEach((x) => { x.cp = fw.cps[0].id; x.enteredAt = Date.now(); });
      fw.base = old.base || 0;
      if (ui.pdFwDraft) { ui.pdFwDraft = fw; pdRefresh(); toast('Framework imported. Pick the person in charge of each department, then Save.', { keep: true }); return; }
      p.fw = fw;
      pdDirty(p);
      commit();
      toast('Framework imported. Pick the person in charge of each department.');
    };
    inp.click();
  },
});
Object.assign(changes, {
  pdField: (el) => {
    const p = stCurrent();
    const x = pdFind(el.dataset.id);
    if (!x || !stCanEdit(p)) return;
    const k = el.dataset.k;
    const v = el.type === 'checkbox' ? el.checked : el.value;
    Object.assign(x, pdNormProduct({ ...x, [k]: v }));
    pdDirty(p);
    commit();
  },
  pdBase: (el) => pdFwEdit((fw) => { fw.base = pdNum(el.value) || 0; }),
  pdFwDept: (el) => pdFwEdit((fw) => { const d = fw.depts[Number(el.dataset.i)]; if (d) d[el.dataset.k] = el.value; }),
  pdFwCp: (el) => pdFwEdit((fw) => { const c = fw.cps[Number(el.dataset.i)]; if (c) c[el.dataset.k] = el.value; }),
  pdFwWork: (el) => pdFwEdit((fw) => { const c = fw.cps[Number(el.dataset.i)]; if (c) { if (el.value.trim()) c.work[el.dataset.d] = el.value; else delete c.work[el.dataset.d]; } }),
});

// ---------- Drag a product card into any checkpoint (asks first) ----------
let pdDrag = null;
document.addEventListener('pointerdown', (e) => {
  const card = e.target.closest?.('.pd-card[data-pddrag]');
  if (!card || e.button !== 0 || ui.route?.view !== 'pdplan') return;
  pdDrag = { card, x: e.clientX, y: e.clientY, on: false, touch: e.pointerType !== 'mouse' };
  if (pdDrag.touch) pdDrag.hold = setTimeout(() => { if (pdDrag && !pdDrag.on) pdDragStart(pdDrag.x, pdDrag.y); }, 300);
});
function pdDragStart(x, y) {
  const d = pdDrag;
  d.on = true;
  const r = d.card.getBoundingClientRect();
  d.dx = x - r.left; d.dy = y - r.top;
  d.ghost = d.card.cloneNode(true);
  d.ghost.classList.add('pd-ghost');
  Object.assign(d.ghost.style, { width: `${r.width}px`, left: `${r.left}px`, top: `${r.top}px` });
  document.body.append(d.ghost);
  d.card.classList.add('pd-lifted');
  document.body.classList.add('pd-dragging');
  navigator.vibrate?.(10);
}
document.addEventListener('pointermove', (e) => {
  const d = pdDrag;
  if (!d) return;
  if (!d.on) {
    if (Math.hypot(e.clientX - d.x, e.clientY - d.y) < 6) return;
    if (d.touch) { clearTimeout(d.hold); pdDrag = null; return; } // a swipe scrolls the board
    pdDragStart(d.x, d.y);
  }
  e.preventDefault();
  d.ghost.style.left = `${e.clientX - d.dx}px`;
  d.ghost.style.top = `${e.clientY - d.dy}px`;
  $$('.pd-col.pd-over').forEach((n) => n.classList.remove('pd-over'));
  d.ghost.style.display = 'none';
  const col = document.elementFromPoint(e.clientX, e.clientY)?.closest('.pd-col');
  d.ghost.style.display = '';
  d.col = col || null;
  if (col) col.classList.add('pd-over');
  // Near the edges, scroll the board.
  const wrap = $('.pd-board-wrap');
  if (wrap) { const r = wrap.getBoundingClientRect(); if (e.clientX > r.right - 40) wrap.scrollLeft += 14; else if (e.clientX < r.left + 40) wrap.scrollLeft -= 14; }
}, { passive: false });
document.addEventListener('touchmove', (e) => { if (pdDrag?.on) e.preventDefault(); }, { passive: false });
async function pdDragEnd() {
  const d = pdDrag;
  pdDrag = null;
  if (!d) return;
  clearTimeout(d.hold);
  if (!d.on) return;
  d.ghost.remove();
  d.card.classList.remove('pd-lifted');
  document.body.classList.remove('pd-dragging');
  $$('.pd-col.pd-over').forEach((n) => n.classList.remove('pd-over'));
  // The click that follows a drag shouldn't open the product.
  const stop = (ev) => { ev.stopPropagation(); ev.preventDefault(); };
  window.addEventListener('click', stop, { capture: true, once: true });
  setTimeout(() => window.removeEventListener('click', stop, { capture: true }), 50);
  const p = stCurrent();
  const x = pdFind(d.card.dataset.id);
  const to = d.col?.dataset.cp;
  if (!p || !x || !to || to === x.cp || !stCanEdit(p)) return;
  const from = pdCp(p, x.cp);
  const dest = pdCp(p, to);
  const back = pdCpIndex(p, to) < pdCpIndex(p, x.cp);
  const open = pdWorkAt(p, x, x.cp).filter((w) => !w.done).length;
  if (!await confirmDlg(`Move ${x.name} to ${dest.label}?`, `From ${from?.label || ''}${back ? ' back' : ''} to ${dest.label}.${open && !back ? ` ${open} department task${open === 1 ? ' is' : 's are'} still open here.` : ''} ${dest.label}'s work goes to each department as tasks.`, 'Move')) return;
  const now = Date.now();
  x.history.push({ cp: x.cp, to, at: now, by: pdMe(), d: 'move', note: '' });
  x.cp = to;
  x.enteredAt = now;
  pdDirty(p);
  commit();
  toast(`${x.name} moved to ${dest.label}.`);
}
document.addEventListener('pointerup', pdDragEnd);
document.addEventListener('pointercancel', () => { if (pdDrag?.on) pdDragEnd(); else if (pdDrag) { clearTimeout(pdDrag.hold); pdDrag = null; } });
