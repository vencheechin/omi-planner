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
/** Each person's notifications for an event: { personKey: [minutes before, ...] } (0 = at the time). */
function mcNormAl(al) {
  if (!al || typeof al !== 'object') return {};
  const out = {};
  for (const [k, v] of Object.entries(al)) if (typeof k === 'string' && Array.isArray(v)) out[k.slice(0, 120)] = [...new Set(v.map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n <= 86400))].sort((a, b) => a - b).slice(0, 8);
  return out;
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
    al: mcNormAl(m.al),
    gal: [...new Set((Array.isArray(m.gal) ? m.gal : []).map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n <= 86400))].sort((a, b) => a - b).slice(0, 8),
    mapUrl: /^https?:\/\/\S+$/i.test(String(m.mapUrl || '')) ? String(m.mapUrl).slice(0, 500) : '',
    geo: m.geo && Number.isFinite(Number(m.geo.lat)) && Number.isFinite(Number(m.geo.lon)) ? { lat: Number(m.geo.lat), lon: Number(m.geo.lon) } : null,
    cal: typeof m.cal === 'string' ? m.cal.slice(0, 40) : '',
    pm: typeof m.pm === 'string' ? m.pm.slice(0, 40) : '',
    kind: m.kind === 'birthday' || m.kind === 'reminder' ? m.kind : 'event',
    ...(typeof m.block === 'boolean' ? { block: m.block } : (!m.kind || m.kind === 'meeting') ? { block: true } : {}),
    rep: MC_REPS.some(([v]) => v === m.rep) || m.rep === 'custom' ? m.rep : '',
    rc: m.rep === 'custom' ? mcNormRc(m.rc) : null,
    by: Number.isInteger(Number(m.by)) && Number(m.by) > 1900 && Number(m.by) < 2200 ? Number(m.by) : null,
    files: (Array.isArray(m.files) ? m.files : []).filter((f) => f && typeof f.id === 'string').slice(0, 30).map((f) => ({ id: f.id.slice(0, 40), name: String(f.name || 'File').slice(0, 200), size: Number(f.size) || 0, type: String(f.type || '').slice(0, 100), ...(typeof f.thumb === 'string' && f.thumb.length < 60000 ? { thumb: f.thumb } : {}) })),
  };
}
const mcAll = () => { const p = mcPlan(); return p ? (p.meetings = Array.isArray(p.meetings) ? p.meetings : []) : []; };
const mcMine = (m) => m.org === pkey(S.meId) || m.att.includes(pkey(S.meId)) || !!(m.cal && typeof mcCalById === 'function' && mcCalById(m.cal) && mcCalMember(mcCalById(m.cal)));
/** A meeting on this device's clock (a copy, with _o pointing at the real one) when its zone differs. */
const mcZone = (m) => m.tz || tzHome();
function mcLocal(m) {
  if (mcAllDay(m)) return m;
  const from = mcZone(m);
  const to = tzNow();
  if (from === to) return m;
  const a = tzConvert(m.date, m.start, from, to);
  const b = tzConvert(m.date, m.end, from, to);
  const end = b.date === a.date ? b.min : 1440;
  return { ...m, date: a.date, start: a.min, end: Math.max(a.min + 15, end), _o: m };
}
const mcShown = () => mcAll().filter((m) => (mcMine(m) && !mcHiddenCal(m)) || mcTeamWho(m)).map(mcLocal);
/** Everyone who reports to you, directly or further down (Albus → Ray → Ven: Ven gets both). */
const mcTeam = () => (typeof hierarchyOn === 'function' && hierarchyOn() ? S.people.filter((p) => pkey(p.id) !== pkey(S.meId) && isAbove(S.meId, p.id)) : []);
/** The team calendars you ticked in Calendars › My team (only people who still report to you). */
const mcTeamOn = () => { const ok = new Set(mcTeam().map((p) => pkey(p.id))); return (Array.isArray(S.settings.mcTeam) ? S.settings.mcTeam : []).filter((k) => ok.has(k)); };
/** For an item that isn't yours: the ticked team member it belongs to (organiser first), else null. */
const mcTeamWho = (m) => { if (mcMine(m)) return null; const on = mcTeamOn(); if (!on.length) return null; const k = on.includes(m.org) ? m.org : m.att.find((a) => on.includes(a)); return k ? personByKey(k) || null : null; };
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
// The calendar is Schedule only (Day, Week and Month were taken out); the older views' code stays unused.
function mcState() { ui.mc = ui.mc || { date: todayISO() }; ui.mc.view = 'schedule'; return ui.mc; }
function mcTitle() {
  const s = mcState();
  const d = new Date(`${s.date}T12:00:00`);
  if (s.view === 'month' || s.view === 'schedule') return `${MC_MON[d.getMonth()]} ${d.getFullYear()}`;
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
  const h = mcKind(m) === 'reminder' ? 22 : Math.max(18, ((m.end - m.start) / 60) * MC_H - 2);
  const who = m.att.length + (m.att.includes(m.org) ? 0 : 1);
  return `<button class="mc-ev ${h < 34 ? 'short' : ''}" data-mc-ev="${esc(m.id)}" style="top:${top}px;height:${h}px;left:calc(${(lane / n) * 100}% + 2px);width:calc(${100 / n}% - 4px);--ec:${m.color || MC_COLORS[0]}">
    <b>${mcIconHTML(m)}${esc(m.title || '(No title)')}</b><small>${esc(mcFmt(m.start))} – ${esc(mcFmt(m.end))}${m._o ? ` · ${esc(tzCity(mcZone(m._o)))} ${esc(mcFmt(m._o.start))}` : ''}${m.loc ? ` · ${esc(mcIsLink(m.loc) ? 'Map link' : m.loc)}` : ''}${who > 1 ? ` · ${who} people` : ''}${mcTeamWho(m) ? ` · ${esc(mcTeamWho(m).name)}` : ''}</small></button>`;
}
function mcGridHTML(days) {
  const today = todayISO();
  const shown = mcShown();
  const hols = days.map((d) => holidaysOn(d));
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
  return `<div class="mc-grid" style="--mc-days:${days.length}">
    <div class="mc-head"><div class="mc-gut"></div>${days.map((d) => { const dt = new Date(`${d}T12:00:00`); return `<button class="mc-dh ${d === today ? 'today' : ''}" data-act="mcGoDay" data-d="${d}"><small>${MC_DAY[mcDow(d)]}</small><b>${dt.getDate()}</b></button>`; }).join('')}</div>
    <div class="mc-allday"><div class="mc-gut"><small>All day</small></div>${days.map((d, i) => `<div class="mc-ad">${hols[i].map((h) => `<span class="mc-hol mc-${h.kind}" title="${esc(holLabel(h))}">${esc(holLabel(h))}</span>`).join('')}${mcOn(shown, d).filter(mcAllDay).map((m) => `<button class="mc-hol mc-bday" data-mc-ev="${esc(m.id)}" style="--ec:${m.color || MC_COLORS[7]}">${esc(mcAllDayText(m, d))}</button>`).join('')}</div>`).join('')}</div>
    <div class="mc-body" data-scroll="mc-body"><div class="mc-inner" style="height:${24 * MC_H}px">
      <div class="mc-gut mc-hours">${Array.from({ length: 24 }, (_, hr) => `<span style="top:${hr * MC_H}px">${hr ? fmtTime(hr * 60).replace(':00', '') : ''}</span>`).join('')}</div>
      ${days.map((d, i) => `<div class="mc-col ${d === today ? 'today' : ''} ${hols[i].some((h) => h.kind === 'pub') ? 'pubhol' : ''}" data-mc-day="${d}">
        ${mcLanes(mcOn(shown, d).filter((m) => !mcAllDay(m))).map(mcEventHTML).join('')}
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
      const ms = mcOn(shown, d).sort((a, b) => (mcAllDay(b) - mcAllDay(a)) || a.start - b.start);
      const hs = holidaysOn(d);
      const items = [...hs.map((h) => `<span class="mc-hol mc-${h.kind}" title="${esc(holLabel(h))}">${esc(holLabel(h))}</span>`), ...ms.map((m) => `<button class="mc-chip" data-mc-ev="${esc(m.id)}" style="--ec:${m.color || MC_COLORS[0]}"><i></i>${mcAllDay(m) ? esc(mcAllDayText(m, d)) : `${esc(mcFmt(m.start))} ${esc(mcIcon(m))}${esc(m.title || '(No title)')}${mcTeamWho(m) ? ` · ${esc(mcTeamWho(m).name.split(/\s+/)[0])}` : ''}`}</button>`)];
      return `<div class="mc-mc ${d.slice(0, 7) !== s.date.slice(0, 7) ? 'other' : ''} ${d === today ? 'today' : ''} ${hs.some((h) => h.kind === 'pub') ? 'pubhol' : ''}" data-mc-mday="${d}">
        <button class="mc-mnum" data-act="mcGoDay" data-d="${d}">${Number(d.slice(8))}</button>
        ${items.slice(0, 4).join('')}${items.length > 4 ? `<button class="mc-more" data-act="mcGoDay" data-d="${d}">${items.length - 4} more</button>` : ''}</div>`;
    }).join('')}</div></div>`;
}
function renderMeetCal() {
  const s = mcState();
  const days = s.view === 'day' ? [s.date] : Array.from({ length: 7 }, (_, i) => mcAddDays(mcWeekStart(s.date), i));
  return `<div class="page mc-page">
    <header class="mc-top mc-bar">
      <button class="mc-title mc-title-btn ${ui.mcMini ? 'open' : ''}" data-act="mcMiniToggle" aria-expanded="${!!ui.mcMini}" title="Show or hide the month">${esc(mcTitle())}${icon('chevD', 16)}</button>
      <span class="mc-nav"><button class="icon-btn" data-act="mcStep" data-d="-1" aria-label="Previous month">${icon('chevL')}</button><button class="icon-btn" data-act="mcStep" data-d="1" aria-label="Next month">${icon('chevR')}</button></span>
      <span class="spacer"></span>
      <button class="icon-btn mc-todaybtn" data-act="mcToday" aria-label="Today" title="Today"><span class="mc-tday">${Number(todayISO().slice(8))}</span></button>
      <button class="icon-btn mc-set" data-act="mcSettings" aria-label="Schedule settings" title="Time zone, calendars and holidays">${icon('gear', 20)}</button>
    </header>
    ${s.view === 'schedule' ? mcSchedHTML() : s.view === 'month' ? mcMonthHTML() : mcGridHTML(days)}
  </div>`;
}

// ---------- Create and edit ----------
function mcFormHTML(m) {
  const me = pkey(S.meId);
  const att = new Set(m.att);
  const kind = mcKind(m);
  return `<form class="mc-form" data-submit="mcSave" data-id="${esc(m.id)}" data-kind="${kind}">
    <input type="hidden" name="kind" value="${kind}"><div class="seg mc-kinds" role="group" aria-label="Type" ${mcAll().some((x) => x.id === m.id) ? 'hidden' : ''}>${MC_KINDS.map(([k, l, ic]) => `<button type="button" class="${k === kind ? 'on' : ''}" data-act="mcKind" data-v="${k}">${icon(ic, 14)} ${l}</button>`).join('')}</div>
    ${mcCalPickHTML(m)}
    <div class="mc-titlerow"><input class="mc-tin" name="title" value="${esc(m.title)}" placeholder="${esc(MC_TITLE_HINT[kind])}" aria-label="Title" autocomplete="off" data-focus="mc-title"><a class="mc-mapbtn" href="${esc(mcMapUrl(m.mapUrl, m.loc))}" target="_blank" rel="noopener" title="Open the location in Google Maps" ${m.loc && mcKind(m) === 'event' ? '' : 'hidden'}>${icon('pin', 14)} Google Maps</a></div>
    <div class="mc-when"><input type="date" name="date" value="${esc(m.date)}" aria-label="Date" required><span class="mc-k-timed">${wheelTimeHTML('start', m.start, 'Start')}</span><span class="mc-k-ev">–</span><span class="mc-k-ev">${wheelTimeHTML('end', m.end, 'End')}</span><label class="mc-k-bd mc-by"><span>Year born</span><input name="by" inputmode="numeric" maxlength="4" value="${m.by || ''}" placeholder="optional"></label></div>
    <p class="mc-k-bd small muted mc-yearly">${icon('cake', 12)} Repeats every year${m.by ? ` · turns ${mcAge(m, m.date)}` : ''}</p>
    <label class="mc-k-rep mc-rep"><span>Repeat</span><select name="rep" data-prev="${esc(m.rep || '')}">${MC_REPS.map(([v, l]) => `<option value="${v}" ${(m.rep || '') === v ? 'selected' : ''}>${l}</option>`).join('')}<option value="custom" ${m.rep === 'custom' ? 'selected' : ''}>${m.rep === 'custom' ? esc(mcRcText(m.rc, m.date)) : 'Custom…'}</option></select><input type="hidden" name="rc" value="${esc(JSON.stringify(m.rc || null))}"></label>
    <label class="mc-k-ev mc-block"><input type="checkbox" name="block" value="1" ${mcBlocks(m) ? 'checked' : ''}> Block this time in my Time Box</label>
    <details class="mc-tzd mc-k-timed" ${(m.tz || tzNow()) !== tzNow() ? 'open' : ''}><summary>${icon('gear', 13)} Time zone · ${esc(tzCity(m.tz || tzNow()))}</summary><label class="pd-f mc-tzf">${tzSelectHTML('tz', m.tz || tzNow(), 'data-change="mcTzField"')}<small class="muted mc-tznote">${mcTzNote(m.date, m.start, m.tz || tzNow())}</small></label></details>
    <div class="pd-f"><span>${mcIsOrg(m) ? 'Notifications' : 'Your notifications'}</span><div class="mc-alerts">${mcAlertsFor(m).map((n) => mcAlertRow(n)).join('')}</div><button type="button" class="btn ghost xs mc-al-add" data-act="mcAlertAdd">${icon('plus', 12)} Add notification</button></div>
    ${mcIsOrg(m) ? `<div class="pd-f mc-k-ev mc-gal"><span>Notify guests <small class="muted">(optional)</small></span><div class="mc-alerts" data-name="gal">${(m.gal || []).map((n) => mcAlertRow(n, 'gal')).join('')}</div><button type="button" class="btn ghost xs mc-al-add" data-act="mcAlertAdd">${icon('plus', 12)} Add guest notification</button></div>` : ''}
    <div class="pd-f mc-guests mc-k-ev"><div class="mc-gin">${icon('guests', 18)}<input class="mc-gq" placeholder="Add guests" autocomplete="off" aria-label="Add guests: type a name or email" data-mc-guest></div>
      <div class="mc-gchips">${m.att.filter((k) => k !== (m.org || me)).map(mcGuestChip).join('')}</div><div class="mc-gsug" role="listbox" hidden></div></div>
    <div class="pd-f mc-k-ev mc-locf"><span>Location</span><input name="loc" value="${esc(m.loc)}" placeholder="Search an address, or pick a saved location" autocomplete="off" data-mc-loc><div class="mc-locsug" role="listbox" hidden></div></div>
    <input type="hidden" name="mapUrl" value="${esc(m.mapUrl || '')}"><input type="hidden" name="geo" value="${m.geo ? `${m.geo.lat},${m.geo.lon}` : ''}"><div class="mc-maps mc-k-ev"><button type="button" class="btn ghost xs" data-act="mcPlacePick" title="Choose one of your saved locations">${icon('pin', 12)} Saved Locations</button><button type="button" class="btn ghost xs" data-act="mcPlaceSave" title="Save this location for next time">${icon('star', 12)} Save Location</button></div>
    <p class="mc-travel mc-k-ev small" hidden></p>

    <label class="pd-f mc-k-ev"><span>Video call link</span><input name="link" type="url" value="${esc(m.link)}" placeholder="https://teams.microsoft.com/…" autocomplete="off"></label>
    ${m.link ? `<a class="btn ghost sm mc-join" href="${esc(m.link)}" target="_blank" rel="noopener">${icon('send', 13)} Join call</a>` : ''}
    <div class="pd-f mc-files mc-k-ev"><span>Attachments</span><input type="hidden" name="files" value="${esc(JSON.stringify(m.files || []))}"><div class="mc-flist">${(m.files || []).map(mcFileChip).join('')}</div>
      <div class="mc-drop" data-mc-drop>${icon('clip', 15)} <span>Drop files here or</span> <button type="button" class="btn ghost xs" data-act="mcFileAdd">${icon('upload', 12)} Upload</button></div></div>
    <label class="pd-f"><span>Notes</span><textarea name="notes" rows="3" placeholder="${esc(MC_NOTE_HINT[kind])}">${esc(m.notes)}</textarea></label>
    <div class="mc-colors" role="radiogroup" aria-label="Colour">${MC_COLORS.map((c, i) => `<label style="--ec:${c}"><input type="radio" name="color" value="${c}" ${(m.color || MC_COLORS[0]) === c ? 'checked' : ''} aria-label="Colour ${i + 1}"><i></i></label>`).join('')}</div>
    <div class="row">${mcAll().some((x) => x.id === m.id) ? `<button type="button" class="btn ghost sm danger" data-act="mcDelete" data-id="${esc(m.id)}">${icon('trash', 13)} Delete</button>` : ''}<span class="spacer"></span><button class="btn primary">Save</button></div>
  </form>`;
}
function mcOpen(m) {
  $$('dialog.mc-dlg').forEach((d) => d.close());
  const d = showDialog({ title: mcAll().some((x) => x.id === m.id) ? '' : 'New', html: mcFormHTML(m) });
  d?.classList?.add('mc-dlg');
  mcBdLabels(d?.querySelector?.('form'));
  setTimeout(() => $('dialog.mc-dlg [name=title]')?.focus(), 30);
}
const mcDraft = (date, start) => mcNorm({ id: uid(), kind: 'event', date, start, end: Math.min(1440, start + 60), org: pkey(S.meId), att: [pkey(S.meId)], tz: tzNow() });
/** "= 3:00 pm Thu 19 Nov in Auckland (your time now)" when the meeting's zone isn't the one you're in. */
function mcTzNote(date, start, tz) {
  if (!date || start === null || !tz || tz === tzNow()) return '';
  const l = tzConvert(date, start, tz, tzNow());
  return `= ${mcFmt(l.min)}${l.date !== date ? ` ${dayLabel(l.date)}` : ''} in ${tzCity(tzNow())} (your time now)`;
}

Object.assign(actions, {
  mcView: (el) => { mcState().view = el.dataset.v; render(); if (el.dataset.v === 'schedule') mcSchScrollTo(todayISO()); },
  mcToday: () => { mcState().date = todayISO(); render(); if (mcState().view !== 'schedule') mcScrollToNow(); },
  mcStep: (el) => { const s = mcState(); const n = Number(el.dataset.d); if (s.view === 'month' || s.view === 'schedule') { const d = new Date(`${s.date.slice(0, 7)}-01T12:00:00`); d.setMonth(d.getMonth() + n); s.date = d.toISOString().slice(0, 10); } else s.date = mcAddDays(s.date, n * (s.view === 'day' ? 1 : 7)); render(); },
  mcGoDay: (el) => { const s = mcState(); s.date = el.dataset.d; s.view = 'day'; render(); },
  mcNew: () => { const n = new Date(); mcOpen(mcDraft(mcState().view === 'month' ? todayISO() : mcState().date, Math.min(1380, (n.getHours() + 1) * 60))); },
  mcDelete: async (el) => {
    const m = mcAll().find((x) => x.id === el.dataset.id);
    if (!m || !mcCanEdit(m)) return;
    if (await mcToBin(m)) $$('dialog.mc-dlg').forEach((d) => d.close());
  },
});

Object.assign(submits, {
  mcSave: (form, data) => {
    const p = mcPlan(true);
    const old = mcAll().find((x) => x.id === form.dataset.id);
    if (old && !mcCanEdit(old)) return;
    const start = mcMin(data.get('start'));
    let end = mcMin(data.get('end'));
    if (end !== null && start !== null && end <= start) end = Math.min(1440, start + 30);
    const org = old?.org || pkey(S.meId);
    const m = mcNorm({ ...(old || {}), id: form.dataset.id, title: String(data.get('title') || '').trim(), date: data.get('date'), start, end, org, att: [...new Set([org, ...data.getAll('att')])], tz: data.get('tz') || tzNow(), mapUrl: data.get('mapUrl') || '', geo: (() => { const [lat, lon] = String(data.get('geo') || '').split(',').map(Number); return Number.isFinite(lat) && Number.isFinite(lon) && data.get('geo') ? { lat, lon } : null; })(), cal: data.get('cal') || '', kind: data.get('kind') || 'event', block: data.get('block') === '1', rep: data.get('kind') === 'birthday' ? 'yearly' : (data.get('rep') || ''), rc: (() => { try { return JSON.parse(data.get('rc') || 'null'); } catch { return null; } })(), by: data.get('kind') === 'birthday' ? data.get('by') : null, files: (() => { try { return JSON.parse(data.get('files') || '[]'); } catch { return []; } })(), al: { ...(old?.al || {}), [pkey(S.meId)]: mcAlertSave(data.getAll('al')) }, gal: (!old || old.org === pkey(S.meId)) ? mcGalSave(data.getAll('gal').map(Number)) : (old.gal || []), loc: data.get('loc'), link: data.get('link'), notes: data.get('notes'), color: data.get('color'), at: Date.now() });
    if (!m) { toast('Pick a date.'); return; }
    if (old) Object.assign(old, m); else mcAll().push(m);
    mcDirty();
    $$('dialog.mc-dlg').forEach((d) => d.close());
    mcState().date = m.date;
    commit();
    toast(old ? 'Event saved.' : `Event added${m.att.length > 1 ? ` for ${m.att.length} people` : ''}.`);
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
    if (m && (m.rep || mcAllDay(m))) mcDrag.grid = false;
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
    if (!mcCanEdit(d.m)) return;
    d.on = true;
    d.el.classList.add('dragging');
    document.body.classList.add('dragging');
  }
  e.preventDefault();
  // Over the recycle bin?
  $$('.side-bin.over').forEach((n) => n.classList.remove('over'));
  const bin = document.elementsFromPoint(e.clientX, e.clientY).find((n) => n.classList?.contains('side-bin'));
  d.toBin = !!bin;
  if (bin) { bin.classList.add('over'); return; }
  if (!d.grid) { Object.assign(d.el.style, { position: 'fixed', left: `${e.clientX - 20}px`, top: `${e.clientY - 12}px`, zIndex: 50, pointerEvents: 'none', width: `${d.el.offsetWidth}px` }); return; }
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
  if (!d.on) { if (Math.hypot(e.clientX - d.x, e.clientY - d.y) < 6 && d.m) mcPeek(d.m._o || d.m, d.m.date); return; }
  const stop = (ev) => { ev.stopPropagation(); ev.preventDefault(); };
  window.addEventListener('click', stop, { capture: true, once: true });
  setTimeout(() => window.removeEventListener('click', stop, { capture: true }), 50);
  document.body.classList.remove('dragging');
  $$('.side-bin.over').forEach((n) => n.classList.remove('over'));
  if (d.toBin) { render(); mcToBin(d.m._o || d.m); return; }
  if (!d.grid) { render(); return; }
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
document.addEventListener('pointercancel', () => { if (mcDrag) { clearTimeout(mcDrag.hold); mcDrag = null; document.body.classList.remove('dragging'); render(); } });

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

});
Object.assign(changes, {
  mcHomeTz: (el) => { if (tzValid(el.value)) { S.settings.homeTz = el.value; Store.save(); closePop(); render(); } },
  mcTzField: (el) => {
    const f = el.closest('form');
    const note = f.querySelector('.mc-tznote');
    if (note) note.textContent = mcTzNote(f.querySelector('[name="date"]').value, twMin(f.querySelector('[name="start"]').value), el.value);
  },
});

// ---------- Event notifications ----------
// Each person sets their own: at the time of the event, or a while before, several per event.
// New events start with your default notifications (Settings › Calendar). "Add notification" offers
// your three most used, or Custom (a number and minutes / hours / days / weeks on wheels).
const MC_AL = [[0, 'At time of event'], [5, '5 minutes before'], [10, '10 minutes before'], [15, '15 minutes before'], [30, '30 minutes before'], [60, '1 hour before'], [120, '2 hours before'], [1440, '1 day before'], [2880, '2 days before'], [10080, '1 week before']];
const MC_UNITS = [['minutes', 1], ['hours', 60], ['days', 1440], ['weeks', 10080]];
function mcAlLabel(n) {
  const known = MC_AL.find(([v]) => v === n);
  if (known) return known[1];
  const [unit, size] = [...MC_UNITS].reverse().find(([, k]) => n % k === 0) || ['minutes', 1];
  const q = n / size;
  return `${q} ${q === 1 ? unit.slice(0, -1) : unit} before`;
}
const mcAlHist = () => (S.settings.mcAlHist = S.settings.mcAlHist && typeof S.settings.mcAlHist === 'object' ? S.settings.mcAlHist : { n: {}, last: null });
/** Your default notifications for a new event (Settings › Calendar). */
const mcAlDefault = () => (Array.isArray(S.settings.mcAlDefault) ? S.settings.mcAlDefault : [0]);
/** Your most used notifications (fill-ins when there isn't enough history yet). */
function mcAlTop(have, n = 3, guests = false) {
  // Guests: the ones you give guests most (30 minutes before first until there's history).
  const h = guests ? (S.settings.mcGalHist || {}) : (mcAlHist().n || {});
  const used = Object.entries(h).map(([k, c]) => [Number(k), c]).sort((a, b) => b[1] - a[1]).map(([k]) => k);
  return [...new Set([...used, ...(guests ? [30, 10, 60, 1440] : [10, 30, 60, 1440, 0])])].filter((v) => !have.includes(v)).slice(0, n);
}
const mcIsOrg = (m) => !m.org || m.org === pkey(S.meId) || !mcAll().some((x) => x.id === m.id);
function mcAlertsFor(m) {
  const mine = m.al?.[pkey(S.meId)];
  if (Array.isArray(mine)) return mine;
  if (!mcAll().some((x) => x.id === m.id)) return [...mcAlDefault()];
  return m.org === pkey(S.meId) ? [0] : [...(m.gal || [])];
}
function mcAlertRow(n, name = 'al') {
  const list = MC_AL.some(([v]) => v === n) ? MC_AL : [...MC_AL, [n, mcAlLabel(n)]].sort((a, b) => a[0] - b[0]);
  return `<div class="mc-al"><span class="mc-al-ic" aria-hidden="true">${icon('bell', 14)}</span><select name="${name}" aria-label="${name === 'gal' ? 'Guest notification' : 'Notification'}" data-prev="${n}">${list.map(([v, l]) => `<option value="${v}" ${v === n ? 'selected' : ''}>${l}</option>`).join('')}<option value="custom">Custom…</option></select><button type="button" class="icon-btn" data-act="mcAlertDel" aria-label="Remove notification">${icon('close', 12)}</button></div>`;
}
function mcAlertSave(vals) {
  const list = [...new Set(vals.map(Number).filter((n) => Number.isInteger(n) && n >= 0))].sort((a, b) => a - b);
  const h = mcAlHist();
  list.forEach((n) => { h.n[n] = (h.n[n] || 0) + 1; });
  if (list.length) h.last = list[list.length - 1];
  return list;
}
/** The default list in Settings is saved as soon as it changes. */
function mcAlDefSave(box) {
  if (!box?.classList.contains('mc-al-def')) return;
  S.settings.mcAlDefault = [...new Set([...box.querySelectorAll('select')].map((x) => Number(x.value)).filter((n) => Number.isInteger(n) && n >= 0))].sort((a, b) => a - b);
  Store.save();
}
function mcAlDefaultsHTML() {
  return `<p class="small muted">New events start with these. You can still change them on each event.</p><div class="mc-alerts mc-al-def">${mcAlDefault().map((n) => mcAlertRow(n)).join('')}</div><button type="button" class="btn ghost xs mc-al-add" data-act="mcAlertAdd">${icon('plus', 12)} Add notification</button>`;
}
function mcAlAddRow(box, v) {
  const have = [...box.querySelectorAll('select')].map((x) => Number(x.value));
  if (have.includes(v)) { toast('That notification is already there.', { keep: true }); return; }
  box.insertAdjacentHTML('beforeend', mcAlertRow(v, box.dataset.name || 'al'));
  mcAlDefSave(box);
}

// Custom: a number wheel and a unit wheel.
function mcAlCustomHTML() {
  const nums = Array.from({ length: 99 }, (_, i) => i + 1);
  return `<div class="picker tw-pick mc-alc"><div class="mc-alc-head"><button type="button" class="icon-btn" data-act="mcAlCustomCancel" aria-label="Cancel">${icon('close', 15)}</button><b>Custom</b><button type="button" class="btn primary sm" data-act="mcAlCustomOk" aria-label="Done">${icon('check', 15)}</button></div>
    <p class="mc-alc-sum">${icon('bell', 14)} <span></span></p>
    <div class="tw-wheels mc-alc-w"><div class="tw-col" data-col="n">${nums.map((n) => `<div class="tw-item" data-v="${n}">${n}</div>`).join('')}</div><div class="tw-col" data-col="u">${MC_UNITS.map(([u, k]) => `<div class="tw-item" data-v="${k}">${u}</div>`).join('')}</div><div class="tw-band" aria-hidden="true"></div></div>
    <div class="tw-type"><input inputmode="numeric" pattern="[0-9]*" maxlength="2" data-alc="n" placeholder="number" aria-label="Number"><small class="muted">or scroll</small></div></div>`;
}
function mcAlCustom(anchor, start, done) {
  const pop = openPop(anchor, mcAlCustomHTML);
  const cols = [...pop.querySelectorAll('.tw-col')];
  const [unit, size] = [...MC_UNITS].reverse().find(([, k]) => start > 0 && start % k === 0) || ['minutes', 1];
  const init = { n: start > 0 ? Math.min(99, start / size) : 30, u: size };
  // The highlighted item is the choice (scrolling and typing both move it).
  const val = () => Object.fromEntries(cols.map((c) => [c.dataset.col, Number((c.querySelector('.tw-item.on') || c.children[Math.max(0, Math.min(c.children.length - 1, Math.round(c.scrollTop / TW_ROW)))]).dataset.v)]));
  const show = () => { const v = val(); pop.querySelector('.mc-alc-sum span').textContent = mcAlLabel(v.n * v.u); };
  cols.forEach((col) => {
    const items = [...col.children];
    const i = Math.max(0, items.findIndex((x) => Number(x.dataset.v) === init[col.dataset.col]));
    col.scrollTop = i * TW_ROW;
    items.forEach((x, j) => x.classList.toggle('on', j === i));
    let t = null;
    col.addEventListener('scroll', () => { clearTimeout(t); t = setTimeout(() => { const idx = Math.round(col.scrollTop / TW_ROW); items.forEach((x, j) => x.classList.toggle('on', j === idx)); show(); }, 90); }, { passive: true });
    col.addEventListener('click', (e) => { const it = e.target.closest('.tw-item'); if (it) col.scrollTo({ top: items.indexOf(it) * TW_ROW, behavior: 'smooth' }); });
  });
  pop.querySelector('[data-alc="n"]').addEventListener('input', (e) => {
    e.target.value = e.target.value.replace(/\D/g, '').slice(0, 2);
    const n = Math.max(1, Math.min(99, Number(e.target.value) || 1));
    const col = cols[0];
    [...col.children].forEach((x, j) => x.classList.toggle('on', j === n - 1));
    col.scrollTop = (n - 1) * TW_ROW;
    show();
  });
  show();
  ui.mcAlc = { done, val };
}

Object.assign(actions, {
  mcAlertAdd: (el) => {
    const box = el.parentElement.querySelector('.mc-alerts');
    const have = [...box.querySelectorAll('select')].map((x) => Number(x.value));
    ui.mcAlBox = box;
    openPop(el, () => `<div class="menu mc-al-menu" role="menu"><h4>${box.dataset.name === 'gal' ? 'Notify guests' : 'Add notification'}</h4>${mcAlTop(have, 3, box.dataset.name === 'gal').map((v) => `<button role="menuitem" data-act="mcAlPick" data-v="${v}">${icon('bell', 13)} ${esc(mcAlLabel(v))}</button>`).join('')}<button role="menuitem" data-act="mcAlPickCustom">${icon('plus', 13)} Custom…</button></div>`);
  },
  mcAlPick: (el) => { closePop(); if (ui.mcAlBox) mcAlAddRow(ui.mcAlBox, Number(el.dataset.v)); },
  mcAlPickCustom: () => {
    const box = ui.mcAlBox;
    const anchor = box?.parentElement.querySelector('.mc-al-add');
    closePop();
    if (box && anchor) mcAlCustom(anchor, 30, (v) => mcAlAddRow(box, v));
  },
  mcAlCustomOk: () => { const c = ui.mcAlc; closePop(); if (c) { const v = c.val(); c.done(v.n * v.u); } ui.mcAlc = null; },
  mcAlCustomCancel: () => { const c = ui.mcAlc; closePop(); if (c?.cancel) c.cancel(); ui.mcAlc = null; },
  mcAlertDel: (el) => { const box = el.closest('.mc-alerts'); el.closest('.mc-al').remove(); mcAlDefSave(box); },
});
// A row's "Custom…" opens the wheels; the row keeps its old choice if you cancel.
document.addEventListener('change', (e) => {
  const sel = e.target;
  if (!sel.matches?.('.mc-al select')) return;
  const box = sel.closest('.mc-alerts');
  if (sel.value !== 'custom') { sel.dataset.prev = sel.value; mcAlDefSave(box); return; }
  const prev = Number(sel.dataset.prev) || 0;
  sel.value = String(prev);
  mcAlCustom(sel, prev, (v) => {
    if (![...sel.options].some((o) => o.value === String(v))) sel.insertAdjacentHTML('afterbegin', `<option value="${v}">${esc(mcAlLabel(v))}</option>`);
    sel.value = String(v);
    sel.dataset.prev = String(v);
    mcAlDefSave(box);
  });
});

/** Sends each of your event notifications once, when its time comes (while Planner is open). */
const MC_FIRED = 'planner-mc-fired';
function mcCheckAlerts() {
  if (typeof S === 'undefined' || !S || !mcPlan()) return;
  let fired = {};
  try { fired = JSON.parse(localStorage.getItem(MC_FIRED) || '{}'); } catch { fired = {}; }
  const now = Date.now();
  const me = pkey(S.meId);
  let rang = false;
  for (const m of mcAll()) {
    if (!mcMine(m)) continue;
    // Organiser: their own list (at the time if none). Guests: their own if they set one, else the organiser's guest notifications (none by default).
    const list = Array.isArray(m.al?.[me]) ? m.al[me] : m.org === me ? [0] : (m.gal || []);
    const dates = m.rep ? Array.from({ length: 10 }, (_, i) => mcAddDays(todayISO(), i - 1)).filter((d) => mcOccurs(m, d)) : [m.date];
    for (const occ of dates) for (const n of list) {
      const startMs = mcAllDay(m) ? new Date(`${occ}T09:00:00`).getTime() : tzToUtc(occ, m.start, mcZone(m));
      const at = startMs - n * 60000;
      const key = `${m.id}|${n}|${occ}|${m.start}`;
      if (fired[key] || at > now) continue;
      fired[key] = now;
      if (now - at > 60 * 60000) continue; // long gone (device was off): skip quietly
      const local = mcLocal(m);
      notify({ id: uid(), at: now, taskId: null, read: false, kind: 'review', route: '#/meet',
        text: mcAllDay(m) ? `${mcIcon(m)}${n < 1440 ? 'Today' : `In ${mcAlLabel(n).replace(' before', '')}`}: ${mcAllDayText(m, occ)}` : `${mcIcon(m)}${n === 0 ? 'Now' : `In ${mcAlLabel(n).replace(' before', '')}`}: ${m.title || 'Event'} · ${mcFmt(local.start)}${occ !== todayISO() ? ` ${dayLabel(occ)}` : ''}${m.loc ? ` · ${m.loc}` : ''}` });
      rang = true;
    }
  }
  // Forget keys older than two weeks.
  for (const [k, t] of Object.entries(fired)) if (now - t > 14 * 864e5) delete fired[k];
  try { localStorage.setItem(MC_FIRED, JSON.stringify(fired)); } catch { /* fine */ }
  if (rang) {
    if (typeof playReminderSound === 'function') playReminderSound();
    Store.save();
    if (typeof updateBell === 'function') updateBell();
  }
}
setInterval(mcCheckAlerts, 30000);
setTimeout(mcCheckAlerts, 4000);

// ---------- Guests: type a name or email, pick the closest match ----------
if (!ICON.guests) ICON.guests = 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6M16 4.3a3.5 3.5 0 0 1 0 6.4M18 14.4c2.1.8 3.5 2.8 3.5 5.6';
const mcGuestName = (k) => personByKey(k)?.name || (k.startsWith('e:') ? k.slice(2) : 'Guest');
function mcGuestChip(k) {
  const p = personByKey(k);
  return `<span class="mc-gchip">${p ? avatar(p, 20) : `<span class="avatar" style="--s:20px;background:#6e7a8f">@</span>`}<span>${esc(mcGuestName(k))}</span><input type="hidden" name="att" value="${esc(k)}"><button type="button" class="chip-x" data-act="mcGuestDel" aria-label="Remove ${esc(mcGuestName(k))}">${icon('close', 11)}</button></span>`;
}
/** How close a person is to what was typed: start of a name word beats anywhere in it beats email; small typos still match. */
function mcGuestScore(p, q) {
  const name = String(p.name || '').toLowerCase();
  const email = String(p.email || '').toLowerCase();
  if (!q) return 1;
  if (name.split(/\s+/).some((w) => w.startsWith(q))) return 100 - name.indexOf(q);
  if (name.includes(q)) return 70;
  if (email.startsWith(q)) return 60;
  if (email.includes(q)) return 50;
  // Typos: compare with each name word.
  const dist = (a, b) => { const d = Array.from({ length: a.length + 1 }, (_, i) => [i]); for (let j = 1; j <= b.length; j++) d[0][j] = j; for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); return d[a.length][b.length]; };
  const best = Math.min(...name.split(/\s+/).map((w) => dist(q, w.slice(0, Math.max(q.length, 1)))));
  return best <= Math.max(1, Math.floor(q.length / 3)) ? 40 - best * 10 : 0;
}
function mcGuestSuggest(box) {
  const inp = box.querySelector('.mc-gq');
  const sug = box.querySelector('.mc-gsug');
  const q = inp.value.trim().toLowerCase();
  const have = new Set([...box.querySelectorAll('input[name="att"]')].map((x) => x.value));
  const org = pkey(S.meId);
  if (!q) { sug.hidden = true; sug.innerHTML = ''; return; }
  const list = S.people.filter((p) => !have.has(pkey(p.id)) && pkey(p.id) !== org).map((p) => [p, mcGuestScore(p, q)]).filter(([, s]) => s > 0).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([p]) => p);
  const email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(q) && !S.people.some((p) => (p.email || '').toLowerCase() === q) ? q : '';
  sug.innerHTML = list.map((p, i) => `<button type="button" class="mc-gopt ${i === 0 ? 'on' : ''}" data-k="${esc(pkey(p.id))}" role="option">${avatar(p, 22)}<span><b>${esc(p.name)}</b>${p.email ? `<small class="muted">${esc(p.email)}</small>` : ''}</span></button>`).join('')
    + (email ? `<button type="button" class="mc-gopt ${list.length ? '' : 'on'}" data-k="e:${esc(email)}" role="option"><span class="avatar" style="--s:22px;background:#6e7a8f">@</span><span><b>Invite ${esc(email)}</b></span></button>` : '')
    || '<p class="small muted mc-gnone">No one by that name. Type their email to invite them.</p>';
  sug.hidden = false;
}
function mcGuestAdd(box, k) {
  if (!k || box.querySelector(`input[name="att"][value="${CSS.escape(k)}"]`)) return;
  box.querySelector('.mc-gchips').insertAdjacentHTML('beforeend', mcGuestChip(k));
  const inp = box.querySelector('.mc-gq');
  inp.value = '';
  mcGuestSuggest(box);
  inp.focus();
  mcAutoBlock(box.closest('form'));
}
document.addEventListener('input', (e) => { if (e.target.matches?.('[data-mc-guest]')) mcGuestSuggest(e.target.closest('.mc-guests')); });
document.addEventListener('keydown', (e) => {
  if (!e.target.matches?.('[data-mc-guest]')) return;
  const box = e.target.closest('.mc-guests');
  const opts = [...box.querySelectorAll('.mc-gopt')];
  const i = opts.findIndex((o) => o.classList.contains('on'));
  if (e.key === 'Enter') { e.preventDefault(); if (opts[i]) mcGuestAdd(box, opts[i].dataset.k); }
  else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (!opts.length) return; const j = (i + (e.key === 'ArrowDown' ? 1 : -1) + opts.length) % opts.length; opts.forEach((o, n) => o.classList.toggle('on', n === j)); }
  else if (e.key === 'Backspace' && !e.target.value) box.querySelector('.mc-gchip:last-child')?.remove();
  else if (e.key === 'Escape') { box.querySelector('.mc-gsug').hidden = true; }
});
document.addEventListener('mousedown', (e) => { const o = e.target.closest?.('.mc-gopt'); if (o) { e.preventDefault(); mcGuestAdd(o.closest('.mc-guests'), o.dataset.k); } });
document.addEventListener('focusout', (e) => { if (e.target.matches?.('[data-mc-guest]')) setTimeout(() => { const s = e.target.closest('.mc-guests')?.querySelector('.mc-gsug'); if (s && !e.target.closest('.mc-guests').contains(document.activeElement)) s.hidden = true; }, 150); });
Object.assign(actions, { mcGuestDel: (el) => { const f = el.closest('form'); el.closest('.mc-gchip').remove(); mcAutoBlock(f); } });

// ---------- The event's map link ----------
const mcIsLink = (v) => /^https?:\/\/\S+$/i.test(String(v || '').trim());
/** The event's map link: a saved/pasted link if there is one, otherwise a Google Maps search for the address. */
function mcMapUrl(mapUrl, loc) {
  if (mapUrl && mcIsLink(mapUrl)) return mapUrl;
  if (mcIsLink(loc)) return String(loc).trim();
  const q = String(loc || '').trim();
  return q ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}` : '#';
}
const mcMapText = (mapUrl, loc) => (mcIsLink(loc) ? 'Open map link' : String(loc || '').trim() ? 'Open in Google Maps' : '');
function mcMapRefresh(form) {
  const loc = form.querySelector('[name="loc"]')?.value || '';
  const url = form.querySelector('[name="mapUrl"]')?.value || '';
  // The Google Maps button at the top right, shown once there's a location.
  const a = form.querySelector('.mc-mapbtn');
  if (!a) return;
  a.hidden = !loc.trim() || form.dataset.kind !== 'event';
  a.href = mcMapUrl(url, loc);
}

// ---------- Location: saved places and live address search ----------
// As you type, your saved places that match come first, then addresses found live (OpenStreetMap,
// through the free Photon search). Picking one fills Location; a saved place brings its own map link.
const mcPlaces = () => (Array.isArray(S.settings.places) ? S.settings.places : []);
const mcPlaceText = (p) => [p.name, p.addr].filter(Boolean).join(', ');
let mcLocTimer = null;
let mcLocSeq = 0;
function mcPhotonText(f) {
  const p = f.properties || {};
  const street = [p.housenumber, p.street].filter(Boolean).join(' ');
  const first = p.name && p.name !== p.street ? p.name : '';
  const area = [p.city || p.district || p.locality, p.state && p.countrycode === 'AU' ? ({ Victoria: 'VIC', 'New South Wales': 'NSW', Queensland: 'QLD', 'Australian Capital Territory': 'ACT', 'South Australia': 'SA', 'Western Australia': 'WA', Tasmania: 'TAS', 'Northern Territory': 'NT' }[p.state] || p.state) : p.state, p.postcode].filter(Boolean).join(' ');
  return [first, street, area, p.countrycode === 'AU' ? '' : p.country].filter(Boolean).join(', ');
}
function mcLocShow(box, saved, found, q) {
  const sug = box.querySelector('.mc-locsug');
  const rows = [
    ...saved.map((p) => `<button type="button" class="mc-gopt" data-loc="${esc(mcPlaceText(p))}" data-url="${esc(p.url || '')}" data-geo="${p.lat != null ? `${p.lat},${p.lon}` : ''}">${icon('star', 14)} <span><b>${esc(p.name || p.addr)}</b>${p.name && p.addr ? `<small class="muted">${esc(p.addr)}</small>` : ''}</span></button>`),
    ...found.map(({ t, geo }) => `<button type="button" class="mc-gopt" data-loc="${esc(t)}" data-url="" data-geo="${esc(geo)}">${icon('pin', 14)} <span>${esc(t)}</span></button>`),
  ];
  if (!rows.length && !q) { sug.hidden = true; return; }
  sug.innerHTML = (rows.join('') || '<p class="small muted mc-gnone">Searching…</p>') + `<button type="button" class="mc-gopt mc-locmanual" data-loc="${esc(q)}" data-url="">${icon('pin', 14)} <span>Use “${esc(q)}” as typed</span></button>`;
  sug.hidden = false;
}
function mcLocSearch(inp) {
  const box = inp.closest('.mc-locf');
  const q = inp.value.trim();
  const ql = q.toLowerCase();
  const saved = mcPlaces().filter((p) => !ql || `${p.name} ${p.addr}`.toLowerCase().includes(ql)).slice(0, 5);
  if (!q || mcIsLink(q)) { if (!q && saved.length && document.activeElement === inp) mcLocShow(box, saved, [], ''); else box.querySelector('.mc-locsug').hidden = true; return; }
  mcLocShow(box, saved, [], q);
  clearTimeout(mcLocTimer);
  if (q.length < 3 || !navigator.onLine) return;
  const seq = ++mcLocSeq;
  mcLocTimer = setTimeout(async () => {
    try {
      const near = /^Australia\//.test(tzHome()) ? '&lat=-37.81&lon=144.96' : '';
      const r = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=6&lang=en${near}`);
      const j = await r.json();
      if (seq !== mcLocSeq) return;
      const seen = new Set();
      const found = (j.features || []).map((f) => ({ t: mcPhotonText(f), geo: f.geometry?.coordinates ? `${f.geometry.coordinates[1]},${f.geometry.coordinates[0]}` : '' })).filter((x) => x.t && !seen.has(x.t) && seen.add(x.t)).slice(0, 5);
      mcLocShow(box, saved, found, q);
    } catch { /* offline or blocked: saved places still work */ }
  }, 300);
}
document.addEventListener('input', (e) => {
  if (!e.target.matches?.('[data-mc-loc]')) return;
  const form = e.target.closest('form');
  form.querySelector('[name="mapUrl"]').value = '';
  form.querySelector('[name="geo"]').value = '';
  mcMapRefresh(form);
  mcLocSearch(e.target);
});
document.addEventListener('focusin', (e) => { if (e.target.matches?.('[data-mc-loc]') && !e.target.value) mcLocSearch(e.target); });
document.addEventListener('mousedown', (e) => {
  const o = e.target.closest?.('.mc-locsug .mc-gopt');
  if (!o) return;
  e.preventDefault();
  const form = o.closest('form');
  form.querySelector('[name="loc"]').value = o.dataset.loc;
  form.querySelector('[name="mapUrl"]').value = o.dataset.url || '';
  form.querySelector('[name="geo"]').value = o.dataset.geo || '';
  if (typeof departPreview === 'function') departPreview(form);
  o.closest('.mc-locsug').hidden = true;
  mcMapRefresh(form);
});
document.addEventListener('keydown', (e) => {
  if (!e.target.matches?.('[data-mc-loc]')) return;
  const sug = e.target.closest('.mc-locf').querySelector('.mc-locsug');
  if (e.key === 'Escape') sug.hidden = true;
  if (e.key === 'Enter') { e.preventDefault(); const first = sug.hidden ? null : sug.querySelector('.mc-gopt'); if (first) first.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); }
});
document.addEventListener('focusout', (e) => { if (e.target.matches?.('[data-mc-loc]')) setTimeout(() => { const s = e.target.closest('.mc-locf')?.querySelector('.mc-locsug'); if (s) s.hidden = true; }, 150); });

// Saved places: from an event (⭐ Save place) or Settings › Calendar.
function mcPlacesHTML() {
  return `<p class="small muted">Locations you use often. Pick them with Saved Locations in an event, and they come up first when you type a Location.</p>
    <div class="mc-places">${mcPlaces().map((p, i) => `<div class="mc-place"><input value="${esc(p.name)}" placeholder="Name, e.g. Office" data-change="mcPlaceSet" data-i="${i}" data-k="name" aria-label="Place name"><input value="${esc(p.addr)}" placeholder="Address" data-change="mcPlaceSet" data-i="${i}" data-k="addr" aria-label="Address"><input value="${esc(p.url || '')}" placeholder="Map link (optional)" data-change="mcPlaceSet" data-i="${i}" data-k="url" aria-label="Map link" type="url"><button class="icon-btn" data-act="mcPlaceDel" data-i="${i}" aria-label="Remove ${esc(p.name || 'location')}">${icon('close', 13)}</button></div>`).join('') || '<p class="small muted">No saved locations yet.</p>'}</div>
    <button class="btn ghost xs" data-act="mcPlaceAdd">${icon('plus', 12)} Add location</button>`;
}
const mcPlacesSave = (list) => { S.settings.places = list.slice(0, 50); commit(); if (typeof refreshSettings === 'function') refreshSettings(); };
Object.assign(actions, {
  mcPlaceSave: async (el) => {
    const form = el.closest('form');
    const addr = form.querySelector('[name="loc"]').value.trim();
    if (!addr) { toast('Type or pick the location first.', { error: true }); return; }
    const name = await promptDlg('Save this location', 'Name (e.g. Office, Central kitchen)', '', 'Save');
    if (name === null || name === undefined) return;
    const url = form.querySelector('[name="mapUrl"]').value || (mcIsLink(addr) ? addr : '');
    const [lat, lon] = String(form.querySelector('[name="geo"]').value || '').split(',').map(Number);
    S.settings.places = [...mcPlaces().filter((p) => p.addr !== addr), { id: uid(), name: String(name).trim().slice(0, 60), addr: mcIsLink(addr) ? '' : addr, url, ...(Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : {}) }];
    commit();
    toast(`Saved “${String(name).trim() || addr}”.`, { keep: true });
  },
  mcPlaceAdd: () => mcPlacesSave([...mcPlaces(), { id: uid(), name: '', addr: '', url: '' }]),
  mcPlaceDel: (el) => mcPlacesSave(mcPlaces().filter((_, i) => i !== Number(el.dataset.i))),
});
Object.assign(changes, {
  mcPlaceSet: (el) => {
    const list = mcPlaces().map((p) => ({ ...p }));
    const p = list[Number(el.dataset.i)];
    if (!p) return;
    const v = el.value.trim().slice(0, el.dataset.k === 'url' ? 500 : 200);
    if (el.dataset.k === 'url' && v && !mcIsLink(v)) { toast('A map link starts with https://', { error: true }); return; }
    p[el.dataset.k] = v;
    S.settings.places = list;
    commit();
  },
});

// ---------- Event attachments: drop files on the form, or Upload ----------
// Files are kept on this device (like task attachments) and travel to teammates through Team sync.
function mcFileChip(f) {
  return `<span class="mc-fchip" data-id="${esc(f.id)}">${f.thumb ? `<img src="${esc(f.thumb)}" alt="">` : icon('clip', 14)}<button type="button" class="linklike" data-act="mcFileOpen" data-id="${esc(f.id)}" title="Open ${esc(f.name)}">${esc(f.name)}</button><small class="muted">${esc(fmtSize(f.size || 0))}</small><button type="button" class="chip-x" data-act="mcFileDel" data-id="${esc(f.id)}" aria-label="Remove ${esc(f.name)}">${icon('close', 11)}</button></span>`;
}
const mcFilesOf = (form) => { try { return JSON.parse(form.querySelector('[name="files"]').value || '[]'); } catch { return []; } };
function mcFilesSet(form, list) {
  form.querySelector('[name="files"]').value = JSON.stringify(list);
  form.querySelector('.mc-flist').innerHTML = list.map(mcFileChip).join('');
}
async function mcFilesAdd(form, files) {
  const list = mcFilesOf(form);
  for (const file of files) {
    if (file.size > 50 * 1048576) { toast(`${file.name} is over the 50 MB limit.`, { error: true }); continue; }
    try {
      const id = uid();
      await Store.putFile(id, file);
      const thumb = typeof makeThumb === 'function' ? await makeThumb(file) : null;
      list.push({ id, name: file.name, size: file.size, type: file.type, ...(thumb ? { thumb } : {}) });
    } catch (err) { toast(err.message || `Could not keep ${file.name}.`, { error: true }); }
  }
  mcFilesSet(form, list);
}
Object.assign(actions, {
  mcFileAdd: (el) => {
    const form = el.closest('form');
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.multiple = true;
    inp.onchange = () => { if (inp.files.length) mcFilesAdd(form, [...inp.files]); };
    inp.click();
  },
  mcFileDel: (el) => { const form = el.closest('form'); mcFilesSet(form, mcFilesOf(form).filter((f) => f.id !== el.dataset.id)); },
  mcFileOpen: async (el) => {
    const f = mcFilesOf(el.closest('form')).find((x) => x.id === el.dataset.id);
    const blob = f && await Store.getFile(f.id);
    if (blob) download(f.name, blob); else toast('This file is not on this device yet. It arrives with the next Team sync.', { error: true });
  },
});
// Drag files anywhere onto the event form.
document.addEventListener('dragover', (e) => {
  const form = e.target.closest?.('.mc-form');
  if (!form || !form.querySelector('[name="files"]') || ![...(e.dataTransfer?.types || [])].includes('Files')) return;
  e.preventDefault();
  form.querySelector('[data-mc-drop]')?.classList.add('over');
});
document.addEventListener('dragleave', (e) => { if (!e.relatedTarget || !e.target.closest?.('.mc-form')?.contains(e.relatedTarget)) $$('[data-mc-drop].over').forEach((x) => x.classList.remove('over')); });
document.addEventListener('drop', (e) => {
  const form = e.target.closest?.('.mc-form');
  if (!form || !form.querySelector('[name="files"]') || !e.dataTransfer?.files?.length) return;
  e.preventDefault();
  $$('[data-mc-drop].over').forEach((x) => x.classList.remove('over'));
  mcFilesAdd(form, [...e.dataTransfer.files]);
});

// ---------- Shared calendars ----------
// A shared calendar has a name, a colour and members. Every member sees every event in it (and can
// edit them). Events not in a shared calendar are in "My calendar": only the organiser and guests see
// them. Calendars can be shown or hidden from the Calendars button. Stored with the events (mc:<id>).
function mcNormCal(c) {
  if (!c || typeof c !== 'object' || typeof c.id !== 'string') return null;
  return { id: c.id.slice(0, 40), name: String(c.name || 'Shared calendar').slice(0, 80), color: /^#[0-9a-f]{6}$/i.test(c.color || '') ? c.color : MC_COLORS[1],
    owner: String(c.owner || '').slice(0, 120), members: (Array.isArray(c.members) ? c.members : []).filter((x) => typeof x === 'string').slice(0, 100), deleted: !!c.deleted, at: Number(c.at) || Date.now() };
}
const mcCalsAll = () => { const p = mcPlan(); return p ? (p.cals = Array.isArray(p.cals) ? p.cals : []) : []; };
const mcCalById = (id) => mcCalsAll().find((c) => c.id === id && !c.deleted) || null;
const mcCalMember = (c) => !!c && (c.owner === pkey(S.meId) || c.members.includes(pkey(S.meId)));
const mcMyCals = () => mcCalsAll().filter((c) => !c.deleted && mcCalMember(c));
const mcHidden = () => (Array.isArray(S.settings.mcHidden) ? S.settings.mcHidden : []);
const mcHiddenCal = (m) => mcHidden().includes(m.cal && mcCalById(m.cal) ? m.cal : 'mine');

function mcCalPickHTML(m) {
  const cals = mcMyCals();
  if (!cals.length && !m.cal) return '<input type="hidden" name="cal" value="">';
  return `<label class="mc-calpick"><span class="mc-caldot" style="--ec:${esc(mcCalById(m.cal)?.color || '#9aa3b2')}"></span><select name="cal" data-change="mcCalField" aria-label="Calendar"><option value="">My calendar</option>${cals.map((c) => `<option value="${esc(c.id)}" ${m.cal === c.id ? 'selected' : ''}>${esc(c.name)} (shared)</option>`).join('')}</select></label>`;
}
function mcCalsMenuHTML() {
  const row = (key, name, color, extra = '') => `<div class="mc-calrow"><label><input type="checkbox" data-change="mcCalShow" value="${esc(key)}" ${mcHidden().includes(key) ? '' : 'checked'}><span class="mc-caldot" style="--ec:${esc(color)}"></span><span>${esc(name)}</span></label>${extra}</div>`;
  return `<div class="picker mc-calsmenu"><h4>Calendars</h4>
    ${row('mine', 'My calendar', '#9aa3b2')}
    ${mcMyCals().map((c) => row(c.id, c.name, c.color, `<small class="muted">${c.members.length + 1} people</small>${c.owner === pkey(S.meId) || stAdmin() ? `<button class="icon-btn" data-act="mcCalEdit" data-id="${esc(c.id)}" aria-label="Edit ${esc(c.name)}" title="Edit">${icon('more', 14)}</button>` : ''}`)).join('')}
    <button class="btn ghost sm" data-act="mcCalEdit">${icon('plus', 13)} New shared calendar</button>
    ${mcTeam().length ? `<h4 class="mc-teamh">My team</h4>${mcTeam().map((p) => `<div class="mc-calrow"><label><input type="checkbox" data-change="mcTeamShow" value="${esc(pkey(p.id))}" ${mcTeamOn().includes(pkey(p.id)) ? 'checked' : ''}>${avatar(p, 18)}<span>${esc(p.name)}</span></label></div>`).join('')}<p class="small muted">Everyone who reports to you. Tick to see their calendar with yours.</p>` : ''}</div>`;
}
function mcCalDialog(c) {
  const isNew = !c;
  const cal = c || { id: uid(), name: '', color: MC_COLORS[1], owner: pkey(S.meId), members: [] };
  const d = showDialog({ title: isNew ? 'New shared calendar' : 'Shared calendar', html: `<form class="mc-form mc-calform" data-submit="mcCalSave" data-id="${esc(cal.id)}">
    <input class="mc-tin" name="name" value="${esc(cal.name)}" placeholder="Calendar name, e.g. Marketing" aria-label="Calendar name" autocomplete="off" required>
    <div class="mc-colors" role="radiogroup" aria-label="Colour">${MC_COLORS.map((col, i) => `<label style="--ec:${col}"><input type="radio" name="color" value="${col}" ${cal.color === col ? 'checked' : ''} aria-label="Colour ${i + 1}"><i></i></label>`).join('')}</div>
    <div class="pd-f mc-guests"><div class="mc-gin">${icon('guests', 18)}<input class="mc-gq" placeholder="Add people" autocomplete="off" aria-label="Add people: type a name or email" data-mc-guest></div>
      <div class="mc-gchips">${cal.members.filter((k) => k !== cal.owner).map(mcGuestChip).join('')}</div><div class="mc-gsug" role="listbox" hidden></div></div>
    <p class="small muted">Everyone here sees every event in this calendar and can add or change them.</p>
    <div class="row">${isNew ? '' : `<button type="button" class="btn ghost sm danger" data-act="mcCalDelete" data-id="${esc(cal.id)}">${icon('trash', 13)} Delete calendar</button>`}<span class="spacer"></span><button class="btn primary">${isNew ? 'Create' : 'Save'}</button></div></form>` });
  d?.classList?.add('mc-dlg');
  setTimeout(() => $('dialog.mc-dlg [name=name]')?.focus(), 30);
}
Object.assign(actions, {
  mcCalsMenu: (el) => openPop(el, mcCalsMenuHTML),
  // The gear at the top right of the Calendar: time zone, your calendars and holidays in one place.
  mcSettings: (el) => {
    const gear = () => $('.mc-set') || el;
    const tz = tzNow() === tzHome() ? tzLabel(tzNow()) : `Now: ${tzLabel(tzNow())} · Home: ${tzLabel(tzHome())}`;
    openMenu(el, [
      { icon: 'clock', label: `Time zone: ${tz}`, run: () => setTimeout(() => actions.mcTzMenu(gear()), 0) },
      { icon: 'cal', label: 'Calendars', run: () => setTimeout(() => actions.mcCalsMenu(gear()), 0) },
      { icon: 'flag', label: 'Holidays', run: () => setTimeout(() => actions.holPick(gear()), 0) },
    ]);
  },
  mcCalEdit: (el) => { closePop(); mcCalDialog(el.dataset.id ? mcCalById(el.dataset.id) : null); },
  mcCalDelete: async (el) => {
    const c = mcCalById(el.dataset.id);
    if (!c || !await confirmDlg(`Delete ${c.name}?`, 'Its events stay with their organiser and guests, but members no longer see them.', 'Delete')) return;
    Object.assign(c, { deleted: true, at: Date.now() });
    mcDirty();
    $$('dialog.mc-dlg').forEach((d) => d.close());
    commit();
  },
});
Object.assign(changes, {
  mcTeamShow: (el) => { const t = new Set(Array.isArray(S.settings.mcTeam) ? S.settings.mcTeam : []); if (el.checked) t.add(el.value); else t.delete(el.value); S.settings.mcTeam = [...t]; Store.save(); render(); },
  mcCalShow: (el) => { const h = new Set(mcHidden()); if (el.checked) h.delete(el.value); else h.add(el.value); S.settings.mcHidden = [...h]; Store.save(); render(); },
  // Picking a calendar gives the event that calendar's colour.
  mcCalField: (el) => {
    const c = mcCalById(el.value);
    const f = el.closest('form');
    const dot = f.querySelector('.mc-calpick .mc-caldot');
    if (dot) dot.style.setProperty('--ec', c?.color || '#9aa3b2');
    if (c) { const r = f.querySelector(`input[name="color"][value="${c.color}"]`); if (r) r.checked = true; }
  },
});
Object.assign(submits, {
  mcCalSave: (form, data) => {
    const p = mcPlan(true);
    const old = mcCalById(form.dataset.id);
    const owner = old?.owner || pkey(S.meId);
    const c = mcNormCal({ ...(old || {}), id: form.dataset.id, name: String(data.get('name') || '').trim() || 'Shared calendar', color: data.get('color'), owner, members: [...new Set(data.getAll('att'))].filter((k) => k !== owner), at: Date.now() });
    if (old) Object.assign(old, c); else (p.cals = Array.isArray(p.cals) ? p.cals : []).push(c);
    mcDirty();
    $$('dialog.mc-dlg').forEach((d) => d.close());
    commit();
    toast(old ? 'Calendar saved.' : `${c.name} created${c.members.length ? ` and shared with ${c.members.length} ${c.members.length === 1 ? 'person' : 'people'}` : ''}.`, { keep: true });
  },
});

// ---------- Types: Event, Meeting, Birthday, Reminder ----------
// Meeting: blocks its time in your Time Box by default (Event can, if you tick it).
// Birthday: a date that repeats every year, all day; optional year born shows the age.
// Reminder: one time (no end), can repeat; notifies at the time by default.
const MC_KINDS = [['event', 'Event', 'cal'], ['birthday', 'Birthday', 'cake'], ['reminder', 'Reminder', 'bell']];
if (!ICON.cake) ICON.cake = 'M4 21h16M5 21v-7a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v7M5 16c1.5 1 3 1 4.5 0s3-1 4.5 0 3 1 4.5 0M12 12V8M12 5.5a1 1 0 0 0 1-1C13 3.5 12 2.5 12 2.5S11 3.5 11 4.5a1 1 0 0 0 1 1z';
if (!ICON.car) ICON.car = 'M5 17h14M5 17v2M19 17v2M4 13l2-5a2 2 0 0 1 1.9-1.3h8.2A2 2 0 0 1 18 8l2 5v4H4v-4zM4 13h16M7.5 15h.01M16.5 15h.01';
if (!ICON.repeat) ICON.repeat = 'M17 2l4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 0 1-3 3H3';
const MC_REPS = [['', 'Does not repeat'], ['daily', 'Every day'], ['weekdays', 'Every weekday (Mon–Fri)'], ['weekly', 'Every week'], ['monthly', 'Every month'], ['yearly', 'Every year']];
const MC_TITLE_HINT = { event: 'Add title', meeting: 'Meeting title', birthday: 'Whose birthday? e.g. Ray', reminder: 'Remind me to…' };
const MC_NOTE_HINT = { event: 'Notes', meeting: 'Agenda, documents', birthday: 'Gift ideas, how to celebrate', reminder: 'Details' };
const MC_KIND_ALERTS = { birthday: [0, 10080], reminder: [0] };
const mcKind = (m) => (m?.kind === 'birthday' || m?.kind === 'reminder' ? m.kind : 'event');
const mcAllDay = (m) => mcKind(m) === 'birthday';
const mcIsMeeting = (m) => (m.att || []).filter((k) => k !== m.org).length > 0 || !!m.link;
const mcBlocks = (m) => (typeof m.block === 'boolean' ? m.block : mcIsMeeting(m));
const mcIcon = () => '';
const mcIconHTML = (m) => (mcKind(m) === 'birthday' ? icon('cake', 11) : mcKind(m) === 'reminder' ? icon('bell', 11) : '');
function mcAge(m, onDate) { return m.by ? Number(onDate.slice(0, 4)) - m.by : null; }
function mcAllDayText(m, d) {
  const name = String(m.title || '').trim() || 'Someone';
  const age = mcAge(m, d);
  return `${/birthday/i.test(name) ? name : `${name}'s birthday`}${age && age > 0 ? ` (${age})` : ''}`;
}
/** Does this item happen on date d (repeats included)? */
function mcOccurs(m, d) {
  if (!m.rep || d === m.date) return d === m.date;
  if (d < m.date) return false;
  if (m.rep === 'custom') return mcRcOccurs(m, d);
  const a = new Date(`${m.date}T12:00:00`);
  const b = new Date(`${d}T12:00:00`);
  if (m.rep === 'daily') return true;
  if (m.rep === 'weekdays') return b.getDay() > 0 && b.getDay() < 6;
  if (m.rep === 'weekly') return a.getDay() === b.getDay();
  if (m.rep === 'monthly') return a.getDate() === b.getDate();
  if (m.rep === 'yearly') {
    if (a.getMonth() === 1 && a.getDate() === 29 && !(new Date(b.getFullYear(), 1, 29).getMonth() === 1)) return b.getMonth() === 1 && b.getDate() === 28;
    return a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }
  return false;
}
/** Items on a date: one-off ones on their day, repeating ones on each day they repeat. */
const mcOn = (list, d) => list.filter((m) => (m.rep ? mcOccurs(m._o || m, d) : m.date === d)).map((m) => (m.rep && m.date !== d ? { ...m, date: d, _o: m._o || m } : m));

Object.assign(actions, {
  mcKind: (el) => {
    const form = el.closest('form');
    const k = el.dataset.v;
    form.dataset.kind = k;
    form.querySelector('[name="kind"]').value = k;
    form.querySelectorAll('.mc-kinds button').forEach((b) => b.classList.toggle('on', b.dataset.v === k));
    const t = form.querySelector('[name="title"]');
    if (t) t.placeholder = MC_TITLE_HINT[k];
    const n = form.querySelector('[name="notes"]');
    if (n) n.placeholder = MC_NOTE_HINT[k];
    const blk = form.querySelector('[name="block"]');
    if (blk && !blk.dataset.touched) mcAutoBlock(form);
    // A new item takes that type's usual notifications (until you change them).
    const box = form.querySelector('.mc-alerts');
    const isNew = !mcAll().some((x) => x.id === form.dataset.id);
    if (box && isNew && !box.dataset.touched) box.innerHTML = (MC_KIND_ALERTS[k] || mcAlDefault()).map((n) => mcAlertRow(n)).join('');
    if (k === 'birthday') { const r = form.querySelector('input[name="color"][value="#9a5b6e"]'); if (r) r.checked = true; }
    mcBdLabels(form);
    mcMapRefresh(form);
  },
});
document.addEventListener('change', (e) => {
  if (e.target.matches?.('.mc-form [name="block"]')) e.target.dataset.touched = '1';
  if (e.target.closest?.('.mc-form .mc-alerts')) e.target.closest('.mc-alerts').dataset.touched = '1';
});

// ---------- Meetings in the Time Box ----------
/** Your events that block time on a date (on this device's clock): [{ id, start, end, title, color }]. */
function mcBusyOn(iso) {
  if (typeof mcPlan !== 'function' || !mcPlan()) return [];
  return mcAll().filter((m) => mcMine(m) && !mcAllDay(m) && mcKind(m) !== 'reminder' && mcBlocks(m)).map(mcLocal)
    .flatMap((m) => mcOn([m], iso)).map((m) => ({ id: m.id, start: m.start, end: m.end, title: m.title || 'Event', color: m.color || MC_COLORS[0], meet: mcIsMeeting(m._o || m) }));
}
function mcBusyHTML(iso, y, ppm) {
  // Drawn like a task block: the event's colour, title in the middle, length underneath.
  return mcBusyOn(iso).map((b) => {
    const h = Math.max(16, (b.end - b.start) * ppm - 1);
    return `<div class="tb-block tb-meetblk ${h < 30 ? 'short' : ''}" data-act="mcOpenId" data-id="${esc(b.id)}" style="top:${y(b.start)}px;height:${h}px;left:1px;width:calc(100% - 2px);--c:color-mix(in srgb, ${b.color} 45%, #b9c6dc)" tabindex="0" title="${esc(`${b.title}: ${fmtTime(b.start)}–${fmtTime(b.end)} (from your Schedule)`)}"><div class="tb-b-title">${icon(b.meet ? 'guests' : 'cal', 12)} ${esc(b.title)}</div>${h >= 38 ? `<small class="tb-b-dur">(${b.end - b.start} min)</small>` : ''}</div>`;
  }).join('');
}
Object.assign(actions, { mcOpenId: (el, e) => { e?.stopPropagation?.(); const m = mcAll().find((x) => x.id === el.dataset.id); if (m) mcOpen(m); } });

/** Birthdays are all day: "at the time" means 9:00 am on the day. */
function mcBdLabels(form) {
  if (!form) return;
  const bd = form.dataset.kind === 'birthday';
  form.querySelectorAll('.mc-al select option[value="0"]').forEach((o) => { o.textContent = bd ? 'On the day, 9:00 am' : 'At time of event'; });
}
document.addEventListener('click', (e) => { if (e.target.closest?.('.mc-al-menu, .mc-alc')) setTimeout(() => mcBdLabels($('dialog.mc-dlg form')), 50); });

/** Counts what you give guests, so the most used come first next time. */
function mcGalSave(list) {
  const h = (S.settings.mcGalHist = S.settings.mcGalHist && typeof S.settings.mcGalHist === 'object' ? S.settings.mcGalHist : {});
  list.filter((n) => Number.isInteger(n) && n >= 0).forEach((n) => { h[n] = (h[n] || 0) + 1; });
  return list;
}

// ---------- Custom repeat (like iPhone / Google Calendar) ----------
// Every N days / weeks / months / years; for weeks, on which days; ends never, on a date, or after N times.
const MC_RC_UNITS = [['day', 'day'], ['week', 'week'], ['month', 'month'], ['year', 'year']];
const MC_WD = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MC_WD_LONG = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
function mcNormRc(rc) {
  const r = rc && typeof rc === 'object' ? rc : {};
  const end = r.end && typeof r.end === 'object' ? r.end : {};
  return {
    n: Math.max(1, Math.min(99, Math.round(Number(r.n) || 1))),
    unit: MC_RC_UNITS.some(([u]) => u === r.unit) ? r.unit : 'week',
    days: (Array.isArray(r.days) ? r.days : []).map(Number).filter((x) => Number.isInteger(x) && x >= 0 && x <= 6),
    end: { type: ['never', 'on', 'count'].includes(end.type) ? end.type : 'never', date: /^\d{4}-\d{2}-\d{2}$/.test(end.date || '') ? end.date : '', count: Math.max(1, Math.min(999, Math.round(Number(end.count) || 10))) },
  };
}
function mcRcText(rc, date) {
  const r = mcNormRc(rc);
  const unit = `${r.unit}${r.n === 1 ? '' : 's'}`;
  const days = r.unit === 'week' ? (r.days.length ? r.days : [new Date(`${date || todayISO()}T12:00:00`).getDay()]) : [];
  const on = days.length ? ` on ${days.slice().sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map((x) => MC_WD_LONG[x]).join(', ')}` : '';
  const end = r.end.type === 'on' && r.end.date ? `, until ${fmtDate(r.end.date)}` : r.end.type === 'count' ? `, ${r.end.count} times` : '';
  return `Every ${r.n === 1 ? '' : `${r.n} `}${unit}${on}${end}`;
}
function mcRcMatch(m, d) {
  const r = mcNormRc(m.rc);
  const a = new Date(`${m.date}T12:00:00`);
  const b = new Date(`${d}T12:00:00`);
  if (r.unit === 'day') return Math.round((b - a) / 864e5) % r.n === 0;
  if (r.unit === 'week') {
    const days = r.days.length ? r.days : [a.getDay()];
    if (!days.includes(b.getDay())) return false;
    const weeks = Math.round((new Date(`${mcWeekStart(d)}T12:00:00`) - new Date(`${mcWeekStart(m.date)}T12:00:00`)) / (7 * 864e5));
    return weeks % r.n === 0;
  }
  if (r.unit === 'month') { const months = (b.getFullYear() - a.getFullYear()) * 12 + b.getMonth() - a.getMonth(); return b.getDate() === a.getDate() && months % r.n === 0; }
  return b.getMonth() === a.getMonth() && b.getDate() === a.getDate() && (b.getFullYear() - a.getFullYear()) % r.n === 0;
}
function mcRcOccurs(m, d) {
  const r = mcNormRc(m.rc);
  if (r.end.type === 'on' && r.end.date && d > r.end.date) return false;
  if (!mcRcMatch(m, d)) return false;
  if (r.end.type === 'count') {
    let n = 0;
    for (let x = m.date, i = 0; x <= d && i < 4000; x = mcAddDays(x, 1), i += 1) if (x === m.date || mcRcMatch(m, x)) n += 1;
    return n <= r.end.count;
  }
  return true;
}
function mcRcPickerHTML(rc, date) {
  const r = mcNormRc(rc);
  const nums = Array.from({ length: 99 }, (_, i) => i + 1);
  return `<div class="picker tw-pick mc-rcp"><div class="mc-alc-head"><button type="button" class="icon-btn" data-act="mcRcCancel" aria-label="Back">${icon('chevL', 16)}</button><b>Custom repeat</b><button type="button" class="btn primary sm" data-act="mcRcOk" aria-label="Done">${icon('check', 15)}</button></div>
    <p class="mc-alc-sum">${icon('repeat', 14)} <span>${esc(mcRcText(r, date))}</span></p>
    <div class="tw-wheels mc-alc-w"><div class="tw-col" data-col="n">${nums.map((n) => `<div class="tw-item" data-v="${n}">${n}</div>`).join('')}</div><div class="tw-col" data-col="unit">${MC_RC_UNITS.map(([u]) => `<div class="tw-item" data-v="${u}">${u}</div>`).join('')}</div><div class="tw-band" aria-hidden="true"></div></div>
    <div class="mc-rc-days" ${r.unit === 'week' ? '' : 'hidden'}>${MC_WD.map((w, i) => `<button type="button" class="${(r.days.length ? r.days : [new Date(`${date}T12:00:00`).getDay()]).includes(i) ? 'on' : ''}" data-wd="${i}" aria-label="${MC_WD_LONG[i]}">${w}</button>`).join('')}</div>
    <div class="mc-rc-end"><span>Ends</span><select data-rc="type"><option value="never" ${r.end.type === 'never' ? 'selected' : ''}>Doesn't end</option><option value="on" ${r.end.type === 'on' ? 'selected' : ''}>On a date</option><option value="count" ${r.end.type === 'count' ? 'selected' : ''}>After a number of times</option></select>
      <input type="date" data-rc="date" value="${esc(r.end.date || mcAddDays(date, 90))}" ${r.end.type === 'on' ? '' : 'hidden'}><label ${r.end.type === 'count' ? '' : 'hidden'}><input type="number" data-rc="count" min="1" max="999" value="${r.end.count}"> times</label></div></div>`;
}
function mcRcOpen(sel) {
  const form = sel.closest('form');
  const date = form.querySelector('[name="date"]').value || todayISO();
  let rc = (() => { try { return JSON.parse(form.querySelector('[name="rc"]').value || 'null'); } catch { return null; } })();
  if (!rc) rc = { n: 1, unit: 'week', days: [new Date(`${date}T12:00:00`).getDay()], end: { type: 'never' } };
  const pop = openPop(sel, () => mcRcPickerHTML(rc, date));
  const cols = [...pop.querySelectorAll('.tw-col')];
  const cur = { n: mcNormRc(rc).n, unit: mcNormRc(rc).unit };
  const read = () => {
    const r = { ...mcNormRc(rc) };
    cols.forEach((c) => { const on = c.querySelector('.tw-item.on'); if (on) r[c.dataset.col] = c.dataset.col === 'n' ? Number(on.dataset.v) : on.dataset.v; });
    r.days = [...pop.querySelectorAll('.mc-rc-days button.on')].map((b) => Number(b.dataset.wd));
    r.end = { type: pop.querySelector('[data-rc="type"]').value, date: pop.querySelector('[data-rc="date"]').value, count: Number(pop.querySelector('[data-rc="count"]').value) || 10 };
    return mcNormRc(r);
  };
  const show = () => { const r = read(); pop.querySelector('.mc-rc-days').hidden = r.unit !== 'week'; pop.querySelector('.mc-alc-sum span').textContent = mcRcText(r, date); };
  cols.forEach((col) => {
    const items = [...col.children];
    const i = Math.max(0, items.findIndex((x) => x.dataset.v === String(cur[col.dataset.col])));
    col.scrollTop = i * TW_ROW;
    items.forEach((x, j) => x.classList.toggle('on', j === i));
    let t = null;
    col.addEventListener('scroll', () => { clearTimeout(t); t = setTimeout(() => { const idx = Math.round(col.scrollTop / TW_ROW); items.forEach((x, j) => x.classList.toggle('on', j === idx)); show(); }, 90); }, { passive: true });
    col.addEventListener('click', (e) => { const it = e.target.closest('.tw-item'); if (!it) return; items.forEach((x) => x.classList.toggle('on', x === it)); col.scrollTo({ top: items.indexOf(it) * TW_ROW, behavior: 'smooth' }); show(); });
  });
  pop.querySelector('.mc-rc-days').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; b.classList.toggle('on'); if (!pop.querySelector('.mc-rc-days button.on')) b.classList.add('on'); show(); });
  pop.querySelector('[data-rc="type"]').addEventListener('change', (e) => { pop.querySelector('[data-rc="date"]').hidden = e.target.value !== 'on'; pop.querySelector('[data-rc="count"]').closest('label').hidden = e.target.value !== 'count'; show(); });
  pop.querySelectorAll('[data-rc="date"], [data-rc="count"]').forEach((x) => x.addEventListener('input', show));
  ui.mcRc = { sel, form, read, date };
}
Object.assign(actions, {
  mcRcOk: () => {
    const c = ui.mcRc;
    closePop();
    if (!c) return;
    const r = c.read();
    c.form.querySelector('[name="rc"]').value = JSON.stringify(r);
    const opt = c.sel.querySelector('option[value="custom"]');
    opt.textContent = mcRcText(r, c.date);
    c.sel.value = 'custom';
    c.sel.dataset.prev = 'custom';
    ui.mcRc = null;
  },
  mcRcCancel: () => { const c = ui.mcRc; closePop(); if (c) c.sel.value = c.sel.dataset.prev || ''; ui.mcRc = null; },
});
document.addEventListener('change', (e) => {
  const sel = e.target;
  if (!sel.matches?.('.mc-form [name="rep"]')) return;
  if (sel.value === 'custom') mcRcOpen(sel); else sel.dataset.prev = sel.value;
});

/** "Block this time" follows the event until you tick or untick it: on once it has guests or a video call link. */
function mcAutoBlock(form) {
  const blk = form?.querySelector('[name="block"]');
  if (!blk || blk.dataset.touched || form.dataset.kind !== 'event') return;
  const guests = form.querySelectorAll('.mc-guests input[name="att"]').length > 0;
  const link = !!form.querySelector('[name="link"]')?.value.trim();
  blk.checked = guests || link;
}
document.addEventListener('input', (e) => { if (e.target.matches?.('.mc-form [name="link"]')) mcAutoBlock(e.target.closest('form')); });

// ---------- Recycle bin ----------
/** Moves an event to the recycle bin (after asking), with Undo. Returns true when it went. */
async function mcToBin(m) {
  if (!m || !mcCanEdit(m)) return false;
  if (!await confirmDlg(`Delete “${m.title || 'this event'}”?`, 'It goes from everyone’s calendar. You can restore it from the recycle bin.', 'Delete')) return false;
  const local = mcLocal(m);
  binAdd({ kind: 'event', title: m.title || (mcKind(m) === 'birthday' ? mcAllDayText(m, m.date) : 'Event'), where: `Schedule · ${dayLabel(local.date)}${mcAllDay(m) ? '' : `, ${fmtTime(local.start)}`}`, data: clone(m) });
  const entry = S.trash[0];
  mcPlan(true).meetings = mcAll().filter((x) => x.id !== m.id);
  mcDirty();
  commit();
  toast('Moved to the recycle bin.', { undo: () => { if (!binRestore(entry.id)) commit(); } });
  return true;
}

// "Saved Locations": pick one of your saved locations for this event.
Object.assign(actions, {
  mcPlacePick: (el) => {
    const form = el.closest('form');
    ui.mcPlaceForm = form;
    openPop(el, () => `<div class="menu mc-placemenu" role="menu"><h4>Saved Locations</h4>${mcPlaces().filter((p) => p.name || p.addr || p.url).map((p) => `<button role="menuitem" data-act="mcPlaceUse" data-id="${esc(p.id)}"><span>${icon('star', 14)}</span><span class="mc-pm"><b>${esc(p.name || p.addr || 'Map link')}</b>${p.name && p.addr ? `<small class="muted">${esc(p.addr)}</small>` : ''}</span></button>`).join('') || '<p class="small muted mc-gnone">No saved locations yet. Type a location, then tap Save Location.</p>'}<button role="menuitem" data-act="mcPlaceManage">${icon('gear', 13)} Edit saved locations</button></div>`);
  },
  mcPlaceUse: (el) => {
    const p = mcPlaces().find((x) => x.id === el.dataset.id);
    const form = ui.mcPlaceForm;
    closePop();
    if (!p || !form) return;
    form.querySelector('[name="loc"]').value = mcPlaceText(p) || p.url || '';
    form.querySelector('[name="mapUrl"]').value = p.url || '';
    form.querySelector('[name="geo"]').value = p.lat != null ? `${p.lat},${p.lon}` : '';
    mcMapRefresh(form);
    if (typeof departPreview === 'function') departPreview(form);
  },
  mcPlaceManage: () => { closePop(); actions.openSettings(); setTimeout(() => { const b = document.querySelector('[data-act="settingsTab"][data-v="calendar"]'); if (b) b.click(); }, 60); },
});

// ---------- Schedule (the default, like Google Calendar's Schedule) ----------
// A small month with a dot per item, month buttons, then only the days that have something on.
function mcSchedHTML() {
  const s = mcState();
  const today = todayISO();
  const ym = s.date.slice(0, 7);
  const shown = mcShown();
  const first = `${ym}-01`;
  const gridStart = mcWeekStart(first);
  const cells = Array.from({ length: 42 }, (_, i) => mcAddDays(gridStart, i));
  const rows = cells.slice(35).some((d) => d.slice(0, 7) === ym) ? 6 : 5;
  const dots = (d) => {
    const cols = [...holidaysOn(d).map(() => 'var(--muted)'), ...mcOn(shown, d).map((m) => m.color || MC_COLORS[0])];
    return `<span class="sc-dots">${cols.slice(0, 3).map((c) => `<i style="background:${esc(c)}"></i>`).join('')}${cols.length > 3 ? '<b>+</b>' : ''}</span>`;
  };
  // The small month stays folded away until you tap the month name at the top.
  const mini = !ui.mcMini ? '' : `<div class="sc-mini ${ui.mcSlide > 0 ? 'sc-in-r' : ui.mcSlide < 0 ? 'sc-in-l' : ''}"><div class="sc-mh">${MC_DAY.map((d) => `<span>${d}</span>`).join('')}</div>
    <div class="sc-mg">${cells.slice(0, rows * 7).map((d) => d.slice(0, 7) !== ym ? '<span></span>'
      : `<button class="sc-d ${d === today ? 'today' : ''} ${d === s.date ? 'sel' : ''}" data-act="mcSchDay" data-d="${d}"><span class="sc-n">${Number(d.slice(8))}</span>${dots(d)}</button>`).join('')}</div></div>`;
  // Month buttons: this month and the next eleven, with the year where it changes.
  const m0 = new Date(`${today.slice(0, 7)}-01T12:00:00`);
  const months = Array.from({ length: 12 }, (_, i) => { const d = new Date(m0); d.setMonth(m0.getMonth() + i); return d.toISOString().slice(0, 7); });
  const chips = `<div class="sc-months">${months.map((m, i) => `${i && m.endsWith('-01') ? `<b class="sc-yr">${m.slice(0, 4)}</b>` : ''}<button class="sc-mo ${m === ym ? 'on' : ''}" data-act="mcSchDay" data-d="${m}-01">${esc(MC_MON[Number(m.slice(5)) - 1].slice(0, 3))}</button>`).join('')}</div>`;
  // The list: from the chosen day (today when you open the Calendar; the 1st when you pick a month), for as many months as you've opened.
  const span = s.span || 3;
  const end = (() => { const d = new Date(`${first}T12:00:00`); d.setMonth(d.getMonth() + span); return d.toISOString().slice(0, 10); })();
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
  const groups = [];
  for (let d = s.date < first ? first : s.date; d < end; d = mcAddDays(d, 1)) {
    const hs = holidaysOn(d);
    const ms = mcOn(shown, d).sort((a, b) => (mcAllDay(b) - mcAllDay(a)) || a.start - b.start);
    if (!hs.length && !ms.length && d !== today) continue;
    const dt = new Date(`${d}T12:00:00`);
    let nowDone = d !== today;
    const items = [...hs.map((h) => `<div class="sc-ev sc-hol">${esc(holLabel(h))}</div>`)];
    for (const m of ms) {
      const timed = !mcAllDay(m);
      if (!nowDone && timed && m.start > nowMin) { items.push('<div class="sc-now"><i></i></div>'); nowDone = true; }
      items.push(`<button class="sc-ev" data-mc-ev="${esc(m.id)}" style="--ec:${esc(m.color || MC_COLORS[0])};color:${esc(mcInk(m.color || MC_COLORS[0]))}"><b>${mcIconHTML(m)}${esc(mcAllDay(m) ? mcAllDayText(m, d) : (m.title || '(No title)'))}</b>${timed ? `<small>${esc(`${mcFmt(m.start)} – ${mcFmt(m.end)}`)}${m.loc ? ` · ${esc(m.loc)}` : ''}</small>` : ''}${mcTeamWho(m) ? `<span class="sc-who">${avatar(mcTeamWho(m), 16)} ${esc(mcTeamWho(m).name)}</span>` : ''}</button>`);
    }
    if (!nowDone) items.push('<div class="sc-now"><i></i></div>');
    if (!ms.length && !hs.length) items.push('<p class="sc-empty muted small">Nothing planned</p>');
    // A month heading where the month changes.
    if (!groups.length || groups[groups.length - 1].ym !== d.slice(0, 7)) groups.push({ ym: d.slice(0, 7), head: true });
    groups.push({ ym: d.slice(0, 7), html: `<div class="sc-day ${d === today ? 'today' : ''}" data-sch-day="${d}"><div class="sc-date"><small>${esc(dt.toLocaleDateString(undefined, { weekday: 'short' }))}</small><b>${dt.getDate()}</b></div><div class="sc-items">${items.join('')}</div></div>` });
  }
  const list = groups.map((g) => (g.head ? `<h3 class="sc-mhead">${esc(MC_MON[Number(g.ym.slice(5)) - 1])} ${g.ym.slice(0, 4)}</h3>` : g.html)).join('')
    || '<p class="muted sc-none">Nothing planned. Tap <b>Create</b> to add something.</p>';
  // A round add button at the bottom right; tap it for Reminder, Birthday or Event (like Google Calendar).
  const fab = `<div class="mc-fab ${ui.mcFab ? 'open' : ''}"><div class="mc-fab-dim" data-act="mcFab"></div><div class="mc-fab-menu">${[['reminder', 'Reminder', 'bell'], ['birthday', 'Birthday', 'cake'], ['event', 'Event', 'cal']].map(([k, l, ic]) => `<button class="mc-fab-it" data-act="mcFabNew" data-k="${k}">${icon(ic, 18)}<span>${l}</span></button>`).join('')}</div><button class="mc-fab-btn" data-act="mcFab" aria-label="Add" aria-expanded="${!!ui.mcFab}">${icon('plus', 26)}</button></div>`;
  return `<div class="sc-wrap">${mini}${ui.mcMini ? chips : ''}<div class="sc-list">${list}<button class="btn ghost sm sc-more" data-act="mcSchMore">Show later months</button></div></div>${fab}`;
}
/** Dark or light text, whichever reads better on the item's colour. */
const mcInk = (c) => (typeof inkOn === 'function' && /^#[0-9a-f]{6}$/i.test(c) ? inkOn(c) : '#fff');
/** Scrolls the schedule to a day (or the next day that has something on). */
function mcSchScrollTo(d) {
  setTimeout(() => {
    const el = $$('[data-sch-day]').find((x) => x.dataset.schDay >= d);
    if (el) el.scrollIntoView({ block: 'start' });
  }, 30);
}
Object.assign(actions, {
  mcSchDay: (el) => { const s = mcState(); s.date = el.dataset.d; if (el.classList.contains('sc-d')) ui.mcMini = false; render(); },
  mcMiniToggle: () => { ui.mcMini = !ui.mcMini; render(); },
  mcSchMore: () => { const s = mcState(); s.span = (s.span || 3) + 3; render(); },
  mcFab: () => { ui.mcFab = !ui.mcFab; const f = $('.mc-fab'); if (!f) return; f.classList.toggle('open', ui.mcFab); $('.mc-fab-btn', f).setAttribute('aria-expanded', ui.mcFab); },
  mcFabNew: (el) => {
    ui.mcFab = false;
    $('.mc-fab')?.classList.remove('open');
    const k = el.dataset.k;
    mcOpen(mcDraft(mcState().date, Math.min(1380, (new Date().getHours() + 1) * 60)));
    // Switch the new item to the type you picked, the same as tapping it in the dialog.
    setTimeout(() => { const b = document.querySelector(`.mc-kinds [data-v="${k}"]`); if (b && k !== 'event') actions.mcKind(b); }, 0);
  },
});


// Swipe the small month: left for the next month, right for the previous one (like the iPhone Calendar).
{
  let sw = null;
  document.addEventListener('pointerdown', (e) => {
    const box = e.target.closest?.('.sc-mini');
    sw = box && e.isPrimary ? { x: e.clientX, y: e.clientY, t: Date.now() } : null;
  });
  document.addEventListener('pointerup', (e) => {
    const d = sw; sw = null;
    if (!d) return;
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    if (Math.abs(dx) < 45 || Math.abs(dx) < Math.abs(dy) * 1.5 || Date.now() - d.t > 800) return;
    const n = dx < 0 ? 1 : -1;
    const s = mcState();
    const m = new Date(`${s.date.slice(0, 7)}-01T12:00:00`);
    m.setMonth(m.getMonth() + n);
    s.date = m.toISOString().slice(0, 10);
    ui.mcSlide = n;
    render();
    ui.mcSlide = 0;
    // The swipe shouldn't also pick the day it started on.
    const stop = (ev) => { ev.preventDefault(); ev.stopPropagation(); };
    document.addEventListener('click', stop, { capture: true, once: true });
    setTimeout(() => document.removeEventListener('click', stop, { capture: true }), 60);
  });
  document.addEventListener('pointercancel', () => { sw = null; });
}

// ---------- Tapping an item: a clean read-only view (like Google Calendar) ----------
// Only what the item has: title, when, repeat, place, call link, your notifications, guests, who made it,
// its calendar, notes and files. Pencil to edit; ••• for Duplicate, Copy to… and Delete.
function mcPeekHTML(m, d) {
  const kind = mcKind(m);
  const loc = mcLocal(m);
  const day = d || loc.date;
  const dt = new Date(`${day}T12:00:00`);
  const dateTxt = dt.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' });
  const when = kind === 'birthday' ? dateTxt
    : kind === 'reminder' ? `${dateTxt} · ${mcFmt(loc.start)}`
    : `${dateTxt} · ${mcFmt(loc.start)} – ${mcFmt(loc.end)}`;
  const rep = kind === 'birthday' ? `Repeats every year${m.by ? ` · turns ${mcAge(m, day)}` : ''}`
    : m.rep === 'custom' ? mcRcText(m.rc, m.date)
    : m.rep ? (MC_REPS.find(([v]) => v === m.rep) || [, ''])[1] : '';
  const zone = kind !== 'birthday' && m.tz && m.tz !== tzNow() ? `${mcFmt(m.start)} in ${tzCity(m.tz)}` : '';
  const row = (ic, html) => `<div class="mp-row"><span class="mp-ic">${icon(ic, 18)}</span><div>${html}</div></div>`;
  const al = mcAlertsFor(m);
  const org = personByKey(m.org);
  const guests = m.att.filter((k) => k !== m.org).map((k) => personByKey(k)).filter(Boolean);
  const cal = m.cal ? mcCalById(m.cal) : null;
  const title = kind === 'birthday' ? mcAllDayText(m, day).replace(/ \(\d+\)$/, '') : (m.title || '(No title)');
  const edit = mcCanEdit(m);
  return `<div class="mp" data-id="${esc(m.id)}" data-d="${esc(day)}">
    <div class="mp-top"><button class="mp-btn" data-act="closeDialog" aria-label="Close">${icon('close', 20)}</button>
      <span class="mp-pill">${edit ? `<button class="mp-btn" data-act="mcPeekEdit" aria-label="Edit" title="Edit">${icon('pencil', 18)}</button>` : ''}<button class="mp-btn" data-act="mcPeekMore" aria-label="More options" title="More">${icon('more', 20)}</button></span></div>
    <div class="mp-row mp-head"><span class="mp-ic"><i class="mp-sq" style="background:${esc(cal?.color || m.color || MC_COLORS[0])}"></i></span><div><h2>${esc(title)}</h2>
      <p>${esc(when)}</p>${rep ? `<p>${esc(rep)}</p>` : ''}${zone ? `<p class="muted">${esc(zone)}</p>` : ''}</div></div>
    ${m.loc ? row('pin', `<a href="${esc(mcMapUrl(m.mapUrl, m.loc))}" target="_blank" rel="noopener">${esc(m.loc)}</a>`) : ''}
    ${m.link ? row('send', `<a class="btn primary sm" href="${esc(m.link)}" target="_blank" rel="noopener">Join call</a>`) : ''}
    ${al.length ? row('bell', al.map((n) => `<p>${esc(mcAlLabel(n))}</p>`).join('')) : ''}
    ${guests.length ? row('guests', `<p>${guests.length + 1} people</p>${[org, ...guests].filter(Boolean).map((p) => `<p class="mp-who">${avatar(p, 20)} ${esc(p.name)}${p === org ? ' <small class="muted">· organiser</small>' : ''}</p>`).join('')}`) : ''}
    ${org ? row('user', `<p>Created by ${esc(org.name)}</p>${org.email ? `<p class="muted small">${esc(org.email)}</p>` : ''}`) : ''}
    ${cal ? row('cal', `<p>${esc(cal.name)}</p>`) : ''}
    ${m.notes ? row('note', `<p class="mp-notes">${esc(m.notes)}</p>`) : ''}
    ${(m.files || []).length ? row('clip', m.files.map((f) => `<p><button type="button" class="linklike" data-act="mcFileOpen" data-id="${esc(f.id)}">${esc(f.name)}</button></p>`).join('')) : ''}
  </div>`;
}
function mcPeek(m, d) {
  $$('dialog.mc-dlg').forEach((x) => x.close());
  const dlg = showDialog({ title: '', html: mcPeekHTML(m, d) });
  dlg?.classList?.add('mc-dlg', 'mc-peek');
  ui.mcPeek = { id: m.id, d };
}
const mcPeekItem = () => mcAll().find((x) => x.id === ui.mcPeek?.id);
/** A copy of an item: new id, you as organiser, on the given calendar ('' = My calendar). */
function mcCopyOf(m, cal) {
  const c = clone(m);
  c.id = uid();
  c.org = pkey(S.meId);
  c.att = [pkey(S.meId), ...(cal === m.cal ? m.att.filter((k) => k !== m.org && k !== pkey(S.meId)) : [])];
  c.cal = cal;
  c.al = { [pkey(S.meId)]: mcAlertsFor(m) };
  c.at = Date.now();
  return mcNorm(c);
}
Object.assign(actions, {
  mcPeekEdit: () => { const m = mcPeekItem(); if (m) mcOpen(m); },
  mcPeekMore: (el) => {
    const m = mcPeekItem();
    if (!m) return;
    const items = [
      { icon: 'copy', label: 'Duplicate', run: () => { const c = mcCopyOf(m, m.cal); c.title = m.title; mcOpen(c); } },
    ];
    const cals = mcMyCals();
    if (cals.length) items.push({ icon: 'cal', label: 'Copy to…', sub: true, run: () => setTimeout(() => openMenu(el, [
      ...(m.cal ? [{ icon: 'cal', label: 'My calendar', run: () => mcCopyTo(m, '') }] : []),
      ...cals.filter((c) => c.id !== m.cal).map((c) => ({ icon: 'cal', label: c.name, run: () => mcCopyTo(m, c.id) })),
    ]), 0) });
    if (mcCanEdit(m)) items.push('-', { icon: 'trash', label: 'Delete', danger: true, run: () => mcToBin(m) });
    openMenu(el, items);
  },
});
/** Copy to…: saves a copy straight onto that calendar. */
function mcCopyTo(m, cal) {
  const c = mcCopyOf(m, cal);
  if (!c) return;
  mcPlan(true);
  mcAll().push(c);
  mcDirty();
  $$('dialog.mc-dlg').forEach((x) => x.close());
  commit();
  toast(`Copied to ${cal ? mcCalById(cal)?.name || 'that calendar' : 'My calendar'}.`);
}
