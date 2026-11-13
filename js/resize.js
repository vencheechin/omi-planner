/* Drag a column edge to make it wider or narrower: the side menu, and Time Box Allocation.
   Widths are remembered on this device. Double-click an edge to put it back. */

const COL_LIMITS = { side: [180, 420, 232], tbside: [220, 560, 270] };
function applyColWidths() {
  const w = S?.settings?.colW || {};
  const root = document.documentElement.style;
  if (w.side) root.setProperty('--side-w', `${w.side}px`); else root.removeProperty('--side-w');
  if (w.tbside) root.setProperty('--tb-side-w', `${w.tbside}px`); else root.removeProperty('--tb-side-w');
}
let colDrag = null;
document.addEventListener('pointerdown', (e) => {
  const h = e.target.closest?.('[data-resize]');
  if (!h || e.button !== 0) return;
  e.preventDefault();
  e.stopPropagation();
  const kind = h.dataset.resize;
  const col = kind === 'side' ? $('#sidebar') : $('.tb-side');
  if (!col) return;
  colDrag = { kind, startX: e.clientX, startW: col.getBoundingClientRect().width, h };
  h.classList.add('active');
  document.body.classList.add('col-resizing');
  h.setPointerCapture?.(e.pointerId);
}, true);
document.addEventListener('pointermove', (e) => {
  if (!colDrag) return;
  const [min, max] = COL_LIMITS[colDrag.kind];
  // The side menu grows to the right; Time Box Allocation grows to the left.
  const dx = e.clientX - colDrag.startX;
  const w = Math.round(Math.min(max, Math.max(min, colDrag.startW + (colDrag.kind === 'side' ? dx : -dx))));
  document.documentElement.style.setProperty(colDrag.kind === 'side' ? '--side-w' : '--tb-side-w', `${w}px`);
  colDrag.w = w;
});
document.addEventListener('pointerup', () => {
  if (!colDrag) return;
  colDrag.h.classList.remove('active');
  document.body.classList.remove('col-resizing');
  if (colDrag.w) { S.settings.colW = { ...(S.settings.colW || {}), [colDrag.kind]: colDrag.w }; Store.save(); }
  colDrag = null;
});
document.addEventListener('dblclick', (e) => {
  const h = e.target.closest?.('[data-resize]');
  if (!h) return;
  const w = { ...(S.settings.colW || {}) };
  delete w[h.dataset.resize];
  S.settings.colW = w;
  Store.save();
  applyColWidths();
});
// Keep a handle on the side menu's edge (the menu redraws often, so check after each draw).
const origRenderSidebar = renderSidebar;
// eslint-disable-next-line no-global-assign
renderSidebar = function renderSidebarWithHandle() {
  origRenderSidebar();
  const sb = $('#sidebar');
  if (sb && !$('.col-resizer[data-resize="side"]', sb)) sb.insertAdjacentHTML('beforeend', '<div class="col-resizer side" data-resize="side" role="separator" aria-orientation="vertical" aria-label="Drag to resize the menu" title="Drag to resize · double-click to reset"></div>');
};
(function waitForSettings() { if (typeof S !== 'undefined' && S?.settings) { applyColWidths(); return; } setTimeout(waitForSettings, 200); }());

// ---------- Left menu: drag the main links into your own order ----------
let navDrag = null;
document.addEventListener('pointerdown', (e) => {
  const it = e.target.closest?.('.nav-main [data-navkey]');
  if (!it || e.button !== 0) return;
  navDrag = { it, y: e.clientY, active: false, touch: e.pointerType !== 'mouse' };
  if (navDrag.touch) navDrag.hold = setTimeout(() => { if (navDrag) startNavDrag(); }, 300);
});
function startNavDrag() {
  navDrag.active = true;
  navDrag.it.classList.add('nav-dragging');
  document.body.classList.add('col-resizing');
  navigator.vibrate?.(10);
}
document.addEventListener('pointermove', (e) => {
  if (!navDrag) return;
  if (!navDrag.active) {
    if (Math.abs(e.clientY - navDrag.y) < 6) return;
    if (navDrag.touch) { clearTimeout(navDrag.hold); navDrag = null; return; } // a scroll, not a drag
    startNavDrag();
  }
  e.preventDefault();
  const box = navDrag.it.parentElement;
  const others = [...box.querySelectorAll('[data-navkey]')].filter((x) => x !== navDrag.it);
  const before = others.find((x) => { const r = x.getBoundingClientRect(); return e.clientY < r.top + r.height / 2; });
  box.insertBefore(navDrag.it, before || null);
}, { passive: false });
document.addEventListener('pointerup', () => {
  if (!navDrag) return;
  clearTimeout(navDrag.hold);
  const was = navDrag;
  navDrag = null;
  if (!was.active) return;
  was.it.classList.remove('nav-dragging');
  document.body.classList.remove('col-resizing');
  S.settings.navOrder = [...was.it.parentElement.querySelectorAll('[data-navkey]')].map((x) => x.dataset.navkey);
  Store.save();
  // The link you dropped shouldn't also open.
  const stop = (ev) => { ev.preventDefault(); ev.stopPropagation(); };
  document.addEventListener('click', stop, { capture: true, once: true });
  setTimeout(() => document.removeEventListener('click', stop, { capture: true }), 50);
  renderSidebar();
});
