'use strict';
// ---------- Yearly Planner ----------
// A year at a glance for the big things: one block per month, a row per day with Event,
// Itinerary, Transport and Hotel. It stands apart from tasks; any day can be turned into a task
// when there is something to do. Weekends are tinted, today is marked, and a day can be given a
// colour. Kept with your own settings and synced to your other devices.

const YR_COLS = [['ev', 'Event'], ['it', 'Itinerary'], ['tr', 'Transport'], ['ho', 'Hotel']];
const yr = () => (S.settings.yearly = S.settings.yearly && typeof S.settings.yearly === 'object' ? S.settings.yearly : { d: {} });
const yrDays = () => (yr().d = yr().d && typeof yr().d === 'object' ? yr().d : {});
const yrDay = (iso) => yrDays()[iso] || {};
const yrIso = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const YR_WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const YR_MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function yrSet(iso, k, v) {
  const d = { ...yrDay(iso) };
  if (v === '' || v === null || v === undefined) delete d[k]; else d[k] = v;
  const days = yrDays();
  if (Object.keys(d).length) days[iso] = d; else delete days[iso];
}
/** Which months are on screen: H1, H2 or the whole year. */
function yrMonths() {
  const v = ui.yr || (ui.yr = { year: new Date().getFullYear(), span: new Date().getMonth() < 6 ? 'h1' : 'h2' });
  const ms = v.span === 'h1' ? [1, 2, 3, 4, 5, 6] : v.span === 'h2' ? [7, 8, 9, 10, 11, 12] : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  return ms.map((m) => ({ y: v.year, m }));
}

function yrMonthHTML({ y, m }) {
  const n = new Date(y, m, 0).getDate();
  const today = todayISO();
  const rows = [];
  for (let d = 1; d <= 31; d += 1) {
    if (d > n) { rows.push(`<tr class="yr-none"><td class="yr-dn"></td><td class="yr-wd"></td>${YR_COLS.map(() => '<td></td>').join('')}<td></td></tr>`); continue; }
    const iso = yrIso(y, m, d);
    const wd = new Date(y, m - 1, d).getDay();
    const day = yrDay(iso);
    rows.push(`<tr class="${wd === 0 || wd === 6 ? 'yr-we' : ''} ${iso === today ? 'yr-today' : ''}" data-iso="${iso}">
      <td class="yr-dn">${d}</td><td class="yr-wd">${YR_WD[wd]}</td>
      ${YR_COLS.map(([k, label]) => `<td class="yr-${k}" ${k === 'ev' && day.c ? `style="--yc:${esc(day.c)}"` : ''}><input value="${esc(day[k] || '')}" data-change="yrCell" data-iso="${iso}" data-k="${k}" aria-label="${esc(`${label}, ${d} ${YR_MON[m - 1]} ${y}`)}" autocomplete="off"></td>`).join('')}
      <td class="yr-act">${day.task && taskById(day.task) ? `<button class="yr-tlink" data-open-task="${esc(day.task)}" title="Open its task" aria-label="Open its task">${icon('check', 12)}</button>` : ''}<button class="icon-btn yr-more" data-act="yrMenu" data-iso="${iso}" aria-label="Options for ${d} ${YR_MON[m - 1]}">${icon('more', 14)}</button></td></tr>`);
  }
  const cur = today.slice(0, 7) === yrIso(y, m, 1).slice(0, 7);
  return `<section class="yr-month ${cur ? 'yr-cur' : ''}"><table class="yr-tbl">
    <colgroup><col class="c-dn"><col class="c-wd">${YR_COLS.map(([k]) => `<col class="c-${k}">`).join('')}<col class="c-act"></colgroup>
    <thead><tr class="yr-mh"><th colspan="${YR_COLS.length + 3}">${YR_MON[m - 1]} ${String(y).slice(2)}${cur ? '<span class="yr-curtag">This month</span>' : ''}</th></tr>
      <tr><th class="yr-dn"></th><th class="yr-wd"></th>${YR_COLS.map(([k, l]) => `<th class="yr-${k}">${l}</th>`).join('')}<th class="yr-act"></th></tr></thead>
    <tbody>${rows.join('')}</tbody></table></section>`;
}
function renderYearly() {
  const months = yrMonths();
  const v = ui.yr;
  const count = Object.keys(yrDays()).filter((k) => k.startsWith(`${v.year}-`) && yrDays()[k].ev).length;
  return `<div class="page yr-page">
    <header class="bp-head"><div><h1>Yearly Planner <span class="bp-sub">${v.year}</span></h1><p class="small muted">The big events of the year. Not linked to tasks; turn a day into a task from its ⋯ menu when needed.</p></div>
      <div class="spacer"></div>
      <div class="seg">${[['h1', 'Jan – Jun'], ['h2', 'Jul – Dec'], ['year', 'Full Year']].map(([k, l]) => `<button class="${v.span === k ? 'on' : ''}" data-act="yrSpan" data-v="${k}">${l}</button>`).join('')}</div>
      <div class="row bp-year"><button class="icon-btn" data-act="yrYear" data-d="-1" aria-label="Previous year">${icon('chevL')}</button><b>${v.year}</b><button class="icon-btn" data-act="yrYear" data-d="1" aria-label="Next year">${icon('chevR')}</button></div>
    </header>
    <p class="small muted yr-count">${count} day${count === 1 ? '' : 's'} with an event in ${v.year}</p>
    <div class="yr-scroll" data-scroll="yearly"><div class="yr-months">${months.map(yrMonthHTML).join('')}</div></div>
  </div>`;
}

function yrMenuHTML(iso) {
  const day = yrDay(iso);
  const t = day.task && taskById(day.task);
  return `<div class="menu yr-menu" role="menu">
    <p class="yr-mlabel">${esc(dayLabel(iso))} · colour</p>
    <div class="yr-sw">${[{ v: '', label: 'None' }, ...tbColors(day.c).filter((c) => c.v)].map((c) => `<button class="yr-swb ${c.v === (day.c || '') ? 'on' : ''}" data-act="yrColour" data-iso="${iso}" data-v="${esc(c.v)}" title="${esc(c.label)}" aria-label="${esc(c.label)}" style="--yc:${c.v || 'transparent'}"></button>`).join('')}</div>
    <hr><button role="menuitem" data-act="yrRepeat" data-iso="${iso}">${icon('repeat', 15)}<span>Repeat to the next days…</span></button>
    ${t ? `<button role="menuitem" data-open-task="${esc(t.id)}">${icon('check', 15)}<span>Open its task</span></button>` : `<button role="menuitem" data-act="yrTask" data-iso="${iso}">${icon('plus', 15)}<span>Create a task for this day</span></button>`}
    <button role="menuitem" class="danger" data-act="yrClear" data-iso="${iso}">${icon('close', 15)}<span>Clear this day</span></button>
  </div>`;
}
const yrNext = (iso, n) => { const d = new Date(`${iso}T12:00:00`); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

Object.assign(actions, {
  yrSpan: (el) => { ui.yr.span = el.dataset.v; render(); },
  yrYear: (el) => { ui.yr.year += Number(el.dataset.d); render(); },
  yrMenu: (el) => openPop(el, () => yrMenuHTML(el.dataset.iso)),
  yrColour: (el) => { yrSet(el.dataset.iso, 'c', el.dataset.v); closePop(); commit(); },
  yrClear: async (el) => {
    const iso = el.dataset.iso;
    closePop();
    if (!Object.keys(yrDay(iso)).length) return;
    const before = clone(yrDay(iso));
    delete yrDays()[iso];
    commit();
    toast('Day cleared.', { undo: () => { yrDays()[iso] = before; commit(); } });
  },
  yrRepeat: async (el) => {
    const iso = el.dataset.iso;
    closePop();
    const day = yrDay(iso);
    if (!YR_COLS.some(([k]) => day[k])) { toast('Write something on this day first.'); return; }
    const n = Number(await promptDlg('Repeat to the next days', 'How many more days?', '1', 'Repeat'));
    if (!Number.isInteger(n) || n < 1) return;
    const days = Math.min(n, 120);
    for (let i = 1; i <= days; i += 1) {
      const to = yrNext(iso, i);
      const keep = yrDay(to);
      yrDays()[to] = { ...keep, ...Object.fromEntries(YR_COLS.filter(([k]) => day[k]).map(([k]) => [k, day[k]])), ...(day.c ? { c: day.c } : {}) };
    }
    commit();
    toast(`Copied to the next ${days} day${days === 1 ? '' : 's'}.`);
  },
  yrTask: (el) => {
    const iso = el.dataset.iso;
    closePop();
    const day = yrDay(iso);
    const plan = personalPlan();
    const title = day.ev || day.it || `Plan for ${dayLabel(iso)}`;
    const notes = [day.it && `Itinerary: ${day.it}`, day.tr && `Transport: ${day.tr}`, day.ho && `Hotel: ${day.ho}`].filter(Boolean).join('\n');
    const t = addTask({ planId: plan.id, bucketId: plan.buckets[0]?.id || null, title, notes: `From the Yearly Planner · ${dayLabel(iso)}${notes ? `\n${notes}` : ''}`, due: iso, assignees: [S.meId] });
    yrSet(iso, 'task', t.id);
    commit();
    toast('Task created.', { action: { label: 'Open', run: () => openTask(t.id) } });
  },
});
Object.assign(changes, {
  yrCell: (el) => { yrSet(el.dataset.iso, el.dataset.k, el.value.trim().slice(0, 300)); Store.save(); },
});
// Keep the fields of the row you were typing in when the page redraws (only the changed cell is saved; no redraw needed).
