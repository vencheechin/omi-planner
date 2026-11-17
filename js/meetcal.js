'use strict';
// ---------- Meeting Calendar ----------
// Day, week and month views of meetings. Click an empty time to create one, drag a meeting to move
// it, click it to edit. Attendees see the meeting in their own calendar. Public and school holidays
// show along the top. Meetings live in one team-wide record (id "meetings", module "cal") that syncs
// like an S-Team Plan, one field per meeting (`mt:<id>`).

if (!ICON.meet) ICON.meet = 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4M8 14h3M8 17h6';
const MC_H = 48; // pixels per hour
const MC_COLORS = ['#3e5170', '#b5894d', '#7b8060', '#be7f5c', '#6e7a8f', '#8c6a3c', '#5f8f5f', '#9a5b6e'];
function mcPlan(create) {
  let p = stPlans().find((x) => x.id === 'meetings');
  if (!p && create) { p = normalizeStPlan({ id: 'meetings', kind: 'dept', module: 'cal', name: 'Meeting Calendar', owner: S.meId, groups: [] }); stPlans().push(p); }
  return p || null;
}
function mcNorm(m) {
  if (!m || typeof m !== 'object' || !m.id || !/^\d{4}-\d{2}-\d{2}$/.test(m.date || '')) return null;
  const mins = (v, d) => (Number.isFinite(Number(v)) ? Math.max(0, Math.min(1440, Math.round(Number(v)))) : d);
  const start = mins(m.start, 540);
  return {
    id: String(m.id).slice(0, 40), title: String(m.title || '').slice(0, 200), date: m.date, start, end: Math.max(start + 15, mins(m.end, start + 60)),
    org: String(m.org || '').slice(0, 120), att: (Array.isArray(m.att) ? m.att : []).filter((x) => typeof x === 'string').slice(0, 60),
    loc: String(m.loc || '').slice(0, 200), link: String(m.link || '').slice(0, 500), notes: String(m.notes || '').slice(0, 4000),
    color: /^#[0-9a-f]{6}$/i.test(m.color || '') ? m.color : '', at: Number(m.at) || Date.now(),
    tz: typeof m.tz === 'string' && typeof tzValid === 'function' && tzValid(m.tz) ? m.tz : '',
  };
}
const mcAll = () => { const p = mcPlan(); return p ? (p.meetings = Array.isArray(p.meetings) ? p.meetings : []) : []; };
const mcMine = (m) => m.org === pkey(S.meId) || m.att.includes(pkey(S.meId));
/** A meeting on this device's clock (a copy, with _o pointing at the real one) when its zone differs. */
const mcZone = (m) => m.tz || tzHome();
function mcLocal(m) {
  const from = mcZone(m);
  const to = tzNow();
  if (from === to) return m;
  const a = tzConvert(m.date, m.start, from, to);
  const b = tzConvert(m.date, m.end, from, to);
  const end = b.date === a.date ? b.min : 1440;
  return { ...m, date: a.date, start: a.min, end: Math.max(a.min + 15, end), _o: m };
}
const mcShown = () => mcAll().filter((m) => (ui.mc?.all && stAdmin()) || mcMine(m)).map(mcLocal);
const mcCanEdit = (m) => !m || mcMine(m) || stAdmin();
const mcDirty = () => { S.sync.dirty = S.sync.dirty || {}; S.sync.dirty['st:meetings'] = 1; };
const mcHHMM = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
const mcMin = (hhmm) => { const [h, m] = String(hhmm || '').split(':').map(Number); return Number.isFinite(h) ? h * 60 + (m || 0) : null; };
const mcFmt = (min) => fmtTime(min);
const mcAddDays = (iso, n) => { const d = new Date(`${iso}T12:00:00`); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const mcDow = (iso) => (new Date(`${iso}T12:00:00`).getDay() + 6) % 7; // Monday = 0
const mcWeekStart = (iso) => mcAddDays(iso, -mcDow(iso));
const MC_DAY = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MC_MON = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// ---------- Views ----------
function mcState() { return (ui.mc = ui.mc || { view: matchMedia('(max-width: 760px)').matches ? 'day' : 'week', date: todayISO(), all: false }); }
function mcTitle() {
  const s = mcState();
  const d = new Date(`${s.date}T12:00:00`);
  if (s.view === 'month') return `${MC_MON[d.getMonth()]} ${d.getFullYear()}`;
  if (s.view === 'day') return d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const a = new Date(`${mcWeekStart(s.date)}T12:00:00`);
  const b = new Date(`${mcAddDays(mcWeekStart(s.date), 6)}T12:00:00`);
  return a.getMonth() === b.getMonth() ? `${MC_MON[a.getMonth()]} ${a.getFullYear()}` : `${MC_MON[a.getMonth()].slice(0, 3)} – ${MC_MON[b.getMonth()].slice(0, 3)} ${b.getFullYear()}`;
}
/** Side-by-side lanes for meetings that overlap on one day. */
function mcLanes(list) {
  const sorted = [...list].sort((a, b) => a.start - b.start || b.end - a.end);
  const out = [];
  let group = [];
  let groupEnd = -1;
  const flush = () => { const lanes = []; group.forEach((m) => { let i = lanes.findIndex((end) => end <= m.start); if (i < 0) { i = lanes.length; lanes.push(0); } lanes[i] = m.end; out.push({ m, lane: i }); }); const n = lanes.length; out.slice(-group.length).forEach((x) => { x.n = n; }); group = []; };
  sorted.forEach((m) => { if (group.length && m.start >= groupEnd) flush(); group.push(m); groupEnd = Math.max(groupEnd, m.end); });
  if (group.length) flush();
  return out;
}
function mcEventHTML({ m, lane, n }) {
  const top = (m.start / 60) * MC_H;
  const h = Math.max(18, ((m.end - m.start) / 60) * MC_H - 2);
  const who = m.att.length + (m.att.includes(m.org) ? 0 : 1);
  return `<button class="mc-ev ${h < 34 ? 'short' : ''}" data-mc-ev="${esc(m.id)}" style="top:${top}px;height:${h}px;left:calc(${(lane / n) * 100}% + 2px);width:calc(${100 / n}% - 4px);--ec:${m.color || MC_COLORS[0]}">
    <b>${esc(m.title || '(No title)')}</b><small>${esc(mcFmt(m.start))} – ${esc(mcFmt(m.end))}${m._o ? ` · ${esc(tzCity(mcZone(m._o)))} ${esc(mcFmt(m._o.start))}` : ''}${m.loc ? ` · ${esc(m.loc)}` : ''}${who > 1 ? ` · ${who} people` : ''}</small></button>`;
}
function mcGridHTML(days) {
  const today = todayISO();
  const shown = mcShown();
  const hols = days.map((d) => holidaysOn(d));
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
  return `<div class="mc-grid" style="--mc-days:${days.length}">
    <div class="mc-head"><div class="mc-gut"></div>${days.map((d) => { const dt = new Date(`${d}T12:00:00`); return `<button class="mc-dh ${d === today ? 'today' : ''}" data-act="mcGoDay" data-d="${d}"><small>${MC_DAY[mcDow(d)]}</small><b>${dt.getDate()}</b></button>`; }).join('')}</div>
    <div class="mc-allday"><div class="mc-gut"><small>All day</small></div>${days.map((d, i) => `<div class="mc-ad">${hols[i].map((h) => `<span class="mc-hol mc-${h.kind}" title="${esc(holLabel(h))}">${esc(holLabel(h))}</span>`).join('')}</div>`).join('')}</div>
    <div class="mc-body" data-scroll="mc-body"><div class="mc-inner" style="height:${24 * MC_H}px">
      <div class="mc-gut mc-hours">${Array.from({ length: 24 }, (_, hr) => `<span style="top:${hr * MC_H}px">${hr ? fmtTime(hr * 60).replace(':00', '') : ''}</span>`).join('')}</div>
      ${days.map((d, i) => `<div class="mc-col ${d === today ? 'today' : ''} ${hols[i].some((h) => h.kind === 'pub') ? 'pubhol' : ''}" data-mc-day="${d}">
        ${mcLanes(shown.filter((m) => m.date === d)).map(mcEventHTML).join('')}
        ${d === today ? `<i class="mc-now" style="top:${(nowMin / 60) * MC_H}px"></i>` : ''}</div>`).join('')}
    </div></div></div>`;
}
function mcMonthHTML() {
  const s = mcState();
  const first = `${s.date.slice(0, 7)}-01`;
  const start = mcWeekStart(first);
  const today = todayISO();
  const shown = mcShown();
  const cells = Array.from({ length: 42 }, (_, i) => mcAddDays(start, i));
  const rows = cells.slice(35).some((d) => d.slice(0, 7) === s.date.slice(0, 7)) ? 6 : 5;
  return `<div class="mc-month"><div class="mc-mh">${MC_DAY.map((d) => `<span>${d}</span>`).join('')}</div>
    <div class="mc-mgrid" style="--rows:${rows}">${cells.slice(0, rows * 7).map((d) => {
      const ms = shown.filter((m) => m.date === d).sort((a, b) => a.start - b.start);
      const hs = holidaysOn(d);
      const items = [...hs.map((h) => `<span class="mc-hol mc-${h.kind}" title="${esc(holLabel(h))}">${esc(holLabel(h))}</span>`), ...ms.map((m) => `<button class="mc-chip" data-mc-ev="${esc(m.id)}" style="--ec:${m.color || MC_COLORS[0]}"><i></i>${esc(mcFmt(m.start))} ${esc(m.title || '(No title)')}</button>`)];
      return `<div class="mc-mc ${d.slice(0, 7) !== s.date.slice(0, 7) ? 'other' : ''} ${d === today ? 'today' : ''} ${hs.some((h) => h.kind === 'pub') ? 'pubhol' : ''}" data-mc-mday="${d}">
        <button class="mc-mnum" data-act="mcGoDay" data-d="${d}">${Number(d.slice(8))}</button>
        ${items.slice(0, 4).join('')}${items.length > 4 ? `<button class="mc-more" data-act="mcGoDay" data-d="${d}">${items.length - 4} more</button>` : ''}</div>`;
    }).join('')}</div></div>`;
}
function renderMeetCal() {
  const s = mcState();
  const days = s.view === 'day' ? [s.date] : Array.from({ length: 7 }, (_, i) => mcAddDays(mcWeekStart(s.date), i));
  const upcoming = mcShown().filter((m) => m.date >= todayISO()).sort((a, b) => a.date.localeCompare(b.date) || a.start - b.start).slice(0, 1)[0];
  return `<div class="page mc-page">
    <header class="mc-top">
      <h1>Calendar</h1>
      <button class="btn primary sm" data-act="mcNew">${icon('plus', 14)} Create</button>
      <button class="btn ghost sm" data-act="mcToday">Today</button>
      <span class="mc-nav"><button class="icon-btn" data-act="mcStep" data-d="-1" aria-label="Previous">${icon('chevL')}</button><button class="icon-btn" data-act="mcStep" data-d="1" aria-label="Next">${icon('chevR')}</button></span>
      <b class="mc-title">${esc(mcTitle())}</b>
      <button class="btn ghost sm mc-tz" data-act="mcTzMenu" title="Time zones">🕒 ${tzNow() === tzHome() ? esc(tzLabel(tzNow())) : `Now: ${esc(tzLabel(tzNow()))} · Home: ${esc(tzLabel(tzHome()))}`}</button>
      <span class="spacer"></span>
      ${stAdmin() ? `<label class="mc-allbox small"><input type="checkbox" data-change="mcAll" ${s.all ? 'checked' : ''}> Everyone's</label>` : ''}
      <button class="btn ghost sm" data-act="holPick" title="Public and school holidays">${icon('flag', 13)} Holidays</button>
      <div class="seg">${[['day', 'Day'], ['week', 'Week'], ['month', 'Month']].map(([v, l]) => `<button class="${s.view === v ? 'on' : ''}" data-act="mcView" data-v="${v}">${l}</button>`).join('')}</div>
    </header>
    ${upcoming ? `<p class="small muted mc-next">Next: <b>${esc(upcoming.title || '(No title)')}</b> · ${esc(dayLabel(upcoming.date))}, ${esc(mcFmt(upcoming.start))}</p>` : ''}
    ${s.view === 'month' ? mcMonthHTML() : mcGridHTML(days)}
  </div>`;
}

// ---------- Create and edit ----------
function mcFormHTML(m) {
  const me = pkey(S.meId);
  const att = new Set(m.att);
  return `<form class="mc-form" data-submit="mcSave" data-id="${esc(m.id)}">
    <input class="mc-tin" name="title" value="${esc(m.title)}" placeholder="Add title" aria-label="Title" autocomplete="off" data-focus="mc-title">
    <div class="mc-when"><input type="date" name="date" value="${esc(m.date)}" aria-label="Date" required>${wheelTimeHTML('start', m.start, 'Start')}<span>–</span>${wheelTimeHTML('end', m.end, 'End')}</div>
    <label class="pd-f mc-tzf"><span>Time zone</span>${tzSelectHTML('tz', m.tz || tzNow(), 'data-change="mcTzField"')}<small class="muted mc-tznote">${mcTzNote(m.date, m.start, m.tz || tzNow())}</small></label>
    <label class="pd-f"><span>Attendees</span><div class="mc-people">${S.people.map((x) => `<label class="mc-person"><input type="checkbox" name="att" value="${esc(pkey(x.id))}" ${att.has(pkey(x.id)) || (pkey(x.id) === me) ? 'checked' : ''} ${pkey(x.id) === (m.org || me) ? 'disabled' : ''}>${avatar(x, 22)} ${esc(x.name)}${pkey(x.id) === (m.org || me) ? ' <small class="muted">(organiser)</small>' : ''}</label>`).join('')}</div></label>
    <label class="pd-f"><span>Location</span><input name="loc" value="${esc(m.loc)}" placeholder="Room or address" autocomplete="off"></label>
    <div class="mc-maps"><button type="button" class="btn ghost xs" data-act="mcMap" data-svc="google">${icon('pin', 12)} Google Maps</button><button type="button" class="btn ghost xs" data-act="mcMap" data-svc="amap">${icon('pin', 12)} Amap 高德地图</button></div>
    <label class="pd-f"><span>Video call link</span><input name="link" type="url" value="${esc(m.link)}" placeholder="https://teams.microsoft.com/…" autocomplete="off"></label>
    ${m.link ? `<a class="btn ghost sm mc-join" href="${esc(m.link)}" target="_blank" rel="noopener">${icon('send', 13)} Join call</a>` : ''}
    <label class="pd-f"><span>Notes</span><textarea name="notes" rows="3" placeholder="Agenda, documents">${esc(m.notes)}</textarea></label>
    <div class="mc-colors" role="radiogroup" aria-label="Colour">${MC_COLORS.map((c, i) => `<label style="--ec:${c}"><input type="radio" name="color" value="${c}" ${(m.color || MC_COLORS[0]) === c ? 'checked' : ''} aria-label="Colour ${i + 1}"><i></i></label>`).join('')}</div>
    <div class="row">${mcAll().some((x) => x.id === m.id) ? `<button type="button" class="btn ghost sm danger" data-act="mcDelete" data-id="${esc(m.id)}">${icon('trash', 13)} Delete</button>` : ''}<span class="spacer"></span><button class="btn primary">Save</button></div>
  </form>`;
}
function mcOpen(m) {
  $$('dialog.mc-dlg').forEach((d) => d.close());
  const d = showDialog({ title: mcAll().some((x) => x.id === m.id) ? 'Meeting' : 'New meeting', html: mcFormHTML(m) });
  d?.classList?.add('mc-dlg');
  setTimeout(() => $('dialog.mc-dlg [name=title]')?.focus(), 30);
}
const mcDraft = (date, start) => mcNorm({ id: uid(), date, start, end: Math.min(1440, start + 60), org: pkey(S.meId), att: [pkey(S.meId)], tz: tzNow() });
/** "= 3:00 pm Thu 19 Nov in Auckland (your time now)" when the meeting's zone isn't the one you're in. */
function mcTzNote(date, start, tz) {
  if (!date || start === null || !tz || tz === tzNow()) return '';
  const l = tzConvert(date, start, tz, tzNow());
  return `= ${mcFmt(l.min)}${l.date !== date ? ` ${dayLabel(l.date)}` : ''} in ${tzCity(tzNow())} (your time now)`;
}

Object.assign(actions, {
  mcView: (el) => { mcState().view = el.dataset.v; render(); },
  mcToday: () => { mcState().date = todayISO(); render(); mcScrollToNow(); },
  mcStep: (el) => { const s = mcState(); const n = Number(el.dataset.d); if (s.view === 'month') { const d = new Date(`${s.date.slice(0, 7)}-01T12:00:00`); d.setMonth(d.getMonth() + n); s.date = d.toISOString().slice(0, 10); } else s.date = mcAddDays(s.date, n * (s.view === 'day' ? 1 : 7)); render(); },
  mcGoDay: (el) => { const s = mcState(); s.date = el.dataset.d; s.view = 'day'; render(); },
  mcNew: () => { const n = new Date(); mcOpen(mcDraft(mcState().view === 'month' ? todayISO() : mcState().date, Math.min(1380, (n.getHours() + 1) * 60))); },
  mcDelete: async (el) => {
    const m = mcAll().find((x) => x.id === el.dataset.id);
    if (!m || !mcCanEdit(m) || !await confirmDlg(`Delete “${m.title || 'this meeting'}”?`, 'It goes from everyone\'s calendar.', 'Delete')) return;
    const p = mcPlan(true);
    p.meetings = mcAll().filter((x) => x !== m);
    mcDirty();
    $$('dialog.mc-dlg').forEach((d) => d.close());
    commit();
    toast('Meeting deleted.');
  },
});
Object.assign(changes, { mcAll: (el) => { mcState().all = el.checked; render(); } });
Object.assign(submits, {
  mcSave: (form, data) => {
    const p = mcPlan(true);
    const old = mcAll().find((x) => x.id === form.dataset.id);
    if (old && !mcCanEdit(old)) return;
    const start = mcMin(data.get('start'));
    let end = mcMin(data.get('end'));
    if (end !== null && start !== null && end <= start) end = Math.min(1440, start + 30);
    const org = old?.org || pkey(S.meId);
    const m = mcNorm({ ...(old || {}), id: form.dataset.id, title: String(data.get('title') || '').trim(), date: data.get('date'), start, end, org, att: [...new Set([org, ...data.getAll('att')])], tz: data.get('tz') || tzNow(), loc: data.get('loc'), link: data.get('link'), notes: data.get('notes'), color: data.get('color'), at: Date.now() });
    if (!m) { toast('Pick a date.'); return; }
    if (old) Object.assign(old, m); else mcAll().push(m);
    mcDirty();
    $$('dialog.mc-dlg').forEach((d) => d.close());
    mcState().date = m.date;
    commit();
    toast(old ? 'Meeting saved.' : `Meeting added${m.att.length > 1 ? ` for ${m.att.length} people` : ''}.`);
  },
});
function mcScrollToNow() {
  setTimeout(() => { const b = $('.mc-body'); if (b) b.scrollTop = Math.max(0, ((new Date().getHours() - 1.5) * MC_H)); }, 30);
}

// ---------- Click and drag on the grid ----------
let mcDrag = null;
document.addEventListener('pointerdown', (e) => {
  if (ui.route?.view !== 'meet' || e.button !== 0) return;
  const ev = e.target.closest?.('[data-mc-ev]');
  const col = e.target.closest?.('[data-mc-day]');
  if (ev) {
    const m = mcShown().find((x) => x.id === ev.dataset.mcEv) || mcAll().find((x) => x.id === ev.dataset.mcEv);
    mcDrag = { el: ev, m, x: e.clientX, y: e.clientY, on: false, touch: e.pointerType !== 'mouse', grid: !!col };
    if (mcDrag.touch && mcDrag.grid && mcCanEdit(m)) mcDrag.hold = setTimeout(() => { if (mcDrag) { mcDrag.on = true; mcDrag.el.classList.add('dragging'); navigator.vibrate?.(10); } }, 300);
  } else if (col) {
    mcDrag = { new: true, col, x: e.clientX, y: e.clientY, on: false, touch: e.pointerType !== 'mouse' };
  } else if (e.target.closest?.('[data-mc-mday]') && !e.target.closest('button')) {
    mcDrag = { mnew: e.target.closest('[data-mc-mday]').dataset.mcMday, x: e.clientX, y: e.clientY };
  }
});
const mcMinAt = (col, y) => Math.max(0, Math.min(1440 - 15, Math.round((((y - col.getBoundingClientRect().top) / MC_H) * 60) / 15) * 15));
document.addEventListener('pointermove', (e) => {
  const d = mcDrag;
  if (!d || d.new || d.mnew || !d.m) return;
  if (!d.on) {
    if (Math.hypot(e.clientX - d.x, e.clientY - d.y) < 6) return;
    // On a phone a swipe scrolls; press and hold first to drag.
    if (d.touch) { clearTimeout(d.hold); mcDrag = null; return; }
    if (!d.grid || !mcCanEdit(d.m)) return;
    d.on = true;
    d.el.classList.add('dragging');
  }
  e.preventDefault();
  const col = document.elementsFromPoint(e.clientX, e.clientY).find((n) => n.dataset?.mcDay);
  if (!col) return;
  const len = d.m.end - d.m.start;
  const grab = d.grabOff ?? (d.grabOff = Math.round(((d.y - d.el.getBoundingClientRect().top) / MC_H) * 60));
  const start = Math.max(0, Math.min(1440 - len, Math.round((mcMinAt(col, e.clientY) - grab) / 15) * 15 + 0));
  d.to = { date: col.dataset.mcDay, start };
  if (d.el.parentElement !== col) col.append(d.el);
  Object.assign(d.el.style, { top: `${(start / 60) * MC_H}px`, left: '2px', width: 'calc(100% - 4px)' });
  d.el.querySelector('small').textContent = `${mcFmt(start)} – ${mcFmt(start + len)}`;
}, { passive: false });
document.addEventListener('touchmove', (e) => { if (mcDrag?.on) e.preventDefault(); }, { passive: false });
document.addEventListener('pointerup', (e) => {
  const d = mcDrag;
  mcDrag = null;
  if (!d) return;
  clearTimeout(d.hold);
  if (d.mnew) { if (Math.hypot(e.clientX - d.x, e.clientY - d.y) < 6) mcOpen(mcDraft(d.mnew, 540)); return; }
  if (d.new) {
    if (Math.hypot(e.clientX - d.x, e.clientY - d.y) < 6 && !e.target.closest?.('[data-mc-ev]')) mcOpen(mcDraft(d.col.dataset.mcDay, mcMinAt(d.col, e.clientY)));
    return;
  }
  if (!d.on) { if (Math.hypot(e.clientX - d.x, e.clientY - d.y) < 6 && d.m) mcOpen(d.m._o || d.m); return; }
  const stop = (ev) => { ev.stopPropagation(); ev.preventDefault(); };
  window.addEventListener('click', stop, { capture: true, once: true });
  setTimeout(() => window.removeEventListener('click', stop, { capture: true }), 50);
  if (!d.to || (d.to.date === d.m.date && d.to.start === d.m.start)) { render(); return; }
  const real = d.m._o || d.m;
  const len = real.end - real.start;
  const before = { date: real.date, start: real.start, end: real.end };
  const at = tzConvert(d.to.date, d.to.start, tzNow(), mcZone(real));
  Object.assign(real, { date: at.date, start: at.min, end: Math.min(1440, at.min + len), at: Date.now() });
  mcDirty();
  commit();
  toast(`Moved to ${dayLabel(d.to.date)}, ${mcFmt(d.to.start)}.`, { undo: () => { Object.assign(real, before, { at: Date.now() }); mcDirty(); commit(); } });
});
document.addEventListener('pointercancel', () => { if (mcDrag) { clearTimeout(mcDrag.hold); mcDrag = null; render(); } });

// Open on the current time the first time the page shows.
const origRenderMc = render;
// eslint-disable-next-line no-global-assign
render = function renderWithMeetCal() {
  const first = ui.route?.view === 'meet' && !ui.mcShown;
  const out = origRenderMc.apply(this, arguments);
  if (ui.route?.view === 'meet') { if (first) { ui.mcShown = true; mcScrollToNow(); } } else ui.mcShown = false;
  return out;
};

// ---------- Time zone and map actions ----------
function mcTzMenuHTML() {
  return `<div class="picker mc-tzpick"><h4>Time zones</h4>
    <p class="small">Now: <b>${esc(tzLabel(tzNow()))}</b> <span class="muted">(this device)</span></p>
    <label class="pd-f"><span>Home time zone</span>${tzSelectHTML('home', tzHome(), 'data-change="mcHomeTz"')}</label>
    <p class="small muted">Meetings show in the time zone you are in now. Each meeting keeps the zone it was set in, so it stays at the right moment when you travel.</p></div>`;
}
Object.assign(actions, {
  mcTzMenu: (el) => openPop(el, mcTzMenuHTML),
  mcMap: (el) => {
    const q = String(el.closest('form')?.querySelector('[name="loc"]')?.value || '').trim();
    if (!q) { toast('Type the place in Location first.', { error: true }); return; }
    const url = el.dataset.svc === 'amap' ? `https://uri.amap.com/search?keyword=${encodeURIComponent(q)}` : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
    window.open(url, '_blank', 'noopener');
  },
});
Object.assign(changes, {
  mcHomeTz: (el) => { if (tzValid(el.value)) { S.settings.homeTz = el.value; Store.save(); closePop(); render(); } },
  mcTzField: (el) => {
    const f = el.closest('form');
    const note = f.querySelector('.mc-tznote');
    if (note) note.textContent = mcTzNote(f.querySelector('[name="date"]').value, twMin(f.querySelector('[name="start"]').value), el.value);
  },
});
