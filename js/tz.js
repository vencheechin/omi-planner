'use strict';
// ---------- Time zones (Calendar) ----------
// Each meeting keeps the time zone it was set in. The calendar shows every meeting in the time zone
// you are in right now (this device's zone), so flying from Melbourne to Auckland moves meetings to
// Auckland time. Your home time zone is remembered, and both show at the top when they differ.

const tzNow = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; } };
const tzValid = (tz) => { try { Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch { return false; } };
/** Your home ("original") time zone: set the first time you open the Calendar, changeable at the top. */
function tzHome() {
  if (!S.settings.homeTz || !tzValid(S.settings.homeTz)) { S.settings.homeTz = tzNow(); Store.save(); }
  return S.settings.homeTz;
}
const tzFmt = {};
function tzParts(tz, ms) {
  const f = tzFmt[tz] || (tzFmt[tz] = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }));
  const p = Object.fromEntries(f.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, min: (Number(p.hour) % 24) * 60 + Number(p.minute) };
}
/** Minutes ahead of UTC in a time zone at a moment. */
function tzOffset(tz, ms) {
  const p = tzParts(tz, ms);
  const asUtc = Date.UTC(Number(p.date.slice(0, 4)), Number(p.date.slice(5, 7)) - 1, Number(p.date.slice(8, 10)), 0, p.min);
  return Math.round((asUtc - Math.floor(ms / 60000) * 60000) / 60000);
}
/** A wall-clock date and time in one zone, as the moment (ms). */
function tzToUtc(date, min, tz) {
  const guess = Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)), 0, min);
  let ms = guess - tzOffset(tz, guess) * 60000;
  const again = guess - tzOffset(tz, ms) * 60000;
  if (again !== ms) ms = again;
  return ms;
}
/** The same moment on another zone's clock: { date, min }. */
function tzConvert(date, min, from, to) {
  if (!from || !to || from === to) return { date, min };
  return tzParts(to, tzToUtc(date, min, from));
}
function tzGmt(tz, ms = Date.now()) {
  const o = tzOffset(tz, ms);
  const h = Math.floor(Math.abs(o) / 60);
  const m = Math.abs(o) % 60;
  return `GMT${o < 0 ? '-' : '+'}${h}${m ? `:${String(m).padStart(2, '0')}` : ''}`;
}
const tzCity = (tz) => String(tz).split('/').pop().replace(/_/g, ' ');
const tzLabel = (tz, ms) => `${tzCity(tz)} (${tzGmt(tz, ms)})`;
const TZ_COMMON = ['Australia/Melbourne', 'Australia/Sydney', 'Australia/Brisbane', 'Australia/Adelaide', 'Australia/Perth', 'Pacific/Auckland', 'Asia/Kuala_Lumpur', 'Asia/Singapore', 'Asia/Shanghai', 'Asia/Hong_Kong', 'Asia/Taipei', 'Asia/Tokyo', 'Asia/Seoul', 'Asia/Bangkok', 'Asia/Jakarta', 'Asia/Dubai', 'Europe/London', 'Europe/Paris', 'America/Los_Angeles', 'America/New_York', 'UTC'];
function tzAll() {
  let all = [];
  try { all = Intl.supportedValuesOf('timeZone'); } catch { all = []; }
  return [...new Set([...TZ_COMMON, ...all])].filter(tzValid);
}
/** A <select> of time zones: the common ones first, then every zone. */
function tzSelectHTML(name, cur, extra = '') {
  const common = TZ_COMMON.filter(tzValid);
  const rest = tzAll().filter((z) => !common.includes(z)).sort();
  const opt = (z) => `<option value="${esc(z)}" ${z === cur ? 'selected' : ''}>${esc(tzLabel(z))}${z === tzNow() ? ' · now' : ''}</option>`;
  return `<select name="${name}" ${extra} aria-label="Time zone"><optgroup label="Common">${common.map(opt).join('')}</optgroup><optgroup label="All time zones">${rest.map(opt).join('')}</optgroup>${[...common, ...rest].includes(cur) ? '' : opt(cur)}</select>`;
}
