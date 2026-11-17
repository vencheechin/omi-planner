'use strict';
// ---------- Phone bottom bar: choose your own buttons ----------
// Like the iPhone dock: in the menu, hold an item and drag it down onto the bottom bar to add it
// (drop it on a tab to swap when the bar is full). Hold a tab in the bar to drag it left or right,
// or drag it up off the bar to take it out. Settings is at the top right, so the bar is all yours.
// Saved per device in S.settings.dock (a list of menu keys).

const DOCK_MAX = 5;
const DOCK_DEFAULT = ['halfplan', 'timebox', 'hub'];
const DOCK_ITEMS = {
  halfplan: { label: 'S-Team', ic: 'table' },
  pdplan: { label: 'PD Plan', ic: 'flag' },
  hub: { label: 'Planner', ic: 'home', on: ['hub', 'plan', 'person', 'req', 'from', 'history'], n: () => dueSoonCount() },
  yearly: { label: 'Yearly', ic: 'cal' },
  meet: { label: 'Schedule', ic: 'meet' },
  progress: { label: 'Progress', ic: 'pulse' },
  notes: { label: 'Notes', ic: 'note' },
  lease: { label: 'Leases', ic: 'lease' },
  timebox: { label: 'Time Box', ic: 'clock', n: () => timeboxQueue().length },
  report: { label: 'Assignments', ic: 'chart', n: () => S.tasks.filter(isReviewer).length },
  fitness: { label: 'Fitness', ic: 'pulse' },
  growth: { label: 'Growth', ic: 'book' },
  admin: { label: 'Admin', ic: 'shield' },
};
/** Your bottom-bar buttons, leaving out any you can't open on this device (e.g. a page you lost access to). */
const dockKeys = () => {
  const avail = new Set($$('#sidebar .nav-main [data-navkey]').map((a) => a.dataset.navkey));
  const list = Array.isArray(S.settings.dock) ? S.settings.dock : DOCK_DEFAULT;
  return list.filter((k) => DOCK_ITEMS[k] && (!avail.size || avail.has(k))).slice(0, DOCK_MAX);
};
function dockSave(list) {
  S.settings.dock = [...new Set(list)].filter((k) => DOCK_ITEMS[k]).slice(0, DOCK_MAX);
  Store.save();
  renderTabbar();
}

// eslint-disable-next-line no-global-assign
renderTabbar = function renderDock() {
  const bar = $('#tabbar');
  if (!bar) return;
  const r = ui.route.view;
  bar.innerHTML = dockKeys().map((k) => {
    const it = DOCK_ITEMS[k];
    const n = it.n ? it.n() : 0;
    return `<a class="tab ${(it.on || [k]).includes(r) ? 'on' : ''}" href="#/${k}" data-dock="${k}" draggable="false">${icon(it.ic, 22)}<span>${esc(it.label)}</span>${n ? `<em>${n}</em>` : ''}</a>`;
  }).join('');
};

// ---------- Dragging from the menu onto the bar (called by the menu's drag in resize.js) ----------
/** While a menu item is dragged on a phone: shows where it would land in the bar. Returns true when over the bar. */
function dockHover(key, x, y) {
  const bar = $('#tabbar');
  dockHoverClear();
  if (!bar || innerWidth > 760 || !DOCK_ITEMS[key]) return false;
  const br = bar.getBoundingClientRect();
  if (y < br.top - 24) return false;
  document.body.classList.add('dock-target');
  const list = dockKeys();
  const tabs = $$('[data-dock]', bar);
  const already = list.includes(key);
  if (list.length >= DOCK_MAX && !already) {
    // Full: the tab under your finger gets swapped.
    const t = tabs.find((el) => { const r = el.getBoundingClientRect(); return x >= r.left && x <= r.right; }) || tabs[tabs.length - 1];
    if (t) { t.classList.add('dock-swap'); ui.dockDrop = { key, replace: t.dataset.dock }; }
    return true;
  }
  const others = tabs.filter((el) => el.dataset.dock !== key);
  const before = others.find((el) => { const r = el.getBoundingClientRect(); return x < r.left + r.width / 2; });
  const ph = document.createElement('span');
  ph.className = 'tab dock-ph';
  ph.innerHTML = `${icon(DOCK_ITEMS[key].ic, 22)}<span>${esc(DOCK_ITEMS[key].label)}</span>`;
  bar.insertBefore(ph, before || null);
  if (already) $(`[data-dock="${key}"]`, bar)?.classList.add('dock-hidden');
  ui.dockDrop = { key, before: before?.dataset.dock || null };
  return true;
}
function dockHoverClear() {
  document.body.classList.remove('dock-target');
  $$('#tabbar .dock-ph').forEach((x) => x.remove());
  $$('#tabbar .dock-swap, #tabbar .dock-hidden').forEach((x) => x.classList.remove('dock-swap', 'dock-hidden'));
  ui.dockDrop = null;
}
/** Drops the dragged menu item into the bar where dockHover showed. Returns true if it went in. */
function dockDrop() {
  const d = ui.dockDrop;
  dockHoverClear();
  if (!d) return false;
  let list = dockKeys().filter((k) => k !== d.key);
  if (d.replace) list = dockKeys().map((k) => (k === d.replace ? d.key : k));
  else { const i = d.before ? list.indexOf(d.before) : -1; list.splice(i < 0 ? list.length : i, 0, d.key); }
  dockSave(list);
  navigator.vibrate?.(10);
  // Close the menu so you see the bar you just changed.
  ui.navOpen = false;
  renderSidebar();
  return true;
}

// ---------- Rearranging or removing tabs in the bar itself ----------
let dockDrag = null;
document.addEventListener('pointerdown', (e) => {
  const t = e.target.closest?.('#tabbar [data-dock]');
  if (!t || e.button !== 0 || innerWidth > 760) return;
  dockDrag = { t, key: t.dataset.dock, x: e.clientX, y: e.clientY, active: false, touch: e.pointerType !== 'mouse' };
  dockDrag.hold = setTimeout(() => { if (dockDrag) dockStart(); }, dockDrag.touch ? 350 : 500);
});
function dockStart() {
  const d = dockDrag;
  d.active = true;
  const r = d.t.getBoundingClientRect();
  d.offX = d.x - r.left; d.offY = d.y - r.top;
  const g = d.t.cloneNode(true);
  g.className = 'tab dock-ghost';
  Object.assign(g.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
  document.body.append(g);
  d.ghost = g;
  d.t.classList.add('dock-ph');
  document.body.classList.add('dock-target');
  navigator.vibrate?.(10);
}
document.addEventListener('touchmove', (e) => { if (dockDrag?.active) e.preventDefault(); }, { passive: false });
document.addEventListener('pointermove', (e) => {
  const d = dockDrag;
  if (!d) return;
  if (!d.active) {
    if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 8) { clearTimeout(d.hold); dockDrag = null; }
    return;
  }
  e.preventDefault();
  d.ghost.style.left = `${e.clientX - d.offX}px`;
  d.ghost.style.top = `${e.clientY - d.offY}px`;
  const bar = $('#tabbar');
  const br = bar.getBoundingClientRect();
  d.out = e.clientY < br.top - 40;
  d.ghost.classList.toggle('dock-out', d.out);
  d.t.style.display = d.out ? 'none' : '';
  if (d.out) return;
  const others = $$('[data-dock]', bar).filter((x) => x !== d.t);
  const before = others.find((x) => { const r = x.getBoundingClientRect(); return e.clientX < r.left + r.width / 2; });
  const ref = before || null;
  if (d.t.nextElementSibling !== ref) bar.insertBefore(d.t, ref);
}, { passive: false });
function dockEnd() {
  const d = dockDrag;
  if (!d) return;
  clearTimeout(d.hold);
  dockDrag = null;
  if (!d.active) return;
  d.ghost.remove();
  document.body.classList.remove('dock-target');
  const order = $$('#tabbar [data-dock]').map((x) => x.dataset.dock);
  dockSave(d.out ? order.filter((k) => k !== d.key) : order);
  // The tab you dragged shouldn't also open.
  const stop = (ev) => { ev.preventDefault(); ev.stopPropagation(); };
  document.addEventListener('click', stop, { capture: true, once: true });
  setTimeout(() => document.removeEventListener('click', stop, { capture: true }), 60);
}
document.addEventListener('pointerup', dockEnd);
document.addEventListener('pointercancel', dockEnd);
document.addEventListener('contextmenu', (e) => { if (e.target.closest?.('#tabbar, #sidebar .nav-main') && innerWidth <= 760) e.preventDefault(); });
