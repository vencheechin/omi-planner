'use strict';
/* Due dates and reminders.
   - A due date set by whoever assigned the task is theirs: the assignee sees it but can't change it.
   - Reminders work like Google Calendar's for all-day events: "on the day at 9:00 am", "1 day before
     at 9:00 am", "1 week before" and custom ones, plus "after the due date" for work that's late.
     They only fire while the task isn't completed, and only for the person who set them
     (they're personal and sync to your own devices).
   - Tasks you assign to someone come with one by default: the morning after the due date, if it's
     still not completed. */

const REM_UNITS = { days: 1, weeks: 7 };
const DEFAULT_ASSIGN_REMINDERS = [{ n: 1, unit: 'days', when: 'after', at: '09:00' }];
const REM_PRESETS = [
  { n: 0, unit: 'days', when: 'before', at: '09:00' },
  { n: 1, unit: 'days', when: 'before', at: '09:00' },
  { n: 1, unit: 'weeks', when: 'before', at: '09:00' },
  { n: 1, unit: 'days', when: 'after', at: '09:00' },
];

/** The assigner owns the due date; the assignee can't change it. */
const dueLocked = (t) => !!(t && t.assignedBy && t.assignedBy !== S.meId && t.assignees.includes(S.meId));
const assignedByMe = (t) => t.assignedBy === S.meId && t.assignees.some((a) => a !== S.meId);
/** Your reminders on a task; tasks you assigned to someone default to "1 day after, if not completed". */
const remindersOf = (t) => (Array.isArray(t.reminders) ? t.reminders : assignedByMe(t) ? DEFAULT_ASSIGN_REMINDERS : []);
const remKey = (t, r) => `${t.due}|${r.n}|${r.unit}|${r.when}|${r.at}`;
function remText(r) {
  const at = fmtTime(parseHM(r.at) ?? 540);
  if (!r.n) return `On the day, ${at}`;
  const unit = r.unit === 'weeks' ? (r.n === 1 ? 'week' : 'weeks') : (r.n === 1 ? 'day' : 'days');
  return `${r.n} ${unit} ${r.when === 'after' ? 'after' : 'before'}, ${at}${r.when === 'after' ? ' if not completed' : ''}`;
}
/** When a reminder fires, in ms, for the task's current due date. */
function remTime(t, r) {
  const days = (r.n || 0) * (REM_UNITS[r.unit] || 1) * (r.when === 'after' ? 1 : -1);
  const d = parseISO(addDays(t.due, days));
  const m = parseHM(r.at) ?? 540;
  d.setHours(Math.floor(m / 60), m % 60, 0, 0);
  return d.getTime();
}

/** Sends any reminders that are due. Runs on start, every minute and when you come back to the app. */
function checkReminders() {
  if (typeof S === 'undefined' || !S) return;
  const now = Date.now();
  let changed = false;
  for (const t of S.tasks) {
    if (!t.due || isDone(t) || t.box) continue;
    for (const r of remindersOf(t)) {
      const key = remKey(t, r);
      if ((t.remFired || []).includes(key) || remTime(t, r) > now) continue;
      t.remFired = [...(t.remFired || []), key].slice(-30);
      // Long-gone reminders (more than 3 days late, e.g. on a device that was off) are skipped quietly.
      if (now - remTime(t, r) > 3 * 86400000 && r.when !== 'after') { changed = true; continue; }
      const who = t.assignees.filter((a) => a !== S.meId).map((a) => person(a)?.name).filter(Boolean).join(', ');
      const late = r.when === 'after' || todayISO() > t.due;
      notify({
        id: uid(), at: now, taskId: t.id, read: false, kind: late ? 'returned' : 'review',
        text: late ? `Overdue: “${t.title}” was due ${fmtDate(t.due)}${who ? ` (${who})` : ''} and isn't completed` : `Reminder: “${t.title}” is due ${t.due === todayISO() ? 'today' : fmtDate(t.due)}${who ? ` (${who})` : ''}`,
      });
      changed = true;
    }
  }
  if (changed) { Store.save(); if (typeof updateBell === 'function') updateBell(); if (!topDialog?.()) render(); }
}

/** The reminders row in the task panel (only when the task has a due date). */
function remindersHTML(t) {
  if (!t.due) return '';
  const list = remindersOf(t);
  return `<div class="rem-row">${icon('bell', 14)}
    ${list.map((r, i) => `<span class="rem-chip">${esc(remText(r))}<button class="chip-x" data-act="remDel" data-i="${i}" aria-label="Remove reminder">${icon('close', 10)}</button></span>`).join('')}
    <button class="btn ghost xs" data-act="remAdd">${icon('plus', 12)} Reminder</button></div>`;
}
function remPickerHTML(t) {
  const have = new Set(remindersOf(t).map((r) => `${r.n}|${r.unit}|${r.when}|${r.at}`));
  return `<div class="picker rem-picker"><h4>Reminder</h4>
    ${REM_PRESETS.filter((r) => !have.has(`${r.n}|${r.unit}|${r.when}|${r.at}`)).map((r) => `<button class="person-row" data-act="remPreset" data-r='${JSON.stringify(r)}'>${esc(remText(r))}</button>`).join('')}
    <form class="rem-custom" data-submit="remCustom">
      <div class="rem-fields"><input name="n" type="number" min="0" max="52" value="2" aria-label="How many">
        <select name="unit" aria-label="Days or weeks"><option value="days">days</option><option value="weeks">weeks</option></select>
        <select name="when" aria-label="Before or after"><option value="before">before</option><option value="after">after</option></select>
        <input name="at" type="time" value="09:00" step="300" aria-label="At"></div>
      <button class="btn primary sm">Add</button></form>
    ${'Notification' in window && Notification.permission === 'default' ? `<button class="btn ghost xs" data-act="remAllowSystem">${icon('bell', 12)} Also show in this device's notifications</button>` : ''}</div>`;
}
function addReminder(t, r) {
  const list = [...remindersOf(t)];
  if (!list.some((x) => x.n === r.n && x.unit === r.unit && x.when === r.when && x.at === r.at)) list.push(r);
  t.reminders = list.sort((a, b) => remTime(t, a) - remTime(t, b)).slice(0, 8);
  commit();
}
