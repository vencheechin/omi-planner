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
const fmtTime = (min) => new Date(2000, 0, 1, Math.floor(min / 60), min % 60).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
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
      { id: uid(), name: 'Decision Window', kind: 'decision', start: 13 * 60 + 30, end: 14 * 60, cadence: 'daily', protected: false,
        note: 'Review written decision requests and handle same-day decisions.' },
      { id: uid(), name: 'Collaboration', kind: 'collab', start: 14 * 60, end: 17 * 60, cadence: 'daily', protected: false,
        note: 'Operational work, meetings and team discussions.' },
      { id: uid(), name: 'Tomorrow Planning', kind: 'planning', start: 17 * 60, end: 17 * 60 + 30, cadence: 'daily', protected: false,
        note: "Review the day and choose tomorrow's 3 Most Important Outcomes." },
    ],
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
    blocks: tb.blocks.filter((b) => b && Number.isFinite(b.start) && Number.isFinite(b.end) && b.end > b.start).map((b) => ({
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
const scheduledOn = (iso) => S.tasks.filter((t) => t.slotDate === iso && Number.isFinite(t.slotStart));
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
  if (w.intrusions) out.push(`${w.intrusions} non-focus task${w.intrusions === 1 ? '' : 's'} in protected focus time`);
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
  const issues = placementIssues(t, iso, start, dur);
  if (issues.length) {
    const alt = freeSlot(t, iso, start, dur);
    const choice = await choiceDlg('Check this time slot', `<p><b>${esc(t.title || 'Untitled task')}</b>, ${esc(dayLabel(iso))} ${esc(fmtTime(start))}–${esc(fmtTime(start + dur))}</p><ul class="issue-list">${issues.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>`, [
      ...(alt ? [{ v: 'alt', label: `Use ${dayLabel(alt.date)} ${fmtTime(alt.start)} instead`, primary: true }] : []),
      { v: 'anyway', label: 'Place it here anyway', primary: !alt },
      { v: 'cancel', label: 'Cancel' },
    ]);
    if (choice !== 'alt' && choice !== 'anyway') { render(); return false; }
    if (choice === 'alt') ({ date: iso, start } = alt);
  }
  t.slotDate = iso;
  t.slotStart = start;
  t.estimate = dur;
  if (!t.workType) { const b = blockAt(iso, start); if (b && b.kind) t.workType = b.kind; }
  commit();
  return true;
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
  return `<option value="" ${cur ? '' : 'selected'}>No estimate</option>${list.map((m) => `<option value="${m}" ${m === cur ? 'selected' : ''}>${fmtDur(m)}</option>`).join('')}`;
};
function setHealth(t, v, exact = false) {
  const prev = t.health;
  t.health = exact ? v : t.health === v ? '' : v;
  if (t.health && t.health !== prev && t.health !== 'green') addEvent(t, 'health', { value: t.health, note: t.healthNote || '' });
  commit();
  if (t.health === 'yellow' || t.health === 'red') setTimeout(() => $('[data-focus="health-note"]')?.focus(), 0);
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

/** The Traffic Light row under the task name: a dropdown, plus a recovery or support note when not Green. */
function healthRowHTML(t) {
  const h = healthOf(t.health);
  return `<div class="health-row">
      <button class="health-toggle" data-act="healthMenu" data-id="${esc(t.id)}" aria-haspopup="true" aria-label="Traffic Light: ${esc(h ? `${h.label}, ${h.meaning}` : 'not set')}" title="Traffic Light">
        <span class="tl ${h ? 'set' : ''}" aria-hidden="true">${['red', 'yellow', 'green'].map((v) => `<i class="tl-${v} ${t.health === v ? 'on' : ''}"></i>`).join('')}</span>${h ? `<b class="tl-text tl-${h.v}">${esc(h.meaning)}</b>` : ''}</button>
      ${h && h.v !== 'green' ? `<label class="field"><span>${h.v === 'red' ? 'Support Needed' : 'Recovery Plan'}</span><textarea rows="2" data-input="healthNote" data-focus="health-note">${esc(t.healthNote || '')}</textarea></label>` : ''}
    </div>`;
}

/** The colours shown when you click "Traffic Light". */
function healthPickerHTML(t) {
  return `<div class="picker health-picker"><h4>Traffic Light</h4>
    ${HEALTH.map((x) => `<button class="health-opt ${t.health === x.v ? 'on' : ''}" style="--c:${x.color}" data-act="pickHealth" data-id="${esc(t.id)}" data-v="${x.v}" aria-pressed="${t.health === x.v}"><i></i><span><b>${esc(x.label)}</b><small>${esc(x.meaning)}</small></span>${t.health === x.v ? icon('check', 15) : ''}</button>`).join('')}
    ${t.health ? `<button class="health-opt clear" data-act="pickHealth" data-id="${esc(t.id)}" data-v=""><i></i><span>Clear</span></button>` : ''}</div>`;
}

/** The Time Box and Decision Request sections of the task panel. */
function timeboxHTML(t) {
  const mio = mioDateOf(t);
  const targetDay = t.slotDate && t.slotDate >= todayISO() ? t.slotDate : todayISO();
  const h = healthOf(t.health);
  const dec = t.decision || {};
  const decField = (k, label, rows = 2) => `<label class="field"><span>${label}</span><textarea rows="${rows}" data-input="decisionField" data-k="${k}" data-focus="dec-${k}">${esc(dec[k] || '')}</textarea></label>`;
  const inBox = !!(t.boxId && boxOf(t));
  const inTimebox = isScheduled(t) || inBox || t.tbQueued;
  const where = isScheduled(t) ? `${dayLabel(t.slotDate)} ${fmtTime(t.slotStart)}–${fmtTime(endOf(t))}${blockAt(t.slotDate, t.slotStart) ? ` · ${blockAt(t.slotDate, t.slotStart).name}` : ''}`
    : inBox ? `in “${boxOf(t).title}”${isScheduled(boxOf(t)) ? `, ${slotText(boxOf(t))}` : ''}` : 'waiting in the Time Box list';
  return `<section class="task-sec tb-sec">
      <div class="tb-row">
        ${inTimebox
          ? `<span class="tb-state">${icon('clock', 14)} <b>Time Box:</b> ${esc(where)}${overlapsOf(t).length ? ' · <span class="danger-text">overlaps</span>' : ''}</span>
            <button class="btn ghost sm" data-act="openInTimebox" data-id="${esc(t.id)}">Open</button>
            <button class="btn ghost sm" data-act="removeFromTimebox" data-id="${esc(t.id)}">Remove</button>
            ${colourButtonHTML('task', t.id, t.tbColor, autoColor(t), 'Automatic')}`
          : `<button class="btn primary sm" data-act="assignTimebox" data-id="${esc(t.id)}">${icon('clock', 14)} Assign to Time Box</button>`}
        <span class="spacer"></span>
        <button class="btn ghost sm ${mio ? 'active' : ''}" data-act="toggleMio" data-id="${esc(t.id)}" data-date="${mio || targetDay}" title="3 Most Important Outcomes">★ ${mio ? `In 3MIO for ${esc(dayLabel(mio))}` : `Add to 3MIO for ${esc(dayLabel(targetDay))}`}</button>
      </div>
    </section>
    ${isBox(t) ? boxSectionHTML(t) : ''}
    ${t.workType === 'decision' ? `<section class="task-sec decision-sec">
      <div class="sec-head"><h3>Decision request</h3></div>
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
    </section>` : ''}`;
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
  const cls = ['tb-block', isBox(t) ? 'box' : '', isDone(t) ? 'done' : '', overlapsOf(t).length ? 'overlap' : '', intrudes(t) ? 'intrude' : '', h < 30 ? 'short' : '', omio ? 'is-omio' : ''].join(' ');
  const label = `${t.title || 'Untitled task'}, ${fmtTime(t.slotStart)} to ${fmtTime(endOf(t))}${items.length ? `, ${items.filter(isDone).length} of ${items.length} done` : ''}`;
  return `<div class="${cls}" style="top:${y(t.slotStart)}px;height:${h}px;left:calc(${lane / n} * 100% + 1px);width:calc(100% / ${n} - 2px);--c:${fillOf(t)}"
    data-open-task="${esc(t.id)}" data-drag="block" data-id="${esc(t.id)}" tabindex="0" aria-label="${esc(label)}" title="${esc(`${fmtTime(t.slotStart)}–${fmtTime(endOf(t))} · ${fmtDur(durOf(t))}`)}">
    <div class="tb-b-title">${omio ? '★ ' : ''}${healthDot(t)}${esc(t.title || 'Untitled task')}${items.length ? ` <small>${items.filter(isDone).length}/${items.length}${fitItems(items, h).hidden ? ` · +${fitItems(items, h).hidden} more` : ''}</small>` : ''}</div>
    ${items.length ? `<ul class="tb-items">${fitItems(items, h).shown.map((i) => `<li class="${isDone(i) ? 'done' : ''}"><button class="check small ${isDone(i) ? 'on' : ''} ${i.review ? 'pending' : ''}" data-act="toggleDone" data-id="${esc(i.id)}" aria-label="${esc(`${checkLabel(i)}: ${i.title}`)}" title="${checkLabel(i)}">${icon('check', 9)}</button><span>${esc(i.title || 'Untitled task')}</span></li>`).join('')}</ul>` : ''}
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
    const bands = blocksOn(iso).map((b) => `<div class="tb-band ${b.protected ? 'protected' : ''}" style="top:${y(b.start)}px;height:${(b.end - b.start) * ppm}px;--c:${b.color || workTypeOf(b.kind).color}" title="${esc(`${b.name}, ${fmtTime(b.start)}–${fmtTime(b.end)}${b.note ? `. ${b.note}` : ''}`)}"><span>${b.protected ? icon('lock', 10) : ''}${esc(b.name)}</span></div>`).join('');
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
      ${shown.map((t) => `<button class="tb-mchip ${isDone(t) ? 'done' : ''}" style="--c:${fillOf(t)}" data-open-task="${esc(t.id)}" data-drag="block" data-id="${esc(t.id)}"><b>${esc(rowLabel(t.slotStart))}</b> ${esc(t.title || 'Untitled task')}${isBox(t) ? ` <small>${boxItems(t).filter(isDone).length}/${boxItems(t).length}</small>` : ''}</button>`).join('')}
      ${entries.length > shown.length ? `<button class="tb-mmore" data-act="tbOpenDay" data-date="${iso}">+${entries.length - shown.length} more</button>` : ''}
    </div>`;
  };
  const names = Array.from({ length: 7 }, (_, i) => parseISO(addDays(start, i)).toLocaleDateString(undefined, { weekday: 'short' }));
  return `<div class="tb-month"><div class="tb-mhead">${names.map((n) => `<span>${esc(n)}</span>`).join('')}</div>
    ${weeks.map((w) => `<div class="tb-mweek">${Array.from({ length: 7 }, (_, i) => cell(addDays(w, i))).join('')}</div>`).join('')}</div>`;
}
/** The list on the right: tasks added with "Add to Time Box" that don't have a time yet. */
function timeboxQueue() {
  return S.tasks.filter((t) => t.tbQueued && !isScheduled(t) && !isDone(t) && !(t.boxId && taskById(t.boxId)))
    .sort((a, b) => (isBox(b) - isBox(a)) || a.priority - b.priority || String(a.due || '9').localeCompare(String(b.due || '9')));
}
/** Your other open, unscheduled tasks, offered under the list. */
function otherOpenTasks() {
  const mine = (t) => t.assignees.includes(S.meId) || (!t.assignees.length && (planById(t.planId)?.owner || S.meId) === S.meId);
  return S.tasks.filter((t) => !isDone(t) && !isScheduled(t) && !t.tbQueued && !isBox(t) && !(t.boxId && taskById(t.boxId)) && mine(t)).slice(0, 60);
}
function queueItemHTML(t, anchor, picked) {
  return `<div class="tb-q ${picked ? 'picked' : ''}" data-drag="task" data-id="${esc(t.id)}" data-open-task="${esc(t.id)}" style="--c:${fillOf(t)}">
    <div class="tb-q-title">${t.tbQueued ? `<input type="checkbox" class="tb-pick" data-change="tbPick" data-id="${esc(t.id)}" ${picked ? 'checked' : ''} aria-label="Select ${esc(t.title)}" title="Select to combine into one time box">` : ''}${healthDot(t)}<span>${esc(t.title || 'Untitled task')}${isBox(t) ? ` <small>(${boxItems(t).length} items)</small>` : ''}</span></div>
    <div class="tb-q-meta">${typeTag(t)}
      <select class="tb-q-est" data-change="tbQueueEstimate" data-id="${esc(t.id)}" aria-label="Estimate">${estimateOptions(t.estimate)}</select>
      <button class="btn ghost xs" data-act="bookNextFree" data-id="${esc(t.id)}" data-from="${anchor}">Next free</button>
      ${t.tbQueued ? `<button class="icon-btn" data-act="tbUnqueue" data-id="${esc(t.id)}" aria-label="Remove from Time Box" title="Remove from Time Box">${icon('close', 12)}</button>` : `<button class="btn ghost xs" data-act="tbQueue" data-id="${esc(t.id)}">Add</button>`}
    </div></div>`;
}
function renderPlanner() {
  const mode = ['day', 'week', 'month'].includes(ui.dayView) ? ui.dayView : 'week';
  const anchor = ui.dayDate;
  const today = todayISO();
  const dates = mode === 'day' ? [anchor] : Array.from({ length: 7 }, (_, i) => addDays(weekStartOf(anchor), i));
  const title = mode === 'day' ? parseISO(anchor).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    : mode === 'week' ? `${fmtDate(dates[0])} – ${fmtDate(dates[6])}` : parseISO(`${anchor.slice(0, 8)}01`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const past = S.tasks.filter((t) => isScheduled(t) && !isDone(t) && t.slotDate < today).length;
  const queue = timeboxQueue();
  const picked = (ui.tbPicked || []).filter((id) => queue.some((t) => t.id === id));
  const others = ui.tbShowOthers ? otherOpenTasks() : [];
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
      <button class="btn primary sm" data-act="planTomorrow">Tomorrow Planning</button>
    </header>
    <form class="tb-quick" data-submit="tbQuickAdd">
      <input name="title" placeholder="Add a task to the Time Box" data-focus="tb-quick" autocomplete="off" aria-label="Task name" required>
      <select name="estimate" aria-label="Estimate">${estimateList().map((m) => `<option value="${m}" ${m === defaultEstimate() ? 'selected' : ''}>${fmtDur(m)}</option>`).join('')}</select>
      <select name="workType" aria-label="Work type">${workTypeOptions('focus', true)}</select>
      <input name="date" type="date" value="${anchor}" aria-label="Day">
      <input name="start" type="time" step="${SNAP_OF() * 60}" aria-label="Start time" title="Leave empty to use the next free slot">
      <button class="btn primary sm">${icon('plus', 14)} Add</button>
      
    </form>
    ${mode === 'day' ? mioBarHTML(anchor, true) : ''}
    ${past ? `<div class="banner"><span>${past} unfinished time box${past === 1 ? '' : 'es'} from earlier days.</span><button class="btn ghost sm" data-act="moveUnfinished" data-date="past">Move to free slots</button></div>` : ''}
    <div class="tb-legend">${workTypes().filter((w) => w.v !== 'review' || TB().blocks.some((b) => b.kind === 'review')).map((w) => `<span><i style="background:${w.color}"></i>${esc(w.short)}</span>`).join('')}</div>
    <div class="tb-main">
      ${mode === 'month' ? monthGridHTML(anchor) : timeGridHTML(dates, mode)}
      <aside class="tb-side">
        <h3>Time Box <span class="count">${queue.length}</span></h3>
        
        ${picked.length >= 2 ? `<button class="btn primary sm" data-act="tbCombine">Combine ${picked.length} into one time box</button>` : picked.length === 1 ? '' : ''}
        <div class="tb-queue" data-scroll="tb-queue">
          ${queue.map((t) => queueItemHTML(t, anchor, picked.includes(t.id))).join('') || '<p class="muted small">Nothing waiting.</p>'}
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
