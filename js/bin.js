// ---------- Recycle bin ----------
// Deleted tasks, time boxes and S-Team Plan rows and items wait here and can be restored one
// at a time. The bin is kept on this device. Restoring a shared task brings it back for everyone.
const BIN_KEEP_DAYS = 60;
const BIN_MAX = 300;
const BIN_DRAG_TYPES = new Set(['task', 'block', 'bprow', 'bpitem']);

const binList = () => (S.trash = Array.isArray(S.trash) ? S.trash : []);
function binAdd(entry) {
  const cutoff = Date.now() - BIN_KEEP_DAYS * 864e5;
  S.trash = [{ id: uid(), at: Date.now(), ...entry }, ...binList().filter((e) => e.at >= cutoff)].slice(0, BIN_MAX);
}

/** Moves a whole task to the bin (a time box made of several tasks lets them go back to the list). */
function binTask(t) {
  if (ui.openTask === t.id) ui.openTask = null;
  const plan = planById(t.planId);
  binAdd({ kind: 'task', title: t.title || 'Untitled task', where: plan ? planLabel(plan) : '', data: clone(t) });
  if (isBox(t)) releaseBox(t);
  S.tasks = S.tasks.filter((x) => x.id !== t.id);
}
/** Moves one time box of a task to the bin; the task itself stays. */
function binBooking(id) {
  const [tid, sid] = String(id).split('~');
  const t = taskById(tid);
  if (!t) return false;
  if (isBox(t) && !sid) { toast('Open the box to take its tasks out.'); return false; }
  const when = sid ? sessionsOf(t).find((x) => x.id === sid) : { date: t.slotDate, start: t.slotStart };
  const label = when && when.date ? `${dayLabel(when.date)}${Number.isFinite(when.start) ? `, ${fmtTime(when.start)}` : ''}` : '';
  binAdd({ kind: 'booking', title: t.title || 'Untitled task', where: label ? `Time box · ${label}` : 'Time box', data: { tid, before: { slotDate: t.slotDate, slotStart: t.slotStart, estimate: t.estimate, tbSessions: clone(sessionsOf(t)), tbQueued: t.tbQueued, tbRank: t.tbRank } } });
  removeBooking(t, sid || null);
  return true;
}
/** Moves an S-Team Plan brand (with its items) or item row to the bin. */
function binStRow(gid, rid) {
  const p = stCurrent();
  const g = bpGroup(gid);
  const r = bpRowOf(gid, rid);
  if (!p || !g || !r) return false;
  const parent = bpParentOf(gid, rid);
  const list = parent ? parent.items : g.rows;
  const index = list.indexOf(r);
  binAdd({ kind: 'strow', title: r.brand || (parent ? 'Item' : 'Brand'), where: `${stName(p)} · ${parent ? `${parent.brand || 'Brand'} item` : g.name}`, data: { plan: p.id, gid, parent: parent ? parent.id : null, index, row: clone(r) } });
  if (parent) parent.items = parent.items.filter((x) => x !== r); else g.rows = g.rows.filter((x) => x !== r);
  return true;
}
/** Moves one task inside an S-Team Plan month to the bin. */
function binStItem(gid, rid, m, n) {
  const p = stCurrent();
  const r = bpRowOf(gid, rid);
  if (!p || !r) return false;
  const items = cellItems(r.cells[m]);
  const [item] = items.splice(Number(n), 1);
  if (!item) return false;
  const parent = bpParentOf(gid, rid);
  const rowName = parent ? `${parent.brand || 'Brand'} · ${r.brand || 'Item'}` : (r.brand || 'Brand');
  binAdd({ kind: 'stitem', title: item.text || (item.pic ? `${item.pic}'s task` : 'Month entry'), where: `${stName(p)} · ${rowName} · ${bpMonthLabel(m)}`, data: { plan: p.id, gid, rid, m, item: clone(item) } });
  if (items.length) r.cells[m] = { items }; else delete r.cells[m];
  return true;
}

/** Puts one thing back. Returns a message when it can't. */
function binRestore(id) {
  const e = binList().find((x) => x.id === id);
  if (!e) return 'It is no longer in the bin.';
  const d = e.data || {};
  if (e.kind === 'task') {
    if (!planById(d.planId)) return 'Its plan has been deleted, so it has nowhere to go back to.';
    if (taskById(d.id)) return 'It is already back.';
    // A fresh stamp on every field makes the restored task newer than the deletion everywhere.
    delete S.sync.tombstones[d.id];
    delete S.sync.shadow[d.id];
    const t = clone(d);
    t._v = {};
    S.tasks.push(t);
  } else if (e.kind === 'booking') {
    const t = taskById(d.tid);
    if (!t) return 'Its task has been deleted. Restore the task first.';
    Object.assign(t, clone(d.before));
  } else if (e.kind === 'strow' || e.kind === 'stitem') {
    const p = stPlans().find((x) => x.id === d.plan && !x.deleted);
    if (!p) return 'Its S-Team Plan has been deleted.';
    const g = p.groups.find((x) => x.id === d.gid) || p.groups[0];
    if (!g) return 'Its group has been deleted.';
    if (e.kind === 'strow') {
      const parent = d.parent ? g.rows.find((x) => x.id === d.parent) : null;
      const list = parent ? (parent.items = parent.items || []) : g.rows;
      const at = Math.max(0, Math.min(list.length, Number.isInteger(d.index) ? d.index : list.length));
      list.splice(at, 0, clone(d.row));
    } else {
      const r = g.rows.flatMap((x) => [x, ...(x.items || [])]).find((x) => x.id === d.rid);
      if (!r) return 'Its brand or item row has been deleted. Restore that first.';
      r.cells[d.m] = { items: [...cellItems(r.cells[d.m]), clone(d.item)] };
    }
    S.sync.dirty = S.sync.dirty || {};
    S.sync.dirty[`st:${p.id}`] = 1;
  }
  S.trash = binList().filter((x) => x !== e);
  return '';
}

const BIN_KIND = { task: ['Task', 'check'], booking: ['Time box', 'clock'], strow: ['S-Team row', 'table'], stitem: ['S-Team entry', 'table'] };
function binPanelHTML() {
  const list = binList();
  if (!list.length) return `<div class="bin-empty">${icon('trash', 28)}<p>The recycle bin is empty.</p><p class="small muted">Drag a task, time box or S-Team Plan row onto the bin, or delete one, and it waits here so you can restore it.</p></div>`;
  return `<p class="small muted">Newest first. Kept for ${BIN_KEEP_DAYS} days on this device.</p>
    <ul class="bin-list">${list.map((e) => `<li>
      <span class="bin-ic">${icon(BIN_KIND[e.kind]?.[1] || 'trash', 15)}</span>
      <span class="bin-txt"><b>${esc(e.title)}</b><small>${esc(BIN_KIND[e.kind]?.[0] || 'Item')}${e.where ? ` · ${esc(e.where)}` : ''} · deleted ${esc(fmtDateTime(e.at))}</small></span>
      <button class="btn sm" data-act="binRestore" data-id="${esc(e.id)}">${icon('repeat', 13)} Restore</button></li>`).join('')}</ul>
    <div class="row"><span class="spacer"></span><button class="btn ghost sm danger" data-act="binEmpty">Empty bin</button></div>`;
}
const binButtonHTML = (extra = '') => {
  const n = binList().length;
  return `<button class="side-bin ${extra}" data-act="binOpen" aria-label="Recycle bin${n ? `, ${n} item${n === 1 ? '' : 's'}` : ''}. Drop a task here to delete it." title="Recycle bin: drop a task here, or click to restore">${icon('trash', 22)}${n ? `<em>${n > 99 ? '99+' : n}</em>` : ''}</button>`;
};
function binRefresh() {
  const body = $('dialog.bin-dlg .dlg-body');
  if (body) body.innerHTML = binPanelHTML();
  // A floating copy for phones, where the menu is tucked away while you drag.
  const f = $('.side-bin.float');
  if (f) f.outerHTML = binButtonHTML('float'); else document.body.insertAdjacentHTML('beforeend', binButtonHTML('float'));
}

// ---------- Dragging onto the bin ----------
/** Called while dragging: true when the pointer is over a bin (the drag then aims at it). */
function binHover(s, x, y) {
  $$('.side-bin.over').forEach((n) => n.classList.remove('over'));
  if (!BIN_DRAG_TYPES.has(s.type)) return false;
  const bin = document.elementsFromPoint(x, y).find((n) => n.classList?.contains('side-bin'));
  if (!bin) return false;
  bin.classList.add('over');
  s.tbph?.remove();
  s.ph?.remove?.();
  $$('.bp-drop-before, .bp-drop-after').forEach((n) => n.classList.remove('bp-drop-before', 'bp-drop-after'));
  s.target = { toBin: true };
  return true;
}
/** Called when a drag ends on a bin. */
async function binDrop(s) {
  $$('.side-bin.over').forEach((n) => n.classList.remove('over'));
  $$('.bp-drop-before, .bp-drop-after').forEach((n) => n.classList.remove('bp-drop-before', 'bp-drop-after'));
  const id = String(s.id);
  let title = '';
  let run = null;
  if (s.type === 'task') {
    const t = taskById(id.split('~')[0]);
    if (!t) { render(); return; }
    title = `Delete “${t.title || 'Untitled task'}”?`;
    run = () => { binTask(t); return true; };
  } else if (s.type === 'block') {
    const t = taskById(id.split('~')[0]);
    if (!t) { render(); return; }
    title = `Remove this time box for “${t.title || 'Untitled task'}”?`;
    run = () => binBooking(id);
  } else if (s.type === 'bprow') {
    const [g, r] = id.split('|');
    const row = bpRowOf(g, r);
    if (!row) { render(); return; }
    const n = row.items?.length || 0;
    title = `Delete ${row.brand || (bpParentOf(g, r) ? 'this item' : 'this brand')}${n ? ` and its ${n} item${n === 1 ? '' : 's'}` : ''}?`;
    run = () => binStRow(g, r);
  } else if (s.type === 'bpitem') {
    const [g, r, m, n] = id.split('|');
    const it = cellItems(bpRowOf(g, r)?.cells[m])[Number(n)];
    if (!it) { render(); return; }
    title = `Delete “${it.text || 'this entry'}” from ${bpMonthLabel(m)}?`;
    run = () => binStItem(g, r, m, n);
  }
  if (!run || !await confirmDlg(title, 'It goes to the recycle bin. Click the bin to restore it.', 'Delete')) { render(); return; }
  if (run()) { commit(); toast('Moved to the recycle bin.', { action: { label: 'Open bin', run: () => actions.binOpen() } }); } else render();
}

Object.assign(actions, {
  binOpen: () => {
    closePop();
    ui.navOpen = false;
    document.body.classList.remove('nav-open');
    const d = showDialog({ title: 'Recycle bin', html: binPanelHTML(), wide: true });
    d?.classList?.add('bin-dlg');
  },
  binRestore: (el) => {
    const e = binList().find((x) => x.id === el.dataset.id);
    const err = binRestore(el.dataset.id);
    if (err) { toast(err); return; }
    commit();
    binRefresh();
    toast(`Restored “${e?.title || 'it'}”.`);
  },
  binEmpty: async () => {
    const n = binList().length;
    if (!await confirmDlg(`Empty the recycle bin?`, `${n} item${n === 1 ? '' : 's'} will be gone for good. This can't be undone.`, 'Empty bin')) return;
    S.trash = [];
    commit();
    binRefresh();
  },
});

