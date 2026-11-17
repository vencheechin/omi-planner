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
    breaks: { on: true, every: 25, min: 5, perDay: 4, types: [...FIT_BREAK_TYPES.slice(0, 3)] },
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

/** The week you're looking at (Monday's date), and the targets for it: your usual ones unless you set that week differently. */
const fitWeekStart = () => ui.fitWeek || weekStartOf(todayISO());
const weekTimes = (tg, ws = fitWeekStart()) => tg.weeks?.[ws] ?? tg.times;
const weekBreakGoal = (ws = fitWeekStart()) => fit().breaks.weeks?.[ws] ?? fit().breaks.perDay;
const minsLabel = (v) => (v === 60 ? '1 hour' : v % 60 === 0 ? `${v / 60} hours` : `${v} mins`);
function renderFitness() {
  const f = fit();
  const ws = fitWeekStart();
  const days = fitWeek(ws);
  const today = todayISO();
  const thisWeek = ws === weekStartOf(today);
  const weekName = thisWeek ? 'This week' : ws === addDays(weekStartOf(today), 7) ? 'Next week' : ws === addDays(weekStartOf(today), -7) ? 'Last week' : `Week of ${fmtDate(ws)}`;
  const dayName = (iso) => parseISO(iso).toLocaleDateString(undefined, { weekday: 'narrow' });
  const targetMin = f.targets.reduce((n, tg) => n + weekTimes(tg, ws) * tg.min, 0);
  const doneMin = f.targets.reduce((n, tg) => n + fitDone(tg, days).reduce((m, d) => m + d.min, 0), 0);
  const doneSessions = f.targets.reduce((n, tg) => n + Math.min(weekTimes(tg, ws), fitDone(tg, days).length), 0);
  const targetSessions = f.targets.reduce((n, tg) => n + weekTimes(tg, ws), 0);
  const workMin = days.reduce((n, iso) => n + scheduledOn(iso).filter((t) => t.workType !== 'exercise' && !(t._task || t).fitAct).reduce((m, t) => m + durOf(t), 0), 0);
  const breaksToday = fitBreaksOn(today);
  const breakMin = days.reduce((n, iso) => n + fitBreaksOn(iso).reduce((m, l) => m + l.min, 0), 0);
  const pct = (a, b) => (b ? Math.min(100, Math.round((a / b) * 100)) : 0);
  const tile = (label, value, note) => `<div class="stat-tile"><small>${label}</small><b>${value}</b>${note ? `<span class="muted small">${note}</span>` : ''}</div>`;
  const ratio = workMin ? Math.round(((doneMin + breakMin) / workMin) * 100) : null;

  const card = (tg) => {
    const done = fitDone(tg, days);
    const booked = fitBooked(tg, days);
    const times = weekTimes(tg, ws);
    const own = tg.weeks?.[ws] !== undefined;
    const need = days[6] < today ? 0 : Math.max(0, times - done.length - booked.length);
    return `<article class="fit-card">
      <header><h3>${esc(tg.name)}</h3><span class="muted small">${tg.times}× a week · ${esc(fmtDur(tg.min))} each · ${esc(fmtTime(tg.at))}</span>
        <button class="icon-btn" data-act="fitEdit" data-id="${esc(tg.id)}" aria-label="Edit ${esc(tg.name)}" title="Edit">${icon('more', 15)}</button></header>
      <div class="fit-wk-target"><span class="small">${esc(weekName)}:</span>
        <button class="icon-btn sm" data-act="fitWeekTimes" data-id="${esc(tg.id)}" data-d="-1" aria-label="One fewer" ${times <= 0 ? 'disabled' : ''}>−</button>
        <b>${times}×</b>
        <button class="icon-btn sm" data-act="fitWeekTimes" data-id="${esc(tg.id)}" data-d="1" aria-label="One more" ${times >= 14 ? 'disabled' : ''}>+</button>
        ${own ? `<button class="link-btn small" data-act="fitWeekReset" data-id="${esc(tg.id)}">Usual (${tg.times}×)</button>` : '<span class="small muted">usual</span>'}</div>
      <div class="fit-progress" role="img" aria-label="${done.length} of ${times} done"><i style="width:${pct(done.length, times)}%"></i></div>
      <div class="fit-week">${days.map((iso) => {
        const d = done.some((x) => x.date === iso);
        const b = booked.some((t) => t.slotDate === iso);
        const wd = parseISO(iso).getDay();
        const chosen = (tg.days || []).includes(wd);
        return `<button class="fit-day ${d ? 'done' : b ? 'booked' : ''} ${chosen ? 'chosen' : ''} ${iso === today ? 'today' : ''}" data-act="fitDayToggle" data-id="${esc(tg.id)}" data-d="${wd}" aria-pressed="${chosen}" title="${esc(`${dayLabel(iso)}: ${d ? 'done' : b ? 'booked' : '—'}${chosen ? ' · your day' : ''}. Tap to ${chosen ? 'drop' : 'make it'} one of your ${tg.name} days.`)}">${esc(dayName(iso))}</button>`;
      }).join('')}</div>
      <p class="small muted fit-days-hint">${(tg.days || []).length ? `On ${(tg.days || []).slice().sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map((wd) => new Date(2024, 0, 7 + wd).toLocaleDateString(undefined, { weekday: 'short' })).join(', ')} it waits in Time Box Allocation.` : 'Tap the days you usually do it: it will wait in Time Box Allocation on those days.'}</p>
      <p class="small"><b>${done.length} of ${times}</b> done${booked.length ? ` · ${booked.length} booked` : ''}${need ? ` · ${need} to plan` : done.length >= times && times ? ' · target met' : ''}</p>
      <div class="row"><button class="btn ghost sm" data-act="fitLog" data-id="${esc(tg.id)}">${icon('check', 13)} Log a session</button>
        ${need ? `<button class="btn primary sm" data-act="fitBook" data-id="${esc(tg.id)}">${icon('clock', 13)} Book ${need} in Time Box</button>` : ''}</div>
    </article>`;
  };
  const b = f.breaks;
  // Always show your actual setting, even if it isn't one of the usual choices.
  const opt = (list, cur) => [...new Set([...list, cur])].sort((x, y) => x - y).map((v) => `<option value="${v}" ${v === cur ? 'selected' : ''}>${minsLabel(v)}</option>`).join('');
  const goal = weekBreakGoal(ws);
  const ownGoal = b.weeks?.[ws] !== undefined;
  const recent = [...f.log].sort((x, y) => y.at - x.at).slice(0, 12);
  return `<div class="page fit-page">
    <header class="page-head"><h1>Fitness</h1><span class="muted">Work–exercise balance</span>
      <div class="row fit-weeknav"><button class="icon-btn" data-act="fitWeekNav" data-d="-1" aria-label="Previous week">${icon('chevL')}</button>
        <button class="btn ghost sm" data-act="fitWeekNav" data-d="0" title="Back to this week"><b>${esc(weekName)}</b> <span class="muted">${esc(fmtDate(days[0]))} – ${esc(fmtDate(days[6]))}</span></button>
        <button class="icon-btn" data-act="fitWeekNav" data-d="1" aria-label="Next week">${icon('chevR')}</button></div></header>
    <div class="stat-row">
      ${tile(`Exercise · ${esc(weekName.toLowerCase())}`, `${fmtDur(doneMin) === '0m' ? '0m' : fmtDur(doneMin)}`, `of ${fmtDur(targetMin)} target`)}
      ${tile('Sessions', `${doneSessions} / ${targetSessions}`, doneSessions >= targetSessions && targetSessions ? 'weekly target met' : esc(weekName.toLowerCase()))}
      ${tile(thisWeek ? 'Movement breaks today' : 'Movement breaks', thisWeek ? `${breaksToday.length} / ${goal}` : `${days.reduce((n, iso) => n + fitBreaksOn(iso).length, 0)} / ${goal * 5}`, b.on ? `every ${minsLabel(b.every)} at work` : 'reminders off')}
      ${tile('Balance', ratio === null ? '–' : `${ratio}%`, workMin ? `${fmtDur(doneMin + breakMin)} moving for ${fmtDur(workMin)} booked work` : 'book work in the Time Box to compare')}
    </div>

    <section class="dr-hub"><h2>Weekly exercise targets <span class="muted small">· ${esc(weekName)}</span></h2>
      <div class="fit-grid">${f.targets.map(card).join('')}
        <button class="fit-add" data-act="fitAdd">${icon('plus', 16)} Add an activity<small class="muted">Swimming, yoga, cycling…</small></button></div>
    </section>

    <section class="dr-hub"><h2>Short exercise between work</h2>
      <p class="small muted">A few minutes of movement every hour or two keeps energy up at the desk. Reminders only come during your working hours (${esc(fmtTime(TB().dayStart))} – ${esc(fmtTime(TB().dayEnd))}) while Planner is open.</p>
      <div class="fit-break-set">
        <label class="mini"><input type="checkbox" data-change="fitBreakOn" ${b.on ? 'checked' : ''}> Remind me</label>
        <label class="mini">Every <select data-change="fitBreakSet" data-k="every">${opt([25, 30, 60, 90], b.every)}</select></label>
        <label class="mini">For <select data-change="fitBreakSet" data-k="min">${opt([5, 10, 15, 30, 45, 60], b.min)}</select></label>
        <label class="mini">Usual goal <select data-change="fitBreakSet" data-k="perDay">${[...new Set([2, 3, 4, 5, 6, 8, b.perDay])].sort((x, y) => x - y).map((v) => `<option value="${v}" ${v === b.perDay ? 'selected' : ''}>${v} a day</option>`).join('')}</select></label>
      </div>
      <div class="fit-wk-target"><span class="small">${esc(weekName)}:</span>
        <button class="icon-btn sm" data-act="fitWeekGoal" data-d="-1" aria-label="Lower" ${goal <= 1 ? 'disabled' : ''}>−</button><b>${goal} a day</b>
        <button class="icon-btn sm" data-act="fitWeekGoal" data-d="1" aria-label="Higher" ${goal >= 12 ? 'disabled' : ''}>+</button>
        ${ownGoal ? `<button class="link-btn small" data-act="fitWeekGoalReset">Usual (${b.perDay} a day)</button>` : '<span class="small muted">usual</span>'}</div>
      <p class="fit-selected">${b.on ? `Reminding you every <b>${minsLabel(b.every)}</b>, for <b>${minsLabel(b.min)}</b>, goal <b>${goal} a day</b>${ownGoal ? ` ${esc(weekName.toLowerCase())}` : ''}.` : 'Reminders are off.'}</p>
      <div class="fit-break-week">${days.map((iso) => { const n = fitBreaksOn(iso).length; return `<div class="fbw-day ${iso === today ? 'today' : ''} ${n >= goal ? 'met' : ''}" title="${esc(`${dayLabel(iso)}: ${n} of ${goal}`)}"><small>${esc(dayName(iso))}</small><b>${n}</b><span><i style="height:${Math.min(100, (n / Math.max(1, goal)) * 100)}%"></i></span></div>`; }).join('')}</div>
      <div class="fit-dots" aria-label="${breaksToday.length} of ${goal} breaks today">${Array.from({ length: Math.max(goal, breaksToday.length) }, (_, i) => `<i class="${i < breaksToday.length ? 'on' : ''}" title="${esc(breaksToday[i] ? `${breaksToday[i].type || 'Break'} · ${new Date(breaksToday[i].at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}` : 'Not yet')}"></i>`).join('')}</div>
      <p class="small fit-today">Today: <b>${breaksToday.length} of ${goal}</b>${breaksToday.length ? ` · ${[...new Set(breaksToday.map((l) => l.type || 'Break'))].map((ty) => `${esc(ty)} × ${breaksToday.filter((l) => (l.type || 'Break') === ty).length}`).join(', ')}` : ''}</p>
      <div class="fit-types">${b.types.map((ty) => { const n = breaksToday.filter((l) => l.type === ty).length; return `<span class="fit-type ${n ? 'done' : ''}"><button class="btn ghost sm" data-act="fitBreak" data-v="${esc(ty)}">${n ? icon('check', 12) : icon('plus', 12)} ${esc(ty)}${n ? ` <b class="fit-count">× ${n}</b>` : ''}</button><button class="chip-x" data-act="fitTypeDel" data-v="${esc(ty)}" aria-label="Remove ${esc(ty)}">${icon('close', 10)}</button></span>`; }).join('')}
        <button class="btn ghost sm" data-act="fitTypeAdd">${icon('plus', 12)} Another kind</button></div>
      <p class="small muted">Tap a kind after you've done it to count the break.</p>
    </section>

    <section class="dr-hub"><h2>Recent</h2>
      ${recent.length ? `<ul class="fit-log">${recent.map((l) => `<li><span>${esc(dayLabel(l.date))}</span><b>${esc(l.act === 'rest' ? `Rest · ${l.name || 'Workout'}` : l.act === 'break' ? `${l.type || 'Movement'} break` : fitTarget(l.act)?.name || 'Exercise')}</b><span class="muted">${esc(fmtDur(l.min))}</span><button class="chip-x" data-act="fitLogDel" data-id="${esc(l.id)}" aria-label="Remove">${icon('close', 10)}</button></li>`).join('')}</ul>` : '<p class="muted small">Nothing logged yet. Workouts you tick off in the Time Box count too.</p>'}
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
  if (del) del.onclick = async () => {
    if (!await confirmDlg(`Remove ${v.name}?`, 'Past sessions stay in Recent. You can use Undo at the top if you change your mind.', 'Remove')) return;
    fit().targets = fit().targets.filter((x) => x !== tg); d.close(); commit(); toast(`Removed ${v.name}.`);
  };
}

/** Puts the sessions still needed this week into the Time Box at your usual time, spread across the days left. */
function fitBookWeek(tg) {
  const ws = fitWeekStart();
  const all = fitWeek(ws);
  const days = all.filter((iso) => iso >= todayISO());
  const taken = new Set([...fitDone(tg).map((x) => x.date), ...fitBooked(tg).map((t) => t.slotDate)]);
  let need = weekTimes(tg, ws) - fitDone(tg, all).length - fitBooked(tg, all).length;
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
  // Work for `every` minutes, rest for `min`: the next reminder counts from the end of the last rest.
  const lastBreak = done.length ? Math.max(...done.map((l) => { const d = new Date(l.at); return d.getHours() * 60 + d.getMinutes() + (l.min || 0); })) : TB().dayStart;
  if (now - lastBreak < f.breaks.every || Date.now() < (ui.fitNextNudge || 0) || ui.fitNudgeOpen) return;
  const type = f.breaks.types[done.length % Math.max(1, f.breaks.types.length)] || 'Stretching';
  restPopup(type);
}
// Each reminder: a little emoji picture, a line to make you smile, and something to do.
const REST_LINES = [
  ['🧘‍♀️🌿✨', 'Your chair called. It needs a break from you too.', 'Stand up and stretch tall'],
  ['🐉☁️🏔️', 'The dragon in you is yawning.', 'Qi Gong: lift the sky, push the mountain'],
  ['🦒⬆️☀️', 'Be a giraffe for a minute: reach for the sky.', 'Full-body stretch, arms up high'],
  ['🐢🍵🌸', 'Slow is smooth, smooth is fast.', 'Sip some tea and breathe slowly'],
  ['🙆‍♂️💆‍♀️😌', 'Are your shoulders wearing your ears as earrings again?', 'Roll your shoulders back ten times'],
  ['🐼🎋😴', 'Even pandas take breaks, and they only eat bamboo.', 'Walk around and loosen up'],
  ['🌊🏄‍♂️🐚', 'Ride the wave, don’t become the screen.', 'Gentle Qi Gong flow, like waves'],
  ['🐱🧶🙃', 'Cats stretch 40 times a day. Copy the cat.', 'Cat-cow stretch for your back'],
  ['🚀🪐🌙', 'Mission control says: astronaut needs to float for 5 minutes.', 'Stand, sway and float your arms'],
  ['🌳🍃🐦', 'Trees don’t rush, and they still grow tall.', 'Stand like a tree and breathe'],
  ['🥋🙏✨', 'Even masters pause between moves.', 'A few slow Qi Gong movements'],
  ['☕💧🚶', 'Your water bottle misses you.', 'Refill your water and walk'],
  ['🦩🦵⚖️', 'Flamingo time: one leg, big smile.', 'Balance on each leg for 30 seconds'],
  ['🐻🍯😊', 'Big bear stretch, then a little honey of a break.', 'Big bear stretch, arms wide'],
  ['🎈😮‍💨🌈', 'Breathe in calm, breathe out spreadsheets.', 'Five slow, deep breaths'],
  ['🐧🚶‍♂️❄️', 'Waddle like a penguin. Nobody is watching. Probably.', 'A short walk around'],
  ['🌞🙌🌻', 'Sunflowers turn to the sun. Turn away from the screen.', 'Look out the window, stretch your neck'],
  ['🦥💤🌴', 'Sloth mode activated, but only for 5 minutes.', 'Slow stretch from head to toe'],
  ['🎶💃🕺', 'One song, one dance, zero judges.', 'Dance to one song'],
  ['🐒🌴🍌', 'Shake it out like a happy monkey.', 'Shake your hands, arms and legs'],
  ['🍃🌀🧘', 'Let your thoughts float by like leaves.', 'Breathing and gentle Qi Gong'],
  ['🦉👀💤', 'Wise owls rest their eyes.', 'Close your eyes, then look far away'],
  ['🏔️🧗‍♀️⛅', 'You climbed 25 minutes of mountain. Enjoy the view.', 'Stretch and enjoy the moment'],
  ['🐝🌼🍯', 'Busy bee, the flowers will wait.', 'Step away and stretch'],
  ['🎯✅😎', 'Focus round complete. Achievement unlocked: stretch.', 'Arms up, side bends'],
  ['🦋🌷🌤️', 'Out of the cocoon, butterfly.', 'Open your chest and stretch your arms back'],
  ['🐕🦴❤️', 'Good human. You’ve earned a walkies.', 'Go for a short walk'],
  ['🌙⭐🤲', 'Hands up like you’re holding the moon.', 'Qi Gong: hold the moon above your head'],
  ['🧃🍊😁', 'Snack o’clock? A healthy one, of course.', 'Fruit, water and a stretch'],
  ['🐙🤸🌊', 'Be an octopus: wiggle everything.', 'Wiggle your fingers, wrists and toes'],
  ['🕊️☮️🌿', 'Peace in, stress out.', 'Slow breathing, shoulders down'],
  ['🦁👑🌅', 'Even the king of the jungle naps a lot.', 'Lion stretch: big yawn, arms out'],
  ['🎨🖌️🌈', 'Your brain is a painter. Let the paint dry.', 'Step away from the screen'],
  ['🐸🪷💚', 'Hop to it! Well, hop away from it.', 'A few small jumps or a walk'],
  ['⏳😌🍵', 'Time flies. Make it land softly.', 'Sit back, breathe, sip tea'],
  ['🌬️🍂🧘‍♂️', 'Wind blows, bamboo bends, nothing breaks.', 'Gentle side bends'],
  ['🏆🎉🙌', 'Gold medal in focus. Victory lap, please.', 'Walk a lap around the office'],
  ['🐳💦🌊', 'Whales come up for air. So should you.', 'Big breath in, slow breath out'],
  ['🌱🪴😊', 'Plants need water and light. So do you.', 'Water, daylight and a stretch'],
  ['🥟🍵😄', 'Your dumpling of a brain needs steaming down.', 'Close your eyes and relax your face'],
];
// Shuffled once and dealt one at a time, so you see every message before any comes back.
function nextRestLine() {
  let bag = [];
  try { bag = JSON.parse(localStorage.getItem('planner-rest-bag') || '[]'); } catch { /* blocked: start fresh */ }
  bag = bag.filter((i) => Number.isInteger(i) && i < REST_LINES.length);
  if (!bag.length) {
    bag = REST_LINES.map((_, i) => i);
    for (let i = bag.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [bag[i], bag[j]] = [bag[j], bag[i]]; }
  }
  const i = bag.shift();
  try { localStorage.setItem('planner-rest-bag', JSON.stringify(bag)); } catch { /* fine: just less variety */ }
  return REST_LINES[i];
}
// Mini Pan Pan (OMI's mascot) keeps you company: usually Pan Pan, sometimes one of the flavour friends.
const PANPAN = [
  ['panpan', 'Pan Pan', 'Just a little side piece, trying my best.'],
  ['matcha', 'Matcha', 'Only performing to myself.'],
  ['soymilk', 'Soy milk', 'Soft doesn’t mean weak.'],
  ['rose', 'Rose', 'For every heart that still blooms.'],
  ['seasalt', 'Sea salt', 'Beach called. I answered.'],
  ['sesame', 'Sesame', 'Open sesame, open your heart.'],
  ['hojicha', 'Hojicha', 'Stay in my lane and glow.'],
];
const panPick = () => (Math.random() < 0.55 ? PANPAN[0] : PANPAN[1 + Math.floor(Math.random() * (PANPAN.length - 1))]);
/** The rest reminder: a fun nudge, then Done (counts the break), Snooze 5 min or Skip. */
async function restPopup(type) {
  const f = fit();
  ui.fitNudgeOpen = true;
  const [art, line, idea] = nextRestLine();
  const [pid, pname, ptag] = panPick();
  if (typeof playTone === 'function' && alarmPrefs().on) playTone('zen-chimes', alarmPrefs().vol);
  if ('Notification' in window && Notification.permission === 'granted' && document.hidden) {
    try { new Notification(`${art} Time for a ${f.breaks.min}-minute rest`, { body: `${line} ${idea}.`, tag: 'rest' }); } catch { /* not supported */ }
  }
  const v = await choiceDlg(`Time for a ${f.breaks.min}-minute rest`, `<div class="rest-pan"><img src="icons/panpan/${pid}.png" alt="${esc(pname)}" width="${pid === 'panpan' ? 120 : 96}"><div class="rest-bubble"><b>${esc(pname)}</b> <span class="muted">“${esc(ptag)}”</span><span class="rest-art-sm" aria-hidden="true">${art}</span></div></div><p class="rest-line">${esc(line)}</p><p class="rest-idea">${esc(idea)}. <span class="muted">${esc(f.breaks.every)} minutes of focus done.</span></p>`,
    [{ v: 'done', label: 'Rest now', primary: true }, { v: 'snooze', label: 'In 5 min' }, { v: 'skip', label: 'Skip' }]);
  ui.fitNudgeOpen = false;
  if (v === 'done') fitLogBreak(type);
  else if (v === 'snooze') { ui.fitNextNudge = Date.now() + 5 * 60000; toast('I’ll remind you in 5 minutes.'); }
  else ui.fitNextNudge = Date.now() + f.breaks.every * 60000;
}

// ---------- Rest button (plan header): work / rest lengths ----------
const REST_WORK = [25, 60, 90];
const REST_REST = [5, 15, 30];
function restBtnHTML() {
  const b = fit().breaks;
  return `<button class="btn ghost sm rest-btn ${b.on ? 'on' : ''}" data-act="restMenu" aria-haspopup="true" title="Rest reminders">🧘 ${b.on ? `${b.every} / ${b.min} min` : 'Rest off'}</button>`;
}
function restPickerHTML() {
  const b = fit().breaks;
  const seg = (k, list) => `<div class="seg">${[...new Set([...list, b[k]])].sort((x, y) => x - y).map((v) => `<button class="${b[k] === v ? 'on' : ''}" data-act="restSet" data-k="${k}" data-v="${v}">${v} mins</button>`).join('')}<button data-act="restCustom" data-k="${k}">Custom…</button></div>`;
  return `<div class="picker rest-pick"><h4>Rest reminder</h4>
    <label class="mini"><input type="checkbox" data-change="fitBreakOn" ${b.on ? 'checked' : ''}> Remind me to rest</label>
    <small class="muted">Work for</small>${seg('every', REST_WORK)}
    <small class="muted">Then rest for</small>${seg('min', REST_REST)}
    <p class="small muted">During your working hours (${esc(fmtTime(TB().dayStart))} – ${esc(fmtTime(TB().dayEnd))}) while Planner is open. Same setting as Fitness › Short exercise between work.</p></div>`;
}
function fitLogBreak(type) {
  const f = fit();
  f.log.push({ id: uid(), act: 'break', type, date: todayISO(), min: f.breaks.min, at: Date.now() });
  commit();
  const n = fitBreaksOn(todayISO()).length;
  toast(`${type} break logged: ${n} of ${f.breaks.perDay} today.`);
}

/** On your chosen days, each activity waits in Time Box Allocation, ready to drag into a time. */
function ensureDailyFitness() {
  const f = S.settings.fitness;
  if (!f || new Date().getHours() < 2) return false;
  const iso = todayISO();
  const wd = new Date().getDay();
  const p = personalPlan();
  if (!p) return false;
  let changed = false;
  for (const tg of f.targets || []) {
    if (!(tg.days || []).includes(wd) || S.tasks.some((t) => t.fitAct === tg.id && t.fitDay === iso)) continue;
    const t = addTask({ planId: p.id, bucketId: p.buckets[0].id, title: tg.name, assignees: [S.meId], estimate: tg.min, workType: 'exercise' });
    Object.assign(t, { fitAct: tg.id, fitDay: iso, tbQueued: true, tbQueuedAt: Date.now() });
    changed = true;
  }
  // Yesterday's that were never booked or done go away.
  const stale = S.tasks.filter((t) => t.fitDay && t.fitDay < iso && !isDone(t) && !isScheduled(t) && !sessionsOf(t).length);
  if (stale.length) { S.tasks = S.tasks.filter((t) => !stale.includes(t)); changed = true; }
  return changed;
}
Object.assign(actions, {
  fitWeekNav: (el) => { const d = Number(el.dataset.d); ui.fitWeek = d ? addDays(fitWeekStart(), 7 * d) : null; render(); },
  fitWeekTimes: (el) => { const tg = fitTarget(el.dataset.id); const ws = fitWeekStart(); const v = Math.max(0, Math.min(14, weekTimes(tg, ws) + Number(el.dataset.d))); tg.weeks = { ...(tg.weeks || {}), [ws]: v }; if (v === tg.times) delete tg.weeks[ws]; commit(); },
  fitWeekReset: (el) => { const tg = fitTarget(el.dataset.id); if (tg.weeks) delete tg.weeks[fitWeekStart()]; commit(); },
  fitWeekGoal: (el) => { const b = fit().breaks; const ws = fitWeekStart(); const v = Math.max(1, Math.min(12, weekBreakGoal(ws) + Number(el.dataset.d))); b.weeks = { ...(b.weeks || {}), [ws]: v }; if (v === b.perDay) delete b.weeks[ws]; commit(); },
  fitWeekGoalReset: () => { const b = fit().breaks; if (b.weeks) delete b.weeks[fitWeekStart()]; commit(); },
  fitDayToggle: (el) => {
    const tg = fitTarget(el.dataset.id);
    const wd = Number(el.dataset.d);
    tg.days = (tg.days || []).includes(wd) ? tg.days.filter((x) => x !== wd) : [...(tg.days || []), wd];
    if (ensureDailyFitness()) { /* today's added straight away */ }
    commit();
  },
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
  restMenu: (el) => openPop(el, restPickerHTML),
  restSet: (el) => { fit().breaks[el.dataset.k] = Number(el.dataset.v); commit(); refreshPop(); },
  restCustom: async (el) => {
    const k = el.dataset.k;
    closePop();
    // A wheel to scroll, or type up to 2 numbers: it goes to the nearest choice.
    const values = k === 'every' ? Array.from({ length: 48 }, (_, i) => (i + 1) * 5) : [...Array.from({ length: 30 }, (_, i) => i + 1), ...Array.from({ length: 18 }, (_, i) => 35 + i * 5)];
    wheelPick($('.rest-btn') || document.body, { title: k === 'every' ? 'Work for how long?' : 'Rest for how long?', values, value: fit().breaks[k], unit: 'min', done: (n) => { fit().breaks[k] = n; commit(); } });
  },
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
  fitBreakOn: (el) => { fit().breaks.on = el.checked; commit(); try { refreshPop(); } catch { /* no picker open */ } },
  fitBreakSet: (el) => { fit().breaks[el.dataset.k] = Number(el.value); commit(); },
});
setInterval(fitNudge, 60000);
setInterval(() => { if (ensureDailyFitness()) commit(); }, 60000);
setTimeout(() => { if (ensureDailyFitness()) commit(); }, 2500);
