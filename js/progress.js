'use strict';
// ---------- Progress Meeting ----------
// The team's regular progress meetings with each department's DIC, laid out like the OMI Group
// meeting calendar: a row per week (week starting, week no, remarks) and a column per meeting slot
// (day and time). Each meeting is a repeating Calendar event (every 2 weeks unless you change it),
// so it also shows in the Calendar, blocks the Time Box and sends notifications.

const PM_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const pmIsoWeek = (iso) => { const d = new Date(`${iso}T12:00:00`); const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); const day = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - day); const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1)); return Math.ceil(((t - y0) / 864e5 + 1) / 7); };
const pmSeries = () => (typeof mcPlan === 'function' && mcPlan() ? mcAll().filter((m) => m.pm && mcMine(m)) : []);
const pmDept = (m) => (org().depts || []).find((d) => d.id === m.pm) || null;
const pmName = (m) => pmDept(m)?.name || String(m.title || '').replace(/ progress meeting$/i, '') || 'Meeting';
const pmColor = (deptId) => { const i = Math.max(0, (org().depts || []).findIndex((d) => d.id === deptId)); return MC_COLORS[(i + 1) % MC_COLORS.length]; };
const pmFmt = (min) => fmtTime(min).replace(':00', '').replace(/\s/g, '');

function renderProgress() {
  const v = (ui.pm = ui.pm || { from: mcWeekStart(todayISO()), weeks: 12 });
  const weeks = Array.from({ length: v.weeks }, (_, i) => mcAddDays(v.from, i * 7));
  const series = pmSeries();
  // Columns: every day and time that has a progress meeting, Monday first.
  const cols = [...new Map(series.map((m) => { const dow = mcDow(m.date); return [`${dow}|${m.start}`, { dow, start: m.start }]; })).values()].sort((a, b) => a.dow - b.dow || a.start - b.start);
  const days = [...new Set(cols.map((c) => c.dow))];
  const remarks = S.settings.pmRemarks || {};
  const cell = (week, c) => {
    const date = mcAddDays(week, c.dow);
    const hits = series.filter((m) => m.start === c.start && mcDow(m.date) === c.dow && mcOccurs(m, date));
    return `<td class="pm-cell" ${hits.length ? '' : `data-act="pmNew" data-date="${date}" data-start="${c.start}"`}>${hits.map((m) => `<button class="pm-chip" style="--ec:${esc(m.color || pmColor(m.pm))}" data-act="mcOpenId" data-id="${esc(m.id)}" title="${esc(`${pmName(m)} with ${personByKey(m.att.find((k) => k !== m.org) || '')?.name || 'DIC'} · ${fmtTime(m.start)}`)}">${esc(pmName(m))}</button>`).join('')}</td>`;
  };
  return `<div class="page pm-page">
    <header class="page-head"><h1>Progress Meeting</h1><span class="spacer"></span>
      <span class="mc-nav"><button class="icon-btn" data-act="pmStep" data-d="-4" aria-label="Earlier weeks">${icon('chevL')}</button><button class="btn ghost sm" data-act="pmStep" data-d="0">This week</button><button class="icon-btn" data-act="pmStep" data-d="4" aria-label="Later weeks">${icon('chevR')}</button></span>
      <button class="btn primary sm" data-act="pmNew">${icon('plus', 14)} Set up meeting</button></header>
    ${series.length ? '' : '<p class="muted">Set up a regular progress meeting with each department’s DIC. It repeats every 2 weeks unless you change it, and shows in your Calendar too.</p>'}
    <div class="pm-scroll"><table class="pm-tbl">
      <thead><tr><th class="pm-wk" rowspan="2">Week starting</th><th class="pm-no" rowspan="2">Week no</th><th class="pm-rm" rowspan="2">Remarks</th>${days.map((d) => `<th colspan="${cols.filter((c) => c.dow === d).length}">${PM_DAYS[d]}</th>`).join('')}</tr>
        <tr>${cols.map((c) => `<th>${esc(pmFmt(c.start))}</th>`).join('')}</tr></thead>
      <tbody>${weeks.map((w) => `<tr class="${w === mcWeekStart(todayISO()) ? 'pm-now' : ''}"><td class="pm-wk">${esc(new Date(`${w}T12:00:00`).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: '2-digit' }))}</td><td class="pm-no">${pmIsoWeek(w)}</td>
        <td class="pm-rm"><input value="${esc(remarks[w] || '')}" data-change="pmRemark" data-w="${w}" aria-label="Remarks for week ${pmIsoWeek(w)}"></td>${cols.map((c) => cell(w, c)).join('')}</tr>`).join('')}</tbody>
    </table></div>
  </div>`;
}

// ---------- Set up a meeting with a department's DIC ----------
function pmSetupDialog(date, start) {
  const depts = (org().depts || []).filter((d) => d.dic);
  const first = date || mcAddDays(mcWeekStart(todayISO()), 7);
  const d = showDialog({ title: 'Set up progress meeting', html: `<form class="mc-form pm-form" data-submit="pmSave">
    <label class="pd-f"><span>Department</span><select name="dept" required>${depts.map((x) => `<option value="${esc(x.id)}">${esc(x.name)} · DIC ${esc(person(x.dic)?.name || '')}</option>`).join('') || '<option value="">Add departments with a DIC in Admin Portal first</option>'}</select></label>
    <div class="mc-when"><input type="date" name="date" value="${esc(first)}" aria-label="First meeting" required>${wheelTimeHTML('start', start ?? 840, 'Start')}<span>–</span>${wheelTimeHTML('end', (start ?? 840) + 60, 'End')}</div>
    <label class="pd-f"><span>Repeats</span><select name="every"><option value="1">Every week</option><option value="2" selected>Every 2 weeks</option><option value="3">Every 3 weeks</option><option value="4">Every 4 weeks</option><option value="custom">Custom…</option></select></label>
    <label class="pd-f pm-custom" hidden><span>Every how many weeks</span><input type="number" name="n" min="1" max="52" value="6"></label>
    <p class="small muted">The DIC is invited. It repeats on the same weekday, appears in your Calendar and blocks your Time Box. Change or stop it any time by opening it.</p>
    <div class="row"><span class="spacer"></span><button class="btn primary">Create</button></div></form>` });
  d?.classList?.add('mc-dlg');
  const every = d?.querySelector('[name="every"]');
  every?.addEventListener('change', () => { d.querySelector('.pm-custom').hidden = every.value !== 'custom'; });
}
Object.assign(actions, {
  pmNew: (el) => pmSetupDialog(el?.dataset?.date, el?.dataset?.start ? Number(el.dataset.start) : undefined),
  pmStep: (el) => { const v = ui.pm || (ui.pm = { from: mcWeekStart(todayISO()), weeks: 12 }); const n = Number(el.dataset.d); v.from = n ? mcAddDays(v.from, n * 7) : mcWeekStart(todayISO()); render(); },
});
Object.assign(changes, {
  pmRemark: (el) => { S.settings.pmRemarks = { ...(S.settings.pmRemarks || {}), [el.dataset.w]: el.value.trim() }; if (!el.value.trim()) delete S.settings.pmRemarks[el.dataset.w]; Store.save(); },
});
Object.assign(submits, {
  pmSave: (form, data) => {
    const dept = (org().depts || []).find((x) => x.id === data.get('dept'));
    if (!dept || !dept.dic) { toast('Choose a department that has a DIC.', { error: true }); return; }
    const date = data.get('date');
    const start = twMin(data.get('start'));
    let end = twMin(data.get('end'));
    if (end <= start) end = start + 60;
    const n = data.get('every') === 'custom' ? Math.max(1, Math.min(52, Number(data.get('n')) || 2)) : Number(data.get('every')) || 2;
    const me = pkey(S.meId);
    const m = mcNorm({ id: uid(), kind: 'event', title: `${dept.name} progress meeting`, date, start, end, org: me, att: [me, pkey(dept.dic)], tz: tzNow(),
      rep: 'custom', rc: { n, unit: 'week', days: [new Date(`${date}T12:00:00`).getDay()], end: { type: 'never' } }, block: true, color: pmColor(dept.id), pm: dept.id, al: { [me]: [...mcAlDefault()] } });
    mcAll().push(m);
    mcDirty();
    $$('dialog.mc-dlg').forEach((x) => x.close());
    commit();
    toast(`${dept.name} progress meeting set ${n === 1 ? 'every week' : `every ${n} weeks`} with ${person(dept.dic)?.name || 'the DIC'}.`, { keep: true });
  },
});
