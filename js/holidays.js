'use strict';
// ---------- Public holidays and school holidays (VIC, NSW, ACT) ----------
// Public holidays come live from date.nager.at (free, no key; refreshed weekly and kept on this
// device for offline use). School term dates are published by each government only as web pages,
// so they are written here from those pages and updated with app releases:
//   VIC  https://www.vic.gov.au/school-term-dates-and-holidays-victoria        (2026–2030)
//   NSW  https://education.nsw.gov.au/schooling/calendars  (eastern division)  (2026–2028)
//   ACT  https://www.act.gov.au/living-in-the-act/public-holidays-school-terms-and-daylight-saving (2026–2027)
// School holidays are the days between terms (NSW: its published holiday periods).

const HOL_REGIONS = [['VIC', 'Victoria'], ['NSW', 'New South Wales'], ['ACT', 'ACT']];
const SCHOOL_TERMS = {
  VIC: [
    ['2026-01-27', '2026-04-02'], ['2026-04-20', '2026-06-26'], ['2026-07-13', '2026-09-18'], ['2026-10-05', '2026-12-18'],
    ['2027-01-27', '2027-03-25'], ['2027-04-12', '2027-06-25'], ['2027-07-12', '2027-09-17'], ['2027-10-04', '2027-12-17'],
    ['2028-01-27', '2028-03-31'], ['2028-04-18', '2028-06-30'], ['2028-07-17', '2028-09-22'], ['2028-10-09', '2028-12-21'],
    ['2029-01-29', '2029-03-29'], ['2029-04-16', '2029-06-29'], ['2029-07-16', '2029-09-21'], ['2029-10-08', '2029-12-21'],
    ['2030-01-29', '2030-04-05'], ['2030-04-23', '2030-06-28'], ['2030-07-15', '2030-09-20'], ['2030-10-07', '2030-12-20'],
  ],
  NSW: [
    ['2026-02-02', '2026-04-02'], ['2026-04-22', '2026-07-03'], ['2026-07-21', '2026-09-25'], ['2026-10-13', '2026-12-17'],
    ['2027-01-28', '2027-04-09'], ['2027-04-27', '2027-07-02'], ['2027-07-19', '2027-09-24'], ['2027-10-11', '2027-12-17'],
    ['2028-01-31', '2028-04-07'], ['2028-04-24', '2028-07-07'], ['2028-07-24', '2028-09-29'], ['2028-10-16', '2028-12-21'],
  ],
  ACT: [
    ['2026-02-02', '2026-04-02'], ['2026-04-21', '2026-07-03'], ['2026-07-21', '2026-09-25'], ['2026-10-13', '2026-12-18'],
    ['2027-02-02', '2027-04-09'], ['2027-04-28', '2027-07-02'], ['2027-07-20', '2027-09-24'], ['2027-10-12', '2027-12-17'],
  ],
};
// NSW publishes its holiday periods (they differ from the gaps by staff development days).
const NSW_SCHOOL_HOLS = [
  ['2025-12-22', '2026-01-26', 'Summer'], ['2026-04-07', '2026-04-17', 'Autumn'], ['2026-07-06', '2026-07-17', 'Winter'], ['2026-09-28', '2026-10-09', 'Spring'],
  ['2026-12-18', '2027-01-27', 'Summer'], ['2027-04-12', '2027-04-23', 'Autumn'], ['2027-07-05', '2027-07-16', 'Winter'], ['2027-09-27', '2027-10-08', 'Spring'],
  ['2027-12-21', '2028-01-28', 'Summer'], ['2028-04-10', '2028-04-21', 'Autumn'], ['2028-07-10', '2028-07-21', 'Winter'], ['2028-10-03', '2028-10-13', 'Spring'],
  ['2028-12-22', '2029-01-25', 'Summer'],
];
const holAdd = (iso, n) => { const d = new Date(`${iso}T12:00:00`); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
/** Settings: which regions, and whether to show public and school holidays. */
const holPrefs = () => {
  const h = S.settings.hol && typeof S.settings.hol === 'object' ? S.settings.hol : {};
  return { regions: Array.isArray(h.regions) ? h.regions : ['VIC'], pub: h.pub !== false, school: h.school !== false };
};

// School: a map iso -> [{region, label}] built once per data set.
let holSchoolMap = null;
function holSchool() {
  if (holSchoolMap) return holSchoolMap;
  const m = {};
  const put = (from, to, region, label) => { for (let d = from, i = 0; d <= to && i < 80; d = holAdd(d, 1), i += 1) (m[d] = m[d] || []).push({ region, label, kind: 'school' }); };
  for (const [region, terms] of Object.entries(SCHOOL_TERMS)) {
    terms.forEach(([s, e], i) => {
      const t = (i % 4) + 1;
      (m[s] = m[s] || []).push({ region, label: `Term ${t} starts`, kind: 'term' });
      (m[e] = m[e] || []).push({ region, label: `Term ${t} ends`, kind: 'term' });
      if (region !== 'NSW' && terms[i + 1]) put(holAdd(e, 1), holAdd(terms[i + 1][0], -1), region, 'School holidays');
    });
  }
  NSW_SCHOOL_HOLS.forEach(([s, e, n]) => put(s, e, 'NSW', `${n} school holidays`));
  holSchoolMap = m;
  return m;
}

// Public holidays: fetched per year, cached on this device.
const HOL_CACHE = 'planner-pubhol-v1';
let holPub = (() => { try { return JSON.parse(localStorage.getItem(HOL_CACHE) || '{}'); } catch { return {}; } })();
const holPending = new Set();
function holFetch(year) {
  const c = holPub[year];
  if ((c && Date.now() - c.at < 7 * 864e5) || holPending.has(year) || !navigator.onLine) return;
  holPending.add(year);
  fetch(`https://date.nager.at/api/v3/PublicHolidays/${year}/AU`).then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.status)))).then((list) => {
    holPub[year] = { at: Date.now(), list: list.map((h) => ({ date: h.date, name: h.localName || h.name, regions: Array.isArray(h.counties) && h.counties.length ? h.counties.map((x) => x.replace('AU-', '')) : null })) };
    try { localStorage.setItem(HOL_CACHE, JSON.stringify(holPub)); } catch { /* full or blocked: keep in memory */ }
    if (['yearly', 'meet'].includes(ui.route?.view)) render();
  }).catch(() => { /* offline or blocked: try again later */ }).finally(() => holPending.delete(year));
}

/** What's on a day for the regions picked: [{label, kind: 'pub'|'school'|'term', region}]. */
function holidaysOn(iso) {
  const p = holPrefs();
  const out = [];
  if (p.pub) {
    const y = iso.slice(0, 4);
    holFetch(y);
    (holPub[y]?.list || []).filter((h) => h.date === iso).forEach((h) => {
      const rs = h.regions ? h.regions.filter((r) => p.regions.includes(r)) : p.regions;
      if (rs.length) out.push({ label: h.name, kind: 'pub', region: h.regions ? rs.join('/') : 'National' });
    });
  }
  if (p.school) {
    const seen = new Set();
    (holSchool()[iso] || []).filter((x) => p.regions.includes(x.region)).forEach((x) => {
      const k = `${x.kind}|${x.label}`;
      const same = out.find((o) => `${o.kind}|${o.label}` === k);
      if (same) { if (!same.region.includes(x.region)) same.region += `/${x.region}`; return; }
      if (!seen.has(k)) { seen.add(k); out.push({ ...x }); }
    });
  }
  return out;
}
const holLabel = (h) => `${h.label}${h.region && h.region !== 'National' ? ` (${h.region})` : ''}`;

/** The little settings panel used by the Yearly Planner and Meeting Calendar. */
function holPickerHTML() {
  const p = holPrefs();
  return `<div class="picker hol-pick"><h4>Holidays shown</h4>
    ${HOL_REGIONS.map(([k, l]) => `<label class="hol-opt"><input type="checkbox" data-change="holRegion" value="${k}" ${p.regions.includes(k) ? 'checked' : ''}> ${esc(l)}</label>`).join('')}
    <hr><label class="hol-opt"><input type="checkbox" data-change="holKind" value="pub" ${p.pub ? 'checked' : ''}> Public holidays</label>
    <label class="hol-opt"><input type="checkbox" data-change="holKind" value="school" ${p.school ? 'checked' : ''}> School terms and holidays</label>
    <p class="small muted">Public holidays update by themselves. School terms come from each state's education website and are updated with the app.</p></div>`;
}
Object.assign(actions, { holPick: (el) => openPop(el, holPickerHTML) });
Object.assign(changes, {
  holRegion: (el) => { const p = holPrefs(); const rs = new Set(p.regions); if (el.checked) rs.add(el.value); else rs.delete(el.value); S.settings.hol = { ...p, regions: [...rs] }; Store.save(); render(); },
  holKind: (el) => { const p = holPrefs(); S.settings.hol = { ...p, [el.value]: el.checked }; Store.save(); render(); },
});
