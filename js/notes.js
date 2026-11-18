'use strict';
// ---------- Discussion Notes ----------
// Notes like Apple Notes, but each one is for a conversation with someone: the points you want to
// discuss. Tick a point once it's discussed, then turn it into a task: you can give it to them
// (it shows under Delegate To), or they can take it on themselves from the same note. A note is
// shared with the person it's with (they see it in their own Discussion Notes).
// Stored with the calendar in the team-wide record "meetings", one field per note (dn:<id>).

if (!ICON.note) ICON.note = 'M6 3h9l4 4v14H6zM15 3v4h4M9 11h7M9 15h7M9 19h4';
function dnNorm(n) {
  if (!n || typeof n !== 'object' || typeof n.id !== 'string') return null;
  return {
    id: n.id.slice(0, 40), owner: String(n.owner || '').slice(0, 120), with: String(n.with || '').slice(0, 120),
    title: String(n.title || '').slice(0, 200), body: String(n.body || '').slice(0, 8000),
    items: (Array.isArray(n.items) ? n.items : []).filter((i) => i && typeof i.id === 'string').slice(0, 200).map((i) => ({
      id: i.id.slice(0, 40), text: String(i.text || '').slice(0, 500), done: !!i.done, task: typeof i.task === 'string' ? i.task.slice(0, 40) : '', by: String(i.by || '').slice(0, 120),
    })),
    at: Number(n.at) || Date.now(), deleted: !!n.deleted,
  };
}
const dnAll = () => { const p = mcPlan(true); return (p.notes = Array.isArray(p.notes) ? p.notes : []); };
const dnMine = (n) => !n.deleted && (n.owner === pkey(S.meId) || n.with === pkey(S.meId));
const dnOther = (n) => (n.owner === pkey(S.meId) ? n.with : n.owner);
const dnList = () => dnAll().filter(dnMine).sort((a, b) => b.at - a.at);
const dnById = (id) => dnAll().find((n) => n.id === id && !n.deleted);
const dnDirty = () => { if (typeof mcDirty === 'function') mcDirty(); };
const dnSave = (n) => { n.at = Date.now(); dnDirty(); Store.save(); };
const dnName = (k) => personByKey(k)?.name || 'Someone';

// ---------- Page ----------
function renderNotes() {
  const list = dnList();
  const q = (ui.dnQ || '').trim().toLowerCase();
  const shown = q ? list.filter((n) => `${n.title} ${n.body} ${dnName(dnOther(n))} ${n.items.map((i) => i.text).join(' ')}`.toLowerCase().includes(q)) : list;
  const cur = dnById(ui.dnOpen) || null;
  const byPerson = [...new Set(shown.map(dnOther))].map((k) => ({ k, notes: shown.filter((n) => dnOther(n) === k) }));
  const open = (n) => n.items.filter((i) => !i.done).length;
  return `<div class="page dn-page ${cur ? 'dn-has' : ''}">
    <header class="page-head"><h1>Discussion Notes</h1><span class="spacer"></span><button class="btn primary sm" data-act="dnNew">${icon('plus', 14)} New note</button></header>
    <div class="dn-wrap">
      <aside class="dn-side">
        <input class="dn-search" placeholder="Search notes" value="${esc(ui.dnQ || '')}" data-input-dn="q" aria-label="Search notes">
        ${byPerson.map(({ k, notes }) => `<div class="dn-group"><h3>${personByKey(k) ? avatar(personByKey(k), 18) : ''} ${esc(dnName(k))}</h3>
          ${notes.map((n) => `<button class="dn-item ${cur?.id === n.id ? 'on' : ''}" data-act="dnOpen" data-id="${esc(n.id)}"><b>${esc(n.title || 'Untitled')}</b>
            <small>${esc(fmtDateTime(n.at))}${open(n) ? ` · ${open(n)} to discuss` : n.items.length ? ' · all discussed' : ''}${n.owner !== pkey(S.meId) ? ` · from ${esc(dnName(n.owner))}` : ''}</small></button>`).join('')}</div>`).join('')
          || `<p class="muted small dn-empty">${q ? 'No notes match.' : 'No notes yet. Write down what you want to discuss with someone.'}</p>`}
      </aside>
      <section class="dn-main">${cur ? dnEditorHTML(cur) : '<div class="dn-blank muted">Pick a note, or start a <b>New note</b>.</div>'}</section>
    </div>
  </div>`;
}
function dnEditorHTML(n) {
  const mineOwn = n.owner === pkey(S.meId);
  const other = dnOther(n);
  const who = personByKey(other);
  const items = n.items;
  return `<div class="dn-editor" data-dn="${esc(n.id)}">
    <div class="dn-top"><button class="icon-btn dn-back" data-act="dnClose" aria-label="Back to notes">${icon('chevL')}</button>
      <label class="dn-with">With ${mineOwn ? `<select data-change="dnWith" aria-label="Who this discussion is with"><option value="">Choose a person…</option>${S.people.filter((p) => pkey(p.id) !== pkey(S.meId)).map((p) => `<option value="${esc(pkey(p.id))}" ${pkey(p.id) === n.with ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select>` : `<b>${esc(dnName(n.owner))}</b>`}</label>
      <span class="spacer"></span><small class="muted">${esc(fmtDateTime(n.at))}</small>
      ${mineOwn ? `<button class="icon-btn" data-act="dnDelete" aria-label="Delete note" title="Delete note">${icon('trash', 15)}</button>` : ''}</div>
    <input class="dn-title" value="${esc(n.title)}" placeholder="Title, e.g. Weekly catch-up" data-change="dnTitle" aria-label="Title">
    <h4 class="dn-h">To discuss <small class="muted">${items.filter((i) => !i.done).length} open</small></h4>
    <ul class="dn-items">${items.map((i) => {
      const t = i.task ? taskById(i.task) : null;
      return `<li class="${i.done ? 'done' : ''}" data-id="${esc(i.id)}">
        <button class="check small ${i.done ? 'on' : ''}" data-act="dnTick" data-id="${esc(i.id)}" aria-label="${i.done ? 'Mark not discussed' : 'Mark discussed'}" title="${i.done ? 'Discussed' : 'Mark discussed'}">${icon('check', 10)}</button>
        <input value="${esc(i.text)}" data-change="dnItem" data-id="${esc(i.id)}" placeholder="Point to discuss" aria-label="Point to discuss">
        ${t ? `<button class="dn-task linklike" data-open-task="${esc(t.id)}" title="Open the task">${icon('check', 11)} Task${t.assignees.length ? ` · ${esc(t.assignees.map((a) => person(a)?.name || '').filter(Boolean).join(', '))}` : ''}</button>`
          : `<span class="dn-mk">${mineOwn ? `<button class="btn ghost xs" data-act="dnTask" data-id="${esc(i.id)}" data-for="them" ${who ? '' : 'disabled title="Choose who the note is with first"'}>${icon('user', 11)} Task for ${esc(who ? who.name.split(/\s+/)[0] : 'them')}</button>` : ''}<button class="btn ghost xs" data-act="dnTask" data-id="${esc(i.id)}" data-for="me">${icon('plus', 11)} Task for me</button></span>`}
        <button class="icon-btn" data-act="dnItemDel" data-id="${esc(i.id)}" aria-label="Remove point">${icon('close', 12)}</button></li>`;
    }).join('')}</ul>
    <form class="inline-add dn-add" data-submit="dnAdd"><span>${icon('plus', 14)}</span><input name="text" placeholder="Add a point to discuss" autocomplete="off" data-focus="dn-add"></form>
    <h4 class="dn-h">Notes</h4>
    <textarea class="dn-body" rows="8" placeholder="What was said, decisions, follow-ups…" data-change="dnBody" aria-label="Notes">${esc(n.body)}</textarea>
  </div>`;
}

// ---------- Actions ----------
const dnCur = () => dnById(ui.dnOpen);
Object.assign(actions, {
  dnNew: () => {
    const n = dnNorm({ id: uid(), owner: pkey(S.meId), with: '', title: '', items: [], body: '', at: Date.now() });
    dnAll().push(n);
    dnSave(n);
    ui.dnOpen = n.id;
    render();
    setTimeout(() => $('.dn-with select')?.focus(), 30);
  },
  dnOpen: (el) => { ui.dnOpen = el.dataset.id; render(); },
  dnClose: () => { ui.dnOpen = null; render(); },
  dnDelete: async () => {
    const n = dnCur();
    if (!n || !await confirmDlg(`Delete “${n.title || 'this note'}”?`, 'It goes for both of you. Tasks made from it stay.', 'Delete')) return;
    n.deleted = true;
    dnSave(n);
    ui.dnOpen = null;
    render();
    toast('Note deleted.', { undo: () => { n.deleted = false; dnSave(n); ui.dnOpen = n.id; render(); } });
  },
  dnTick: (el) => { const n = dnCur(); const i = n?.items.find((x) => x.id === el.dataset.id); if (!i) return; i.done = !i.done; dnSave(n); render(); },
  dnItemDel: (el) => { const n = dnCur(); if (!n) return; n.items = n.items.filter((x) => x.id !== el.dataset.id); dnSave(n); render(); },
  /** Turns a point into a task: for the other person (Delegate To) or for yourself. */
  dnTask: (el) => {
    const n = dnCur();
    const i = n?.items.find((x) => x.id === el.dataset.id);
    if (!i || i.task) return;
    const plan = personalPlan();
    if (!plan) { toast('Create a plan first.', { error: true }); return; }
    const forThem = el.dataset.for === 'them';
    const themId = personByKey(dnOther(n))?.id;
    if (forThem && (!themId || !canDelegateTo(themId))) { toast(themId ? `${dnName(dnOther(n))} doesn’t report to you. Admin sets who reports to whom.` : 'Choose who the note is with first.', { error: true }); return; }
    const t = addTask({ planId: plan.id, bucketId: plan.buckets[0].id, title: i.text || n.title || 'From discussion', assignees: [forThem ? themId : S.meId] });
    // Taken on from someone else's note: it's theirs to check, so it shows in their Delegate To.
    if (!forThem && n.owner !== pkey(S.meId)) { const owner = personByKey(n.owner); if (owner) { t.assignedBy = owner.id; t.assignedAt = Date.now(); t.shared = true; } }
    i.task = t.id;
    i.by = pkey(S.meId);
    i.done = true;
    dnSave(n);
    commit();
    toast(forThem ? `Task given to ${dnName(dnOther(n))}. It’s under Delegate To.` : n.owner !== pkey(S.meId) ? `Task added to your planner. ${dnName(n.owner)} sees it under Delegate To.` : 'Task added to your planner.', { keep: true });
  },
});
Object.assign(changes, {
  dnWith: (el) => { const n = dnCur(); if (!n) return; n.with = el.value; dnSave(n); render(); },
  dnTitle: (el) => { const n = dnCur(); if (!n) return; n.title = el.value.trim(); dnSave(n); render(); },
  dnBody: (el) => { const n = dnCur(); if (!n) return; n.body = el.value; dnSave(n); },
  dnItem: (el) => { const n = dnCur(); const i = n?.items.find((x) => x.id === el.dataset.id); if (!i) return; i.text = el.value.trim(); dnSave(n); },
});
Object.assign(submits, {
  dnAdd: (form, data) => {
    const n = dnCur();
    const text = String(data.get('text') || '').trim();
    if (!n || !text) return;
    n.items.push({ id: uid(), text, done: false, task: '', by: pkey(S.meId) });
    dnSave(n);
    ui.focus = 'dn-add';
    render();
  },
});
document.addEventListener('input', (e) => {
  if (e.target.matches?.('[data-input-dn="q"]')) {
    ui.dnQ = e.target.value;
    const pos = e.target.selectionStart;
    render();
    const s = $('.dn-search');
    if (s) { s.focus(); s.setSelectionRange(pos, pos); }
  }
});
