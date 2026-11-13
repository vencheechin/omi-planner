/* Undo and Redo for everything you change, with no limit (for as long as Planner stays open).
   Each saved change keeps the state before it. Sync status and notifications are left alone, and
   background bookkeeping (when a plan was last opened, sync timestamps) never counts as a step. */

const History = { prev: null, prevKey: null, undo: [], redo: [], busy: false };
/** Your data, without sync bookkeeping and notifications (those aren't yours to undo). */
const historySnap = () => JSON.stringify({ ...S, sync: undefined, inbox: undefined, msgLog: undefined, usage: undefined });
/** The same, minus things that change on their own: used to tell whether you changed anything. */
const HISTORY_NOISE = new Set(['_v', 'lastOpened', 'tbQueuedAt', 'remFired', 'lastBackup']);
const historyKey = () => JSON.stringify({ ...S, sync: undefined, inbox: undefined, msgLog: undefined, usage: undefined }, (k, v) => (HISTORY_NOISE.has(k) ? undefined : v));
const historyMark = () => { History.prev = historySnap(); History.prevKey = historyKey(); };
function historyRestore(state) {
  const keep = { sync: S.sync, inbox: S.inbox, msgLog: S.msgLog, usage: S.usage };
  S = { ...JSON.parse(state), ...keep };
  History.busy = true;
  try { origCommit(); } finally { History.busy = false; }
  historyMark();
  if (ui.openTask && !taskById(ui.openTask)) { ui.openTask = null; renderTask(); } else if (ui.openTask) renderTask();
  refreshSettings();
  updateHistoryButtons();
}
function doUndo() {
  // Something typed but not saved as a step yet: undo that first.
  if (History.prev && historyKey() !== History.prevKey) { History.redo.push(historySnap()); historyRestore(History.prev); toast('Undone.'); return; }
  if (!History.undo.length) { toast('Nothing to undo.'); return; }
  History.redo.push(historySnap());
  historyRestore(History.undo.pop());
  toast('Undone.');
}
function doRedo() {
  if (!History.redo.length) { toast('Nothing to redo.'); return; }
  History.undo.push(historySnap());
  historyRestore(History.redo.pop());
  toast('Redone.');
}
function updateHistoryButtons() {
  const u = $('#undoBtn'); const r = $('#redoBtn');
  if (u) u.disabled = !History.undo.length && !(History.prev && historyKey() !== History.prevKey);
  if (r) r.disabled = !History.redo.length;
}

// Every saved change you make becomes a step you can undo.
const origCommit = commit;
// eslint-disable-next-line no-global-assign
commit = function commitWithHistory() {
  const changed = !History.busy && History.prev !== null && historyKey() !== History.prevKey;
  if (changed) { History.undo.push(History.prev); History.redo = []; }
  origCommit();
  // Saving adds sync timestamps, so the step is remembered as it is after saving.
  if (!History.busy) historyMark();
  updateHistoryButtons();
};

Object.assign(actions, { undo: () => doUndo(), redo: () => doRedo() });
// ⌘Z / Ctrl+Z to undo, ⇧⌘Z / Ctrl+Y to redo (not while typing in a field, where the browser's own undo applies).
document.addEventListener('keydown', (e) => {
  if (!(e.metaKey || e.ctrlKey) || e.target.closest?.('input, textarea, select, [contenteditable]')) return;
  const k = e.key.toLowerCase();
  if (k === 'z' && !e.shiftKey) { e.preventDefault(); doUndo(); } else if ((k === 'z' && e.shiftKey) || k === 'y') { e.preventDefault(); doRedo(); }
});

// The starting point, once your data has loaded.
(function waitForData() {
  if (typeof S !== 'undefined' && S && Array.isArray(S.tasks) && $('#topbar')?.children.length) {
    historyMark();
    const bell = $('#topbar .bell');
    if (bell && !$('#undoBtn')) {
      bell.insertAdjacentHTML('beforebegin', `<button id="undoBtn" class="icon-btn hist-btn" data-act="undo" aria-label="Undo" title="Undo (⌘Z)" disabled>${icon('undo', 19)}</button><button id="redoBtn" class="icon-btn hist-btn" data-act="redo" aria-label="Redo" title="Redo (⇧⌘Z)" disabled>${icon('redo', 19)}</button>`);
    }
    return;
  }
  setTimeout(waitForData, 200);
}());

// ---------- Ask before deleting anything ----------
/** Buttons that remove something: confirm first. */
const CONFIRM_ACTS = {
  fitLogDel: 'Remove this entry?', fitTypeDel: 'Remove this kind of break?', removeFromTimebox: 'Remove from the Time Box?',
  tbDelEstimate: 'Remove this duration?', tbDelBlock: 'Delete this block?', tbClearUnfinished: 'Clear all Not finished?',
  tbDelSession: 'Remove this time box?', remDel: 'Delete this reminder?', stDeptDelMember: 'Remove from the department?',
  stViewerDel: 'Remove their access?', stAdminDel: 'Remove this admin?', bpCellClear: 'Clear this month?', removeLabel: 'Remove this label?',
};
async function confirmDelete(title, what = 'You can still use Undo at the top if you change your mind.') {
  return confirmDlg(title, what, title.replace(/\?$/, '').replace(/^(Remove|Delete|Clear)\b.*/, '$1'));
}
window.addEventListener('click', async (e) => {
  const el = e.target.closest?.('[data-act]');
  const title = el && CONFIRM_ACTS[el.dataset.act];
  if (!title || el.dataset.confirmed) return;
  e.preventDefault();
  e.stopImmediatePropagation();
  if (!await confirmDelete(title)) return;
  el.dataset.confirmed = '1';
  try { actions[el.dataset.act](el, e); } finally { delete el.dataset.confirmed; }
}, true);
// Menu items marked as dangerous (Delete, Remove…): confirm first, unless they already ask.
{
  const pick = actions.menuPick;
  actions.menuPick = async (el) => {
    const it = ui.menuItems[+el.dataset.i];
    if (it && it.danger && !it.selfConfirm && !/…$/.test(it.label)) {
      closePop();
      if (!await confirmDelete(`${it.label}?`)) return;
      Usage.track(`menu:${it.label}`);
      it.run();
      return;
    }
    pick(el);
  };
}
