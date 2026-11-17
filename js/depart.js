'use strict';
/* Time to leave: for events with a place, Planner estimates the drive from where you are (or a saved
   place you choose) and tells you when to head off, with a buffer (30 minutes unless you change it in
   Settings › Calendar). Pan Pan brings the news. Drive times come from OSRM (OpenStreetMap routing,
   no live traffic, which the buffer allows for); addresses are found with Photon. Works while Planner
   is open. Your position is used only to ask for the route and is not stored or shared. */

const depPrefs = () => ({ on: true, buffer: 30, from: 'here', ...(S.settings.depart || {}) });
const depKey = 'planner-depart-fired';
let depHere = null;   // { lat, lon, at }
const depRoutes = {}; // "from|to" -> { sec, at }
const depGeo = {};    // address text -> { lat, lon }

/** Where you set off from: this device's location, or a saved place. */
function depOrigin() {
  const p = depPrefs();
  if (p.from && p.from !== 'here') {
    const pl = mcPlaces().find((x) => x.id === p.from);
    if (pl?.lat != null) return Promise.resolve({ lat: pl.lat, lon: pl.lon });
    return pl ? depGeocode(mcPlaceText(pl)) : Promise.resolve(null);
  }
  if (depHere && Date.now() - depHere.at < 10 * 60000) return Promise.resolve(depHere);
  if (!navigator.geolocation) return Promise.resolve(null);
  return new Promise((res) => navigator.geolocation.getCurrentPosition(
    (pos) => { depHere = { lat: pos.coords.latitude, lon: pos.coords.longitude, at: Date.now() }; res(depHere); },
    () => res(null), { maximumAge: 10 * 60000, timeout: 15000 }));
}
async function depGeocode(text) {
  const q = String(text || '').trim();
  if (!q || mcIsLink(q)) return null;
  if (depGeo[q]) return depGeo[q];
  try {
    const j = await (await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=1&lang=en${/^Australia\//.test(tzHome()) ? '&lat=-37.81&lon=144.96' : ''}`)).json();
    const c = j.features?.[0]?.geometry?.coordinates;
    if (c) return (depGeo[q] = { lat: c[1], lon: c[0] });
  } catch { /* offline */ }
  return null;
}
async function depDrive(from, to) {
  const k = `${from.lat.toFixed(3)},${from.lon.toFixed(3)}|${to.lat.toFixed(4)},${to.lon.toFixed(4)}`;
  if (depRoutes[k] && Date.now() - depRoutes[k].at < 15 * 60000) return depRoutes[k].sec;
  try {
    const j = await (await fetch(`https://router.project-osrm.org/route/v1/driving/${from.lon},${from.lat};${to.lon},${to.lat}?overview=false`)).json();
    const sec = j.routes?.[0]?.duration;
    if (Number.isFinite(sec)) { depRoutes[k] = { sec, at: Date.now() }; return sec; }
  } catch { /* offline */ }
  return null;
}
const depDest = (m) => (m.geo ? Promise.resolve(m.geo) : depGeocode(m.loc));
const depNeeds = (m) => m.loc && !mcIsLink(m.loc) && ['event', 'meeting'].includes(mcKind(m));
const depDirections = (m) => `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(m.geo ? `${m.geo.lat},${m.geo.lon}` : m.loc)}&travelmode=driving`;

/** In the event form: "About 25 min drive · leave by 1:05 pm". */
async function departPreview(form) {
  const box = form?.querySelector('.mc-travel');
  if (!box) return;
  const loc = form.querySelector('[name="loc"]')?.value || '';
  if (!depPrefs().on || !loc.trim() || mcIsLink(loc)) { box.hidden = true; return; }
  box.hidden = false;
  box.textContent = '🚗 Working out the drive…';
  const [lat, lon] = String(form.querySelector('[name="geo"]')?.value || '').split(',').map(Number);
  const to = Number.isFinite(lat) && Number.isFinite(lon) && form.querySelector('[name="geo"]').value ? { lat, lon } : await depGeocode(loc);
  const from = await depOrigin();
  if (!to || !from) { box.textContent = from ? '🚗 Couldn’t find that address on the map.' : '🚗 Allow location (or pick a start point in Settings › Calendar) to see the drive time.'; return; }
  const sec = await depDrive(from, to);
  if (sec === null) { box.textContent = '🚗 Drive time unavailable right now.'; return; }
  const min = Math.max(1, Math.round(sec / 60));
  const start = twMin(form.querySelector('[name="start"]')?.value);
  const leave = start !== null ? start - min - depPrefs().buffer : null;
  box.innerHTML = `🚗 About <b>${esc(fmtDur(min))}</b> drive${depPrefs().from === 'here' ? ' from here' : ''}${leave !== null && leave >= 0 ? ` · leave by <b>${esc(fmtTime(leave))}</b> <span class="muted">(${depPrefs().buffer} min buffer)</span>` : ''}`;
}
if (typeof mcOpen === 'function') {
  const depOrigOpen = mcOpen;
  mcOpen = function (m) { depOrigOpen(m); setTimeout(() => departPreview($('dialog.mc-dlg form')), 50); };
}

/** Checks your events in the next few hours and tells you when it's time to go. */
let depBusy = false;
async function departCheck() {
  if (depBusy || !depPrefs().on || typeof mcPlan !== 'function' || !mcPlan() || !navigator.onLine) return;
  depBusy = true;
  try {
    let fired = {};
    try { fired = JSON.parse(localStorage.getItem(depKey) || '{}'); } catch { fired = {}; }
    const now = Date.now();
    const soon = mcAll().filter((m) => mcMine(m) && depNeeds(m)).map((m) => ({ m, at: tzToUtc(m.date, m.start, mcZone(m)) }))
      .filter(({ at }) => at > now && at - now < 4 * 3600000);
    if (!soon.length) return;
    const from = await depOrigin();
    if (!from) return;
    for (const { m, at } of soon) {
      const key = `${m.id}|${m.date}|${m.start}`;
      if (fired[key]) continue;
      const to = await depDest(m);
      if (!to) continue;
      const sec = await depDrive(from, to);
      if (sec === null) continue;
      const leaveAt = at - sec * 1000 - depPrefs().buffer * 60000;
      if (now < leaveAt) continue;
      fired[key] = now;
      try { localStorage.setItem(depKey, JSON.stringify(fired)); } catch { /* fine */ }
      departPopup(m, Math.round(sec / 60), at);
    }
  } finally { depBusy = false; }
}
async function departPopup(m, min, at) {
  const local = mcLocal(m);
  const left = Math.max(0, Math.round((at - Date.now()) / 60000));
  const text = `Time to head off for ${m.title || 'your event'} at ${fmtTime(local.start)}: about ${fmtDur(min)} drive to ${m.loc}.`;
  notify({ id: uid(), at: Date.now(), taskId: null, read: false, kind: 'review', route: '#/meet', text: `🚗 ${text}` });
  if (typeof playReminderSound === 'function') playReminderSound();
  commit();
  const v = await choiceDlg('Time to head off!', `<div class="rest-pan"><img src="icons/panpan/panpan.png" alt="Pan Pan" width="110"><div class="rest-bubble"><b>Pan Pan</b><span>“Grab your things, let’s go! I’ll save you a seat.”</span></div></div>
    <p class="rest-line">${esc(m.title || 'Your event')} · ${esc(fmtTime(local.start))}</p>
    <p class="rest-idea">📍 ${esc(m.loc)}<br>🚗 About <b>${esc(fmtDur(min))}</b> drive · starts in ${esc(fmtDur(left))} <span class="muted">(${depPrefs().buffer} min buffer)</span></p>`,
  [{ v: 'go', label: 'Open Google Maps', primary: true }, { v: 'later', label: 'In 5 min' }, { v: 'ok', label: 'OK' }]);
  if (v === 'go') window.open(depDirections(m), '_blank', 'noopener');
  else if (v === 'later') setTimeout(() => departPopup(m, min, at), 5 * 60000);
}
setInterval(departCheck, 2 * 60000);
setTimeout(departCheck, 6000);

// Settings › Calendar › Time to leave
function departSettingsHTML() {
  const p = depPrefs();
  return `<label class="mini"><input type="checkbox" data-change="depOn" ${p.on ? 'checked' : ''}> Tell me when to leave for events with a place</label>
    <label class="mini">Buffer <select data-change="depBuffer">${[...new Set([0, 10, 15, 20, 30, 45, 60, p.buffer])].sort((a, b) => a - b).map((v) => `<option value="${v}" ${v === p.buffer ? 'selected' : ''}>${v ? `${v} minutes` : 'No buffer'}</option>`).join('')}</select></label>
    <label class="mini">Start from <select data-change="depFrom"><option value="here" ${p.from === 'here' ? 'selected' : ''}>Where I am (this device's location)</option>${mcPlaces().map((pl) => `<option value="${esc(pl.id)}" ${p.from === pl.id ? 'selected' : ''}>⭐ ${esc(pl.name || pl.addr)}</option>`).join('')}</select></label>
    <p class="small muted">Drive time is estimated without live traffic; the buffer covers parking and traffic. Works while Planner is open.</p>`;
}
Object.assign(changes, {
  depOn: (el) => { S.settings.depart = { ...depPrefs(), on: el.checked }; Store.save(); },
  depBuffer: (el) => { S.settings.depart = { ...depPrefs(), buffer: Number(el.value) }; Store.save(); },
  depFrom: (el) => { S.settings.depart = { ...depPrefs(), from: el.value }; Store.save(); },
});
document.addEventListener('change', (e) => { if (e.target.matches?.('.mc-form [name="start"], .mc-form [name="date"]')) departPreview(e.target.closest('form')); });
