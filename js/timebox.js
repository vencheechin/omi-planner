'use strict';
/* Time boxing: duration estimates, time slots, the day and week planner on My Day, the weekday
   rhythm (editable planning blocks), 3 Most Important Outcomes, traffic-light status and
   decision requests.

   A task's time slot (slotDate + slotStart, minutes after midnight) is personal and never synced;
   its estimate, work type, traffic light and decision brief are shared like other task fields. */

const INTERVALS = [5, 10, 15, 20, 30, 60];
/** The Time Box row size in minutes; drags, resizes and new blocks snap to it. Set it on the Time Box page or in Settings. */
const SNAP_OF = () => (typeof S !== 'undefined' && S && INTERVALS.includes(S.settings?.timebox?.interval) ? S.settings.timebox.interval : 15);
const BASE_WORK_TYPES = [
  { v: 'focus', label: 'Focus', short: 'Focus', color: '#233246' },
  { v: 'decision', label: 'Decision', short: 'Decision', color: '#b5894d' },
  { v: 'collab', label: 'Collaboration', short: 'Collaboration', color: '#7b8060' },
  { v: 'planning', label: 'Planning', short: 'Planning', color: '#6e7a8f' },
  { v: 'meeting', label: 'Meeting', short: 'Meeting', color: '#4f6d7a' },
  { v: '', label: 'Misc', short: 'Misc', color: '#a39c8c' },
  { v: 'exercise', label: 'Exercise', short: 'Exercise', color: '#8c9a5b' },
  { v: 'review', label: 'Biweekly Review', short: 'Review', color: '#be7f5c' },
];
/** Colours given to types you add yourself, in turn. */
const CUSTOM_TYPE_COLORS = ['#5b7f95', '#9a6b8f', '#c27d4f', '#4f7f73', '#a35d5d', '#7a6a4f', '#6b8f71', '#8f7a9a'];
/** Work types in your order, with your names (part of your Time Box settings, which sync to your devices). */
function workTypes() {
  const saved = (typeof S !== 'undefined' && S?.settings?.timebox?.workTypes) || [];
  const byV = new Map(BASE_WORK_TYPES.map((w) => [w.v, w]));
  const out = [];
  for (const x of saved) {
    if (x.custom) { out.push({ v: x.v, label: x.name, short: x.name, color: x.color, custom: true }); continue; }
    const w = byV.get(x.v);
    if (!w) continue;
    byV.delete(x.v);
    out.push(x.name ? { ...w, label: x.name, short: x.name } : w);
  }
  return [...out, ...byV.values()];
}
const workTypeOf = (v) => workTypes().find((w) => w.v === (v || '')) || BASE_WORK_TYPES.find((w) => w.v === '');
const EDIT_WORK_TYPES = '__editWorkTypes';
/** Options for a work type dropdown, ending with "Edit…", which opens the editor. */
const workTypeOptions = (cur, short = false) => `${workTypes().map((w) => `<option value="${w.v}" ${w.v === (cur || '') ? 'selected' : ''}>${esc(w.short)}</option>`).join('')}<option disabled>──────────</option><option value="${EDIT_WORK_TYPES}">Edit…</option>`;
function editWorkTypesDlg() {
  const d = showDialog({
    title: 'Edit Work Types',
    html: `<form method="dialog" class="stack" data-submit="saveWorkTypes">
      
      <div class="wt-list">${workTypes().map(wtRowHTML).join('')}</div>
      <div class="row wt-add"><input data-focus="wt-new" placeholder="New type" aria-label="New type name" autocomplete="off"><button class="btn ghost sm" type="button" data-act="wtAddRow">${icon('plus', 14)} Add</button></div>
      <div class="dlg-foot"><button class="btn ghost" type="button" data-act="resetWorkTypes">Reset</button><span class="spacer"></span><button class="btn ghost" type="button" data-role="no">Cancel</button><button class="btn primary">Save</button></div>
    </form>`,
  });
  $('[data-role="no"]', d).onclick = () => d.close();
  return d;
}
function wtRowHTML(w) {
  const base = BASE_WORK_TYPES.find((b) => b.v === w.v);
  return `<div class="wt-row" data-drag="worktype" data-id="${esc(w.v)}"><span class="grip" aria-hidden="true" title="Drag to reorder">⋮⋮</span><i class="dot" style="background:${w.color}"></i><input name="wt" data-v="${esc(w.v)}" ${w.custom ? `data-custom="1" data-color="${w.color}"` : ''} value="${esc(w.short)}" placeholder="${esc(base ? base.short : 'Name')}" aria-label="Name" autocomplete="off">${w.custom ? `<button class="icon-btn" type="button" data-act="wtDelRow" aria-label="Remove ${esc(w.short)}" title="Remove">${icon('close', 13)}</button>` : ''}</div>`;
}
function saveWorkTypes(form) {
  TB().workTypes = $$('.wt-row input', form).map((i) => {
    const name = i.value.trim();
    if (i.dataset.custom) return name ? { v: i.dataset.v, name: name.slice(0, 40), color: i.dataset.color, custom: true } : null;
    const base = BASE_WORK_TYPES.find((b) => b.v === i.dataset.v);
    return { v: i.dataset.v, name: name && name !== base.short ? name.slice(0, 40) : '' };
  }).filter(Boolean);
  form.closest('dialog').close();
  commit();
  toast('Work types saved.');
}
const HEALTH = [
  { v: 'green', label: 'Green', meaning: 'On Track', color: '#4f7f3c' },
  { v: 'yellow', label: 'Yellow', meaning: 'At Risk', color: '#c99a1e' },
  { v: 'red', label: 'Red', meaning: 'Off Track · Requires Support', color: '#ad3a28' },
];
const healthOf = (v) => HEALTH.find((h) => h.v === v) || null;
const healthText = (v) => { const h = healthOf(v); return h ? `${h.label} (${h.meaning})` : ''; };
const URGENCY = [
  { v: '', label: 'Not set' },
  { v: 'same-day', label: 'Same-day decision · Decision Window' },
  { v: 'routine', label: 'Routine update · biweekly review' },
  { v: 'emergency', label: 'Emergency · may interrupt Focus' },
];
const DEFAULT_ESTIMATES = [5, 10, 15, 30, 45, 60, 90];
/** The duration choices offered everywhere; edit them in Settings > Time boxing. */
const estimateList = () => TB().estimates;
const defaultEstimate = () => (estimateList().includes(30) ? 30 : estimateList()[Math.min(1, estimateList().length - 1)]);
const CADENCES = [{ v: 'daily', label: 'Every working day' }, { v: 'weekly', label: 'Every week' }, { v: 'biweekly', label: 'Every 2 weeks' }];

// ---------- Time helpers ----------
const hm = (min) => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`; // value for <input type="time">
const parseHM = (s) => { const m = /^(\d{1,2}):(\d{2})/.exec(s || ''); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
/** 9:00 am, 12:30 pm: always 12-hour with am/pm. */
const fmtTime = (min) => { const h = Math.floor(min / 60) % 24; return `${((h + 11) % 12) + 1}:${pad(min % 60)} ${h < 12 ? 'am' : 'pm'}`; };
const fmtDur = (min) => { if (!min) return '0m'; const h = Math.floor(min / 60); const m = min % 60; return h ? (m ? `${h}h ${m}m` : `${h}h`) : `${m}m`; };
const snapMin = (min) => Math.round(min / SNAP_OF()) * SNAP_OF();
const ceilSnap = (min) => Math.ceil(min / SNAP_OF()) * SNAP_OF();
const nowMin = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };
const dayLabel = (iso) => (iso === todayISO() ? 'Today' : iso === addDays(todayISO(), 1) ? 'Tomorrow' : parseISO(iso).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }));
const durOf = (t) => t.estimate || 30;
const isScheduled = (t) => !!t.slotDate && Number.isFinite(t.slotStart);
const endOf = (t) => t.slotStart + durOf(t);

// ---------- Rhythm settings ----------
function defaultTimebox() {
  return {
    workDays: [1, 2, 3, 4, 5], dayStart: 8 * 60 + 30, dayEnd: 17 * 60 + 30, capacity: 8, interval: 15, estimates: [...DEFAULT_ESTIMATES],
    blocks: [
      { id: uid(), name: 'Focus', kind: 'focus', start: 8 * 60 + 30, end: 12 * 60 + 30, cadence: 'daily', protected: true,
        note: 'Strategy, culture, finances, planning, proposals, leadership, growth and long-term decisions. Protected from interruptions, except emergencies.' },
    ],
    focusOnly: true,
  };
}
/** Repairs saved rhythm settings so a bad or partial value can't break the planner. */
function normalizeTimebox(tb) {
  if (!tb || typeof tb !== 'object' || !Array.isArray(tb.blocks)) return defaultTimebox();
  const mins = (v, d) => (Number.isFinite(v) && v >= 0 && v <= 1440 ? v : d);
  const workTypes = (Array.isArray(tb.workTypes) ? tb.workTypes : []).filter((w) => w && (w.custom ? /^c_/.test(w.v) && String(w.name || '').trim() : BASE_WORK_TYPES.some((b) => b.v === w.v)))
    .map((w) => (w.custom ? { v: w.v, name: String(w.name).trim().slice(0, 40), color: /^#[0-9a-f]{6}$/i.test(w.color || '') ? w.color : CUSTOM_TYPE_COLORS[0], custom: true } : { v: w.v, name: String(w.name || '').slice(0, 40) }));
  const kinds = new Set([...BASE_WORK_TYPES.map((w) => w.v), ...workTypes.map((w) => w.v)]);
  return {
    workDays: Array.isArray(tb.workDays) ? tb.workDays.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6) : [1, 2, 3, 4, 5],
    dayStart: mins(tb.dayStart, 510), dayEnd: mins(tb.dayEnd, 1050), capacity: Number.isFinite(tb.capacity) && tb.capacity > 0 ? tb.capacity : 8,
    interval: INTERVALS.includes(tb.interval) ? tb.interval : 15,
    addTo: tb.addTo && typeof tb.addTo.planId === 'string' && typeof tb.addTo.bucketId === 'string' ? { planId: tb.addTo.planId, bucketId: tb.addTo.bucketId } : null,
    workTypes,
    estimates: (() => { const l = Array.isArray(tb.estimates) ? [...new Set(tb.estimates.filter((m) => Number.isInteger(m) && m > 0 && m <= 720))].sort((x, y) => x - y) : []; return l.length ? l : [...DEFAULT_ESTIMATES]; })(),
    focusOnly: true,
    planMin: [5, 10, 15, 20, 25, 30, 60, 90].includes(tb.planMin) ? tb.planMin : 15,
    blocks: tb.blocks.filter((b) => b && Number.isFinite(b.start) && Number.isFinite(b.end) && b.end > b.start)
      .filter((b) => tb.focusOnly || !['Decision Window', 'Collaboration', 'Tomorrow Planning', "Tomorrow's Planning"].includes(b.name)).map((b) => ({
      id: String(b.id || uid()), name: b.name === 'CEO Focus' ? 'Focus' : String(b.name || 'Block'), kind: kinds.has(b.kind) ? b.kind : '', color: /^#[0-9a-f]{6}$/i.test(b.color || '') ? b.color : '',
      start: b.start, end: b.end, cadence: CADENCES.some((c) => c.v === b.cadence) ? b.cadence : 'daily', anchor: b.anchor || null,
      protected: !!b.protected, note: String(b.note || ''),
    })),
  };
}
const TB = () => S.settings.timebox;
const isWorkDay = (iso) => TB().workDays.includes(parseISO(iso).getDay());
const capacityOf = (iso) => (isWorkDay(iso) ? Math.round(TB().capacity * 60) : 0);
/** The rhythm blocks that apply on a date. */
function blocksOn(iso) {
  if (!isWorkDay(iso)) return [];
  return TB().blocks.filter((b) => {
    if (b.cadence === 'daily' || !b.anchor) return true;
    const gap = daysBetween(b.anchor, iso);
    return gap % (b.cadence === 'biweekly' ? 14 : 7) === 0 && gap >= 0;
  }).sort((a, b) => a.start - b.start);
}
const blockAt = (iso, min) => blocksOn(iso).find((b) => b.start <= min && min < b.end) || null;
function nextWorkDay(iso) {
  for (let i = 1; i <= 14; i++) if (isWorkDay(addDays(iso, i))) return addDays(iso, i);
  return addDays(iso, 1);
}

// ---------- Day contents and warnings ----------
/** Extra time boxes for the same task. The latest booking is slotDate/slotStart; earlier and other ones live here. */
const sessionsOf = (t) => (Array.isArray(t?.tbSessions) ? t.tbSessions : []);
/** One extra time box, shaped like a task so the planner can lay it out (it reads through to the real task). */
function sessionProxy(t, s) {
  return Object.create(t, {
    id: { value: `${t.id}~${s.id}` }, slotDate: { value: s.date, writable: true }, slotStart: { value: s.start, writable: true },
    estimate: { value: s.dur, writable: true }, _task: { value: t }, _sess: { value: s },
  });
}
const realId = (t) => (t?._task ? t._task.id : t?.id);
/** Every booking of a task, in time order: { date, start, dur, sid } (sid is null for the main one). */
function bookingsOf(t) {
  const list = sessionsOf(t).map((s) => ({ date: s.date, start: s.start, dur: s.dur, sid: s.id }));
  if (isScheduled(t)) list.push({ date: t.slotDate, start: t.slotStart, dur: durOf(t), sid: null });
  return list.sort((a, b) => a.date.localeCompare(b.date) || a.start - b.start);
}
/** Minutes spent so far: time boxes that have passed (the one running now counts up to now). */
function timeSpentOf(t) {
  const today = todayISO();
  const now = nowMin();
  const days = new Map();
  for (const b of bookingsOf(t)) {
    const m = b.date < today ? b.dur : b.date === today ? Math.max(0, Math.min(b.dur, now - b.start)) : 0;
    if (m) days.set(b.date, (days.get(b.date) || 0) + m);
  }
  return { days: [...days.entries()].sort((a, b) => a[0].localeCompare(b[0])), total: [...days.values()].reduce((n, m) => n + m, 0) };
}
/** Time spent and every time box, under the Time Box row of the task panel. */
function timeSpentHTML(t) {
  const all = bookingsOf(t);
  if (!all.length) return '';
  const spent = timeSpentOf(t);
  const today = todayISO();
  const ahead = all.filter((b) => b.date > today || (b.date === today && b.start >= nowMin()));
  return `<div class="tb-spent">
    <div><b>Time spent</b> <span class="tb-spent-total">${spent.total ? esc(fmtDur(spent.total)) : 'none yet'}</span>${spent.days.length ? ` · ${spent.days.map(([d, m]) => `${esc(dayLabel(d))} ${esc(fmtDur(m))}`).join(' · ')}` : ''}</div>
    ${all.length > 1 || ahead.length ? `<div class="tb-sessions">${all.map((b, i) => `<span class="tb-sess ${ahead.includes(b) ? 'ahead' : ''}">${i + 1}. ${esc(dayLabel(b.date))} ${esc(fmtTime(b.start))} · ${esc(fmtDur(b.dur))}${b.sid ? `<button class="chip-x" data-act="tbDelSession" data-id="${esc(t.id)}" data-s="${esc(b.sid)}" aria-label="Remove this time box">${icon('close', 10)}</button>` : ''}</span>`).join('')}</div>` : ''}
  </div>`;
}
/** Books the task into another time box and keeps the one it had. Without a time, the next free slot after it. */
async function bookAgain(t, iso, start) {
  if (!t || isBox(t)) return false;
  const had = isScheduled(t) ? { id: uid(), date: t.slotDate, start: t.slotStart, dur: durOf(t) } : null;
  const prev = [t.slotDate, t.slotStart];
  if (had) { t.tbSessions = [...sessionsOf(t), had]; t.slotDate = null; t.slotStart = null; }
  const undo = () => { if (had) t.tbSessions = sessionsOf(t).filter((s) => s !== had); [t.slotDate, t.slotStart] = prev; };
  if (iso) {
    const ok = await scheduleTask(t, iso, start);
    if (!ok) { undo(); commit(); }
    else if (had) toast('Booked again. The earlier time box stays where it was.');
    return ok;
  }
  let from = searchStart();
  if (had && (had.date > from.date || (had.date === from.date && had.start + had.dur > from.min))) from = { date: had.date, min: had.start + had.dur };
  const slot = freeSlot(t, from.date, from.min);
  if (!slot) { undo(); toast('No free slot in the next 4 weeks.', { error: true }); return false; }
  t.slotDate = slot.date;
  t.slotStart = slot.start;
  t.tbQueued = false;
  commit();
  toast(`Booked again: ${dayLabel(slot.date)} ${fmtTime(slot.start)}–${fmtTime(slot.start + durOf(t))}.${had ? ' The earlier one stays.' : ''}`, { undo: () => { undo(); commit(); } });
  return true;
}
/** Planning is a default task: one waits in Time Box Allocation each day, at your usual length. */
function ensureDailyPlanning() {
  const today = todayISO();
  if (new Date().getHours() < 2) return false;
  // Several devices (or the old Add button) can leave more than one waiting: keep one.
  const spare = (t) => t.title === 'Planning' && t.workType === 'planning' && t.tbQueued && !isDone(t) && !isScheduled(t) && !sessionsOf(t).length && !t.comments?.length;
  const waiting = S.tasks.filter(spare).sort((a, b) => (a.dailyPlan === today ? 0 : 1) - (b.dailyPlan === today ? 0 : 1) || String(a.id).localeCompare(String(b.id)));
  if (waiting.length > 1) { const keep = waiting[0]; keep.dailyPlan = today; S.tasks = S.tasks.filter((t) => t === keep || !waiting.includes(t)); return true; }
  if (waiting.length === 1 && waiting[0].dailyPlan !== today) { waiting[0].dailyPlan = today; return true; }
  if (S.tasks.some((t) => t.dailyPlan === today)) return false;
  const p = personalPlan();
  if (!p) return false;
  const t = addTask({ planId: p.id, bucketId: p.buckets[0].id, title: 'Planning', assignees: [S.meId], estimate: TB().planMin || 15, workType: 'planning' });
  Object.assign(t, { dailyPlan: today, tbQueued: true, tbQueuedAt: Date.now(), tbRank: -1 });
  return true;
}
/** The unbooked Time Box list empties at 2am the next day; anything already in a time box stays. */
function resetStaleQueue() {
  const now = new Date();
  const cut = new Date(now);
  cut.setHours(2, 0, 0, 0);
  if (now < cut) cut.setDate(cut.getDate() - 1);
  let changed = false;
  for (const t of S.tasks) {
    if (t.tbQueued && isScheduled(t) && t.slotDate < todayISO()) { t.tbQueued = false; delete t.tbQueuedAt; delete t.tbRank; changed = true; continue; }
    if (!t.tbQueued || isScheduled(t)) { if (t.tbQueuedAt && !t.tbQueued) { delete t.tbQueuedAt; changed = true; } continue; }
    if (!t.tbQueuedAt) { t.tbQueuedAt = Date.now(); changed = true; continue; }
    if (t.tbQueuedAt < cut.getTime()) { t.tbQueued = false; delete t.tbQueuedAt; delete t.tbRank; changed = true; }
  }
  // A day's Planning task that was never booked or done goes away rather than cluttering your plan.
  const stale = S.tasks.filter((t) => t.dailyPlan && t.dailyPlan < todayISO() && !isDone(t) && !isScheduled(t) && !sessionsOf(t).length && !t.tbQueued);
  if (stale.length) { S.tasks = S.tasks.filter((t) => !stale.includes(t)); changed = true; }
  if (ensureDailyPlanning()) changed = true;
  return changed;
}
const scheduledOn = (iso) => S.tasks.flatMap((t) => [
  ...(t.slotDate === iso && Number.isFinite(t.slotStart) ? [t] : []),
  ...sessionsOf(t).filter((s) => s.date === iso).map((s) => sessionProxy(t, s)),
]);
const plannedMinutes = (iso) => scheduledOn(iso).reduce((n, t) => n + durOf(t), 0);
const allowedInProtected = (t) => t.workType === 'focus' || t.urgency === 'emergency';
const overlapsOf = (t) => (isScheduled(t) ? scheduledOn(t.slotDate).filter((x) => x.id !== t.id && x.slotStart < endOf(t) && t.slotStart < endOf(x)) : []);
const intrudes = (t) => isScheduled(t) && !allowedInProtected(t) && blocksOn(t.slotDate).some((b) => b.protected && b.start < endOf(t) && t.slotStart < b.end);
function dayWarnings(iso) {
  const tasks = scheduledOn(iso);
  const over = plannedMinutes(iso) - capacityOf(iso);
  return {
    overlaps: tasks.filter((t) => overlapsOf(t).length).length,
    over: over > 0 && isWorkDay(iso) ? over : 0,
    offDay: !isWorkDay(iso) && tasks.length ? tasks.length : 0,
    intrusions: tasks.filter(intrudes).length,
  };
}
function warningChips(iso) {
  const w = dayWarnings(iso);
  const out = [];
  if (w.overlaps) out.push(`${w.overlaps} blocks overlap`);
  if (w.over) out.push(`Over capacity by ${fmtDur(w.over)}`);
  if (w.offDay) out.push('Work planned on a non-working day');
  return out;
}

/** Everything worth asking about before a task takes a slot. Never changes anything. */
function placementIssues(t, iso, start, dur) {
  const end = start + dur;
  const issues = scheduledOn(iso).filter((x) => x.id !== t.id && x.slotStart < end && start < endOf(x))
    .map((x) => `Overlaps “${x.title || 'Untitled task'}” (${fmtTime(x.slotStart)}–${fmtTime(endOf(x))}).`);
  const prot = blocksOn(iso).find((b) => b.protected && b.start < end && start < b.end);
  if (prot && !allowedInProtected(t)) issues.push(`${prot.name} (${fmtTime(prot.start)}–${fmtTime(prot.end)}) is protected for focus work. Only emergencies should interrupt it.`);
  if (!isWorkDay(iso)) issues.push(`${dayLabel(iso)} is not one of your working days.`);
  else if (start < TB().dayStart || end > TB().dayEnd) issues.push(`It's outside your working hours (${fmtTime(TB().dayStart)}–${fmtTime(TB().dayEnd)}).`);
  const planned = plannedMinutes(iso) - (t.slotDate === iso && Number.isFinite(t.slotStart) ? durOf(t) : 0) + dur;
  if (isWorkDay(iso) && planned > capacityOf(iso)) issues.push(`${dayLabel(iso)} would have ${fmtDur(planned)} planned, over your ${fmtDur(capacityOf(iso))} daily capacity.`);
  return issues;
}

// ---------- Finding free time ----------
/** Where a task of this type belongs: its matching rhythm blocks, or else working time outside protected blocks. */
function windowsFor(t, iso, preferred) {
  const blocks = blocksOn(iso);
  // Untyped work counts as operational, so it fills Collaboration before the free time between blocks.
  const kind = t.workType === 'decision' && t.urgency === 'routine' ? 'review' : t.workType || 'collab';
  if (preferred) return blocks.filter((b) => b.kind === kind).map((b) => [b.start, b.end]);
  let wins = [[TB().dayStart, TB().dayEnd]];
  if (!allowedInProtected(t)) {
    blocks.filter((b) => b.protected).forEach((b) => {
      wins = wins.flatMap(([s, e]) => (b.end <= s || b.start >= e ? [[s, e]] : [[s, b.start], [b.end, e]].filter(([a, c]) => c > a)));
    });
  }
  return wins;
}
/**
 * The first free slot for a task from a date and time onwards, within 4 weeks: on a working day,
 * not overlapping anything, and without pushing the day over capacity. `reserved` holds slots
 * already promised to other tasks in the same batch.
 */
function freeSlot(t, fromIso, fromMin = 0, dur = durOf(t), reserved = []) {
  const pass = (preferred) => {
    for (let i = 0; i < 28; i++) {
      const iso = addDays(fromIso, i);
      if (!isWorkDay(iso)) continue;
      const mine = reserved.filter((r) => r.date === iso);
      const planned = scheduledOn(iso).filter((x) => x.id !== t.id).reduce((n, x) => n + durOf(x), 0) + mine.reduce((n, r) => n + r.end - r.start, 0);
      if (planned + dur > capacityOf(iso)) continue;
      const busy = [...scheduledOn(iso).filter((x) => x.id !== t.id).map((x) => [x.slotStart, endOf(x)]), ...mine.map((r) => [r.start, r.end])].sort((a, b) => a[0] - b[0]);
      const after = i === 0 ? ceilSnap(fromMin) : 0;
      for (const [ws, we] of windowsFor(t, iso, preferred)) {
        let cur = Math.max(ws, after);
        for (const [bs, be] of busy) {
          if (be <= cur) continue;
          if (bs >= cur + dur) break;
          cur = ceilSnap(be);
        }
        if (cur + dur <= we) return { date: iso, start: cur };
      }
    }
    return null;
  };
  return pass(true) || pass(false);
}
/** Where "find a slot" should start looking: later today if there's working time left, else the next working day. */
function searchStart(iso = todayISO()) {
  const today = todayISO();
  if (iso > today) return { date: iso, min: 0 };
  return nowMin() < TB().dayEnd && isWorkDay(today) ? { date: today, min: nowMin() } : { date: nextWorkDay(today), min: 0 };
}

// ---------- Placing tasks (always asks before overlapping or breaking a rule) ----------
function choiceDlg(title, html, choices) {
  return new Promise((resolve) => {
    let result = null;
    const d = showDialog({
      title,
      html: `${html}<div class="dlg-foot wrap">${choices.map((c, i) => `<button class="btn ${c.primary ? 'primary' : 'ghost'}" data-i="${i}">${esc(c.label)}</button>`).join('')}</div>`,
      onClose: () => resolve(result),
    });
    $$('.dlg-foot button', d).forEach((b) => { b.onclick = () => { result = choices[+b.dataset.i].v; d.close(); }; });
  });
}
/** Puts a task in a slot. Overlaps, protected time and capacity are shown first, and nothing else moves. */
async function scheduleTask(t, iso, start, dur = durOf(t)) {
  dur = Math.max(5, dur); // 5- and 10-minute boxes are allowed; starts still snap to 15 minutes
  start = Math.min(Math.max(0, snapMin(start)), 1440 - dur);
  // It goes exactly where you put it; overlaps and capacity still show as warnings on the day.
  const top = t.tbQueued ? allocationNumber(t) : 0;
  t.slotDate = iso;
  t.slotStart = start;
  t.estimate = dur;
  if (!t.workType) { const b = blockAt(iso, start); if (b && b.kind) t.workType = b.kind; }
  if (top && top <= MIO_MAX) recordTop3(t, iso);
  commit();
  return true;
}
/** One of your Top 3 got a time: it becomes one of that day's 3 Most Important Outcomes. */
function recordTop3(t, iso) {
  const ids = mioIds(iso).filter((id) => taskById(id));
  if (ids.includes(t.id) || ids.length >= MIO_MAX) return;
  const day = { ...(S.days[iso] || {}), mio: [...ids, t.id] };
  delete day.omio;
  S.days[iso] = day;
}
function unschedule(t) { t.slotDate = null; t.slotStart = null; t.tbQueued = true; commit(); }
/** Books the next free slot for one task, with Undo. */
function bookNextFree(t, fromIso) {
  let from = searchStart(fromIso);
  // Asked again for a task that already has a future slot: find the next one after it.
  if (!fromIso && isScheduled(t) && (t.slotDate > from.date || (t.slotDate === from.date && t.slotStart >= from.min))) from = { date: t.slotDate, min: endOf(t) };
  const slot = freeSlot(t, from.date, from.min);
  if (!slot) { toast('No free slot in the next 4 weeks. Add capacity or shorten other blocks.', { error: true }); return; }
  const before = [t.slotDate, t.slotStart];
  t.slotDate = slot.date;
  t.slotStart = slot.start;
  if (!t.workType) { const b = blockAt(slot.date, slot.start); if (b && b.kind) t.workType = b.kind; }
  commit();
  toast(`Booked ${dayLabel(slot.date)} ${fmtTime(slot.start)}–${fmtTime(slot.start + durOf(t))}.`, { undo: () => { [t.slotDate, t.slotStart] = before; commit(); } });
}

// ---------- Moving unfinished work ----------
/** Proposes free slots for unfinished blocks and moves only the ones you confirm. */
function moveUnfinishedDlg(scope) {
  const today = todayISO();
  const pick = scope === 'past'
    ? S.tasks.filter((t) => isScheduled(t) && !isDone(t) && t.slotDate < today)
    : S.tasks.filter((t) => isScheduled(t) && !isDone(t) && t.slotDate === scope);
  if (!pick.length) { toast('Nothing unfinished to move.'); return; }
  pick.sort((a, b) => a.slotDate.localeCompare(b.slotDate) || a.slotStart - b.slotStart);
  const defaultOn = (t) => t.slotDate < today || (t.slotDate === today && endOf(t) <= nowMin()) || scope !== today;
  const state = { fromTomorrow: scope !== 'past' && scope >= today && nowMin() >= TB().dayEnd, checked: new Set(pick.filter(defaultOn).map((t) => t.id)) };
  const propose = () => {
    const base = state.fromTomorrow ? { date: nextWorkDay(scope === 'past' ? today : scope), min: 0 } : searchStart(scope === 'past' ? today : scope);
    const reserved = [];
    return pick.map((t) => {
      if (!state.checked.has(t.id)) return { t, slot: null };
      const slot = freeSlot(t, base.date, base.min, durOf(t), reserved);
      if (slot) reserved.push({ date: slot.date, start: slot.start, end: slot.start + durOf(t) });
      return { t, slot };
    });
  };
  const body = () => {
    const plan = propose();
    return `
      <label class="mini"><input type="checkbox" data-role="tomorrow" ${state.fromTomorrow ? 'checked' : ''}> Start from the next working day</label>
      <ul class="move-list">${plan.map(({ t, slot }) => `<li><label><input type="checkbox" data-role="pick" data-id="${esc(t.id)}" ${state.checked.has(t.id) ? 'checked' : ''}>
        <span><b>${esc(t.title || 'Untitled task')}</b><small>${esc(dayLabel(t.slotDate))} ${esc(fmtTime(t.slotStart))} · ${esc(fmtDur(durOf(t)))}</small></span></label>
        <span class="move-to">${state.checked.has(t.id) ? (slot ? `→ ${esc(dayLabel(slot.date))} ${esc(fmtTime(slot.start))}` : '<span class="danger-text">No free slot</span>') : '<span class="muted">Stays</span>'}</span></li>`).join('')}</ul>
      <div class="dlg-foot"><button class="btn ghost" data-role="cancel">Cancel</button><button class="btn primary" data-role="go">Move ${plan.filter((p) => p.slot).length} task${plan.filter((p) => p.slot).length === 1 ? '' : 's'}</button></div>`;
  };
  const d = showDialog({ title: 'Move unfinished work', html: '', wide: true });
  const draw = () => {
    $('.dlg-body', d).innerHTML = body();
    $('[data-role=tomorrow]', d).onchange = (e) => { state.fromTomorrow = e.target.checked; draw(); };
    $$('[data-role=pick]', d).forEach((c) => { c.onchange = () => { if (c.checked) state.checked.add(c.dataset.id); else state.checked.delete(c.dataset.id); draw(); }; });
    $('[data-role=cancel]', d).onclick = () => d.close();
    $('[data-role=go]', d).onclick = () => {
      const moves = propose().filter((p) => p.slot);
      d.close();
      if (!moves.length) return;
      undoable(`Moved ${moves.length} task${moves.length === 1 ? '' : 's'} to free slots`, () => moves.forEach(({ t, slot }) => { t.slotDate = slot.date; t.slotStart = slot.start; }));
    };
  };
  draw();
}

// ---------- 3 Most Important Outcomes (3MIO) ----------
const MIO_MAX = 3;
const mioIds = (iso) => { const d = S.days[iso]; return d ? (Array.isArray(d.mio) ? d.mio : d.omio ? [d.omio] : []) : []; };
const mioOf = (iso) => mioIds(iso).map(taskById).filter(Boolean);
const isMio = (t, iso) => mioIds(iso).includes(t.id);
const mioDateOf = (t) => Object.keys(S.days).filter((d) => d >= todayISO() && mioIds(d).includes(t.id)).sort()[0] || null;
/** Adds or removes a task from a day's 3MIO; a fourth is refused rather than replacing one silently. */
function toggleMio(iso, taskId) {
  const ids = mioIds(iso).filter((id) => taskById(id));
  if (ids.includes(taskId)) ids.splice(ids.indexOf(taskId), 1);
  else if (ids.length >= MIO_MAX) { toast(`${dayLabel(iso)} already has ${MIO_MAX} Most Important Outcomes. Remove one first.`, { error: true }); return false; }
  else ids.push(taskId);
  const day = { ...(S.days[iso] || {}), mio: ids };
  delete day.omio;
  S.days[iso] = day;
  commit();
  return true;
}
/** Open tasks worth choosing from: those planned that day first, then your other open tasks. */
function mioCandidates(iso) {
  const mine = S.tasks.filter((t) => !isDone(t) && !isBox(t) && (t.assignees.includes(S.meId) || !t.assignees.length || t.slotDate === iso || isMio(t, iso)));
  return mine.sort((a, b) => (isMio(b, iso) - isMio(a, iso)) || ((b.slotDate === iso) - (a.slotDate === iso)) || (a.priority - b.priority) || String(a.due || '9').localeCompare(String(b.due || '9'))).slice(0, 40);
}
function mioPickerHTML(iso) {
  const n = mioIds(iso).length;
  return `<div class="picker"><h4>3 Most Important Outcomes · ${esc(dayLabel(iso))} <small class="muted">${n} of ${MIO_MAX}</small></h4><div class="picker-scroll">
    ${mioCandidates(iso).map((t) => `<button class="person-row" data-act="pickMio" data-date="${iso}" data-id="${esc(t.id)}" aria-pressed="${isMio(t, iso)}">${healthDot(t)}<span>${esc(t.title || 'Untitled task')}</span>${t.slotDate === iso ? `<small class="muted">${esc(fmtTime(t.slotStart))}</small>` : ''}${isMio(t, iso) ? icon('check', 14) : ''}</button>`).join('') || '<p class="muted small">No open tasks yet.</p>'}
    </div></div>`;
}
/** The "★ 3 Most Important Outcomes" bar shown on My Day and the Time Box day view. */
function mioBarHTML(iso, bookable) {
  const list = mioOf(iso);
  return `<div class="omio-bar ${list.length ? 'set' : ''}"><span class="omio-label"><span class="long">★ 3 Most Important Outcomes</span><span class="short">★ 3MIO</span></span>
    ${list.map((t, i) => `<span class="mio-item ${isDone(t) ? 'done' : ''}"><b>${i + 1}</b><button class="link-btn" data-open-task="${esc(t.id)}">${healthDot(t)}${esc(t.title)}</button>${isScheduled(t) && t.slotDate === iso ? `<small class="muted">${esc(fmtTime(t.slotStart))}</small>` : bookable && !isDone(t) ? `<button class="btn ghost xs" data-act="bookNextFree" data-id="${esc(t.id)}">Book time</button>` : ''}</span>`).join('') || '<span class="muted">Not chosen yet</span>'}
    <button class="btn ghost sm" data-act="mioMenu" data-date="${iso}">${list.length ? 'Edit' : 'Choose'}</button></div>`;
}

// ---------- Tomorrow Planning ----------
function planTomorrowDlg() {
  const today = todayISO();
  const next = nextWorkDay(today);
  const doneToday = S.tasks.filter((t) => t.completedAt && toISO(new Date(t.completedAt)) === today && !isBox(t)).length;
  const open = scheduledOn(today).filter((t) => !isDone(t));
  const chosen = new Set(mioIds(next));
  const d = showDialog({
    title: 'Tomorrow Planning',
    wide: true,
    html: `<section class="set-sec"><h3>Review today</h3>
        <p>${doneToday} task${doneToday === 1 ? '' : 's'} completed today. ${open.length ? `${open.length} planned block${open.length === 1 ? ' is' : 's are'} unfinished.` : 'Nothing planned is left unfinished.'}</p>
        ${open.length ? `<button class="btn ghost sm" data-role="move">Move unfinished work…</button>` : ''}</section>
      <section class="set-sec"><h3>3 Most Important Outcomes for ${esc(dayLabel(next))}</h3>
        <p class="muted small" data-role="count">Choose up to ${MIO_MAX}.</p>
        <div class="omio-choices">${mioCandidates(next).map((t) => `<label class="omio-choice"><input type="checkbox" name="mio" value="${esc(t.id)}" ${chosen.has(t.id) ? 'checked' : ''}><span>${healthDot(t)} ${esc(t.title || 'Untitled task')}</span>${isScheduled(t) ? `<small class="muted">${esc(dayLabel(t.slotDate))} ${esc(fmtTime(t.slotStart))}</small>` : ''}</label>`).join('') || '<p class="muted small">No open tasks yet.</p>'}</div>
        <label class="mini"><input type="checkbox" data-role="book" checked> Book focus time for any that don't have a time that day</label></section>
      <div class="dlg-foot"><button class="btn ghost" data-role="cancel">Cancel</button><button class="btn primary" data-role="save">Save plan</button></div>`,
  });
  const boxes = $$('input[name=mio]', d);
  const sync = () => {
    const n = boxes.filter((b) => b.checked).length;
    boxes.forEach((b) => { b.disabled = !b.checked && n >= MIO_MAX; });
    $('[data-role=count]', d).textContent = `${n} of ${MIO_MAX} chosen.`;
  };
  boxes.forEach((b) => { b.onchange = sync; });
  sync();
  $('[data-role=move]', d)?.addEventListener('click', () => { d.close(); moveUnfinishedDlg(today); });
  $('[data-role=cancel]', d).onclick = () => d.close();
  $('[data-role=save]', d).onclick = () => {
    const picked = boxes.filter((b) => b.checked).map((b) => taskById(b.value)).filter(Boolean).slice(0, MIO_MAX);
    const book = $('[data-role=book]', d).checked;
    d.close();
    const day = { ...(S.days[next] || {}), mio: picked.map((t) => t.id) };
    delete day.omio;
    S.days[next] = day;
    let booked = 0;
    if (book) {
      picked.filter((t) => t.slotDate !== next && !isDone(t)).forEach((t) => {
        const slot = freeSlot({ ...t, workType: t.workType || 'focus' }, next, 0);
        if (slot && slot.date === next) { t.slotDate = slot.date; t.slotStart = slot.start; if (!t.workType) t.workType = 'focus'; booked++; }
      });
    }
    commit();
    toast(`${picked.length} Most Important Outcome${picked.length === 1 ? '' : 's'} set for ${dayLabel(next).toLowerCase()}${booked ? `, ${booked} booked in focus time` : ''}.`);
  };
}

// ---------- Shared bits for cards, panel and grid ----------
const healthDot = (t) => {
  const h = healthOf(t.health);
  return h ? `<span class="health-dot" style="background:${h.color}" title="${esc(healthText(h.v))}" aria-label="${esc(healthText(h.v))}"></span>` : '';
};
const typeTag = (t) => (t.workType ? `<span class="type-tag" style="--c:${workTypeOf(t.workType).color}">${esc(workTypeOf(t.workType).short)}</span>` : '');
const slotText = (t) => (isScheduled(t) ? `${dayLabel(t.slotDate)} ${fmtTime(t.slotStart)}` : '');
/** Extra card metadata: work type, traffic light, 3MIO, estimate and slot. */
function timeboxMeta(t) {
  const mio = mioDateOf(t);
  return [
    mio ? `<span class="meta omio" title="One of the 3 Most Important Outcomes for ${esc(dayLabel(mio))}">★ MIO</span>` : '',
    typeTag(t), healthDot(t),
    t.workType === 'decision' && t.decision?.deadline ? `<span class="meta" title="Decision deadline">${icon('flag', 13)}${esc(fmtDate(t.decision.deadline))}</span>` : '',
    isBox(t) ? `<span class="meta" title="Tasks in this time box">${icon('list', 13)}${boxItems(t).filter(isDone).length}/${boxItems(t).length}</span>` : '',
    t.boxId && boxOf(t) ? `<span class="meta" title="In time box “${esc(boxOf(t).title)}”">${icon('clock', 13)}${esc(slotText(boxOf(t)) || 'In a time box')}</span>`
      : isScheduled(t) ? `<span class="meta" title="Time box">${icon('clock', 13)}${esc(slotText(t))}</span>` : t.tbQueued ? `<span class="meta" title="Waiting in the Time Box list">${icon('clock', 13)}Time Box</span>` : t.estimate ? `<span class="meta" title="Estimate">${icon('clock', 13)}${esc(fmtDur(t.estimate))}</span>` : '',
  ].join('');
}
const estimateOptions = (cur) => {
  const list = [...new Set([...estimateList(), ...(cur ? [cur] : [])])].sort((a, b) => a - b);
  return `<option value="" ${cur ? '' : 'selected'}>Not set</option>${list.map((m) => `<option value="${m}" ${m === cur ? 'selected' : ''}>${fmtDur(m)}</option>`).join('')}`;
};
function setHealth(t, v, exact = false) {
  const prev = t.health;
  t.health = exact ? v : t.health === v ? '' : v;
  if (t.health && t.health !== prev && t.health !== 'green') addEvent(t, 'health', { value: t.health, note: t.healthNote || '' });
  commit();
  if (t.health === 'yellow' || t.health === 'red') setTimeout(() => $('[data-focus="health-note"]')?.focus(), 0);
}

/** First run: name the planner and say when you focus best (1 to 5 sessions). */
function setupDlg() {
  const focus = TB().blocks.filter((b) => b.kind === 'focus' && b.cadence === 'daily').sort((a, b) => a.start - b.start);
  const sessions = (focus.length ? focus : [{ start: 8 * 60 + 30, end: 12 * 60 + 30 }]).slice(0, 5);
  const row = (s) => `<div class="focus-row"><input type="time" step="300" name="from" value="${hm(s.start)}" aria-label="From" required><span>to</span><input type="time" step="300" name="to" value="${hm(s.end)}" aria-label="To" required><button type="button" class="icon-btn" data-role="del" aria-label="Remove session">${icon('close', 13)}</button></div>`;
  const d = showDialog({
    title: 'Welcome',
    html: `<form class="stack setup">
      <label class="field"><span>Name Your Planner</span><input name="name" value="${esc(S.settings.plannerName || plannerName())}" required autocomplete="off"></label>
      <div class="field"><span>When Do You Focus Best?</span><div class="focus-list">${sessions.map(row).join('')}</div>
        <button type="button" class="btn ghost sm" data-role="add">${icon('plus', 14)} Add session</button></div>
      <div class="dlg-foot"><button class="btn primary">Start</button></div></form>`,
    onClose: () => { if (S.settings.onboarded === false) { S.settings.onboarded = true; commit(); } },
  });
  const form = $('form', d);
  const list = $('.focus-list', d);
  const sync = () => { const n = list.children.length; $('[data-role="add"]', d).hidden = n >= 5; $$('[data-role="del"]', list).forEach((b) => { b.hidden = n <= 1; }); };
  sync();
  $('[data-role="add"]', d).onclick = () => {
    if (list.children.length >= 5) return;
    const last = list.lastElementChild ? parseHM(list.lastElementChild.querySelector('[name=to]').value) : 8 * 60 + 30;
    const start = Math.min(last + 60, 22 * 60);
    list.insertAdjacentHTML('beforeend', row({ start, end: Math.min(start + 120, 23 * 60 + 55) }));
    sync();
  };
  list.onclick = (e) => { const b = e.target.closest('[data-role="del"]'); if (b && list.children.length > 1) { b.closest('.focus-row').remove(); sync(); } };
  form.onsubmit = (e) => {
    e.preventDefault();
    const rows = $$('.focus-row', list).map((r) => ({ start: parseHM(r.querySelector('[name=from]').value), end: parseHM(r.querySelector('[name=to]').value) }));
    if (rows.some((r) => r.start === null || r.end === null || r.end <= r.start)) { toast('Each session has to end after it starts.', { error: true }); return; }
    const tb = TB();
    tb.blocks = [...tb.blocks.filter((b) => !(b.kind === 'focus' && b.cadence === 'daily')),
      ...rows.sort((a, b) => a.start - b.start).map((r) => ({ id: uid(), name: 'Focus', kind: 'focus', color: '', start: r.start, end: r.end, cadence: 'daily', anchor: null, protected: true, note: '' }))];
    tb.dayStart = Math.min(tb.dayStart, ...rows.map((r) => r.start));
    tb.dayEnd = Math.max(tb.dayEnd, ...rows.map((r) => r.end));
    S.settings.plannerName = form.elements.name.value.trim().slice(0, 60);
    S.settings.onboarded = true;
    d.close();
    commit();
    refreshSettings();
  };
  $('[name=name]', form).select();
}

/** Suggestions for a block's name: your types and the names already in use. You can also type anything. */
function blockNamesList() {
  const names = [...new Set([...TB().blocks.map((b) => b.name), "Tomorrow's Planning", 'Decision Window', ...workTypes().map((w) => w.short)])];
  return `<datalist id="tb-block-names">${names.map((n) => `<option value="${esc(n)}"></option>`).join('')}</datalist>`;
}
/** Right-click on the Time Box grid: change the block under the pointer, or add one there. */
function blockMenu(e, col) {
  const rect = col.getBoundingClientRect();
  const min = Math.floor((Number(col.dataset.rs) + (e.clientY - rect.top) / Number(col.dataset.ppm)) / SNAP_OF()) * SNAP_OF();
  const iso = col.dataset.tbDate;
  const b = blockAt(iso, min);
  const start = b ? b.start : min;
  const end = b ? b.end : Math.min(min + 60, 1440);
  const anchor = { getBoundingClientRect: () => ({ left: e.clientX, right: e.clientX, top: e.clientY, bottom: e.clientY }), contains: () => false };
  openPop(anchor, () => `<form class="picker block-menu" data-submit="tbBlockSave" data-id="${b ? esc(b.id) : ''}">
    <h4>${b ? `Change “${esc(b.name)}”` : `New block at ${esc(fmtTime(min))}`}</h4>
    <label class="field"><span>Name</span><input name="name" list="tb-block-names" value="${esc(b ? b.name : '')}" placeholder="Name" autocomplete="off" data-focus="block-name"></label>
    ${blockNamesList()}
    <div class="task-fields two">
      <label class="field"><span>Type</span><select name="kind">${workTypeOptions(b ? b.kind : 'focus')}</select></label>
      <div class="field wide"><span>Colour</span>${colourChoicesHTML('color', b?.color, workTypeOf(b ? b.kind : 'focus').color, 'Type colour')}</div>
      <label class="field"><span>Starts</span><input name="start" type="time" step="300" value="${hm(start)}" required></label>
      <label class="field"><span>Ends</span><input name="end" type="time" step="300" value="${hm(end)}" required></label>
    </div>
    <label class="mini"><input type="checkbox" name="protected" ${b?.protected ? 'checked' : ''}> Protected</label>
    <div class="row">${b ? `<button class="btn ghost sm danger-text" type="button" data-act="tbDelBlock" data-id="${esc(b.id)}">Delete</button>` : ''}<span class="spacer"></span>
      <button class="btn primary sm">${b ? 'Save' : 'Add block'}</button></div>
    
  </form>`);
  $('[data-focus="block-name"]', ui.pop.el)?.focus();
}
function saveBlockFromMenu(form, data) {
  const start = parseHM(data.get('start'));
  const end = parseHM(data.get('end'));
  if (start === null || end === null || end <= start) { toast('A block has to end after it starts.', { error: true }); return; }
  const kind = data.get('kind') === EDIT_WORK_TYPES ? '' : data.get('kind');
  const name = String(data.get('name') || '').trim() || workTypeOf(kind).short;
  let b = TB().blocks.find((x) => x.id === form.dataset.id);
  if (!b) { b = { id: uid(), cadence: 'daily', anchor: null, note: '' }; TB().blocks.push(b); }
  Object.assign(b, { name: name.slice(0, 60), kind, color: data.get('color') || '', start, end, protected: data.get('protected') === 'on' });
  closePop();
  commit();
  toast(`Saved “${b.name}”.`);
}

const isReqDraft = (t, kind) => { const r = t?.[REQ_KINDS[kind].field]; return r?.status === 'draft' && pkey(r.by) === pkey(S.meId); };
const isDecisionDraft = (t) => isReqDraft(t, 'decision');
/** Choose who decides or approves. Anyone can ask anyone; one row per person (same email = same person). */
function pickRequestee(el, kind) {
  const t = taskById(el.dataset.id);
  const seen = new Map();
  for (const p of S.people) { const k = pkey(p.id); if (k !== pkey(S.meId) && (!seen.has(k) || String(p.id).startsWith('e:'))) seen.set(k, p); }
  // Requests go up the reporting line: to your manager, or anyone above them.
  const people = [...seen.values()].filter((p) => canSendUpTo(p.id))
    .sort((a, b) => (pkey(b.id) === managerOf(S.meId)) - (pkey(a.id) === managerOf(S.meId)) || a.name.localeCompare(b.name));
  if (!people.length) {
    toast(hierarchyOn() ? 'You can send this to the people you report to. Nobody is above you in Settings › Reporting Lines.' : 'Add the person in Settings › People first.', { error: true });
    return;
  }
  openMenu(el, people.map((p) => ({ label: p.name, icon: 'user', run: () => {
    // A draft until you press Send, so you can fill it in first.
    t[REQ_KINDS[kind].field] = { to: p.id, by: S.meId, at: Date.now(), status: 'draft' };
    if (kind === 'decision' && t.workType !== 'decision') t.workType = 'decision';
    commit();
    toast(kind === 'decision' ? 'Fill in the issue, recommendation and impact, then tap Send.' : 'Fill in what needs approval, then tap Send.');
  } })));
}
/** Sends a drafted request: they're notified and it shows in their sidebar. */
function sendReq(t, kind) {
  const f = REQ_KINDS[kind].field;
  if (!t?.[f]) return;
  t[f] = { ...t[f], at: Date.now(), status: 'pending' };
  t.shared = true;
  addEvent(t, kind === 'decision' ? 'decision' : 'approvalReq', { to: t[f].to });
  commit();
  toast(`${REQ_KINDS[kind].label} sent to ${person(t[f].to)?.name || 'them'}.`);
}
/** The Send / Discard bar at the bottom of a draft request. */
const reqSendBarHTML = (t, kind) => (isReqDraft(t, kind) ? `<div class="dr-send"><p class="small">To <b>${esc(person(reqOf(t, kind).to)?.name || 'someone')}</b> · not sent yet</p>
  <button class="btn ghost sm" data-act="reqDiscard" data-kind="${kind}" data-id="${esc(t.id)}">Discard</button>
  <button class="btn primary" data-act="reqSendNow" data-kind="${kind}" data-id="${esc(t.id)}">${icon('send', 15)} Send</button></div>` : '');
/** Approval Request: the decision is already made, only the authorisation is needed. */
function approvalHTML(t) {
  const r = t.approvalReq;
  if (!r || (r.status === 'draft' && !isReqDraft(t, 'approval'))) return '';
  const a = t.approval || {};
  const who = (id) => (isMeId(id) ? 'you' : person(id)?.name || 'someone');
  const label = { draft: 'Not sent', pending: 'Waiting', approved: 'Approved', rejected: 'Rejected' }[r.status] || r.status;
  const field = (k, lab, rows = 2) => `<label class="field"><span>${lab}</span><textarea rows="${rows}" data-input="approvalField" data-k="${k}" data-focus="apr-${k}">${esc(a[k] || '')}</textarea></label>`;
  const box = r.status === 'pending' && isMeId(r.to)
    ? `<div class="review-box"><p><b>${esc(person(r.by)?.name || 'A teammate')}</b> asked for your approval on ${esc(fmtDateTime(r.at))}.</p>
      <div class="row"><button class="btn primary sm" data-act="approvalApprove" data-id="${esc(t.id)}">${icon('check', 14)} Approve</button><button class="btn ghost sm danger-text" data-act="approvalReject" data-id="${esc(t.id)}">Reject</button></div></div>`
    : r.status === 'pending' ? `<div class="review-box"><p>Sent to <b>${esc(who(r.to))}</b> on ${esc(fmtDateTime(r.at))}.</p>
      <div class="row"><button class="btn ghost sm" data-act="approvalWithdraw" data-id="${esc(t.id)}">Withdraw</button></div></div>`
    : r.status !== 'draft' ? `<div class="review-box"><p><b>${r.status === 'approved' ? 'Approved' : 'Rejected'}</b> by ${esc(who(r.to))} on ${esc(fmtDateTime(r.decidedAt))}${r.note ? `: “${esc(r.note)}”` : ''}</p></div>` : '';
  return `<section class="task-sec decision-sec approval-sec">
    <div class="sec-head"><h3>Approval Request</h3><span class="dr-status dr-${esc(r.status)}">${esc(label)} · ${esc(who(r.to))}</span></div>
    ${r.status === 'draft' ? '<p class="muted small">For when the decision is already made and you only need sign-off, like a budget, leave, a discount or a hire.</p>' : ''}
    ${field('what', 'Approval needed for')}
    <div class="task-fields two">
      <label class="field"><span>Amount (if any)</span><input value="${esc(a.amount || '')}" data-input="approvalField" data-k="amount" data-focus="apr-amount" placeholder="e.g. $5,000"></label>
      <label class="field"><span>Approve by</span><input type="date" value="${esc(a.deadline || '')}" data-change="approvalDeadline"></label>
    </div>
    ${field('details', 'Details', 3)}
    ${box}
    ${reqSendBarHTML(t, 'approval')}
  </section>`;
}
/** Who the request is with, and the answer so far. */
function decisionStatusHTML(t) {
  const r = t.decisionReq;
  if (!r) return '';
  if (r.status === 'draft' && !isDecisionDraft(t)) return '';
  const label = { draft: 'Not sent', pending: 'Waiting', approved: 'Approved', rejected: 'Rejected' }[r.status] || r.status;
  return `<span class="dr-status dr-${esc(r.status)}">${esc(label)} · ${esc(r.to === S.meId ? 'you' : person(r.to)?.name || 'someone')}</span>`;
}
/** Approve / Reject for the person deciding; withdraw for the sender while it waits. */
function decisionActionsHTML(t) {
  const r = t.decisionReq;
  if (!r) return '';
  if (isDecisionDraft(t)) return '';
  if (r.status === 'pending' && r.to === S.meId) return `<div class="review-box"><p><b>${esc(person(r.by)?.name || 'A teammate')}</b> asked for your decision on ${esc(fmtDateTime(r.at))}.</p>
    <div class="row"><button class="btn primary sm" data-act="decisionApprove" data-id="${esc(t.id)}">${icon('check', 14)} Approve</button><button class="btn ghost sm danger-text" data-act="decisionReject" data-id="${esc(t.id)}">Reject</button></div></div>`;
  if (r.status === 'pending' && r.by === S.meId) return `<div class="review-box"><p>Sent to <b>${esc(person(r.to)?.name || 'someone')}</b> on ${esc(fmtDateTime(r.at))}.</p>
    <div class="row"><button class="btn ghost sm" data-act="decisionWithdraw" data-id="${esc(t.id)}">Withdraw</button></div></div>`;
  if (r.status !== 'pending') return `<div class="review-box"><p><b>${esc(r.status === 'approved' ? 'Approved' : 'Rejected')}</b> by ${esc(r.to === S.meId ? 'you' : person(r.to)?.name || 'someone')} on ${esc(fmtDateTime(r.decidedAt))}${r.note ? `: “${esc(r.note)}”` : ''}</p></div>`;
  return '';
}

/** The Time Box row under the task name: assign, or where it is (with open, remove and colour). */
function tbRowHTML(t) {
  const inBox = !!(t.boxId && boxOf(t));
  const inTimebox = isScheduled(t) || inBox || t.tbQueued;
  const where = isScheduled(t) ? `${dayLabel(t.slotDate)} ${fmtTime(t.slotStart)}–${fmtTime(endOf(t))}${blockAt(t.slotDate, t.slotStart) ? ` · ${blockAt(t.slotDate, t.slotStart).name}` : ''}`
    : inBox ? `in “${boxOf(t).title}”${isScheduled(boxOf(t)) ? `, ${slotText(boxOf(t))}` : ''}` : 'waiting in the Time Box list';
  // Need Focus first, then the Time Box: assign it, or once it's there, a button that takes you to it.
  return `<div class="tb-row">
        <button class="need-focus ${t.workType === 'focus' ? 'on' : ''}" data-act="toggleFocus" data-id="${esc(t.id)}" aria-pressed="${t.workType === 'focus'}">${icon('target', 15)} Need Focus</button>
        ${inTimebox
          ? `<button class="need-focus go-tb" data-act="goTimebox" data-id="${esc(t.id)}" title="Time Box: ${esc(where)}">${icon('clock', 15)} Go to Time Box</button>${isScheduled(t) && !isDone(t) && !isBox(t) ? `<button class="btn ghost sm" data-act="tbRequeue" data-id="${esc(t.id)}" title="Keep this time box and put the task back on the list to place again">${icon('plus', 13)} Add to Time Box Allocation</button>` : ''}${overlapsOf(t).length ? '<span class="danger-text small">Overlaps</span>' : ''}`
          : `<button class="btn primary sm" data-act="assignTimebox" data-id="${esc(t.id)}">${icon('clock', 14)} Assign to Time Box</button>`}
      </div>${timeSpentHTML(t)}`;
}
/** Progress as a bar you tap: 10%, 50%, 80%, 100% (tap the current step again to go back one). */
function progressPickHTML(t) {
  const steps = [10, 50, 80, 100];
  return `<div class="pg-pick" role="group" aria-label="Progress ${t.progress}%">
      <div class="pg-steps">${steps.map((v) => `<button class="pg-step ${t.progress >= v ? 'on' : ''} ${v === 100 && t.progress === 100 ? 'done' : ''}" data-act="pgStep" data-id="${esc(t.id)}" data-v="${v}" aria-label="${v}%" title="${v}%"></button>`).join('')}</div>
      <b class="pg-val">${t.progress ? `${t.progress}%` : 'Not started'}</b>
      ${t.start && t.progress ? `<small class="muted">Started ${esc(fmtDate(t.start))}</small>` : ''}
    </div>`;
}

/** The Traffic Light row under the task name: a dropdown, plus a recovery or support note when not Green. */
function healthRowHTML(t) {
  const h = healthOf(t.health);
  return `<div class="health-row"><div class="status-row">
      <button class="health-toggle" data-act="healthMenu" data-id="${esc(t.id)}" aria-haspopup="true" aria-label="Traffic Light: ${esc(h ? `${h.label}, ${h.meaning}` : 'not set')}" title="Traffic Light">
        <span class="tl ${h ? 'set' : ''}" aria-hidden="true">${['red', 'yellow', 'green'].map((v) => `<i class="tl-${v} ${t.health === v ? 'on' : ''}"></i>`).join('')}</span>${h ? `<b class="tl-text tl-${h.v}">${esc(h.meaning)}</b>` : ''}</button>
      ${progressPickHTML(t)}
      </div>
      ${h && h.v !== 'green' ? `<label class="field"><span>${h.v === 'red' ? 'Support Needed' : 'Recovery Plan'}</span><textarea rows="2" data-input="healthNote" data-focus="health-note">${esc(t.healthNote || '')}</textarea></label>` : ''}
    </div>`;
}

/** The colours shown when you click "Traffic Light". */
function healthPickerHTML(t) {
  return `<div class="picker health-picker"><h4>Traffic Light</h4>
    ${HEALTH.map((x) => `<button class="health-opt ${t.health === x.v ? 'on' : ''}" style="--c:${x.color}" data-act="pickHealth" data-id="${esc(t.id)}" data-v="${x.v}" aria-pressed="${t.health === x.v}"><i></i><span><b>${esc(x.label)}</b><small>${esc(x.meaning)}</small></span>${t.health === x.v ? icon('check', 15) : ''}</button>`).join('')}
    ${t.health ? `<button class="health-opt clear" data-act="pickHealth" data-id="${esc(t.id)}" data-v=""><i></i><span>Clear</span></button>` : ''}</div>`;
}

/** The time box contents (for a box) and the Decision Request section of the task panel. */
function timeboxHTML(t) {
  const dec = t.decision || {};
  const decField = (k, label, rows = 2) => `<label class="field"><span>${label}</span><textarea rows="${rows}" data-input="decisionField" data-k="${k}" data-focus="dec-${k}">${esc(dec[k] || '')}</textarea></label>`;
  return `${isBox(t) ? boxSectionHTML(t) : ''}
    ${t.workType === 'decision' || t.decisionReq ? `<section class="task-sec decision-sec">
      <div class="sec-head"><h3>Decision Request</h3>${decisionStatusHTML(t)}</div>
      ${decField('issue', 'Issue')}${decField('recommendation', 'Recommendation')}${decField('impact', 'Impact')}${decField('needed', 'Decision needed')}
      <div class="task-fields two">
        <label class="field"><span>Deadline</span><input type="date" value="${esc(dec.deadline || '')}" data-change="decisionDeadline"></label>
        <label class="field"><span>Handling</span><select data-change="tbField" data-field="urgency">${URGENCY.map((u) => `<option value="${u.v}" ${u.v === (t.urgency || '') ? 'selected' : ''}>${esc(u.label)}</option>`).join('')}</select></label>
      </div>
      <div class="row">${t.urgency === 'routine'
        ? `<button class="btn ghost sm" data-act="bookNextFree" data-id="${esc(t.id)}">Schedule for the biweekly review</button>${TB().blocks.some((b) => b.kind === 'review') ? '' : ''}`
        : t.urgency === 'emergency'
          ? `<button class="btn primary sm" data-act="handleNow" data-id="${esc(t.id)}">Handle now (interrupts focus)</button>`
          : `<button class="btn ghost sm" data-act="bookNextFree" data-id="${esc(t.id)}">Schedule in the Decision Window</button>`}</div>
      ${decisionActionsHTML(t)}
      ${reqSendBarHTML(t, 'decision')}
    </section>` : ''}
    ${approvalHTML(t)}`;
}

// ---------- Boxes: one time slot holding several small tasks ----------
// A box is a personal task with `box: true`. Its items are ordinary tasks with `boxId` set and no
// slot of their own, so each can be ticked off separately. The box completes when every item has.
const isBox = (t) => !!t?.box;
// Items keep the order you drag them into (boxOrder); older items without one keep their creation order.
const boxItems = (box) => S.tasks.filter((t) => t.boxId === box.id).sort((a, b) => (a.boxOrder ?? a.created) - (b.boxOrder ?? b.created));
const boxOf = (t) => (t.boxId ? taskById(t.boxId) : null);
function makeBox(fields) {
  const p = personalPlan();
  return addTask({ planId: p.id, bucketId: p.buckets[0].id, title: 'Misc tasks', box: true, assignees: [], ...fields });
}
function refreshBox(box) {
  const items = boxItems(box);
  if (!items.length) return;
  const done = items.every(isDone);
  box.progress = done ? 100 : items.some(isDone) ? 50 : 0;
  box.completedAt = done ? box.completedAt || Date.now() : null;
}
function putInBox(box, t) {
  const old = boxOf(t);
  const others = boxItems(box).filter((x) => x !== t);
  t.boxOrder = others.length ? Math.max(...others.map((x, i) => x.boxOrder ?? i)) + 1 : 0;
  t.boxId = box.id;
  t.slotDate = null;
  t.slotStart = null;
  t.tbQueued = false;
  refreshBox(box);
  if (old && old !== box) refreshBox(old);
}
function takeOutOfBox(t) {
  const box = boxOf(t);
  t.boxId = null;
  t.tbQueued = true;
  if (box) refreshBox(box);
}
/** Empties a box back into the Time Box list (used when a box is deleted or unpacked). */
function releaseBox(box) { boxItems(box).forEach((t) => { t.boxId = null; t.tbQueued = true; }); }
/** Asks before squeezing a task into an existing block, which then becomes (or already is) a box. */
async function dropOnBlock(t, target) {
  const choice = await choiceDlg('Put them in one time box?', `<p>Squeeze <b>${esc(t.title || 'Untitled task')}</b> into ${isBox(target) ? `the time box <b>${esc(target.title)}</b>` : `one time box with <b>${esc(target.title || 'Untitled task')}</b>`}, ${esc(dayLabel(target.slotDate))} ${esc(fmtTime(target.slotStart))}–${esc(fmtTime(endOf(target)))}?</p>`, [
    { v: 'merge', label: isBox(target) ? 'Add to this time box' : 'Combine into one time box', primary: true },
    { v: 'cancel', label: 'Cancel' },
  ]);
  if (choice !== 'merge') { render(); return; }
  undoable(`Added “${t.title || 'Untitled task'}” to a time box`, () => {
    let box = target;
    if (!isBox(target)) {
      box = makeBox({ slotDate: target.slotDate, slotStart: target.slotStart, estimate: durOf(target), workType: target.workType, tbColor: target.tbColor || '' });
      putInBox(box, target);
    }
    putInBox(box, t);
  });
}
/** Packs several tasks into one new box in the next free slot. */
function combineIntoBox(tasks, fromIso) {
  if (tasks.length < 2) return;
  const dur = Math.max(30, ceilSnap(tasks.reduce((n, t) => n + (t.estimate || 15), 0)));
  const types = [...new Set(tasks.map((t) => t.workType || ''))];
  let slot = null;
  undoable(`Combined ${tasks.length} tasks into one time box`, () => {
    const box = makeBox({ estimate: dur, workType: types.length === 1 ? types[0] : '' });
    tasks.forEach((t) => putInBox(box, t));
    const from = searchStart(fromIso);
    slot = freeSlot(box, from.date, from.min);
    if (slot) { box.slotDate = slot.date; box.slotStart = slot.start; } else box.tbQueued = true;
  });
  if (!slot) toast('No free slot in the next 4 weeks, so the new time box is waiting in the list.', { error: true });
}
function boxSectionHTML(box) {
  const items = boxItems(box);
  const others = timeboxQueue().filter((t) => t.id !== box.id);
  return `<section class="task-sec box-sec">
    <div class="sec-head"><h3>In this time box <small>${items.filter(isDone).length} / ${items.length} done</small></h3>
      ${items.length ? `<button class="btn ghost sm" data-act="unpackBox" data-id="${esc(box.id)}">Unpack</button>` : ''}</div>
    <ul class="box-items">${items.map((t) => `<li class="${isDone(t) ? 'done' : ''}" data-drag="boxitem" data-id="${esc(t.id)}">
      <span class="grip" aria-hidden="true" title="Drag to reorder">⋮⋮</span>
      <button class="check small ${isDone(t) ? 'on' : ''} ${t.review ? 'pending' : ''}" data-act="toggleDone" data-id="${esc(t.id)}" aria-label="${checkLabel(t)}" title="${checkLabel(t)}">${icon('check', 10)}</button>
      <button class="link-btn" data-open-task="${esc(t.id)}">${esc(t.title || 'Untitled task')}</button>
      <small class="muted">${esc(planById(t.planId)?.name || '')}</small>
      <button class="icon-btn" data-act="unbox" data-id="${esc(t.id)}" aria-label="Take ${esc(t.title)} out of the time box" title="Take out">${icon('close', 12)}</button></li>`).join('')}</ul>
    <form class="inline-add" data-submit="boxAddItem" data-id="${esc(box.id)}"><span>${icon('plus', 14)}</span><input name="title" placeholder="Add a task" data-focus="box-add" autocomplete="off" aria-label="Add a small task"></form>
    ${others.length ? `<label class="field"><span>Or move in a task from the Time Box list</span><select data-change="boxAddExisting" data-id="${esc(box.id)}"><option value="">Choose a task…</option>${others.map((t) => `<option value="${esc(t.id)}">${esc(t.title || 'Untitled task')}</option>`).join('')}</select></label>` : ''}
  </section>`;
}

// ---------- Time Box page: Day, Week and Month ----------
// Pixels per row for each interval: short rows stay compact, hour rows get room for a block's text.
const ROW_PX = { 5: 15, 10: 20, 15: 26, 20: 30, 30: 36, 60: 58 };
const rowPx = (mode) => Math.round((ROW_PX[SNAP_OF()] || 26) * (mode === 'week' ? 0.85 : 1));
const TB_COLORS = [
  { v: '', label: 'By work type' }, { v: '#e8b896', label: 'Peach' }, { v: '#a9cf8f', label: 'Green' }, { v: '#9fc5e3', label: 'Blue' },
  { v: '#c8b5dc', label: 'Lavender' }, { v: '#df9f6c', label: 'Orange' }, { v: '#d9705e', label: 'Red' }, { v: '#e6cd78', label: 'Yellow' }, { v: '#bdb6a6', label: 'Grey' },
];
const fillOf = (t) => t.tbColor || autoColor(t);
const rowLabel = (min) => { const h = Math.floor(min / 60); const m = min % 60; return `${((h + 11) % 12) + 1}${m ? `.${pad(m)}` : ''}`; };
/** Lays out overlapping blocks side by side. */
function laneLayout(tasks) {
  const sorted = [...tasks].sort((a, b) => a.slotStart - b.slotStart || durOf(b) - durOf(a));
  const out = new Map();
  let cluster = [];
  let clusterEnd = -1;
  const flush = () => { const n = Math.max(1, ...cluster.map((c) => out.get(c.id).lane + 1)); cluster.forEach((c) => { out.get(c.id).lanes = n; }); cluster = []; };
  for (const t of sorted) {
    if (t.slotStart >= clusterEnd && cluster.length) flush();
    const used = cluster.filter((c) => endOf(c) > t.slotStart).map((c) => out.get(c.id).lane);
    let lane = 0;
    while (used.includes(lane)) lane++;
    out.set(t.id, { lane, lanes: 1 });
    cluster.push(t);
    clusterEnd = Math.max(clusterEnd, endOf(t));
  }
  if (cluster.length) flush();
  return out;
}
function gridRange(dates) {
  let lo = ui.tbFullDay ? 6 * 60 : TB().dayStart;
  let hi = ui.tbFullDay ? 22 * 60 : TB().dayEnd;
  dates.forEach((iso) => {
    scheduledOn(iso).forEach((t) => { lo = Math.min(lo, t.slotStart); hi = Math.max(hi, endOf(t)); });
    blocksOn(iso).forEach((b) => { lo = Math.min(lo, b.start); hi = Math.max(hi, b.end); });
  });
  return [Math.max(0, Math.floor(lo / SNAP_OF()) * SNAP_OF()), Math.min(1440, Math.ceil(hi / SNAP_OF()) * SNAP_OF())];
}
/** As many box items as fit in the block's height, in your order; the rest are summarised as "+N more". */
function fitItems(items, h) {
  const rows = Math.max(1, Math.floor((h - 17) / 14));
  return { shown: items.slice(0, rows), hidden: Math.max(0, items.length - rows) };
}
function blockHTML(t, iso, ppm, y, lane, n) {
  const h = Math.max(durOf(t) * ppm - 1, 16);
  const items = isBox(t) ? boxItems(t) : [];
  const omio = isMio(t, iso);
  const fit = items.length ? fitItems(items, h) : null;
  const dur = `(${durOf(t)} min)`;
  const cls = ['tb-block', isBox(t) ? 'box' : '', isDone(t) ? 'done' : '', overlapsOf(t).length ? 'overlap' : '', intrudes(t) ? 'intrude' : '', h < 30 ? 'short' : '', omio ? 'is-omio' : ''].join(' ');
  const label = `${t.title || 'Untitled task'}, ${fmtTime(t.slotStart)} to ${fmtTime(endOf(t))}${items.length ? `, ${items.filter(isDone).length} of ${items.length} done` : ''}`;
  return `<div class="${cls}" style="top:${y(t.slotStart)}px;height:${h}px;left:calc(${lane / n} * 100% + 1px);width:calc(100% / ${n} - 2px);--c:${fillOf(t)}"
    data-open-task="${esc(realId(t))}" data-drag="block" data-id="${esc(t.id)}" tabindex="0" aria-label="${esc(label)}" data-tip="${esc(`${fmtTime(t.slotStart)} – ${fmtTime(endOf(t))}`)}">
    <div class="tb-b-title">${omio ? '★ ' : ''}${healthDot(t)}${esc(t.title || 'Untitled task')}${(() => { const all = bookingsOf(t._task || t); if (all.length < 2) return ''; const i = all.findIndex((b) => b.date === t.slotDate && b.start === t.slotStart); return ` <small class="tb-part" title="Time box ${i + 1} of ${all.length} for this task">${i + 1}/${all.length}</small>`; })()}${h < 38 ? ` <small class="tb-b-dur">${dur}</small>` : ''}${items.length ? ` <small>${items.filter(isDone).length}/${items.length}${fit.hidden ? ` · +${fit.hidden} more` : ''}</small>` : ''}</div>
    ${h >= 38 ? `<small class="tb-b-dur">${dur}</small>` : ''}
    ${items.length ? `<ul class="tb-items">${fit.shown.map((i) => `<li class="${isDone(i) ? 'done' : ''}"><button class="check small ${isDone(i) ? 'on' : ''} ${i.review ? 'pending' : ''}" data-act="toggleDone" data-id="${esc(i.id)}" aria-label="${esc(`${checkLabel(i)}: ${i.title}`)}" title="${checkLabel(i)}">${icon('check', 9)}</button><span>${esc(i.title || 'Untitled task')}</span></li>`).join('')}</ul>` : ''}
    <span class="tb-resize" data-drag="resize" data-id="${esc(t.id)}" aria-hidden="true"></span></div>`;
}
function timeGridHTML(dates, mode) {
  const rh = rowPx(mode);
  const ppm = rh / SNAP_OF();
  const [rs, re] = gridRange(dates);
  const height = (re - rs) * ppm;
  const y = (min) => (min - rs) * ppm;
  const today = todayISO();
  const rows = [];
  for (let m = rs; m < re; m += SNAP_OF()) rows.push(m);
  const col = (iso) => {
    const tasks = scheduledOn(iso);
    const lanes = laneLayout(tasks);
    const bands = blocksOn(iso).map((b) => `<div class="tb-band ${b.protected ? 'protected' : ''}" style="top:${y(b.start)}px;height:${(b.end - b.start) * ppm}px;--c:${b.color || workTypeOf(b.kind).color}" data-tip="${esc(`${b.name}: ${fmtTime(b.start)} – ${fmtTime(b.end)}${b.note ? `. ${b.note}` : ''}`)}"><span>${b.protected ? icon('lock', 10) : ''}${esc(b.name)}</span></div>`).join('');
    const off = isWorkDay(iso) ? '' : `<div class="tb-off" style="top:0;height:${height}px"></div>`;
    const blocks = tasks.map((t) => { const { lane, lanes: n } = lanes.get(t.id); return blockHTML(t, iso, ppm, y, lane, n); }).join('');
    const now = iso === today && nowMin() >= rs && nowMin() <= re ? `<div class="tb-now" style="top:${y(nowMin())}px"></div>` : '';
    return `<div class="tb-col ${iso === today ? 'today' : ''} ${isWorkDay(iso) ? '' : 'weekend'}" data-tb-date="${iso}" data-rs="${rs}" data-ppm="${ppm}" data-act="tbAdd" style="height:${height}px;--rh:${rh}px">${off}${bands}${now}${blocks}</div>`;
  };
  const head = (iso) => {
    const planned = plannedMinutes(iso);
    const cap = capacityOf(iso);
    const warn = warningChips(iso);
    const mio = mioOf(iso);
    const d = parseISO(iso);
    return `<div class="tb-dayhead ${iso === today ? 'today' : ''}">
      <button class="tb-date" data-act="tbOpenDay" data-date="${iso}"><b>${pad(d.getDate())}/${pad(d.getMonth() + 1)}</b><span>${esc(d.toLocaleDateString(undefined, { weekday: 'short' }))}</span></button>
      ${cap ? `<div class="tb-cap ${planned > cap ? 'over' : ''}" title="${esc(`${fmtDur(planned)} planned of ${fmtDur(cap)}`)}"><i style="width:${Math.min(100, (planned / cap) * 100)}%"></i></div>` : ''}
      <button class="tb-omio-mini ${mio.length ? 'set' : ''}" data-act="mioMenu" data-date="${iso}" title="${esc(mio.length ? mio.map((t, i) => `${i + 1}. ${t.title}`).join('\n') : '3 Most Important Outcomes')}">★ ${mio.length ? `${mio.length} MIO` : '3MIO'}</button>
      ${warn.length ? `<small class="tb-warn" title="${esc(warn.join('\n'))}">${icon('flag', 11)} ${esc(mode === 'week' ? `${warn.length} warning${warn.length === 1 ? '' : 's'}` : warn.join(' · '))}</small>` : ''}
    </div>`;
  };
  return `<div class="tb-grid xl ${mode}" style="--cols:${dates.length};--rh:${rh}px">
    <div class="tb-scroll" data-scroll="tb-${mode}">
      <div class="tb-heads"><div class="tb-gutter head"></div>${dates.map(head).join('')}</div>
      <div class="tb-body-grid">
        <div class="tb-gutter" style="height:${height}px">${rows.map((m) => `<span class="${m % 60 ? '' : 'hour'}" style="top:${y(m)}px;height:${rh}px">${esc(rowLabel(m))}</span>`).join('')}</div>
        ${dates.map(col).join('')}
      </div>
    </div>
  </div>`;
}
function monthGridHTML(anchor) {
  const first = `${anchor.slice(0, 8)}01`;
  const month = anchor.slice(0, 7);
  const start = weekStartOf(first);
  const today = todayISO();
  const weeks = [];
  for (let w = start; w.slice(0, 7) <= month; w = addDays(w, 7)) weeks.push(w);
  const cell = (iso) => {
    const entries = scheduledOn(iso).sort((a, b) => a.slotStart - b.slotStart);
    const planned = plannedMinutes(iso);
    const cap = capacityOf(iso);
    const mio = mioOf(iso);
    const shown = entries.slice(0, 5);
    return `<div class="tb-mcell ${iso === today ? 'today' : ''} ${iso.slice(0, 7) !== month ? 'other' : ''} ${isWorkDay(iso) ? '' : 'weekend'}" data-tb-month="${iso}">
      <button class="tb-mdate" data-act="tbOpenDay" data-date="${iso}">${parseISO(iso).getDate()}</button>
      ${cap && planned ? `<span class="tb-mload ${planned > cap ? 'over' : ''}">${esc(fmtDur(planned))}</span>` : ''}
      ${mio.map((t) => `<div class="tb-momio" title="Most Important Outcome">★ ${esc(t.title)}</div>`).join('')}
      ${shown.map((t) => `<button class="tb-mchip ${isDone(t) ? 'done' : ''}" style="--c:${fillOf(t)}" data-open-task="${esc(realId(t))}" data-drag="block" data-id="${esc(t.id)}"><b>${esc(rowLabel(t.slotStart))}</b> ${esc(t.title || 'Untitled task')}${isBox(t) ? ` <small>${boxItems(t).filter(isDone).length}/${boxItems(t).length}</small>` : ''}</button>`).join('')}
      ${entries.length > shown.length ? `<button class="tb-mmore" data-act="tbOpenDay" data-date="${iso}">+${entries.length - shown.length} more</button>` : ''}
    </div>`;
  };
  const names = Array.from({ length: 7 }, (_, i) => parseISO(addDays(start, i)).toLocaleDateString(undefined, { weekday: 'short' }));
  return `<div class="tb-month"><div class="tb-mhead">${names.map((n) => `<span>${esc(n)}</span>`).join('')}</div>
    ${weeks.map((w) => `<div class="tb-mweek">${Array.from({ length: 7 }, (_, i) => cell(addDays(w, i))).join('')}</div>`).join('')}</div>`;
}
/** The list on the right: tasks added with "Add to Time Box" that don't have a time yet. */
/** Everything you put in Time Box Allocation, in your order: still waiting, or given a time that hasn't passed. */
function allocationOrder() {
  const today = todayISO();
  const now = nowMin();
  const live = (t) => !isScheduled(t) || t.slotDate > today || (t.slotDate === today && endOf(t) > now);
  return S.tasks.filter((t) => t.tbQueued && !isDone(t) && !(t.boxId && taskById(t.boxId)) && live(t))
    .sort((a, b) => isPlanningTask(b) - isPlanningTask(a) || (a.tbRank ?? 1e9) - (b.tbRank ?? 1e9) || a.priority - b.priority || String(a.due || '9').localeCompare(String(b.due || '9')));
}
/** Its number in your order (1 is most important); it keeps it when it's given a time. */
/** The daily Planning task: always first, never numbered, never one of the Top 3. */
const isPlanningTask = (t) => !!t.dailyPlan || (t.workType === 'planning' && t.title === 'Planning');
const allocationNumber = (t) => (isPlanningTask(t) ? 0 : allocationOrder().filter((x) => !isPlanningTask(x)).indexOf(t) + 1);
/** Still waiting for a time. */
function timeboxQueue() { return allocationOrder().filter((t) => !isScheduled(t)); }
/** Given a time, soonest first. */
function timeboxAllocated() { return allocationOrder().filter(isScheduled).sort((a, b) => a.slotDate.localeCompare(b.slotDate) || a.slotStart - b.slotStart); }
/** Saves a new order for the whole list (waiting and allocated), so numbers stay put. */
function setAllocationOrder(list) { list.forEach((x, i) => { x.tbRank = i; }); }
/** Booked but not ticked off, and its time has passed: you can book it again. */
function unfinishedBooked() {
  const today = todayISO();
  const now = nowMin();
  return S.tasks.filter((t) => isScheduled(t) && !isDone(t) && !isBox(t) && (t.slotDate < today || (t.slotDate === today && endOf(t) <= now)))
    .sort((a, b) => String(b.slotDate).localeCompare(String(a.slotDate)) || b.slotStart - a.slotStart).slice(0, 30);
}
/** The default tasks you can drop into any day: Planning, at your preferred length. */
const PLAN_MINS = [5, 10, 15, 20, 25, 30];
const planningMin = () => ui.planMinOnce || TB().planMin || 15;
function defaultTasksHTML() {
  return `<div class="tb-defaults"><h4>Default tasks</h4>
    <div class="tb-q tb-default" style="--c:${workTypeOf('planning').color}">
      <div class="tb-q-title"><span>Planning</span></div>
      <div class="tb-q-meta">${typeTag({ workType: 'planning' })}
        <select class="tb-q-est" data-change="tbPlanMin" aria-label="Planning length">${PLAN_MINS.map((m) => `<option value="${m}" ${m === planningMin() ? 'selected' : ''}>${m}m</option>`).join('')}</select>
        <button class="btn ghost xs" data-act="tbAddPlanning" data-book="1" title="Book the next free slot">Next free</button>
        <button class="btn ghost xs" data-act="tbAddPlanning" title="Add to the list, then drag it where you want">Add</button>
      </div></div></div>`;
}
/** Your other open, unscheduled tasks, offered under the list. */
function otherOpenTasks() {
  const mine = (t) => t.assignees.includes(S.meId) || (!t.assignees.length && (planById(t.planId)?.owner || S.meId) === S.meId);
  return S.tasks.filter((t) => !isDone(t) && !isScheduled(t) && !t.tbQueued && !isBox(t) && !(t.boxId && taskById(t.boxId)) && mine(t)).slice(0, 60);
}
/** "Allocated" on a list item: × 2 or × 3 when it has more than one time box that day, and when. */
function allocTagHTML(t) {
  const day = t.slotDate;
  const same = bookingsOf(t).filter((b) => b.date === day);
  return `<div class="alloc-tag"><b>Allocated${same.length > 1 ? ` × ${same.length}` : ''}</b><span>${esc(dayLabel(day))} ${same.map((b) => esc(fmtTime(b.start))).join(', ')}</span></div>`;
}
/** The time choices in the Time Box Allocation list. */
const QUEUE_MINS = [5, 10, 15, 20, 30, 60, 90];
function queueItemHTML(t, anchor, picked, rank, again, allocated) {
  return `<div class="tb-q ${picked ? 'picked' : ''} ${allocated ? 'allocated' : ''} ${rank && rank <= 3 ? 'top3' : ''} ${t.workType === 'focus' ? 'needs-focus' : ''}" data-drag="task" data-id="${esc(t.id)}" data-open-task="${esc(t.id)}" ${rank ? 'data-rank="1"' : ''} ${again ? 'data-again="1"' : ''} style="--c:${fillOf(t)}">
    <div class="tb-q-title">${rank ? `<b class="tb-rank" title="${rank <= 3 ? `Top 3 · priority ${rank}` : `Priority ${rank}`}">${rank}</b>` : ''}${again ? `<small class="tb-was" title="Booked before">${esc(dayLabel(t.slotDate))} ${esc(fmtTime(t.slotStart))}</small>` : ''}${t.tbQueued && !again && !allocated ? `<input type="checkbox" class="tb-pick" data-change="tbPick" data-id="${esc(t.id)}" ${picked ? 'checked' : ''} aria-label="Select ${esc(t.title)}" title="Select to combine into one time box">` : ''}${healthDot(t)}<span>${esc(t.title || 'Untitled task')}${isBox(t) ? ` <small>(${boxItems(t).length} items)</small>` : ''}</span></div>
    ${allocated ? allocTagHTML(t) : ''}
    <div class="tb-q-meta">${t.workType === 'focus' ? `<span class="focus-tag">${icon('target', 12)} Needs focus</span>` : typeTag(t)}
      <select class="tb-q-est" data-change="tbQueueEstimate" data-id="${esc(t.id)}" aria-label="Time required">${QUEUE_MINS.includes(t.estimate) ? '' : `<option value="" selected disabled>${t.estimate ? esc(fmtDur(t.estimate)) : 'Time required'}</option>`}${QUEUE_MINS.map((m) => `<option value="${m}" ${m === t.estimate ? 'selected' : ''}>${m} mins</option>`).join('')}</select>
      ${again ? `<button class="btn ghost xs" data-act="tbRequeue" data-id="${esc(t.id)}">Add to Time Box Allocation</button>` : ''}
      ${again || t.tbQueued ? '' : `<button class="btn ghost xs" data-act="tbQueue" data-id="${esc(t.id)}">Add</button>`}
    </div>${(() => {
      // Worked on over several days: the time adds up across all its time boxes.
      const all = bookingsOf(t);
      if (!all.length || (all.length === 1 && !t.tbQueued && !again)) return '';
      const days = new Set(all.map((b) => b.date)).size;
      const booked = all.reduce((n, b) => n + b.dur, 0);
      return `<small class="tb-total">So far ${esc(fmtDur(booked))} over ${days} day${days === 1 ? '' : 's'} · spent ${esc(fmtDur(timeSpentOf(t).total))}</small>`;
    })()}</div>`;
}
function renderPlanner() {
  const mode = ['day', 'week', 'month'].includes(ui.dayView) ? ui.dayView : 'week';
  const anchor = ui.dayDate;
  const today = todayISO();
  const dates = mode === 'day' ? [anchor] : Array.from({ length: 7 }, (_, i) => addDays(weekStartOf(anchor), i));
  const title = mode === 'day' ? parseISO(anchor).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    : mode === 'week' ? `${fmtDate(dates[0])} – ${fmtDate(dates[6])}` : parseISO(`${anchor.slice(0, 8)}01`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const past = S.tasks.filter((t) => isScheduled(t) && !isDone(t) && t.slotDate < today).length;
  const queue = allocationOrder();
  const picked = (ui.tbPicked || []).filter((id) => queue.some((t) => t.id === id && !isScheduled(t)));
  const others = ui.tbShowOthers ? otherOpenTasks() : [];
  const again = unfinishedBooked();
  return `<div class="tb-page">
    <header class="tb-head">
      <div class="tb-title"><h1>Time Box</h1><p class="muted">${esc(title)}</p></div>
      <div class="seg">${[['day', 'Day'], ['week', 'Week'], ['month', 'Month']].map(([v, l]) => `<button class="${mode === v ? 'on' : ''}" data-act="setDayView" data-v="${v}">${l}</button>`).join('')}</div>
      <div class="row tb-nav">
        <button class="icon-btn" data-act="tbNav" data-dir="-1" aria-label="Previous">${icon('chevL')}</button>
        <button class="btn ghost sm" data-act="tbToday">Today</button>
        <button class="icon-btn" data-act="tbNav" data-dir="1" aria-label="Next">${icon('chevR')}</button>
        ${mode !== 'month' ? `<label class="mini tb-interval">Rows <select data-change="tbInterval" aria-label="Time interval">${INTERVALS.map((m) => `<option value="${m}" ${m === SNAP_OF() ? 'selected' : ''}>${m} min</option>`).join('')}</select></label>
        <label class="mini"><input type="checkbox" data-change="tbFullDay" ${ui.tbFullDay ? 'checked' : ''}> Early and late hours</label>` : ''}
      </div>
      <div class="spacer"></div>
      <button class="btn ghost sm" data-act="moveUnfinished" data-date="${mode === 'day' ? anchor : today}">Move unfinished</button>
    </header>
    ${past ? `<div class="banner"><span>${past} unfinished time box${past === 1 ? '' : 'es'} from earlier days.</span><button class="btn ghost sm" data-act="moveUnfinished" data-date="past">Move to free slots</button></div>` : ''}
    <div class="tb-legend">${workTypes().filter((w) => w.v !== 'review' || TB().blocks.some((b) => b.kind === 'review')).map((w) => `<span><i style="background:${w.color}"></i>${esc(w.short)}</span>`).join('')}</div>
    <div class="tb-main">
      ${mode === 'month' ? monthGridHTML(anchor) : timeGridHTML(dates, mode)}
      <aside class="tb-side">
        <h3>Time Box Allocation <span class="count">${queue.length}</span></h3>
        
        ${picked.length >= 2 ? `<button class="btn primary sm" data-act="tbCombine">Combine ${picked.length} into one time box</button>` : picked.length === 1 ? '' : ''}
        <div class="tb-queue" data-scroll="tb-queue">
          ${queue.length ? `<p class="small muted tb-hint">Drag to set the order: 1 is most important. Your Top 3 become the day's 3 Most Important Outcomes when you give them a time. Drag an allocated task in again to give it another time box.</p>` : ''}
          ${queue.map((t) => queueItemHTML(t, anchor, picked.includes(t.id), allocationNumber(t), false, isScheduled(t))).join('') || '<p class="muted small">Nothing waiting.</p>'}
          ${again.length ? `<h4 class="tb-sub tb-sub-row">Not finished <span class="count">${again.length}</span><button class="btn ghost xs" data-act="tbClearUnfinished">Clear all</button></h4><p class="small muted tb-hint">Booked but not ticked off. Drag one into the planner, or tap Add to Time Box Allocation to put it back on the list. The earlier time box stays, and the time adds up.</p>${again.map((t) => queueItemHTML(t, anchor, false, 0, true)).join('')}` : ''}
          <button class="show-done" data-act="tbToggleOthers">${icon(ui.tbShowOthers ? 'chevD' : 'chevR', 12)} ${ui.tbShowOthers ? 'Hide' : 'Show'} my other open tasks</button>
          ${others.map((t) => queueItemHTML(t, anchor, false)).join('')}
        </div>
      </aside>
    </div>
  </div>`;
}

// ---------- Settings ----------
const WEEKDAYS = [1, 2, 3, 4, 5, 6, 0];
function timeboxSettingsHTML() {
  const tb = TB();
  const dayName = (d) => new Date(2024, 0, 7 + d).toLocaleDateString(undefined, { weekday: 'short' });
  return `
    <div class="f-chips">${WEEKDAYS.map((d) => `<button class="f-chip ${tb.workDays.includes(d) ? 'on' : ''}" aria-pressed="${tb.workDays.includes(d)}" data-act="tbToggleDay" data-d="${d}">${esc(dayName(d))}</button>`).join('')}</div>
    <div class="task-fields">
      <label class="field"><span>Day starts</span><input type="time" step="900" value="${hm(tb.dayStart)}" data-change="tbSetting" data-k="dayStart"></label>
      <label class="field"><span>Day ends</span><input type="time" step="900" value="${hm(tb.dayEnd)}" data-change="tbSetting" data-k="dayEnd"></label>
      <label class="field"><span>Time interval</span><select data-change="tbInterval">${INTERVALS.map((m) => `<option value="${m}" ${m === tb.interval ? 'selected' : ''}>${m} minutes</option>`).join('')}</select></label>
      <label class="field"><span>Daily capacity (hours)</span><input type="number" min="0.5" max="24" step="0.5" value="${tb.capacity}" data-change="tbSetting" data-k="capacity"></label>
    </div>
    <div class="field"><span>Duration choices</span>
      <div class="f-chips">${tb.estimates.map((m) => `<span class="f-chip on est-chip">${esc(fmtDur(m))}<button class="chip-x" data-act="tbDelEstimate" data-m="${m}" aria-label="Remove ${esc(fmtDur(m))}">${icon('close', 10)}</button></span>`).join('')}</div>
      <form class="row est-add" data-submit="tbAddEstimate"><input name="minutes" type="number" min="1" max="720" step="1" placeholder="Minutes" aria-label="Add a duration in minutes" required><button class="btn ghost sm">${icon('plus', 14)} Add</button><button class="btn ghost sm" type="button" data-act="tbResetEstimates">Reset</button></form>
    </div>
    ${(() => {
      const a = tb.addTo && planById(tb.addTo.planId);
      const b = a && a.buckets.find((x) => x.id === tb.addTo.bucketId);
      return `<div class="row"><span class="small">Tasks typed into the Time Box go to: <b>${a && b ? `${esc(a.name)} › ${esc(b.name)}` : 'ask each time'}</b></span>${a && b ? '<button class="btn ghost xs" data-act="tbForgetAddTo">Ask each time</button>' : ''}</div>`;
    })()}
    <ul class="tb-blocks">${tb.blocks.map((b) => `<li>
      <i class="dot" style="background:${b.color || workTypeOf(b.kind).color}"></i>
      <input value="${esc(b.name)}" list="tb-block-names" data-change="tbBlock" data-id="${esc(b.id)}" data-k="name" aria-label="Block name">
      <select data-change="tbBlock" data-id="${esc(b.id)}" data-k="kind" aria-label="Type">${workTypeOptions(b.kind, true)}</select>
      ${colourButtonHTML('block', b.id, b.color, workTypeOf(b.kind).color, 'Type colour')}
      <input type="time" step="900" value="${hm(b.start)}" data-change="tbBlock" data-id="${esc(b.id)}" data-k="start" aria-label="Starts">
      <input type="time" step="900" value="${hm(b.end)}" data-change="tbBlock" data-id="${esc(b.id)}" data-k="end" aria-label="Ends">
      <select data-change="tbBlock" data-id="${esc(b.id)}" data-k="cadence" aria-label="Repeats">${CADENCES.map((c) => `<option value="${c.v}" ${c.v === b.cadence ? 'selected' : ''}>${esc(c.label)}</option>`).join('')}</select>
      ${b.cadence !== 'daily' ? `<input type="date" value="${esc(b.anchor || '')}" data-change="tbBlock" data-id="${esc(b.id)}" data-k="anchor" aria-label="First date" title="First date">` : ''}
      <label class="mini"><input type="checkbox" ${b.protected ? 'checked' : ''} data-change="tbBlock" data-id="${esc(b.id)}" data-k="protected"> Protected</label>
      <button class="icon-btn" data-act="tbDelBlock" data-id="${esc(b.id)}" aria-label="Remove ${esc(b.name)}">${icon('close', 13)}</button>
    </li>`).join('')}</ul>
    ${blockNamesList()}
    
    <div class="row"><button class="btn ghost sm" data-act="tbAddBlock">${icon('plus', 14)} Add block</button>
      <button class="btn ghost sm" data-act="editWorkTypes">${icon('pencil', 14)} Edit types</button>
      ${tb.blocks.some((b) => b.kind === 'review') ? '' : `<button class="btn ghost sm" data-act="tbAddReview">${icon('plus', 14)} Add biweekly review</button>`}
      <button class="btn ghost sm" data-act="tbRestore">Restore default rhythm</button></div>`;
}
