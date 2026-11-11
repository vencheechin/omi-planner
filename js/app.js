'use strict';
/* Rendering loop, user actions, drag and drop, and startup. */

function render() {
  ui.renderTick = (ui.renderTick || 0) + 1;
  const scroll = {};
  $$('[data-scroll]').forEach((el) => { scroll[el.dataset.scroll] = [el.scrollLeft, el.scrollTop]; });
  const focusKey = ui.focus || document.activeElement?.dataset?.focus;
  ui.focus = null;
  renderSidebar();
  $('#main').innerHTML = renderBanner() + renderMain();
  renderTask();
  updateBell();
  $$('[data-scroll]').forEach((el) => {
    const pos = scroll[el.dataset.scroll];
    if (pos) { el.scrollLeft = pos[0]; el.scrollTop = pos[1]; }
  });
  if (focusKey) $$('[data-focus]').find((el) => el.dataset.focus === focusKey)?.focus();
}
function renderMainOnly() {
  $('#main').innerHTML = renderBanner() + renderMain();
}
function commit() {
  Store.save();
  render();
}
function renderBanner() {
  if (ui.route.view !== 'hub' || ui.search.trim() || ui.backupDismissed) return '';
  const last = S.settings.lastBackup;
  if ((last && Date.now() - last < 14 * 86400000) || S.tasks.length < 7) return '';
  return `<div class="banner"><span>${last ? `Your last backup was ${Math.floor((Date.now() - last) / 86400000)} days ago.` : 'You have not made a backup yet.'} Your plans are stored only on this device.</span><button class="btn ghost sm" data-act="exportBackup">Export backup</button><button class="icon-btn" data-act="dismissBackup" aria-label="Dismiss">${icon('close', 14)}</button></div>`;
}
function updateStatus() {
  const el = $('#status');
  if (!el) return;
  const online = navigator.onLine;
  const team = Cloud.statusText() || Team.statusText();
  if (team && Store.status === 'saved') {
    el.textContent = team.text;
    el.className = `status ${team.cls}`;
    el.dataset.act = team.act;
    return;
  }
  const text = { saving: 'Saving…', saved: online ? 'Saved on this device' : 'Offline · saved on this device', error: 'Could not save. Export a backup now.' }[Store.status];
  el.textContent = text;
  el.className = `status ${Store.status} ${online ? '' : 'offline'}`;
  delete el.dataset.act;
}
function updateBell() {
  const badge = $('#bellCount');
  if (!badge) return;
  const n = unreadCount();
  badge.textContent = n > 99 ? '99+' : n;
  badge.hidden = !n;
}
/** A dialog asking for an optional note. Resolves to { note } or null if cancelled. */
function noteDlg(title, label, action) {
  return new Promise((resolve) => {
    let result = null;
    const d = showDialog({
      title,
      html: `<form class="stack"><label class="field"><span>${esc(label)}</span><textarea name="note" rows="3"></textarea></label><div class="dlg-foot"><button class="btn ghost" type="button" data-role="no">Cancel</button><button class="btn primary">${esc(action)}</button></div></form>`,
      onClose: () => resolve(result),
    });
    $('[data-role=no]', d).onclick = () => d.close();
    $('form', d).onsubmit = (e) => { e.preventDefault(); result = { note: $('textarea', d).value.trim() }; d.close(); };
    $('textarea', d).focus();
  });
}

// ---------- Context helpers ----------
const currentPlan = () => (ui.route.view === 'plan' ? planById(ui.route.id) : null);
const currentPersonPlan = () => (ui.route.view === 'person' ? personPlanById(ui.route.id) : null);
const viewKey = () => (ui.route.view === 'plan' ? ui.route.id : ui.route.view === 'person' ? `person:${ui.route.id}` : 'my-tasks');
const currentBy = () => ui.groupBy[viewKey()] || (currentPlan() ? 'bucket' : currentPersonPlan() ? 'stage' : 'due');
const openTaskObj = () => taskById(ui.openTask);
/** The tasks the current board shows, before filtering. */
function currentViewTasks() {
  const plan = currentPlan();
  if (plan) return tasksOf(plan.id);
  const pp = currentPersonPlan();
  if (pp) return personPlanTasks(pp);
  return S.tasks.filter((x) => x.assignees.includes(S.meId));
}
const newFields = () => {
  const plan = currentPlan();
  if (plan) return { planId: plan.id, bucketId: plan.buckets[0].id };
  const pp = currentPersonPlan();
  return { planId: personalPlan().id, bucketId: personalPlan().buckets[0].id, assignees: [pp ? pp.personId : S.meId] };
};
/** Finds a person by email (or by name when no email is given), adding them if new. */
function ensurePerson(name, email = '') {
  email = email.trim().toLowerCase();
  const existing = (email && S.people.find((p) => (p.email || '') === email)) || S.people.find((p) => p.name.toLowerCase() === name.toLowerCase() && (!email || !p.email));
  if (existing) {
    if (email && !existing.email) existing.email = email;
    return existing;
  }
  // People with an email get the same id on every device and in every teammate's Planner.
  const id = email && !S.people.some((x) => x.id === `e:${email}`) ? `e:${email}` : uid();
  const p = { id, name, email, color: PERSON_COLORS[S.people.length % PERSON_COLORS.length] };
  S.people.push(p);
  return p;
}
/** Assigns a task to whoever the name or email refers to, adding them if new. */
function assignByQuery(t, q) {
  if (!q.trim()) return;
  const p = personFromQuery(q);
  if (!t.assignees.includes(p.id)) t.assignees.push(p.id);
  const plan = planById(t.planId);
  if (!plan.members.includes(p.id)) plan.members.push(p.id);
  ui.assignQuery = '';
  commit();
  refreshPop();
  $('[data-focus="assign-search"]', ui.pop?.el)?.focus();
  toast(`Assigned to ${p.name}${p.email ? ` (${p.email})` : ''}.`);
}
function completeNotice(next) {
  if (next) toast(`Next one scheduled for ${fmtDate(next.due)}.`);
}

// ---------- Plans ----------
async function createPlan() {
  const name = await promptDlg('New plan', 'Plan name', '', 'Create plan');
  if (!name) return;
  const plan = makePlan(name, PLAN_COLORS[S.plans.length % PLAN_COLORS.length]);
  S.plans.push(plan);
  Store.save();
  location.hash = `#/plan/${plan.id}`;
}
function duplicatePlan(plan) {
  const bucketMap = new Map(plan.buckets.map((b) => [b.id, uid()]));
  const copy = {
    ...JSON.parse(JSON.stringify(plan)), id: uid(), name: `Copy of ${plan.name}`, pinned: false, personal: false, lastOpened: Date.now(), created: Date.now(),
    buckets: plan.buckets.map((b) => ({ id: bucketMap.get(b.id), name: b.name })),
  };
  S.plans.push(copy);
  tasksOf(plan.id).forEach((t) => S.tasks.push(copyTask(t, { planId: copy.id, bucketId: bucketMap.get(t.bucketId), progress: t.progress, completedAt: t.completedAt })));
  Store.save();
  location.hash = `#/plan/${copy.id}`;
}
function planMenu(anchor) {
  const plan = currentPlan();
  openMenu(anchor, [
    { label: 'Labels', icon: 'tag', run: () => openLabels(anchor, { taskId: null, planId: plan.id }) },
    { label: 'Change colour', icon: 'flag', run: () => colourPicker(anchor, plan) },
    { label: 'Copy plan', icon: 'copy', run: () => duplicatePlan(plan) },
    { label: 'Export to Excel (CSV)', icon: 'download', run: () => download(`${safeFilename(plan.name)}.csv`, new Blob([planToCSV(plan)], { type: 'text/csv;charset=utf-8' })) },
    '-',
    {
      label: 'Delete plan', icon: 'trash', danger: true,
      run: async () => {
        const n = tasksOf(plan.id).length;
        if (!await confirmDlg('Delete plan?', `"${plan.name}" and its ${n} task${n === 1 ? '' : 's'} will be deleted.`, 'Delete plan')) return;
        location.hash = '#/hub';
        undoable(`Deleted "${plan.name}"`, () => {
          S.tasks = S.tasks.filter((t) => t.planId !== plan.id);
          S.plans = S.plans.filter((p) => p.id !== plan.id);
          if (!S.plans.some((p) => p.personal) && S.plans[0]) S.plans[0].personal = true;
        });
      },
    },
  ]);
}
function colourPicker(anchor, plan) {
  openPop(anchor, () => `<div class="swatches">${PLAN_COLORS.map((c) => `<button class="swatch ${c === plan.color ? 'on' : ''}" style="background:${c}" data-act="setPlanColour" data-color="${c}" aria-label="Colour ${c}">${c === plan.color ? icon('check', 14) : ''}</button>`).join('')}</div>`);
}

// ---------- Task menu (card "…" and the task panel) ----------
function taskMenuItems(t, anchor) {
  return [
    ...(isScheduled(t) || (t.boxId && boxOf(t)) || t.tbQueued
      ? [{ label: 'Remove from Time Box', icon: 'clock', run: () => actions.removeFromTimebox({ dataset: { id: t.id } }) }]
      : [{ label: 'Add to Time Box', icon: 'clock', run: () => { t.tbQueued = true; commit(); toast('Added to Time Box. It’s waiting in the list on the right of the Time Box page.'); } }]),
    {
      label: t.assignees.length ? `Delegated to ${t.assignees.map((a) => person(a)?.name || 'someone').join(', ')}` : 'Delegate to someone', icon: 'user', sub: true,
      run: () => { ui.assignQuery = ''; openPop(anchor, () => assignPicker(t)); $('[data-focus="assign-search"]', ui.pop.el)?.focus(); },
    },
    ...(planById(t.planId)?.buckets.length > 1 ? [{ label: 'Bucket', icon: 'list', sub: true, run: () => openPop(anchor, () => `<div class="menu" role="menu">${planById(t.planId).buckets.map((b) => `<button role="menuitem" data-act="setBucket" data-id="${esc(t.id)}" data-b="${esc(b.id)}"><span>${esc(b.name)}</span>${b.id === t.bucketId ? icon('check', 14) : ''}</button>`).join('')}</div>`) }] : []),
    { label: 'Label', icon: 'tag', sub: true, run: () => openLabels(anchor, { taskId: t.id, planId: t.planId }) },
    { label: 'Copy task', icon: 'copy', run: () => copyTaskDialog(t) },
    { label: 'Copy link to task', icon: 'link', run: () => copyTaskLink(t) },
    { label: 'Move task', icon: 'move', run: () => moveTaskDialog(t) },
    {
      label: 'Delete', icon: 'trash', danger: true,
      run: () => {
        if (ui.openTask === t.id) ui.openTask = null;
        undoable(`Deleted "${t.title || 'Untitled task'}"`, () => { if (isBox(t)) releaseBox(t); S.tasks = S.tasks.filter((x) => x.id !== t.id); });
      },
    },
  ];
}
/** Plan and bucket selects for the copy and move dialogs; the bucket list follows the chosen plan. */
function planBucketFields(planId, bucketId) {
  const plan = planById(planId);
  return `<div class="task-fields two">
    <label class="field"><span>Plan</span><select name="plan">${S.plans.map((p) => `<option value="${esc(p.id)}" ${p.id === planId ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label>
    <label class="field"><span>Bucket</span><select name="bucket">${plan.buckets.map((b) => `<option value="${esc(b.id)}" ${b.id === bucketId ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}</select></label></div>`;
}
/**
 * Asks which plan and bucket a task typed into the Time Box belongs in. Resolves { planId, bucketId },
 * or null when cancelled. With "Use this every time" ticked, it stops asking (Settings > Time boxing).
 */
function askPlanBucket(title) {
  const saved = TB().addTo;
  const sp = saved && planById(saved.planId);
  if (sp && sp.buckets.some((b) => b.id === saved.bucketId)) return Promise.resolve({ planId: sp.id, bucketId: saved.bucketId });
  const p = personalPlan();
  return new Promise((resolve) => {
    let answer = null;
    const d = showDialog({
      title: 'Add to Your Planner?',
      html: `<form class="stack">
        <p><b>${esc(title)}</b></p>
        <label class="field"><span>Bucket</span><select name="bucket">${p.buckets.map((b) => `<option value="${esc(b.id)}">${esc(b.name)}</option>`).join('')}</select></label>
        <label class="mini"><input type="checkbox" name="remember"> Use this every time</label>
        <div class="dlg-foot"><button class="btn ghost" type="button" data-role="no">Cancel</button><button class="btn primary">Add</button></div></form>`,
      onClose: () => resolve(answer),
    });
    const form = $('form', d);
    $('[data-role="no"]', d).onclick = () => d.close();
    form.onsubmit = (e) => {
      e.preventDefault();
      answer = { planId: p.id, bucketId: form.elements.bucket.value };
      if (form.elements.remember.checked) TB().addTo = { ...answer };
      d.close();
    };
    $('select', form).focus();
  });
}
/** The bucket list for Move: drag the highlighted bucket (or any other) to where it should go. */
function bucketOrderHTML(plan, current) {
  return `<div class="picker bo-pick"><h4>Move</h4><div class="bo-list">${plan.buckets.map((b) => `<div class="bo-row ${b.id === current ? 'on' : ''}" data-drag="bucketorder" data-id="${esc(b.id)}"><span>${esc(b.name)}</span><span class="grip" aria-hidden="true">⋮⋮</span></div>`).join('')}</div></div>`;
}
function bindPlanBucket(form) {
  form.elements.plan.onchange = () => {
    form.elements.bucket.innerHTML = planById(form.elements.plan.value).buckets.map((b) => `<option value="${esc(b.id)}">${esc(b.name)}</option>`).join('');
  };
}
/** Puts a task into a plan and bucket, at the top of that bucket unless told otherwise. */
function placeTask(t, planId, bucketId) {
  const plan = planById(planId);
  t.planId = planId;
  t.bucketId = bucketId;
  t.assignees.forEach((a) => { if (!plan.members.includes(a)) plan.members.push(a); });
  const others = S.tasks.filter((x) => x !== t && x.bucketId === bucketId);
  t.order = others.length ? Math.min(...others.map((x) => x.order)) - 1 : 0;
}
const COPY_PARTS = [['notes', 'Notes'], ['checklist', 'Checklist'], ['attachments', 'Attachments'], ['labels', 'Labels'], ['assignees', 'Assigned to'], ['dates', 'Dates'], ['progress', 'Progress']];
function copyTaskDialog(t) {
  const d = showDialog({
    title: 'Copy task',
    html: `<form class="stack">
      <label class="field"><span>Task name</span><input name="title" value="${esc(`Copy of ${t.title}`)}" required autocomplete="off"></label>
      ${planBucketFields(t.planId, t.bucketId)}
      <fieldset class="checks"><legend>Include</legend>${COPY_PARTS.map(([k, label]) => `<label><input type="checkbox" name="${k}" checked> ${label}</label>`).join('')}</fieldset>
      <div class="dlg-foot"><button class="btn ghost" type="button" data-act="closeDialog">Cancel</button><button class="btn primary">Copy</button></div></form>`,
  });
  const form = $('form', d);
  bindPlanBucket(form);
  $('input', form).select();
  form.onsubmit = (e) => {
    e.preventDefault();
    const has = (k) => form.elements[k].checked;
    const copy = copyTask(t, { title: form.elements.title.value.trim() || t.title });
    if (!has('notes')) copy.notes = '';
    if (!has('checklist')) copy.checklist = [];
    else copy.checklist.forEach((c) => { c.id = uid(); });
    if (!has('attachments')) copy.attachments = [];
    if (!has('labels')) copy.labels = [];
    if (!has('assignees')) copy.assignees = [];
    if (!has('dates')) { copy.start = null; copy.due = null; copy.repeat = ''; }
    if (has('progress')) { copy.progress = t.progress; copy.completedAt = t.completedAt; }
    S.tasks.push(copy);
    placeTask(copy, form.elements.plan.value, form.elements.bucket.value);
    if (copy.planId === t.planId && copy.bucketId === t.bucketId) copy.order = t.order - 0.5;
    d.close();
    commit();
    toast(copy.planId === t.planId ? 'Task copied.' : `Task copied to ${planById(copy.planId).name}.`);
  };
}
function moveTaskDialog(t) {
  const d = showDialog({
    title: 'Move task',
    html: `<form class="stack"><p class="muted small">${esc(t.title || 'Untitled task')}</p>
      ${planBucketFields(t.planId, t.bucketId)}
      <div class="dlg-foot"><button class="btn ghost" type="button" data-act="closeDialog">Cancel</button><button class="btn primary">Move</button></div></form>`,
  });
  const form = $('form', d);
  bindPlanBucket(form);
  form.onsubmit = (e) => {
    e.preventDefault();
    const [planId, bucketId] = [form.elements.plan.value, form.elements.bucket.value];
    d.close();
    if (planId === t.planId && bucketId === t.bucketId) return;
    const from = planById(t.planId).name;
    undoable(planId === t.planId ? `Moved to ${planById(planId).buckets.find((b) => b.id === bucketId).name}` : `Moved from ${from} to ${planById(planId).name}`, () => placeTask(t, planId, bucketId));
  };
}
async function copyTaskLink(t) {
  const url = `${location.href.split('#')[0]}#/plan/${t.planId}/task/${t.id}`;
  try {
    await navigator.clipboard.writeText(url);
  } catch {
    const ta = Object.assign(document.createElement('textarea'), { value: url });
    (topDialog() || document.body).append(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
  toast('Link copied. It opens this task in Planner on this device.');
}

// ---------- Labels ----------
function openLabels(anchor, ctx) {
  ui.labelCtx = ctx;
  ui.labelQuery = '';
  ui.labelEdit = null;
  openPop(anchor, labelPicker);
  $('[data-focus="label-search"]', ui.pop.el)?.focus();
}
/** Re-renders the open labels popover, keeping its scroll position, and focuses `focusKey`. */
function refreshLabels(focusKey) {
  const top = $('.picker-scroll', ui.pop.el).scrollTop;
  refreshPop();
  $('.picker-scroll', ui.pop.el).scrollTop = top;
  if (focusKey) $(`[data-focus="${focusKey}"]`, ui.pop.el)?.focus();
}
function createLabel(name) {
  if (!name) return;
  const plan = planById(ui.labelCtx.planId);
  const slot = freeLabelSlot(plan);
  if (slot < 0) { toast('All 25 labels have names. Rename one instead.', { error: true }); return; }
  plan.labels[slot] = name;
  const t = ui.labelCtx.taskId && taskById(ui.labelCtx.taskId);
  if (t && !t.labels.includes(slot)) t.labels = [...t.labels, slot].sort((a, b) => a - b);
  ui.labelQuery = '';
  refreshLabels('label-search');
  commit();
}

// ---------- Text sizes ----------
const SIZE_DEFAULTS = { textScale: 1, bucketSize: 14 };
const clampNum = (v, lo, hi, fallback) => (v !== null && v !== '' && Number.isFinite(Number(v)) ? Math.min(hi, Math.max(lo, Number(v))) : fallback);
function applySizes() {
  const text = clampNum(S.settings.textScale, 0.8, 1.5, SIZE_DEFAULTS.textScale);
  const bucket = clampNum(S.settings.bucketSize, 12, 32, SIZE_DEFAULTS.bucketSize);
  document.documentElement.style.setProperty('--scale', text);
  document.documentElement.style.setProperty('--bucket-fs', `${bucket}px`);
  try { localStorage.setItem(lsKey('planner-sizes'), JSON.stringify({ text, bucket })); } catch { /* sizes still apply this session */ }
}
function sizeControls() {
  const text = clampNum(S.settings.textScale, 0.8, 1.5, SIZE_DEFAULTS.textScale);
  const bucket = clampNum(S.settings.bucketSize, 12, 32, SIZE_DEFAULTS.bucketSize);
  return `<div class="size-controls">
    <label class="size-row"><span>Text size</span><input type="range" min="0.8" max="1.5" step="0.05" value="${text}" data-input="textScale"><output>${Math.round(text * 100)}%</output></label>
    <label class="size-row"><span>Bucket name size</span><input type="range" min="12" max="32" step="1" value="${bucket}" data-input="bucketSize"><output>${bucket}px</output></label>
    <button class="btn ghost sm" data-act="resetSizes">Reset to default</button></div>`;
}

// ---------- Settings ----------
function settingsHTML() {
  const last = S.settings.lastBackup;
  return `<section class="set-sec"><h3>Cloud sync</h3>${cloudSettingsHTML()}</section>
  <section class="set-sec"><details ${Team.dir ? 'open' : ''}><summary><b>Shared folder (OneDrive, Dropbox)</b></summary>${teamSettingsHTML()}</details></section>
  <section class="set-sec"><h3>Time boxing</h3>${timeboxSettingsHTML()}</section>
  <section class="set-sec"><h3>People</h3>
    
    <ul class="people-list">${S.people.map((p) => `<li>${avatar(p, 28)}<input value="${esc(p.name)}" data-change="personName" data-id="${esc(p.id)}" aria-label="Name"><input type="email" value="${esc(p.email || '')}" placeholder="Email" data-change="personEmail" data-id="${esc(p.id)}" aria-label="Email for ${esc(p.name)}">${p.id === S.meId ? '<small class="muted">you</small>' : `<button class="icon-btn" data-act="delPerson" data-id="${esc(p.id)}" aria-label="Remove ${esc(p.name)}">${icon('close', 13)}</button>`}</li>`).join('')}</ul>
    <form class="person-add" data-submit="settingsPerson"><input name="name" placeholder="Name" autocomplete="off" aria-label="Name" required><input name="email" type="email" placeholder="Email" autocomplete="off" aria-label="Email"><button class="btn ghost sm">${icon('plus', 14)} Add</button></form></section>
  <section class="set-sec"><h3>Messages and Language</h3>${chatSettingsHTML()}</section>
  <section class="set-sec"><h3>Appearance</h3>
    <div class="seg">${[['system', 'System'], ['light', 'Light'], ['dark', 'Dark']].map(([v, l]) => `<button class="${S.settings.theme === v ? 'on' : ''}" data-act="setTheme" data-v="${v}">${l}</button>`).join('')}</div>
    ${sizeControls()}</section>
  ${stAdmin() ? `<section class="set-sec"><h3>Admin</h3>${adminSettingsHTML()}</section>` : ''}
  <section class="set-sec"><h3>Planner</h3>
    <label class="field"><span>Planner Name</span><input value="${esc(plannerName())}" data-change="plannerName" autocomplete="off"></label>
    <button class="btn ghost sm" data-act="runSetup">Focus sessions</button></section>
  <section class="set-sec"><h3>Font</h3>
    <div class="seg">${[['', 'Garamond (OMI)'], ['system', 'System (Apple)']].map(([v, l]) => `<button class="${(S.settings.font || '') === v ? 'on' : ''}" data-act="setFont" data-v="${v}">${l}</button>`).join('')}</div></section>
  <section class="set-sec"><h3>Button Usage</h3><div class="row"><button class="btn ghost sm" data-act="openUsage">${icon('chart', 14)} Usage and suggestions</button></div></section>
  <section class="set-sec"><h3>Colour Style</h3>${styleSettingsHTML()}</section>
  <section class="set-sec"><h3>Import from Microsoft Planner</h3>
    
    <div class="row"><button class="btn ghost sm" data-act="importPlanner">${icon('upload', 14)} Choose Excel file…</button></div></section>
  <section class="set-sec"><h3>Backup</h3>
    
    <p class="small">Last backup: ${last ? esc(fmtDateTime(last)) : 'never'}<br><span id="storageUse" class="muted"></span></p>
    <div class="row"><button class="btn primary sm" data-act="exportBackup">${icon('download', 14)} Export backup</button><button class="btn ghost sm" data-act="importBackup">${icon('upload', 14)} Import backup</button></div></section>
  <section class="set-sec"><h3>Reset</h3><button class="btn danger sm" data-act="wipeAll">${icon('trash', 14)} Delete all data</button></section>`;
}
async function refreshSettings() {
  const d = $('dialog.settings');
  if (!d) return;
  $('.dlg-body', d).innerHTML = settingsHTML();
  if (navigator.storage?.estimate) {
    const { usage } = await navigator.storage.estimate();
    const el = $('#storageUse');
    if (el && usage !== undefined) el.textContent = `Using ${fmtSize(usage)} on this device`;
  }
}
function applyTheme() {
  const v = S.settings.theme;
  if (v === 'system') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', v);
  try { localStorage.setItem(lsKey('planner-theme'), v); } catch { /* theme just falls back to system */ }
  applyStyle();
  applyFont();
  applySizes();
}
function applyFont() {
  const f = S.settings.font === 'system' ? 'system' : '';
  if (f) document.documentElement.setAttribute('data-font', f); else document.documentElement.removeAttribute('data-font');
  try { if (f) localStorage.setItem(lsKey('planner-font'), f); else localStorage.removeItem(lsKey('planner-font')); } catch { /* applied after load instead */ }
}

// ---------- Click actions ----------
const actions = {
  newPlan: createPlan,
  closeDialog: (el) => el.closest('dialog').close(),
  openNav: () => { ui.navOpen = !ui.navOpen; renderSidebar(); },
  menuPick: (el) => { const it = ui.menuItems[+el.dataset.i]; Usage.track(`menu:${it.label.replace(/\s*\(.*\)$/, '').replace(/…$/, '')}`); closePop(); it.run(); },
  togglePin: (el) => { const p = planById(el.dataset.id); p.pinned = !p.pinned; commit(); },
  setTab: (el) => { ui.planTab[viewKey()] = el.dataset.tab; render(); },
  groupMenu: (el) => openMenu(el, el.dataset.options.split(',').map((k) => ({
    label: GROUPINGS[k], checked: currentBy() === k, run: () => { ui.groupBy[viewKey()] = k; render(); },
  }))),
  filterMenu: (el) => openPop(el, () => filterPicker(viewKey(), currentPlan(), !currentPlan())),
  clearFilter: () => { ui.filters[viewKey()] = emptyFilter(); closePop(); render(); },
  toggleFilter: (el) => {
    const f = filterOf(viewKey());
    const v = el.dataset.num ? Number(el.dataset.value) : el.dataset.value;
    const g = el.dataset.group;
    f[g] = f[g].includes(v) ? f[g].filter((x) => x !== v) : [...f[g], v];
    refreshPop();
    render();
  },
  planMenu: (el) => planMenu(el),
  setPlanColour: (el) => { currentPlan().color = el.dataset.color; closePop(); commit(); },
  pickMembers: (el) => openPop(el, () => memberPicker(currentPlan())),
  toggleMember: (el) => {
    const plan = currentPlan();
    const id = el.dataset.person;
    plan.members = plan.members.includes(id) ? plan.members.filter((m) => m !== id) : [...plan.members, id];
    refreshPop();
    commit();
  },

  // buckets
  addBucket: async () => {
    const plan = currentPlan();
    const name = await promptDlg('Add bucket', 'Bucket name', '', 'Add bucket');
    if (name) { plan.buckets.push({ id: uid(), name }); commit(); }
  },
  bucketMenu: (el) => {
    const plan = currentPlan();
    const id = el.dataset.id;
    const i = plan.buckets.findIndex((b) => b.id === id);
    openMenu(el, [
      { label: 'Colour', icon: 'tag', sub: true, run: () => openPop(el, () => colourListHTML('bucket', id, plan.buckets[i]?.color, 'transparent', 'None')) },
      ...(plan.buckets.length > 1 ? [{ label: 'Move', icon: 'move', sub: true, run: () => openPop(el, () => bucketOrderHTML(currentPlan(), id)) }] : []),
      {
        label: 'Delete bucket', icon: 'trash', danger: true,
        run: async () => {
          if (plan.buckets.length === 1) return toast('A plan needs at least one bucket.');
          const n = S.tasks.filter((t) => t.bucketId === id).length;
          const name = plan.buckets[i].name;
          if (n && !await confirmDlg('Delete bucket?', `"${name}" and its ${n} task${n === 1 ? '' : 's'} will be deleted.`, 'Delete bucket')) return;
          undoable(`Deleted "${name}"`, () => {
            S.tasks = S.tasks.filter((t) => t.bucketId !== id);
            plan.buckets = plan.buckets.filter((b) => b.id !== id);
          });
        },
      },
    ]);
  },

  // board
  openQuickAdd: (el) => { ui.quickAdd = el.dataset.key; ui.focus = `qa-${el.dataset.key}`; render(); },
  cancelQuickAdd: () => { ui.quickAdd = null; render(); },
  toggleShowDone: (el) => { ui.showDone[el.dataset.key] = !ui.showDone[el.dataset.key]; render(); },
  toggleDone: (el) => {
    const t = taskById(el.dataset.id);
    const wasInReview = !!t.review;
    completeNotice(setProgress(t, isDone(t) ? 0 : 100));
    commit();
    if (!wasInReview && t.review) toast(`Submitted to ${person(reviewerOf(t))?.name || 'the assigner'} for checking.`);
  },
  submitReview: async (el) => {
    const t = taskById(el.dataset.id);
    const res = await noteDlg('Submit for checking', `Note for ${person(reviewerOf(t))?.name || 'the assigner'} (optional)`, 'Submit');
    if (!res) return;
    submitForReview(t, res.note);
    commit();
    toast(`Submitted to ${person(reviewerOf(t))?.name || 'the assigner'} for checking.`);
  },
  approveTask: (el) => { setProgress(taskById(el.dataset.id), 100); commit(); toast('Approved and completed.'); },
  sendBack: async (el) => {
    const t = taskById(el.dataset.id);
    const res = await noteDlg('Send back', 'What still needs doing? (optional)', 'Send back');
    if (!res) return;
    endReview(t, res.note);
    commit();
  },
  withdrawReview: (el) => { endReview(taskById(el.dataset.id)); commit(); },
  openInbox: (el) => openPop(el, inboxHTML),
  openNotice: (el) => openNotice(el.dataset.id),
  markAllRead: () => { S.inbox.forEach((n) => { n.read = true; }); refreshPop(); commit(); },
  enableNotifications: async () => {
    try { await Notification.requestPermission(); } catch { /* unsupported here */ }
    closePop();
    refreshSettings();
    toast(Notification.permission === 'granted' ? 'Desktop notifications are on while Planner is open.' : 'Desktop notifications weren’t allowed. The bell still shows every notice.');
  },
  teamConnect: async () => { await Team.connect(); refreshSettings(); },
  teamReconnect: async () => { await Team.reconnect(); refreshSettings(); },
  teamDisconnect: async () => {
    if (!await confirmDlg('Disconnect team folder?', 'Shared tasks stay on this device but stop syncing with your team until you connect again.', 'Disconnect', false)) return;
    await Team.disconnect();
    refreshSettings();
  },
  teamSyncNow: async () => {
    await Team.sync();
    refreshSettings();
    toast(Team.state === 'ok' ? 'Synced with the team folder.' : `Sync problem: ${Team.error}`, { error: Team.state !== 'ok' });
  },
  personPlanMenu: (el) => {
    const pp = personPlanById(el.dataset.id);
    openMenu(el, [
      { label: 'Rename', icon: 'pencil', run: () => { const input = $('.plan-title'); input.focus(); input.select(); } },
      { label: 'Assignment report', icon: 'chart', run: () => { ui.report.person = pp.personId; location.hash = '#/report'; } },
      '-',
      { label: 'Remove this plan', icon: 'trash', danger: true, run: () => { location.hash = '#/hub'; undoable(`Removed “${pp.name}”. The tasks are still in their plans.`, () => { S.personPlans = S.personPlans.filter((x) => x.id !== pp.id); }); } },
    ]);
  },
  // time boxing
  setDayView: (el) => { ui.dayView = el.dataset.v; render(); },
  tbNav: (el) => {
    const dir = Number(el.dataset.dir);
    ui.dayDate = ui.dayView === 'month' ? addMonths(`${ui.dayDate.slice(0, 8)}01`, dir) : addDays(ui.dayDate, (ui.dayView === 'week' ? 7 : 1) * dir);
    render();
  },
  openTimeboxDay: (el, e) => { e.preventDefault(); ui.dayView = 'day'; ui.dayDate = todayISO(); location.hash = '#/timebox'; },
  tbQueue: (el) => { taskById(el.dataset.id).tbQueued = true; commit(); },
  tbUnqueue: (el) => { const t = taskById(el.dataset.id); t.tbQueued = false; ui.tbPicked = ui.tbPicked.filter((x) => x !== t.id); commit(); },
  tbToggleOthers: () => { ui.tbShowOthers = !ui.tbShowOthers; render(); },
  tbCombine: () => { const tasks = ui.tbPicked.map(taskById).filter(Boolean); ui.tbPicked = []; combineIntoBox(tasks, ui.dayDate); },
  unbox: (el) => { takeOutOfBox(taskById(el.dataset.id)); commit(); },
  unpackBox: (el) => {
    const box = taskById(el.dataset.id);
    ui.openTask = null;
    undoable(`Unpacked “${box.title}”. Its tasks are back in the Time Box list.`, () => { releaseBox(box); S.tasks = S.tasks.filter((x) => x.id !== box.id); });
  },
  tbToday: () => { ui.dayDate = todayISO(); render(); },
  tbOpenDay: (el) => { ui.dayView = 'day'; ui.dayDate = el.dataset.date; render(); },
  tbAdd: (el, e) => {
    const rect = el.getBoundingClientRect();
    const start = Math.floor((Number(el.dataset.rs) + (e.clientY - rect.top) / Number(el.dataset.ppm)) / SNAP_OF()) * SNAP_OF();
    const iso = el.dataset.tbDate;
    const block = blockAt(iso, start);
    const anchor = { getBoundingClientRect: () => ({ left: e.clientX, right: e.clientX, top: e.clientY, bottom: e.clientY }), contains: () => false };
    const queue = timeboxQueue();
    openPop(anchor, () => `<form class="picker tb-tap" data-submit="tbPopAdd" data-date="${iso}" data-start="${start}">
      <h4>${esc(dayLabel(iso))}, ${esc(fmtTime(start))}${block ? ` · ${esc(block.name)}` : ''}</h4>
      ${queue.length ? `
      <div class="tb-tap-list">${queue.map((q) => `<button type="button" class="tb-tap-item" data-act="tbPlaceQueued" data-id="${esc(q.id)}" data-date="${iso}" data-start="${start}" style="--c:${fillOf(q)}"><i></i><span>${healthDot(q)}${esc(q.title || 'Untitled task')}${isBox(q) ? ` <small>(${boxItems(q).length} items)</small>` : ''}</span><small class="muted">${esc(fmtDur(durOf(q)))}</small></button>`).join('')}</div><hr>` : ``}
      <textarea name="title" rows="1" required aria-label="Task name (several lines share one time box)"></textarea>
      <label class="field"><span>Time Box</span><select name="estimate">${estimateList().map((m) => `<option value="${m}" ${m === defaultEstimate() ? 'selected' : ''}>${fmtDur(m)}</option>`).join('')}</select></label>
      <input type="hidden" name="workType" value="${esc(block?.kind || '')}">
      <button class="btn primary sm tb-tap-add">Add</button></form>`);
    // With a list to pick from, don't pop the phone keyboard up over it.
    if (!queue.length) $('textarea', ui.pop.el).focus();
  },
  tbPlaceQueued: (el) => { const t = taskById(el.dataset.id); closePop(); if (t) scheduleTask(t, el.dataset.date, Number(el.dataset.start)); },
  mioMenu: (el) => openPop(el, () => mioPickerHTML(el.dataset.date)),
  pickMio: (el) => { toggleMio(el.dataset.date, el.dataset.id); refreshPop(); },
  assignTimebox: (el) => { taskById(el.dataset.id).tbQueued = true; commit(); toast('Added to the Time Box list. Drag it onto a time from the Time Box page.'); },
  removeFromTimebox: (el) => {
    const t = taskById(el.dataset.id);
    const before = JSON.stringify(S);
    if (t.boxId && boxOf(t)) takeOutOfBox(t);
    t.slotDate = null;
    t.slotStart = null;
    t.tbQueued = false;
    commit();
    toast('Removed from the Time Box.', { undo: () => { S = JSON.parse(before); commit(); } });
  },
  openInTimebox: (el) => {
    const t = taskById(el.dataset.id);
    const slotted = isScheduled(t) ? t : t.boxId && boxOf(t) && isScheduled(boxOf(t)) ? boxOf(t) : null;
    if (slotted) { ui.dayView = 'day'; ui.dayDate = slotted.slotDate; }
    ui.openTask = null;
    renderTask();
    location.hash = '#/timebox';
  },
  chatPlus: (el) => openPop(el, plusMenuHTML),
  chatPhotos: () => { closePop(); pickFiles('image/*,video/*'); },
  chatCamera: () => takePhoto(),
  chatLocation: () => shareLocation(),
  chatContact: (el) => { ui.contactQuery = ''; openPop($('.chat-plus') || el, contactPickerHTML); $('[data-focus="contact-search"]', ui.pop.el)?.focus(); },
  pickContact: (el) => { const p = person(el.dataset.id); closePop(); if (p) { ui.draft.contacts = [...(ui.draft.contacts || []), { id: p.id, name: p.name, email: p.email || '' }]; renderTask(); } },
  msgMenu: (el) => msgMenu(el, el.dataset.id),
  cancelReply: () => { ui.draft.replyTo = null; renderTask(); },
  jumpMsg: (el) => { const li = $(`[data-msg="${CSS.escape(el.dataset.id)}"]`); if (li) { li.scrollIntoView({ block: 'center', behavior: 'smooth' }); li.classList.add('flash'); setTimeout(() => li.classList.remove('flash'), 1200); } },
  toggleOriginal: (el) => { ui.showOriginal = ui.showOriginal || new Set(); const id = el.dataset.id; if (ui.showOriginal.has(id)) ui.showOriginal.delete(id); else ui.showOriginal.add(id); renderTask(); },
  cancelSelect: () => { ui.chatSelect = null; renderTask(); },
  delSelMe: () => deleteSelected(false),
  delSelAll: () => deleteSelected(true),
  openMsgLog: () => messageLogDlg(),
  exportMsgLog: (el) => {
    const rows = el.closest('dialog')._rows || [];
    const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = [['When', 'Who', 'Action', 'Task', 'Message by', 'Message', 'Files', 'Sent'].map(cell).join(','),
      ...rows.map((r) => [fmtDateTime(r.at), r.byName || r.by, r.action, r.taskTitle, r.authorName || r.author, r.text, (r.files || []).join('; '), r.messageAt ? fmtDateTime(r.messageAt) : ''].map(cell).join(','))].join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['\uFEFF' + csv], { type: 'text/csv' }));
    a.download = `Message log ${todayISO()}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  },
  cloudSetRole: async (el) => {
    try { await Cloud.setRole(el.dataset.email, el.dataset.role); refreshSettings(); toast(el.dataset.role === 'admin' ? `${el.dataset.email} is now an admin.` : `${el.dataset.email} is no longer an admin.`); } catch (err) { toast(err.message, { error: true }); }
  },
  chatAttach: () => {
    closePop();
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.onchange = () => stageFiles([...input.files]);
    input.click();
  },
  chatLink: async () => {
    closePop();
    let url = await promptDlg('Add a link', 'Web address', 'https://', 'Add');
    if (!url) return;
    if (!/^[a-z]+:/i.test(url)) url = `https://${url}`;
    if (!safeUrl(url)) { toast('Only http, https and mailto links can be added.', { error: true }); return; }
    ui.draft.links = [...(ui.draft.links || []), { url, name: url.replace(/^https?:\/\//, '') }];
    renderTask();
  },
  unstage: (el) => {
    const key = { link: 'links', contact: 'contacts' }[el.dataset.kind] || 'files';
    ui.draft[key] = (ui.draft[key] || []).filter((_, i) => i !== Number(el.dataset.i));
    renderTask();
  },
  toggleMio: (el) => {
    const t = taskById(el.dataset.id);
    toggleMio(mioDateOf(t) || el.dataset.date, t.id);
  },
  bookNextFree: (el) => bookNextFree(taskById(el.dataset.id), el.dataset.from),
  unschedule: (el) => unschedule(taskById(el.dataset.id)),
  handleNow: (el) => { const t = taskById(el.dataset.id); t.urgency = 'emergency'; scheduleTask(t, todayISO(), ceilSnap(nowMin())); },
  setHealth: (el) => setHealth(taskById(el.dataset.id), el.dataset.v),
  editWorkTypes: () => editWorkTypesDlg(),
  wtDelRow: (el) => el.closest('.wt-row').remove(),
  wtAddRow: (el) => {
    const input = $('[data-focus="wt-new"]', el.closest('form'));
    const name = input.value.trim();
    if (!name) { input.focus(); return; }
    const list = $('.wt-list', el.closest('form'));
    const n = $$('[data-custom]', list).length + (TB().workTypes || []).filter((w) => w.custom).length;
    list.insertAdjacentHTML('beforeend', wtRowHTML({ v: `c_${uid()}`, short: name, color: CUSTOM_TYPE_COLORS[n % CUSTOM_TYPE_COLORS.length], custom: true }));
    input.value = '';
    input.focus();
  },
  resetWorkTypes: (el) => { TB().workTypes = []; el.closest('dialog').close(); commit(); editWorkTypesDlg(); },
  moveUnfinished: (el) => moveUnfinishedDlg(el.dataset.date),
  planTomorrow: () => planTomorrowDlg(),
  tbToggleDay: (el) => {
    const d = Number(el.dataset.d);
    const days = TB().workDays;
    TB().workDays = days.includes(d) ? days.filter((x) => x !== d) : [...days, d].sort();
    commit();
    refreshSettings();
  },
  tbAddBlock: () => {
    TB().blocks.push({ id: uid(), name: 'New block', kind: '', start: 12 * 60 + 30, end: 13 * 60 + 30, cadence: 'daily', anchor: null, protected: false, note: '' });
    commit();
    refreshSettings();
  },
  tbDelEstimate: (el) => {
    const tb = TB();
    if (tb.estimates.length <= 1) { toast('Keep at least one duration.', { error: true }); return; }
    tb.estimates = tb.estimates.filter((m) => m !== Number(el.dataset.m));
    commit();
    refreshSettings();
  },
  tbResetEstimates: () => { TB().estimates = [...DEFAULT_ESTIMATES]; commit(); refreshSettings(); },
  tbAddReview: () => {
    let friday = todayISO();
    while (parseISO(friday).getDay() !== 5) friday = addDays(friday, 1);
    TB().blocks.push({ id: uid(), name: 'Biweekly Review', kind: 'review', start: 15 * 60, end: 16 * 60, cadence: 'biweekly', anchor: friday, protected: false, note: 'Routine updates.' });
    commit();
    refreshSettings();
  },
  tbDelBlock: (el) => {
    const b = TB().blocks.find((x) => x.id === el.dataset.id);
    closePop();
    undoable(`Removed “${b.name}”. Tasks keep their times.`, () => { TB().blocks = TB().blocks.filter((x) => x !== b); });
    refreshSettings();
  },
  tbRestore: async () => {
    if (!await confirmDlg('Restore default rhythm?', 'Your working days, hours and planning blocks go back to the defaults. Tasks keep their times.', 'Restore', false)) return;
    S.settings.timebox = defaultTimebox();
    commit();
    refreshSettings();
  },
  // cloud sync
  cloudSyncNow: async () => { await Cloud.sync(); refreshSettings(); toast(Cloud.state === 'ok' ? 'Synced.' : Cloud.state === 'offline' ? 'Offline. Your changes are saved and will sync when you reconnect.' : `Sync problem: ${Cloud.error}`, { error: Cloud.state === 'error' }); },
  cloudSignOut: async () => {
    if (!await confirmDlg('Sign out of cloud sync?', 'Your plans stay on this device. Changes made while signed out sync after you sign in again.', 'Sign out', false)) return;
    await Cloud.signOut();
    refreshSettings();
  },
  cloudForget: async () => { await Cloud.signOut(); S.settings.cloud = { url: '', key: '' }; Cloud.setState('off'); commit(); refreshSettings(); },
  cloudRemoveMember: async (el) => {
    if (!await confirmDlg('Remove from team?', `${el.dataset.email} will no longer see the team's shared tasks.`, 'Remove')) return;
    try { await Cloud.removeMember(el.dataset.email); } catch (err) { toast(err.message, { error: true }); }
    refreshSettings();
  },
  reportExport: () => download(`assignment-report-${todayISO()}.csv`, new Blob([reportCSV()], { type: 'text/csv;charset=utf-8' })),
  cardCheck: (el) => {
    const t = taskById(el.dataset.task);
    t.checklist.find((c) => c.id === el.dataset.item).done = true;
    commit();
  },
  gridSort: (el) => {
    const k = el.dataset.key;
    ui.gridSort = { key: k, dir: ui.gridSort.key === k ? -ui.gridSort.dir : 1 };
    render();
  },
  toggleMyDay: (el) => {
    const t = taskById(el.dataset.id);
    t.myDay = t.myDay === todayISO() ? null : todayISO();
    commit();
  },

  // schedule
  schedMode: (el) => { ui.sched.mode = el.dataset.mode; render(); },
  schedNav: (el) => {
    const d = +el.dataset.dir;
    ui.sched.anchor = ui.sched.mode === 'month' ? addMonths(`${ui.sched.anchor.slice(0, 8)}01`, d) : addDays(ui.sched.anchor, 7 * d);
    render();
  },
  schedToday: () => { ui.sched.anchor = todayISO(); render(); },
  calWeek: (el) => { ui.sched = { mode: 'week', anchor: el.dataset.date }; render(); },
  calAdd: async (el) => {
    const name = await promptDlg(`New task for ${fmtDate(el.dataset.date)}`, 'Task name', '', 'Add task');
    if (name) { addTask({ ...newFields(), title: name, due: el.dataset.date }); commit(); }
  },
  toggleChartTable: () => { ui.chartTable = !ui.chartTable; render(); },

  // task panel
  closeTask: () => { ui.openTask = null; closePop(); renderTask(); },
  taskMenu: (el) => openMenu(el, taskMenuItems(openTaskObj(), el)),
  decisionSend: (el) => {
    const t = taskById(el.dataset.id);
    const people = S.people.filter((p) => p.id !== S.meId);
    if (!people.length) { toast('Add the person who decides in Settings › People first.', { error: true }); return; }
    openMenu(el, people.map((p) => ({ label: p.name, icon: 'user', run: () => {
      t.decisionReq = { to: p.id, by: S.meId, at: Date.now(), status: 'pending' };
      if (t.workType !== 'decision') t.workType = 'decision';
      t.shared = true;
      addEvent(t, 'decision', { to: p.id });
      commit();
      toast(`Decision request sent to ${p.name}. Fill in the issue, recommendation and impact below.`);
    } })));
  },
  decisionApprove: (el) => {
    const t = taskById(el.dataset.id);
    t.decisionReq = { ...t.decisionReq, status: 'approved', decidedAt: Date.now() };
    addEvent(t, 'decided', { value: 'approved' });
    commit();
    toast('Approved. They\u2019ve been notified.');
  },
  decisionReject: async (el) => {
    const t = taskById(el.dataset.id);
    const note = await promptDlg('Reject decision request', 'Reason', '', 'Reject');
    if (note === null || note === undefined) return;
    t.decisionReq = { ...t.decisionReq, status: 'rejected', decidedAt: Date.now(), note: String(note).trim() };
    addEvent(t, 'decided', { value: 'rejected', note: String(note).trim() });
    commit();
    toast('Rejected. They\u2019ve been notified.');
  },
  decisionWithdraw: (el) => { const t = taskById(el.dataset.id); t.decisionReq = null; commit(); toast('Decision request withdrawn.'); },
  toggleFocus: (el) => { const t = taskById(el.dataset.id); t.workType = t.workType === 'focus' ? '' : 'focus'; commit(); },
  pgStep: (el) => {
    const t = taskById(el.dataset.id);
    const v = Number(el.dataset.v);
    const steps = [0, 10, 50, 80, 100];
    setField(t, 'progress', t.progress === v ? steps[steps.indexOf(v) - 1] : v);
  },
  setBucket: (el) => { const t = taskById(el.dataset.id); closePop(); if (t) { t.bucketId = el.dataset.b; commit(); } },
  cardMenu: (el) => openMenu(el, taskMenuItems(taskById(el.dataset.id), el)),
  pickLabels: (el) => {
    const t = taskById(el.dataset.id);
    openLabels(el, { taskId: t.id, planId: t.planId });
  },
  toggleLabel: (el) => {
    const t = taskById(ui.labelCtx.taskId);
    const i = +el.dataset.i;
    t.labels = t.labels.includes(i) ? t.labels.filter((l) => l !== i) : [...t.labels, i].sort((a, b) => a - b);
    refreshLabels();
    commit();
  },
  removeLabel: (el) => {
    const t = openTaskObj();
    t.labels = t.labels.filter((l) => l !== +el.dataset.i);
    commit();
  },
  createLabel: () => createLabel(ui.labelQuery.trim()),
  editLabel: (el) => {
    ui.labelEdit = +el.dataset.i;
    refreshLabels('label-edit');
  },
  sizeMenu: (el) => openPop(el, () => `<div class="picker"><h4>Text size</h4>${sizeControls()}</div>`),
  resetSizes: () => {
    Object.assign(S.settings, SIZE_DEFAULTS);
    applySizes();
    Store.save();
    refreshPop();
    refreshSettings();
  },
  pickAssignees: (el) => {
    const t = taskById(el.dataset.id);
    ui.assignQuery = '';
    openPop(el, () => assignPicker(t));
    $('[data-focus="assign-search"]', ui.pop.el)?.focus();
  },
  assignCreate: (el) => assignByQuery(taskById(el.dataset.id), ui.assignQuery || ''),
  toggleAssignee: (el) => {
    const t = taskById(el.dataset.id);
    const id = el.dataset.person;
    t.assignees = t.assignees.includes(id) ? t.assignees.filter((a) => a !== id) : [...t.assignees, id];
    const plan = planById(t.planId);
    if (!plan.members.includes(id)) plan.members.push(id);
    refreshPop();
    commit();
  },
  toggleCheck: (el) => {
    const t = openTaskObj();
    const c = t.checklist.find((x) => x.id === el.dataset.id);
    c.done = !c.done;
    c.doneBy = c.done ? S.meId : null;
    c.doneAt = c.done ? Date.now() : null;
    // On a task shared with others, the tick goes in the history so everyone sees who did it and when.
    if (t.assignees.some((a) => a !== S.meId) || (t.assignedBy && t.assignedBy !== S.meId)) addEvent(t, 'check', { text: c.text, done: c.done, item: c.id });
    commit();
  },
  toggleCheckAlerts: () => {
    const t = openTaskObj();
    const on = (t.checkAlerts || []).includes(S.meId);
    t.checkAlerts = on ? (t.checkAlerts || []).filter((id) => id !== S.meId) : [...(t.checkAlerts || []), S.meId];
    commit();
    toast(on ? 'You won’t be notified when items are ticked.' : 'You’ll be notified when someone ticks an item on this task.');
  },
  delCheck: (el) => {
    const t = openTaskObj();
    const c = t.checklist.find((x) => x.id === el.dataset.id);
    if (!c || !canDelCheck(t, c)) { toast('Only the person who added this item can delete it.', { error: true }); return; }
    t.checklist = t.checklist.filter((x) => x !== c);
    commit();
  },
  // Comments are marked deleted rather than removed, so the deletion syncs to teammates.
  delComment: (el) => { const c = openTaskObj().comments.find((x) => x.id === el.dataset.id); if (c) c.deleted = true; commit(); },
  delAttachment: (el) => { const t = openTaskObj(); t.attachments = t.attachments.filter((a) => a.id !== el.dataset.id); commit(); },
  addFile: () => {
    const t = openTaskObj();
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.onchange = () => attachFiles(t, [...input.files]);
    input.click();
  },
  addLink: async () => {
    const t = openTaskObj();
    let url = await promptDlg('Add link', 'Web address', 'https://', 'Add link');
    if (!url) return;
    if (!/^[a-z]+:/i.test(url)) url = `https://${url}`;
    if (!safeUrl(url)) return toast('Only http, https and mailto links can be added.', { error: true });
    t.attachments.push({ id: uid(), kind: 'link', name: url.replace(/^https?:\/\//, ''), url });
    commit();
  },
  openFile: async (el) => {
    const a = allFiles(openTaskObj()).find((x) => x.id === el.dataset.id);
    const blob = await Store.getFile(a.id);
    if (blob) download(a.name, blob);
    else toast('This file is not on this device.', { error: true });
  },

  // settings
  openSettings: () => {
    const d = showDialog({ title: 'Settings', html: settingsHTML() });
    d.classList.add('settings');
    refreshSettings();
  },
  tbForgetAddTo: () => { TB().addTo = null; commit(); refreshSettings(); toast('You’ll be asked each time.'); },
  colourPick: (el) => {
    const { kind, id } = el.dataset;
    if (kind === 'task') { const t = taskById(id); openPop(el, () => colourListHTML('task', id, t.tbColor, autoColor(t), 'Automatic')); }
    else { const b = TB().blocks.find((x) => x.id === id); openPop(el, () => colourListHTML('block', id, b.color, workTypeOf(b.kind).color, 'Type colour')); }
  },
  colourSet: (el) => {
    const { kind, id, v } = el.dataset;
    closePop();
    if (kind === 'task') { taskById(id).tbColor = v; commit(); }
    else if (kind === 'bucket') { const b = currentPlan()?.buckets.find((x) => x.id === id); if (b) { b.color = v || ''; commit(); } }
    else if (kind === 'from') { const p = currentPlan(); p.fromColor = { ...(p.fromColor || {}), [id]: v || '' }; commit(); }
    else { TB().blocks.find((x) => x.id === id).color = v || null; commit(); refreshSettings(); }
  },
  runSetup: () => { $$('dialog[open]').forEach((d) => { if (d.id !== 'taskDialog') d.close(); }); setupDlg(); },
  remAdd: (el) => openPop(el, () => remPickerHTML(openTaskObj())),
  remDel: (el) => { const t = openTaskObj(); t.reminders = remindersOf(t).filter((_, i) => i !== Number(el.dataset.i)); commit(); },
  remPreset: (el) => { closePop(); addReminder(openTaskObj(), JSON.parse(el.dataset.r)); },
  remAllowSystem: async () => { closePop(); try { const p = await Notification.requestPermission(); toast(p === 'granted' ? 'Reminders will also appear in this device’s notifications.' : 'Notifications stay in Planner’s bell.'); } catch { /* not supported */ } },
  colourFrom: (el) => { const p = currentPlan(); openPop(el, () => colourListHTML('from', el.dataset.id, p.fromColor?.[el.dataset.id], 'transparent', 'None')); },
  bpHalf: (el) => { bpHalf().half = Number(el.dataset.v); render(); },
  stNew: (el) => {
    const mine = stPlans().some((x) => x.kind === 'personal' && x.owner === S.meId && !x.deleted);
    openMenu(el, [
      ...(mine ? [] : [{ label: 'My S-Team Plan', icon: 'user', run: () => actions.stNewPersonal() }]),
      ...(stAdmin() ? [{ label: 'Department S-Team Plan…', icon: 'table', run: () => actions.stNewDept() }] : []),
    ]);
  },
  stNewPersonal: () => {
    const p = normalizeStPlan({ id: uid(), kind: 'personal', owner: S.meId, groups: [] });
    stPlans().push(p);
    ui.stPlanId = p.id;
    commit();
  },
  stNewDept: async () => {
    const depts = org().depts || [];
    if (!depts.length) { toast('Add a department in Settings › Admin first.', { error: true }); actions.openSettings(); return; }
    const used = new Set(stPlans().filter((x) => x.kind === 'dept' && !x.deleted).map((x) => x.dept));
    const free = depts.filter((d) => !used.has(d.id));
    if (!free.length) { toast('Every department already has an S-Team Plan.'); return; }
    const v = await choiceDlg('Department S-Team Plan', '', free.map((d, i) => ({ v: d.id, label: d.name, primary: i === 0 })).concat({ v: '', label: 'Cancel' }));
    if (!v) return;
    const p = normalizeStPlan({ id: uid(), kind: 'dept', dept: v, owner: S.meId, groups: [] });
    stPlans().push(p);
    ui.stPlanId = p.id;
    commit();
  },
  stAdminDel: (el) => { org().admins = (org().admins || []).filter((x) => x !== el.dataset.p); commit(); refreshSettings(); },
  stDeptAdd: async () => {
    const name = await promptDlg('New department', 'Department name, e.g. Ops', '', 'Add');
    if (!name) return;
    org().depts = [...(org().depts || []), { id: uid(), name, dic: null, members: [] }];
    commit();
    refreshSettings();
  },
  stDeptDel: async (el) => {
    const d = deptById(el.dataset.d);
    if (!await confirmDlg(`Delete ${d.name}?`, 'Its S-Team Plan stays, visible to admins and anyone added to it.', 'Delete')) return;
    org().depts = org().depts.filter((x) => x !== d);
    stTouchAll();
    commit();
    refreshSettings();
  },
  stDeptDelMember: (el) => { const d = deptById(el.dataset.d); d.members = d.members.filter((x) => x !== el.dataset.p); org().depts = [...org().depts]; stTouchAll(); commit(); refreshSettings(); },
  stViewerDel: (el) => { const p = stPlans().find((x) => x.id === el.dataset.plan); p.viewers = p.viewers.filter((x) => x !== el.dataset.p); commit(); refreshSettings(); },
  bpMode: (el) => {
    const h = bpHalf();
    if (el.dataset.v === 'custom' && h.mode !== 'custom') { const m = bpMonths(h); h.from = m[0]; h.to = m[m.length - 1]; }
    h.mode = el.dataset.v;
    render();
  },
  bpPeriod: (el) => {
    openPop(el, bpPeriodPicker);
    const f = $('form', ui.pop.el);
    const sum = () => { $('[data-role="sum"]', f).textContent = bpSpanText(Number(f.elements.start.value), Number(f.elements.h1.value), Number(f.elements.h2.value)); };
    f.onchange = sum;
  },
  bpYear: (el) => { bpHalf().year += Number(el.dataset.d); render(); },
  bpExample: () => { if (!stCanEdit(stCurrent())) return; bpExample(); commit(); },
  bpAddGroup: async () => {
    if (!stCanEdit(stCurrent())) return;
    const name = await promptDlg('New group', 'Group name', '', 'Add');
    if (!name) return;
    bp().groups.push({ id: uid(), name, rows: [] });
    commit();
  },
  bpDelGroup: async (el) => {
    const g = bpGroup(el.dataset.g);
    if (g.rows.length && !await confirmDlg(`Delete “${g.name}”?`, `Its ${g.rows.length} brand${g.rows.length === 1 ? '' : 's'} and their months go too.`, 'Delete')) return;
    bp().groups = bp().groups.filter((x) => x !== g);
    commit();
  },
  bpAddRow: (el) => { if (!stCanEdit(stCurrent())) return; const r = { id: uid(), brand: '', pic: '', cells: {} }; bpGroup(el.dataset.g).rows.push(r); ui.focusEl = `[data-r="${r.id}"][data-k="brand"]`; commit(); setTimeout(() => $(ui.focusEl)?.focus(), 30); },
  bpDelRow: async (el) => {
    const g = bpGroup(el.dataset.g);
    const r = bpRowOf(el.dataset.g, el.dataset.r);
    if (Object.keys(r.cells).length && !await confirmDlg(`Delete ${r.brand || 'this brand'}?`, 'Its months go too.', 'Delete')) return;
    g.rows = g.rows.filter((x) => x !== r);
    commit();
  },
  bpCell: (el) => {
    if (!stCanEdit(stCurrent())) return;
    const g = bpGroup(el.dataset.g);
    const r = bpRowOf(el.dataset.g, el.dataset.r);
    openPop(el, () => bpCellPicker(g, r, el.dataset.m));
    const form = $('form', ui.pop.el);
    const list = $('.bp-items', form);
    let n = list.children.length;
    // A traffic light can be unticked by tapping it again.
    list.addEventListener('click', (e) => {
      const del = e.target.closest('[data-role="del"]');
      if (del) { del.closest('.bp-item').remove(); if (!list.children.length) list.insertAdjacentHTML('beforeend', bpItemRow({ text: '', pic: '', status: '' }, n++)); return; }
      const radio = e.target.closest('.bp-tl label')?.querySelector('input');
      if (radio && radio.checked && radio.dataset.was === '1') { e.preventDefault(); radio.checked = false; radio.dataset.was = ''; return; }
      $$('.bp-tl input', list).forEach((x) => { x.dataset.was = x.checked ? '1' : ''; });
      if (radio) setTimeout(() => $$('.bp-tl input', list).forEach((x) => { x.dataset.was = x.checked ? '1' : ''; }), 0);
    });
    $$('.bp-tl input', list).forEach((x) => { x.dataset.was = x.checked ? '1' : ''; });
    $('[data-role="add"]', form).onclick = () => { list.insertAdjacentHTML('beforeend', bpItemRow({ text: '', pic: '', status: '' }, n++)); list.lastElementChild.querySelector('[name=text]').focus(); };
    $('[name=text]', list)?.focus();
  },
  bpCellClear: (el) => { const f = el.closest('form'); delete bpRowOf(f.dataset.g, f.dataset.r).cells[f.dataset.m]; closePop(); commit(); },
  teamDevice: () => Team.connectDevice(),
  openUsage: () => usageDlg(),
  exportUsage: (el) => {
    const rows = el.closest('dialog')._rows || [];
    const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = [['Button', 'Uses', 'Last used'].map(cell).join(','), ...rows.map((r) => [r.label, r.n, r.last ? fmtDateTime(r.last) : ''].map(cell).join(','))].join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['\uFEFF' + csv], { type: 'text/csv' }));
    a.download = `Button usage ${todayISO()}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  },
  setFont: (el) => { S.settings.font = el.dataset.v; applyFont(); Store.save(); refreshSettings(); },
  setStyle: (el) => { S.settings.style = el.dataset.v; applyStyle(); Store.save(); render(); refreshSettings(); toast(`Colour style: ${styleOf(el.dataset.v).name}.`); },
  setTheme: (el) => { S.settings.theme = el.dataset.v; applyTheme(); Store.save(); refreshSettings(); },
  delPerson: async (el) => {
    const id = el.dataset.id;
    if (!await confirmDlg('Remove person?', `${person(id).name} will be unassigned from all tasks.`, 'Remove')) return;
    S.tasks.forEach((t) => { t.assignees = t.assignees.filter((a) => a !== id); });
    S.plans.forEach((p) => { p.members = p.members.filter((m) => m !== id); });
    S.people = S.people.filter((p) => p.id !== id);
    commit();
    refreshSettings();
  },
  exportBackup: async () => {
    await exportBackup();
    toast('Backup saved to your Downloads folder.');
    render();
    refreshSettings();
  },
  dismissBackup: () => { ui.backupDismissed = true; render(); },
  importPlanner: () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = '.xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv';
    input.onchange = () => { if (input.files.length) importPlannerFiles([...input.files]); };
    input.click();
  },
  healthMenu: (el) => openPop(el, () => healthPickerHTML(taskById(el.dataset.id))),
  pickHealth: (el) => { closePop(); setHealth(taskById(el.dataset.id), el.dataset.v, true); },
  importBackup: () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = async () => {
      const file = input.files[0];
      if (!file) return;
      if (!await confirmDlg('Replace everything?', `All plans on this device will be replaced with the contents of "${file.name}".`, 'Replace')) return;
      const before = JSON.stringify(S);
      try {
        await importBackup(await file.text());
        applyTheme();
        render();
        refreshSettings();
        toast('Backup restored.', { undo: () => { S = JSON.parse(before); applyTheme(); commit(); refreshSettings(); } });
      } catch (err) {
        toast(err instanceof SyntaxError ? 'This file is not a Planner backup.' : err.message, { error: true });
      }
    };
    input.click();
  },
  wipeAll: async () => {
    if (!await confirmDlg('Delete all data?', 'Every plan, task and attachment on this device will be permanently deleted. This cannot be undone.', 'Delete everything')) return;
    await Team.disconnect();
    seedState();
    await Store.flush();
    await Store.collectGarbage();
    $('dialog.settings')?.close();
    location.hash = '#/hub';
    applyTheme();
    render();
  },
};

// ---------- Form submits ----------
const submits = {
  bpPeriodSave: (form, data) => {
    bp().cfg = { start: Number(data.get('start')), h1: Number(data.get('h1')), h2: Number(data.get('h2')) };
    ui.bpHalf = null;
    closePop();
    commit();
  },
  bpCellSave: (form) => {
    const r = bpRowOf(form.dataset.g, form.dataset.r);
    const items = bpReadItems(form);
    if (items.length) r.cells[form.dataset.m] = { items }; else delete r.cells[form.dataset.m];
    closePop();
    commit();
  },
  remCustom: (form, data) => {
    const n = Math.max(0, Math.min(52, Number(data.get('n')) || 0));
    closePop();
    addReminder(openTaskObj(), { n, unit: data.get('unit') === 'weeks' ? 'weeks' : 'days', when: data.get('when') === 'after' ? 'after' : 'before', at: data.get('at') || '09:00' });
  },
  forwardMsg: (form, data) => forwardMessage(form, data),
  importPlanner: (form, data) => importPlanner(form, data),
  tbBlockSave: (form, data) => saveBlockFromMenu(form, data),
  saveWorkTypes: (form) => saveWorkTypes(form),
  quickAdd: (form, data) => {
    const title = data.get('title').trim();
    if (!title) return;
    const t = addTask({ ...newFields(), title });
    applyGroup(t, currentBy(), null, form.dataset.group);
    ui.focus = `qa-${form.dataset.key}`;
    commit();
  },
  gridAdd: (form, data) => {
    const title = data.get('title').trim();
    if (!title) return;
    addTask({ ...newFields(), title });
    ui.focus = 'grid-add';
    commit();
  },
  dayAdd: (form, data) => {
    const title = data.get('title').trim();
    if (!title) return;
    const p = personalPlan();
    addTask({ planId: p.id, bucketId: p.buckets[0].id, title, assignees: [S.meId], myDay: todayISO() });
    ui.focus = 'day-add';
    commit();
  },
  addCheck: (form, data) => {
    const text = data.get('text').trim();
    if (!text) return;
    openTaskObj().checklist.push({ id: uid(), text, done: false, by: S.meId, at: Date.now() });
    ui.focus = 'check-add';
    commit();
  },
  sendMessage: () => { sendMessage(openTaskObj()); },
  addComment: (form, data) => {
    const text = data.get('text').trim();
    if (!text) return;
    openTaskObj().comments.push({ id: uid(), author: S.meId, text, at: Date.now() });
    ui.draft.comment = '';
    commit();
  },
  assignSearch: (form, data) => {
    const t = taskById(form.dataset.id);
    const q = (data.get('q') || '').trim().toLowerCase();
    if (!q) return;
    // One visible match: Enter picks it (like choosing from a list); otherwise use exactly what was typed.
    const visible = S.people.filter((p) => p.name.toLowerCase().includes(q) || (p.email || '').includes(q));
    if (visible.length === 1 && !t.assignees.includes(visible[0].id)) assignByQuery(t, visible[0].email || visible[0].name);
    else assignByQuery(t, data.get('q'));
  },
  assignNewPerson: (form, data) => {
    const name = data.get('name').trim();
    if (!name) return;
    const t = taskById(form.dataset.id);
    const p = ensurePerson(name, data.get('email') || '');
    if (!t.assignees.includes(p.id)) t.assignees.push(p.id);
    const plan = planById(t.planId);
    if (!plan.members.includes(p.id)) plan.members.push(p.id);
    refreshPop();
    commit();
  },
  memberNewPerson: (form, data) => {
    const name = data.get('name').trim();
    if (!name) return;
    const plan = currentPlan();
    const p = ensurePerson(name);
    if (!plan.members.includes(p.id)) plan.members.push(p.id);
    refreshPop();
    commit();
  },
  labelCreate: (form, data) => {
    const q = data.get('q').trim();
    if (!q) return;
    const plan = planById(ui.labelCtx.planId);
    const match = LABELS.findIndex((_, i) => labelName(plan, i).toLowerCase() === q.toLowerCase());
    if (match < 0) return createLabel(q);
    const t = ui.labelCtx.taskId && taskById(ui.labelCtx.taskId);
    if (t && !t.labels.includes(match)) t.labels = [...t.labels, match].sort((a, b) => a - b);
    ui.labelQuery = '';
    refreshLabels('label-search');
    commit();
  },
  labelRename: (form, data) => {
    planById(ui.labelCtx.planId).labels[+form.dataset.i] = data.get('name').trim();
    ui.labelEdit = null;
    refreshLabels('label-search');
    commit();
  },
  tbQuickAdd: async (form, data) => {
    const title = data.get('title').trim();
    if (!title) return;
    const dest = await askPlanBucket(title);
    if (!dest) { const i = $('[data-focus="tb-quick"]'); if (i) i.value = title; return; }
    const t = addTask({ planId: dest.planId, bucketId: dest.bucketId, title, assignees: [S.meId], estimate: Number(data.get('estimate')) || 30, workType: data.get('workType') || '' });
    ui.focus = 'tb-quick';
    const day = data.get('date') || ui.dayDate;
    const start = parseHM(data.get('start'));
    if (start !== null) { commit(); await scheduleTask(t, day, start); return; }
    const from = searchStart(day);
    const slot = freeSlot(t, from.date, from.min);
    if (slot) {
      t.slotDate = slot.date;
      t.slotStart = slot.start;
      if (!t.workType) { const b = blockAt(slot.date, slot.start); if (b && b.kind) t.workType = b.kind; }
    }
    commit();
    if (!slot) t.tbQueued = true;
    toast(slot ? `Booked ${dayLabel(slot.date)} ${fmtTime(slot.start)}–${fmtTime(slot.start + durOf(t))}.` : 'No free slot in the next 4 weeks. It’s waiting in the Time Box list.');
  },
  tbPopAdd: async (form, data) => {
    const lines = data.get('title').split('\n').map((x) => x.trim()).filter(Boolean);
    if (!lines.length) return;
    const { date, start } = form.dataset;
    closePop();
    const dest = await askPlanBucket(lines.length === 1 ? lines[0] : `${lines.length} tasks`);
    if (!dest) return;
    const fields = { estimate: Number(data.get('estimate')) || 30, workType: data.get('workType') || '' };
    let t;
    if (lines.length === 1) t = addTask({ planId: dest.planId, bucketId: dest.bucketId, title: lines[0], assignees: [S.meId], ...fields });
    else {
      t = makeBox(fields);
      lines.forEach((line) => putInBox(t, addTask({ planId: dest.planId, bucketId: dest.bucketId, title: line, assignees: [S.meId] })));
    }
    commit();
    scheduleTask(t, date, Number(start));
  },
  boxAddItem: (form, data) => {
    const title = data.get('title').trim();
    if (!title) return;
    const box = taskById(form.dataset.id);
    const p = personalPlan();
    putInBox(box, addTask({ planId: p.id, bucketId: p.buckets[0].id, title, assignees: [S.meId] }));
    ui.focus = 'box-add';
    commit();
  },
  tbAddEstimate: (form, data) => {
    const m = Math.round(Number(data.get('minutes')));
    if (!(m > 0 && m <= 720)) return;
    TB().estimates = [...new Set([...TB().estimates, m])].sort((a, b) => a - b);
    commit();
    refreshSettings();
  },
  cloudSendCode: async (form, data) => {
    const email = String(data.get('email') || '').trim().toLowerCase();
    if (!isEmail(email)) return;
    try {
      await Cloud.sendCode(email);
      ui.cloudEmail = email;
      Cloud.error = '';
      toast(`Code sent to ${email}.`);
    } catch (err) { Cloud.error = err.offline ? 'You are offline. Connect to sign in.' : err.message; }
    refreshSettings();
  },
  cloudVerify: async (form, data) => {
    try {
      await Cloud.verifyCode(ui.cloudEmail, String(data.get('code') || ''));
      ui.cloudEmail = '';
      Cloud.error = '';
      toast('Signed in. Syncing now.');
    } catch (err) { Cloud.error = err.offline ? 'You are offline. Connect to sign in.' : `That code didn't work: ${err.message}`; }
    refreshSettings();
  },
  cloudCreateTeam: async (form, data) => {
    try { await Cloud.createTeam(String(data.get('name')).trim()); await Cloud.sync(); toast('Team created. Add colleagues by email.'); } catch (err) { toast(err.message, { error: true }); }
    refreshSettings();
  },
  cloudInvite: async (form, data) => {
    try { await Cloud.invite(String(data.get('email'))); await Cloud.sync(); toast('Added. They can now sign in with that email.'); } catch (err) { toast(err.message, { error: true }); }
    refreshSettings();
  },
  settingsPerson: (form, data) => {
    const name = data.get('name').trim();
    if (!name) return;
    ensurePerson(name, data.get('email') || '');
    commit();
    refreshSettings();
  },
};

// ---------- Field changes ----------
const changes = {
  planName: (el) => { const p = planById(el.dataset.id); if (el.value.trim()) p.name = el.value.trim(); commit(); },
  bucketName: (el) => {
    const b = currentPlan().buckets.find((x) => x.id === el.dataset.bucket);
    if (el.value.trim()) b.name = el.value.trim();
    commit();
  },
  personName: (el) => { const p = person(el.dataset.id); if (el.value.trim()) p.name = el.value.trim(); commit(); },
  personEmail: (el) => {
    const email = el.value.trim().toLowerCase();
    if (email && S.people.some((p) => p.id !== el.dataset.id && p.email === email)) { toast('Someone else already has that email.', { error: true }); refreshSettings(); return; }
    person(el.dataset.id).email = email;
    commit();
  },
  personPlanName: (el) => { const pp = personPlanById(el.dataset.id); if (el.value.trim()) pp.name = el.value.trim(); commit(); },
  cloudCfg: (el) => {
    S.settings.cloud = { ...(S.settings.cloud || {}), [el.dataset.k]: el.value.trim() };
    commit();
    refreshSettings();
    if (Cloud.configured()) Cloud.init();
  },
  reportFilter: (el) => { ui.report[el.dataset.k] = el.value; render(); },
  tbInterval: (el) => { TB().interval = Number(el.value); commit(); refreshSettings(); },
  tbFullDay: (el) => { ui.tbFullDay = el.checked; render(); },
  tbPick: (el) => { const id = el.dataset.id; ui.tbPicked = el.checked ? [...new Set([...ui.tbPicked, id])] : ui.tbPicked.filter((x) => x !== id); render(); },
  tbQueueEstimate: (el) => {
    const t = taskById(el.dataset.id);
    const dur = Number(el.value) || null;
    if (isScheduled(t) && dur) scheduleTask(t, t.slotDate, t.slotStart, dur); else { t.estimate = dur; commit(); }
  },
  boxAddExisting: (el) => { if (!el.value) return; putInBox(taskById(el.dataset.id), taskById(el.value)); commit(); },
  chatLang: (el) => { chatPrefs().lang = el.value; commit(); refreshSettings(); toast(`Messages will be shown in ${langName(el.value)}.`); },
  chatTranslate: (el) => { chatPrefs().translate = el.checked; commit(); },
  msgPick: (el) => { const s = ui.chatSelect || new Set(); if (el.checked) s.add(el.dataset.id); else s.delete(el.dataset.id); ui.chatSelect = s; renderTask(); },
  plannerName: (el) => { S.settings.plannerName = el.value.trim().slice(0, 60); commit(); },
  bpFrom: (el) => { if (el.value) { bpHalf().from = el.value; if (bpHalf().to < el.value) bpHalf().to = el.value; render(); } },
  bpTo: (el) => { if (el.value) { bpHalf().to = el.value; if (bpHalf().from > el.value) bpHalf().from = el.value; render(); } },
  stSwitch: (el) => { ui.stPlanId = el.value; render(); },
  stAdminAdd: (el) => { if (!el.value) return; org().admins = [...new Set([...(org().admins || []), el.value])]; commit(); refreshSettings(); },
  stDeptName: (el) => { const d = deptById(el.dataset.d); d.name = el.value.trim() || d.name; org().depts = [...org().depts]; commit(); },
  stDeptDic: (el) => { const d = deptById(el.dataset.d); d.dic = el.value || null; org().depts = [...org().depts]; stTouchAll(); commit(); refreshSettings(); },
  stDeptAddMember: (el) => { if (!el.value) return; const d = deptById(el.dataset.d); d.members = [...new Set([...(d.members || []), el.value])]; org().depts = [...org().depts]; stTouchAll(); commit(); refreshSettings(); },
  stViewerAdd: (el) => { if (!el.value) return; const p = stPlans().find((x) => x.id === el.dataset.plan); p.viewers = [...new Set([...(p.viewers || []), el.value])]; commit(); refreshSettings(); },
  bpGroupName: (el) => { bpGroup(el.dataset.g).name = el.value.trim() || 'Group'; commit(); },
  bpRow: (el) => { bpRowOf(el.dataset.g, el.dataset.r)[el.dataset.k] = el.value.trim(); commit(); },
  ckGroup: (el) => { S.settings.ckGroup = el.value; commit(); },
  healthSel: (el) => setHealth(taskById(el.dataset.id), el.value, true),
  tbField: async (el) => {
    const t = openTaskObj();
    const f = el.dataset.field;
    const v = el.value;
    if (f === 'workType' || f === 'urgency' || f === 'tbColor') { t[f] = v; commit(); return; }
    if (f === 'estimate') {
      const dur = Number(v) || null;
      if (isScheduled(t) && dur) await scheduleTask(t, t.slotDate, t.slotStart, dur); else { t.estimate = dur; commit(); }
      return;
    }
    if (f === 'slotDate') {
      if (!v) { unschedule(t); return; }
      const free = freeSlot(t, v, 0);
      await scheduleTask(t, v, Number.isFinite(t.slotStart) ? t.slotStart : free && free.date === v ? free.start : TB().dayStart);
      return;
    }
    if (f === 'slotStart') {
      const m = parseHM(v);
      if (m !== null) await scheduleTask(t, t.slotDate || (ui.dayDate >= todayISO() ? ui.dayDate : todayISO()), m);
    }
  },
  decisionDeadline: (el) => { const t = openTaskObj(); t.decision = { ...(t.decision || {}), deadline: el.value || '' }; commit(); },
  tbSetting: (el) => {
    const tb = TB();
    const k = el.dataset.k;
    if (k === 'capacity') { const h = Number(el.value); if (h > 0) tb.capacity = h; } else {
      const m = parseHM(el.value);
      const next = { ...tb, [k]: m };
      if (m === null || next.dayEnd <= next.dayStart) { toast('The working day has to end after it starts.', { error: true }); refreshSettings(); return; }
      tb[k] = m;
    }
    commit();
    refreshSettings();
  },
  tbBlock: (el) => {
    const b = TB().blocks.find((x) => x.id === el.dataset.id);
    const k = el.dataset.k;
    if (k === 'start' || k === 'end') {
      const m = parseHM(el.value);
      const next = { ...b, [k]: m };
      if (m === null || next.end <= next.start) { toast('A block has to end after it starts.', { error: true }); refreshSettings(); return; }
      b[k] = m;
    } else if (k === 'protected') b.protected = el.checked;
    else if (k === 'name') b.name = el.value.trim() || b.name;
    else b[k] = el.value || null;
    if (k === 'cadence' && b.cadence !== 'daily' && !b.anchor) b.anchor = todayISO();
    commit();
    refreshSettings();
  },
  gridField: (el) => setField(taskById(el.dataset.id), el.dataset.field, el.value),
  taskField: (el) => setField(openTaskObj(), el.dataset.field, el.value),
};
function setField(t, field, value) {
  if (field === 'due' && dueLocked(t)) { toast(`${person(t.assignedBy)?.name || 'The assigner'} set this due date.`, { error: true }); render(); return; }
  if (field === 'progress') completeNotice(setProgress(t, Number(value)));
  else if (field === 'priority') t.priority = Number(value);
  else if (field === 'health') {
    const prev = t.health;
    t.health = value;
    if (value && value !== 'green' && value !== prev) addEvent(t, 'health', { value, note: t.healthNote || '' });
  }
  else if (field === 'start' || field === 'due') {
    t[field] = value || null;
    if (t.start && t.due && t.start > t.due) {
      if (field === 'start') t.due = t.start; else t.start = t.due;
      toast('Start date moved to keep it before the due date.');
    }
  } else t[field] = value;
  commit();
}
const inputs = {
  contactSearch: (el) => { ui.contactQuery = el.value; refreshPop(); const i = $('[data-focus="contact-search"]', ui.pop?.el); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } },
  title: (el) => { openTaskObj().title = el.value; Store.save(); renderMainOnly(); },
  notes: (el) => { openTaskObj().notes = el.value; Store.save(); renderMainOnly(); },
  checkText: (el) => { openTaskObj().checklist.find((c) => c.id === el.dataset.id).text = el.value; Store.save(); },
  commentDraft: (el) => { ui.draft.comment = el.value; },
  assignSearch: (el) => {
    ui.assignQuery = el.value;
    const q = el.value.trim().toLowerCase();
    const pop = el.closest('.picker');
    $$('.person-row[data-name]', pop).forEach((row) => { row.hidden = !!q && !row.dataset.name.includes(q); });
    const exact = S.people.some((p) => p.name.toLowerCase() === q || (p.email || '') === q);
    const create = $('.label-create', pop);
    create.hidden = !q || exact;
    $('span', create).innerHTML = `${isEmail(q) ? 'Add and assign' : 'Add'} “<b>${esc(el.value.trim())}</b>”`;
  },
  labelSearch: (el) => {
    ui.labelQuery = el.value;
    const q = el.value.trim().toLowerCase();
    const pop = el.closest('.picker');
    $$('.label-row[data-name]', pop).forEach((row) => { row.hidden = !!q && !row.dataset.name.includes(q); });
    const create = $('.label-create', pop);
    create.hidden = !q || $$('.label-row[data-name]', pop).some((row) => row.dataset.name === q);
    $('b', create).textContent = el.value.trim();
  },
  textScale: (el) => { S.settings.textScale = Number(el.value); applySizes(); el.nextElementSibling.textContent = `${Math.round(el.value * 100)}%`; Store.save(); },
  bucketSize: (el) => { S.settings.bucketSize = Number(el.value); applySizes(); el.nextElementSibling.textContent = `${el.value}px`; Store.save(); },
  decisionField: (el) => { const t = openTaskObj(); t.decision = { ...(t.decision || {}), [el.dataset.k]: el.value }; Store.save(); },
  healthNote: (el) => { openTaskObj().healthNote = el.value; Store.save(); },
  filterQ: (el) => { filterOf(el.dataset.key).q = el.value; renderMainOnly(); },
};

// ---------- Drag and drop (pointer based, so it works with both mouse and touch) ----------
// After a drag, the browser fires one click where the pointer was released; ignore clicks for a moment so it doesn't open the task.
const Drag = { s: null, quietUntil: 0 };

function dragStart() {
  const s = Drag.s;
  s.active = true;
  if (s.type === 'resize') {
    // Resizing grows the block in place; no ghost.
    s.source = s.el.closest('.tb-block');
    s.source.classList.add('resizing');
    s.ph = document.createElement('div');
    document.body.classList.add('dragging');
    closePop();
    return;
  }
  const keepPop = s.type === 'label' || s.type === 'bucketorder';
  const r = s.el.getBoundingClientRect();
  const source = s.type === 'bucket' ? s.el.closest('.col') : s.el;
  s.source = source;
  const ghost = s.el.cloneNode(true);
  ghost.classList.add('drag-ghost');
  ghost.removeAttribute('data-drag');
  ghost.style.width = `${r.width}px`;
  if (s.type === 'block') { ghost.style.top = '0'; ghost.style.left = '0'; ghost.style.height = `${r.height}px`; }
  (topDialog() || document.body).append(ghost);
  s.ghost = ghost;
  s.offX = s.x - r.left;
  s.offY = s.y - r.top;
  source.classList.add('drag-src');
  document.body.classList.add('dragging');
  document.activeElement?.blur?.();
  getSelection()?.removeAllRanges();
  s.ph = document.createElement('div');
  s.ph.className = s.type === 'bucket' ? 'ph ph-col' : 'ph';
  s.ph.style.height = `${s.type === 'bucket' ? 240 : Math.min(r.height, 80)}px`;
  if (!keepPop) closePop();
  autoScroll();
}
function dragMove(x, y) {
  const s = Drag.s;
  s.x = x; s.y = y;
  if (s.ghost) s.ghost.style.transform = `translate(${x - s.offX}px, ${y - s.offY}px) rotate(1.5deg)`;
  const under = document.elementFromPoint(x, y);
  $$('.drop').forEach((n) => n.classList.remove('drop'));
  s.target = null;
  if (s.type === 'resize') {
    const col = s.source.closest('[data-tb-date]');
    const t = taskById(s.id);
    const end = snapMin(Number(col.dataset.rs) + (y - col.getBoundingClientRect().top) / Number(col.dataset.ppm));
    const dur = Math.max(SNAP_OF(), end - t.slotStart);
    s.source.style.height = `${dur * Number(col.dataset.ppm)}px`;
    const label = $('.tb-b-time', s.source);
    if (label) label.textContent = `${fmtTime(t.slotStart)}–${fmtTime(t.slotStart + dur)} · ${fmtDur(dur)}`;
    s.target = { dur };
    return;
  }
  if (s.type === 'task' || s.type === 'block') {
    const hits = document.elementsFromPoint(x, y);
    $$('.merge-target').forEach((n) => n.classList.remove('merge-target'));
    // Over another block: offer to squeeze this task into the same time box.
    const onto = hits.find((n) => n.classList?.contains('tb-block') && n.dataset.id !== s.id);
    if (onto && !isBox(taskById(s.id))) {
      onto.classList.add('merge-target');
      s.tbph?.remove();
      s.ph.remove();
      s.target = { mergeInto: onto.dataset.id };
      return;
    }
    // Over a day in month view: drop it in that day's next free slot.
    const day = hits.find((n) => n.dataset?.tbMonth);
    if (day) {
      day.classList.add('drop');
      s.target = { monthDate: day.dataset.tbMonth };
      return;
    }
    // Over the time-box planner: show where the block would land, snapped to 15 minutes.
    const col = hits.find((n) => n.dataset?.tbDate);
    if (col) {
      const dur = durOf(taskById(s.id));
      const ppm = Number(col.dataset.ppm);
      const top = s.type === 'block' ? y - s.offY : y;
      const start = Math.min(1440 - dur, Math.max(0, snapMin(Number(col.dataset.rs) + (top - col.getBoundingClientRect().top) / ppm)));
      if (!s.tbph) { s.tbph = document.createElement('div'); s.tbph.className = 'tb-ph'; }
      if (s.tbph.parentNode !== col) col.append(s.tbph);
      s.tbph.style.top = `${(start - Number(col.dataset.rs)) * ppm}px`;
      s.tbph.style.height = `${dur * ppm}px`;
      s.tbph.textContent = `${fmtTime(start)}–${fmtTime(start + dur)}`;
      s.ph.remove();
      s.target = { tbDate: col.dataset.tbDate, tbStart: start };
      return;
    }
    s.tbph?.remove();
    if (s.type === 'block') return;
  }
  if (s.type === 'task') {
    const cell = document.elementsFromPoint(x, y).find((n) => n.dataset?.date);
    if (cell) {
      cell.classList.add('drop');
      s.target = { date: cell.dataset.date };
      return;
    }
    const col = under?.closest('.col[data-group]');
    // Tasks shown in an "Assigned by …" bucket belong to another plan, so they stay put.
    const fromBucket = String(s.fromGroup || '').startsWith('from:');
    // The Decision Request bucket always runs by deadline, so its cards don't move by hand.
    if (!col || s.fromGroup === 'from:decision' || (fromBucket ? col.dataset.group !== s.fromGroup : col.dataset.locked)) { s.ph.remove(); s.target = null; return; }
    const body = $('.col-body', col);
    const cards = $$('.card:not(.drag-src)', body);
    const before = cards.find((c) => { const r = c.getBoundingClientRect(); return y < r.top + r.height / 2; });
    body.insertBefore(s.ph, before || $('.show-done', body));
    s.target = { group: col.dataset.group, beforeId: before ? before.dataset.id : null };
  } else if (s.type === 'bucket') {
    const board = $('.board');
    const cols = $$('.col[data-bucket-id]:not(.drag-src)', board);
    const before = cols.find((c) => { const r = c.getBoundingClientRect(); return x < r.left + r.width / 2; });
    board.insertBefore(s.ph, before || $('.add-col', board));
    s.target = { beforeId: before ? before.dataset.bucketId : null };
  } else if (s.type === 'boxitem') {
    const list = s.el.closest('.box-items');
    const items = $$('li[data-drag]:not(.drag-src)', list);
    const before = items.find((c) => { const r = c.getBoundingClientRect(); return y < r.top + r.height / 2; });
    list.insertBefore(s.ph, before || null);
    s.target = { beforeId: before ? before.dataset.id : null };
  } else if (s.type === 'worktype' || s.type === 'bucketorder') {
    const list = s.el.closest('.wt-list, .bo-list');
    const rows = $$('.wt-row:not(.drag-src), .bo-row:not(.drag-src)', list);
    const before = rows.find((c) => { const r = c.getBoundingClientRect(); return y < r.top + r.height / 2; });
    list.insertBefore(s.ph, before || null);
  } else if (s.type === 'label') {
    const list = s.el.closest('.picker-scroll');
    const rows = $$('.label-row[data-drag]:not(.drag-src):not([hidden])', list);
    const before = rows.find((c) => { const r = c.getBoundingClientRect(); return y < r.top + r.height / 2; });
    list.insertBefore(s.ph, before || null);
    s.target = { beforeId: before ? before.dataset.id : null };
  } else if (s.type === 'check') {
    const list = s.el.closest('.checklist');
    const items = $$('.ck-item:not(.drag-src)', list);
    const before = items.find((c) => { const r = c.getBoundingClientRect(); return y < r.top + r.height / 2; });
    list.insertBefore(s.ph, before || null);
    s.target = { beforeId: before ? before.dataset.id : null };
  }
}
function autoScroll() {
  const s = Drag.s;
  if (!s || !s.active) return;
  const nudge = (el, axis) => {
    if (!el) return;
    const r = el.getBoundingClientRect();
    const [pos, lo, hi] = axis === 'x' ? [s.x, r.left, r.right] : [s.y, r.top, r.bottom];
    const speed = pos < lo + 50 ? -10 : pos > hi - 50 ? 10 : 0;
    if (axis === 'x') el.scrollLeft += speed; else el.scrollTop += speed;
  };
  nudge($('.board'), 'x');
  nudge(document.elementFromPoint(s.x, s.y)?.closest('.col-body, .task-scroll, .tb-scroll'), 'y');
  requestAnimationFrame(autoScroll);
}
function dragEnd(drop) {
  const s = Drag.s;
  Drag.s = null;
  clearTimeout(s.hold);
  if (!s.active) return;
  Drag.quietUntil = performance.now() + 350;
  s.ghost?.remove();
  if ((s.type === 'worktype' || s.type === 'bucketorder') && drop && s.ph.isConnected) s.ph.replaceWith(s.source); else s.ph.remove();
  s.tbph?.remove();
  s.source.classList.remove('drag-src', 'resizing');
  document.body.classList.remove('dragging');
  $$('.drop').forEach((n) => n.classList.remove('drop'));
  if (s.type === 'worktype') return;
  if (s.type === 'bucketorder') {
    // The list's new order becomes the board's bucket order.
    const plan = currentPlan();
    const ids = $$('.bo-list .bo-row', ui.pop?.el || document).map((r) => r.dataset.id);
    plan.buckets = ids.map((bid) => plan.buckets.find((b) => b.id === bid)).filter(Boolean).concat(plan.buckets.filter((b) => !ids.includes(b.id)));
    commit();
    refreshPop();
    return;
  }
  if (s.type === 'resize') {
    const t = taskById(s.id);
    if (drop && s.target && s.target.dur !== durOf(t)) scheduleTask(t, t.slotDate, t.slotStart, s.target.dur); else render();
    return;
  }
  $$('.merge-target').forEach((n) => n.classList.remove('merge-target'));
  if (drop && s.target?.mergeInto) { dropOnBlock(taskById(s.id), taskById(s.target.mergeInto)); return; }
  if (drop && s.target?.monthDate) {
    const t = taskById(s.id);
    const iso = s.target.monthDate;
    const slot = freeSlot(t, iso, iso === todayISO() ? nowMin() : 0);
    scheduleTask(t, iso, slot && slot.date === iso ? slot.start : TB().dayStart);
    return;
  }
  if (drop && s.target?.tbDate) { scheduleTask(taskById(s.id), s.target.tbDate, s.target.tbStart); return; }
  if (!drop || !s.target) return;
  if (s.type === 'task') {
    if (s.target.date) dropOnDate(s.id, s.target.date, s.grabDate);
    else dropOnGroup(s.id, s.fromGroup, s.target.group, s.target.beforeId);
  } else if (s.type === 'bucket') {
    const plan = currentPlan();
    const seq = $$('.board .col[data-bucket-id]').map((c) => c.dataset.bucketId).filter((k) => k !== s.id);
    const at = s.target.beforeId ? seq.indexOf(s.target.beforeId) : seq.length;
    seq.splice(at < 0 ? seq.length : at, 0, s.id);
    const real = seq.filter((k) => !k.startsWith('from:'));
    plan.buckets = real.map((k) => plan.buckets.find((b) => b.id === k)).filter(Boolean).concat(plan.buckets.filter((b) => !real.includes(b.id)));
    plan.fromPos = {};
    seq.forEach((k, i) => { if (k.startsWith('from:')) plan.fromPos[k] = seq.slice(0, i).filter((x) => !x.startsWith('from:')).length; });
    commit();
  } else if (s.type === 'boxitem') {
    const moved = taskById(s.id);
    const order = boxItems(boxOf(moved)).filter((t) => t !== moved);
    const at = s.target.beforeId ? order.findIndex((t) => t.id === s.target.beforeId) : order.length;
    order.splice(at, 0, moved);
    order.forEach((t, i) => { t.boxOrder = i; });
    commit();
  } else if (s.type === 'label') {
    const plan = planById(ui.labelCtx.planId);
    const order = labelOrder(plan).filter((i) => i !== Number(s.id));
    const at = s.target.beforeId === null ? order.length : order.indexOf(Number(s.target.beforeId));
    order.splice(at, 0, Number(s.id));
    plan.labelOrder = order;
    commit();
    refreshLabels();
  } else if (s.type === 'check') {
    const t = openTaskObj();
    const moved = t.checklist.find((c) => c.id === s.id);
    t.checklist = t.checklist.filter((c) => c !== moved);
    const i = s.target.beforeId ? t.checklist.findIndex((c) => c.id === s.target.beforeId) : t.checklist.length;
    t.checklist.splice(i, 0, moved);
    commit();
  }
}
function dropOnGroup(id, from, to, beforeId) {
  const t = taskById(id);
  if (String(to).startsWith('from:')) {
    if (from !== to) return;
    const list = assignedToMeGroups(currentPlan()).find((g) => g.key === to)?.tasks.filter((x) => x.id !== id) || [];
    const i = beforeId ? list.findIndex((x) => x.id === beforeId) : list.length;
    list.splice(i < 0 ? list.length : i, 0, t);
    list.forEach((x, n) => { x.myOrder = n; });
    commit();
    return;
  }
  const by = currentBy();
  if (!applyGroup(t, by, from, to)) return;
  const plan = currentPlan();
  const group = groupsFor(by, currentViewTasks(), plan).find((g) => g.key === to);
  const list = (group ? group.tasks : []).filter((x) => x.id !== id);
  const i = beforeId ? list.findIndex((x) => x.id === beforeId) : list.filter((x) => !isDone(x)).length;
  const [prev, next] = [list[i - 1], list[i]];
  if (prev && next) t.order = (prev.order + next.order) / 2;
  else if (next) t.order = next.order - 1;
  else if (prev) t.order = prev.order + 1;
  commit();
}
function dropOnDate(id, date, grabDate) {
  const t = taskById(id);
  if (dueLocked(t) && t.due) { toast(`${person(t.assignedBy)?.name || 'The assigner'} set this due date.`, { error: true }); render(); return; }
  if (t.due || t.start) {
    const shift = daysBetween(grabDate || t.due || t.start, date);
    if (t.start) t.start = addDays(t.start, shift);
    if (t.due) t.due = addDays(t.due, shift);
  } else t.due = date;
  commit();
}

document.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  const el = e.target.closest('[data-drag]');
  if (!el || e.target.closest('select, textarea, a, .check, .icon-btn, .btn, .wt-row input')) return;
  const touch = e.pointerType !== 'mouse';
  Drag.s = {
    el, type: el.dataset.drag, id: el.dataset.id, startX: e.clientX, startY: e.clientY, x: e.clientX, y: e.clientY, touch, active: false,
    fromGroup: el.closest('.col')?.dataset.group,
    grabDate: document.elementsFromPoint(e.clientX, e.clientY).find((n) => n.dataset?.date)?.dataset.date,
  };
  if (touch) Drag.s.hold = setTimeout(() => { if (Drag.s) { dragStart(); dragMove(Drag.s.x, Drag.s.y); navigator.vibrate?.(15); } }, 280);
});
document.addEventListener('pointermove', (e) => {
  const s = Drag.s;
  if (!s) return;
  s.x = e.clientX; s.y = e.clientY;
  if (s.active) return dragMove(e.clientX, e.clientY);
  const moved = Math.hypot(e.clientX - s.startX, e.clientY - s.startY) > 6;
  if (!moved) return;
  if (s.touch) { dragEnd(false); return; } // finger moved before the hold finished: it's a scroll
  dragStart();
  dragMove(e.clientX, e.clientY);
});
document.addEventListener('pointerup', () => { if (Drag.s) dragEnd(true); });
document.addEventListener('pointercancel', () => { if (Drag.s) dragEnd(false); });
document.addEventListener('touchmove', (e) => { if (Drag.s?.active) e.preventDefault(); }, { passive: false });

// ---------- Global events ----------
document.addEventListener('click', (e) => {
  if (performance.now() < Drag.quietUntil && e.detail > 0) { e.preventDefault(); e.stopPropagation(); return; }
  if (ui.pop && !ui.pop.el.contains(e.target)) {
    const insideAnchor = ui.pop.anchor.contains(e.target);
    // Some pop-ups (an S-Team Plan cell) save what you typed when you click away.
    const auto = ui.pop.el.querySelector('form[data-autosave]');
    if (auto) submits[auto.dataset.submit](auto, new FormData(auto));
    closePop();
    if (insideAnchor) return;
  }
  // Radios can't be unticked natively; clicking the active "Show on card" goes back to automatic.
  if (e.target.matches('[data-field="preview"]') && openTaskObj()?.preview === e.target.value) { setField(openTaskObj(), 'preview', 'auto'); return; }
  const el = e.target.closest('[data-act], [data-open-task]');
  if (el?.dataset.act) { e.preventDefault(); Usage.track(el.dataset.act); actions[el.dataset.act](el, e); return; }
  if (el) { Usage.track('openTask'); openTask(el.dataset.openTask); return; }
  if (ui.navOpen && !e.target.closest('#sidebar')) { ui.navOpen = false; renderSidebar(); }
}, true);
function openTask(id) {
  ui.openTask = id;
  ui.draft = { comment: '', files: [], links: [], contacts: [], replyTo: null };
  ui.chatSelect = null;
  ui.chatToBottom = true;
  // Opening a task reads its notifications.
  let read = false;
  S.inbox.forEach((n) => { if (n.taskId === id && !n.read) { n.read = true; read = true; } });
  if (read) { Store.save(); updateBell(); }
  renderTask();
  $('#taskDialog .task-scroll').scrollTop = 0;
}
document.addEventListener('submit', (e) => {
  const form = e.target.closest('[data-submit]');
  if (!form) return;
  e.preventDefault();
  Usage.track(`form:${form.dataset.submit}`);
  submits[form.dataset.submit](form, new FormData(form));
  if (form.isConnected) form.reset();
});
// Right-click (or long-press) a checklist item: delete it, if you added it.
document.addEventListener('contextmenu', (e) => {
  const li = e.target.closest('#taskDialog .ck-item[data-id]');
  if (!li) return;
  const t = openTaskObj();
  const c = t?.checklist.find((x) => x.id === li.dataset.id);
  if (!c) return;
  e.preventDefault();
  const anchor = { getBoundingClientRect: () => ({ left: e.clientX, right: e.clientX, top: e.clientY, bottom: e.clientY }), contains: () => false };
  openMenu(anchor, canDelCheck(t, c)
    ? [{ label: 'Delete item', icon: 'trash', danger: true, run: () => { t.checklist = t.checklist.filter((x) => x !== c); commit(); } }]
    : [{ label: `Added by ${person(c.by)?.name || 'someone else'}: only they can delete it`, icon: 'lock', run: () => {} }]);
});
// Right-click (or long-press on a phone) on a task card opens its menu (bucket, labels, copy, move…).
document.addEventListener('contextmenu', (e) => {
  const card = e.target.closest('.card[data-id]');
  if (!card || e.target.closest('input, textarea, a')) return;
  const t = taskById(card.dataset.id);
  if (!t) return;
  e.preventDefault();
  const anchor = { getBoundingClientRect: () => ({ left: e.clientX, right: e.clientX, top: e.clientY, bottom: e.clientY }), contains: () => false };
  openMenu(anchor, taskMenuItems(t, anchor));
});
// Right-click (or long-press on a phone) on a message opens its menu.
document.addEventListener('contextmenu', (e) => {
  const li = e.target.closest('#taskDialog .msg[data-msg]');
  if (!li || ui.chatSelect || e.target.closest('a, textarea, input')) return;
  const c = msgOf(li.dataset.msg);
  if (!c || c.deleted || isRecalled(c)) return;
  e.preventDefault();
  msgMenu({ getBoundingClientRect: () => ({ left: e.clientX, right: e.clientX, top: e.clientY, bottom: e.clientY }), contains: () => false }, li.dataset.msg);
});
// Right-click (or long-press on a phone) on the Time Box grid edits the block there.
document.addEventListener('contextmenu', (e) => {
  const col = e.target.closest('.tb-col[data-tb-date]');
  if (!col || e.target.closest('.tb-block')) return;
  e.preventDefault();
  blockMenu(e, col);
});
// "Edit…" at the bottom of any work type dropdown: put the dropdown back and open the editor.
document.addEventListener('change', (e) => {
  const sel = e.target;
  if (sel.tagName !== 'SELECT' || sel.value !== EDIT_WORK_TYPES) return;
  e.stopImmediatePropagation();
  const was = [...sel.options].find((o) => o.defaultSelected) || sel.options[0];
  sel.value = was.value;
  editWorkTypesDlg();
}, true);
document.addEventListener('change', (e) => {
  const el = e.target.closest('[data-change]');
  if (el) { Usage.track(el.dataset.change === 'taskField' || el.dataset.change === 'tbField' ? `${el.dataset.change}:${el.dataset.field}` : el.dataset.change); changes[el.dataset.change](el); }
});
document.addEventListener('input', (e) => {
  const el = e.target.closest('[data-input]');
  if (el) inputs[el.dataset.input](el);
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.closest?.('.bp-item input')) { e.preventDefault(); e.target.form.requestSubmit(); return; }
  if (e.key === 'Enter' && e.target.closest?.('.bp-cell')) { e.preventDefault(); actions.bpCell(e.target.closest('.bp-cell')); return; }
  if (e.key === 'Enter' && e.target.matches?.('[data-focus="wt-new"]')) { e.preventDefault(); actions.wtAddRow(e.target); return; }
  const tag = e.target.tagName;
  const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
  if (e.key === 'Escape') {
    if (Drag.s) { dragEnd(false); e.preventDefault(); return; }
    if (ui.pop && ui.labelEdit !== null && e.target.closest('.label-row.editing')) { ui.labelEdit = null; refreshLabels('label-search'); e.preventDefault(); return; }
    if (ui.pop) { closePop(); e.preventDefault(); return; }
    if (ui.quickAdd && !topDialog()) { ui.quickAdd = null; render(); }
    return;
  }
  if (e.key === 'Enter' && e.target.matches('article[data-open-task]')) { e.preventDefault(); openTask(e.target.dataset.openTask); return; }
  if (e.key === 'Enter' && e.target.matches('.col-title-input, .plan-title, .people-list input')) e.target.blur();
  if (e.key === 'Enter' && e.target.closest('.chat-compose') && !e.shiftKey && !e.isComposing) { e.preventDefault(); e.target.form.requestSubmit(); }
  if (e.key === '/' && !typing && !topDialog()) { e.preventDefault(); $('#search').focus(); }
});
function bindShell() {
  const d = $('#taskDialog');
  d.addEventListener('cancel', (e) => {
    if (ui.pop) { e.preventDefault(); closePop(); return; }
    ui.openTask = null;
  });
  d.addEventListener('close', () => { ui.openTask = null; closePop(); });
  d.addEventListener('click', (e) => { if (e.target === d) actions.closeTask(); });
  ['dragover', 'drop'].forEach((type) => d.addEventListener(type, (e) => {
    e.preventDefault();
    if (type === 'drop' && e.dataTransfer.files.length) stageFiles([...e.dataTransfer.files]);
  }));
  $('#search').addEventListener('input', (e) => { ui.search = e.target.value; renderMainOnly(); });
  window.addEventListener('hashchange', route);
  window.addEventListener('online', () => { updateStatus(); Cloud.sync(); });
  window.addEventListener('offline', updateStatus);
  window.addEventListener('pagehide', () => { if (Store.timer) Store.flush(); });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') { if (Store.timer) Store.flush(); return; }
    if (Team.dir) Team.sync();
    checkReminders();
    if (!topDialog()) render(); // pick up a new day's Late / Today / My Day
  });
  let tip;
  document.addEventListener('pointerover', (e) => showTip(e.target));
  document.addEventListener('focusin', (e) => showTip(e.target));
  function showTip(target) {
    const text = target.dataset?.tip;
    if (!text) { tip?.remove(); tip = null; return; }
    tip = tip || document.body.appendChild(Object.assign(document.createElement('div'), { className: 'tip' }));
    tip.textContent = text;
    const r = target.getBoundingClientRect();
    tip.style.left = `${Math.max(8, Math.min(r.left + r.width / 2 - tip.offsetWidth / 2, innerWidth - tip.offsetWidth - 8))}px`;
    tip.style.top = `${Math.max(8, r.top - tip.offsetHeight - 6)}px`;
  }
}
function route() {
  const [path, query] = location.hash.split('?');
  const [, a, b, c, d] = path.split('/');
  Usage.track(`page:${a || 'hub'}`);
  ui.route = a === 'plan' && b ? { view: 'plan', id: b } : a === 'person' && b ? { view: 'person', id: b } : ['my-tasks', 'report', 'timebox', 'halfplan'].includes(a) ? { view: a } : { view: 'hub' };
  const who = a === 'report' && query && new URLSearchParams(query).get('person');
  if (who) ui.report.person = who;
  // A link like #/hub?name=Sam&email=sam@company.com fills in your identity on a fresh copy, then opens Settings.
  const params = new URLSearchParams(query || '');
  const me = person(S.meId);
  if (params.get('email') && !me.email) {
    me.email = params.get('email').trim().toLowerCase();
    if (params.get('name')) me.name = params.get('name').trim();
    Store.save();
    history.replaceState(null, '', path);
    if (S.settings.onboarded !== false) setTimeout(() => actions.openSettings(), 0);
  }
  ui.search = '';
  ui.navOpen = false;
  ui.quickAdd = null;
  $('#search').value = '';
  closePop();
  const plan = currentPlan();
  if (plan) { plan.lastOpened = Date.now(); Store.save(); }
  render();
  $('#main').scrollTop = 0;
  if (c === 'task' && taskById(d)) openTask(d);
}

// ---------- Startup ----------
(async function start() {
  try {
    await Store.load();
  } catch (err) {
    console.error(err);
    $('#main').innerHTML = `<div class="page"><div class="empty"><h2>Could not open your data</h2><p>${esc(err.message)}</p></div></div>`;
    return;
  }
  Store.onStatus = updateStatus;
  Store.beforeSave = trackChanges;
  Store.afterSave = () => { Team.schedulePush(); Cloud.schedule(); };
  Store.onExternalChange = () => { if (!document.activeElement?.closest?.('dialog')) render(); };
  $('#topbar').innerHTML = `
    <button class="icon-btn nav-toggle" data-act="openNav" aria-label="Menu">${icon('menu', 20)}</button>
    <label class="search">${icon('search', 15)}<input id="search" type="search" placeholder="Search plans and tasks" aria-label="Search plans and tasks" autocomplete="off"></label>
    <button id="status" class="status" role="status"></button>
    <button class="icon-btn bell" data-act="openInbox" aria-label="Notifications" title="Notifications">${icon('bell', 19)}<span id="bellCount" class="badge" hidden></span></button>
    <button class="icon-btn" data-act="openSettings" aria-label="Settings" title="Settings">${icon('gear', 19)}</button>`;
  bindShell();
  applyTheme();
  route();
  if (!S.settings.bucketsV1) {
    const p = S.plans.find((x) => x.personal);
    if (p) {
      const have = new Set(p.buckets.map((b) => b.name.toLowerCase()));
      p.buckets = [...DEFAULT_BUCKETS.filter((n) => !have.has(n.toLowerCase())).map((name) => ({ id: uid(), name })), ...p.buckets];
    }
    S.settings.bucketsV1 = true;
    Store.save();
  }
  if (S.settings.onboarded === false) setTimeout(setupDlg, 60);
  setTimeout(checkReminders, 1500);
  setInterval(checkReminders, 60000);
  if (new URLSearchParams(location.search).get('test') === '1') setTimeout(() => { if (!Team.dir && person(S.meId)?.email) Team.connectDevice({ quiet: true }); }, 400);
  updateStatus();
  Store.collectGarbage().catch(console.error);
  if (!S.sync.ready) { trackChanges(); Store.save(); }
  Team.init().catch(console.error);
  Cloud.init().catch(console.error);
  setInterval(updateStatus, 30000);
  if (location.protocol.startsWith('http') && 'serviceWorker' in navigator) {
    const link = document.createElement('link');
    link.rel = 'manifest';
    link.href = 'manifest.webmanifest';
    document.head.append(link);
    // When an updated version installs, reload once so the new code runs straight away.
    const hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController) location.reload(); });
    navigator.serviceWorker.register('sw.js').catch(console.error);
  }
}());
