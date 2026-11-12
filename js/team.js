'use strict';
/* Team work: assignment history, the Checking workflow, person plans, notifications, the assignment
   report, and syncing through a shared folder (OneDrive, Dropbox, Google Drive or any synced folder).

   Sync model: every device keeps its full state locally and works offline. When a team folder is
   connected, each device writes the tasks it shares to its own file, members/<person>-<device>.json,
   and reads everyone else's. Each field of a task or plan carries the time it was last changed, so
   merging keeps the newest value per field; comments and history merge as lists. Nobody ever writes
   someone else's file, so the cloud service never has to resolve a conflict. */

const TASK_FIELDS = ['planId', 'bucketId', 'title', 'notes', 'progress', 'priority', 'start', 'due', 'repeat', 'assignees', 'labels',
  'checklist', 'attachments', 'order', 'preview', 'created', 'completedAt', 'assignedBy', 'assignedAt', 'review', 'prevBucketId',
  'estimate', 'workType', 'health', 'healthNote', 'decision', 'urgency', 'checkAlerts', 'decisionReq', 'subBy', 'changeReq', 'approvalReq', 'approval'];
const LIST_FIELDS = ['comments', 'history'];
const PLAN_FIELDS = ['name', 'color', 'labels', 'buckets', 'members', 'created', 'owner', 'labelOrder'];
const FILE_APP = 'planner-team';

const freshSync = () => ({ shadow: {}, tombstones: {}, seenAssignees: {}, files: {}, lastSync: null, lastWrite: null, connectedAt: null, folderName: '', ready: false });
const strHash = (s) => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return h; };
const fieldHash = (v) => strHash(JSON.stringify(v ?? null));
const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
const newer = (a, b) => !b || a[0] > b[0] || (a[0] === b[0] && String(a[1]) > String(b[1]));
const deviceId = (() => {
  try {
    let d = localStorage.getItem(lsKey('planner-device'));
    if (!d) { d = uid(); localStorage.setItem(lsKey('planner-device'), d); }
    return d;
  } catch { return 'this-device'; }
})();

// ---------- History ----------
function addEvent(t, type, extra = {}) {
  t.history.push({ id: uid(), type, at: Date.now(), by: S.meId, ...extra });
}
const EVENT_TEXT = {
  assigned: (e) => `assigned to ${nameOf(e.to)}`, unassigned: (e) => `removed ${nameOf(e.to)}`, submitted: () => 'submitted for checking',
  returned: () => 'sent back for more work', withdrawn: () => 'withdrew from checking', completed: () => 'approved and completed', reopened: () => 'reopened',
  health: (e) => `marked it ${healthText(e.value) || e.value}`,
  check: (e) => `${e.done ? 'ticked' : 'unticked'} “${e.text}”`,
  decision: (e) => `sent a decision request to ${nameOf(e.to)}`,
  decided: (e) => `${e.value === 'approved' ? 'approved' : 'rejected'} the decision request`,
  approvalReq: (e) => `sent an approval request to ${nameOf(e.to)}`,
  approvalDone: (e) => `${e.value === 'approved' ? 'approved' : 'rejected'} the approval request`,
  changeReq: (e) => `asked ${nameOf(e.to)} to change ${e.text}`, changeOk: () => 'approved the change', changeNo: () => 'declined the change',
};
const nameOf = (id) => (id === S.meId ? 'you' : person(id)?.name || 'someone');

// ---------- Checking workflow ----------
const reviewerOf = (t) => t.assignedBy || null;
/** True when ticking this task should submit it for checking rather than complete it. */
const needsReview = (t) => !!t.assignedBy && t.assignedBy !== S.meId;
const isReviewer = (t) => !!t.review && reviewerOf(t) === S.meId;
const checkLabel = (t) => (isDone(t) ? 'Mark not complete' : isReviewer(t) ? 'Approve and complete' : needsReview(t) ? 'Submit for checking' : 'Mark complete');

/** Older versions kept submitted tasks in a "Checking" bucket; it's only looked up to empty it. */
function checkingBucket(plan) {
  return plan.buckets.find((x) => x.kind === 'checking');
}
/** Removes Checking buckets (once): their tasks go back to the bucket they came from. */
function removeCheckingBuckets() {
  for (const plan of S.plans) {
    const check = checkingBucket(plan);
    if (!check) continue;
    const others = plan.buckets.filter((b) => b !== check);
    if (!others.length) { delete check.kind; continue; }
    S.tasks.filter((t) => t.bucketId === check.id).forEach((t) => { t.bucketId = (others.find((b) => b.id === t.prevBucketId) || others[0]).id; t.prevBucketId = null; });
    plan.buckets = others;
  }
}
function submitForReview(t, note) {
  if (t.review || isDone(t)) return;
  t.review = { at: Date.now(), by: S.meId };
  if (t.progress === 0) t.progress = 50;
  addEvent(t, 'submitted', note ? { note } : {});
  if (note) t.comments.push({ id: uid(), author: S.meId, text: note, at: Date.now() });
}
/** Moves a task out of the Checking bucket, back to where it was before it was submitted. */
function leaveChecking(t) {
  const plan = planById(t.planId);
  const check = checkingBucket(plan);
  if (check && t.bucketId === check.id) {
    const back = plan.buckets.find((b) => b.id === t.prevBucketId && b.kind !== 'checking') || plan.buckets.find((b) => b.kind !== 'checking');
    if (back) t.bucketId = back.id;
  }
  t.prevBucketId = null;
}
function endReview(t, note) {
  if (!t.review) return;
  t.review = null;
  leaveChecking(t);
  addEvent(t, reviewerOf(t) === S.meId ? 'returned' : 'withdrawn', note ? { note } : {});
  if (note) t.comments.push({ id: uid(), author: S.meId, text: note, at: Date.now() });
}
/** Called by setProgress when a task is completed. */
function onCompleted(t) {
  if (t.review) { t.review = null; leaveChecking(t); }
  addEvent(t, 'completed');
}

// ---------- Person plans ----------
const personPlanById = (id) => S.personPlans.find((p) => p.id === id);
const personPlanTasks = (pp) => S.tasks.filter((t) => t.assignees.includes(pp.personId) && (t.assignedBy === S.meId || t.subBy?.[pp.personId] === S.meId));
function ensurePersonPlan(personId) {
  if (personId === S.meId || S.personPlans.some((p) => p.personId === personId)) return null;
  const who = person(personId);
  if (!who) return null;
  const pp = { id: uid(), personId, name: who.name, created: Date.now(), pinned: false };
  S.personPlans.push(pp);
  return pp;
}

// ---------- Change tracking (runs before every save) ----------
/** Records assignment events, creates person plans, and stamps changed fields of shared records. */
function trackChanges() {
  const sy = S.sync;
  const now = Date.now();
  const created = [];
  if (!sy.ready) {
    // First run on existing data: remember current assignees without inventing history for them.
    S.tasks.forEach((t) => { sy.seenAssignees[t.id] = [...t.assignees]; });
    sy.ready = true;
  }
  for (const t of S.tasks) {
    const before = sy.seenAssignees[t.id] || [];
    const added = t.assignees.filter((a) => !before.includes(a));
    const removed = before.filter((a) => !t.assignees.includes(a));
    if (!added.length && !removed.length) continue;
    for (const a of added) {
      addEvent(t, 'assigned', { to: a });
      if (a === S.meId) continue;
      if (!t.assignedBy) { t.assignedBy = S.meId; t.assignedAt = now; }
      t.shared = true;
      if (t.assignedBy === S.meId || t.subBy?.[a] === S.meId) { const pp = ensurePersonPlan(a); if (pp) created.push(pp); }
    }
    removed.forEach((a) => addEvent(t, 'unassigned', { to: a }));
    sy.seenAssignees[t.id] = [...t.assignees];
  }

  const shared = S.tasks.filter((t) => t.shared);
  const sharedPlanIds = new Set(shared.map((t) => t.planId));
  S.plans.forEach((p) => {
    if (sharedPlanIds.has(p.id) && !p.shared) p.shared = true;
    if (p.shared && !p.owner) p.owner = S.meId;
  });
  // Note what changed in every record (for the shared folder and the cloud alike).
  stampAll();
  if (created.length) toast(`Created a plan for ${created.map((p) => p.name).join(', ')}. Rename it from the sidebar.`);
}

// ---------- Merging a teammate's file ----------
const maxStamp = (rec) => Math.max(0, ...Object.values(rec?._v || {}).map((v) => v[0]));

/** Rewrites every reference to person `from` as `to`, in tasks, plans and person plans. */
function rewritePerson(state, from, to) {
  const swap = (id) => (id === from ? to : id);
  for (const t of state.tasks || []) {
    t.assignees = [...new Set((t.assignees || []).map(swap))];
    t.assignedBy = swap(t.assignedBy);
    if (t.subBy) t.subBy = Object.fromEntries(Object.entries(t.subBy).map(([k, v]) => [swap(k), swap(v)]));
    if (t.review) t.review.by = swap(t.review.by);
    (t.history || []).forEach((e) => { e.by = swap(e.by); if (e.to) e.to = swap(e.to); });
    (t.comments || []).forEach((c) => { c.author = swap(c.author); });
  }
  for (const p of state.plans || []) { p.members = [...new Set((p.members || []).map(swap))]; p.owner = swap(p.owner); }
  (state.personPlans || []).forEach((pp) => { pp.personId = swap(pp.personId); });
  if (state.sync) for (const [k, v] of Object.entries(state.sync.seenAssignees)) state.sync.seenAssignees[k] = [...new Set(v.map(swap))];
}
/**
 * Brings a teammate's people into this device. A person who writes their own file owns their id;
 * anyone added by email before they joined is matched to it and renamed everywhere.
 */
function mergePeople(data) {
  const owner = data.person;
  const incoming = [owner, ...(data.people || [])].filter((p) => p && typeof p.id === 'string');
  for (const p of incoming) {
    const email = String(p.email || '').trim().toLowerCase();
    let local = person(p.id);
    if (!local && email) {
      const byEmail = S.people.find((x) => (x.email || '').toLowerCase() === email);
      if (byEmail) {
        if (p.id === owner.id && byEmail.id !== S.meId) {
          rewritePerson(S, byEmail.id, p.id);
          byEmail.id = p.id;
          local = byEmail;
        } else {
          rewritePerson(data, p.id, byEmail.id);
          continue;
        }
      }
    }
    if (!local) {
      if (p.id === S.meId) continue;
      S.people.push({ id: p.id, name: String(p.name || 'Teammate'), email, color: p.color || PERSON_COLORS[S.people.length % PERSON_COLORS.length] });
    } else if (p.id === owner.id && p.id !== S.meId) {
      local.name = String(p.name || local.name);
      local.email = email || local.email;
    }
  }
}
function mergeRecord(kind, r, notices) {
  const list = kind === 'plan' ? S.plans : S.tasks;
  const fields = kind === 'plan' ? PLAN_FIELDS : TASK_FIELDS;
  if (!r || typeof r.id !== 'string') return false;
  const tomb = S.sync.tombstones[r.id];
  if (tomb && tomb[0] >= maxStamp(r)) return false;
  if (kind === 'task' && !planById(r.planId)) return false;
  const sh = S.sync.shadow[r.id] || (S.sync.shadow[r.id] = {});
  let l = list.find((x) => x.id === r.id);
  if (!l) {
    l = kind === 'plan'
      ? { id: r.id, pinned: false, lastOpened: 0, shared: true, labels: Array(LABELS.length).fill(''), buckets: [], members: [] }
      : makeTask({ id: r.id, shared: true });
    for (const f of fields) if (f in r) { l[f] = clone(r[f]); sh[f] = fieldHash(l[f]); }
    l._v = clone(r._v || {});
    if (kind === 'task') {
      LIST_FIELDS.forEach((f) => { l[f] = clone(r[f] || []); });
      notices.push(...newEvents(l, new Set()));
      S.sync.seenAssignees[l.id] = [...l.assignees];
    }
    list.push(l);
    delete S.sync.tombstones[r.id];
    return true;
  }
  let changed = false;
  const known = kind === 'task' ? new Set([...l.history, ...l.comments].map((x) => x.id)) : null;
  l._v = l._v || {};
  for (const f of fields) {
    const rv = r._v?.[f];
    if (!rv || !newer(rv, l._v[f])) continue;
    if (fieldHash(r[f]) !== fieldHash(l[f])) { l[f] = clone(r[f]); changed = true; }
    l._v[f] = rv;
    sh[f] = fieldHash(l[f]);
  }
  if (kind === 'task') {
    for (const f of LIST_FIELDS) {
      const have = new Map(l[f].map((x) => [x.id, x]));
      for (const x of r[f] || []) {
        if (!x || !x.id) continue;
        const mine = have.get(x.id);
        if (!mine) { l[f].push(clone(x)); changed = true; } else {
          if (x.deleted && !mine.deleted) { mine.deleted = true; mine.deletedBy = x.deletedBy || null; mine.text = ''; mine.files = []; changed = true; }
          if (x.recalled && !mine.recalled) { mine.recalled = clone(x.recalled); mine.text = ''; mine.files = []; changed = true; }
        }
      }
      l[f].sort((a, b) => a.at - b.at);
    }
    notices.push(...newEvents(l, known));
    S.sync.seenAssignees[l.id] = [...l.assignees];
    l.shared = true;
  }
  return changed;
}
/** Notifications for events and comments, by others, that this device hasn't seen yet. */
function newEvents(t, known) {
  const since = S.sync.connectedAt || 0;
  const out = [];
  const involved = t.assignees.includes(S.meId) || t.assignedBy === S.meId;
  for (const e of t.history) {
    if (known.has(e.id) || e.by === S.meId) continue;
    // Before you connected, only what still needs you is worth a notice: open work assigned to you or waiting for your check.
    const stillNeedsMe = !isDone(t) && ((e.type === 'assigned' && e.to === S.meId && t.assignees.includes(S.meId)) || (e.type === 'submitted' && t.review && reviewerOf(t) === S.meId));
    if (e.at < since && !stillNeedsMe) continue;
    const who = person(e.by)?.name || 'A teammate';
    if (e.type === 'submitted' && reviewerOf(t) === S.meId) out.push({ kind: 'review', text: `${who} submitted “${t.title}” for checking`, note: e.note });
    else if (e.type === 'assigned' && e.to === S.meId) out.push({ kind: 'assigned', text: `${who} assigned you “${t.title}”` });
    else if (e.type === 'returned' && t.assignees.includes(S.meId)) out.push({ kind: 'returned', text: `${who} sent back “${t.title}”`, note: e.note });
    else if (e.type === 'completed' && t.assignees.includes(S.meId)) out.push({ kind: 'completed', text: `${who} approved “${t.title}”` });
    else if (e.type === 'decision' && e.to === S.meId && t.decisionReq?.status === 'pending') out.push({ kind: 'review', text: `${who} sent you a decision request: “${t.title}”` });
    else if (e.type === 'decided' && t.decisionReq?.by === S.meId) out.push({ kind: e.value === 'approved' ? 'completed' : 'returned', text: `${who} ${e.value === 'approved' ? 'approved' : 'rejected'} your decision request “${t.title}”`, note: e.note });
    else if (e.type === 'approvalReq' && isMeId(e.to) && t.approvalReq?.status === 'pending') out.push({ kind: 'review', text: `${who} sent you an approval request: “${t.title}”` });
    else if (e.type === 'approvalDone' && isMeId(t.approvalReq?.by)) out.push({ kind: e.value === 'approved' ? 'completed' : 'returned', text: `${who} ${e.value === 'approved' ? 'approved' : 'rejected'} your approval request “${t.title}”`, note: e.note });
    else if (e.type === 'changeReq' && e.to === S.meId && t.changeReq?.status === 'pending') out.push({ kind: 'review', text: `${who} requests a change to “${t.title}”`, note: e.note });
    else if ((e.type === 'changeOk' || e.type === 'changeNo') && t.assignees.includes(S.meId)) out.push({ kind: e.type === 'changeOk' ? 'completed' : 'returned', text: `${who} ${e.type === 'changeOk' ? 'approved' : 'declined'} your change to “${t.title}”`, note: e.note });
    else if (e.type === 'check' && e.done && (t.checkAlerts || []).includes(S.meId)) out.push({ kind: 'check', text: `${who} ticked “${e.text}” on “${t.title}”` });
    else if (e.type === 'health' && reviewerOf(t) === S.meId) out.push({ kind: e.value === 'red' ? 'returned' : 'review', text: `${who} marked “${t.title}” ${healthText(e.value) || e.value}`, note: e.note });
  }
  for (const c of t.comments) {
    if (known.has(c.id) || c.author === S.meId || c.at < since || c.deleted || !involved) continue;
    if (t.history.some((e) => e.note === c.text && Math.abs(e.at - c.at) < 5000)) continue; // already in the submit/return notice
    out.push({ kind: 'comment', text: `${person(c.author)?.name || 'A teammate'} commented on “${t.title}”`, note: c.text });
  }
  return out.map((n) => ({ ...n, id: uid(), at: Date.now(), taskId: t.id, read: false }));
}
/** Merges one teammate file into S. Returns true when anything changed. */
function mergeTeamFile(data) {
  if (!data || data.app !== FILE_APP || !data.person || !Array.isArray(data.tasks) || !Array.isArray(data.plans)) return false;
  const before = JSON.stringify([S.people, S.plans, S.tasks]);
  const notices = [];
  mergePeople(data);
  for (const [id, stamp] of Object.entries(data.tombstones || {})) {
    if (!Array.isArray(stamp)) continue;
    const local = taskById(id) || planById(id);
    if (local && stamp[0] >= maxStamp(local)) {
      S.tasks = S.tasks.filter((t) => t.id !== id && t.planId !== id);
      S.plans = S.plans.filter((p) => p.id !== id);
      delete S.sync.shadow[id];
    }
    if (newer(stamp, S.sync.tombstones[id])) S.sync.tombstones[id] = stamp;
  }
  data.plans.forEach((p) => mergeRecord('plan', p, notices));
  data.tasks.forEach((t) => mergeRecord('task', t, notices));
  let bpChanged = false;
  (Array.isArray(data.stplans) ? data.stplans : []).forEach((p) => { if (applyStPlan(p.id, p)) bpChanged = true; });
  if (data.org && applyOrg(data.org)) bpChanged = true;
  if (data.brandplan && Array.isArray(data.brandplan.order) && data.brandplan.order.length && applyStPlan('legacy', data.brandplan)) bpChanged = true;
  notices.forEach(notify);
  return bpChanged || JSON.stringify([S.people, S.plans, S.tasks]) !== before;
}

/** What this device publishes: shared tasks, their plans, the people they mention, and deletions. */
function buildTeamFile() {
  const tasks = S.tasks.filter((t) => t.shared).map((t) => {
    const o = clone(t);
    // My Day and time slots are each person's own plan for their day.
    delete o.myDay;
    delete o.slotDate;
    delete o.slotStart;
    delete o.boxId;
    delete o.boxOrder;
    delete o.tbQueued;
    delete o.tbColor;
    delete o.reminders;
    delete o.remFired;
    delete o.myOrder;
    delete o.myBucketId;
    return o;
  });
  const planIds = new Set(tasks.map((t) => t.planId));
  const plans = S.plans.filter((p) => p.shared || planIds.has(p.id)).map((p) => {
    const o = { id: p.id, _v: clone(p._v || {}) };
    PLAN_FIELDS.forEach((f) => { o[f] = clone(p[f]); });
    // Everyone has a "Personal tasks" plan; teammates see this one under the owner's name.
    if (p.personal) o.name = `${person(S.meId).name}'s tasks`;
    return o;
  });
  const ids = new Set([S.meId, ...tasks.flatMap((t) => [...t.assignees, t.assignedBy, ...t.history.flatMap((e) => [e.by, e.to]), ...t.comments.map((c) => c.author)]), ...plans.flatMap((p) => p.members)]);
  const people = S.people.filter((p) => ids.has(p.id)).map((p) => ({ id: p.id, name: p.name, email: p.email || '', color: p.color }));
  return { app: FILE_APP, v: 1, device: deviceId, person: people.find((p) => p.id === S.meId), people, plans, tasks, tombstones: S.sync.tombstones, stplans: stPlans().map(stWire), org: orgWire() };
}

// ---------- Notifications ----------
function notify(n) {
  S.inbox.unshift(n);
  S.inbox = S.inbox.slice(0, 200);
  try {
    if ('Notification' in window && Notification.permission === 'granted') {
      const sys = new Notification('Planner', { body: n.note ? `${n.text}: ${n.note}` : n.text, tag: n.id });
      sys.onclick = () => { window.focus(); openNotice(n.id); };
    }
  } catch { /* the in-app bell still shows it */ }
}
function openNotice(id) {
  const n = S.inbox.find((x) => x.id === id);
  if (!n) return;
  n.read = true;
  const t = taskById(n.taskId);
  closePop();
  commit();
  if (t) { location.hash = `#/plan/${t.planId}/task/${t.id}`; } else if (n.route) { if (n.stPlanId) ui.stPlanId = n.stPlanId; location.hash = n.route; }
}
const unreadCount = () => S.inbox.filter((n) => !n.read).length;
function inboxHTML() {
  const items = S.inbox.slice(0, 50);
  return `<div class="picker inbox"><div class="sec-head"><h4>Notifications</h4>${unreadCount() ? `<button class="btn ghost sm" data-act="markAllRead">Mark all read</button>` : ''}</div>
    <div class="picker-scroll">${items.length ? items.map((n) => `<button class="notice ${n.read ? '' : 'unread'}" data-act="openNotice" data-id="${esc(n.id)}">
      <span class="notice-dot notice-${esc(n.kind)}"></span><span><b>${esc(n.text)}</b>${n.note ? `<em>${esc(n.note)}</em>` : ''}<small>${esc(fmtDateTime(n.at))}</small></span></button>`).join('')
      : `<p class="muted small">Nothing yet.</p>`}</div>
    ${'Notification' in window && Notification.permission === 'default' ? `<button class="btn ghost sm" data-act="enableNotifications">${icon('sun', 14)} Also show desktop notifications</button>` : ''}</div>`;
}

// ---------- Folder sync ----------
const Team = {
  dir: null, state: 'off', error: '', busy: false, timer: null, pushTimer: null, haveFiles: new Set(), sentFiles: new Set(),
  supported: typeof window.showDirectoryPicker === 'function',
  fileName() { return `${S.meId}-${deviceId}.json`; },

  async init() {
    if (!Store.db) return;
    try { this.dir = await Store.tx('kv', 'readonly', (s) => s.get('teamDir')); } catch { this.dir = null; }
    if (this.dir && this.dir.virtual) { this.dir = new DeviceDir(); this.start(); return; }
    if (!this.dir || !this.supported) { this.dir = null; return; }
    const perm = await this.dir.queryPermission({ mode: 'readwrite' }).catch(() => 'denied');
    if (perm === 'granted') this.start(); else this.setState('permission');
  },
  async connect() {
    const me = person(S.meId);
    if (!me.email) { toast('Add your email in Settings first, so teammates can assign tasks to you.', { error: true }); return; }
    let dir;
    try { dir = await window.showDirectoryPicker({ id: 'planner-team', mode: 'readwrite' }); } catch (err) { if (err.name !== 'AbortError') toast(err.message, { error: true }); return; }
    if (await dir.requestPermission({ mode: 'readwrite' }) !== 'granted') return;
    await Store.tx('kv', 'readwrite', (s) => s.put(dir, 'teamDir'));
    this.dir = dir;
    S.sync.folderName = dir.name;
    if (!S.sync.connectedAt) S.sync.connectedAt = Date.now();
    // Tasks already given to someone else become shared from now on.
    S.tasks.forEach((t) => { if (t.assignees.some((a) => a !== S.meId) || (t.assignedBy && t.assignedBy !== S.meId)) t.shared = true; });
    commit();
    this.start();
    toast(`Connected to “${dir.name}”. Teammates who choose the same folder will see shared tasks.`);
  },
  /** Connects to the test folder inside this browser (two people on one device). */
  async connectDevice({ quiet = false } = {}) {
    const me = person(S.meId);
    if (!me.email) { if (!quiet) toast('Add your email in Settings first.', { error: true }); return; }
    await Store.tx('kv', 'readwrite', (s) => s.put({ virtual: 'device' }, 'teamDir'));
    this.dir = new DeviceDir();
    S.sync.folderName = this.dir.name;
    if (!S.sync.connectedAt) S.sync.connectedAt = Date.now();
    S.tasks.forEach((t) => { if (t.assignees.some((a) => a !== S.meId) || (t.assignedBy && t.assignedBy !== S.meId)) t.shared = true; });
    commit();
    this.start();
    if (!quiet) toast('Connected to the test folder on this device.');
  },
  async reconnect() {
    if (!this.dir) return;
    const perm = await this.dir.requestPermission({ mode: 'readwrite' }).catch(() => 'denied');
    if (perm === 'granted') this.start(); else toast('Planner needs permission to the team folder to sync.', { error: true });
  },
  async disconnect() {
    clearInterval(this.timer);
    this.dir = null;
    await Store.tx('kv', 'readwrite', (s) => s.delete('teamDir'));
    S.sync.folderName = '';
    this.setState('off');
    commit();
  },
  start() {
    clearInterval(this.timer);
    this.setState('ok');
    this.sync();
    this.timer = setInterval(() => { if (document.visibilityState === 'visible') this.sync(); }, 20000);
  },
  /** Called after each local save: push soon, so a teammate sees the change quickly. */
  schedulePush() {
    if (this.busy || (this.state !== 'ok' && this.state !== 'error')) return;
    clearTimeout(this.pushTimer);
    this.pushTimer = setTimeout(() => this.sync(), 1500);
  },
  setState(state, error = '') {
    this.state = state;
    this.error = error;
    updateStatus();
  },
  async sync() {
    if (!this.dir || this.busy) return;
    this.busy = true;
    try {
      const members = await this.dir.getDirectoryHandle('members', { create: true });
      let changed = false;
      for await (const [name, handle] of members.entries()) {
        if (handle.kind !== 'file' || !name.endsWith('.json') || name === this.fileName()) continue;
        const file = await handle.getFile();
        // The suffix changes when teammate files gain new parts (bp: the H1 / H2 Plan), so each file is read again once.
        const stamp = `${file.lastModified}:${file.size}:st`;
        if (S.sync.files[name] === stamp) continue;
        try {
          if (mergeTeamFile(JSON.parse(await file.text()))) changed = true;
          S.sync.files[name] = stamp;
        } catch (err) {
          console.warn(`Skipped ${name}; it may still be downloading.`, err);
        }
      }
      if (changed) {
        S = normalizeState(S);
        await this.pullFiles();
      }
      await this.pushFiles();
      const body = JSON.stringify(buildTeamFile());
      const hash = strHash(body);
      if (hash !== S.sync.lastWrite) {
        const out = await (await members.getFileHandle(this.fileName(), { create: true })).createWritable();
        await out.write(body);
        await out.close();
        S.sync.lastWrite = hash;
      }
      S.sync.lastSync = Date.now();
      await Store.flush();
      if (changed && !document.activeElement?.closest?.('dialog, .pop')) render();
      else renderSidebar();
      updateBell();
      this.setState('ok');
    } catch (err) {
      console.error('Team sync failed', err);
      this.setState(err.name === 'NotAllowedError' || err.name === 'SecurityError' ? 'permission' : 'error', err.message);
    } finally {
      this.busy = false;
    }
  },
  async filesDir() { return this.dir.getDirectoryHandle('files', { create: true }); },
  /** Copies attachments of shared tasks into the folder, once each. */
  async pushFiles() {
    const ids = S.tasks.filter((t) => t.shared).flatMap((t) => allFiles(t).filter((a) => a.kind === 'file').map((a) => a.id)).filter((id) => !this.sentFiles.has(id));
    if (!ids.length) return;
    const dir = await this.filesDir();
    for (const id of ids) {
      try { await dir.getFileHandle(id); this.sentFiles.add(id); continue; } catch { /* not there yet */ }
      const blob = await Store.getFile(id);
      if (!blob) continue;
      const out = await (await dir.getFileHandle(id, { create: true })).createWritable();
      await out.write(blob);
      await out.close();
      this.sentFiles.add(id);
    }
  },
  /** Fetches attachments teammates added, when they aren't on this device yet. */
  async pullFiles() {
    const ids = S.tasks.filter((t) => t.shared).flatMap((t) => allFiles(t).filter((a) => a.kind === 'file').map((a) => a.id)).filter((id) => !this.haveFiles.has(id));
    if (!ids.length) return;
    const dir = await this.filesDir();
    for (const id of ids) {
      if (await Store.getFile(id)) { this.haveFiles.add(id); continue; }
      try {
        const file = await (await dir.getFileHandle(id)).getFile();
        await Store.putFile(id, file);
        this.haveFiles.add(id);
      } catch { /* still uploading on the teammate's side; try again next sync */ }
    }
  },
  statusText() {
    if (this.state === 'off') return null;
    if (this.state === 'permission') return { text: 'Team folder: click to reconnect', cls: 'error', act: 'teamReconnect' };
    if (this.state === 'error') return { text: 'Team sync problem · retrying', cls: 'error', act: 'openSettings' };
    const ago = S.sync.lastSync ? Math.round((Date.now() - S.sync.lastSync) / 60000) : null;
    const when = ago === null ? 'not yet' : ago < 1 ? 'just now' : `${ago} min ago`;
    return { text: navigator.onLine ? `Synced with team ${when}` : 'Offline · saved, will sync when online', cls: navigator.onLine ? '' : 'offline', act: 'openSettings' };
  },
};

function teamSettingsHTML() {
  const me = person(S.meId);
  const members = Object.keys(S.sync.files).length;
  if (!Team.supported && !Team.dir) {
    return `<div class="row"><button class="btn ghost sm" data-act="teamDevice">Test folder on this device</button></div>`;
  }
  return `
    <div class="task-fields two">
      <label class="field"><span>Your name</span><input value="${esc(me.name)}" data-change="personName" data-id="${esc(me.id)}"></label>
      <label class="field"><span>Your email</span><input type="email" value="${esc(me.email || '')}" placeholder="name@company.com" data-change="personEmail" data-id="${esc(me.id)}"></label>
    </div>
    ${Team.dir
      ? `<p class="small">Folder: <b>${esc(S.sync.folderName || Team.dir.name)}</b> · ${members} teammate file${members === 1 ? '' : 's'} found<br><span class="muted">Last synced: ${S.sync.lastSync ? esc(fmtDateTime(S.sync.lastSync)) : 'not yet'}${Team.error ? ` · ${esc(Team.error)}` : ''}</span></p>
        <div class="row">${Team.state === 'permission' ? `<button class="btn primary sm" data-act="teamReconnect">Reconnect</button>` : `<button class="btn primary sm" data-act="teamSyncNow">Sync now</button>`}
        <button class="btn ghost sm" data-act="teamDisconnect">Disconnect</button></div>`
      : `<button class="btn primary sm" data-act="teamConnect">Choose shared folder…</button><button class="btn ghost sm" data-act="teamDevice">Test folder on this device</button>`}
    ${'Notification' in window && Notification.permission === 'default' ? `<button class="btn ghost sm" data-act="enableNotifications">Turn on desktop notifications</button>` : ''}`;
}

// ---------- Task panel parts ----------
function workflowHTML(t) {
  const reviewer = reviewerOf(t);
  const lines = [];
  if (t.assignedBy && t.assignees.some((a) => a !== t.assignedBy)) {
    lines.push(`<span class="muted small">Delegated by ${esc(nameOf(t.assignedBy))}${t.assignedAt ? ` on ${esc(fmtDateTime(t.assignedAt))}` : ''}</span>`);
  }
  let action = '';
  if (t.review && isReviewer(t)) {
    action = `<div class="review-box"><p><b>${esc(person(t.review.by)?.name || 'A teammate')}</b> submitted this for checking on ${esc(fmtDateTime(t.review.at))}.</p>
      <div class="row"><button class="btn primary sm" data-act="approveTask" data-id="${esc(t.id)}">${icon('check', 14)} Approve and complete</button><button class="btn ghost sm" data-act="sendBack" data-id="${esc(t.id)}">Send back</button></div></div>`;
  } else if (t.review) {
    action = `<div class="review-box"><p>Waiting for <b>${esc(nameOf(reviewer))}</b> to check. Submitted ${esc(fmtDateTime(t.review.at))}.</p>
      <div class="row"><button class="btn ghost sm" data-act="withdrawReview" data-id="${esc(t.id)}">Withdraw</button></div></div>`;
  } else if (needsReview(t) && !isDone(t)) {
    action = `<div class="review-box">
      <div class="row"><button class="btn primary sm" data-act="submitReview" data-id="${esc(t.id)}">Submit for checking</button></div></div>`;
  }
  return lines.length || action ? `<div class="workflow">${lines.join('')}${action}</div>` : '';
}
function activityHTML(t) {
  if (!t.history.length) return '';
  return `<section class="task-sec"><div class="sec-head"><h3>Activity</h3></div><ul class="activity">${[...t.history].reverse().map((e) => `<li>
    <span class="act-dot act-${esc(e.type)}"></span><span><b>${esc(person(e.by)?.name || 'Someone')}</b> ${esc((EVENT_TEXT[e.type] || (() => e.type))(e))}${e.note ? `: “${esc(e.note)}”` : ''}<small>${esc(fmtDateTime(e.at))}</small></span></li>`).join('')}</ul></section>`;
}

// ---------- Person plan page ----------
function renderPersonPlan(pp) {
  const fkey = `person:${pp.id}`;
  const tab = ui.planTab[fkey] || 'board';
  const by = ui.groupBy[fkey] || 'stage';
  const who = person(pp.personId);
  const tasks = applyFilter(personPlanTasks(pp), filterOf(fkey));
  const ctx = { key: fkey, showPlan: true, crossPlan: true };
  const body = {
    board: () => boardHTML(groupsFor(by, tasks, null), by, ctx), grid: () => gridHTML(tasks, ctx),
    schedule: () => scheduleHTML(tasks, null), charts: () => chartsHTML(tasks, null),
  }[tab]();
  return `<div class="plan-page">
    <header class="plan-head">
      ${avatar(who, 36)}
      <input class="plan-title" value="${esc(pp.name)}" data-change="personPlanName" data-id="${esc(pp.id)}" aria-label="Plan name">
      <span class="muted small">Tasks you assigned to ${esc(who?.name || 'this person')}</span>
      <div class="spacer"></div>
      <a class="btn ghost sm" href="#/report?person=${esc(pp.personId)}">Report</a>
      <button class="icon-btn" data-act="personPlanMenu" data-id="${esc(pp.id)}" aria-label="Plan options">${icon('more')}</button>
    </header>
    ${toolbar({ fkey, by, tab, tabs: TABS, options: ['stage', 'status', 'plan', 'due', 'priority', 'health', 'work'] })}
    <div class="view">${body}</div>
  </div>`;
}

// ---------- Assignment report ----------
const STATUS_LABEL = { notStarted: 'Not started', progress: 'In progress', checking: 'Waiting for check', done: 'Completed', removed: 'Unassigned' };
function reportRows() {
  const rows = [];
  for (const t of S.tasks) {
    const latest = new Map();
    t.history.filter((e) => e.type === 'assigned' && e.to !== e.by).forEach((e) => latest.set(e.to, e));
    for (const [to, ev] of latest) {
      const after = t.history.filter((e) => e.at >= ev.at);
      const submitted = after.filter((e) => e.type === 'submitted' && e.by === to).pop();
      const completed = after.filter((e) => e.type === 'completed').pop();
      const removed = after.some((e) => e.type === 'unassigned' && e.to === to) && !t.assignees.includes(to);
      const status = removed ? 'removed' : isDone(t) ? 'done' : t.review ? 'checking' : inProgress(t) ? 'progress' : 'notStarted';
      const doneAt = isDone(t) ? (completed?.at || t.completedAt) : null;
      const late = !!t.due && (doneAt ? toISO(new Date(doneAt)) > t.due : todayISO() > t.due) && status !== 'removed';
      rows.push({ t, to, by: ev.by, assignedAt: ev.at, submittedAt: submitted?.at || null, completedAt: doneAt, status, late, days: doneAt ? Math.max(0, Math.round((doneAt - ev.at) / 86400000)) : null });
    }
  }
  return rows.sort((a, b) => b.assignedAt - a.assignedAt);
}
function filteredReport() {
  const f = ui.report;
  const from = f.from ? parseISO(f.from).getTime() : -Infinity;
  const to = f.to ? parseISO(addDays(f.to, 1)).getTime() : Infinity;
  return reportRows().filter((r) => (f.scope === 'all' || r.by === S.meId)
    && (!f.person || r.to === f.person) && (!f.status || r.status === f.status || (f.status === 'late' && r.late))
    && r.assignedAt >= from && r.assignedAt < to);
}
const shortDate = (ms) => (ms ? `<span title="${esc(fmtDateTime(ms))}">${esc(fmtDate(toISO(new Date(ms))))}</span>` : '<span class="muted">–</span>');
function renderReport() {
  const f = ui.report;
  const rows = filteredReport();
  const all = reportRows();
  const people = [...new Set(all.map((r) => r.to))].map(person).filter(Boolean);
  const count = (s) => rows.filter((r) => r.status === s).length;
  const opt = (v, label, cur) => `<option value="${esc(v)}" ${v === cur ? 'selected' : ''}>${esc(label)}</option>`;
  return `<div class="page wide">
    <header class="page-head row"><div><h1>Assignment report</h1></div>
      <div class="spacer"></div><button class="btn primary sm" data-act="reportExport">${icon('download', 14)} Export to Excel (CSV)</button></header>
    <div class="report-filters">
      <label class="field"><span>Assigned by</span><select data-change="reportFilter" data-k="scope">${opt('me', 'Me', f.scope)}${opt('all', 'Anyone', f.scope)}</select></label>
      <label class="field"><span>Assigned to</span><select data-change="reportFilter" data-k="person">${opt('', 'Everyone', f.person)}${people.map((p) => opt(p.id, p.name, f.person)).join('')}</select></label>
      <label class="field"><span>Status</span><select data-change="reportFilter" data-k="status">${opt('', 'Any status', f.status)}${Object.entries(STATUS_LABEL).map(([k, l]) => opt(k, l, f.status)).join('')}${opt('late', 'Late', f.status)}</select></label>
      <label class="field"><span>Assigned from</span><input type="date" value="${esc(f.from)}" data-change="reportFilter" data-k="from"></label>
      <label class="field"><span>Assigned to date</span><input type="date" value="${esc(f.to)}" data-change="reportFilter" data-k="to"></label>
    </div>
    <div class="stats">
      <div class="stat"><span>Assigned</span><b>${rows.length}</b></div>
      <div class="stat"><span>In progress</span><b>${count('progress') + count('notStarted')}</b></div>
      <div class="stat"><span>Waiting for check</span><b>${count('checking')}</b></div>
      <div class="stat"><span>Completed</span><b>${count('done')}</b></div>
      <div class="stat"><span>Late</span><b>${rows.filter((r) => r.late).length}</b></div>
    </div>
    ${rows.length ? `<div class="grid-wrap flat"><table class="grid report"><thead><tr><th>Task</th><th>Plan</th><th>Assigned to</th><th>Assigned on</th><th>Submitted for review</th><th>Completed on</th><th>Days</th><th>Status</th></tr></thead><tbody>
      ${rows.map((r) => `<tr><td class="c-title">${healthDot(r.t)}<button class="link-btn" data-open-task="${esc(r.t.id)}">${esc(r.t.title || 'Untitled task')}</button></td>
        <td class="muted">${esc(planById(r.t.planId)?.name || '')}</td><td>${avatar(person(r.to), 22)} ${esc(person(r.to)?.name || 'Unknown')}</td>
        <td>${shortDate(r.assignedAt)}</td><td>${shortDate(r.submittedAt)}</td><td>${shortDate(r.completedAt)}</td><td>${r.days ?? '<span class="muted">–</span>'}</td>
        <td><span class="pill pill-${r.status}">${esc(STATUS_LABEL[r.status])}</span>${r.late ? ' <span class="pill pill-late">Late</span>' : ''}</td></tr>`).join('')}
    </tbody></table></div>`
      : `<div class="empty"><h2>No assignments yet</h2></div>`}
  </div>`;
}
function reportCSV() {
  const cell = (v) => { let s = String(v ?? ''); if (/^[=+\-@\t]/.test(s)) s = `'${s}`; return `"${s.replace(/"/g, '""')}"`; };
  const dt = (ms) => (ms ? `${toISO(new Date(ms))} ${pad(new Date(ms).getHours())}:${pad(new Date(ms).getMinutes())}` : '');
  const head = ['Task', 'Plan', 'Assigned by', 'Assigned to', 'Assigned on', 'Submitted for review', 'Completed on', 'Days to complete', 'Due date', 'Status', 'Late', 'Traffic light', 'Recovery plan / support needed'];
  const rows = filteredReport().map((r) => [r.t.title, planById(r.t.planId)?.name, person(r.by)?.name, person(r.to)?.name, dt(r.assignedAt), dt(r.submittedAt), dt(r.completedAt), r.days ?? '', r.t.due || '', STATUS_LABEL[r.status], r.late ? 'Yes' : 'No', healthText(r.t.health), r.t.healthNote || '']);
  return '﻿' + [head, ...rows].map((r) => r.map(cell).join(',')).join('\r\n');
}
