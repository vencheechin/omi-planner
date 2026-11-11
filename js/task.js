'use strict';
/* Task details panel, plus the popovers, dialogs and toasts the whole app shares. */

const topDialog = () => $$('dialog[open]').pop() || null;

// ---------- Toasts ----------
/** The toast container; recreated if a closed dialog took it with it. */
function toastHost() {
  let host = $('#toasts');
  if (!host) {
    host = Object.assign(document.createElement('div'), { id: 'toasts' });
    host.setAttribute('aria-live', 'polite');
  }
  return host;
}
function toast(msg, opts = {}) {
  const host = toastHost();
  (topDialog() || document.body).append(host);
  const el = document.createElement('div');
  el.className = `toast ${opts.error ? 'error' : ''}`;
  el.setAttribute('role', 'status');
  el.innerHTML = `<span>${esc(msg)}</span>`;
  if (opts.undo) {
    const b = document.createElement('button');
    b.textContent = 'Undo';
    b.onclick = () => { opts.undo(); el.remove(); };
    el.append(b);
  }
  host.append(el);
  setTimeout(() => el.remove(), opts.undo ? 7000 : 3500);
}
/** Runs a destructive change and offers to roll the whole state back. */
function undoable(msg, fn) {
  const before = JSON.stringify(S);
  fn();
  commit();
  toast(msg, { undo: () => { S = JSON.parse(before); commit(); } });
}

// ---------- Popovers and menus ----------
function closePop() {
  if (ui.pop) { ui.pop.el.remove(); ui.pop = null; }
}
function placePop(el, anchor) {
  const r = anchor.getBoundingClientRect();
  const { offsetWidth: w, offsetHeight: h } = el;
  const left = Math.max(8, Math.min(r.left, innerWidth - w - 8));
  const below = r.bottom + 4;
  el.style.left = `${left}px`;
  el.style.top = `${below + h > innerHeight - 8 ? Math.max(8, r.top - h - 4) : below}px`;
}
function openPop(anchor, renderFn) {
  closePop();
  const el = document.createElement('div');
  el.className = 'pop';
  el.innerHTML = renderFn();
  (topDialog() || document.body).append(el);
  placePop(el, anchor);
  ui.pop = { el, renderFn, anchor };
  return el;
}
function refreshPop() {
  if (ui.pop) ui.pop.el.innerHTML = ui.pop.renderFn();
}
function openMenu(anchor, items) {
  ui.menuItems = items;
  const el = openPop(anchor, () => `<div class="menu" role="menu">${items.map((it, i) => (it === '-' ? '<hr>' : `<button role="menuitem" class="${it.danger ? 'danger' : ''}" data-act="menuPick" data-i="${i}">${it.icon ? icon(it.icon, 15) : '<span class="ic-space"></span>'}<span>${esc(it.label)}</span>${it.checked ? icon('check', 14) : ''}${it.sub ? icon('chevR', 14) : ''}</button>`)).join('')}</div>`);
  $('button', el)?.focus();
}

// ---------- Generic dialogs ----------
function showDialog({ title, html, wide, onClose }) {
  const d = document.createElement('dialog');
  d.className = `dlg ${wide ? 'wide' : ''}`;
  d.innerHTML = `<header><h2>${esc(title)}</h2><button class="icon-btn" data-act="closeDialog" aria-label="Close">${icon('close')}</button></header><div class="dlg-body">${html}</div>`;
  document.body.append(d);
  // Finish as soon as close() is called: some browsers deliver the 'close' event late or not at all,
  // and callers wait on onClose for the answer. The event still covers Escape.
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    closePop();
    // Toasts shown over this dialog live inside it; move them out before it goes.
    const host = $('#toasts', d);
    if (host) document.body.append(host);
    d.remove();
    if (onClose) onClose();
  };
  const nativeClose = d.close.bind(d);
  d.close = () => { nativeClose(); finish(); };
  d.addEventListener('close', finish);
  d.addEventListener('cancel', () => setTimeout(finish, 0));
  d.showModal();
  return d;
}
function confirmDlg(title, message, action, danger = true) {
  return new Promise((resolve) => {
    let ok = false;
    const d = showDialog({
      title,
      html: `<p>${esc(message)}</p><div class="dlg-foot"><button class="btn ghost" data-role="no">Cancel</button><button class="btn ${danger ? 'danger' : 'primary'}" data-role="yes">${esc(action)}</button></div>`,
      onClose: () => resolve(ok),
    });
    $('[data-role=no]', d).onclick = () => d.close();
    $('[data-role=yes]', d).onclick = () => { ok = true; d.close(); };
  });
}
function promptDlg(title, label, value = '', action = 'Save') {
  return new Promise((resolve) => {
    let result = null;
    const d = showDialog({
      title,
      html: `<form method="dialog" class="stack"><label class="field"><span>${esc(label)}</span><input name="v" value="${esc(value)}" required autocomplete="off"></label><div class="dlg-foot"><button class="btn ghost" type="button" data-role="no">Cancel</button><button class="btn primary">${esc(action)}</button></div></form>`,
      onClose: () => resolve(result),
    });
    const input = $('input', d);
    input.select();
    $('[data-role=no]', d).onclick = () => d.close();
    $('form', d).onsubmit = () => { result = input.value.trim() || null; };
  });
}

// ---------- Task panel ----------
const options = (list, val) => list.map((o) => `<option value="${esc(o.v)}" ${String(o.v) === String(val) ? 'selected' : ''}>${esc(o.label)}</option>`).join('');

function renderTask() {
  const d = $('#taskDialog');
  const t = ui.openTask && taskById(ui.openTask);
  if (!t) {
    ui.openTask = null;
    if (d.open) d.close();
    return;
  }
  const plan = planById(t.planId);
  const doneItems = t.checklist.filter((c) => c.done).length;
  const field = (label, control) => `<label class="field"><span>${label}</span>${control}</label>`;
  const panel = `
    <header class="task-head">
      <span class="crumb">${planTile(plan, 18)} ${esc(plan.name)}</span>
      <div class="spacer"></div>
      <button class="btn ghost sm ${t.myDay === todayISO() ? 'active' : ''}" data-act="toggleMyDay" data-id="${esc(t.id)}">${icon('sun', 14)} My Day</button>
      <button class="icon-btn" data-act="taskMenu" aria-label="Task options">${icon('more')}</button>
      <button class="icon-btn" data-act="closeTask" aria-label="Close task">${icon('close')}</button>
    </header>
    <div class="task-scroll" data-scroll="task-panel">
      <div class="task-labels">
        ${orderedLabels(plan, t.labels).map((l) => `<span class="label-chip removable" style="background:${LABELS[l][1]};color:${inkOn(LABELS[l][1])}">${esc(labelName(plan, l))}<button class="chip-x" data-act="removeLabel" data-i="${l}" aria-label="Remove label ${esc(labelName(plan, l))}">${icon('close', 11)}</button></span>`).join('')}
        <button class="add-chip" data-act="pickLabels" data-id="${esc(t.id)}">${icon('tag', 13)} Add label</button>
      </div>
      <div class="task-title">
        <button class="check big ${isDone(t) ? 'on' : ''} ${t.review ? 'pending' : ''}" data-act="toggleDone" data-id="${esc(t.id)}" aria-label="${checkLabel(t)}" title="${checkLabel(t)}">${icon('check', 14)}</button>
        <input value="${esc(t.title)}" placeholder="Task name" data-input="title" data-focus="task-title" aria-label="Task name">
      </div>
      <div class="assign-row">
        <div class="avatars">${t.assignees.map((a) => avatar(person(a), 28)).join('')}</div>
        <button class="add-chip" data-act="pickAssignees" data-id="${esc(t.id)}">${icon('user', 13)} ${t.assignees.length ? 'Change' : 'Assign'}</button>
      </div>
      ${workflowHTML(t)}
      <div class="task-fields">
        ${field('Bucket', `<select data-change="taskField" data-field="bucketId">${options(plan.buckets.map((b) => ({ v: b.id, label: b.name })), t.bucketId)}</select>`)}
        ${field('Progress', `<select data-change="taskField" data-field="progress">${options(PROGRESS, t.progress)}</select>`)}
        ${field('Priority', `<select data-change="taskField" data-field="priority">${options(PRIORITY, t.priority)}</select>`)}
        ${field('Start date', `<input type="date" value="${t.start || ''}" data-change="taskField" data-field="start">`)}
        ${field('Due date', `<input type="date" value="${t.due || ''}" data-change="taskField" data-field="due" class="${isLate(t) ? 'late-input' : ''}">`)}
        ${field('Repeat', `<select data-change="taskField" data-field="repeat">${options(REPEATS, t.repeat)}</select>`)}
      </div>
      ${timeboxHTML(t)}
      <section class="task-sec">
        <div class="sec-head"><h3>Notes</h3><label class="mini"><input type="radio" name="preview" data-change="taskField" data-field="preview" value="notes" ${t.preview === 'notes' ? 'checked' : ''}> Show on card</label></div>
        <textarea rows="3" placeholder="Add notes" data-input="notes" data-focus="task-notes" aria-label="Notes">${esc(t.notes)}</textarea>
      </section>
      <section class="task-sec">
        <div class="sec-head"><h3>Checklist${t.checklist.length ? ` <small>${doneItems} / ${t.checklist.length}</small>` : ''}</h3><label class="mini"><input type="radio" name="preview" data-change="taskField" data-field="preview" value="checklist" ${t.preview === 'checklist' ? 'checked' : ''}> Show on card</label></div>
        <ul class="checklist">
          ${t.checklist.map((c) => `<li class="ck-item ${c.done ? 'done' : ''}" data-drag="check" data-id="${esc(c.id)}">
            <button class="check small ${c.done ? 'on' : ''}" data-act="toggleCheck" data-id="${esc(c.id)}" aria-label="${c.done ? 'Uncheck' : 'Check'} item">${icon('check', 10)}</button>
            <input value="${esc(c.text)}" data-input="checkText" data-id="${esc(c.id)}" aria-label="Checklist item">
            <button class="icon-btn" data-act="delCheck" data-id="${esc(c.id)}" aria-label="Delete item">${icon('close', 13)}</button></li>`).join('')}
        </ul>
        <form class="inline-add" data-submit="addCheck"><span>${icon('plus', 14)}</span><input name="text" placeholder="Add an item" data-focus="check-add" autocomplete="off" aria-label="Add a checklist item"></form>
      </section>
      <section class="task-sec">
        <div class="sec-head"><h3>Attachments</h3>
          <div class="row">
            <label class="mini"><input type="radio" name="preview" data-change="taskField" data-field="preview" value="attachment" ${t.preview === 'attachment' ? 'checked' : ''}> Show on card</label>
            <button class="btn ghost sm" data-act="addFile">${icon('clip', 13)} File</button>
            <button class="btn ghost sm" data-act="addLink">${icon('link', 13)} Link</button>
          </div></div>
        <ul class="attach-list" data-dropfiles>
          ${t.attachments.map((a) => `<li>
            ${a.thumb ? `<img src="${esc(a.thumb)}" alt="">` : `<span class="file-ic">${icon(a.kind === 'link' ? 'link' : 'clip', 15)}</span>`}
            ${a.kind === 'link'
              ? (safeUrl(a.url) ? `<a href="${esc(safeUrl(a.url))}" target="_blank" rel="noopener noreferrer">${esc(a.name)}</a>` : `<span>${esc(a.name)}</span>`)
              : `<button class="link-btn" data-act="openFile" data-id="${esc(a.id)}">${esc(a.name)}</button><small>${fmtSize(a.size || 0)}</small>`}
            <button class="icon-btn" data-act="delAttachment" data-id="${esc(a.id)}" aria-label="Remove ${esc(a.name)}">${icon('close', 13)}</button></li>`).join('')}
        </ul>
        ${t.attachments.length ? '' : `<p class="muted small">Drop files here. They stay on this device.</p>`}
      </section>
      <section class="task-sec">
        <div class="sec-head"><h3>Comments</h3></div>
        <form class="comment-add" data-submit="addComment">
          <textarea rows="2" name="text" placeholder="Add a comment" data-input="commentDraft" data-focus="comment" aria-label="Add a comment">${esc(ui.draft.comment)}</textarea>
          <button class="btn primary sm">Post</button>
        </form>
        <ul class="comments">
          ${t.comments.filter((c) => !c.deleted).reverse().map((c) => `<li>${avatar(person(c.author), 28)}<div><p class="c-meta"><b>${esc(person(c.author)?.name || 'Unknown')}</b> <small>${fmtDateTime(c.at)}</small><button class="icon-btn" data-act="delComment" data-id="${esc(c.id)}" aria-label="Delete comment">${icon('close', 12)}</button></p><p class="c-text">${esc(c.text)}</p></div></li>`).join('')}
        </ul>
      </section>
      ${activityHTML(t)}
    </div>`;
  if (!d.firstElementChild) d.innerHTML = '<div class="panel"></div>';
  d.firstElementChild.innerHTML = panel;
  if (!d.open) d.showModal();
}

// ---------- Pickers ----------
/** Labels popover. With a task it applies labels; without one (plan menu) it only renames them. */
function labelPicker() {
  const { taskId, planId } = ui.labelCtx;
  const t = taskId && taskById(taskId);
  const plan = planById(planId);
  const q = ui.labelQuery.trim().toLowerCase();
  const exact = LABELS.some((_, i) => labelName(plan, i).toLowerCase() === q);
  const row = (i) => {
    const hex = LABELS[i][1];
    const name = labelName(plan, i);
    if (ui.labelEdit === i) {
      return `<form class="label-row editing" data-submit="labelRename" data-i="${i}"><i class="dot" style="background:${hex}"></i><input name="name" value="${esc(plan.labels[i])}" placeholder="${esc(LABELS[i][0])}" data-focus="label-edit" autocomplete="off" aria-label="Label name"><button class="btn primary sm">Save</button></form>`;
    }
    const on = !!t && t.labels.includes(i);
    return `<div class="label-row" data-name="${esc(name.toLowerCase())}" data-drag="label" data-id="${i}" ${q && !name.toLowerCase().includes(q) ? 'hidden' : ''}>
      <span class="grip" aria-hidden="true" title="Drag to reorder">⋮⋮</span>
      <button class="label-pick" ${t ? `data-act="toggleLabel" data-i="${i}" aria-pressed="${on}"` : 'disabled'}><span class="label-chip" style="background:${hex};color:${inkOn(hex)}">${esc(name)}</span>${on ? icon('check', 15) : ''}</button>
      <button class="icon-btn" data-act="editLabel" data-i="${i}" aria-label="Rename ${esc(name)}" title="Rename">${icon('pencil', 14)}</button></div>`;
  };
  return `<div class="picker labels">
    <h4>${t ? 'Labels' : `Labels in ${esc(plan.name)}`} <small class="muted">· drag to reorder</small></h4>
    <form class="label-search" data-submit="labelCreate">${icon('search', 14)}<input name="q" value="${esc(ui.labelQuery)}" placeholder="Search or create a label" data-input="labelSearch" data-focus="label-search" autocomplete="off" aria-label="Search or create a label"></form>
    <button class="label-create" data-act="createLabel" ${q && !exact ? '' : 'hidden'}>${icon('plus', 14)}<span>Create “<b>${esc(ui.labelQuery.trim())}</b>”</span></button>
    <div class="picker-scroll">${labelOrder(plan).map(row).join('')}</div></div>`;
}
const isEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s).trim());
/** Assign by name or email: type to filter, Enter picks the match, a new email adds that person. */
function assignPicker(t) {
  const plan = planById(t.planId);
  const ids = [...plan.members, ...S.people.map((p) => p.id).filter((id) => !plan.members.includes(id))].filter(person);
  const q = (ui.assignQuery || '').trim().toLowerCase();
  const match = (p) => !q || p.name.toLowerCase().includes(q) || (p.email || '').includes(q);
  const exact = S.people.some((p) => p.name.toLowerCase() === q || (p.email || '') === q);
  return `<div class="picker assign"><h4>Assign to</h4>
    <form class="label-search" data-submit="assignSearch" data-id="${esc(t.id)}">${icon('search', 14)}<input name="q" value="${esc(ui.assignQuery || '')}" placeholder="Name or email" data-input="assignSearch" data-focus="assign-search" autocomplete="off" aria-label="Find or add a person by name or email"></form>
    <button class="label-create" data-act="assignCreate" data-id="${esc(t.id)}" ${q && !exact ? '' : 'hidden'}>${icon('plus', 14)}<span>${isEmail(q) ? 'Add and assign' : 'Add'} “<b>${esc(ui.assignQuery || '')}</b>”</span></button>
    <div class="picker-scroll">${ids.map((id) => {
    const p = person(id);
    const on = t.assignees.includes(id);
    return `<button class="person-row" data-act="toggleAssignee" data-id="${esc(t.id)}" data-person="${esc(id)}" data-name="${esc(`${p.name} ${p.email || ''}`.toLowerCase())}" aria-pressed="${on}" ${match(p) ? '' : 'hidden'}>${avatar(p, 26)}<span>${esc(p.name)}${id === S.meId ? ' (you)' : ''}${p.email ? `<small class="muted person-email">${esc(p.email)}</small>` : ''}</span>${on ? icon('check', 14) : ''}</button>`;
  }).join('')}</div>
    <p class="muted small">Type an email to add someone new. Tasks reach a colleague when this email matches the one in their Planner.</p></div>`;
}
/** Finds a person by name or email, or adds one; an email-only entry gets a name from the address. */
function personFromQuery(q) {
  q = q.trim();
  const low = q.toLowerCase();
  const found = S.people.find((p) => (p.email || '') === low) || S.people.find((p) => p.name.toLowerCase() === low);
  if (found) return found;
  if (isEmail(q)) {
    const local = low.split('@')[0].split(/[._-]+/).filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
    return ensurePerson(local || low, low);
  }
  return ensurePerson(q, '');
}
function memberPicker(plan) {
  return `<div class="picker"><h4>Plan members</h4><div class="picker-scroll">${S.people.map((p) => {
    const on = plan.members.includes(p.id);
    return `<button class="person-row" data-act="toggleMember" data-person="${esc(p.id)}" aria-pressed="${on}">${avatar(p, 26)}<span>${esc(p.name)}${p.id === S.meId ? ' (you)' : ''}</span>${on ? icon('check', 14) : ''}</button>`;
  }).join('')}</div>
  <form class="inline-add" data-submit="memberNewPerson"><span>${icon('plus', 14)}</span><input name="name" placeholder="Add a person" autocomplete="off" aria-label="Add a person"></form></div>`;
}
function filterPicker(fkey, plan, crossPlan) {
  const f = filterOf(fkey);
  const chip = (group, value, label) => {
    const on = f[group].includes(value);
    return `<button class="f-chip ${on ? 'on' : ''}" aria-pressed="${on}" data-act="toggleFilter" data-group="${group}" data-value="${esc(value)}" data-num="${typeof value === 'number' ? 1 : ''}">${esc(label)}</button>`;
  };
  const section = (title, chips) => `<section><h4>${title}</h4><div class="f-chips">${chips}</div></section>`;
  const people = plan ? plan.members : S.people.map((p) => p.id);
  const usedLabels = [...new Set((plan ? tasksOf(plan.id) : S.tasks).flatMap((t) => t.labels))].sort((a, b) => a - b);
  return `<div class="picker filter"><label class="field"><span>Keyword</span><input value="${esc(f.q)}" data-input="filterQ" data-key="${esc(fkey)}" placeholder="Filter by task name or notes"></label>
    <div class="picker-scroll">
    ${section('Due', DUE_GROUPS.map((g) => chip('due', g.key, g.label)).join(''))}
    ${section('Progress', PROGRESS.map((p) => chip('progress', p.v, p.label)).join(''))}
    ${section('Priority', PRIORITY.map((p) => chip('priority', p.v, p.label)).join(''))}
    ${section('Traffic light', HEALTH.map((h) => chip('health', h.v, h.label)).join('') + chip('health', 'none', 'Not set'))}
    ${section('Work type', WORK_TYPES.map((w) => chip('work', w.v, w.short)).join(''))}
    ${plan ? section('Bucket', plan.buckets.map((b) => chip('bucket', b.id, b.name)).join('')) : ''}
    ${usedLabels.length ? section('Labels', usedLabels.map((l) => chip('label', l, labelName(plan, l))).join('')) : ''}
    ${crossPlan ? '' : section('Assigned to', chip('assignee', 'none', 'Unassigned') + people.map((id) => chip('assignee', id, person(id)?.name || '')).join(''))}
    </div></div>`;
}

// ---------- Attachments ----------
function makeThumb(file) {
  return new Promise((resolve) => {
    if (!/^image\/(png|jpeg|gif|webp)$/.test(file.type)) return resolve(null);
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const w = Math.min(480, img.naturalWidth);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = Math.round((img.naturalHeight / img.naturalWidth) * w);
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.72));
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    img.src = url;
  });
}
async function attachFiles(t, files) {
  for (const file of files) {
    if (file.size > 50 * 1048576) { toast(`${file.name} is over the 50 MB limit.`, { error: true }); continue; }
    try {
      const id = uid();
      await Store.putFile(id, file);
      const thumb = await makeThumb(file);
      t.attachments.push({ id, kind: 'file', name: file.name, size: file.size, type: file.type, thumb });
    } catch (err) {
      toast(err.message || `Could not store ${file.name}.`, { error: true });
    }
  }
  commit();
}
