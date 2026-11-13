/* Fitness: weekly exercise targets, short movement breaks between work, and how exercise balances
   against the work you've booked. Workouts can go straight into the Time Box; ticking one off counts it.
   Ideas from the top fitness apps: weekly goals and streaks (Apple Fitness, Strava), session logs
   (Hevy, Jefit), and gentle break nudges only during work hours (Moova, Pause.fit, Stretch Break Timer). */

const FIT_BREAK_TYPES = ['Qi Gong', 'Stretching', 'Weight Lifting', 'Walk', 'Breathing'];
function defaultFitness() {
  return {
    targets: [
      { id: uid(), name: 'Running', times: 3, min: 30, at: 420 },
      { id: uid(), name: 'Weight Training', times: 2, min: 45, at: 1110 },
    ],
    breaks: { on: true, every: 90, min: 5, perDay: 4, types: [...FIT_BREAK_TYPES.slice(0, 3)] },
    log: [],
  };
}
/** Your fitness settings and log, filled in with defaults the first time. */
function fit() {
  if (!S.settings.fitness || !Array.isArray(S.settings.fitness.targets)) S.settings.fitness = defaultFitness();
  const f = S.settings.fitness;
  f.breaks = { ...defaultFitness().breaks, ...(f.breaks || {}) };
  f.log = Array.isArray(f.log) ? f.log : [];
  return f;
}
const fitWeek = (iso = todayISO()) => { const s = weekStartOf(iso); return Array.from({ length: 7 }, (_, i) => addDays(s, i)); };
const fitTarget = (id) => fit().targets.find((x) => x.id === id);
/** Sessions done for a target this week: what you logged, plus its Time Box workouts you ticked off. */
function fitDone(tg, days = fitWeek()) {
  const logged = fit().log.filter((l) => l.act === tg.id && days.includes(l.date)).map((l) => ({ date: l.date, min: l.min, logId: l.id }));
  const ticked = S.tasks.filter((t) => t.fitAct === tg.id && isDone(t) && days.includes(t.slotDate || toISO(new Date(t.completedAt || 0)))).map((t) => ({ date: t.slotDate || toISO(new Date(t.completedAt)), min: durOf(t), taskId: t.id }));
  return [...logged, ...ticked];
}
/** Workouts already in the Time Box this week and not done yet. */
const fitBooked = (tg, days = fitWeek()) => S.tasks.filter((t) => t.fitAct === tg.id && !isDone(t) && isScheduled(t) && days.includes(t.slotDate));
const fitBreaksOn = (iso) => fit().log.filter((l) => l.act === 'break' && l.date === iso);

function renderFitness() {
  const f = fit();
  const days = fitWeek();
  const today = todayISO();
  const dayName = (iso) => parseISO(iso).toLocaleDateString(undefined, { weekday: 'narrow' });
  const targetMin = f.targets.reduce((n, tg) => n + tg.times * tg.min, 0);
  const doneMin = f.targets.reduce((n, tg) => n + fitDone(tg).reduce((m, d) => m + d.min, 0), 0);
  const doneSessions = f.targets.reduce((n, tg) => n + Math.min(tg.times, fitDone(tg).length), 0);
  const targetSessions = f.targets.reduce((n, tg) => n + tg.times, 0);
  const workMin = days.reduce((n, iso) => n + scheduledOn(iso).filter((t) => t.workType !== 'exercise' && !(t._task || t).fitAct).reduce((m, t) => m + durOf(t), 0), 0);
  const breaksToday = fitBreaksOn(today);
  const breakMin = days.reduce((n, iso) => n + fitBreaksOn(iso).reduce((m, l) => m + l.min, 0), 0);
  const pct = (a, b) => (b ? Math.min(100, Math.round((a / b) * 100)) : 0);
  const tile = (label, value, note) => `<div class="stat-tile"><small>${label}</small><b>${value}</b>${note ? `<span class="muted small">${note}</span>` : ''}</div>`;
  const ratio = workMin ? Math.round(((doneMin + breakMin) / workMin) * 100) : null;

  const card = (tg) => {
    const done = fitDone(tg);
    const booked = fitBooked(tg);
    const need = Math.max(0, tg.times - done.length - booked.length);
    return `<article class="fit-card">
      <header><h3>${esc(tg.name)}</h3><span class="muted small">${tg.times}× a week · ${esc(fmtDur(tg.min))} each · ${esc(fmtTime(tg.at))}</span>
        <button class="icon-btn" data-act="fitEdit" data-id="${esc(tg.id)}" aria-label="Edit ${esc(tg.name)}" title="Edit">${icon('more', 15)}</button></header>
      <div class="fit-progress" role="img" aria-label="${done.length} of ${tg.times} done this week"><i style="width:${pct(done.length, tg.times)}%"></i></div>
      <div class="fit-week">${days.map((iso) => {
        const d = done.some((x) => x.date === iso);
        const b = booked.some((t) => t.slotDate === iso);
        return `<span class="fit-day ${d ? 'done' : b ? 'booked' : ''} ${iso === today ? 'today' : ''}" title="${esc(`${dayLabel(iso)}: ${d ? 'done' : b ? 'booked' : '—'}`)}">${esc(dayName(iso))}</span>`;
      }).join('')}</div>
      <p class="small"><b>${done.length} of ${tg.times}</b> done${booked.length ? ` · ${booked.length} booked` : ''}${need ? ` · ${need} to plan` : done.length >= tg.times ? ' · target met' : ''}</p>
      <div class="row"><button class="btn ghost sm" data-act="fitLog" data-id="${esc(tg.id)}">${icon('check', 13)} Log a session</button>
        ${need ? `<button class="btn primary sm" data-act="fitBook" data-id="${esc(tg.id)}">${icon('clock', 13)} Book ${need} in Time Box</button>` : ''}</div>
    </article>`;
  };
  const b = f.breaks;
  const opt = (list, cur, unit) => list.map((v) => `<option value="${v}" ${v === cur ? 'selected' : ''}>${v}${unit}</option>`).join('');
  const recent = [...f.log].sort((x, y) => y.at - x.at).slice(0, 12);
  return `<div class="page fit-page">
    <header class="page-head"><h1>Fitness</h1><span class="muted">Work–exercise balance · ${esc(fmtDate(days[0]))} – ${esc(fmtDate(days[6]))}</span></header>
    <div class="stat-row">
      ${tile('Exercise this week', `${fmtDur(doneMin) === '0m' ? '0m' : fmtDur(doneMin)}`, `of ${fmtDur(targetMin)} target`)}
      ${tile('Sessions', `${doneSessions} / ${targetSessions}`, doneSessions >= targetSessions && targetSessions ? 'weekly target met' : 'this week')}
      ${tile('Movement breaks today', `${breaksToday.length} / ${b.perDay}`, b.on ? `every ${b.every} min at work` : 'reminders off')}
      ${tile('Balance', ratio === null ? '–' : `${ratio}%`, workMin ? `${fmtDur(doneMin + breakMin)} moving for ${fmtDur(workMin)} booked work` : 'book work in the Time Box to compare')}
    </div>

    <section class="dr-hub"><h2>Weekly exercise targets</h2>
      <div class="fit-grid">${f.targets.map(card).join('')}
        <button class="fit-add" data-act="fitAdd">${icon('plus', 16)} Add an activity<small class="muted">Swimming, yoga, cycling…</small></button></div>
    </section>

    <section class="dr-hub"><h2>Short exercise between work</h2>
      <p class="small muted">A few minutes of movement every hour or two keeps energy up at the desk. Reminders only come during your working hours (${esc(fmtTime(TB().dayStart))} – ${esc(fmtTime(TB().dayEnd))}) while Planner is open.</p>
      <div class="fit-break-set">
        <label class="mini"><input type="checkbox" data-change="fitBreakOn" ${b.on ? 'checked' : ''}> Remind me</label>
        <label class="mini">Every <select data-change="fitBreakSet" data-k="every">${opt([45, 60, 90, 120], b.every, ' min')}</select></label>
        <label class="mini">For <select data-change="fitBreakSet" data-k="min">${opt([2, 3, 5, 10, 15], b.min, ' min')}</select></label>
        <label class="mini">Goal <select data-change="fitBreakSet" data-k="perDay">${opt([2, 3, 4, 5, 6, 8], b.perDay, ' a day')}</select></label>
      </div>
      <div class="fit-dots" aria-label="${breaksToday.length} of ${b.perDay} breaks today">${Array.from({ length: Math.max(b.perDay, breaksToday.length) }, (_, i) => `<i class="${i < breaksToday.length ? 'on' : ''}"></i>`).join('')}</div>
      <div class="fit-types">${b.types.map((ty) => `<span class="fit-type"><button class="btn ghost sm" data-act="fitBreak" data-v="${esc(ty)}">${icon('plus', 12)} ${esc(ty)}</button><button class="chip-x" data-act="fitTypeDel" data-v="${esc(ty)}" aria-label="Remove ${esc(ty)}">${icon('close', 10)}</button></span>`).join('')}
        <button class="btn ghost sm" data-act="fitTypeAdd">${icon('plus', 12)} Another kind</button></div>
      <p class="small muted">Tap a kind after you've done it to count the break.</p>
    </section>

    <section class="dr-hub"><h2>Recent</h2>
      ${recent.length ? `<ul class="fit-log">${recent.map((l) => `<li><span>${esc(dayLabel(l.date))}</span><b>${esc(l.act === 'break' ? `${l.type || 'Movement'} break` : fitTarget(l.act)?.name || 'Exercise')}</b><span class="muted">${esc(fmtDur(l.min))}</span><button class="chip-x" data-act="fitLogDel" data-id="${esc(l.id)}" aria-label="Remove">${icon('close', 10)}</button></li>`).join('')}</ul>` : '<p class="muted small">Nothing logged yet. Workouts you tick off in the Time Box count too.</p>'}
    </section>
  </div>`;
}

/** Add or change an activity. */
function fitEditDlg(tg) {
  const isNew = !tg;
  const v = tg || { name: '', times: 2, min: 30, at: 420 };
  const d = showDialog({
    title: isNew ? 'Add an activity' : `Edit ${v.name}`,
    html: `<form class="fit-form">
      <label class="field"><span>Activity</span><input name="name" value="${esc(v.name)}" placeholder="e.g. Swimming" required maxlength="40"></label>
      <div class="task-fields two">
        <label class="field"><span>Times a week</span><select name="times">${[1, 2, 3, 4, 5, 6, 7].map((n) => `<option ${n === v.times ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
        <label class="field"><span>How long each time</span><select name="min">${[10, 15, 20, 30, 45, 60, 75, 90, 120].map((n) => `<option value="${n}" ${n === v.min ? 'selected' : ''}>${fmtDur(n)}</option>`).join('')}</select></label>
      </div>
      <label class="field"><span>Usual time</span><input name="at" type="time" step="900" value="${hm(v.at)}"></label>
      <div class="dlg-foot">${isNew ? '' : '<button type="button" class="btn ghost danger-text" data-role="del">Remove</button>'}<span class="spacer"></span><button class="btn primary">${isNew ? 'Add' : 'Save'}</button></div>
    </form>`,
  });
  const form = $('form', d);
  form.onsubmit = (e) => {
    e.preventDefault();
    const data = new FormData(form);
    const next = { name: String(data.get('name')).trim().slice(0, 40), times: Number(data.get('times')), min: Number(data.get('min')), at: parseHM(data.get('at')) ?? v.at };
    if (!next.name) return;
    if (isNew) fit().targets.push({ id: uid(), ...next }); else Object.assign(tg, next);
    d.close();
    commit();
  };
  const del = $('[data-role="del"]', d);
  if (del) del.onclick = () => { fit().targets = fit().targets.filter((x) => x !== tg); d.close(); commit(); toast(`Removed ${v.name}. Past sessions stay in Recent.`); };
}

/** Puts the sessions still needed this week into the Time Box at your usual time, spread across the days left. */
function fitBookWeek(tg) {
  const days = fitWeek().filter((iso) => iso >= todayISO());
  const taken = new Set([...fitDone(tg).map((x) => x.date), ...fitBooked(tg).map((t) => t.slotDate)]);
  let need = tg.times - fitDone(tg).length - fitBooked(tg).length;
  const free = days.filter((iso) => !taken.has(iso) && !(iso === todayISO() && nowMin() > tg.at));
  // Spread them out: every other day first, then fill the gaps.
  const pick = [...free.filter((_, i) => i % 2 === 0), ...free.filter((_, i) => i % 2 === 1)].slice(0, need).sort();
  const p = personalPlan();
  if (!p) { toast('Make a plan first.', { error: true }); return; }
  for (const iso of pick) {
    addTask({ planId: p.id, bucketId: p.buckets[0].id, title: tg.name, assignees: [S.meId], estimate: tg.min, workType: 'exercise', fitAct: tg.id, slotDate: iso, slotStart: tg.at });
    need--;
  }
  commit();
  toast(pick.length ? `Booked ${tg.name} on ${pick.map(dayLabel).join(', ')} at ${fmtTime(tg.at)}. Tick each off in the Time Box when done.` : 'No days left this week to book.');
}

/** A gentle nudge during working hours when a movement break is due (only while Planner is open). */
function fitNudge() {
  const f = S.settings.fitness;
  if (!f?.breaks?.on) return;
  const iso = todayISO();
  const now = nowMin();
  if (!isWorkDay(iso) || now < TB().dayStart + f.breaks.every || now > TB().dayEnd) return;
  const done = fitBreaksOn(iso);
  if (done.length >= f.breaks.perDay) return;
  const lastBreak = done.length ? Math.max(...done.map((l) => { const d = new Date(l.at); return d.getHours() * 60 + d.getMinutes(); })) : TB().dayStart;
  const lastNudge = ui.fitNudgedAt || 0;
  if (now - lastBreak < f.breaks.every || Date.now() - lastNudge < f.breaks.every * 60000) return;
  ui.fitNudgedAt = Date.now();
  const type = f.breaks.types[done.length % Math.max(1, f.breaks.types.length)] || 'Stretching';
  toast(`Time to move: a ${f.breaks.min}-minute ${type} break.`, { action: { label: 'Done', run: () => fitLogBreak(type) } });
}
function fitLogBreak(type) {
  const f = fit();
  f.log.push({ id: uid(), act: 'break', type, date: todayISO(), min: f.breaks.min, at: Date.now() });
  commit();
  const n = fitBreaksOn(todayISO()).length;
  toast(`${type} break logged: ${n} of ${f.breaks.perDay} today.`);
}

Object.assign(actions, {
  fitAdd: () => fitEditDlg(null),
  fitEdit: (el) => fitEditDlg(fitTarget(el.dataset.id)),
  fitBook: (el) => fitBookWeek(fitTarget(el.dataset.id)),
  fitLog: async (el) => {
    const tg = fitTarget(el.dataset.id);
    const v = await promptDlg(`Log ${tg.name}`, 'Minutes', String(tg.min), 'Log');
    if (v === null || v === undefined) return;
    const min = Math.round(Number(String(v).replace(/[^\d.]/g, '')));
    if (!min || min > 600) { toast('Enter the minutes, like 30.', { error: true }); return; }
    fit().log.push({ id: uid(), act: tg.id, date: todayISO(), min, at: Date.now() });
    commit();
    toast(`${tg.name} logged: ${fitDone(tg).length} of ${tg.times} this week.`);
  },
  fitBreak: (el) => fitLogBreak(el.dataset.v),
  fitLogDel: (el) => { const f = fit(); const keep = f.log; f.log = keep.filter((l) => l.id !== el.dataset.id); commit(); toast('Removed.', { undo: () => { f.log = keep; commit(); } }); },
  fitTypeAdd: async () => {
    const v = await promptDlg('Another kind of break', 'Name', '', 'Add');
    const name = String(v || '').trim().slice(0, 30);
    if (!name) return;
    const b = fit().breaks;
    if (!b.types.includes(name)) b.types.push(name);
    commit();
  },
  fitTypeDel: (el) => { const b = fit().breaks; b.types = b.types.filter((x) => x !== el.dataset.v); commit(); },
});
Object.assign(changes, {
  fitBreakOn: (el) => { fit().breaks.on = el.checked; commit(); },
  fitBreakSet: (el) => { fit().breaks[el.dataset.k] = Number(el.value); commit(); },
});
setInterval(fitNudge, 60000);
