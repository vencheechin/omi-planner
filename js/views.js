'use strict';
/* Everything rendered into the sidebar and main area: hub, boards, grids, schedule, charts. */

const ui = {
  route: { view: 'hub' }, openTask: null, search: '', navOpen: false,
  planTab: {}, groupBy: {}, filters: {}, showDone: {}, quickAdd: null, gridSort: { key: 'order', dir: 1 },
  sched: { mode: 'month', anchor: todayISO() }, chartTable: false, pop: null, draft: { comment: '' },
  labelCtx: null, labelQuery: '', labelEdit: null, dayView: 'day', dayDate: todayISO(), tbFullDay: false, tbPicked: [], tbShowOthers: false, report: { scope: 'me', person: '', status: '', from: '', to: '' },
};

const ICON = {
  home: 'M3 11l9-7 9 7M5 10v10h14V10', sun: 'M12 8a4 4 0 100 8 4 4 0 000-8zM12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5',
  user: 'M12 12a4 4 0 100-8 4 4 0 000 8zM4 21c0-4 4-6 8-6s8 2 8 6', plus: 'M12 5v14M5 12h14', close: 'M6 6l12 12M18 6L6 18', more: 'M5 12h.01M12 12h.01M19 12h.01',
  star: 'M12 3l2.7 5.6 6.2.8-4.5 4.3 1.1 6.1L12 17l-5.500 2.900 1.100-6.100L3.100 9.400l6.200-.8z', filter: 'M3 5h18l-7 8v6l-4 2v-8z', group: 'M4 5h16M7 12h10M10 19h4',
  gear: 'M12 9a3 3 0 100 6 3 3 0 000-6zM19 12l2-1.500-2-3.500-2.400.6-1.600-1L14.500 4h-5L9 6.600l-1.600 1L5 7 3 10.500 5 12l-2 1.500L5 17l2.400-.6 1.600 1 .5 2.600h5l.5-2.600 1.600-1 2.400.6 2-3.500z',
  search: 'M11 4a7 7 0 100 14 7 7 0 000-14zM21 21l-4.500-4.500', menu: 'M4 6h16M4 12h16M4 18h16', cal: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
  check: 'M5 12.500l4.500 4.500L19 7.500', clip: 'M20 11l-8.500 8.500a5 5 0 01-7-7L13 4a3.500 3.500 0 015 5l-8.500 8.500a2 2 0 01-3-3L14 7', chat: 'M4 5h16v11H9l-5 4z',
  list: 'M9 6h11M9 12h11M9 18h11M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2', repeat: 'M4 11V9a3 3 0 013-3h12l-3-3M20 13v2a3 3 0 01-3 3H5l3 3', trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',
  copy: 'M9 9h11v11H9zM15 9V4H4v11h5', link: 'M10 14a4 4 0 006 .400l3-3a4 4 0 00-6-6l-1 1M14 10a4 4 0 00-6-.400l-3 3a4 4 0 006 6l1-1', chevL: 'M15 5l-7 7 7 7', chevR: 'M9 5l7 7-7 7', chevD: 'M5 9l7 7 7-7',
  download: 'M12 4v11M7 11l5 5 5-5M4 20h16', upload: 'M12 16V5M7 9l5-5 5 5M4 20h16', up: 'M12 19V5M6 11l6-6 6 6', down: 'M12 5v14M6 13l6 6 6-6', flag: 'M6 21V4h12l-3 4 3 4H6', pencil: 'M4 20h4L19 9l-4-4L4 16zM13.500 6.500l4 4', move: 'M4 12h15M13 6l6 6-6 6', bell: 'M6 16v-5a6 6 0 0112 0v5l2 2H4zM10 21a2 2 0 004 0', clock: 'M12 3a9 9 0 100 18 9 9 0 000-18zM12 7v5l3 2', lock: 'M6 11h12v9H6zM9 11V8a3 3 0 016 0v3', chart: 'M4 20V10M10 20V4M16 20v-7M2 20h20', tag: 'M3 12V4h8l10 10-8 8z',
};
const icon = (name, size = 16) => `<svg class="icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${ICON[name]}"/></svg>`;

const avatar = (p, size = 26) => (p ? `<span class="avatar" style="--s:${size}px;background:${esc(p.color)}" title="${esc(p.name)}">${esc(initials(p.name))}</span>` : '');
const planTile = (p, size = 28) => `<span class="plan-tile" style="--s:${size}px;background:${esc(p.color)}" aria-hidden="true">${esc(initials(p.name))}</span>`;
const labelChip = (plan, i) => `<span class="label-chip" style="background:${LABELS[i][1]};color:${inkOn(LABELS[i][1])}">${esc(labelName(plan, i))}</span>`;
function priorityIcon(p) {
  if (p === 1) return `<span class="prio urgent" title="Urgent">!</span>`;
  if (p === 3) return `<span class="prio important" title="Important">${icon('up', 13)}</span>`;
  if (p === 9) return `<span class="prio low" title="Low">${icon('down', 13)}</span>`;
  return '';
}
/** A bar across the card with the percentage, once work has started. */
const progressBarHTML = (t) => (t.progress > 0
  ? `<div class="prog-bar ${isDone(t) ? 'done' : ''}" role="progressbar" aria-valuenow="${t.progress}" aria-valuemin="0" aria-valuemax="100" aria-label="${t.progress}% done"><span><i style="width:${t.progress}%"></i></span><b>${t.progress}%</b></div>`
  : '');
/** A small ring that fills with the task's progress (10%, 50%, 80%). Replaced on cards by the bar. */
const progressIcon = (t) => {
  if (!inProgress(t)) return '';
  const c = 2 * Math.PI * 6;
  return `<span class="prog-ring" title="${t.progress}% done" aria-label="${t.progress}% done"><svg viewBox="0 0 16 16" width="15" height="15"><circle cx="8" cy="8" r="6" fill="none" stroke="var(--line-strong)" stroke-width="2.5"/><circle cx="8" cy="8" r="6" fill="none" stroke="var(--st-doing)" stroke-width="2.5" stroke-dasharray="${(c * t.progress) / 100} ${c}" transform="rotate(-90 8 8)"/></svg></span>`;
};

// ---------- Filters ----------
const emptyFilter = () => ({ q: '', due: [], priority: [], progress: [], bucket: [], label: [], assignee: [], health: [], work: [] });
const filterOf = (key) => (ui.filters[key] = { ...emptyFilter(), ...(ui.filters[key] || {}) });
const filterCount = (f) => (f.q ? 1 : 0) + ['due', 'priority', 'progress', 'bucket', 'label', 'assignee', 'health', 'work'].reduce((n, k) => n + f[k].length, 0);
function applyFilter(tasks, f) {
  const q = f.q.trim().toLowerCase();
  return tasks.filter((t) => (!q || t.title.toLowerCase().includes(q) || t.notes.toLowerCase().includes(q))
    && (!f.due.length || f.due.includes(dueGroupOf(t.due)))
    && (!f.priority.length || f.priority.includes(t.priority))
    && (!f.progress.length || f.progress.includes(t.progress))
    && (!f.bucket.length || f.bucket.includes(bucketOf(t)))
    && (!f.label.length || t.labels.some((l) => f.label.includes(l)))
    && (!f.assignee.length || t.assignees.some((a) => f.assignee.includes(a)) || (f.assignee.includes('none') && !t.assignees.length))
    && (!f.health.length || f.health.includes(t.health || 'none'))
    && (!f.work.length || f.work.includes(t.workType || '')));
}

// ---------- Grouping ----------
const GROUPINGS = { stage: 'Progress', bucket: 'Bucket', assignee: 'Assigned to', progress: 'Progress', due: 'Due date', priority: 'Priority', label: 'Labels', plan: 'Plan', status: 'Status', health: 'Traffic light', work: 'Work type' };

function groupsFor(by, tasks, plan) {
  const sorted = [...tasks].sort(byOrder);
  const pick = (test) => sorted.filter(test);
  switch (by) {
    case 'bucket': return plan.buckets.map((b) => ({ key: b.id, label: b.name, bucket: true, color: b.color || '', tasks: pick((t) => bucketOf(t) === b.id).sort((x, y) => taskOrder(x) - taskOrder(y)) }));
    case 'assignee': {
      const ids = [...new Set([...(plan ? plan.members : [S.meId]), ...tasks.flatMap((t) => t.assignees)])];
      return [
        { key: 'none', label: 'Unassigned', tasks: pick((t) => !t.assignees.length) },
        ...ids.map((id) => ({ key: id, label: person(id)?.name || 'Unknown', person: person(id), tasks: pick((t) => t.assignees.includes(id)) })),
      ];
    }
    case 'progress': return PROGRESS.map((p) => ({ key: String(p.v), label: p.label, tasks: pick((t) => t.progress === p.v) }));
    case 'priority': return PRIORITY.map((p) => ({ key: String(p.v), label: p.label, tasks: pick((t) => t.priority === p.v) }));
    case 'due': return DUE_GROUPS.map((g) => ({ key: g.key, label: g.label, locked: g.key === 'late', tasks: pick((t) => dueGroupOf(t.due) === g.key) }));
    case 'label': {
      const used = [...new Set(tasks.flatMap((t) => t.labels))].sort((a, b) => a - b);
      return [
        { key: 'none', label: 'No label', tasks: pick((t) => !t.labels.length) },
        ...used.map((i) => ({ key: String(i), label: labelName(plan, i), color: LABELS[i][1], tasks: pick((t) => t.labels.includes(i)) })),
      ];
    }
    case 'plan': return S.plans.filter((p) => tasks.some((t) => t.planId === p.id)).map((p) => ({ key: p.id, label: p.name, plan: p, tasks: pick((t) => t.planId === p.id) }));
    case 'health': return [
      ...HEALTH.map((h) => ({ key: h.v, label: `${h.label} · ${h.meaning.split(' · ')[0]}`, color: h.color, tasks: pick((t) => t.health === h.v) })),
      { key: 'none', label: 'Not set', tasks: pick((t) => !t.health) },
    ];
    case 'work': return workTypes().map((w) => ({ key: w.v || 'other', label: w.label, color: w.color, tasks: pick((t) => (t.workType || '') === w.v) }));
    case 'status': return [
      { key: 'todo', label: 'To do', tasks: pick((t) => t.progress === 0 && !t.review) },
      { key: 'doing', label: 'In progress', tasks: pick((t) => inProgress(t) && !t.review) },
      { key: 'checking', label: 'Checking', noAdd: true, tasks: pick((t) => !!t.review) },
      { key: 'done', label: 'Completed', noAdd: true, tasks: pick(isDone) },
    ];
    // A person's board: one column per progress step, so a card moves when they update it.
    // A person's board shows only the columns that have tasks, so nothing hides off-screen.
    case 'stage': return [
      { key: 'checking', label: 'Checking', noAdd: true, tasks: pick((t) => !!t.review) },
      { key: 'done', label: 'Completed', noAdd: true, tasks: pick(isDone) },
      ...[80, 50, 10, 0].map((v) => ({ key: `p${v}`, label: v ? `${v}%` : 'Not started', noAdd: true, tasks: pick((t) => !t.review && !isDone(t) && t.progress === v) })),
    ].filter((g) => g.tasks.length);
    default: return [];
  }
}

/** Changes a task so it belongs to group `to`. Returns false when that group can't be dropped on. */
/** A plan's tasks; your own planner also holds the delegated tasks you moved into its buckets. */
function boardTasks(plan) {
  const own = tasksOf(plan.id);
  return plan.personal ? own.concat(S.tasks.filter((t) => t.planId !== plan.id && myBucketOf(t))) : own;
}
function applyGroup(t, by, from, to) {
  if (from === to) return true;
  switch (by) {
    case 'bucket': {
      const target = planById(t.planId).buckets.find((b) => b.id === to);
      if (!setBucketFor(t, to)) return false;
      break;
    }
    case 'health': setField(t, 'health', to === 'none' ? '' : to); break;
    case 'work': t.workType = to === 'other' ? '' : to; break;
    case 'stage':
      if (to === 'checking') { if (!needsReview(t)) return false; submitForReview(t); break; }
      setProgress(t, to === 'done' ? 100 : Number(to.slice(1)));
      break;
    case 'status':
      if (to === 'checking') { if (!needsReview(t)) return false; submitForReview(t); break; }
      setProgress(t, { todo: 0, doing: inProgress(t) ? t.progress : 50, done: 100 }[to]);
      break;
    case 'assignee':
      // Delegated to you: dragging between people can only pass it on, never drop the assigner or you.
      if (delegatedToMe(t)) { if (to === 'none' || !canDelegate(t, to) || (from !== 'none' && !canDelegate(t, from))) return false; setDelegate(t, from, false); setDelegate(t, to, true); break; }
      if (to === 'none') { t.assignees = []; break; }
      if (!canDelegateTo(to)) { toast(`${person(to)?.name || 'They'} don’t report to you.`); return false; }
      t.assignees = t.assignees.filter((a) => a !== from);
      if (!t.assignees.includes(to)) t.assignees.push(to);
      break;
    case 'progress': setProgress(t, Number(to)); break;
    case 'priority': t.priority = Number(to); break;
    case 'due':
      if (to === 'late' || dueLocked(t)) return false;
      t.due = dateForDueGroup(to);
      if (t.start && t.due && t.start > t.due) t.start = null;
      break;
    case 'label':
      if (to === 'none') { t.labels = []; break; }
      t.labels = t.labels.filter((l) => String(l) !== from);
      if (!t.labels.includes(Number(to))) t.labels.push(Number(to));
      break;
    case 'plan': {
      const p = planById(to);
      t.planId = to; t.bucketId = p.buckets[0].id; t.labels = [];
      break;
    }
  }
  return true;
}

// ---------- Sidebar ----------
/** A plan someone else shared with you shows their name, e.g. "Getting started (Ven)". */
/** Someone else's plan shared with you reads "Ray's Task (Ven)" (plus the plan's name if they share more than one). */
const planLabel = (p) => {
  if (!(p.owner && p.owner !== S.meId && person(p.owner))) return p.name;
  const theirs = S.plans.filter((x) => x.owner === p.owner).length;
  const me = (person(S.meId)?.name || 'My').trim();
  return `${me}${/s$/i.test(me) ? "'" : "'s"} Task (${person(p.owner).name})${theirs > 1 ? ` · ${p.name}` : ''}`;
};
/** "Ven's Planner" once you've set your name in Settings; plain "Planner" until then. */
/** A person's first name in a small pill in their colour (on task cards). */
const nameChip = (p) => (p ? `<span class="name-chip" style="--pc:${esc(p.color || '#b5894d')}" title="${esc(p.name)}">${esc(String(p.name).trim().split(/\s+/)[0])}</span>` : '');
const plannerName = () => { if (S.settings.plannerName) return S.settings.plannerName; const n = (person(S.meId)?.name || '').trim(); return n && n !== 'Me' ? `${n}${/s$/i.test(n) ? "'" : "'s"} Planner` : 'Planner'; };
/** Phones: a tab bar at the bottom, like iOS. */
function renderTabbar() {
  const bar = $('#tabbar');
  if (!bar) return;
  const r = ui.route.view;
  const tab = (href, ic, label, on, n) => `<a class="tab ${on ? 'on' : ''}" href="${href}">${icon(ic, 22)}<span>${label}</span>${n ? `<em>${n}</em>` : ''}</a>`;
  bar.innerHTML = tab('#/halfplan', 'table', 'S-Team', r === 'halfplan')
    + tab('#/timebox', 'clock', 'Time Box', r === 'timebox', timeboxQueue().length)
    + tab('#/hub', 'home', 'Planner', ['hub', 'plan', 'person', 'req', 'from', 'history'].includes(r), dueSoonCount())
    + `<button class="tab" data-act="openSettings">${icon('gear', 22)}<span>Settings</span></button>`;
}
/** Decision and approval requests share one shape: who asked whom, when, and the answer. */
const REQ_KINDS = {
  decision: { label: 'Decision Request', field: 'decisionReq', data: 'decision', mark: '⚑', by: 'decide by' },
  approval: { label: 'Approval Request', field: 'approvalReq', data: 'approval', mark: '✓', by: 'approve by' },
};
const reqOf = (t, kind) => t[REQ_KINDS[kind].field];
const reqDeadline = (t, kind) => t[REQ_KINDS[kind].data]?.deadline || '';
/** Open requests you're in: ones waiting for you (from) and ones you sent (to). */
const openReqs = (kind) => S.tasks.filter((t) => { const r = reqOf(t, kind); return r?.status === 'pending' && (isMeId(r.to) || isMeId(r.by)); });
const reqForMe = (t, kind) => isMeId(reqOf(t, kind).to);
const reqOther = (t, kind) => { const r = reqOf(t, kind); return pkey(isMeId(r.to) ? r.by : r.to); };
const byPersonName = (a, b) => (personByKey(a)?.name || '').localeCompare(personByKey(b)?.name || '');
/** Tasks someone else delegated to you that are still open. */
const delegatedFromTasks = () => S.tasks.filter((t) => delegatedToMe(t) && !isDone(t));
/** One sidebar section, e.g. "Decision Request From": a row per person, newest names sorted A–Z. */
function reqNavHTML(r, kind, dir) {
  const K = REQ_KINDS[kind];
  const list = openReqs(kind).filter((t) => (dir === 'from') === reqForMe(t, kind));
  if (!list.length) return '';
  const keys = [...new Set(list.map((t) => reqOther(t, kind)))].filter(personByKey).sort(byPersonName);
  const on = (k) => r.view === 'req' && r.kind === kind && r.dir === dir && (r.id || '') === k;
  const title = `${K.label} ${dir === 'from' ? 'From' : 'To'}`;
  return `<h3><a class="${on('') ? 'active' : ''}" href="#/req/${kind}/${dir}">${title}</a></h3>${keys.map((k) => {
    const n = list.filter((t) => reqOther(t, kind) === k).length;
    return `<a class="nav-item plan ${on(k) ? 'active' : ''}" href="#/req/${kind}/${dir}/${encodeURIComponent(k)}">${avatar(personByKey(k), 22)}<span>${esc(personByKey(k).name)}</span><em class="${dir === 'from' ? 'to-check' : ''}" title="${dir === 'from' ? 'Waiting for you' : 'Waiting on them'}">${n}</em></a>`;
  }).join('')}`;
}
/** Requests you sent that were approved and you haven't opened since: the "Approved" section. */
const approvedKey = (t, kind) => `${t.id}:${kind}:${reqOf(t, kind).decidedAt}`;
const approvedForMe = () => S.tasks.flatMap((t) => Object.keys(REQ_KINDS)
  .filter((k) => { const r = reqOf(t, k); return r?.status === 'approved' && isMeId(r.by) && !(S.settings.approvedSeen || []).includes(approvedKey(t, k)); })
  .map((k) => ({ t, k }))).sort((a, b) => reqOf(b.t, b.k).decidedAt - reqOf(a.t, a.k).decidedAt);
/** Opening an approved request clears it from "Approved". */
function markApprovedSeen(t) {
  const keys = Object.keys(REQ_KINDS).filter((k) => reqOf(t, k)?.status === 'approved' && isMeId(reqOf(t, k).by)).map((k) => approvedKey(t, k));
  const seen = S.settings.approvedSeen || [];
  const add = keys.filter((k) => !seen.includes(k));
  if (add.length) { S.settings.approvedSeen = [...seen, ...add].slice(-300); Store.save(); renderSidebar(); }
}
function approvedNavHTML() {
  const list = approvedForMe();
  if (!list.length) return '';
  return `<h3>Approved</h3>${list.map(({ t, k }) => `<a class="nav-item plan approved-item" href="javascript:void 0" data-open-task="${esc(t.id)}" title="${esc(`${REQ_KINDS[k].label} approved by ${person(reqOf(t, k).to)?.name || 'them'}`)}"><span class="dr-flag approved-mark">✓</span><span>${esc(t.title || 'Untitled task')}<small class="muted">${esc(REQ_KINDS[k].label.replace(' Request', ''))} · ${esc(person(reqOf(t, k).to)?.name || 'them')}</small></span></a>`).join('')}`;
}
/** Requests you answered (approved or rejected), newest first: the "Approval History". */
const decidedByMe = () => S.tasks.flatMap((t) => Object.keys(REQ_KINDS)
  .filter((k) => { const r = reqOf(t, k); return r && ['approved', 'rejected'].includes(r.status) && isMeId(r.to); })
  .map((k) => ({ t, k }))).sort((a, b) => (reqOf(b.t, b.k).decidedAt || 0) - (reqOf(a.t, a.k).decidedAt || 0));
function historyListHTML(list) {
  return list.length ? `<div class="dr-cards">${list.map(({ t, k }) => { const r = reqOf(t, k); return `<div class="dr-item"><div class="dr-who"><b class="${r.status === 'approved' ? 'ok-text' : 'danger-text'}">${r.status === 'approved' ? '✓ Approved' : 'Rejected'}</b> · ${esc(REQ_KINDS[k].label)} from <b>${esc(person(r.by)?.name || 'someone')}</b> · ${esc(fmtDate(new Date(r.decidedAt || r.at).toISOString().slice(0, 10)))}${r.note ? ` · “${esc(r.note)}”` : ''}</div>${cardHTML(t, { showPlan: true })}</div>`; }).join('')}</div>`
    : '<p class="muted small">Nothing yet.</p>';
}
function renderApprovalHistory() {
  const list = decidedByMe();
  return `<div class="page">
    <header class="page-head"><h1>Approval History</h1></header>
    <section class="dr-hub"><h2>Decided by you <span class="count">${list.length}</span></h2>${historyListHTML(list)}</section>
  </div>`;
}
/** "Delegate From": the people who gave you work, with how much is still open. */
const sharedWithMe = (p) => !!p.owner && !isMeId(p.owner);
function delegateFromNavHTML(r, planLink) {
  // Plans someone else shared with you, then anyone who delegated work outside those plans.
  const shared = S.plans.filter(sharedWithMe).sort((a, b) => planLabel(a).localeCompare(planLabel(b)));
  const list = delegatedFromTasks();
  const keys = [...new Set(list.map((t) => pkey(t.assignedBy)))].filter(personByKey).sort(byPersonName);
  if (!keys.length && !shared.length) return '';
  return `<h3>Delegate From</h3>${keys.map((k) => `<a class="nav-item plan ${r.view === 'from' && r.id === k ? 'active' : ''}" href="#/from/${encodeURIComponent(k)}">${avatar(personByKey(k), 22)}<span>${esc(personByKey(k).name)}</span><em>${list.filter((t) => pkey(t.assignedBy) === k).length}</em></a>`).join('')}${shared.map(planLink).join('')}`;
}
function renderSidebar() {
  renderTabbar();
  const r = ui.route;
  const link = (view, label, ic, count) => `<a class="nav-item ${r.view === view ? 'active' : ''}" href="#/${view}" data-navkey="${view}">${icon(ic, 18)}<span>${label}</span>${count ? `<em>${count}</em>` : ''}</a>`;
  const planLink = (p) => `<a class="nav-item plan ${r.view === 'plan' && r.id === p.id ? 'active' : ''}" href="#/plan/${esc(p.id)}">${planTile(p, 22)}<span>${esc(planLabel(p))}</span></a>`;
  const pinned = S.plans.filter((p) => p.pinned && !sharedWithMe(p));
  const recent = S.plans.filter((p) => !p.pinned && !sharedWithMe(p)).sort((a, b) => b.lastOpened - a.lastOpened).slice(0, 6);

  const toCheck = S.tasks.filter(isReviewer).length;
  const personLink = (pp) => {
    const waiting = personPlanTasks(pp).filter((t) => t.review).length;
    return `<a class="nav-item plan ${r.view === 'person' && r.id === pp.id ? 'active' : ''}" href="#/person/${esc(pp.id)}">${avatar(person(pp.personId), 22)}<span>${esc(pp.name)}</span>${waiting ? `<em class="to-check" title="Waiting for your check">${waiting}</em>` : ''}</a>`;
  };
  $('#sidebar').innerHTML = `
    <a class="brand" href="#/hub"><img src="icons/omi-logo.svg" width="34" height="34" alt="OMI"><span>${esc(plannerName())}</span></a>
    <nav aria-label="Main">
      <div class="nav-main">${(() => {
        // The main links, in the order you dragged them into (new ones go at the end).
        const items = [['halfplan', link('halfplan', 'S-Team Plan', 'table')], ['hub', link('hub', 'Planner', 'home', dueSoonCount())],
          ['timebox', link('timebox', 'Time Box', 'clock', timeboxQueue().length)], ['report', link('report', 'Assignments', 'chart', toCheck)],
          ['fitness', link('fitness', 'Fitness', 'pulse')], ['growth', link('growth', 'Growth', 'book', typeof recsForMe === 'function' ? recsForMe().length : 0)],
          ...(stAdmin() ? [['admin', link('admin', 'Admin Portal', 'shield')]] : [])];
        const order = S.settings.navOrder || [];
        const at = (k) => (order.includes(k) ? order.indexOf(k) : 100 + items.findIndex(([x]) => x === k));
        return items.sort((a, b) => at(a[0]) - at(b[0])).map(([, html]) => html).join('');
      })()}</div>
      ${reqNavHTML(r, 'decision', 'from')}${reqNavHTML(r, 'decision', 'to')}
      ${reqNavHTML(r, 'approval', 'from')}${reqNavHTML(r, 'approval', 'to')}
      ${approvedNavHTML()}
      ${decidedByMe().length ? `<h3><a class="${r.view === 'history' ? 'active' : ''}" href="#/history">Approval History</a></h3>` : ''}
      ${S.personPlans.length ? `<h3>Delegate To</h3>${S.personPlans.map(personLink).join('')}` : ''}
      ${delegateFromNavHTML(r, planLink)}
      ${pinned.length ? `<h3>Pinned</h3>${pinned.map(planLink).join('')}` : ''}
      ${recent.length ? `<h3>Recent</h3>${recent.map(planLink).join('')}` : ''}
    </nav>`;
  document.body.classList.toggle('nav-open', ui.navOpen);
  document.title = plannerName();
}

// ---------- Hub ----------
/** Decision requests: the closest deadline first, then those without one (oldest request first). */
const byDecisionDeadline = (a, b) => String(a.decision?.deadline || '9999').localeCompare(String(b.decision?.deadline || '9999')) || a.decisionReq.at - b.decisionReq.at;
const isMeId = (id) => !!id && pkey(id) === pkey(S.meId);
const decisionsForMe = () => S.tasks.filter((t) => t.decisionReq?.status === 'pending' && isMeId(t.decisionReq.to)).sort(byDecisionDeadline);
/** Every open decision request you're in: ones you must decide and ones you sent. */
const openDecisions = () => S.tasks.filter((t) => t.decisionReq?.status === 'pending' && (isMeId(t.decisionReq.to) || isMeId(t.decisionReq.by)));
/** The other person on a decision request (who asked you, or who you asked). */
const decisionOther = (t) => pkey(isMeId(t.decisionReq.to) ? t.decisionReq.by : t.decisionReq.to);
const personByKey = (k) => S.people.find((p) => pkey(p.id) === k);
const DEC_SORTS = [['deadline', 'Deadline'], ['priority', 'Priority'], ['due', 'Due date'], ['newest', 'Newest request'], ['oldest', 'Oldest request'], ['person', 'Person']];
function decisionSorter(by) {
  const dl = (t) => String(t.decision?.deadline || '9999');
  const due = (t) => String(t.due || '9999');
  const name = (t) => personByKey(decisionOther(t))?.name || '';
  const f = {
    deadline: (a, b) => dl(a).localeCompare(dl(b)) || a.priority - b.priority,
    priority: (a, b) => a.priority - b.priority || dl(a).localeCompare(dl(b)),
    due: (a, b) => due(a).localeCompare(due(b)) || dl(a).localeCompare(dl(b)),
    newest: (a, b) => b.decisionReq.at - a.decisionReq.at,
    oldest: (a, b) => a.decisionReq.at - b.decisionReq.at,
    person: (a, b) => name(a).localeCompare(name(b)) || dl(a).localeCompare(dl(b)),
  }[by] || byDecisionDeadline;
  return (a, b) => f(a, b) || a.decisionReq.at - b.decisionReq.at;
}
function reqSorter(by, kind) {
  const dl = (t) => String(reqDeadline(t, kind) || '9999');
  const due = (t) => String(t.due || '9999');
  const at = (t) => reqOf(t, kind).at;
  const name = (t) => personByKey(reqOther(t, kind))?.name || '';
  const f = {
    deadline: (a, b) => dl(a).localeCompare(dl(b)) || a.priority - b.priority,
    priority: (a, b) => a.priority - b.priority || dl(a).localeCompare(dl(b)),
    due: (a, b) => due(a).localeCompare(due(b)) || dl(a).localeCompare(dl(b)),
    newest: (a, b) => at(b) - at(a),
    oldest: (a, b) => at(a) - at(b),
    person: (a, b) => name(a).localeCompare(name(b)) || dl(a).localeCompare(dl(b)),
  }[by] || ((a, b) => dl(a).localeCompare(dl(b)));
  return (a, b) => f(a, b) || at(a) - at(b);
}
/** All your decision or approval requests in one place (or one person's), sortable. */
function renderRequests() {
  const { kind, dir } = ui.route;
  const K = REQ_KINDS[kind];
  const key = ui.route.id || '';
  const who = key ? personByKey(key) : null;
  const sort = S.settings.decisionSort || 'deadline';
  const all = openReqs(kind).filter((t) => !key || reqOther(t, kind) === key).sort(reqSorter(sort, kind));
  const fromList = all.filter((t) => reqForMe(t, kind));
  const toList = all.filter((t) => !reqForMe(t, kind));
  const item = (t) => {
    const r = reqOf(t, kind);
    const other = personByKey(reqOther(t, kind))?.name || 'Someone';
    const dl = reqDeadline(t, kind);
    return `<div class="dr-item"><div class="dr-who">${reqForMe(t, kind) ? `From <b>${esc(other)}</b>` : `To <b>${esc(other)}</b>`} · asked ${esc(fmtDate(new Date(r.at).toISOString().slice(0, 10)))}${dl ? ` · <span class="${dl < todayISO() ? 'danger-text' : ''}">${K.by} ${esc(fmtDate(dl))}</span>` : ''}</div>${cardHTML(t, { showPlan: true })}</div>`;
  };
  const sec = (title, list, empty) => `<section class="dr-hub"><h2>${title} <span class="count">${list.length}</span></h2>
    ${list.length ? `<div class="dr-cards">${list.map(item).join('')}</div>` : `<p class="muted small">${empty}</p>`}</section>`;
  const href = (k, d) => `#/req/${k}/${d}${key ? `/${encodeURIComponent(key)}` : ''}`;
  return `<div class="page">
    <header class="page-head"><h1>${K.mark} ${K.label}${dir ? ` ${dir === 'from' ? 'From' : 'To'}` : ''}${who ? `: ${esc(who.name)}` : ''}</h1></header>
    <div class="dr-tools">
      <div class="seg">${Object.entries(REQ_KINDS).map(([k, x]) => `<a class="${k === kind ? 'on' : ''}" href="${href(k, dir || 'all')}">${x.label.replace(' Request', '')}</a>`).join('')}</div>
      <div class="seg">${[['all', 'All'], ['from', 'From'], ['to', 'To']].map(([d, l]) => `<a class="${(dir || 'all') === d ? 'on' : ''}" href="${href(kind, d)}">${l}</a>`).join('')}</div>
      <label class="mini">Sort by <select data-change="decSort">${DEC_SORTS.map(([v, l]) => `<option value="${v}" ${v === sort ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    </div>
    ${dir !== 'to' ? sec(`${K.label} From`, fromList, who ? `Nothing from ${esc(who.name)} waiting for you.` : 'Nothing waiting for you.') : ''}
    ${dir !== 'from' ? sec(`${K.label} To`, toList, who ? `You haven’t sent ${esc(who.name)} one.` : 'You’re not waiting on anyone.') : ''}
    ${dir !== 'to' ? (() => { const h = decidedByMe().filter(({ t, k }) => k === kind && (!key || pkey(reqOf(t, k).by) === key)); return h.length ? `<section class="dr-hub"><h2>Approval History <span class="count">${h.length}</span></h2>${historyListHTML(h)}</section>` : ''; })() : ''}
  </div>`;
}
/** Your own buckets for work one person delegated to you. Theirs stay as they are. */
const fromBuckets = (k) => (S.settings.fromBoards || {})[k] || [];
const fromBucketOf = (t, k) => (t.fromBucketId && fromBuckets(k).some((b) => b.id === t.fromBucketId) ? t.fromBucketId : 'none');
/** Work someone delegated to you, on a board with your own buckets. */
function renderDelegatedFrom() {
  const k = ui.route.id;
  const who = personByKey(k);
  const tasks = delegatedFromTasks().filter((t) => pkey(t.assignedBy) === k)
    .sort((a, b) => (a.fromOrder ?? 1e9) - (b.fromOrder ?? 1e9) || String(a.due || '9999').localeCompare(String(b.due || '9999')));
  const cols = [{ id: 'none', name: 'Not sorted' }, ...fromBuckets(k)];
  const col = (b) => {
    const list = tasks.filter((t) => fromBucketOf(t, k) === b.id);
    const mine = b.id !== 'none';
    return `<section class="col" data-group="${esc(b.id)}" ${mine ? `data-bucket-id="${esc(b.id)}"` : ''}>
      <header class="col-head" ${mine ? 'data-drag="bucket"' : ''} data-id="${esc(b.id)}">
        ${mine ? '<span class="grip col-grip" aria-hidden="true" title="Drag to move">⋮⋮</span>' : ''}
        ${mine ? `<input class="col-title-input" value="${esc(b.name)}" data-change="fromBucketName" data-id="${esc(b.id)}" aria-label="Bucket name">` : `<span class="col-title"><b>${esc(b.name)}</b></span>`}
        <span class="count">${list.length}</span>
        ${mine ? `<button class="icon-btn" data-act="fromBucketMenu" data-id="${esc(b.id)}" aria-label="Bucket options for ${esc(b.name)}">${icon('more')}</button>` : ''}
      </header>
      <div class="col-body" data-drop="tasks">${list.map((t) => cardHTML(t, { showPlan: true })).join('')}</div>
    </section>`;
  };
  return `<div class="page">
    <header class="page-head"><h1>Delegate From${who ? `: ${esc(who.name)}` : ''}</h1></header>
    <p class="muted small from-note">Your own buckets: arrange them however suits you. ${esc(who?.name || 'They')} won’t see them, and their buckets stay as they are.</p>
    <div class="board from-board" data-by="from">
      ${cols.map(col).join('')}
      <div class="col add-col"><button class="add-bucket" data-act="fromAddBucket">${icon('plus', 14)} Add new bucket</button></div>
    </div>
  </div>`;
}
/** Your open tasks from every plan that are late, due today or due this week. */
const DUE_SOON = [['late', 'Late'], ['today', 'Today'], ['tomorrow', 'This week'], ['week', 'This week']];
const dueSoonTasks = () => S.tasks.filter((t) => t.assignees.includes(S.meId) && !isDone(t) && !t.box && DUE_SOON.some(([k]) => k === dueGroupOf(t.due)));
/** Late or due today: the number on My Planner in the sidebar and tab bar. */
const dueSoonCount = () => dueSoonTasks().filter((t) => ['late', 'today'].includes(dueGroupOf(t.due))).length;
function dueSoonHTML() {
  const tasks = dueSoonTasks().sort((a, b) => String(a.due).localeCompare(String(b.due)) || a.priority - b.priority);
  const groups = [['Late', tasks.filter((t) => dueGroupOf(t.due) === 'late')], ['Today', tasks.filter((t) => dueGroupOf(t.due) === 'today')],
    ['This week', tasks.filter((t) => ['tomorrow', 'week'].includes(dueGroupOf(t.due)))]];
  return `<section class="due-hub"><h2>My Tasks: due soon <span class="count">${tasks.length}</span></h2>
    ${tasks.length ? `<div class="due-cols">${groups.map(([label, list]) => `<div class="due-col ${label === 'Late' && list.length ? 'late' : ''}"><h3>${label} <small>${list.length}</small></h3>
      ${list.map((t) => cardHTML(t, { showPlan: true })).join('') || '<p class="muted small">Nothing.</p>'}</div>`).join('')}</div>`
    : '<p class="muted small">Nothing due this week.</p>'}</section>`;
}
function renderHub() {
  const plans = [...S.plans].sort((a, b) => (b.pinned - a.pinned) || (b.lastOpened - a.lastOpened));
  const card = (p) => {
    const ts = tasksOf(p.id);
    const open = ts.filter((t) => !isDone(t)).length;
    const late = ts.filter(isLate).length;
    const pct = ts.length ? Math.round(((ts.length - open) / ts.length) * 100) : 0;
    return `<article class="plan-card">
      <a href="#/plan/${esc(p.id)}" class="plan-card-link">
        ${planTile(p, 40)}
        <div class="plan-card-body"><h3>${esc(planLabel(p))}</h3>
          <p>${open} open${late ? ` · <span class="danger-text">${late} late</span>` : ''}</p></div>
      </a>
      <div class="meter" role="img" aria-label="${pct}% complete"><i style="width:${pct}%"></i></div>
      <button class="icon-btn pin ${p.pinned ? 'on' : ''}" data-act="togglePin" data-id="${esc(p.id)}" aria-label="${p.pinned ? 'Unpin' : 'Pin'} ${esc(p.name)}" title="${p.pinned ? 'Unpin' : 'Pin'}">${icon('star')}</button>
    </article>`;
  };
  return `<div class="page">
    <header class="page-head"><h1>Planner</h1></header>
    ${dueSoonHTML()}
    ${plans.length ? `<div class="plan-grid">${plans.map(card).join('')}<button class="plan-card plan-new" data-act="newPlan">${icon('plus', 20)}<span>New plan</span></button></div>`
      : `<div class="empty"><h2>No plans yet</h2><button class="btn primary" data-act="newPlan">${icon('plus')} New plan</button></div>`}
  </div>`;
}

// ---------- Cards and boards ----------
function cardPreview(t) {
  const images = allFiles(t).filter((a) => a.thumb);
  const mode = t.preview === 'auto' ? (images.length ? 'attachment' : t.checklist.length ? 'checklist' : t.notes ? 'notes' : 'none') : t.preview;
  if (mode === 'attachment' && images.length) return `<img class="card-img" src="${esc(images[0].thumb)}" alt="">`;
  if (mode === 'checklist' && t.checklist.length) {
    return `<ul class="card-check">${t.checklist.filter((c) => !c.done).slice(0, 4).map((c) => `<li><button class="check small" data-act="cardCheck" data-task="${esc(t.id)}" data-item="${esc(c.id)}" aria-label="Complete ${esc(c.text)}"></button><span>${esc(c.text)}</span></li>`).join('')}</ul>`;
  }
  if (mode === 'notes' && t.notes) return `<p class="card-notes">${esc(t.notes)}</p>`;
  return '';
}
function cardHTML(t, { showPlan } = {}) {
  const plan = planById(t.planId);
  const doneItems = t.checklist.filter((c) => c.done).length;
  const meta = [
    S.inbox.some((n) => n.taskId === t.id && !n.read) ? `<span class="meta alert" title="New notifications on this task">${icon('bell', 13)}${S.inbox.filter((n) => n.taskId === t.id && !n.read).length}</span>` : '',
    t.decisionReq?.status === 'pending' && t.decision?.deadline ? `<span class="meta ${t.decision.deadline < todayISO() ? 'late' : ''}" title="Decision deadline">⚑ ${fmtDate(t.decision.deadline)}</span>` : '',
    t.approvalReq?.status === 'pending' ? `<span class="meta ${t.approval?.deadline && t.approval.deadline < todayISO() ? 'late' : ''}" title="Approval request">✓ Approval${t.approval?.deadline ? ` ${fmtDate(t.approval.deadline)}` : ''}</span>` : '',
    t.review ? `<span class="meta checking" title="Submitted for checking ${esc(fmtDateTime(t.review.at))}">Checking</span>` : '',
    timeboxMeta(t), priorityIcon(t.priority),
    t.due ? `<span class="meta ${isLate(t) ? 'late' : ''}" ${isLate(t) ? 'title="Late"' : ''}>${icon('cal', 13)}${fmtDate(t.due)}</span>` : '',
    t.repeat ? `<span class="meta" title="Repeats">${icon('repeat', 13)}</span>` : '',
    t.checklist.length ? `<span class="meta" title="Checklist">${icon('list', 13)}${doneItems}/${t.checklist.length}</span>` : '',
    allFiles(t).length ? `<span class="meta" title="Files and links">${icon('clip', 13)}${allFiles(t).length}</span>` : '',
    t.comments.some((c) => !c.deleted) ? `<span class="meta" title="Messages">${icon('chat', 13)}${t.comments.filter((c) => !c.deleted).length}</span>` : '',
  ].join('');
  return `<article class="card ${isDone(t) ? 'done' : ''}" data-open-task="${esc(t.id)}" data-drag="task" data-id="${esc(t.id)}" tabindex="0" aria-label="${esc(t.title || 'Untitled task')}">
    ${t.labels.length ? `<div class="card-labels">${orderedLabels(plan, t.labels).map((l) => labelChip(plan, l)).join('')}</div>` : ''}
    <div class="card-title"><button class="check ${isDone(t) ? 'on' : ''} ${t.review ? 'pending' : ''}" data-act="toggleDone" data-id="${esc(t.id)}" aria-label="${checkLabel(t)}" title="${checkLabel(t)}">${icon('check', 12)}</button><span>${esc(t.title || 'Untitled task')}</span></div>
    ${t.box ? '' : `<button class="icon-btn card-tb ${isScheduled(t) ? 'booked' : t.tbQueued ? 'on' : ''}" data-act="cardTimebox" data-id="${esc(t.id)}" aria-label="${isScheduled(t) ? 'Go to its Time Box' : t.tbQueued ? 'In your Time Box list (tap to take it off)' : 'Assign to Time Box'}">${icon('clock', 18)}</button>`}
    <button class="icon-btn card-more" data-act="cardMenu" data-id="${esc(t.id)}" aria-label="More options for ${esc(t.title || 'Untitled task')}" title="More options">${icon('more', 16)}</button>
    ${cardPreview(t)}
    ${showPlan && plan ? `<div class="card-plan">${planTile(plan, 14)}${esc(plan.name)}</div>` : ''}
    ${progressBarHTML(t)}
    ${meta || t.assignees.length ? `<footer><div class="card-meta">${meta}</div><div class="name-chips">${t.assignees.slice(0, 3).map((a) => nameChip(person(a))).join('')}${t.assignees.length > 3 ? `<span class="name-chip more">+${t.assignees.length - 3}</span>` : ''}</div></footer>` : ''}
  </article>`;
}

/**
 * In your own planner, tasks other people assigned to you get a bucket per person ("Assigned by Ven"),
 * so they're easy to find. The tasks stay in the plan they were made in.
 */
function assignedToMeGroups(plan) {
  if (!plan.personal) return [];
  const mine = S.tasks.filter((t) => t.planId !== plan.id && delegatedToMe(t) && !t.boxId && !myBucketOf(t));
  const by = [...new Set(mine.map((t) => delegatorOf(t)))];
  return by.map((id) => ({
    key: `from:${id}`, label: `Assigned by ${person(id)?.name || 'someone'}`, person: person(id), locked: true, movable: true, noAdd: true,
    color: plan.fromColor?.[`from:${id}`] || '',
    tasks: applyFilter(mine.filter((t) => delegatorOf(t) === id), filterOf(plan.id)).sort((a, b) => (a.myOrder ?? a.order) - (b.myOrder ?? b.order)),
  }));
}
/** Your own planner's columns: its buckets with the "Assigned by" buckets placed where you put them. */
function placeFromGroups(plan, real, from) {
  const cols = [...real];
  // "Assigned by" buckets go at the end, until you move them.
  from.forEach((g) => { const at = plan.fromPos?.[g.key]; cols.splice(Number.isInteger(at) ? Math.min(at, cols.length) : cols.length, 0, g); });
  return cols;
}
function boardHTML(groups, by, ctx) {
  const col = (g) => {
    const key = `${ctx.key}:${g.key}`;
    const splitDone = by !== 'progress' && by !== 'status' && by !== 'stage';
    const open = splitDone ? g.tasks.filter((t) => !isDone(t)) : g.tasks;
    const done = splitDone ? g.tasks.filter(isDone) : [];
    const showDone = ui.showDone[key];
    const head = g.bucket
      ? `<input class="col-title-input" value="${esc(g.label)}" data-change="bucketName" data-bucket="${esc(g.key)}" aria-label="Bucket name">`
      : `<span class="col-title">${g.person ? avatar(g.person, 22) : ''}${g.color ? `<i class="dot" style="background:${g.color}"></i>` : ''}${g.plan ? planTile(g.plan, 20) : ''}<b>${esc(g.label)}</b></span>`;
    const adding = ui.quickAdd === key;
    const movable = g.bucket || g.movable;
    return `<section class="col ${g.color ? 'tinted' : ''}" data-group="${esc(g.key)}" ${g.locked ? 'data-locked="1"' : ''} ${movable ? `data-bucket-id="${esc(g.key)}"` : ''} ${g.color ? `style="--bc:${g.color}"` : ''}>
      <header class="col-head" ${movable ? 'data-drag="bucket"' : ''} data-id="${esc(g.key)}">
        ${movable ? `<span class="grip col-grip" aria-hidden="true" title="Drag to move">⋮⋮</span>` : ''}
        ${head}<span class="count">${open.length}</span>
        ${g.bucket ? `<button class="icon-btn" data-act="bucketMenu" data-id="${esc(g.key)}" aria-label="Bucket options for ${esc(g.label)}">${icon('more')}</button>` : ''}
        ${g.movable ? `<button class="icon-btn" data-act="colourFrom" data-id="${esc(g.key)}" aria-label="Colour for ${esc(g.label)}">${icon('more')}</button>` : ''}
      </header>
      ${g.locked || g.noAdd || othersPlan(planById(ctx.planId)) ? '' : adding
        ? `<form class="quick-add" data-submit="quickAdd" data-group="${esc(g.key)}" data-key="${esc(key)}"><input name="title" placeholder="Task name" data-focus="qa-${esc(key)}" autocomplete="off" aria-label="Task name"><div class="row"><button class="btn primary sm">Add task</button><button class="btn ghost sm" type="button" data-act="cancelQuickAdd">Cancel</button></div></form>`
        : `<button class="add-task" data-act="openQuickAdd" data-key="${esc(key)}">${icon('plus', 14)} Add task</button>`}
      <div class="col-body" data-drop="tasks" data-scroll="col-${esc(key)}">
        ${open.map((t) => cardHTML(t, ctx)).join('')}
        ${done.length ? `<button class="show-done" data-act="toggleShowDone" data-key="${esc(key)}">${icon(showDone ? 'chevD' : 'chevR', 12)} ${showDone ? 'Hide' : 'Show'} completed (${done.length})</button>` : ''}
        ${showDone ? done.map((t) => cardHTML(t, ctx)).join('') : ''}
      </div>
    </section>`;
  };
  return `<div class="board" data-scroll="board-${esc(ctx.key)}" data-by="${esc(by)}">
    ${groups.map(col).join('')}
    ${by === 'bucket' ? `<div class="col add-col"><button class="add-bucket" data-act="addBucket">${icon('plus', 14)} Add new bucket</button></div>` : ''}
  </div>`;
}

// ---------- Grid ----------
function gridHTML(tasks, ctx) {
  const { key: sortKey, dir } = ui.gridSort;
  const value = {
    title: (t) => t.title.toLowerCase(), order: (t) => t.order, start: (t) => t.start || '9999', due: (t) => t.due || '9999', progress: (t) => t.progress, priority: (t) => t.priority,
    bucket: (t) => bucketName(t).toLowerCase(), plan: (t) => planById(t.planId)?.name.toLowerCase() || '',
    assignee: (t) => t.assignees.map((a) => person(a)?.name).join(',').toLowerCase(),
    health: (t) => ({ red: 0, yellow: 1, green: 2 }[t.health] ?? 3),
  }[sortKey] || ((t) => t.order);
  const rows = [...tasks].sort((a, b) => { const [x, y] = [value(a), value(b)]; return (x < y ? -1 : x > y ? 1 : 0) * dir; });
  const th = (k, label) => `<th aria-sort="${sortKey === k ? (dir > 0 ? 'ascending' : 'descending') : 'none'}"><button data-act="gridSort" data-key="${k}">${label}${sortKey === k ? icon(dir > 0 ? 'up' : 'down', 12) : ''}</button></th>`;
  const select = (t, field, opts, val) => `<select data-change="gridField" data-field="${field}" data-id="${esc(t.id)}" aria-label="${field}">${opts.map((o) => `<option value="${esc(o.v)}" ${String(o.v) === String(val) ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}</select>`;
  const row = (t) => {
    const plan = planById(t.planId);
    const bp = boardPlanOf(t) || plan;
    const bucketOpts = bp.buckets.map((b) => ({ v: b.id, label: b.name })).concat(delegatedToMe(t) ? [{ v: '', label: `Assigned by ${person(delegatorOf(t))?.name || 'someone'}` }] : []);
    return `<tr class="${isDone(t) ? 'done' : ''}">
      <td class="c-check"><button class="check ${isDone(t) ? 'on' : ''} ${t.review ? 'pending' : ''}" data-act="toggleDone" data-id="${esc(t.id)}" aria-label="${checkLabel(t)}" title="${checkLabel(t)}">${icon('check', 12)}</button></td>
      <td class="c-title"><button class="link-btn" data-open-task="${esc(t.id)}">${esc(t.title || 'Untitled task')}</button>${t.repeat ? icon('repeat', 12) : ''}</td>
      <td><button class="avatars assign-cell" data-act="pickAssignees" data-id="${esc(t.id)}" aria-label="Assign task">${t.assignees.length ? t.assignees.slice(0, 3).map((a) => avatar(person(a), 24)).join('') : `<span class="muted">Assign</span>`}</button></td>
      <td><input type="date" value="${t.start || ''}" data-change="gridField" data-field="start" data-id="${esc(t.id)}" aria-label="Start date"></td>
      <td class="${isLate(t) ? 'late' : ''}"><input type="date" value="${t.due || ''}" data-change="gridField" data-field="due" data-id="${esc(t.id)}" aria-label="Due date"></td>
      <td>${ctx.crossPlan ? `<a class="muted" href="#/plan/${esc(t.planId)}">${esc(plan?.name || '')}</a>` : select(t, 'bucketId', bucketOpts, delegatedToMe(t) ? myBucketOf(t) || '' : t.bucketId)}</td>
      <td>${select(t, 'progress', PROGRESS, t.progress)}</td>
      <td>${select(t, 'priority', PRIORITY, t.priority)}</td>
      <td class="c-health">${healthDot(t)}${select(t, 'health', [{ v: '', label: 'Not set' }, ...HEALTH.map((h) => ({ v: h.v, label: h.label }))], t.health)}</td>
      <td class="c-labels"><button class="assign-cell" data-act="pickLabels" data-id="${esc(t.id)}" aria-label="Edit labels">${t.labels.length ? orderedLabels(plan, t.labels).map((l) => labelChip(plan, l)).join('') : `<span class="muted">Add</span>`}</button></td>
    </tr>`;
  };
  return `<div class="grid-wrap" data-scroll="grid-${esc(ctx.key)}">
    ${othersPlan(planById(ctx.planId)) ? '' : `<form class="grid-add" data-submit="gridAdd"><span>${icon('plus', 14)}</span><input name="title" placeholder="Add a task" data-focus="grid-add" autocomplete="off" aria-label="Add a task"></form>`}
    <table class="grid"><thead><tr><th></th>${th('title', 'Task')}${th('assignee', 'Assigned to')}${th('start', 'Start')}${th('due', 'Due')}${ctx.crossPlan ? th('plan', 'Plan') : th('bucket', 'Bucket')}${th('progress', 'Progress')}${th('priority', 'Priority')}${th('health', 'Traffic light')}<th>Labels</th></tr></thead>
    <tbody>${rows.map(row).join('') || `<tr><td colspan="10" class="muted center">No tasks match.</td></tr>`}</tbody></table>
  </div>`;
}

// ---------- Schedule ----------
function scheduleHTML(tasks, plan) {
  const { mode, anchor } = ui.sched;
  const first = mode === 'month' ? `${anchor.slice(0, 8)}01` : weekStartOf(anchor);
  const start = weekStartOf(first);
  const month = anchor.slice(0, 7);
  const weeks = [];
  if (mode === 'week') weeks.push(start);
  else for (let w = start; w.slice(0, 7) <= month; w = addDays(w, 7)) weeks.push(w);
  const dated = tasks.filter((t) => t.due || t.start);
  const maxLanes = mode === 'month' ? 3 : 14;
  const t0 = todayISO();

  const weekHTML = (w) => {
    const days = Array.from({ length: 7 }, (_, i) => addDays(w, i));
    const end = days[6];
    const hits = dated.map((t) => ({ t, a: t.start || t.due, b: t.due || t.start })).filter((h) => h.a <= end && h.b >= w)
      .sort((x, y) => x.a.localeCompare(y.a) || daysBetween(y.a, y.b) - daysBetween(x.a, x.b));
    const lanes = [];
    const overflow = Array(7).fill(0);
    let bars = '';
    for (const h of hits) {
      const c1 = Math.max(0, daysBetween(w, h.a));
      const c2 = Math.min(6, daysBetween(w, h.b));
      let lane = lanes.findIndex((lastCol) => lastCol < c1);
      if (lane < 0) { lane = lanes.length; lanes.push(-1); }
      if (lane >= maxLanes) { for (let c = c1; c <= c2; c++) overflow[c]++; continue; }
      lanes[lane] = c2;
      const color = h.t.labels.length ? LABELS[h.t.labels[0]][1] : '#3e5170';
      const cls = [isLate(h.t) ? 'late' : '', isDone(h.t) ? 'done' : '', h.a < w ? 'cont-l' : '', h.b > end ? 'cont-r' : ''].join(' ');
      bars += `<button class="bar ${cls}" style="grid-column:${c1 + 1}/${c2 + 2};grid-row:${lane + 2};background:${color};color:${inkOn(color)}" data-open-task="${esc(h.t.id)}" data-drag="task" data-id="${esc(h.t.id)}" title="${esc(h.t.title)}">${esc(h.t.title || 'Untitled task')}</button>`;
    }
    const cells = days.map((d) => `<div class="cal-cell ${d === t0 ? 'today' : ''} ${mode === 'month' && d.slice(0, 7) !== month ? 'other' : ''}" data-date="${d}" ${othersPlan(plan) ? '' : 'data-act="calAdd"'}></div>`).join('');
    const nums = days.map((d, i) => `<span class="cal-num ${d === t0 ? 'today' : ''}" style="grid-column:${i + 1};grid-row:1">${parseISO(d).getDate()}</span>`).join('');
    const more = overflow.map((n, i) => (n ? `<button class="cal-more" style="grid-column:${i + 1};grid-row:${maxLanes + 2}" data-act="calWeek" data-date="${days[i]}">+${n} more</button>` : '')).join('');
    return `<div class="cal-week ${mode}" style="--lanes:${mode === 'month' ? maxLanes : Math.max(lanes.length + 1, 6)}"><div class="cal-cells">${cells}</div><div class="cal-bars">${nums}${bars}${more}</div></div>`;
  };

  const title = mode === 'month'
    ? parseISO(`${month}-01`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
    : `${fmtDate(start)} – ${fmtDate(addDays(start, 6))}`;
  const unscheduled = tasks.filter((t) => !t.due && !t.start && !isDone(t)).sort(byOrder);
  const dayNames = Array.from({ length: 7 }, (_, i) => parseISO(addDays(start, i)).toLocaleDateString(undefined, { weekday: 'short' }));
  return `<div class="schedule">
    <div class="cal">
      <div class="cal-bar">
        <div class="seg"><button class="${mode === 'month' ? 'on' : ''}" data-act="schedMode" data-mode="month">Month</button><button class="${mode === 'week' ? 'on' : ''}" data-act="schedMode" data-mode="week">Week</button></div>
        <button class="icon-btn" data-act="schedNav" data-dir="-1" aria-label="Previous">${icon('chevL')}</button>
        <button class="icon-btn" data-act="schedNav" data-dir="1" aria-label="Next">${icon('chevR')}</button>
        <button class="btn ghost sm" data-act="schedToday">Today</button>
        <h2>${esc(title)}</h2>
      </div>
      <div class="cal-grid">
        <div class="cal-days">${dayNames.map((d) => `<span>${esc(d)}</span>`).join('')}</div>
        ${weeks.map(weekHTML).join('')}
      </div>
    </div>
    <aside class="unscheduled">
      <h3>Unscheduled <span class="count">${unscheduled.length}</span></h3>
      
      <div class="unscheduled-list" data-scroll="unsched-${plan ? esc(plan.id) : 'x'}">${unscheduled.map((t) => `<button class="unsched" data-open-task="${esc(t.id)}" data-drag="task" data-id="${esc(t.id)}">${esc(t.title || 'Untitled task')}</button>`).join('') || `<p class="muted small">Every open task has a date.</p>`}</div>
    </aside>
  </div>`;
}

// ---------- Charts ----------
const STATUS = [
  { key: 'notStarted', label: 'Not started', color: 'var(--st-none)', test: (t) => t.progress === 0 && !isLate(t) },
  { key: 'progress', label: 'In progress', color: 'var(--st-doing)', test: (t) => inProgress(t) && !isLate(t) },
  { key: 'late', label: 'Late', color: 'var(--st-late)', test: isLate },
  { key: 'done', label: 'Completed', color: 'var(--st-done)', test: isDone },
];
function chartsHTML(tasks, plan) {
  if (!tasks.length) return `<div class="empty"><h2>Nothing to chart yet</h2></div>`;
  const counts = STATUS.map((s) => ({ ...s, n: tasks.filter(s.test).length }));
  const total = tasks.length;
  const pct = Math.round((counts[3].n / total) * 100);

  const R = 54; const C = 2 * Math.PI * R; let offset = 0;
  const arcs = counts.filter((c) => c.n).map((c) => {
    const len = (c.n / total) * C;
    const gap = counts.filter((x) => x.n).length > 1 ? 2 : 0;
    const arc = `<circle cx="70" cy="70" r="${R}" fill="none" stroke="${c.color}" stroke-width="14" stroke-dasharray="${Math.max(len - gap, 1)} ${C - Math.max(len - gap, 1)}" stroke-dashoffset="${-offset}" transform="rotate(-90 70 70)" data-tip="${esc(c.label)}: ${c.n} of ${total}" tabindex="0"><title>${esc(c.label)}: ${c.n}</title></circle>`;
    offset += len;
    return arc;
  }).join('');

  const legend = `<ul class="legend">${STATUS.map((s) => `<li><i style="background:${s.color}"></i>${s.label}</li>`).join('')}</ul>`;
  const rowsFor = (groups) => groups.filter((g) => g.tasks.length || !g.hideEmpty).map((g) => ({ label: g.label, parts: STATUS.map((s) => ({ ...s, n: g.tasks.filter(s.test).length })), total: g.tasks.length }));
  const barBlock = (title, rows) => {
    const max = Math.max(1, ...rows.map((r) => r.total));
    const stack = (r) => r.parts.filter((p) => p.n).map((p) => `<i style="flex:${p.n};background:${p.color}" data-tip="${esc(r.label)} · ${esc(p.label)}: ${p.n}" tabindex="0"></i>`).join('');
    return `<section class="chart-card"><h3>${esc(title)}</h3>${legend}
      ${ui.chartTable
        ? `<table class="chart-table"><thead><tr><th></th>${STATUS.map((s) => `<th>${s.label}</th>`).join('')}<th>Total</th></tr></thead><tbody>${rows.map((r) => `<tr><th>${esc(r.label)}</th>${r.parts.map((p) => `<td>${p.n}</td>`).join('')}<td>${r.total}</td></tr>`).join('')}</tbody></table>`
        : `<div class="bars">${rows.map((r) => `<div class="bar-row"><span class="bar-label" title="${esc(r.label)}">${esc(r.label)}</span><div class="bar-track"><div class="bar-stack" style="width:${(r.total / max) * 100}%">${stack(r)}</div></div><span class="bar-total">${r.total}</span></div>`).join('')}</div>`}
    </section>`;
  };
  const buckets = plan ? groupsFor('bucket', tasks, plan) : groupsFor('plan', tasks);
  const priorities = groupsFor('priority', tasks, plan);
  const people = groupsFor('assignee', tasks, plan).map((g) => ({ ...g, hideEmpty: g.key === 'none' }));
  return `<div class="charts">
    <div class="chart-bar"><div class="stats">
      ${counts.map((c) => `<div class="stat"><i style="background:${c.color}"></i><span>${c.label}</span><b>${c.n}</b></div>`).join('')}
    </div><button class="btn ghost sm" data-act="toggleChartTable">${ui.chartTable ? 'Show charts' : 'Show as table'}</button></div>
    <div class="chart-grid">
      <section class="chart-card"><h3>Status</h3>${legend}
        <div class="donut"><svg viewBox="0 0 140 140" width="180" height="180" role="img" aria-label="${pct}% of ${total} tasks completed">${arcs}<text x="70" y="68" text-anchor="middle" class="donut-num">${pct}%</text><text x="70" y="85" text-anchor="middle" class="donut-sub">complete</text></svg></div>
      </section>
      ${barBlock(plan ? 'By bucket' : 'By plan', rowsFor(buckets))}
      ${barBlock('By priority', rowsFor(priorities))}
      ${barBlock('By person', rowsFor(people))}
    </div>
  </div>`;
}

// ---------- Plan + personal pages ----------
function toolbar({ fkey, by, options, tab, tabs }) {
  const n = filterCount(filterOf(fkey));
  return `<div class="toolbar">
    <div class="tabs" role="tablist">${tabs.map(([k, label]) => `<button role="tab" aria-selected="${tab === k}" class="${tab === k ? 'on' : ''}" data-act="setTab" data-tab="${k}">${label}</button>`).join('')}</div>
    <div class="spacer"></div>
    ${tab === 'board' ? `<button class="btn ghost sm" data-act="groupMenu" data-options="${options.join(',')}">${icon('group', 14)} Group by ${esc(GROUPINGS[by])}</button>` : ''}
    <button class="btn ghost sm ${n ? 'active' : ''}" data-act="filterMenu">${icon('filter', 14)} Filter${n ? ` (${n})` : ''}</button>
    ${n ? `<button class="btn ghost sm" data-act="clearFilter">Clear</button>` : ''}
    <button class="btn ghost sm text-size-btn" data-act="sizeMenu" aria-label="Text size" title="Text size"><span aria-hidden="true">A<small>A</small></span></button>
  </div>`;
}
const TABS = [['grid', 'Grid'], ['board', 'Board'], ['schedule', 'Schedule'], ['charts', 'Charts']];

function renderPlan(plan) {
  const fkey = plan.id;
  const tab = ui.planTab[plan.id] || 'board';
  const by = ui.groupBy[plan.id] || 'bucket';
  const tasks = applyFilter(boardTasks(plan), filterOf(fkey));
  const ctx = { key: plan.id, planId: plan.id };
  const body = {
    board: () => boardHTML(by === 'bucket' ? placeFromGroups(plan, groupsFor(by, tasks, plan), assignedToMeGroups(plan)) : groupsFor(by, tasks, plan), by, { ...ctx, showPlan: true }), grid: () => gridHTML(tasks, ctx),
    schedule: () => scheduleHTML(tasks, plan), charts: () => chartsHTML(tasks, plan),
  }[tab]();
  return `<div class="plan-page">
    <header class="plan-head">
      ${planTile(plan, 36)}
      ${plan.owner && plan.owner !== S.meId && person(plan.owner) ? `<h1 class="plan-title">${esc(planLabel(plan))}</h1>` : `<input class="plan-title" value="${esc(plan.name)}" data-change="planName" data-id="${esc(plan.id)}" aria-label="Plan name">`}
      <button class="icon-btn pin ${plan.pinned ? 'on' : ''}" data-act="togglePin" data-id="${esc(plan.id)}" aria-label="${plan.pinned ? 'Unpin plan' : 'Pin plan'}" title="${plan.pinned ? 'Unpin' : 'Pin'}">${icon('star')}</button>
      <div class="spacer"></div>
      <button class="avatars members" data-act="pickMembers" aria-label="Plan members">${plan.members.slice(0, 5).map((m) => avatar(person(m), 26)).join('')}</button>
      <button class="icon-btn" data-act="planMenu" aria-label="Plan options">${icon('more')}</button>
    </header>
    ${toolbar({ fkey, by, tab, tabs: TABS, options: ['bucket', 'assignee', 'progress', 'due', 'priority', 'label', 'health', 'work'] })}
    <div class="view">${body}</div>
  </div>`;
}

function renderSearch() {
  const q = ui.search.trim().toLowerCase();
  const hits = S.tasks.filter((t) => [t.title, t.notes, ...t.checklist.map((c) => c.text), ...t.comments.filter((c) => !c.deleted).map((c) => c.text)].some((s) => String(s).toLowerCase().includes(q))).slice(0, 100);
  const plans = S.plans.filter((p) => p.name.toLowerCase().includes(q));
  return `<div class="page narrow">
    <header class="page-head"><h1>Results for “${esc(ui.search)}”</h1></header>
    ${plans.length ? `<h2 class="sub-head">Plans</h2><ul class="day-list">${plans.map((p) => `<li class="day-row"><a class="day-title" href="#/plan/${esc(p.id)}">${planTile(p, 24)} <b>${esc(p.name)}</b></a></li>`).join('')}</ul>` : ''}
    ${hits.length ? `<h2 class="sub-head">Tasks</h2><ul class="day-list">${hits.map((t) => `<li class="day-row"><button class="day-title" data-open-task="${esc(t.id)}"><b>${esc(t.title || 'Untitled task')}</b><small>${esc(planById(t.planId)?.name || '')} · ${esc(bucketName(t))}</small></button></li>`).join('')}</ul>` : ''}
    ${!plans.length && !hits.length ? `<div class="empty"><h2>No matches</h2></div>` : ''}
  </div>`;
}

function renderMain() {
  const r = ui.route;
  if (ui.search.trim()) return renderSearch();
  if (r.view === 'plan') {
    const plan = planById(r.id);
    return plan ? renderPlan(plan) : renderHub();
  }
  if (r.view === 'person') {
    const pp = personPlanById(r.id);
    return pp ? renderPersonPlan(pp) : renderHub();
  }
  if (r.view === 'report') return renderReport();
  if (r.view === 'req') return renderRequests();
  if (r.view === 'from') return renderDelegatedFrom();
  if (r.view === 'history') return renderApprovalHistory();
  if (r.view === 'admin') return renderAdmin();
  if (r.view === 'fitness') return renderFitness();
  if (r.view === 'growth') return renderGrowth();
  if (r.view === 'timebox') return renderPlanner();
  if (r.view === 'halfplan') return renderBrandPlan();
  return renderHub();
}
