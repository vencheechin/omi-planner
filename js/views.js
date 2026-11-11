'use strict';
/* Everything rendered into the sidebar and main area: hub, boards, grids, schedule, charts. */

const ui = {
  route: { view: 'hub' }, openTask: null, search: '', navOpen: false,
  planTab: {}, groupBy: {}, filters: {}, showDone: {}, quickAdd: null, gridSort: { key: 'order', dir: 1 },
  sched: { mode: 'month', anchor: todayISO() }, chartTable: false, pop: null, draft: { comment: '' },
  labelCtx: null, labelQuery: '', labelEdit: null, dayView: matchMedia('(max-width: 760px)').matches ? 'day' : 'week', dayDate: todayISO(), tbFullDay: false, tbPicked: [], tbShowOthers: false, report: { scope: 'me', person: '', status: '', from: '', to: '' },
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
/** A small ring that fills with the task's progress (10%, 50%, 80%). */
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
    && (!f.bucket.length || f.bucket.includes(t.bucketId))
    && (!f.label.length || t.labels.some((l) => f.label.includes(l)))
    && (!f.assignee.length || t.assignees.some((a) => f.assignee.includes(a)) || (f.assignee.includes('none') && !t.assignees.length))
    && (!f.health.length || f.health.includes(t.health || 'none'))
    && (!f.work.length || f.work.includes(t.workType || '')));
}

// ---------- Grouping ----------
const GROUPINGS = { bucket: 'Bucket', assignee: 'Assigned to', progress: 'Progress', due: 'Due date', priority: 'Priority', label: 'Labels', plan: 'Plan', status: 'Status', health: 'Traffic light', work: 'Work type' };

function groupsFor(by, tasks, plan) {
  const sorted = [...tasks].sort(byOrder);
  const pick = (test) => sorted.filter(test);
  switch (by) {
    case 'bucket': return plan.buckets.map((b) => ({ key: b.id, label: b.name, bucket: true, tasks: pick((t) => t.bucketId === b.id) }));
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
    default: return [];
  }
}

/** Changes a task so it belongs to group `to`. Returns false when that group can't be dropped on. */
function applyGroup(t, by, from, to) {
  if (from === to) return true;
  switch (by) {
    case 'bucket': {
      const target = planById(t.planId).buckets.find((b) => b.id === to);
      if (target?.kind === 'checking' && !t.review && needsReview(t)) { submitForReview(t); break; }
      if (t.review && target?.kind !== 'checking') endReview(t);
      t.bucketId = to;
      break;
    }
    case 'health': setField(t, 'health', to === 'none' ? '' : to); break;
    case 'work': t.workType = to === 'other' ? '' : to; break;
    case 'status':
      if (to === 'checking') { if (!needsReview(t)) return false; submitForReview(t); break; }
      setProgress(t, { todo: 0, doing: inProgress(t) ? t.progress : 50, done: 100 }[to]);
      break;
    case 'assignee':
      if (to === 'none') { t.assignees = []; break; }
      t.assignees = t.assignees.filter((a) => a !== from);
      if (!t.assignees.includes(to)) t.assignees.push(to);
      break;
    case 'progress': setProgress(t, Number(to)); break;
    case 'priority': t.priority = Number(to); break;
    case 'due':
      if (to === 'late') return false;
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
const planLabel = (p) => (p.owner && p.owner !== S.meId && person(p.owner) ? `${p.name} (${person(p.owner).name})` : p.name);
/** "Ven's Planner" once you've set your name in Settings; plain "Planner" until then. */
const plannerName = () => { const n = (person(S.meId)?.name || '').trim(); return n && n !== 'Me' ? `${n}${/s$/i.test(n) ? "'" : "'s"} Planner` : 'Planner'; };
function renderSidebar() {
  const r = ui.route;
  const link = (view, label, ic, count) => `<a class="nav-item ${r.view === view ? 'active' : ''}" href="#/${view}">${icon(ic, 18)}<span>${label}</span>${count ? `<em>${count}</em>` : ''}</a>`;
  const planLink = (p) => `<a class="nav-item plan ${r.view === 'plan' && r.id === p.id ? 'active' : ''}" href="#/plan/${esc(p.id)}">${planTile(p, 22)}<span>${esc(planLabel(p))}</span></a>`;
  const pinned = S.plans.filter((p) => p.pinned);
  const recent = S.plans.filter((p) => !p.pinned).sort((a, b) => b.lastOpened - a.lastOpened).slice(0, 6);
  const mine = S.tasks.filter((t) => t.assignees.includes(S.meId) && !isDone(t)).length;
  const day = S.tasks.filter(inMyDay).length;
  const toCheck = S.tasks.filter(isReviewer).length;
  const personLink = (pp) => {
    const waiting = personPlanTasks(pp).filter((t) => t.review).length;
    return `<a class="nav-item plan ${r.view === 'person' && r.id === pp.id ? 'active' : ''}" href="#/person/${esc(pp.id)}">${avatar(person(pp.personId), 22)}<span>${esc(pp.name)}</span>${waiting ? `<em class="to-check" title="Waiting for your check">${waiting}</em>` : ''}</a>`;
  };
  $('#sidebar').innerHTML = `
    <a class="brand" href="#/hub"><img src="icons/omi-logo.svg" width="34" height="34" alt="OMI"><span>${esc(plannerName())}</span></a>
    <button class="btn primary new-plan" data-act="newPlan">${icon('plus')} New plan</button>
    <button class="btn ghost sm import-plan" data-act="importPlanner" title="Import a plan exported from Microsoft Planner to Excel">${icon('upload', 14)} Import from Microsoft Planner</button>
    <nav aria-label="Main">
      ${link('hub', 'My plans', 'home')}${link('my-day', 'My Day', 'sun', day)}${link('timebox', 'Time Box', 'clock', timeboxQueue().length)}${link('my-tasks', 'My Tasks', 'user', mine)}${link('report', 'Assignments', 'chart', toCheck)}
      ${S.personPlans.length ? `<h3>People</h3>${S.personPlans.map(personLink).join('')}` : ''}
      ${pinned.length ? `<h3>Pinned</h3>${pinned.map(planLink).join('')}` : ''}
      ${recent.length ? `<h3>Recent</h3>${recent.map(planLink).join('')}` : ''}
    </nav>`;
  document.body.classList.toggle('nav-open', ui.navOpen);
  document.title = plannerName();
}

// ---------- Hub ----------
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
    <header class="page-head"><h1>My plans</h1></header>
    ${plans.length ? `<div class="plan-grid">${plans.map(card).join('')}</div>`
      : `<div class="empty"><h2>No plans yet</h2><p>Create a plan to start organising tasks.</p><button class="btn primary" data-act="newPlan">${icon('plus')} New plan</button></div>`}
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
    t.review ? `<span class="meta checking" title="Submitted for checking ${esc(fmtDateTime(t.review.at))}">Checking</span>` : '',
    timeboxMeta(t), progressIcon(t), priorityIcon(t.priority),
    t.due ? `<span class="meta ${isLate(t) ? 'late' : ''}" ${isLate(t) ? 'title="Late"' : ''}>${icon('cal', 13)}${fmtDate(t.due)}</span>` : '',
    t.repeat ? `<span class="meta" title="Repeats">${icon('repeat', 13)}</span>` : '',
    t.checklist.length ? `<span class="meta" title="Checklist">${icon('list', 13)}${doneItems}/${t.checklist.length}</span>` : '',
    allFiles(t).length ? `<span class="meta" title="Files and links">${icon('clip', 13)}${allFiles(t).length}</span>` : '',
    t.comments.some((c) => !c.deleted) ? `<span class="meta" title="Messages">${icon('chat', 13)}${t.comments.filter((c) => !c.deleted).length}</span>` : '',
  ].join('');
  return `<article class="card ${isDone(t) ? 'done' : ''}" data-open-task="${esc(t.id)}" data-drag="task" data-id="${esc(t.id)}" tabindex="0" aria-label="${esc(t.title || 'Untitled task')}">
    ${t.labels.length ? `<div class="card-labels">${orderedLabels(plan, t.labels).map((l) => labelChip(plan, l)).join('')}</div>` : ''}
    <div class="card-title"><button class="check ${isDone(t) ? 'on' : ''} ${t.review ? 'pending' : ''}" data-act="toggleDone" data-id="${esc(t.id)}" aria-label="${checkLabel(t)}" title="${checkLabel(t)}">${icon('check', 12)}</button><span>${esc(t.title || 'Untitled task')}</span></div>
    <button class="icon-btn card-more" data-act="cardMenu" data-id="${esc(t.id)}" aria-label="More options for ${esc(t.title || 'Untitled task')}" title="More options">${icon('more', 16)}</button>
    ${cardPreview(t)}
    ${showPlan && plan ? `<div class="card-plan">${planTile(plan, 14)}${esc(plan.name)}</div>` : ''}
    ${meta || t.assignees.length ? `<footer><div class="card-meta">${meta}</div><div class="avatars">${t.assignees.slice(0, 3).map((a) => avatar(person(a), 24)).join('')}${t.assignees.length > 3 ? `<span class="avatar more" style="--s:24px">+${t.assignees.length - 3}</span>` : ''}</div></footer>` : ''}
  </article>`;
}

/**
 * In your own planner, tasks other people assigned to you get a bucket per person ("Assigned by Ven"),
 * so they're easy to find. The tasks stay in the plan they were made in.
 */
function assignedToMeGroups(plan) {
  if (!plan.personal) return [];
  const mine = S.tasks.filter((t) => t.planId !== plan.id && t.assignees.includes(S.meId) && t.assignedBy && t.assignedBy !== S.meId && !t.boxId);
  const by = [...new Set(mine.map((t) => t.assignedBy))];
  return by.map((id) => ({
    key: `from:${id}`, label: `Assigned by ${person(id)?.name || 'someone'}`, person: person(id), locked: true,
    tasks: applyFilter(mine.filter((t) => t.assignedBy === id), filterOf(plan.id)).sort(byOrder),
  }));
}
function boardHTML(groups, by, ctx) {
  const col = (g) => {
    const key = `${ctx.key}:${g.key}`;
    const splitDone = by !== 'progress' && by !== 'status';
    const open = splitDone ? g.tasks.filter((t) => !isDone(t)) : g.tasks;
    const done = splitDone ? g.tasks.filter(isDone) : [];
    const showDone = ui.showDone[key];
    const head = g.bucket
      ? `<input class="col-title-input" value="${esc(g.label)}" data-change="bucketName" data-bucket="${esc(g.key)}" aria-label="Bucket name">`
      : `<span class="col-title">${g.person ? avatar(g.person, 22) : ''}${g.color ? `<i class="dot" style="background:${g.color}"></i>` : ''}${g.plan ? planTile(g.plan, 20) : ''}<b>${esc(g.label)}</b></span>`;
    const adding = ui.quickAdd === key;
    return `<section class="col" data-group="${esc(g.key)}" ${g.locked ? 'data-locked="1"' : ''} ${g.bucket ? `data-bucket-id="${esc(g.key)}"` : ''}>
      <header class="col-head" ${g.bucket ? 'data-drag="bucket"' : ''} data-id="${esc(g.key)}">
        ${head}<span class="count">${open.length}</span>
        ${g.bucket ? `<button class="icon-btn" data-act="bucketMenu" data-id="${esc(g.key)}" aria-label="Bucket options for ${esc(g.label)}">${icon('more')}</button>` : ''}
      </header>
      ${g.locked || g.noAdd ? '' : adding
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
    return `<tr class="${isDone(t) ? 'done' : ''}">
      <td class="c-check"><button class="check ${isDone(t) ? 'on' : ''} ${t.review ? 'pending' : ''}" data-act="toggleDone" data-id="${esc(t.id)}" aria-label="${checkLabel(t)}" title="${checkLabel(t)}">${icon('check', 12)}</button></td>
      <td class="c-title"><button class="link-btn" data-open-task="${esc(t.id)}">${esc(t.title || 'Untitled task')}</button>${t.repeat ? icon('repeat', 12) : ''}</td>
      <td><button class="avatars assign-cell" data-act="pickAssignees" data-id="${esc(t.id)}" aria-label="Assign task">${t.assignees.length ? t.assignees.slice(0, 3).map((a) => avatar(person(a), 24)).join('') : `<span class="muted">Assign</span>`}</button></td>
      <td><input type="date" value="${t.start || ''}" data-change="gridField" data-field="start" data-id="${esc(t.id)}" aria-label="Start date"></td>
      <td class="${isLate(t) ? 'late' : ''}"><input type="date" value="${t.due || ''}" data-change="gridField" data-field="due" data-id="${esc(t.id)}" aria-label="Due date"></td>
      <td>${ctx.crossPlan ? `<a class="muted" href="#/plan/${esc(t.planId)}">${esc(plan?.name || '')}</a>` : select(t, 'bucketId', plan.buckets.map((b) => ({ v: b.id, label: b.name })), t.bucketId)}</td>
      <td>${select(t, 'progress', PROGRESS, t.progress)}</td>
      <td>${select(t, 'priority', PRIORITY, t.priority)}</td>
      <td class="c-health">${healthDot(t)}${select(t, 'health', [{ v: '', label: 'Not set' }, ...HEALTH.map((h) => ({ v: h.v, label: h.label }))], t.health)}</td>
      <td class="c-labels"><button class="assign-cell" data-act="pickLabels" data-id="${esc(t.id)}" aria-label="Edit labels">${t.labels.length ? orderedLabels(plan, t.labels).map((l) => labelChip(plan, l)).join('') : `<span class="muted">Add</span>`}</button></td>
    </tr>`;
  };
  return `<div class="grid-wrap" data-scroll="grid-${esc(ctx.key)}">
    <form class="grid-add" data-submit="gridAdd"><span>${icon('plus', 14)}</span><input name="title" placeholder="Add a task and press Enter" data-focus="grid-add" autocomplete="off" aria-label="Add a task"></form>
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
    const cells = days.map((d) => `<div class="cal-cell ${d === t0 ? 'today' : ''} ${mode === 'month' && d.slice(0, 7) !== month ? 'other' : ''}" data-date="${d}" data-act="calAdd"></div>`).join('');
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
      <p class="muted small">Drag a task onto a date.</p>
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
  if (!tasks.length) return `<div class="empty"><h2>Nothing to chart yet</h2><p>Add some tasks, or clear the filter, to see progress here.</p></div>`;
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
  const tasks = applyFilter(tasksOf(plan.id), filterOf(fkey));
  const ctx = { key: plan.id, planId: plan.id };
  const body = {
    board: () => boardHTML([...groupsFor(by, tasks, plan), ...(by === 'bucket' ? assignedToMeGroups(plan) : [])], by, { ...ctx, showPlan: true }), grid: () => gridHTML(tasks, ctx),
    schedule: () => scheduleHTML(tasks, plan), charts: () => chartsHTML(tasks, plan),
  }[tab]();
  return `<div class="plan-page">
    <header class="plan-head">
      ${planTile(plan, 36)}
      <input class="plan-title" value="${esc(plan.name)}" data-change="planName" data-id="${esc(plan.id)}" aria-label="Plan name">
      <button class="icon-btn pin ${plan.pinned ? 'on' : ''}" data-act="togglePin" data-id="${esc(plan.id)}" aria-label="${plan.pinned ? 'Unpin plan' : 'Pin plan'}" title="${plan.pinned ? 'Unpin' : 'Pin'}">${icon('star')}</button>
      <div class="spacer"></div>
      <button class="avatars members" data-act="pickMembers" aria-label="Plan members">${plan.members.slice(0, 5).map((m) => avatar(person(m), 26)).join('')}</button>
      <button class="icon-btn" data-act="planMenu" aria-label="Plan options">${icon('more')}</button>
    </header>
    ${toolbar({ fkey, by, tab, tabs: TABS, options: ['bucket', 'assignee', 'progress', 'due', 'priority', 'label', 'health', 'work'] })}
    <div class="view">${body}</div>
  </div>`;
}

function renderMyTasks() {
  const fkey = 'my-tasks';
  const tab = ui.planTab[fkey] || 'board';
  const by = ui.groupBy[fkey] || 'due';
  const mine = S.tasks.filter((t) => t.assignees.includes(S.meId));
  const tasks = applyFilter(mine, filterOf(fkey));
  const ctx = { key: fkey, showPlan: true, crossPlan: true };
  const body = {
    board: () => boardHTML(groupsFor(by, tasks, null), by, ctx), grid: () => gridHTML(tasks, ctx),
    schedule: () => scheduleHTML(tasks, null), charts: () => chartsHTML(tasks, null),
  }[tab]();
  return `<div class="plan-page">
    <header class="plan-head"><span class="head-icon">${icon('user', 20)}</span><h1>My Tasks</h1></header>
    ${toolbar({ fkey, by, tab, tabs: TABS, options: ['due', 'progress', 'priority', 'plan', 'health', 'work'] })}
    <div class="view">${body}</div>
  </div>`;
}

function renderMyDay() {
  const now = parseISO(todayISO()).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
  const tasks = S.tasks.filter(inMyDay).sort(byOrder);
  const suggest = S.tasks.filter((t) => !isDone(t) && !inMyDay(t) && (isLate(t) || (t.assignees.includes(S.meId) && t.due && dueGroupOf(t.due) === 'tomorrow'))).slice(0, 6);
  const row = (t) => {
    const plan = planById(t.planId);
    const fromDue = t.due === todayISO() && t.assignees.includes(S.meId);
    return `<li class="day-row ${isLate(t) ? 'is-late' : ''}">
      <button class="check" data-act="toggleDone" data-id="${esc(t.id)}" aria-label="Mark complete">${icon('check', 12)}</button>
      <button class="day-title" data-open-task="${esc(t.id)}"><b>${isMio(t, todayISO()) ? '★ ' : ''}${healthDot(t)}${esc(t.title || 'Untitled task')}</b><small>${t.slotDate === todayISO() ? `${esc(fmtTime(t.slotStart))}–${esc(fmtTime(endOf(t)))} · ` : ''}${esc(plan?.name || '')}${t.due ? ` · due ${fmtDate(t.due)}` : ''}</small></button>
      ${typeTag(t)}${priorityIcon(t.priority)}
      ${fromDue ? '' : `<button class="icon-btn" data-act="toggleMyDay" data-id="${esc(t.id)}" aria-label="Remove from My Day" title="Remove from My Day">${icon('close', 14)}</button>`}
    </li>`;
  };
  return `<div class="page narrow">
    <header class="page-head row"><div><h1>My Day</h1><p class="muted">${esc(now)}</p></div><div class="spacer"></div>
      <a class="btn ghost sm" href="#/timebox" data-act="openTimeboxDay">${icon('clock', 14)} Plan today in Time Box</a></header>
    ${mioBarHTML(todayISO(), false)}
    <form class="grid-add" data-submit="dayAdd"><span>${icon('plus', 14)}</span><input name="title" placeholder="Add a task for today" data-focus="day-add" autocomplete="off" aria-label="Add a task for today"></form>
    ${tasks.length ? `<ul class="day-list">${tasks.map(row).join('')}</ul>` : `<div class="empty"><h2>Nothing planned for today</h2><p>Tasks due today and assigned to you show up here, and My Day clears itself each morning.</p></div>`}
    ${suggest.length ? `<h2 class="sub-head">Suggestions</h2><ul class="day-list">${suggest.map((t) => `<li class="day-row">
      <button class="icon-btn" data-act="toggleMyDay" data-id="${esc(t.id)}" aria-label="Add to My Day" title="Add to My Day">${icon('plus', 14)}</button>
      <button class="day-title" data-open-task="${esc(t.id)}"><b>${esc(t.title || 'Untitled task')}</b><small>${esc(planById(t.planId)?.name || '')}${t.due ? ` · ${isLate(t) ? 'late, ' : ''}due ${fmtDate(t.due)}` : ''}</small></button></li>`).join('')}</ul>` : ''}
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
    ${!plans.length && !hits.length ? `<div class="empty"><h2>No matches</h2><p>Try a different word.</p></div>` : ''}
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
  if (r.view === 'my-tasks') return renderMyTasks();
  if (r.view === 'my-day') return renderMyDay();
  if (r.view === 'timebox') return renderPlanner();
  return renderHub();
}
