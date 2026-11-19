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
  if (e.target.closest?.('.sec-col')) return; // the colour dot on a section heading
  const link = e.target.closest?.('.nav-main [data-navkey]');
  const item = !link && e.target.closest?.('.nav-secs [data-navitem]');
  const head = !link && !item && e.target.closest?.('.nav-secs [data-seckey] > h3, .nav-secs [data-seckey] > .req-box > h3');
  const it = link || item || (head && head.closest('[data-seckey]'));
  if (!it || e.button !== 0) return;
  navDrag = { it, kind: link ? 'navkey' : item ? 'navitem' : 'seckey', x: e.clientX, y: e.clientY, active: false, touch: e.pointerType !== 'mouse' };
  if (navDrag.touch) navDrag.hold = setTimeout(() => { if (navDrag) startNavDrag(navDrag.y); }, 280);
});
function startNavDrag(y) {
  const d = navDrag;
  d.active = true;
  const r = d.it.getBoundingClientRect();
  d.offY = y - r.top;
  d.offX = d.x - r.left;
  // Phones: a main link can also go down onto the bottom bar, so it follows your finger both ways.
  d.dock = d.kind === 'navkey' && innerWidth <= 760 && typeof dockHover === 'function';
  if (d.dock) document.body.classList.add('dock-dragging');
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
document.addEventListener('dragstart', (e) => { if (e.target.closest?.('.nav-main [data-navkey], .nav-secs [data-seckey], .nav-secs [data-navitem]')) e.preventDefault(); }, true);
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
  // Move with the screen's refresh, not every touch event, so it glides.
  d.lastX = e.clientX; d.lastY = e.clientY;
  if (d.frame) return;
  d.frame = requestAnimationFrame(() => { d.frame = 0; navDragStep(d, { clientX: d.lastX, clientY: d.lastY }); });
}, { passive: false });
function navDragStep(d, e) {
  if (navDrag !== d || !d.ghost) return;
  d.ghost.style.top = `${e.clientY - d.offY}px`;
  if (d.dock) {
    d.ghost.style.left = `${e.clientX - d.offX}px`;
    d.overDock = dockHover(d.it.dataset.navkey, e.clientX, e.clientY);
    d.ghost.classList.toggle('over-dock', d.overDock);
    if (d.overDock) return;
  }
  const box = d.it.parentElement;
  const others = [...box.querySelectorAll(`:scope > [data-${d.kind}]`)].filter((x) => x !== d.it);
  const before = others.find((x) => { const r = x.getBoundingClientRect(); return e.clientY < r.top + r.height / 2; });
  if ((before || null) !== d.it.nextElementSibling) box.insertBefore(d.it, before || null);
}
function endNavDrag(drop) {
  const d = navDrag;
  if (!d) return;
  clearTimeout(d.hold);
  // Apply the last move before letting go.
  if (d.frame) { cancelAnimationFrame(d.frame); d.frame = 0; navDragStep(d, { clientX: d.lastX, clientY: d.lastY }); }
  navDrag = null;
  if (!d.active) return;
  document.body.classList.remove('dock-dragging');
  if (d.dock && d.overDock && drop) {
    // Dropped on the phone's bottom bar: add it there; the menu keeps its own order.
    d.ghost.remove();
    d.it.classList.remove('nav-placeholder');
    document.body.classList.remove('col-resizing');
    dockDrop();
    const stop = (ev) => { ev.preventDefault(); ev.stopPropagation(); };
    document.addEventListener('click', stop, { capture: true, once: true });
    setTimeout(() => document.removeEventListener('click', stop, { capture: true }), 60);
    return;
  }
  if (d.dock && typeof dockHoverClear === 'function') dockHoverClear();
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
      if (d.kind === 'navitem') {
        // Items keep their own order within their section.
        const sec = d.it.closest('[data-seckey]')?.dataset.seckey;
        const all = { ...(S.settings.navItemOrder || {}) };
        all[sec] = [...shown, ...(all[sec] || []).filter((k) => !shown.includes(k))].slice(0, 200);
        S.settings.navItemOrder = all;
      } else {
        const key = d.kind === 'navkey' ? 'navOrder' : 'navSecOrder';
        // Sections hidden right now (nothing in them) keep their place after the ones you can see.
        S.settings[key] = [...shown, ...(S.settings[key] || []).filter((k) => !shown.includes(k))];
      }
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

// ---------- S-Team / PD Plan: drag a column heading's edge ----------
// Brand and PIC each have their own width; all month columns share one so the grid stays even.
let bpColDrag = null;
document.addEventListener('pointerdown', (e) => {
  const h = e.target.closest?.('[data-bpresize]');
  if (!h || e.button !== 0) return;
  e.preventDefault();
  e.stopPropagation();
  const th = h.closest('th');
  const table = h.closest('table');
  if (!th || !table) return;
  const w = { ...bpColW() };
  // Freeze what is on screen now, so only the dragged column moves.
  for (const k of ['brand', 'pic']) w[k] = w[k] || Math.round($(`thead .bp-${k}`, table).getBoundingClientRect().width);
  bpColDrag = { k: h.dataset.bpresize, h, table, x: e.clientX, start: Math.round(th.getBoundingClientRect().width), w, n: Number(table.style.getPropertyValue('--bp-cols')) || 6 };
  h.classList.add('active');
  document.body.classList.add('col-resizing');
  h.setPointerCapture?.(e.pointerId);
}, true);
document.addEventListener('pointermove', (e) => {
  const d = bpColDrag;
  if (!d) return;
  const [min, max] = BP_COL_LIMITS[d.k];
  d.w[d.k] = Math.round(Math.min(max, Math.max(min, d.start + e.clientX - d.x)));
  d.moved = true;
  d.table.classList.toggle('bp-fixedw', !!d.w.month);
  d.table.setAttribute('style', bpColStyle(d.n, d.w));
});
document.addEventListener('pointerup', () => {
  const d = bpColDrag;
  if (!d) return;
  bpColDrag = null;
  d.h.classList.remove('active');
  document.body.classList.remove('col-resizing');
  if (!d.moved) return;
  // Keep only the column that was dragged; the others stay automatic.
  S.settings.bpColW = { ...bpColW(), [d.k]: d.w[d.k] };
  Store.save();
  render();
});
document.addEventListener('dblclick', (e) => {
  const h = e.target.closest?.('[data-bpresize]');
  if (!h) return;
  const w = { ...bpColW() };
  delete w[h.dataset.bpresize];
  S.settings.bpColW = w;
  Store.save();
  render();
});

// ---------- Phone: jump to a bucket ----------
// On a phone the board shows one bucket at a time. A row of chips above it lists every bucket; tapping one slides
// straight to it, and the chip of the bucket on screen is highlighted as you swipe.
(function bucketJump() {
  const PHONE = matchMedia('(max-width: 760px)');
  const nameOf = (col) => {
    const head = col.querySelector('.col-head');
    if (!head) return col.classList.contains('add-col') ? '' : 'Bucket';
    const inp = head.querySelector('input.col-title-input, input');
    return ((inp && inp.value) || head.querySelector('.col-title, h2, h3, b')?.textContent || head.textContent || '').trim() || 'Untitled';
  };
  const colsOf = (board) => [...board.children].filter((c) => c.classList.contains('col') && !c.classList.contains('add-col'));
  function mark(board, bar) {
    const cols = colsOf(board);
    const x = board.scrollLeft + board.clientWidth / 2;
    let on = 0;
    cols.forEach((c, i) => { if (c.offsetLeft <= x) on = i; });
    [...bar.children].forEach((b, i) => {
      const was = b.classList.contains('on');
      b.classList.toggle('on', i === on);
      b.setAttribute('aria-current', i === on ? 'true' : 'false');
      if (i === on && !was) b.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    });
  }
  function build() {
    document.querySelectorAll('#main .board').forEach((board) => {
      const cols = colsOf(board);
      let bar = board.previousElementSibling?.classList.contains('bj-bar') ? board.previousElementSibling : null;
      if (cols.length < 2) { bar?.remove(); return; }
      const html = cols.map((c, i) => {
        const n = c.querySelector('.col-head .count')?.textContent.trim();
        return `<button type="button" class="bj-chip" data-i="${i}">${esc(nameOf(c))}${n ? ` <small>${esc(n)}</small>` : ''}</button>`;
      }).join('');
      if (!bar) {
        bar = document.createElement('nav');
        bar.className = 'bj-bar';
        bar.setAttribute('aria-label', 'Go to bucket');
        board.before(bar);
        bar.addEventListener('click', (e) => {
          const b = e.target.closest('.bj-chip');
          const col = b && colsOf(board)[+b.dataset.i];
          if (!col) return;
          e.stopPropagation();
          [...bar.children].forEach((x) => { x.classList.toggle('on', x === b); x.setAttribute('aria-current', x === b ? 'true' : 'false'); });
          board.scrollTo({ left: col.offsetLeft - parseFloat(getComputedStyle(board).paddingLeft || 0), behavior: 'smooth' });
        });
      }
      if (bar.dataset.html !== html) { bar.innerHTML = html; bar.dataset.html = html; }
      if (!board.dataset.bj) { board.dataset.bj = '1'; board.addEventListener('scroll', () => mark(board, bar), { passive: true }); }
      mark(board, bar);
    });
  }
  const run = () => { if (PHONE.matches) build(); else document.querySelectorAll('.bj-bar').forEach((b) => b.remove()); };
  addEventListener('DOMContentLoaded', () => {
    const main = document.getElementById('main');
    if (!main) return;
    let queued = false;
    new MutationObserver(() => { if (!queued) { queued = true; setTimeout(() => { queued = false; run(); }, 0); } }).observe(main, { childList: true });
    PHONE.addEventListener?.('change', run);
    run();
  });
})();

// ---------- Phone: search is a button until you tap it ----------
// The search box shrinks to a search button on a phone. Tapping it opens the box across the top bar; it folds
// back when you leave it empty.
(function searchButton() {
  const sync = () => {
    const s = document.getElementById('search');
    const box = s && s.closest('.search');
    if (box) box.classList.toggle('has-q', !!s.value.trim());
  };
  document.addEventListener('input', (e) => { if (e.target.id === 'search') sync(); });
  document.addEventListener('focusout', (e) => { if (e.target.id === 'search') setTimeout(sync, 0); });
  document.addEventListener('keydown', (e) => { if (e.target.id === 'search' && e.key === 'Escape' && !e.target.value) e.target.blur(); });
  addEventListener('hashchange', () => setTimeout(sync, 0));
  addEventListener('DOMContentLoaded', () => setTimeout(sync, 0));
})();

// ---------- Phone: the page's name sits in the top bar ----------
// On a phone the name of the page you're on (a plan, Time Box, Schedule...) moves up into the top bar, left of the
// search button, and the big heading on the page itself is hidden to save room.
(function topTitle() {
  const PHONE = matchMedia('(max-width: 760px)');
  function nameNow() {
    const m = document.getElementById('main');
    if (!m) return '';
    const pt = m.querySelector('.plan-head .plan-title');
    if (pt) return (pt.value ?? pt.textContent ?? '').trim();
    const h = m.querySelector('h1');
    if (h) h.classList.add('tb-src');
    if (h) return h.textContent.trim();
    const v = (typeof ui !== 'undefined' && ui.route && ui.route.view) || '';
    return { meet: 'Schedule', timebox: 'Time Box', fitness: 'Fitness', growth: 'Growth', yearly: 'Yearly Planner', notes: 'Discussion Notes', report: 'Report', progress: 'Progress' }[v] || '';
  }
  function run() {
    const bar = document.getElementById('topbar');
    if (!bar) return;
    let el = bar.querySelector('.top-name');
    if (!el) {
      el = document.createElement('span');
      el.className = 'top-name';
      const nav = bar.querySelector('.nav-toggle');
      if (nav) nav.after(el); else bar.prepend(el);
    }
    const n = PHONE.matches ? nameNow() : '';
    if (el.textContent !== n) el.textContent = n;
    document.body.classList.toggle('has-tb-title', !!n);
  }
  addEventListener('DOMContentLoaded', () => {
    const main = document.getElementById('main');
    if (!main) return;
    let queued = false;
    new MutationObserver(() => { if (!queued) { queued = true; setTimeout(() => { queued = false; run(); }, 0); } }).observe(main, { childList: true });
    document.addEventListener('change', (e) => { if (e.target.classList?.contains('plan-title')) setTimeout(run, 0); });
    PHONE.addEventListener?.('change', run);
    setTimeout(run, 0);
  });
})();

// ---------- Phone: sync status, Undo and Redo under ⋯ ----------
// On a phone the top bar keeps only ☰, the page name, search, ⋯ and settings. ⋯ holds the save/sync status, Undo
// and Redo; a dot on ⋯ shows when something needs attention.
(function topMore() {
  function menu(btn) {
    const st = document.getElementById('status');
    const u = document.getElementById('undoBtn');
    const r = document.getElementById('redoBtn');
    const items = [];
    const unread = typeof unreadCount === 'function' ? unreadCount() : 0;
    const notif = typeof inboxHTML === 'function' ? { label: unread ? `Notifications (${unread > 99 ? '99+' : unread})` : 'Notifications', icon: 'bell', run: () => openPop(btn, inboxHTML) } : null;
    if (u) items.push({ label: 'Undo', icon: 'undo', run: () => actions.undo() });
    if (r) items.push({ label: 'Redo', icon: 'redo', run: () => actions.redo() });
    // Sync status isn't listed; a red dot on ⋯ still warns if saving fails.
    if (st && /\berror\b/.test(st.className)) {
      if (items.length) items.push('-');
      items.push({ label: st.textContent.trim(), icon: 'globe', run: () => { if (st.dataset.act) st.click(); } });
    }
    // On a plan, its options (Group by, Filter, Text size, members...) come first, so there's one ⋯ on screen.
    const planBtn = document.querySelector('#main .plan-head [data-act="planMenu"]');
    if (planBtn && typeof planMenu === 'function') {
      let planItems = null;
      const real = openMenu;
      openMenu = (anchor, list) => { planItems = list; };
      try { planMenu(btn); } catch (err) { console.error(err); } finally { openMenu = real; }
      if (planItems && planItems.length) items.unshift(...planItems, '-');
    }
    if (notif) items.unshift(notif, '-');
    openMenu(btn, items);
  }
  function mark() {
    const st = document.getElementById('status');
    const b = document.getElementById('topMoreBtn');
    if (b && st) b.classList.toggle('warn', /\berror\b/.test(st.className));
    if (b) b.classList.toggle('unread', typeof unreadCount === 'function' && unreadCount() > 0);
  }
  (function add() {
    const bar = document.getElementById('topbar');
    const gear = bar && bar.querySelector('[data-act="openSettings"]');
    if (!gear || typeof actions === 'undefined') { setTimeout(add, 200); return; }
    if (document.getElementById('topMoreBtn')) return;
    gear.insertAdjacentHTML('beforebegin', `<button id="topMoreBtn" class="icon-btn top-more" aria-label="More options" title="More">${icon('more', 19)}</button>`);
    const b = document.getElementById('topMoreBtn');
    b.addEventListener('click', (e) => { e.stopPropagation(); menu(b); });
    const st = document.getElementById('status');
    if (st) new MutationObserver(mark).observe(st, { attributes: true, attributeFilter: ['class'] });
    mark();
    setInterval(mark, 2000);
  })();
})();

// ---------- Phone: drop a task into any bucket ----------
// Press, hold and drag a task on a phone: it moves up and down within its own bucket. Drag it up onto the row of
// bucket names at the top and a list of every bucket appears; let go over one and the task moves to the end of
// that bucket. Each entry carries the same data-group as its column, so the usual drop logic does the move.
(function bucketDrop() {
  const PHONE = matchMedia('(max-width: 760px)');
  const nameOf = (col) => {
    const head = col.querySelector('.col-head');
    const inp = head && head.querySelector('input.col-title-input');
    return ((inp && inp.value) || head?.querySelector('.col-title')?.textContent || '').trim() || 'Untitled';
  };
  let panel = null;
  let armed = null; // { from, board, left } while a task is held on a phone board
  const holding = () => typeof Drag !== 'undefined' && Drag.s && Drag.s.active && Drag.s.type === 'task';
  function arm() {
    const board = document.querySelector('#main .board');
    if (!PHONE.matches || !holding() || !board) return;
    const s = Drag.s;
    armed = { from: s.fromGroup || s.el?.closest('.col[data-group]')?.dataset.group || '', board, left: board.scrollLeft };
    document.body.classList.add('bd-armed');
  }
  function show() {
    const cols = [...armed.board.querySelectorAll(':scope > .col[data-group]')];
    if (cols.length < 2) return;
    panel = document.createElement('div');
    panel.className = 'bucket-drop';
    panel.innerHTML = `<p>Drop into a bucket</p><div class="bd-list">${cols.map((c) => `<div class="col bd-item ${c.dataset.group === armed.from ? 'here' : ''}" data-group="${esc(c.dataset.group)}" ${c.dataset.locked ? 'data-locked="1"' : ''}><span>${esc(nameOf(c))}</span><div class="col-body" hidden></div></div>`).join('')}</div>`;
    // Just under the bucket names, where the task was dragged to.
    const bar = armed.board.previousElementSibling?.classList.contains('bj-bar') ? armed.board.previousElementSibling : null;
    if (bar) { panel.style.top = `${Math.round(bar.getBoundingClientRect().bottom + 8)}px`; panel.style.bottom = 'auto'; panel.style.right = '10px'; }
    document.body.append(panel);
    document.body.classList.add('bd-open');
  }
  function hide() { panel?.remove(); panel = null; armed = null; document.body.classList.remove('bd-open', 'bd-armed'); }
  function hover(e) {
    if (!armed || !holding()) return;
    // The board stays on the bucket you started in.
    if (armed.board.isConnected && armed.board.scrollLeft !== armed.left) armed.board.scrollLeft = armed.left;
    // Up onto the bucket names (or above them): show the list of buckets.
    const bar = armed.board.previousElementSibling?.classList.contains('bj-bar') ? armed.board.previousElementSibling : null;
    if (!panel && bar && e.clientY <= bar.getBoundingClientRect().bottom + 6) show();
    const el = panel && document.elementsFromPoint(e.clientX, e.clientY).find((n) => n.classList?.contains('bd-item'));
    if (panel) {
      panel.querySelectorAll('.bd-item.on').forEach((n) => n !== el && n.classList.remove('on'));
      if (el && !el.dataset.locked) el.classList.add('on');
    }
    // Anywhere else, only a place in the same bucket counts.
    const tg = Drag.s.target;
    if (!el && tg && tg.group && tg.group !== armed.from) { Drag.s.target = null; Drag.s.ph?.remove(); }
  }
  addEventListener('DOMContentLoaded', () => {
    new MutationObserver(() => {
      const on = document.body.classList.contains('dragging');
      if (on && !armed) arm(); else if (!on && (armed || panel)) hide();
    }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
    document.addEventListener('pointermove', hover, { passive: true });
    document.addEventListener('touchmove', (e) => { const t = e.touches[0]; if (t) hover(t); }, { passive: true });
    // Edge auto-scroll mustn't slide to the next bucket while you hold a task.
    document.addEventListener('scroll', (e) => { if (armed && e.target === armed.board && armed.board.scrollLeft !== armed.left) armed.board.scrollLeft = armed.left; }, true);
  });
})();

// ---------- Phone: press and hold the plan's name to rename it ----------
(function holdToRename() {
  let timer = null;
  const cancel = () => { clearTimeout(timer); timer = null; };
  async function rename() {
    const inp = document.querySelector('#main .plan-head input.plan-title[data-id]');
    const p = inp && planById(inp.dataset.id);
    if (!p) return;
    navigator.vibrate?.(15);
    const name = String(await promptDlg('Rename plan', 'Plan name', p.name, 'Rename') || '').trim();
    if (!name || name === p.name) return;
    p.name = name;
    commit();
  }
  document.addEventListener('pointerdown', (e) => {
    if (!e.target.closest?.('#topbar .top-name')) return;
    cancel();
    timer = setTimeout(() => { timer = null; rename(); }, 500);
  });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach((t) => document.addEventListener(t, cancel));
  document.addEventListener('contextmenu', (e) => { if (e.target.closest?.('#topbar .top-name')) e.preventDefault(); });
})();

// ---------- Phone: every module's text matches the Planner ----------
// The Planner's boards stop growing at a phone to-do-list size. On a phone the whole app now stops at that same
// size, so a large iPhone Text Size (or Aa) no longer makes other modules bigger than the Planner. Smaller still works.
(function capPhoneText() {
  const PHONE = matchMedia('(max-width: 760px)');
  function cap() {
    if (!PHONE.matches) return;
    const root = document.documentElement;
    const type = parseFloat(getComputedStyle(root).getPropertyValue('--type')) || 1;
    const scale = parseFloat(root.style.getPropertyValue('--scale')) || 1;
    const max = Math.round((17 / 14 / type) * 1000) / 1000; // body text at 17px, as in iPhone apps
    if (scale > max) root.style.setProperty('--scale', String(max));
  }
  (function hook() {
    if (typeof applySizes !== 'function') { setTimeout(hook, 100); return; }
    const base = applySizes;
    applySizes = function applySizesCapped(...a) { const r = base.apply(this, a); cap(); return r; };
    cap();
    PHONE.addEventListener?.('change', () => applySizes());
  })();
})();

// Back online: sync the team folder straight away (Cloud Sync already does).
addEventListener('online', () => { try { if (typeof Team !== 'undefined' && Team.dir) Team.sync(); } catch (err) { console.error(err); } });

// ---------- Phone: keep the field you're typing in above the keyboard ----------
// The on-screen keyboard covers the bottom of the task panel and other sheets. Measure it, leave that much room
// at the bottom of the panel, and scroll the field you're typing in to the middle of what's still visible.
(function keyboardRoom() {
  const vv = window.visualViewport;
  if (!vv) return;
  const PHONE = matchMedia('(max-width: 760px)');
  const root = document.documentElement;
  let field = null;
  const inSheet = (el) => el && el.closest && el.closest('dialog, .pop') && el.matches('input:not([type=checkbox]):not([type=radio]):not([type=date]):not([type=time]), textarea, [contenteditable="true"]');
  function show() {
    if (!field || !document.contains(field) || document.activeElement !== field) return;
    const r = field.getBoundingClientRect();
    const top = vv.offsetTop + 60, bottom = vv.offsetTop + vv.height - 16;
    if (r.top >= top && r.bottom <= bottom) return;
    // Centre it in the part of the screen the keyboard leaves free.
    const box = field.closest('.task-scroll, .dlg-body, .picker-scroll, .pop');
    const by = r.top + r.height / 2 - (top + (bottom - top) / 2);
    if (box) box.scrollBy({ top: by, behavior: 'smooth' }); else field.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
  function measure() {
    const kb = PHONE.matches ? Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)) : 0;
    root.style.setProperty('--kb', `${kb > 80 ? kb : 0}px`);
    if (kb > 80) setTimeout(show, 60);
  }
  vv.addEventListener('resize', measure);
  vv.addEventListener('scroll', measure);
  document.addEventListener('focusin', (e) => { if (PHONE.matches && inSheet(e.target)) { field = e.target; setTimeout(() => { measure(); show(); }, 350); } });
  document.addEventListener('focusout', () => setTimeout(() => { if (!inSheet(document.activeElement)) { field = null; measure(); } }, 200));
})();

// ---------- Ask before ticking a task off ----------
// The circle on a task completes it (it moves to "Show completed"). A stray tap shouldn't do that, so a small
// Complete / Cancel pop-up opens right beside the circle. Un-ticking a completed task doesn't ask.
function tickAsk(anchor, label) {
  document.querySelector('.tick-pop')?.remove();
  return new Promise((resolve) => {
    const pop = document.createElement('div');
    pop.className = 'tick-pop';
    pop.setAttribute('role', 'dialog');
    pop.innerHTML = `<button type="button" class="btn primary sm" data-yes>${esc(label)}</button><button type="button" class="btn ghost sm" data-no>Cancel</button>`;
    (anchor.closest('dialog') || document.body).append(pop);
    const r = anchor.getBoundingClientRect();
    const w = pop.offsetWidth, h = pop.offsetHeight;
    pop.style.left = `${Math.max(8, Math.min(innerWidth - w - 8, r.right + 8))}px`;
    pop.style.top = `${Math.max(8, Math.min(innerHeight - h - 8, r.top + r.height / 2 - h / 2))}px`;
    let done = false;
    const finish = (ok) => { if (done) return; done = true; pop.remove(); document.removeEventListener('pointerdown', outside, true); resolve(ok); };
    const outside = (e) => { if (!pop.contains(e.target)) finish(false); };
    pop.querySelector('[data-yes]').onclick = (e) => { e.stopPropagation(); finish(true); };
    pop.querySelector('[data-no]').onclick = (e) => { e.stopPropagation(); finish(false); };
    setTimeout(() => document.addEventListener('pointerdown', outside, true), 0);
    pop.querySelector('[data-yes]').focus();
  });
}
addEventListener('DOMContentLoaded', () => {
  const base = actions.toggleDone;
  if (!base) return;
  actions.toggleDone = async (el, ...a) => {
    const t = taskById(el.dataset.id);
    if (!t || isDone(t) || (delegatorOnly(t) && !t.review) || !el.getBoundingClientRect) return base(el, ...a);
    const what = checkLabel(t);
    const label = what === 'Submit for checking' ? 'Submit' : what === 'Approve and complete' ? 'Approve' : 'Complete';
    if (!await tickAsk(el, label)) return;
    return base(el, ...a);
  };
});

// ---------- Left menu sections: colour and item order ----------
// Each section (Request to me, Pending from Others, Delegate To, Delegate From…) can have its own background
// colour, chosen from the dot on its heading, and the items in it keep the order you drag them into.
(function navSections() {
  const idOf = (a) => a.getAttribute('href') && a.getAttribute('href') !== 'javascript:void 0' ? a.getAttribute('href') : a.dataset.openTask ? `task:${a.dataset.openTask}` : '';
  function decorate() {
    const cols = S.settings.navSecColor || {};
    const orders = S.settings.navItemOrder || {};
    document.querySelectorAll('#sidebar .nav-secs > [data-seckey]').forEach((sec) => {
      const k = sec.dataset.seckey;
      const c = cols[k] || '';
      sec.classList.toggle('has-col', !!c);
      if (c) sec.style.setProperty('--sec-bg', c); else sec.style.removeProperty('--sec-bg');
      const h = sec.querySelector(':scope > h3, :scope > .req-box > h3');
      if (h && !h.querySelector('.sec-col')) h.insertAdjacentHTML('beforeend', `<button type="button" class="sec-col" data-act="secColour" data-key="${esc(k)}" aria-label="Section colour" title="Section colour"><i></i></button>`);
      // Items in the order you dragged them into; new ones go after.
      const box = sec.querySelector(':scope > .req-box') || sec;
      const items = [...box.querySelectorAll(':scope > .nav-item')];
      items.forEach((a) => { const id = idOf(a); if (id) a.dataset.navitem = id; });
      const order = orders[k] || [];
      if (order.length) {
        const at = (a) => { const i = order.indexOf(a.dataset.navitem); return i < 0 ? 1000 + items.indexOf(a) : i; };
        [...items].sort((a, b) => at(a) - at(b)).forEach((a) => box.append(a));
      }
    });
  }
  function colourPop(el) {
    const k = el.dataset.key;
    const cur = (S.settings.navSecColor || {})[k] || '';
    openPop(el, () => `<div class="picker colour-list"><h4>Section colour</h4>${[{ v: '', label: 'None' }, ...currentStyle().palette.map(([v, label]) => ({ v, label }))].map((c) => `<button class="colour-opt ${c.v === cur ? 'on' : ''}" data-act="secColourSet" data-key="${esc(k)}" data-v="${esc(c.v)}"><i style="background:${c.v || 'transparent'}; ${c.v ? '' : 'box-shadow: inset 0 0 0 1px var(--line);'}"></i><span>${esc(c.label)}</span>${c.v === cur ? icon('check', 14) : ''}</button>`).join('')}</div>`);
  }
  addEventListener('DOMContentLoaded', () => {
    Object.assign(actions, {
      secColour: (el) => colourPop(el),
      secColourSet: (el) => { const all = { ...(S.settings.navSecColor || {}) }; if (el.dataset.v) all[el.dataset.key] = el.dataset.v; else delete all[el.dataset.key]; S.settings.navSecColor = all; closePop(); Store.save(); renderSidebar(); },
    });
    // Run after every other change to the menu.
    setTimeout(() => {
      const base = renderSidebar;
      renderSidebar = function renderSidebarWithSections(...a) { const r = base.apply(this, a); try { decorate(); } catch (err) { console.error(err); } return r; };
      try { decorate(); } catch { /* not drawn yet */ }
    }, 0);
  });
})();

// ---------- Left menu: choose which modules to show ----------
// "Edit" above the main links lets you tick which modules show in your menu; "Show all" brings back any you hid.
// This is your own choice; what an admin turns off for you in Module Access stays off.
(function navShowHide() {
  let editing = false;
  const hidden = () => S.settings.navHidden || [];
  function decorate() {
    const main = document.querySelector('#sidebar .nav-main');
    if (!main) return;
    const h = hidden();
    const items = [...main.querySelectorAll(':scope > [data-navkey]')];
    items.forEach((a) => {
      const off = h.includes(a.dataset.navkey);
      a.classList.toggle('nav-off', off && editing);
      a.classList.toggle('nav-hide', off && !editing);
      a.classList.toggle('nav-editing', editing);
      a.querySelector('.nav-eye')?.remove();
      if (editing) a.insertAdjacentHTML('beforeend', `<span class="nav-eye" aria-hidden="true">${icon(off ? 'close' : 'check', 14)}</span>`);
    });
    const n = items.filter((a) => h.includes(a.dataset.navkey)).length;
    let bar = document.querySelector('#sidebar .nav-edit-bar');
    if (!bar) { bar = document.createElement('div'); bar.className = 'nav-edit-bar'; main.before(bar); }
    bar.innerHTML = editing
      ? `<span class="small muted">Tap a module to show or hide it</span><button type="button" class="link-btn" data-act="navShowAll">Show all</button><button type="button" class="btn primary sm" data-act="navEdit">Done</button>`
      : `${n ? `<span class="small muted">${n} hidden</span><button type="button" class="link-btn" data-act="navShowAll">Show all</button>` : ''}<button type="button" class="link-btn" data-act="navEdit">${icon('pencil', 13)} Edit menu</button>`;
  }
  // While editing, tapping a module shows or hides it instead of opening it.
  document.addEventListener('click', (e) => {
    if (!editing) return;
    const a = e.target.closest?.('#sidebar .nav-main [data-navkey]');
    if (!a) return;
    e.preventDefault(); e.stopPropagation();
    const k = a.dataset.navkey;
    const h = hidden();
    S.settings.navHidden = h.includes(k) ? h.filter((x) => x !== k) : [...h, k];
    Store.save();
    decorate();
  }, true);
  addEventListener('DOMContentLoaded', () => {
    Object.assign(actions, {
      navEdit: () => { editing = !editing; decorate(); if (!editing) renderSidebar(); },
      navShowAll: () => { S.settings.navHidden = []; Store.save(); decorate(); toast('All modules are back in your menu.'); },
    });
    setTimeout(() => {
      const base = renderSidebar;
      renderSidebar = function renderSidebarWithShowHide(...a) { const r = base.apply(this, a); try { decorate(); } catch (err) { console.error(err); } return r; };
      try { decorate(); } catch { /* not drawn yet */ }
    }, 0);
  });
})();
