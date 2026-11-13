/* Admin Portal: reporting lines, admins and departments, and a dashboard of how work is going.
   Only admins see it. The numbers come from what has synced to this device. */

const ADMIN_TABS = [['dash', 'Dashboard'], ['lines', 'Reporting Lines'], ['team', 'Admins & Departments']];
const ADMIN_PERIODS = [['7', '7 days'], ['30', '30 days'], ['90', '90 days'], ['all', 'All time']];

/** One entry per real person (the same email is the same person). */
const adminPeople = () => [...new Map(S.people.map((p) => [pkey(p.id), p])).values()].sort((a, b) => a.name.localeCompare(b.name));
const isFor = (t, k) => t.assignees.some((a) => pkey(a) === k);
const avg = (list) => (list.length ? list.reduce((s, n) => s + n, 0) / list.length : null);
const fmtDays = (d) => (d === null ? '–' : d < 1 ? '<1 day' : `${Math.round(d * 10) / 10} days`);
const pct = (n, d) => (d ? Math.round((n / d) * 100) : null);

function renderAdmin() {
  if (!stAdmin()) return `<div class="page"><header class="page-head"><h1>Admin Portal</h1></header><p class="muted">Only admins can open the Admin Portal.</p></div>`;
  const tab = ui.adminTab || 'dash';
  return `<div class="page admin-page">
    <header class="page-head"><h1>Admin Portal</h1></header>
    <div class="dr-tools"><div class="seg">${ADMIN_TABS.map(([v, l]) => `<button class="${tab === v ? 'on' : ''}" data-act="adminTab" data-v="${v}">${l}</button>`).join('')}</div></div>
    ${tab === 'lines' ? adminLinesHTML() : tab === 'team' ? `<section class="dr-hub">${adminSettingsHTML()}</section>` : adminDashHTML()}
  </div>`;
}

// ---------- Reporting Lines ----------
function adminLinesHTML() {
  const people = adminPeople();
  const keys = new Set(people.map((p) => pkey(p.id)));
  const kids = (k) => people.filter((p) => (org().reportsTo?.[pkey(p.id)] || '') === k && pkey(p.id) !== k);
  // Anyone whose manager isn't in the list sits at the top.
  const tops = people.filter((p) => { const m = org().reportsTo?.[pkey(p.id)]; return !m || !keys.has(m); });
  const node = (p, depth, seen) => {
    const k = pkey(p.id);
    if (seen.has(k) || depth > 12) return '';
    seen.add(k);
    const under = kids(k);
    return `<li><span class="org-node">${avatar(p, 24)}<b>${esc(p.name)}</b>${under.length ? `<small class="muted">${under.length} ${under.length === 1 ? 'direct report' : 'direct reports'}</small>` : ''}</span>
      ${under.length ? `<ul>${under.map((c) => node(c, depth + 1, seen)).join('')}</ul>` : ''}</li>`;
  };
  return `<div class="admin-grid">
    <section class="dr-hub"><h2>Set who reports to whom</h2>${reportingLinesHTML()}</section>
    <section class="dr-hub"><h2>Organisation</h2>${people.length > 1 ? `<ul class="org-tree">${tops.map((p) => node(p, 0, new Set())).join('')}</ul>` : '<p class="muted small">Add people in Settings › People first.</p>'}</section>
  </div>`;
}

// ---------- Dashboard ----------
function adminDashHTML() {
  const period = ui.adminPeriod || '30';
  const since = period === 'all' ? 0 : Date.now() - Number(period) * 86400000;
  const today = todayISO();
  const work = S.tasks.filter((t) => !t.box && !t.deleted);
  const open = work.filter((t) => !isDone(t));
  const late = open.filter((t) => t.due && t.due < today);
  const done = work.filter((t) => isDone(t) && (t.completedAt || 0) >= since);
  const onTime = done.filter((t) => !t.due || toISO(new Date(t.completedAt)) <= t.due);
  const rows = reportRows().filter((r) => r.completedAt && r.completedAt >= since && r.days !== null);
  const reqs = Object.keys(REQ_KINDS).flatMap((k) => work.filter((t) => t[REQ_KINDS[k].field]).map((t) => ({ t, k, r: t[REQ_KINDS[k].field] })));
  const waiting = reqs.filter((x) => x.r.status === 'pending');
  const answered = reqs.filter((x) => ['approved', 'rejected'].includes(x.r.status) && (x.r.decidedAt || 0) >= since);
  const answerDays = avg(answered.map((x) => (x.r.decidedAt - x.r.at) / 86400000));

  const tile = (label, value, note, tone = '') => `<div class="stat-tile ${tone}"><small>${label}</small><b>${value}</b>${note ? `<span class="muted small">${note}</span>` : ''}</div>`;
  const people = adminPeople();
  const per = people.map((p) => {
    const k = pkey(p.id);
    const o = open.filter((t) => isFor(t, k));
    const d = done.filter((t) => isFor(t, k));
    return {
      p, k, open: o.length, late: o.filter((t) => t.due && t.due < today).length, done: d.length,
      onTime: pct(d.filter((t) => !t.due || toISO(new Date(t.completedAt)) <= t.due).length, d.length),
      days: avg(rows.filter((r) => pkey(r.to) === k).map((r) => r.days)),
      checking: o.filter((t) => t.review).length,
      red: o.filter((t) => t.health === 'red').length, yellow: o.filter((t) => t.health === 'yellow').length,
      asks: waiting.filter((x) => pkey(x.r.to) === k).length,
      manager: personByKey(org().reportsTo?.[k] || '')?.name || '',
    };
  }).filter((x) => x.open || x.done || x.asks).sort((a, b) => b.late - a.late || b.open - a.open || a.p.name.localeCompare(b.p.name));
  const maxLoad = Math.max(1, ...per.map((x) => x.open + x.done));

  const health = [['green', 'Green', 'On plan'], ['yellow', 'Yellow', 'Off plan, recoverable'], ['red', 'Red', 'Needs support'], ['', 'Not set', '']]
    .map(([v, label, meaning]) => ({ v, label, meaning, n: open.filter((t) => (t.health || '') === v).length }));
  const reds = open.filter((t) => t.health === 'red').sort((a, b) => String(a.due || '9999').localeCompare(String(b.due || '9999'))).slice(0, 6);

  const stRows = stPlans().filter((p) => !p.deleted).map((p) => {
    const items = p.groups.flatMap((g) => g.rows.flatMap((r) => Object.values(r.cells).flatMap((c) => cellItems(c))));
    const n = (s) => items.filter((i) => i.status === s).length;
    return { p, total: items.length, green: n('green'), yellow: n('yellow'), red: n('red'), status: p.approval?.status || 'draft' };
  });
  const stStatus = { draft: 'Draft', submitted: 'Waiting for approval', approved: 'Approved', 'change-requested': 'Change requested' };
  const kindRow = (k) => {
    const all = reqs.filter((x) => x.k === k);
    const ans = answered.filter((x) => x.k === k);
    return `<tr><th>${esc(REQ_KINDS[k].label)}</th><td>${all.filter((x) => x.r.status === 'pending').length}</td><td>${ans.filter((x) => x.r.status === 'approved').length}</td><td>${ans.filter((x) => x.r.status === 'rejected').length}</td><td>${fmtDays(avg(ans.map((x) => (x.r.decidedAt - x.r.at) / 86400000)))}</td></tr>`;
  };

  return `<div class="dr-tools"><span class="muted small">Period</span><div class="seg">${ADMIN_PERIODS.map(([v, l]) => `<button class="${period === v ? 'on' : ''}" data-act="adminPeriod" data-v="${v}">${l}</button>`).join('')}</div></div>
    <div class="stat-row">
      ${tile('Open tasks', open.length, `${open.filter((t) => t.assignees.length).length} assigned`)}
      ${tile('Late now', late.length, late.length ? 'past their due date' : 'nothing late', late.length ? 'warn' : '')}
      ${tile('Completed', done.length, ADMIN_PERIODS.find(([v]) => v === period)[1])}
      ${tile('On time', pct(onTime.length, done.length) === null ? '–' : `${pct(onTime.length, done.length)}%`, 'of completed tasks')}
      ${tile('Time to complete', fmtDays(avg(rows.map((r) => r.days))), 'delegated tasks, on average')}
      ${tile('Requests waiting', waiting.length, `answered in ${fmtDays(answerDays)} on average`)}
    </div>

    <section class="dr-hub"><h2>By person</h2>
      ${per.length ? `<div class="table-wrap"><table class="adm-table">
        <thead><tr><th>Person</th><th>Reports to</th><th class="num">Open</th><th class="num">Late</th><th class="num">Done</th><th>Workload</th><th class="num">On time</th><th class="num">Avg time</th><th class="num">To check</th><th class="num">Red / Yellow</th><th class="num">Requests</th></tr></thead>
        <tbody>${per.map((x) => `<tr>
          <th><span class="org-node">${avatar(x.p, 22)}${esc(x.p.name)}</span></th>
          <td class="muted">${esc(x.manager || '—')}</td>
          <td class="num">${x.open}</td>
          <td class="num ${x.late ? 'danger-text' : ''}">${x.late}</td>
          <td class="num">${x.done}</td>
          <td><span class="adm-bar" title="${esc(`${x.p.name}: ${x.open} open, ${x.done} done`)}"><i class="done" style="width:${(x.done / maxLoad) * 100}%"></i><i class="open" style="width:${(x.open / maxLoad) * 100}%"></i></span></td>
          <td class="num">${x.onTime === null ? '–' : `${x.onTime}%`}</td>
          <td class="num">${fmtDays(x.days)}</td>
          <td class="num">${x.checking}</td>
          <td class="num">${x.red || x.yellow ? `<span class="tl-mini"><i class="bp-dot bp-red"></i>${x.red}</span> <span class="tl-mini"><i class="bp-dot bp-yellow"></i>${x.yellow}</span>` : '0'}</td>
          <td class="num">${x.asks}</td></tr>`).join('')}</tbody></table></div>
        <p class="adm-legend small muted"><span><i class="sw done"></i>Done in period</span><span><i class="sw open"></i>Open</span></p>`
        : '<p class="muted small">No assigned work yet.</p>'}
    </section>

    <div class="admin-grid">
      <section class="dr-hub"><h2>Traffic light, open tasks</h2>
        <div class="stat-row small-tiles">${health.map((h) => `<div class="stat-tile"><small>${h.v ? `<i class="bp-dot bp-${h.v}"></i>` : ''}${h.label}</small><b>${h.n}</b>${h.meaning ? `<span class="muted small">${h.meaning}</span>` : ''}</div>`).join('')}</div>
        ${reds.length ? `<h3 class="adm-sub">Needs support</h3><div class="dr-cards">${reds.map((t) => cardHTML(t, { showPlan: true })).join('')}</div>` : ''}
      </section>
      <section class="dr-hub"><h2>Decision and approval requests</h2>
        <table class="adm-table"><thead><tr><th></th><th class="num">Waiting</th><th class="num">Approved</th><th class="num">Rejected</th><th class="num">Avg answer</th></tr></thead>
        <tbody>${Object.keys(REQ_KINDS).map(kindRow).join('')}</tbody></table>
        <p class="small muted">Approved, rejected and answer time cover the period above.</p>
      </section>
    </div>

    <section class="dr-hub"><h2>S-Team Plans</h2>
      ${stRows.length ? `<div class="table-wrap"><table class="adm-table"><thead><tr><th>Plan</th><th>Status</th><th class="num">Tasks</th><th class="num"><i class="bp-dot bp-green"></i> Green</th><th class="num"><i class="bp-dot bp-yellow"></i> Yellow</th><th class="num"><i class="bp-dot bp-red"></i> Red</th></tr></thead>
        <tbody>${stRows.map((x) => `<tr><th>${esc(stName(x.p))}</th><td>${esc(stStatus[x.status] || x.status)}</td><td class="num">${x.total}</td><td class="num">${x.green}</td><td class="num">${x.yellow}</td><td class="num ${x.red ? 'danger-text' : ''}">${x.red}</td></tr>`).join('')}</tbody></table></div>`
        : '<p class="muted small">No S-Team Plans yet.</p>'}
    </section>
    <p class="small muted">Counts what has synced to this device: tasks you can see, including everything delegated through you.</p>`;
}
