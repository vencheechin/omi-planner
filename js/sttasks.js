'use strict';
// ---------- S-Team / PD Plan entries become Planner tasks ----------
// Every entry in a month gets its own task in a Planner plan named after the S-Team Plan,
// in a bucket for its brand, due at the end of its month and assigned to its PIC (when the
// PIC matches someone in the team). Click an entry to open its task.
// The plan pushes its name, month, PIC and progress to the task; progress set on the task
// (say the PIC ticks it done) comes back to the plan. A task deleted in Planner stays deleted.

const stMonthEnd = (k) => { const [y, m] = k.split('-').map(Number); return `${k}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`; };
/** The team member a PIC name points to: full name, or first name, ignoring case. */
function stPersonByPic(pic) {
  const x = String(pic || '').trim().toLowerCase();
  if (!x) return null;
  return S.people.find((p) => p.name.trim().toLowerCase() === x) || S.people.find((p) => p.name.trim().toLowerCase().split(/\s+/)[0] === x) || null;
}
/** The Planner plan holding this S-Team Plan's tasks (made when first needed). */
function stTaskPlan(p, create) {
  const linked = new Set();
  for (const g of p.groups) for (const r of g.rows) for (const row of [r, ...(r.items || [])]) for (const c of Object.values(row.cells || {})) for (const it of cellItems(c)) if (it.task) linked.add(it.task);
  for (const id of linked) { const t = taskById(id); if (t && planById(t.planId)) return planById(t.planId); }
  const byLink = S.plans.find((x) => x.stLink === p.id);
  if (byLink || !create) return byLink || null;
  const members = [...new Set([S.meId, ...stAudience(p)])].filter((id) => S.people.some((x) => x.id === id));
  const plan = makePlan(stName(p), PLAN_COLORS[2 % PLAN_COLORS.length], { buckets: [], members, shared: members.length > 1, owner: S.meId, stLink: p.id });
  S.plans.push(plan);
  return plan;
}
function stBucket(plan, name) {
  const n = name || 'Brand';
  let b = plan.buckets.find((x) => x.name.toLowerCase() === n.toLowerCase());
  if (!b) { b = { id: uid(), name: n }; plan.buckets.push(b); }
  return b.id;
}

/** Brings the tasks and the plan in line. Returns true when anything changed. */
function stSyncTasks(p) {
  if (!p || p.deleted || !stCanEdit(p)) return false;
  let changed = false;
  let planDirty = false;
  let plan = null;
  for (const g of p.groups) {
    for (const top of g.rows) {
      for (const row of [top, ...(top.items || [])]) {
        const isItem = row !== top;
        const rowName = isItem ? `${top.brand || 'Brand'} · ${row.brand || 'Item'}` : (top.brand || 'Brand');
        for (const [k, c] of Object.entries(row.cells || {})) {
          const items = cellItems(c);
          let cellDirty = false;
          for (const it of items) {
            const title = it.text || (isItem ? row.brand : '') || `${top.brand || 'Brand'} task`;
            const fullTitle = `${isItem && it.text ? `${row.brand} · ` : ''}${title}`.slice(0, 200);
            const who = stPersonByPic(it.pic || row.pic || (isItem ? top.pic : ''));
            if (!it.task) {
              plan = plan || stTaskPlan(p, true);
              const t = addTask({ planId: plan.id, bucketId: stBucket(plan, top.brand), title: fullTitle, due: stMonthEnd(k), progress: it.progress || 0, notes: `From ${stName(p)} · ${rowName} · ${bpMonthLabel(k)}`, assignees: who ? [who.id] : [] });
              if (it.progress > 0) t.start = todayISO();
              if (it.progress === 100) t.completedAt = Date.now();
              if (who && who.id !== S.meId) t.shared = true;
              it.task = t.id;
              it.ln = { t: fullTitle, m: k, a: who?.id || '', p: t.progress, b: top.brand || 'Brand' };
              cellDirty = true;
              changed = true;
              continue;
            }
            const t = taskById(it.task);
            if (!t) continue; // Deleted in Planner (or not here yet): leave it be.
            const ln = it.ln || {};
            const next = { ...ln };
            // Progress moved on the task: it wins.
            if (ln.p !== undefined && t.progress !== ln.p) { it.progress = t.progress; next.p = t.progress; }
            else if (it.progress !== t.progress) { t.progress = it.progress; t.completedAt = it.progress === 100 ? Date.now() : null; if (it.progress > 0 && !t.start) t.start = todayISO(); next.p = it.progress; changed = true; }
            else next.p = t.progress;
            if (ln.t !== fullTitle) { t.title = fullTitle; next.t = fullTitle; changed = true; }
            if (ln.m !== k) { t.due = stMonthEnd(k); next.m = k; changed = true; }
            const brand = top.brand || 'Brand';
            if (ln.b !== brand) { const tp = planById(t.planId); if (tp && ln.b !== undefined) { t.bucketId = stBucket(tp, brand); t.notes = `From ${stName(p)} · ${rowName} · ${bpMonthLabel(k)}`; changed = true; } next.b = brand; }
            if ((ln.a || '') !== (who?.id || '')) {
              if (ln.a) t.assignees = t.assignees.filter((a) => a !== ln.a);
              if (who && !t.assignees.includes(who.id)) t.assignees = [...t.assignees, who.id];
              if (who && who.id !== S.meId) t.shared = true;
              next.a = who?.id || '';
              changed = true;
            }
            if (JSON.stringify(next) !== JSON.stringify(ln)) { it.ln = next; cellDirty = true; }
          }
          if (cellDirty) { row.cells[k] = { items }; planDirty = true; changed = true; }
        }
      }
    }
  }
  if (planDirty) { S.sync.dirty = S.sync.dirty || {}; S.sync.dirty[`st:${p.id}`] = 1; }
  return changed;
}
const stOnPlan = () => ui.route?.view === 'halfplan' || ui.route?.view === 'pdplan';
let stSyncing = false;
function stSyncCurrent() {
  if (stSyncing || !stOnPlan() || typeof stCurrent !== 'function') return false;
  stSyncing = true;
  try { return stSyncTasks(stCurrent()); } catch (err) { console.warn('S-Team tasks', err); return false; } finally { stSyncing = false; }
}
// Every change made on the plan page brings the tasks along.
const origCommitSt = commit;
// eslint-disable-next-line no-global-assign
commit = function commitWithStTasks() { stSyncCurrent(); return origCommitSt.apply(this, arguments); };
// Opening the plan (or a change arriving from the team) creates tasks for entries that don't have one yet.
const origRenderSt = render;
// eslint-disable-next-line no-global-assign
render = function renderWithStTasks() {
  const out = origRenderSt.apply(this, arguments);
  if (stOnPlan() && !stSyncing) setTimeout(() => { if (stSyncCurrent()) origCommitSt(); }, 0);
  return out;
};
