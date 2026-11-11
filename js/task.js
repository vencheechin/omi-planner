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
      ${tbRowHTML(t)}
      ${healthRowHTML(t)}
      <div class="assign-row">
        <div class="avatars">${t.assignees.map((a) => avatar(person(a), 28)).join('')}</div>
        <button class="add-chip" data-act="pickAssignees" data-id="${esc(t.id)}">${icon('user', 13)} ${t.assignees.length ? 'Change' : 'Assign'}</button>
      </div>
      ${workflowHTML(t)}
      <div class="task-fields">
        ${field('Priority', `<select data-change="taskField" data-field="priority">${options(PRIORITY, t.priority)}</select>`)}
        ${field(dueLocked(t) ? `Due date ${icon('lock', 11)}` : 'Due date', `<input type="date" value="${t.due || ''}" data-change="taskField" data-field="due" class="${isLate(t) ? 'late-input' : ''}" ${dueLocked(t) ? `disabled title="Set by ${esc(person(t.assignedBy)?.name || 'the assigner')}"` : ''}>`)}
        ${field('Repeat', `<select data-change="taskField" data-field="repeat">${options(REPEATS, t.repeat)}</select>`)}
      </div>
      ${remindersHTML(t)}
      ${timeboxHTML(t)}
      <section class="task-sec">
        <div class="sec-head"><h3>Checklist${t.checklist.length ? ` <small>${doneItems} / ${t.checklist.length}</small>` : ''}</h3>
          ${t.assignees.some((a) => a !== S.meId) ? `<button class="btn ghost xs ck-alert ${(t.checkAlerts || []).includes(S.meId) ? 'active' : ''}" data-act="toggleCheckAlerts" aria-pressed="${(t.checkAlerts || []).includes(S.meId)}" title="Get a notification when someone ticks an item on this task">${icon('bell', 13)} ${(t.checkAlerts || []).includes(S.meId) ? 'Notifying me when ticked' : 'Notify me when ticked'}</button>` : ''}</div>
        ${t.checklist.length > 1 ? `<label class="mini ck-group">Group <select data-change="ckGroup" aria-label="Group checklist"><option value="">None</option><option value="added" ${S.settings.ckGroup === 'added' ? 'selected' : ''}>Date added</option><option value="done" ${S.settings.ckGroup === 'done' ? 'selected' : ''}>Date completed</option></select></label>` : ''}
        <ul class="checklist ${S.settings.ckGroup && t.checklist.length > 1 ? 'grouped' : ''}">
          ${checklistRows(t, (c) => `<li class="ck-item ${c.done ? 'done' : ''}" ${S.settings.ckGroup ? '' : 'data-drag="check"'} data-id="${esc(c.id)}">
            ${S.settings.ckGroup ? '' : '<span class="grip" aria-hidden="true" title="Drag to reorder">⋮⋮</span>'}
            <button class="check small ${c.done ? 'on' : ''}" data-act="toggleCheck" data-id="${esc(c.id)}" aria-label="${c.done ? 'Uncheck' : 'Check'} item">${icon('check', 10)}</button>
            <div class="ck-main"><input value="${esc(c.text)}" data-input="checkText" data-id="${esc(c.id)}" aria-label="Checklist item">
              ${checkWhoHTML(c)}</div>
            ${canDelCheck(t, c) ? `<button class="icon-btn" data-act="delCheck" data-id="${esc(c.id)}" aria-label="Delete item">${icon('close', 13)}</button>` : '<span class="ck-x-gap"></span>'}</li>`)}
        </ul>
        <form class="inline-add" data-submit="addCheck"><span>${icon('plus', 14)}</span><input name="text" placeholder="Add an item" data-focus="check-add" autocomplete="off" aria-label="Add a checklist item"></form>
      </section>
      ${chatHTML(t)}
    </div>`;
  const chat = $('[data-chat]', d);
  const atBottom = !chat || chat.scrollHeight - chat.scrollTop - chat.clientHeight < 40;
  if (!d.firstElementChild) d.innerHTML = '<div class="panel"></div>';
  d.firstElementChild.innerHTML = panel;
  if (!d.open) d.showModal();
  const next = $('[data-chat]', d);
  if (next && (atBottom || ui.chatToBottom)) next.scrollTop = next.scrollHeight;
  ui.chatToBottom = false;
}

/** Only whoever added an item can delete it (older items without a record: the task's assigner or owner). */
const canDelCheck = (t, c) => (c.by ? c.by === S.meId : !t.assignedBy || t.assignedBy === S.meId);
/** Checklist rows, optionally grouped by the day items were added or completed (newest first). */
function checklistRows(t, row) {
  const by = t.checklist.length > 1 ? S.settings.ckGroup : '';
  if (!by) return t.checklist.map(row).join('');
  const dayOf = (ms) => (ms ? toISO(new Date(ms)) : '');
  const groups = new Map();
  const put = (k, c) => { if (!groups.has(k)) groups.set(k, []); groups.get(k).push(c); };
  t.checklist.forEach((c) => put(by === 'done' ? (c.done ? dayOf(c.doneAt) || 'earlier' : 'open') : dayOf(c.at) || 'earlier', c));
  const keys = [...groups.keys()].sort((a, b) => (a === 'open' ? -1 : b === 'open' ? 1 : a === 'earlier' ? 1 : b === 'earlier' ? -1 : b.localeCompare(a)));
  const label = (k) => (k === 'open' ? 'Not completed' : k === 'earlier' ? 'Earlier' : k === todayISO() ? 'Today' : fmtDate(k));
  return keys.map((k) => `<li class="ck-head">${esc(label(k))} <small>${groups.get(k).length}</small></li>${groups.get(k).map(row).join('')}`).join('');
}
/** Who added a checklist item, and who ticked it and when. */
function checkWhoHTML(c) {
  const name = (id) => (id === S.meId ? 'you' : person(id)?.name || 'someone');
  const bits = [];
  if (c.by) bits.push(`Added by ${esc(name(c.by))}${c.at ? `, ${esc(fmtDateTime(c.at))}` : ''}`);
  if (c.done && c.doneBy) bits.push(`<span class="ck-done">${icon('check', 10)} Ticked by ${esc(name(c.doneBy))}${c.doneAt ? `, ${esc(fmtDateTime(c.doneAt))}` : ''}</span>`);
  return bits.length ? `<small class="ck-who">${bits.join(' · ')}</small>` : '';
}

// ---------- Conversation (WhatsApp-style) ----------
const chatDay = (ms) => { const iso = toISO(new Date(ms)); return iso === todayISO() ? 'Today' : iso === addDays(todayISO(), -1) ? 'Yesterday' : parseISO(iso).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: iso.slice(0, 4) === todayISO().slice(0, 4) ? undefined : 'numeric' }); };
const chatTime = (ms) => new Date(ms).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
function fileChip(a) {
  if (a.kind === 'contact') {
    const p = { name: a.name, color: person(a.personId)?.color || PERSON_COLORS[1] };
    return `<div class="chat-contact">${avatar(p, 30)}<span><b>${esc(a.name)}</b>${a.email ? `<a href="mailto:${esc(a.email)}">${esc(a.email)}</a>` : ''}</span></div>`;
  }
  if (a.kind === 'link') {
    const url = safeUrl(a.url);
    return `<a class="chat-file link ${a.loc ? 'loc' : ''}" ${url ? `href="${esc(url)}" target="_blank" rel="noopener noreferrer"` : ''}>${icon(a.loc ? 'pin' : 'link', 14)}<span>${esc(a.name)}</span></a>`;
  }
  if (a.thumb) return `<button class="chat-img" data-act="openFile" data-id="${esc(a.id)}" title="${esc(a.name)}"><img src="${esc(a.thumb)}" alt="${esc(a.name)}"></button>`;
  return `<button class="chat-file" data-act="openFile" data-id="${esc(a.id)}">${icon('clip', 14)}<span>${esc(a.name)}</span><small>${fmtSize(a.size || 0)}</small></button>`;
}
/** The task's description, its messages (with files) and its activity, as one conversation. */
function chatHTML(t) {
  const items = [
    ...t.comments.filter((c) => !(c.deleted && !c.deletedBy) && !chatPrefs().hidden.includes(c.id)).map((c) => ({ at: c.at, c })),
    ...t.history.map((e) => ({ at: e.at, e })),
  ].sort((x, y) => x.at - y.at);
  let lastDay = '';
  let lastAuthor = null;
  const rows = items.map((it) => {
    let out = '';
    const day = chatDay(it.at);
    if (day !== lastDay) { out += `<li class="chat-day"><span>${esc(day)}</span></li>`; lastDay = day; lastAuthor = null; }
    if (it.e) {
      const e = it.e;
      lastAuthor = null;
      return `${out}<li class="chat-event"><span><b>${esc(e.by === S.meId ? 'You' : person(e.by)?.name || 'Someone')}</b> ${esc((EVENT_TEXT[e.type] || (() => e.type))(e))}${e.note ? `: “${esc(e.note)}”` : ''} · ${esc(chatTime(e.at))}</span></li>`;
    }
    const c = it.c;
    const who = person(c.author);
    const mine = c.author === S.meId;
    const showName = !mine && c.author !== lastAuthor;
    lastAuthor = c.author;
    const gone = c.deleted || isRecalled(c);
    const sel = ui.chatSelect;
    const quoted = c.replyTo && t.comments.find((x) => x.id === c.replyTo);
    const goneText = !gone ? '' : c.deleted ? `${c.deletedBy === S.meId ? 'You deleted this message' : 'This message was deleted'}` : `${c.recalled.by === c.author ? (mine ? 'You recalled this message' : 'This message was recalled') : `Recalled by ${esc(c.recalled.by === S.meId ? 'you' : person(c.recalled.by)?.name || 'an admin')}`}`;
    return `${out}<li class="msg ${mine ? 'mine' : 'theirs'} ${showName ? 'first' : ''} ${sel?.has(c.id) ? 'picked' : ''}" data-msg="${esc(c.id)}">
      ${sel && canSelect(c) && !gone ? `<input type="checkbox" class="msg-pick" data-change="msgPick" data-id="${esc(c.id)}" ${sel.has(c.id) ? 'checked' : ''} aria-label="Select message">` : ''}
      ${!mine ? (showName ? avatar(who, 28) : '<span class="avatar-gap"></span>') : ''}
      <div class="bubble ${gone ? 'gone' : ''}">
        ${showName ? `<b class="msg-name" style="--nc:${esc(who?.color || '#b5894d')}">${esc(who?.name || 'Someone')}</b>` : ''}
        ${gone ? `<p class="msg-text gone-text">${icon('recall', 12)} ${goneText}</p>` : `
        ${c.fwd ? `<small class="msg-fwd">${icon('fwd', 11)} Forwarded</small>` : ''}
        ${quoted ? `<button class="msg-quote" data-act="jumpMsg" data-id="${esc(quoted.id)}"><b>${esc(quoted.author === S.meId ? 'You' : person(quoted.author)?.name || 'Someone')}</b><span>${esc(quoted.deleted || isRecalled(quoted) ? 'Message no longer available' : (quoted.text || (quoted.files || []).map((f) => f.name).join(', ')).slice(0, 120))}</span></button>` : ''}
        ${(c.files || []).length ? `<div class="msg-files">${c.files.map(fileChip).join('')}</div>` : ''}
        ${msgTextHTML(c)}`}
        <span class="msg-time">${esc(chatTime(c.at))}</span>
        ${!gone && !sel ? `<button class="msg-more icon-btn" data-act="msgMenu" data-id="${esc(c.id)}" aria-label="Message options" title="Reply, forward, copy, delete">${icon('chevD', 13)}</button>` : ''}
      </div></li>`;
  }).join('');
  const staged = [...(ui.draft.files || []).map((f, i) => ({ i, name: f.name, kind: 'file', ic: /^image\//.test(f.type) ? 'image' : 'clip' })),
    ...(ui.draft.links || []).map((l, i) => ({ i, name: l.name, kind: 'link', ic: l.kind === 'location' ? 'pin' : 'link' })),
    ...(ui.draft.contacts || []).map((p, i) => ({ i, name: p.name, kind: 'contact', ic: 'user' }))];
  const count = t.comments.filter((c) => !c.deleted && !isRecalled(c) && !chatPrefs().hidden.includes(c.id)).length;
  const replying = ui.draft.replyTo && t.comments.find((c) => c.id === ui.draft.replyTo);
  const sel = ui.chatSelect;
  return `<section class="task-sec chat-sec">
    <div class="sec-head"><h3>Conversation</h3>${count ? `<small class="muted">${count} message${count === 1 ? '' : 's'}</small>` : ''}</div>
    <div class="chat-desc"><span>${icon('flag', 12)} Description</span><textarea rows="2" placeholder="Description" data-input="notes" data-focus="task-notes" aria-label="Description">${esc(t.notes)}</textarea></div>
    <div class="chat-scroll" data-chat>
      ${t.attachments.length ? `<div class="chat-event"><span>Files added earlier</span></div><div class="msg-files earlier">${t.attachments.map(fileChip).join('')}</div>` : ''}
      <ul class="chat">${rows || '<li class="chat-event"><span>No messages yet.</span></li>'}</ul>
    </div>
    ${sel ? `<div class="chat-selbar"><b>${sel.size} selected</b><span class="spacer"></span>
      <button class="btn ghost sm" data-act="cancelSelect">Cancel</button>
      <button class="btn ghost sm danger-text" data-act="delSelMe" ${sel.size ? '' : 'disabled'}>${icon('trash', 13)} Delete for me</button>
      ${isAdmin() ? `<button class="btn danger sm" data-act="delSelAll" ${sel.size ? '' : 'disabled'}>Delete for everyone</button>` : ''}</div>`
    : `${staged.length ? `<div class="chat-staged">${staged.map((x) => `<span class="staged">${icon(x.ic, 12)}${esc(x.name)}<button class="chip-x" data-act="unstage" data-kind="${x.kind}" data-i="${x.i}" aria-label="Remove ${esc(x.name)}">${icon('close', 10)}</button></span>`).join('')}</div>` : ''}
    ${replying ? `<div class="chat-replying">${icon('reply', 13)}<span><b>Replying to ${esc(replying.author === S.meId ? 'yourself' : person(replying.author)?.name || 'Someone')}</b><small>${esc((replying.text || (replying.files || []).map((f) => f.name).join(', ')).slice(0, 120))}</small></span><button class="icon-btn" data-act="cancelReply" aria-label="Cancel reply">${icon('close', 12)}</button></div>` : ''}
    <form class="chat-compose" data-submit="sendMessage">
      <button type="button" class="icon-btn chat-plus" data-act="chatPlus" aria-label="Attach: photos, camera, location, contact" title="Attach">${icon('plus', 20)}</button>
      <textarea name="text" rows="1" placeholder="Message" data-input="commentDraft" data-focus="comment" aria-label="Message">${esc(ui.draft.comment)}</textarea>
    </form>
    `}
  </section>`;
}
/** Sends the draft text with any staged files and links as one message. */
async function sendMessage(t) {
  const text = (ui.draft.comment || '').trim();
  const files = ui.draft.files || [];
  const links = ui.draft.links || [];
  const contacts = ui.draft.contacts || [];
  if (!text && !files.length && !links.length && !contacts.length) return;
  const stored = [];
  for (const file of files) {
    if (file.size > 50 * 1048576) { toast(`${file.name} is over the 50 MB limit.`, { error: true }); continue; }
    try {
      const id = uid();
      await Store.putFile(id, file);
      stored.push({ id, kind: 'file', name: file.name, size: file.size, type: file.type, thumb: await makeThumb(file) });
    } catch (err) { toast(err.message || `Could not store ${file.name}.`, { error: true }); }
  }
  links.forEach((l) => stored.push({ id: uid(), kind: 'link', name: l.name, url: l.url, ...(l.kind === 'location' ? { loc: true } : {}) }));
  contacts.forEach((p) => stored.push({ id: uid(), kind: 'contact', name: p.name, email: p.email || '', personId: p.id }));
  const replyTo = ui.draft.replyTo && t.comments.some((c) => c.id === ui.draft.replyTo) ? ui.draft.replyTo : null;
  t.comments.push({ id: uid(), author: S.meId, text, at: Date.now(), ...(stored.length ? { files: stored } : {}), ...(replyTo ? { replyTo } : {}) });
  ui.draft = { comment: '', files: [], links: [], contacts: [], replyTo: null };
  ui.focus = 'comment';
  ui.chatToBottom = true;
  commit();
}
function stageFiles(files) {
  ui.draft.files = [...(ui.draft.files || []), ...files];
  renderTask();
  $('[data-focus="comment"]')?.focus();
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
    <h4>${t ? 'Labels' : `Labels in ${esc(plan.name)}`}</h4>
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
    </div>`;
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
    ${section('Work type', workTypes().map((w) => chip('work', w.v, w.short)).join(''))}
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
