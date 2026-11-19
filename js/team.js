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
  'estimate', 'workType', 'health', 'healthNote', 'decision', 'urgency', 'checkAlerts', 'decisionReq', 'subBy', 'changeReq', 'approvalReq', 'approval', 'bookRec', 'reviewResult', 'reqs', 'informed'];
const LIST_FIELDS = ['comments', 'history'];
const PLAN_FIELDS = ['name', 'color', 'labels', 'buckets', 'members', 'created', 'owner', 'labelOrder', 'labelColors'];
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
  bookRec: (e) => `recommended a book to ${nameOf(e.to)}`,
  approvalDone: (e) => `${e.value === 'approved' ? 'approved' : 'rejected'} the approval request`,
  informed: (e) => `let ${nameOf(e.to)} know`,
  changeReq: (e) => `asked ${nameOf(e.to)} to change ${e.text}`, changeOk: () => 'approved the change', changeNo: () => 'declined the change',
};
const nameOf = (id) => (id === S.meId ? 'you' : person(id)?.name || 'someone');

// ---------- Checking workflow ----------
const reviewerOf = (t) => t.assignedBy || null;
/** True when ticking this task should submit it for checking rather than complete it. */
const needsReview = (t) => !!t.assignedBy && t.assignedBy !== S.meId;
/** You delegated this and aren't doing it yourself: progress and traffic light are the delegatee's to set. */
const delegatorOnly = (t) => !!t && !!t.assignedBy && isMeId(t.assignedBy) && t.assignees.length > 0 && !t.assignees.some((a) => isMeId(a));
const doerNames = (t) => t.assignees.map((a) => person(a)?.name || 'They').join(', ');
function lockedNote(t, what) { toast(`${doerNames(t)} updates the ${what}.`, { keep: true }); }
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
  // Sent back by the checker: the submitter sees it (with the comment) in Pending Checking until they close it.
  if (reviewerOf(t) === S.meId) t.reviewResult = { status: 'returned', by: S.meId, for: t.review.by, at: Date.now(), note: note || '' };
  t.review = null;
  leaveChecking(t);
  addEvent(t, reviewerOf(t) === S.meId ? 'returned' : 'withdrawn', note ? { note } : {});
  if (note) t.comments.push({ id: uid(), author: S.meId, text: note, at: Date.now() });
}
/** Called by setProgress when a task is completed. */
function onCompleted(t) {
  if (t.review && reviewerOf(t) === S.meId) t.reviewResult = { status: 'approved', by: S.meId, for: t.review.by, at: Date.now(), note: '' };
  if (t.review) { t.review = null; leaveChecking(t); }
  addEvent(t, 'completed');
}

// ---------- Person plans ----------
const personPlanById = (id) => S.personPlans.find((p) => p.id === id);
// Also tasks someone else gave this person and told you about (you're their manager).
const personPlanTasks = (pp) => S.tasks.filter((t) => t.assignees.includes(pp.personId) && (t.assignedBy === S.meId || t.subBy?.[pp.personId] === S.meId || (t.informed || []).some(isMeId)));
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

  // Told about a task given to someone in your team: it shows under Delegate To › that person.
  S.tasks.forEach((t) => { if ((t.informed || []).some(isMeId)) t.assignees.forEach((a) => { if (!isMeId(a)) { const pp = ensurePersonPlan(a); if (pp) created.push(pp); } }); });
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
      S.people.push({ id: p.id, name: String(p.name || 'Teammate'), email, color: p.color || PERSON_COLORS[S.people.length % PERSON_COLORS.length], ...(okPhoto(p.photo) ? { photo: p.photo } : {}) });
    } else if (p.id === owner.id && p.id !== S.meId) {
      local.name = String(p.name || local.name);
      local.email = email || local.email;
      if (typeof p.style === 'string') local.style = p.style;
      if (okPhoto(p.photo)) local.photo = p.photo; else if (p.photo === null || p.photo === '') delete local.photo;
    }
    if (!local && p.id === owner.id && typeof p.style === 'string') { const added = person(p.id); if (added) added.style = p.style; }
  }
}
/** May this device keep a teammate's task? Yes in your own plans, when you're on the task (or were told about it),
    or when it belongs to someone below you in the Org Chart (a manager sees their team's work, not the other way round). */
function teamTaskVisible(t) {
  if (typeof hierarchyOn !== 'function' || !hierarchyOn()) return true;
  const owner = planById(t.planId)?.owner;
  if (!owner || isMeId(owner)) return true;
  const ids = [...(t.assignees || []), ...(t.informed || []), t.assignedBy, ...(t.history || []).flatMap((e) => [e.by, e.to]), ...(t.comments || []).map((c) => c.author)].filter(Boolean);
  if (ids.some(isMeId)) return true;
  return isAbove(S.meId, owner);
}
function mergeRecord(kind, r, notices) {
  const list = kind === 'plan' ? S.plans : S.tasks;
  const fields = kind === 'plan' ? PLAN_FIELDS : TASK_FIELDS;
  if (!r || typeof r.id !== 'string') return false;
  const tomb = S.sync.tombstones[r.id];
  if (tomb && tomb[0] >= maxStamp(r)) return false;
  if (kind === 'task' && !planById(r.planId)) return false;
  // Someone else's tasks reach you only when you're on them, or they're from someone below you in the Org Chart.
  if (kind === 'task' && !teamTaskVisible(r)) {
    const i = S.tasks.findIndex((x) => x.id === r.id && x.shared);
    if (i < 0) return false;
    S.tasks.splice(i, 1);
    delete S.sync.shadow[r.id];
    delete S.sync.seenAssignees[r.id];
    return true;
  }
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
    else if (e.type === 'informed' && isMeId(e.to)) out.push({ kind: 'assigned', text: `${who} gave ${t.assignees.map((a) => person(a)?.name).filter(Boolean).join(', ') || 'your team'} “${t.title}”`, note: 'For your information: it’s under Delegate To.' });
    else if (e.type === 'returned' && t.assignees.includes(S.meId)) out.push({ kind: 'returned', text: `${who} sent back “${t.title}”`, note: e.note });
    else if (e.type === 'completed' && t.assignees.includes(S.meId)) out.push({ kind: 'completed', text: `${who} approved “${t.title}”` });
    else if (e.type === 'decision' && e.to === S.meId && t.decisionReq?.status === 'pending') out.push({ kind: 'review', text: `${who} sent you a decision request: “${t.title}”` });
    else if (e.type === 'decided' && t.decisionReq?.by === S.meId) out.push({ kind: e.value === 'approved' ? 'completed' : 'returned', text: `${who} ${e.value === 'approved' ? 'approved' : 'rejected'} your decision request “${t.title}”`, note: e.note });
    else if (e.type === 'bookRec' && isMeId(e.to) && t.bookRec) out.push({ kind: 'review', text: `${who} recommended a book: “${t.bookRec.title}”`, note: t.bookRec.note });
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
    delete o.fromBucketId;
    delete o.fromOrder;
    delete o.tbRank;
    delete o.tbSessions;
    delete o.tbQueuedAt;
    delete o.fitAct;
    delete o.dailyPlan;
    delete o.fitDay;
    delete o.growBook;
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
  return { app: FILE_APP, v: 1, device: deviceId, person: { ...people.find((p) => p.id === S.meId), style: currentStyle().id }, people, plans, tasks, tombstones: S.sync.tombstones, stplans: stPlans().map(stWire), org: orgWire() };
}

// ---------- Notifications ----------
function notify(n) {
  S.inbox.unshift(n);
  S.inbox = S.inbox.slice(0, 200);
  try {
    if ('Notification' in window && Notification.permission === 'granted') {
      const sys = new Notification('Planner', { body: n.note ? `${n.text}: ${n.note}` : n.text, tag: n.id, icon: 'icons/panpan/panpan.png' });
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
    Dbx.servedByOwn().then((yes) => { this.ownHere = yes; }).catch(() => {});
    try { this.dir = await Store.tx('kv', 'readonly', (s) => s.get('teamDir')); } catch { this.dir = null; }
    // Coming back from Dropbox sign-in: finish it before anything else.
    let auth = null;
    try { auth = await Dbx.finishRedirect(); } catch (err) { toast(err.message, { error: true }); }
    if (auth === 'leaving') return;
    if (auth) { await this.useDropbox(auth, this.dir?.virtual === 'dropbox' ? this.dir : null); return; }
    if (this.dir && this.dir.virtual === 'dropbox') {
      const rec = this.dir;
      this.dir = new DropboxDir(new DbxClient(rec.auth), rec.path, rec.name);
      this.start();
      return;
    }
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
  /** Signs in to Dropbox and syncs through a Dropbox folder shared with the team. */
  async connectDropbox() {
    const me = person(S.meId);
    if (!me.email) { toast('Add your email in Settings first, so teammates can assign tasks to you.', { error: true }); return; }
    if (!Dbx.configured()) { toast('Paste the Dropbox app key first (see cloud/DROPBOX.md).', { error: true }); return; }
    let auth;
    try { auth = await Dbx.signIn(); } catch (err) { toast(err.message, { error: true }); return; }
    if (auth) await this.useDropbox(auth, null);
  },
  /** Signs in to your own Planner Sync server with its address and the team code. */
  async connectOwn(server, teamCode, { rec = null } = {}) {
    const me = person(S.meId);
    if (!me.email) { toast('Add your email in Settings first, so teammates can assign tasks to you.', { error: true }); return; }
    server = Dbx.normServer(server);
    if (!server) { toast('Enter the server address.', { error: true }); return; }
    let auth;
    try { auth = await Dbx.ownSignIn(server, teamCode, me.email); } catch (err) { toast(err.message, { error: true }); return; }
    // One shared team folder on your own server, so nobody has to pick one.
    if (!rec) {
      const client = new DbxClient(auth);
      try { await client.createFolder('/Team'); } catch (err) { toast(err.message, { error: true }); return; }
      rec = { path: '/Team', name: 'Team' };
    }
    await this.useDropbox(auth, rec, true);
  },
  /** After sign-in: keep the folder already chosen (signing in again), or ask which one to use. */
  async useDropbox(auth, rec, fresh = false) {
    const client = new DbxClient(auth);
    let path = rec?.path, name = rec?.name;
    if (!path) {
      const pick = await dropboxFolderDlg(client);
      if (!pick) return;
      ({ path, name } = pick);
    }
    let email = '';
    try { email = (await client.account())?.email || ''; } catch { /* shown without it */ }
    const keep = { virtual: 'dropbox', path, name, email, auth: { refresh: auth.refresh, account: auth.account, server: auth.server || '' } };
    await Store.tx('kv', 'readwrite', (s) => s.put(keep, 'teamDir'));
    this.dir = new DropboxDir(client, path, name);
    this.dropboxEmail = email;
    S.sync.folderName = auth.server ? `Team server: ${auth.server.replace(/^https?:\/\//, '')}` : `Dropbox: ${name}`;
    if (!S.sync.connectedAt) S.sync.connectedAt = Date.now();
    S.tasks.forEach((t) => { if (t.assignees.some((a) => a !== S.meId) || (t.assignedBy && t.assignedBy !== S.meId)) t.shared = true; });
    commit();
    this.start();
    refreshSettings?.();
    if (auth.server) toast(fresh && !rec?.again ? 'Connected to your team server. Teammates who connect with the same address and code will see shared tasks.' : 'Team server reconnected.');
    else toast(rec ? 'Dropbox reconnected.' : `Connected to Dropbox folder “${name}”. Teammates who choose the same shared folder will see shared tasks.`);
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
    if (this.dir.virtual === 'dropbox' && this.dir.client.own) {
      const code = await promptDlg('Sign in to the team server', 'Team code', '', 'Sign in');
      if (code) await this.connectOwn(this.dir.client.auth.server, code, { rec: { path: this.dir.path, name: this.dir.name, again: true } });
      return;
    }
    if (this.dir.virtual === 'dropbox') {
      let auth;
      try { auth = await Dbx.signIn(); } catch (err) { toast(err.message, { error: true }); return; }
      if (auth) await this.useDropbox(auth, { path: this.dir.path, name: this.dir.name });
      return;
    }
    const perm = await this.dir.requestPermission({ mode: 'readwrite' }).catch(() => 'denied');
    if (perm === 'granted') this.start(); else toast('Planner needs permission to the team folder to sync.', { error: true });
  },
  async disconnect() {
    clearInterval(this.timer);
    DbxWatch.stop();
    Presence.stop();
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
    // Dropbox says straight away when a teammate's file changes, so there is no 20-second wait.
    if (this.dir.virtual === 'dropbox') DbxWatch.start(this.dir, () => { clearTimeout(this.watchTimer); this.watchTimer = setTimeout(() => this.sync(), 400); });
    Presence.start();
  },
  /** Called after each local save: push soon, so a teammate sees the change quickly. */
  schedulePush() {
    if (this.busy || !['ok', 'error', 'offline'].includes(this.state)) return;
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
        // Dropbox files report their version without downloading; folder files are opened as usual.
        const file = handle.peek ? handle.peek() : await handle.getFile();
        // The suffix changes when teammate files gain new parts (bp: the H1 / H2 Plan), so each file is read again once.
        const stamp = `${file.lastModified}:${file.size}${file.rev ? `:${file.rev}` : ''}:st`;
        if (S.sync.files[name] === stamp) continue;
        try {
          const text = handle.peek ? await (await handle.getFile()).text() : await file.text();
          if (mergeTeamFile(JSON.parse(text))) changed = true;
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
      await Presence.read().catch((err) => console.warn('Presence read failed', err));
      await Store.flush();
      if (changed && !document.activeElement?.closest?.('dialog, .pop')) render();
      else renderSidebar();
      updateBell();
      this.setState('ok');
    } catch (err) {
      console.error('Team sync failed', err);
      this.setState(err.name === 'NotAllowedError' || err.name === 'SecurityError' ? 'permission' : err.name === 'NetworkError' || !navigator.onLine ? 'offline' : 'error', err.message);
    } finally {
      this.busy = false;
    }
  },
  async filesDir() { return this.dir.getDirectoryHandle('files', { create: true }); },
  /** Copies attachments of shared tasks into the folder, once each. */
  async pushFiles() {
    const ids = [...S.tasks.filter((t) => t.shared).flatMap((t) => allFiles(t).filter((a) => a.kind === 'file').map((a) => a.id)), ...(typeof mcAll === 'function' ? mcAll().flatMap((m) => (m.files || []).map((f) => f.id)) : [])].filter((id) => !this.sentFiles.has(id));
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
    const ids = [...S.tasks.filter((t) => t.shared).flatMap((t) => allFiles(t).filter((a) => a.kind === 'file').map((a) => a.id)), ...(typeof mcAll === 'function' ? mcAll().flatMap((m) => (m.files || []).map((f) => f.id)) : [])].filter((id) => !this.haveFiles.has(id));
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
    if (this.state === 'permission') return { text: this.dir?.client?.own ? 'Team server: click to sign in again' : this.dir?.virtual === 'dropbox' ? 'Dropbox: click to sign in again' : 'Team folder: click to reconnect', cls: 'error', act: 'teamReconnect' };
    if (this.state === 'offline') return { text: 'Offline · saved, will sync when online', cls: 'offline', act: 'openSettings' };
    if (this.state === 'error') return { text: 'Team sync problem · retrying', cls: 'error', act: 'openSettings' };
    const ago = S.sync.lastSync ? Math.round((Date.now() - S.sync.lastSync) / 60000) : null;
    const when = ago === null ? 'not yet' : ago < 1 ? 'just now' : `${ago} min ago`;
    return { text: navigator.onLine ? `Synced with team ${when}` : 'Offline · saved, will sync when online', cls: navigator.onLine ? '' : 'offline', act: 'openSettings' };
  },
};

function teamSettingsHTML() {
  const me = person(S.meId);
  const members = Object.keys(S.sync.files).length;
  const dbx = Team.dir?.virtual === 'dropbox';
  const who = `
    <div class="task-fields two">
      <label class="field"><span>Your name</span><input value="${esc(me.name)}" data-change="personName" data-id="${esc(me.id)}"></label>
      <label class="field"><span>Your email</span><input type="email" value="${esc(me.email || '')}" placeholder="name@company.com" data-change="personEmail" data-id="${esc(me.id)}"></label>
    </div>`;
  const notif = 'Notification' in window && Notification.permission === 'default' ? `<button class="btn ghost sm" data-act="enableNotifications">Turn on desktop notifications</button>` : '';
  if (Team.dir) {
    const own = dbx && Team.dir.client.own;
    const where = own ? `Team server: <b>${esc(Team.dir.client.auth.server)}</b>` : dbx ? `Dropbox folder: <b>${esc(Team.dir.path)}</b>${Team.dropboxEmail ? ` <span class="muted">(${esc(Team.dropboxEmail)})</span>` : ''}` : `Folder: <b>${esc(S.sync.folderName || Team.dir.name)}</b>`;
    return `${who}
      <p class="small">${where} · ${members} teammate file${members === 1 ? '' : 's'} found${dbx ? ' · changes arrive within seconds' : ''}<br><span class="muted">Last synced: ${S.sync.lastSync ? esc(fmtDateTime(S.sync.lastSync)) : 'not yet'}${Team.error ? ` · ${esc(Team.error)}` : ''}</span></p>
      <div class="row">${Team.state === 'permission' ? `<button class="btn primary sm" data-act="teamReconnect">${own ? 'Sign in again' : dbx ? 'Sign in to Dropbox again' : 'Reconnect'}</button>` : `<button class="btn primary sm" data-act="teamSyncNow">Sync now</button>`}
      <button class="btn ghost sm" data-act="teamDisconnect">Disconnect</button></div>${notif}`;
  }
  const key = Dbx.cfg().appKey;
  const here = Team.ownHere ? location.origin : '';
  return `${who}
    <p class="small"><b>Your team server (recommended).</b> Your own Dropbox-style sync: one computer runs Planner Sync (see <b>sync-server/README.md</b>) and everyone connects with its address and the team code. Changes arrive within seconds, and you see when someone else has the same task open.</p>
    <form class="stack" data-submit="ownConnect">
      <div class="task-fields two">
        <label class="field"><span>Server address</span><input name="server" required value="${esc(here || S.settings.ownServer || '')}" placeholder="192.168.1.20:8840" autocomplete="off" inputmode="url"></label>
        <label class="field"><span>Team code</span><input name="code" required placeholder="ABCD-1234-EF56" autocomplete="off" autocapitalize="characters"></label>
      </div>
      <div class="row"><button class="btn primary sm">Connect</button></div>
    </form>
    <details class="small"><summary>Other ways</summary><div class="row">
      ${key ? `<button class="btn ghost sm" data-act="dropboxConnect">Dropbox…</button><button class="btn ghost xs" data-act="dropboxKey">Change Dropbox app key</button>` : ''}
      ${Team.supported ? `<button class="btn ghost sm" data-act="teamConnect">Folder on this computer…</button>` : ''}
      <button class="btn ghost sm" data-act="teamDevice">Test folder on this device</button></div>
      ${key ? '' : `<form class="row" data-submit="dropboxKey"><input name="key" required placeholder="Dropbox app key (cloud/DROPBOX.md)" autocomplete="off" aria-label="Dropbox app key" style="flex:1"><button class="btn ghost sm">Save</button></form>`}
      ${Team.supported ? '<p class="muted small">A folder on this computer works with any service that syncs it. OneDrive folders often hold back files that aren’t downloaded yet, so use the team server if sync stalls.</p>' : ''}</details>
    ${notif}`;
}

/** Lists the folders in someone's Dropbox (shared ones included) and resolves to { path, name }. */
function dropboxFolderDlg(client) {
  return new Promise((resolve) => {
    let result = null;
    const d = showDialog({
      title: 'Choose the team folder in Dropbox',
      html: `<p class="small">Pick the folder your team shares. If a colleague shared it with you, add it to your Dropbox first (Dropbox: Shared › Add).</p>
        <ul class="dbx-folders"><li class="muted small">Loading your Dropbox…</li></ul>
        <form class="row" data-role="new"><input name="name" placeholder="Or create a new folder, e.g. OMI Planner Team" autocomplete="off" aria-label="New folder name" style="flex:1"><button class="btn ghost sm">Create</button></form>
        <div class="dlg-foot"><button class="btn ghost" type="button" data-role="no">Cancel</button></div>`,
      onClose: () => resolve(result),
    });
    const list = $('.dbx-folders', d);
    const choose = (path, name) => { result = { path, name }; d.close(); };
    client.list('').then((entries) => {
      const dirs = entries.filter((e) => e['.tag'] === 'folder').sort((a, b) => a.name.localeCompare(b.name));
      list.innerHTML = dirs.length ? dirs.map((e) => `<li><button class="btn ghost sm dbx-pick" type="button" data-path="${esc(e.path_display)}" data-name="${esc(e.name)}">${icon('folder', 14)} ${esc(e.name)}${e.shared_folder_id || e.sharing_info ? ' <small class="muted">shared</small>' : ''}</button></li>`).join('') : '<li class="muted small">No folders yet. Create one below.</li>';
      $$('.dbx-pick', list).forEach((b) => { b.onclick = () => choose(b.dataset.path, b.dataset.name); });
    }).catch((err) => { list.innerHTML = `<li class="danger-text small">${esc(err.message)}</li>`; });
    $('[data-role=no]', d).onclick = () => d.close();
    $('[data-role=new]', d).onsubmit = async (e) => {
      e.preventDefault();
      const name = String(new FormData(e.target).get('name') || '').trim().replace(/[\\/:*?"<>|]/g, '-');
      if (!name) return;
      try { await client.createFolder(`/${name}`); choose(`/${name}`, name); } catch (err) { toast(err.message, { error: true }); }
    };
  });
}

// ---------- Presence: who else has this task open ----------
/* Each device writes presence/<person>-<device>.json in the team folder saying which shared task is
   open, refreshed every 30 seconds. When two people have the same task open, both are told (a
   notice and a bar at the top of the task) so they don't overwrite each other. */
const Presence = {
  others: {}, stamps: {}, seen: new Set(), mine: undefined, lastWrite: 0, timer: null, busy: false,
  TTL: 90000,
  fileName() { return `${S.meId}-${deviceId}.json`; },
  openShared() { const t = ui.openTask && taskById(ui.openTask); return t && t.shared ? t.id : null; },
  start() {
    clearInterval(this.timer);
    this.timer = setInterval(() => this.tick(), 4000);
    if (!this.bound) {
      this.bound = true;
      // Closing or hiding Planner frees the task straight away.
      addEventListener('pagehide', () => { if (Team.dir && this.mine) this.write(null, true); });
      document.addEventListener('visibilitychange', () => { if (Team.dir) this.tick(true); });
    }
  },
  stop() { clearInterval(this.timer); this.others = {}; this.mine = undefined; this.update(); },
  async dir() { return Team.dir.getDirectoryHandle('presence', { create: true }); },
  async write(taskId, keepalive = false) {
    this.mine = taskId;
    this.lastWrite = Date.now();
    const me = person(S.meId);
    const body = JSON.stringify({ app: FILE_APP, person: S.meId, email: me?.email || '', name: me?.name || '', device: deviceId, taskId, at: Date.now() });
    const out = await (await (await this.dir()).getFileHandle(this.fileName(), { create: true })).createWritable({ keepalive });
    await out.write(body);
    await out.close();
  },
  /** Every few seconds: say which task is open (when it changes, or to stay fresh) and read teammates'. */
  async tick(force = false) {
    if (!Team.dir || this.busy || !['ok', 'error', 'offline'].includes(Team.state)) return;
    this.busy = true;
    try {
      const open = document.visibilityState === 'visible' ? this.openShared() : null;
      if (open !== this.mine || (open && Date.now() - this.lastWrite > 30000) || (force && open)) await this.write(open);
      if (open) await this.read();
      else if (Object.keys(this.others).length) this.update();
    } catch (err) {
      console.warn('Presence update failed', err);
    } finally { this.busy = false; }
  },
  async read() {
    if (!Team.dir) return;
    const dir = await this.dir();
    const live = new Set();
    for await (const [name, handle] of dir.entries()) {
      if (handle.kind !== 'file' || !name.endsWith('.json') || name === this.fileName()) continue;
      live.add(name);
      const info = handle.peek ? handle.peek() : await handle.getFile();
      const stamp = `${info.lastModified}:${info.size}:${info.rev || ''}`;
      if (this.stamps[name] === stamp && this.others[name]) continue;
      try {
        const text = handle.peek ? await (await handle.getFile()).text() : await info.text();
        const p = JSON.parse(text);
        // Their clock may differ from ours; the file's own time is the fallback.
        p.seenAt = Date.now();
        this.others[name] = p;
        this.stamps[name] = stamp;
      } catch { /* half-written; next time */ }
    }
    Object.keys(this.others).forEach((n) => { if (!live.has(n)) delete this.others[n]; });
    this.update();
  },
  /** Other people (not you on another device) who have this task open right now. */
  viewers(taskId) {
    if (!taskId) return [];
    const now = Date.now(), out = new Map();
    for (const p of Object.values(this.others)) {
      if (p.taskId !== taskId || p.person === S.meId) continue;
      if (now - p.seenAt > this.TTL && now - p.at > this.TTL) continue;
      const known = S.people.find((x) => x.id === p.person || (p.email && x.email && x.email.toLowerCase() === p.email.toLowerCase()));
      out.set(p.person, known?.name || p.name || 'A teammate');
    }
    return [...out.entries()].map(([id, name]) => ({ id, name }));
  },
  update() {
    const id = this.openShared();
    const v = this.viewers(id);
    v.forEach((p) => {
      const k = `${id}:${p.id}`;
      if (this.seen.has(k)) return;
      this.seen.add(k);
      toast(`${p.name} also has this task open. Changes you both make merge; if you both edit the same box, the later one wins.`);
    });
    // Forget people who closed it, so reopening tells you again.
    [...this.seen].forEach((k) => { const [tid, pid] = k.split(':'); if (tid !== id || !v.some((p) => p.id === pid)) this.seen.delete(k); });
    const slot = $('#taskDialog [data-presence]');
    if (slot) slot.outerHTML = presenceHTML(id ? taskById(id) : null);
  },
};
function presenceHTML(t) {
  const v = t && t.shared ? Presence.viewers(t.id) : [];
  if (!v.length) return '<div data-presence hidden></div>';
  const names = v.map((p) => p.name);
  const who = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  return `<div class="presence-bar" data-presence role="status"><span class="presence-dots">${v.map((p) => avatar(person(p.id) || { name: p.name }, 20)).join('')}</span><span><b>${esc(who)}</b> ${names.length === 1 ? 'is' : 'are'} also viewing this task</span></div>`;
}

// ---------- Task panel parts ----------
function workflowHTML(t) {
  const reviewer = reviewerOf(t);
  const lines = [];
  if (t.assignedBy && t.assignees.some((a) => a !== t.assignedBy)) {
    lines.push(`<span class="muted small">Delegated by ${esc(nameOf(t.assignedBy))}${t.assignedAt ? ` on ${esc(fmtDateTime(t.assignedAt))}` : ''}</span>`);
  }
  const onIt = t.assignees.some(isMeId);
  if (!onIt && (t.informed || []).some(isMeId)) lines.push(`<span class="muted small">${esc(nameOf(t.assignedBy))} let you know about this. You can follow it and comment; ${esc(doerNames(t))} does the work.</span>`);
  let action = '';
  if (t.review && isReviewer(t)) {
    action = `<div class="review-box"><p><b>${esc(person(t.review.by)?.name || 'A teammate')}</b> submitted this for checking on ${esc(fmtDateTime(t.review.at))}.</p>
      <div class="row"><button class="btn primary sm" data-act="approveTask" data-id="${esc(t.id)}">${icon('check', 14)} Approve and complete</button><button class="btn ghost sm" data-act="sendBack" data-id="${esc(t.id)}">Send back</button></div></div>`;
  } else if (t.review && onIt) {
    action = `<div class="review-box"><p>Waiting for <b>${esc(nameOf(reviewer))}</b> to check. Submitted ${esc(fmtDateTime(t.review.at))}.</p>
      <div class="row"><button class="btn ghost sm" data-act="withdrawReview" data-id="${esc(t.id)}">Withdraw</button></div></div>`;
  } else if (needsReview(t) && !isDone(t) && onIt) {
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
  const tab = 'board';
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
      <span class="muted small">Tasks you assigned to ${esc(who?.name || 'this person')}, and tasks others gave them and told you about</span>
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
    ${rows.length ? `<div class="grid-wrap flat"><table class="grid report"><thead><tr><th>Task</th><th>Plan</th><th>Assigned to</th><th>Assigned on</th><th>Submitted for review</th><th>Completed on</th><th>Days</th><th>Progress</th><th>Status</th></tr></thead><tbody>
      ${rows.map((r) => `<tr><td class="c-title">${healthDot(r.t)}<button class="link-btn" data-open-task="${esc(r.t.id)}">${esc(r.t.title || 'Untitled task')}</button></td>
        <td class="muted">${esc(planById(r.t.planId)?.name || '')}</td><td>${avatar(person(r.to), 22)} ${esc(person(r.to)?.name || 'Unknown')}</td>
        <td>${shortDate(r.assignedAt)}</td><td>${shortDate(r.submittedAt)}</td><td>${shortDate(r.completedAt)}</td><td>${r.days ?? '<span class="muted">–</span>'}</td>
        <td class="c-progress">${(() => { const v = r.status === 'done' ? 100 : r.t.progress || 0; return `<span class="rep-bar ${v === 100 ? 'done' : ''}" role="img" aria-label="${v}% done"><span><i style="width:${v}%"></i></span><b>${v}%</b></span>`; })()}</td>
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

// ---------- Skipping a level: let their manager know ----------
// Giving a task to someone who reports to another person (Ven → Albus, who reports to Ray) asks whether to tell Ray.
// If yes, Ray gets a notification and the task shows in his planner under Delegate To › Albus.
const setDelegateBase = setDelegate;
setDelegate = function setDelegateAndAsk(t, id, on) {
  const was = t.assignees.includes(id);
  const ok = setDelegateBase(t, id, on);
  if (ok && on && !was) setTimeout(() => askInformManager(t, id), 0);
  return ok;
};
async function askInformManager(t, id) {
  if (typeof managerOf !== 'function') return;
  const mk = managerOf(id);
  const m = mk && personByKey(mk);
  const who = person(id);
  if (!m || !who || isMeId(m.id) || isMeId(mk)) return;
  if ((t.informed || []).some((x) => pkey(x) === mk) || pkey(t.assignedBy || '') === mk || t.assignees.some((a) => pkey(a) === mk)) return;
  if (!await confirmDlg(`Let ${m.name} know?`, `${who.name} reports to ${m.name}. ${m.name} will get a notification and see this task in their planner under Delegate To › ${who.name}.`, `Let ${m.name} know`, false)) return;
  t.informed = [...new Set([...(t.informed || []), m.id])];
  t.shared = true;
  addEvent(t, 'informed', { to: m.id });
  commit();
  toast(`${m.name} will see “${t.title || 'this task'}”.`);
}

// ---------- Clashing changes: ask the person higher in the Org Chart ----------
// Every change to a task now remembers which version its author was looking at (_p). When a change arrives that
// was made without seeing someone else's change to the same part of the task (both edited it, e.g. one offline),
// or a task is deleted by one person while another was still changing it, the clash is recorded. The person higher
// in the Org Chart of the two chooses which to keep; until then the later change stays. If neither is above the
// other, the later change stays and the person whose change was replaced is told.
const CF_LABEL = { title: 'Task name', notes: 'Details', progress: 'Progress', priority: 'Priority', start: 'Start date', due: 'Due date', bucketId: 'Bucket', assignees: 'Delegated to', labels: 'Labels', checklist: 'Check List', reqs: 'Task Requirement', planId: 'Plan', repeat: 'Repeat' };
const cfSame = (a, b) => !!a && !!b && a[0] === b[0] && String(a[1]) === String(b[1]);
const cfSawOlder = (w, wPrev, o) => wPrev !== undefined && (cfSame(wPrev, o) || (wPrev && newer(wPrev, o)));
/** The latest version of each task this device has seen, so a deletion can say what its author knew. */
const cfMax = new Map();
const cfList = () => (S.sync.conflicts = Array.isArray(S.sync.conflicts) ? S.sync.conflicts : []);
const cfLastEditor = (rec) => { let best = null; for (const v of Object.values(rec?._v || {})) if (!best || newer(v, best)) best = v; return best ? best[1] : null; };
/** Who settles a clash between two people: the one above the other, else the owner of the plan if one of them, else nobody. */
function cfDecider(a, b, planId) {
  if (!a || !b || pkey(a) === pkey(b)) return null;
  if (typeof hierarchyOn === 'function' && hierarchyOn()) {
    if (isAbove(a, b)) return a;
    if (isAbove(b, a)) return b;
  }
  const owner = planById(planId)?.owner;
  if (owner && pkey(owner) === pkey(a)) return a;
  if (owner && pkey(owner) === pkey(b)) return b;
  return null;
}
function cfAdd(c) {
  if (cfList().some((x) => x.key === c.key)) return;
  const decider = cfDecider(c.a.by, c.b.by, c.planId);
  const who = (id) => (isMeId(id) ? 'you' : person(id)?.name || 'Someone');
  const done = S.sync.cfDone || [];
  if (done.includes(c.key)) return;
  if (decider && !isMeId(decider)) {
    // Someone else decides: pass the clash on to them through your team file.
    S.sync.cfOut = (S.sync.cfOut || []).filter((x) => x.key !== c.key && Date.now() - (x.at || 0) < 30 * 864e5).concat({ ...c, at: Date.now() }).slice(-100);
    const lost = c.kind === 'delete' ? (isMeId(c.b.by) ? c.b : null) : c.b;
    if (lost && isMeId(lost.by)) notify({ id: uid(), at: Date.now(), read: false, kind: 'review', taskId: c.id, text: c.kind === 'delete' ? `${who(c.a.by)} deleted “${c.title}” while you were changing it` : `${who(c.a.by)} changed ${(CF_LABEL[c.f] || 'a part').toLowerCase()} of “${c.title}” at the same time as you`, note: `${person(decider)?.name || 'Your manager'} will choose which to keep.` });
    return;
  }
  if (decider && isMeId(decider)) {
    cfList().push({ ...c, at: Date.now() });
    notify({ id: uid(), at: Date.now(), read: false, kind: 'review', conflict: true, text: c.kind === 'delete' ? `“${c.title}” was deleted and changed at the same time` : `${who(c.a.by)} and ${who(c.b.by)} changed “${c.title}” at the same time`, note: 'Choose which to keep.' });
    setTimeout(() => cfPrompt(), 400);
  } else if (!decider) {
    const lost = c.kind === 'delete' ? null : c.b; // b is the change that was replaced
    if (lost && isMeId(lost.by)) notify({ id: uid(), at: Date.now(), read: false, kind: 'returned', taskId: c.id, text: `${who(c.a.by)} changed ${CF_LABEL[c.f] || 'a part'} of “${c.title}” at the same time as you; their change was kept`, note: `Yours was: ${cfShow(c.f, lost.val)}` });
  }
}
function cfShow(f, v) {
  if (v === null || v === undefined || v === '' || (Array.isArray(v) && !v.length)) return '(empty)';
  if (f === 'due' || f === 'start') return fmtDate(v);
  if (f === 'assignees') return v.map((a) => person(a)?.name || 'someone').join(', ');
  if (f === 'progress') return PROGRESS.find((p) => p.v === v)?.label || `${v}%`;
  if (f === 'priority') return PRIORITY.find((p) => p.v === v)?.label || String(v);
  if (f === 'bucketId') { for (const p of S.plans) { const b = p.buckets.find((x) => x.id === v); if (b) return b.name; } return 'another bucket'; }
  if (f === 'planId') return planById(v)?.name || 'another plan';
  if (f === 'checklist' || f === 'reqs') return `${v.length} item${v.length === 1 ? '' : 's'}: ${v.slice(0, 3).map((x) => `${x.done ? '✓ ' : ''}${x.text}`).join(', ')}${v.length > 3 ? '…' : ''}`;
  if (Array.isArray(v)) return `${v.length} item${v.length === 1 ? '' : 's'}`;
  return String(v).slice(0, 120);
}
// Remember, for each change you make, the version you were looking at.
addEventListener('DOMContentLoaded', () => {
  if (typeof stampAll === 'function') {
    const baseStamp = stampAll;
    stampAll = function stampAllWithBase(...a) {
      const before = new Map(S.tasks.map((t) => [t.id, { ...(t._v || {}) }]));
      S.tasks.forEach((t) => cfMax.set(t.id, maxStamp(t)));
      const tombs = new Set(Object.keys(S.sync.tombstones || {}));
      const r = baseStamp.apply(this, a);
      for (const t of S.tasks) {
        const old = before.get(t.id) || {};
        for (const f of TASK_FIELDS) {
          const v = t._v?.[f];
          if (v && !cfSame(old[f], v) && isMeId(v[1])) { t._p = t._p || {}; t._p[f] = old[f] || null; }
        }
      }
      for (const [id, st] of Object.entries(S.sync.tombstones || {})) {
        if (!tombs.has(id) && Array.isArray(st) && st.length === 2 && cfMax.has(id)) st.push(cfMax.get(id));
      }
      S.tasks.forEach((t) => cfMax.set(t.id, maxStamp(t)));
      return r;
    };
  }
  // Spot clashes in incoming tasks before the usual merge decides.
  const baseMergeRecord = mergeRecord;
  mergeRecord = function mergeRecordWithClash(kind, r, notices) {
    try { if (kind === 'task' && r && typeof r.id === 'string') cfCheckTask(r); } catch (err) { console.error(err); }
    const out = baseMergeRecord.call(this, kind, r, notices);
    // Fields taken from the teammate keep the teammate's note of what they were looking at.
    if (kind === 'task' && r && r._p) {
      const l = taskById(r.id);
      if (l) for (const f of TASK_FIELDS) if (cfSame(l._v?.[f], r._v?.[f]) && f in r._p) { l._p = l._p || {}; l._p[f] = r._p[f]; }
    }
    return out;
  };
  const baseMergeTeamFile = mergeTeamFile;
  mergeTeamFile = function mergeTeamFileWithClash(data, ...a) {
    try { cfCheckTombs(data); } catch (err) { console.error(err); }
    const out = baseMergeTeamFile.call(this, data, ...a);
    S.tasks.forEach((t) => cfMax.set(t.id, maxStamp(t)));
    // Clashes a teammate's phone spotted that you're the one to settle.
    try { for (const c of Array.isArray(data?.clashes) ? data.clashes : []) if (c && c.key && c.a && c.b && isMeId(cfDecider(c.a.by, c.b.by, c.planId))) cfAdd(c); } catch (err) { console.error(err); }
    return out;
  };
  const baseBuild = buildTeamFile;
  buildTeamFile = function buildTeamFileWithClash(...a) {
    const f = baseBuild.apply(this, a);
    const out = (S.sync.cfOut || []).filter((x) => Date.now() - (x.at || 0) < 30 * 864e5);
    if (out.length) f.clashes = out;
    return f;
  };
  const baseOpenNotice = openNotice;
  openNotice = function openNoticeWithClash(id) {
    const n = S.inbox.find((x) => x.id === id);
    if (n && n.conflict) { n.read = true; closePop(); Store.save(); cfPrompt(true); return; }
    return baseOpenNotice.call(this, id);
  };
  Object.assign(actions, {
    cfPick: (el) => cfResolve(el.dataset.key, el.dataset.pick),
  });
  setTimeout(() => { try { S.tasks.forEach((t) => cfMax.set(t.id, maxStamp(t))); } catch { /* not loaded yet */ } cfPrompt(); }, 1500);
});
/** A teammate's version of a task arrives: did its changes and ours cross without seeing each other? */
function cfCheckTask(r) {
  const l = taskById(r.id);
  const tomb = S.sync.tombstones[r.id];
  // You deleted it; they changed it after the version you saw.
  if (!l && tomb && isMeId(tomb[1]) && tomb[2] !== undefined && maxStamp(r) > tomb[2]) {
    const by = cfLastEditor(r);
    if (by && !isMeId(by)) cfAdd({ kind: 'delete', key: `del|${r.id}|${tomb[0]}|${maxStamp(r)}`, id: r.id, planId: r.planId, title: r.title || 'Untitled task', a: { by: tomb[1], at: tomb[0] }, b: { by, at: maxStamp(r) }, snap: clone(r), deletedNow: tomb[0] >= maxStamp(r) });
    return;
  }
  if (!l || !r._v) return;
  for (const f of TASK_FIELDS) {
    const rv = r._v[f]; const lv = l._v?.[f];
    if (!rv || !lv || cfSame(rv, lv) || String(rv[1]) === String(lv[1])) continue;
    if (fieldHash(r[f]) === fieldHash(l[f])) continue;
    const remoteWins = newer(rv, lv);
    const [w, wPrev, o] = remoteWins ? [rv, r._p?.[f], lv] : [lv, l._p?.[f], rv];
    if (wPrev === undefined || cfSawOlder(w, wPrev, o)) continue; // the later change was made knowing the earlier one
    const win = remoteWins ? { by: rv[1], at: rv[0], val: clone(r[f]) } : { by: lv[1], at: lv[0], val: clone(l[f]) };
    const lose = remoteWins ? { by: lv[1], at: lv[0], val: clone(l[f]) } : { by: rv[1], at: rv[0], val: clone(r[f]) };
    cfAdd({ kind: 'field', key: `f|${r.id}|${f}|${w[0]}|${o[0]}`, id: r.id, planId: l.planId, title: l.title || r.title || 'Untitled task', f, a: win, b: lose });
  }
}
/** A teammate deleted tasks: was anyone still changing them, after the version the deleter saw? */
function cfCheckTombs(data) {
  for (const [id, st] of Object.entries(data?.tombstones || {})) {
    if (!Array.isArray(st) || st[2] === undefined) continue;
    const local = taskById(id);
    if (!local || maxStamp(local) <= st[2]) continue;
    const by = cfLastEditor(local);
    if (!by || String(by) === String(st[1])) continue;
    cfAdd({ kind: 'delete', key: `del|${id}|${st[0]}|${maxStamp(local)}`, id, planId: local.planId, title: local.title || 'Untitled task', a: { by: st[1], at: st[0] }, b: { by, at: maxStamp(local) }, snap: clone(local), deletedNow: st[0] >= maxStamp(local) });
  }
}
function cfPrompt(force) {
  const list = cfList();
  if (!list.length) { if (force) toast('Nothing to decide: every clash has been settled.'); return; }
  if (!force && (document.querySelector('dialog[open]') || ui.cfShown)) return;
  ui.cfShown = true;
  const who = (id) => (isMeId(id) ? 'You' : person(id)?.name || 'Someone');
  const when = (t) => fmtDateTime(t);
  const row = (c) => c.kind === 'delete'
    ? `<li class="cf-item"><b>“${esc(c.title)}”</b><p class="small muted">${esc(who(c.a.by))} deleted it (${esc(when(c.a.at))}) while ${esc(who(c.b.by).toLowerCase() === 'you' ? 'you' : who(c.b.by))} was changing it (${esc(when(c.b.at))}).</p>
        <div class="cf-btns"><button class="btn sm" data-act="cfPick" data-key="${esc(c.key)}" data-pick="del">Keep it deleted</button><button class="btn primary sm" data-act="cfPick" data-key="${esc(c.key)}" data-pick="keep">Keep the task</button></div></li>`
    : `<li class="cf-item"><b>“${esc(c.title)}” · ${esc(CF_LABEL[c.f] || c.f)}</b>
        <div class="cf-btns"><button class="btn sm cf-opt" data-act="cfPick" data-key="${esc(c.key)}" data-pick="a"><small>${esc(who(c.a.by))} · ${esc(when(c.a.at))}</small><span>${esc(cfShow(c.f, c.a.val))}</span></button>
        <button class="btn sm cf-opt" data-act="cfPick" data-key="${esc(c.key)}" data-pick="b"><small>${esc(who(c.b.by))} · ${esc(when(c.b.at))}</small><span>${esc(cfShow(c.f, c.b.val))}</span></button></div></li>`;
  document.querySelector('dialog.cf-dlg')?.remove();
  showDialog({ title: 'Changes made at the same time', html: `<p class="small muted">These were changed by two people at the same time. You're higher in the Org Chart, so you choose which to keep. Until you do, the later change stays.</p><ul class="cf-list">${list.map(row).join('')}</ul>`, onClose: () => { ui.cfShown = false; } });
  document.querySelector('dialog[open]:last-of-type')?.classList.add('cf-dlg');
}
function cfResolve(key, pick) {
  const list = cfList();
  const c = list.find((x) => x.key === key);
  if (!c) return;
  S.sync.conflicts = list.filter((x) => x !== c);
  S.sync.cfDone = [...(S.sync.cfDone || []), c.key].slice(-300);
  if (c.kind === 'delete') {
    const t = taskById(c.id);
    if (pick === 'del') { if (t) { S.tasks = S.tasks.filter((x) => x !== t); } toast(`“${c.title}” stays deleted.`); }
    else if (!t && c.snap) {
      const back = clone(c.snap);
      delete back._v; delete back._p;
      delete S.sync.tombstones[c.id]; delete S.sync.shadow[c.id];
      back.shared = true;
      S.tasks.push(back);
      toast(`“${c.title}” is back.`);
    } else toast(`“${c.title}” is kept.`);
  } else {
    const t = taskById(c.id);
    const chosen = pick === 'a' ? c.a : c.b;
    if (t) { t[c.f] = clone(chosen.val); toast(`Kept ${isMeId(chosen.by) ? 'your' : `${person(chosen.by)?.name || 'their'}`} ${(CF_LABEL[c.f] || 'change').toLowerCase()} for “${c.title}”.`); }
  }
  commit();
  const dlg = document.querySelector('dialog.cf-dlg');
  if (dlg) { if (!cfList().length) dlg.querySelector('[data-act="closeDialog"]')?.click(); else { ui.cfShown = false; dlg.querySelector('[data-act="closeDialog"]')?.click(); setTimeout(() => cfPrompt(true), 50); } }
}
