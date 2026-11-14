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
// The whole item lifts off and follows the pointer; a gap shows where it will land.
let navDrag = null;
document.addEventListener('pointerdown', (e) => {
  // A main link, or a whole section below them (picked up by its heading).
  const link = e.target.closest?.('.nav-main [data-navkey]');
  const head = !link && e.target.closest?.('.nav-secs [data-seckey] > h3');
  const it = link || (head && head.parentElement);
  if (!it || e.button !== 0) return;
  navDrag = { it, kind: link ? 'navkey' : 'seckey', x: e.clientX, y: e.clientY, active: false, touch: e.pointerType !== 'mouse' };
  if (navDrag.touch) navDrag.hold = setTimeout(() => { if (navDrag) startNavDrag(navDrag.y); }, 280);
});
function startNavDrag(y) {
  const d = navDrag;
  d.active = true;
  const r = d.it.getBoundingClientRect();
  d.offY = y - r.top;
  const ghost = d.it.cloneNode(true);
  ghost.classList.add('nav-ghost');
  ghost.removeAttribute('href');
  Object.assign(ghost.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
  document.body.append(ghost);
  d.ghost = ghost;
  d.it.classList.add('nav-placeholder');
  document.body.classList.add('col-resizing');
  navigator.vibrate?.(10);
}
// The browser's own link dragging would cancel ours halfway (and show a plain link ghost instead).
document.addEventListener('dragstart', (e) => { if (e.target.closest?.('.nav-main [data-navkey], .nav-secs [data-seckey]')) e.preventDefault(); }, true);
// While dragging on a phone, the menu shouldn't scroll under your finger.
document.addEventListener('touchmove', (e) => { if (navDrag?.active) e.preventDefault(); }, { passive: false });
document.addEventListener('pointermove', (e) => {
  const d = navDrag;
  if (!d) return;
  if (!d.active) {
    if (Math.hypot(e.clientX - d.x, e.clientY - d.y) < 6) return;
    if (d.touch) { clearTimeout(d.hold); navDrag = null; return; } // moved before the hold: it's a scroll
    startNavDrag(d.y);
  }
  e.preventDefault();
  d.ghost.style.top = `${e.clientY - d.offY}px`;
  const box = d.it.parentElement;
  const others = [...box.querySelectorAll(`:scope > [data-${d.kind}]`)].filter((x) => x !== d.it);
  const before = others.find((x) => { const r = x.getBoundingClientRect(); return e.clientY < r.top + r.height / 2; });
  if ((before || null) !== d.it.nextElementSibling) box.insertBefore(d.it, before || null);
}, { passive: false });
function endNavDrag(drop) {
  const d = navDrag;
  if (!d) return;
  clearTimeout(d.hold);
  navDrag = null;
  if (!d.active) return;
  // Settle the lifted item into its gap, then save the new order.
  const to = d.it.getBoundingClientRect();
  d.ghost.style.transition = 'top .18s ease, box-shadow .18s ease, transform .18s ease';
  d.ghost.style.top = `${to.top}px`;
  d.ghost.classList.add('settling');
  setTimeout(() => {
    d.ghost.remove();
    d.it.classList.remove('nav-placeholder');
    document.body.classList.remove('col-resizing');
    if (drop) {
      const shown = [...d.it.parentElement.querySelectorAll(`:scope > [data-${d.kind}]`)].map((x) => x.getAttribute(`data-${d.kind}`));
      const key = d.kind === 'navkey' ? 'navOrder' : 'navSecOrder';
      // Sections hidden right now (nothing in them) keep their place after the ones you can see.
      S.settings[key] = [...shown, ...(S.settings[key] || []).filter((k) => !shown.includes(k))];
      Store.save();
    }
    renderSidebar();
  }, 180);
  // The link you dropped shouldn't also open.
  const stop = (ev) => { ev.preventDefault(); ev.stopPropagation(); };
  document.addEventListener('click', stop, { capture: true, once: true });
  setTimeout(() => document.removeEventListener('click', stop, { capture: true }), 60);
}
document.addEventListener('pointerup', () => endNavDrag(true));
document.addEventListener('pointercancel', () => endNavDrag(true));

// Phones: keep the Calendar / Time Box Allocation tabs in step with swiping.
document.addEventListener('scroll', (e) => {
  const m = e.target;
  if (!(m instanceof Element) || !m.classList.contains('tb-main') || innerWidth > 760) return;
  const pane = Math.round(m.scrollLeft / Math.max(1, m.clientWidth));
  if (pane !== ui.tbPane) { ui.tbPane = pane; $$('.tb-pager button').forEach((b, i) => b.classList.toggle('on', i === pane)); }
}, true);
// After a redraw, stay on the pane you were on (Calendar or Time Box Allocation).
const origRenderForPanes = render;
// eslint-disable-next-line no-global-assign
render = function renderKeepingPane() {
  origRenderForPanes();
  const m = innerWidth <= 760 && $('.tb-main');
  if (m && ui.tbPane) m.scrollLeft = ui.tbPane * m.clientWidth;
};

// Label editor: show the chosen colour on the preview straight away.
document.addEventListener('change', (e) => {
  const f = e.target.closest?.('.label-edit');
  if (!f || e.target.name !== 'color') return;
  const c = e.target.value;
  const pv = f.querySelector('[data-role="preview"]');
  if (pv) { pv.style.background = c; pv.style.color = inkOn(c); }
  f.querySelectorAll('.sw').forEach((s) => s.classList.toggle('on', s.contains(e.target)));
});
