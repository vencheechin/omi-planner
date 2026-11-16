'use strict';
/* Rest: a workout you didn't do can be counted as rest instead (Time Box › Not finished › Rest).
   Fitness then shows how much rest you've taken and the interval between workouts for each activity. */

const isWorkout = (t) => !!t && (t.workType === 'exercise' || !!t.fitAct);
const fitRests = (days) => fit().log.filter((l) => l.act === 'rest' && (!days || days.includes(l.date)));

/** Every session date for an activity over the last n days, oldest first (one per day). */
function fitSessionDays(tg, n = 84) {
  const today = todayISO();
  const days = Array.from({ length: n }, (_, i) => addDays(today, i - n + 1));
  return [...new Set(fitDone(tg, days).map((d) => d.date))].sort();
}
/** Days since the last session, and the usual gap between sessions (average of the recent gaps). */
function fitInterval(tg) {
  const ds = fitSessionDays(tg);
  const gap = (a, b) => Math.round((parseISO(b) - parseISO(a)) / 864e5);
  const gaps = ds.slice(1).map((d, i) => gap(ds[i], d));
  const recent = gaps.slice(-8);
  return {
    last: ds[ds.length - 1] || null,
    since: ds.length ? gap(ds[ds.length - 1], todayISO()) : null,
    avg: recent.length ? Math.round((recent.reduce((a, b) => a + b, 0) / recent.length) * 10) / 10 : null,
    longest: recent.length ? Math.max(...recent) : null,
    rests: fitRests().filter((l) => l.of === tg.id).length,
  };
}
const dayWord = (n) => `${n} day${n === 1 ? '' : 's'}`;

function restSectionHTML(days, weekName) {
  const f = fit();
  const rests = fitRests(days);
  const restMin = rests.reduce((n, l) => n + (l.min || 0), 0);
  const today = todayISO();
  // Rest days: days gone by this week with no workout done.
  const past = days.filter((d) => d <= today);
  const active = new Set(f.targets.flatMap((tg) => fitDone(tg, days).map((x) => x.date)));
  const restDays = past.filter((d) => !active.has(d)).length;
  const rows = f.targets.map((tg) => {
    const iv = fitInterval(tg);
    const plan = tg.times ? Math.round((7 / tg.times) * 10) / 10 : null;
    return `<tr><th>${esc(tg.name)}</th>
      <td>${iv.last ? `${esc(dayLabel(iv.last))} <span class="muted small">(${iv.since === 0 ? 'today' : `${dayWord(iv.since)} ago`})</span>` : '<span class="muted">none yet</span>'}</td>
      <td>${iv.avg === null ? '–' : `every ${iv.avg} days`}${plan ? ` <span class="muted small">· plan every ${plan}</span>` : ''}</td>
      <td>${iv.longest === null ? '–' : dayWord(iv.longest)}</td>
      <td>${iv.rests}</td></tr>`;
  }).join('');
  return `<section class="dr-hub rest-hub"><h2>Rest and recovery <span class="muted small">· ${esc(weekName)}</span></h2>
    <div class="stat-row">
      <div class="stat-tile"><small>Rest days</small><b>${restDays} / ${past.length}</b><span class="muted small">days with no workout so far</span></div>
      <div class="stat-tile"><small>Rest taken</small><b>${rests.length}</b><span class="muted small">${rests.length ? `${esc(fmtDur(restMin))} of workouts rested` : 'tap Rest on a missed workout'}</span></div>
    </div>
    <table class="rest-tbl"><thead><tr><th>Activity</th><th>Last session</th><th>Interval</th><th>Longest gap</th><th>Rests</th></tr></thead><tbody>${rows}</tbody></table>
    <p class="small muted">Interval is the average number of days between your last sessions (up to 12 weeks back). Plan is what your weekly target works out to.</p>
  </section>`;
}

// Fitness page: the rest section goes above Recent.
const restOrigFitness = renderFitness;
renderFitness = function () {
  const html = restOrigFitness();
  const ws = fitWeekStart();
  const thisWeek = ws === weekStartOf(todayISO());
  const sec = restSectionHTML(fitWeek(ws), thisWeek ? 'This week' : `Week of ${fmtDate(ws)}`);
  const at = html.lastIndexOf('<section class="dr-hub"><h2>Recent</h2>');
  return at < 0 ? html + sec : html.slice(0, at) + sec + html.slice(at);
};

Object.assign(actions, {
  /** A missed workout counted as rest: off the Not finished list, logged as rest, not as exercise. */
  fitRest: (el) => {
    const t = taskById(el.dataset.id);
    if (!t) return;
    const entry = { id: uid(), act: 'rest', of: t.fitAct || null, name: t.title || 'Workout', date: t.slotDate || todayISO(), min: durOf(t), at: Date.now() };
    const was = { slotDate: t.slotDate, slotStart: t.slotStart };
    const generated = !!(t.fitAct && (t.fitDay || !t.notes));
    fit().log.push(entry);
    if (generated) S.tasks = S.tasks.filter((x) => x !== t);
    else { t.slotDate = null; t.slotStart = null; }
    commit();
    toast(`Rest taken: ${t.title || 'workout'} on ${dayLabel(entry.date)}.`, { undo: () => {
      fit().log = fit().log.filter((l) => l.id !== entry.id);
      if (generated) S.tasks.push(t); else Object.assign(t, was);
      commit();
    } });
  },
});
