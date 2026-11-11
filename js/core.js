'use strict';
/* Shared helpers, constants, the data model and on-device persistence. */

// ---------- DOM + text helpers ----------
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
const initials = (name) => (name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
const safeUrl = (u) => (/^(https?:|mailto:)/i.test(String(u || '').trim()) ? String(u).trim() : '');
const fmtSize = (n) => (n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1048576).toFixed(1)} MB`);

// ---------- Dates (always local 'YYYY-MM-DD' strings) ----------
const pad = (n) => String(n).padStart(2, '0');
const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseISO = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const todayISO = () => toISO(new Date());
const addDays = (iso, n) => { const d = parseISO(iso); d.setDate(d.getDate() + n); return toISO(d); };
const addMonths = (iso, n) => {
  const d = parseISO(iso);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, last));
  return toISO(d);
};
const weekStartOf = (iso) => addDays(iso, -((parseISO(iso).getDay() + 6) % 7)); // weeks start on Monday
const daysBetween = (a, b) => Math.round((parseISO(b) - parseISO(a)) / 86400000);
const fmtDate = (iso) => {
  if (!iso) return '';
  const opts = { day: 'numeric', month: 'short' };
  if (iso.slice(0, 4) !== todayISO().slice(0, 4)) opts.year = 'numeric';
  return parseISO(iso).toLocaleDateString(undefined, opts);
};
const fmtDateTime = (ms) => new Date(ms).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

const DUE_GROUPS = [
  { key: 'late', label: 'Late' }, { key: 'today', label: 'Today' }, { key: 'tomorrow', label: 'Tomorrow' },
  { key: 'week', label: 'This week' }, { key: 'next', label: 'Next week' }, { key: 'future', label: 'Future' }, { key: 'none', label: 'No date' },
];
function dueGroupOf(due) {
  if (!due) return 'none';
  const t = todayISO();
  if (due < t) return 'late';
  if (due === t) return 'today';
  if (due === addDays(t, 1)) return 'tomorrow';
  const monday = weekStartOf(t);
  if (due < addDays(monday, 7)) return 'week';
  if (due < addDays(monday, 14)) return 'next';
  return 'future';
}
function dateForDueGroup(key) {
  const t = todayISO();
  const monday = weekStartOf(t);
  const friday = addDays(monday, 4);
  return {
    today: t, tomorrow: addDays(t, 1), none: null,
    week: friday > addDays(t, 1) ? friday : addDays(monday, 6) > addDays(t, 1) ? addDays(monday, 6) : addDays(t, 1),
    next: addDays(monday, 7), future: addDays(monday, 14),
  }[key];
}

// ---------- Fixed vocabularies ----------
const PROGRESS = [{ v: 0, label: 'Not started' }, { v: 10, label: '10%' }, { v: 50, label: '50%' }, { v: 80, label: '80%' }, { v: 100, label: '100% · Completed' }];
const PROGRESS_VALUES = PROGRESS.map((p) => p.v);
const inProgress = (t) => t.progress > 0 && t.progress < 100;
const PRIORITY = [{ v: 1, label: 'Urgent' }, { v: 3, label: 'Important' }, { v: 5, label: 'Medium' }, { v: 9, label: 'Low' }];
const REPEATS = [
  { v: '', label: 'Does not repeat' }, { v: 'daily', label: 'Daily' }, { v: 'weekdays', label: 'Weekdays' }, { v: 'weekly', label: 'Weekly' },
  { v: 'biweekly', label: 'Every 2 weeks' }, { v: 'monthly', label: 'Monthly' }, { v: 'yearly', label: 'Yearly' },
];
// Muted, earthy label colours to sit with the OMI palette; names match Microsoft Planner's.
const LABELS = [
  ['Pink', '#c77d8e'], ['Red', '#a6402b'], ['Yellow', '#d8b45c'], ['Green', '#6f8f5a'], ['Blue', '#4f6e96'],
  ['Purple', '#7d6a8e'], ['Bronze', '#9a6b3f'], ['Lime', '#a3a86b'], ['Aqua', '#6fa0a0'], ['Gray', '#8c887f'],
  ['Silver', '#bdb8ae'], ['Brown', '#6b4b33'], ['Cranberry', '#8a3b45'], ['Orange', '#c47b45'], ['Peach', '#e2b497'],
  ['Marigold', '#c9963a'], ['Light green', '#b4c4a0'], ['Dark green', '#3f5a3a'], ['Teal', '#3f7473'], ['Light blue', '#a9bcd1'],
  ['Dark blue', '#233246'], ['Lavender', '#b7aecb'], ['Plum', '#5c3a52'], ['Light gray', '#d9d3c7'], ['Dark gray', '#4e4a44'],
];
// OMI navy, olive, ochre, steel blue, slate, terracotta, light olive, charcoal.
const PLAN_COLORS = ['#233246', '#7b8060', '#b5894d', '#3e5170', '#6e7a8f', '#be7f5c', '#9ba080', '#332f2a'];
const PERSON_COLORS = ['#233246', '#b5894d', '#7b8060', '#3e5170', '#be7f5c', '#6e7a8f', '#5a5e45', '#8c6a3c', '#4a3f35', '#9ba080'];
// Colours saved before the OMI rebrand, mapped slot for slot onto the palettes above.
const OLD_PLAN_COLORS = ['#4f46b8', '#2a78d6', '#038387', '#2e8b57', '#c2560c', '#c0364f', '#8e44ad', '#5b6472'];
const OLD_PERSON_COLORS = ['#4f46b8', '#038387', '#c2560c', '#c0364f', '#2a78d6', '#2e8b57', '#8e44ad', '#5b6472', '#a7692a', '#14622e'];
const rebrand = (color, oldList, newList, fallback) => {
  const i = oldList.indexOf(String(color || '').toLowerCase());
  return i >= 0 ? newList[i] : color || fallback;
};
const inkOn = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? '#1b1a19' : '#ffffff';
};

function nextOccurrence(iso, repeat) {
  switch (repeat) {
    case 'daily': return addDays(iso, 1);
    case 'weekdays': { let d = addDays(iso, 1); while ([0, 6].includes(parseISO(d).getDay())) d = addDays(d, 1); return d; }
    case 'weekly': return addDays(iso, 7);
    case 'biweekly': return addDays(iso, 14);
    case 'monthly': return addMonths(iso, 1);
    case 'yearly': return addMonths(iso, 12);
    default: return null;
  }
}

// ---------- Data model ----------
let S = null; // the whole app state; persisted as one atomic snapshot

function makeTask(fields) {
  return {
    id: uid(), planId: null, bucketId: null, title: '', notes: '', progress: 0, priority: 5, start: null, due: null, repeat: '',
    assignees: [], labels: [], checklist: [], attachments: [], comments: [], order: 0, preview: 'auto', myDay: null,
    created: Date.now(), completedAt: null, history: [], review: null, assignedBy: null, assignedAt: null, prevBucketId: null, shared: false,
    estimate: null, slotDate: null, slotStart: null, workType: '', health: '', healthNote: '', decision: null, urgency: '',
    box: false, boxId: null, tbQueued: false, tbColor: '', ...fields,
  };
}
function makePlan(name, color, extra = {}) {
  return {
    id: uid(), name, color: color || PLAN_COLORS[0], pinned: false, created: Date.now(), lastOpened: Date.now(),
    labels: Array(LABELS.length).fill(''), buckets: [{ id: uid(), name: 'To do' }], members: [S.meId], ...extra,
  };
}

function normalizeState(raw) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.plans) || !Array.isArray(raw.tasks) || !Array.isArray(raw.people)) {
    throw new Error('This file is not a Planner backup.');
  }
  const people = raw.people.filter((p) => p && p.id).map((p, i) => ({ id: String(p.id), name: String(p.name || 'Unnamed'), color: rebrand(p.color, OLD_PERSON_COLORS, PERSON_COLORS, PERSON_COLORS[i % PERSON_COLORS.length]), email: String(p.email || '').trim().toLowerCase(), ...(p._v && typeof p._v === 'object' ? { _v: p._v } : {}) }));
  if (!people.length) people.push({ id: uid(), name: 'Me', color: PERSON_COLORS[0] });
  const meId = people.some((p) => p.id === raw.meId) ? raw.meId : people[0].id;
  const plans = raw.plans.filter((p) => p && p.id).map((p) => ({
    id: String(p.id), name: String(p.name || 'Untitled plan'), color: rebrand(p.color, OLD_PLAN_COLORS, PLAN_COLORS, PLAN_COLORS[0]), pinned: !!p.pinned,
    created: p.created || Date.now(), lastOpened: p.lastOpened || 0,
    labels: Array.from({ length: LABELS.length }, (_, i) => String((p.labels && p.labels[i]) || '')),
    buckets: Array.isArray(p.buckets) && p.buckets.length ? p.buckets.map((b) => ({ id: String(b.id), name: String(b.name || 'Bucket'), ...(b.kind === 'checking' ? { kind: 'checking' } : {}) })) : [{ id: uid(), name: 'To do' }],
    members: Array.isArray(p.members) ? p.members.filter((m) => people.some((x) => x.id === m)) : [meId],
    personal: !!p.personal, shared: !!p.shared, owner: p.owner || null,
    labelOrder: Array.isArray(p.labelOrder) ? [...new Set(p.labelOrder.filter((n) => Number.isInteger(n) && n >= 0 && n < LABELS.length))] : null, ...(p._v && typeof p._v === 'object' ? { _v: p._v } : {}),
  }));
  const planById = new Map(plans.map((p) => [p.id, p]));
  const tasks = raw.tasks.filter((t) => t && t.id && planById.has(t.planId)).map((t) => {
    const plan = planById.get(t.planId);
    return makeTask({
      ...t, id: String(t.id), title: String(t.title || ''), notes: String(t.notes || ''),
      bucketId: plan.buckets.some((b) => b.id === t.bucketId) ? t.bucketId : plan.buckets[0].id,
      assignees: Array.isArray(t.assignees) ? t.assignees.filter((a) => people.some((x) => x.id === a)) : [],
      labels: Array.isArray(t.labels) ? t.labels.filter((n) => Number.isInteger(n) && n >= 0 && n < LABELS.length) : [],
      checklist: Array.isArray(t.checklist) ? t.checklist : [],
      attachments: Array.isArray(t.attachments) ? t.attachments : [],
      comments: Array.isArray(t.comments) ? t.comments : [],
      history: Array.isArray(t.history) ? t.history.filter((e) => e && e.id) : [],
      review: t.review && typeof t.review === 'object' ? t.review : null,
      estimate: Number.isFinite(t.estimate) && t.estimate > 0 ? t.estimate : null,
      slotDate: /^\d{4}-\d{2}-\d{2}$/.test(t.slotDate || '') && Number.isFinite(t.slotStart) ? t.slotDate : null,
      slotStart: /^\d{4}-\d{2}-\d{2}$/.test(t.slotDate || '') && Number.isFinite(t.slotStart) ? t.slotStart : null,
      workType: ['focus', 'decision', 'collab', 'planning', 'review'].includes(t.workType) ? t.workType : '',
      health: ['green', 'yellow', 'red'].includes(t.health) ? t.health : '',
      healthNote: String(t.healthNote || ''),
      decision: t.decision && typeof t.decision === 'object' ? t.decision : null,
      urgency: ['emergency', 'same-day', 'routine'].includes(t.urgency) ? t.urgency : '',
      progress: PROGRESS_VALUES.includes(t.progress) ? t.progress : 0,
      box: !!t.box, boxId: typeof t.boxId === 'string' ? t.boxId : null, tbQueued: !!t.tbQueued,
      tbColor: /^#[0-9a-f]{6}$/i.test(t.tbColor || '') ? t.tbColor : '',
      priority: [1, 3, 5, 9].includes(t.priority) ? t.priority : 5,
      order: Number.isFinite(t.order) ? t.order : 0,
    });
  });
  // A task inside a time box that no longer exists goes back to the Time Box list.
  const ids = new Set(tasks.map((t) => t.id));
  tasks.forEach((t) => { if (t.boxId && !ids.has(t.boxId)) { t.boxId = null; t.tbQueued = true; } });
  return {
    v: 1, people, meId, plans, tasks,
    settings: (() => { const st = { theme: 'system', lastBackup: null, ...(raw.settings || {}) }; st.timebox = normalizeTimebox(st.timebox); return st; })(),
    // Each day keeps up to three Most Important Outcomes; a single one saved earlier becomes the first.
    days: Object.fromEntries(Object.entries(raw.days && typeof raw.days === 'object' ? raw.days : {})
      .filter(([d, v]) => /^\d{4}-\d{2}-\d{2}$/.test(d) && v && typeof v === 'object')
      .map(([d, v]) => { const mio = (Array.isArray(v.mio) ? v.mio : v.omio ? [v.omio] : []).filter((id) => typeof id === 'string').slice(0, 3); const rest = { ...v, mio }; delete rest.omio; return [d, rest]; })),
    sync: { ...freshSync(), ...(raw.sync && typeof raw.sync === 'object' ? raw.sync : {}) },
    personPlans: Array.isArray(raw.personPlans) ? raw.personPlans.filter((pp) => pp && pp.id && people.some((x) => x.id === pp.personId)) : [],
    inbox: Array.isArray(raw.inbox) ? raw.inbox.filter((n) => n && n.id) : [],
  };
}

function seedState() {
  const me = { id: uid(), name: 'Me', color: PERSON_COLORS[0] };
  S = { v: 1, people: [me], meId: me.id, plans: [], tasks: [], settings: { theme: 'system', lastBackup: null, timebox: defaultTimebox() }, sync: freshSync(), personPlans: [], inbox: [], days: {} };
  const personal = makePlan('Personal tasks', PLAN_COLORS[2], { personal: true, lastOpened: 1 });
  personal.buckets[0].name = 'Tasks';
  const t = todayISO();
  const plan = makePlan('Getting started', PLAN_COLORS[0], { pinned: true });
  plan.labels[4] = 'Tip';
  plan.labels[3] = 'Offline';
  const [todo, doing, done] = [plan.buckets[0], { id: uid(), name: 'In progress' }, { id: uid(), name: 'Done' }];
  plan.buckets.push(doing, done);
  S.plans.push(plan, personal);
  const add = (bucket, title, f) => S.tasks.push(makeTask({ planId: plan.id, bucketId: bucket.id, title, order: S.tasks.length, ...f }));
  add(todo, 'Drag this card to another bucket', { labels: [4], assignees: [me.id], due: t, notes: 'Hold and drag a card to move it. Grouping changes what a drag does: in "Group by Priority", dragging changes the priority.' });
  add(todo, 'Open a task to add a checklist, notes and files', {
    labels: [4], priority: 3, due: addDays(t, 2), preview: 'checklist',
    checklist: [{ id: uid(), text: 'Click this card', done: true }, { id: uid(), text: 'Add a checklist item', done: false }, { id: uid(), text: 'Attach a file', done: false }],
  });
  add(todo, 'Use Schedule to plan your dates', { labels: [4], start: t, due: addDays(t, 4), priority: 1 });
  add(doing, 'Rename yourself in Settings', { assignees: [me.id], progress: 50, notes: 'Open Settings from the gear icon, top right. You can add other people there too.' });
  add(doing, 'Make a backup', { labels: [3], priority: 3, progress: 50, notes: 'Your plans live only on this device. Settings > Export backup saves a file you can keep or move to another computer.' });
  add(done, 'Turn off the Wi-Fi and keep working', { labels: [3], progress: 100, completedAt: Date.now() });
  return S;
}

// ---------- Persistence: IndexedDB, with localStorage as a fallback ----------
const LS_KEY = 'planner-offline-state';
const Store = {
  db: null, timer: null, status: 'saved', failed: false, channel: null, tabId: uid(), onExternalChange: null, onStatus: null,

  open() {
    return new Promise((resolve) => {
      if (!window.indexedDB) return resolve(null);
      let req;
      try { req = indexedDB.open('planner-offline', 1); } catch { return resolve(null); }
      req.onupgradeneeded = () => { req.result.createObjectStore('kv'); req.result.createObjectStore('files'); };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    });
  },
  tx(store, mode, fn) {
    return new Promise((resolve, reject) => {
      const t = this.db.transaction(store, mode);
      const r = fn(t.objectStore(store));
      t.oncomplete = () => resolve(r && r.result);
      t.onerror = t.onabort = () => reject(t.error);
    });
  },
  async read() {
    if (this.db) return this.tx('kv', 'readonly', (s) => s.get('state'));
    const txt = localStorage.getItem(LS_KEY);
    return txt ? JSON.parse(txt) : null;
  },
  async load() {
    this.db = await this.open();
    const raw = await this.read();
    S = raw ? normalizeState(raw) : seedState();
    if (!raw) await this.flush();
    try {
      this.channel = new BroadcastChannel('planner-offline');
      this.channel.onmessage = async (e) => {
        if (e.data === this.tabId) return;
        S = normalizeState(await this.read());
        if (this.onExternalChange) this.onExternalChange();
      };
    } catch { /* other tabs just won't live-update */ }
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  },
  setStatus(s) { this.status = s; if (this.onStatus) this.onStatus(s); },
  save() {
    if (this.beforeSave) this.beforeSave();
    this.setStatus('saving');
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), 120);
  },
  async flush() {
    clearTimeout(this.timer);
    this.timer = null;
    try {
      const snapshot = JSON.parse(JSON.stringify(S));
      if (this.db) await this.tx('kv', 'readwrite', (s) => s.put(snapshot, 'state'));
      else localStorage.setItem(LS_KEY, JSON.stringify(snapshot));
      if (this.channel) this.channel.postMessage(this.tabId);
      this.failed = false;
      this.setStatus('saved');
      if (this.afterSave) this.afterSave();
    } catch (err) {
      console.error('Save failed', err);
      this.failed = true;
      this.setStatus('error');
    }
  },
  async putFile(id, blob) {
    if (!this.db) throw new Error('File storage is unavailable in this browser.');
    return this.tx('files', 'readwrite', (s) => s.put(blob, id));
  },
  async getFile(id) { return this.db ? this.tx('files', 'readonly', (s) => s.get(id)) : null; },
  // Blobs are removed here rather than on delete, so Undo and copied tasks keep working.
  async collectGarbage() {
    if (!this.db) return;
    const used = new Set(S.tasks.flatMap((t) => t.attachments.filter((a) => a.kind === 'file').map((a) => a.id)));
    const keys = await this.tx('files', 'readonly', (s) => s.getAllKeys());
    const stale = (keys || []).filter((k) => !used.has(k));
    if (stale.length) await this.tx('files', 'readwrite', (s) => { stale.forEach((k) => s.delete(k)); });
  },
};

// ---------- Queries ----------
const person = (id) => S.people.find((p) => p.id === id);
const planById = (id) => S.plans.find((p) => p.id === id);
const taskById = (id) => S.tasks.find((t) => t.id === id);
const tasksOf = (planId) => S.tasks.filter((t) => t.planId === planId);
const byOrder = (a, b) => a.order - b.order;
const isDone = (t) => t.progress === 100;
const isLate = (t) => !isDone(t) && !!t.due && t.due < todayISO();
const bucketName = (t) => { const p = planById(t.planId); const b = p && p.buckets.find((x) => x.id === t.bucketId); return b ? b.name : ''; };
const labelName = (plan, i) => (plan && plan.labels[i]) || LABELS[i][0];
const inMyDay = (t) => !isDone(t) && !t.box && (t.myDay === todayISO() || t.slotDate === todayISO() || (t.boxId && taskById(t.boxId)?.slotDate === todayISO()) || (t.due === todayISO() && t.assignees.includes(S.meId)));
// Labels in the order set for the plan (drag to reorder in the label picker); otherwise named labels first.
function labelOrder(plan) {
  const base = LABELS.map((_, i) => i).sort((a, b) => (!plan.labels[a] - !plan.labels[b]) || a - b);
  if (!plan.labelOrder) return base;
  return [...plan.labelOrder, ...base.filter((i) => !plan.labelOrder.includes(i))];
}
const orderedLabels = (plan, labels) => { const order = labelOrder(plan); return [...labels].sort((a, b) => order.indexOf(a) - order.indexOf(b)); };
/** A colour slot for a new label: unnamed and unused in this plan if possible, else just unnamed. */
function freeLabelSlot(plan) {
  const used = new Set(tasksOf(plan.id).flatMap((t) => t.labels));
  const free = LABELS.map((_, i) => i).filter((i) => !plan.labels[i]);
  return free.find((i) => !used.has(i)) ?? free[0] ?? -1;
}
const personalPlan = () => S.plans.find((p) => p.personal) || S.plans[0];

// ---------- Task mutations (callers save and re-render) ----------
function addTask(fields) {
  const siblings = S.tasks.filter((t) => t.planId === fields.planId);
  const order = siblings.length ? Math.min(...siblings.map((t) => t.order)) - 1 : 0;
  const t = makeTask({ order, ...fields });
  S.tasks.push(t);
  return t;
}
/**
 * Sets progress; completing a repeating task spawns the next one. Returns that next task, if any.
 * A task someone else assigned can't be completed by its assignee: it goes to Checking instead.
 */
function setProgress(t, value) {
  // Ticking a time box ticks every task in it; the box follows its items.
  if (t.box && boxItems(t).length) {
    boxItems(t).forEach((i) => { if ((value === 100) !== isDone(i)) setProgress(i, value === 100 ? 100 : 0); });
    refreshBox(t);
    return null;
  }
  const wasDone = isDone(t);
  if (value === 100 && !wasDone && needsReview(t)) { submitForReview(t); return null; }
  if (value !== 100 && t.review) endReview(t);
  t.progress = value;
  t.completedAt = value === 100 ? t.completedAt || Date.now() : null;
  if (value === 100 && !wasDone) onCompleted(t);
  if (value !== 100 && wasDone) addEvent(t, 'reopened');
  if (t.boxId && taskById(t.boxId)) refreshBox(taskById(t.boxId));
  if (value !== 100 || wasDone || !t.repeat) return null;
  const base = t.due || t.start || todayISO();
  const nextDue = nextOccurrence(base, t.repeat);
  const span = t.start && t.due ? daysBetween(t.start, t.due) : null;
  const next = addTask({
    planId: t.planId, bucketId: t.bucketId, title: t.title, notes: t.notes, priority: t.priority, repeat: t.repeat, assignees: [...t.assignees], labels: [...t.labels],
    assignedBy: t.assignedBy, assignedAt: t.assignedBy ? Date.now() : null, estimate: t.estimate, workType: t.workType,
    preview: t.preview, due: nextDue, start: span === null ? null : addDays(nextDue, -span),
    checklist: t.checklist.map((c) => ({ ...c, id: uid(), done: false })), attachments: t.attachments.map((a) => ({ ...a })),
  });
  t.repeat = '';
  return next;
}
function copyTask(t, fields = {}) {
  return makeTask({
    ...JSON.parse(JSON.stringify(t)), id: uid(), comments: [], progress: 0, completedAt: null, created: Date.now(), myDay: null,
    history: [], review: null, assignedBy: null, assignedAt: null, prevBucketId: null, shared: false, _v: undefined,
    slotDate: null, slotStart: null, health: '', healthNote: '', box: false, boxId: null, tbQueued: false, ...fields,
  });
}

// ---------- Files: download, CSV and backup ----------
function download(name, blob) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 30000);
}
const safeFilename = (s) => s.replace(/[^\w\- ]+/g, '').trim() || 'plan';

function planToCSV(plan) {
  const cell = (v) => {
    let s = String(v ?? '');
    if (/^[=+\-@\t]/.test(s)) s = `'${s}`; // keep spreadsheets from running task text as a formula
    return `"${s.replace(/"/g, '""')}"`;
  };
  const head = ['Task', 'Bucket', 'Progress', 'Priority', 'Assigned to', 'Start date', 'Due date', 'Late', 'Repeat', 'Labels', 'Checklist', 'Notes',
    'Estimate', 'Work type', 'Traffic light', 'Recovery plan / support needed', 'Time box'];
  const rows = tasksOf(plan.id).sort(byOrder).map((t) => [
    t.title, bucketName(t), PROGRESS.find((p) => p.v === t.progress).label, PRIORITY.find((p) => p.v === t.priority).label,
    t.assignees.map((a) => person(a)?.name).join('; '), t.start || '', t.due || '', isLate(t) ? 'Yes' : 'No',
    REPEATS.find((r) => r.v === t.repeat)?.label || '', orderedLabels(plan, t.labels).map((l) => labelName(plan, l)).join('; '),
    t.checklist.length ? `${t.checklist.filter((c) => c.done).length}/${t.checklist.length}` : '', t.notes,
    t.estimate ? fmtDur(t.estimate) : '', t.workType ? workTypeOf(t.workType).label : '', healthText(t.health), t.healthNote,
    isScheduled(t) ? `${t.slotDate} ${hm(t.slotStart)}-${hm(endOf(t))}` : '',
  ]);
  return '﻿' + [head, ...rows].map((r) => r.map(cell).join(',')).join('\r\n');
}

const blobToDataURL = (blob) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(r.result);
  r.onerror = () => reject(r.error);
  r.readAsDataURL(blob);
});
function dataURLToBlob(url) {
  const [head, body] = url.split(',');
  const bytes = Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
  return new Blob([bytes], { type: (head.match(/data:([^;]+)/) || [])[1] || 'application/octet-stream' });
}
async function exportBackup() {
  const files = {};
  for (const a of S.tasks.flatMap((t) => t.attachments)) {
    if (a.kind !== 'file' || files[a.id]) continue;
    const blob = await Store.getFile(a.id);
    if (blob) files[a.id] = await blobToDataURL(blob);
  }
  S.settings.lastBackup = Date.now();
  Store.save();
  download(`planner-backup-${todayISO()}.json`, new Blob([JSON.stringify({ ...S, files })], { type: 'application/json' }));
}
async function importBackup(text) {
  const raw = JSON.parse(text);
  const next = normalizeState(raw);
  for (const [id, url] of Object.entries(raw.files || {})) await Store.putFile(id, dataURLToBlob(url));
  S = next;
  await Store.flush();
}
