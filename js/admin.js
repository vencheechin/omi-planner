/* Admin Portal: reporting lines, admins and departments, and a dashboard of how work is going.
   Only admins see it. The numbers come from what has synced to this device. */

const ADMIN_TABS = [['dash', 'Dashboard'], ['org', 'Org Chart'], ['stages', 'Stages'], ['usage', 'Button Usage']];
const ADMIN_PERIODS = [['7', '7 days'], ['30', '30 days'], ['90', '90 days'], ['all', 'All time']];

/** One entry per real person (the same email is the same person). */
const adminPeople = () => [...new Map(S.people.map((p) => [pkey(p.id), p])).values()].sort((a, b) => a.name.localeCompare(b.name));
const isFor = (t, k) => t.assignees.some((a) => pkey(a) === k);
const avg = (list) => (list.length ? list.reduce((s, n) => s + n, 0) / list.length : null);
const fmtDays = (d) => (d === null ? '–' : d < 1 ? '<1 day' : `${Math.round(d * 10) / 10} days`);
const pct = (n, d) => (d ? Math.round((n / d) * 100) : null);

function renderAdmin() {
  if (!stAdmin()) return `<div class="page"><header class="page-head"><h1>Admin Portal</h1></header><p class="muted">Only admins can open the Admin Portal.</p></div>`;
  const tab = ['lines', 'team'].includes(ui.adminTab) ? 'org' : ui.adminTab || 'dash';
  return `<div class="page admin-page">
    <header class="page-head"><h1>Admin Portal</h1></header>
    <div class="dr-tools"><div class="seg">${ADMIN_TABS.map(([v, l]) => `<button class="${tab === v ? 'on' : ''}" data-act="adminTab" data-v="${v}">${l}</button>`).join('')}</div></div>
    ${tab === 'usage' ? `<section class="dr-hub"><h2>Button Usage</h2><p class="small muted">Which buttons and pages get used, and suggestions for tidying the app.</p><div class="row"><button class="btn primary sm" data-act="openUsage">${icon('chart', 14)} Usage and suggestions</button></div></section>` : tab === 'org' ? orgChartHTML() : tab === 'stages' ? stagesAdminHTML() : tab === 'culture' && typeof cultureAdminHTML === 'function' ? cultureAdminHTML() : tab === 'stview' ? stViewAdminHTML() : tab === 'team' ? `<section class="dr-hub">${adminSettingsHTML()}</section>` : adminDashHTML()}
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

// ---------- Colour styles ----------
/** Who uses which colour style: from teammates' synced files (and, with cloud sync, the team's usage records). */
function styleStatsHTML() {
  const people = adminPeople();
  const styleOfPerson = (p) => (isMeId(p.id) ? currentStyle().id : p.style || null);
  const counts = Object.fromEntries(STYLES.map((s) => [s.id, []]));
  const unknown = [];
  for (const p of people) { const st = styleOfPerson(p); if (st && counts[st]) counts[st].push(p); else unknown.push(p); }
  const cloud = ui.styleCloud;
  if (cloud) Object.keys(counts).forEach((k) => { if ((cloud[k] || 0) > counts[k].length) counts[k].cloudOnly = cloud[k] - counts[k].length; });
  const total = Math.max(1, ...STYLES.map((s) => counts[s.id].length + (counts[s.id].cloudOnly || 0)));
  const rows = [...STYLES].sort((a, b) => (counts[b.id].length + (counts[b.id].cloudOnly || 0)) - (counts[a.id].length + (counts[a.id].cloudOnly || 0)));
  return `<section class="dr-hub"><div class="grow-chart-head"><h2>Colour style in use</h2>${typeof Cloud !== 'undefined' && Cloud.team ? '<button class="btn ghost sm" data-act="adminStyleCloud">Include everyone in cloud sync</button>' : ''}</div>
    <div class="style-stats">${rows.map((s) => { const n = counts[s.id].length + (counts[s.id].cloudOnly || 0); return `<div class="ss-row">
      <span class="ss-name"><span class="ss-sw">${s.swatch.map((c) => `<i style="background:${c}"></i>`).join('')}</span><b>${esc(s.name)}</b></span>
      <span class="ss-bar" title="${esc(`${s.name}: ${n} ${n === 1 ? 'person' : 'people'}`)}"><i style="width:${(n / total) * 100}%"></i></span>
      <b class="ss-n">${n}</b>
      <span class="ss-who small muted">${counts[s.id].map((p) => esc(p.name)).join(', ')}${counts[s.id].cloudOnly ? `${counts[s.id].length ? ', ' : ''}+${counts[s.id].cloudOnly} more` : ''}</span></div>`; }).join('')}</div>
    ${unknown.length ? `<p class="small muted">Not known yet for ${unknown.map((p) => esc(p.name)).join(', ')}: it shows once they open the updated app and sync.</p>` : ''}
  </section>`;
}
addEventListener('DOMContentLoaded', () => Object.assign(actions, {
  adminStyleCloud: async () => {
    try { const { counts } = await Cloud.readUsage(); ui.styleCloud = Object.fromEntries(STYLES.map((s) => [s.id, counts[`style:${s.id}`]?.n || 0])); render(); } catch (err) { toast(`Couldn’t read the team’s styles: ${err.message}`, { error: true }); }
  },
}));

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

  const stRows = stPlans().filter((p) => !p.deleted && p.module !== 'cal').map((p) => {
    const items = p.groups.flatMap((g) => g.rows.flatMap((r) => [r, ...(r.items || [])]).flatMap((r) => Object.values(r.cells).flatMap((c) => cellItems(c))));
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
    ${styleStatsHTML()}
    <p class="small muted">Counts what has synced to this device: tasks you can see, including everything delegated through you.</p>`;
}

// ---------- Org Chart ----------
// Admins add people and say who reports to whom; the chart draws itself from that.
// Tap a person to change their details, manager, department or admin role, or to add someone under them.
const ocCloud = () => typeof Cloud !== 'undefined' && !!Cloud.team;
const ocDeptOf = (id) => (org().depts || []).find((d) => (d.members || []).includes(id));
const ocIsAdmin = (p) => (ocCloud() ? (Cloud.team.admins || []).map((e) => String(e).toLowerCase()).includes((p.email || '').toLowerCase()) : (org().admins || []).includes(p.id));
function orgChartHTML() {
  const people = adminPeople();
  const keys = new Set(people.map((p) => pkey(p.id)));
  const mgr = (p) => { const m = org().reportsTo?.[pkey(p.id)]; return m && keys.has(m) && m !== pkey(p.id) ? m : ''; };
  const kids = (k) => people.filter((p) => mgr(p) === k);
  const tops = people.filter((p) => !mgr(p) && kids(pkey(p.id)).length);
  const loose = people.filter((p) => !mgr(p) && !kids(pkey(p.id)).length);
  const card = (p) => {
    const d = ocDeptOf(p.id);
    const n = kids(pkey(p.id)).length;
    return `<button class="oc-card" data-act="ocEdit" data-id="${esc(p.id)}" title="${esc(p.name)}">${avatar(p, 40)}
      <b>${esc(p.name)}${isMeId(p.id) ? ' <small class="muted">(you)</small>' : ''}</b>
      ${d ? `<span class="oc-dept">${esc(d.name)}</span>` : ''}
      <span class="oc-tags">${ocIsAdmin(p) ? '<i class="oc-tag">Admin</i>' : ''}${n ? `<i class="oc-n">${n} ${n === 1 ? 'report' : 'reports'}</i>` : ''}</span></button>`;
  };
  const node = (p, depth, seen) => {
    const k = pkey(p.id);
    if (seen.has(k) || depth > 15) return '';
    seen.add(k);
    const under = kids(k);
    return `<li>${card(p)}${under.length ? `<ul>${under.map((c) => node(c, depth + 1, seen)).join('')}</ul>` : ''}</li>`;
  };
  const seen = new Set();
  return `<section class="dr-hub oc-hub">
      <div class="oc-head"><h2>Org Chart</h2><button class="btn primary sm" data-act="ocAdd">${icon('plus', 14)} Add person</button></div>
      <p class="small muted">Add people and choose who each one reports to; the chart builds itself. Tap anyone to change them. Requests go up the chart, delegating goes down.</p>
      ${tops.length ? `<div class="oc-scroll"><div class="oc-tree"><ul>${tops.map((p) => node(p, 0, seen)).join('')}</ul></div></div>`
        : `<p class="oc-empty muted">No reporting lines yet. Tap a person below and choose who they report to, or add someone.</p>`}
      ${loose.length ? `<div class="oc-loose"><b class="small">Not in the chart yet</b><div class="oc-loose-list">${loose.map((p) => `<button class="oc-chip" data-act="ocEdit" data-id="${esc(p.id)}">${avatar(p, 22)}${esc(p.name)}</button>`).join('')}</div></div>` : ''}
    </section>
    <section class="dr-hub"><h2>Admins & Departments</h2>${adminSettingsHTML()}</section>`;
}
/** The add / change form. `p` is null for a new person; `boss` preselects their manager. */
function ocFormHTML(p, boss = '') {
  const people = adminPeople().filter((x) => !p || (pkey(x.id) !== pkey(p.id) && !isAbove(p.id, x.id)));
  const m = p ? org().reportsTo?.[pkey(p.id)] || '' : boss;
  const dept = p ? ocDeptOf(p.id)?.id || '' : '';
  const depts = org().depts || [];
  const under = p ? adminPeople().filter((x) => org().reportsTo?.[pkey(x.id)] === pkey(p.id)) : [];
  return `<form class="oc-form" data-submit="ocSave" data-id="${esc(p?.id || '')}">
    <label class="field"><span>Name</span><input name="name" value="${esc(p?.name || '')}" required autocomplete="off"></label>
    <label class="field"><span>Email</span><input name="email" type="email" value="${esc(p?.email || '')}" placeholder="So they get the same entry on every device" autocomplete="off"></label>
    <label class="field"><span>Reports to</span><select name="boss"><option value="">— Nobody (top of the chart)</option>${people.map((x) => `<option value="${esc(pkey(x.id))}" ${pkey(x.id) === m ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label>
    ${depts.length ? `<label class="field"><span>Department</span><select name="dept"><option value="">—</option>${depts.map((d) => `<option value="${esc(d.id)}" ${d.id === dept ? 'selected' : ''}>${esc(d.name)}</option>`).join('')}</select></label>` : ''}
    ${ocCloud() ? '' : `<label class="mini oc-admin"><input type="checkbox" name="admin" ${p && ocIsAdmin(p) ? 'checked' : ''}> Admin (can open the Admin Portal)</label>`}
    ${under.length ? `<p class="small muted">Reports to them: ${under.map((x) => esc(x.name)).join(', ')}</p>` : ''}
    <div class="dlg-foot oc-foot">
      ${p && !isMeId(p.id) ? `<button type="button" class="btn ghost danger-text" data-act="ocRemove" data-id="${esc(p.id)}">${icon('trash', 14)} Remove</button>` : ''}
      ${p ? `<button type="button" class="btn ghost" data-act="ocAddUnder" data-id="${esc(p.id)}">${icon('plus', 14)} Add someone under ${esc(p.name.split(' ')[0])}</button>` : ''}
      <button class="btn primary">${p ? 'Save' : 'Add'}</button></div>
  </form>`;
}
function ocOpen(p, boss = '') {
  $$('dialog.oc-dlg').forEach((x) => x.close());
  const d = showDialog({ title: p ? p.name : 'Add person', html: ocFormHTML(p, boss) });
  d?.classList?.add('oc-dlg');
  setTimeout(() => $('input[name=name]', d)?.focus(), 50);
}
addEventListener('DOMContentLoaded', () => {
  Object.assign(actions, {
    ocAdd: () => ocOpen(null),
    ocEdit: (el) => { const p = person(el.dataset.id); if (p) ocOpen(p); },
    ocAddUnder: (el) => { const p = person(el.dataset.id); if (p) ocOpen(null, pkey(p.id)); },
    ocRemove: async (el) => {
      const p = person(el.dataset.id);
      if (!p || isMeId(p.id)) return;
      if (!await confirmDlg('Remove person?', `${p.name} comes off the chart and is unassigned from all tasks. Anyone who reported to them moves up to their manager.`, 'Remove')) return;
      const k = pkey(p.id);
      const rt = { ...(org().reportsTo || {}) };
      const up = rt[k] || '';
      for (const [x, m] of Object.entries(rt)) if (m === k) { if (up) rt[x] = up; else delete rt[x]; }
      delete rt[k];
      org().reportsTo = rt;
      org().admins = (org().admins || []).filter((x) => x !== p.id);
      org().depts = (org().depts || []).map((d) => ({ ...d, members: (d.members || []).filter((x) => x !== p.id), dic: d.dic === p.id ? '' : d.dic }));
      S.tasks.forEach((t) => { t.assignees = t.assignees.filter((a) => a !== p.id); });
      S.plans.forEach((pl) => { pl.members = pl.members.filter((m) => m !== p.id); });
      S.people = S.people.filter((x) => x.id !== p.id);
      stTouchAll();
      $$('dialog.oc-dlg').forEach((x) => x.close());
      commit();
      toast(`${p.name} removed.`);
    },
  });
  Object.assign(submits, {
    ocSave: (form, data) => {
      const name = String(data.get('name') || '').trim();
      const email = String(data.get('email') || '').trim().toLowerCase();
      if (!name) return;
      let p = form.dataset.id ? person(form.dataset.id) : null;
      if (email && S.people.some((x) => x !== p && x.email === email) && (p || !S.people.some((x) => x.email === email && x.name.toLowerCase() === name.toLowerCase()))) {
        toast('Someone else already has that email.', { error: true }); return;
      }
      if (p) { p.name = name; p.email = email; } else p = ensurePerson(name, email);
      const k = pkey(p.id);
      const boss = String(data.get('boss') || '');
      if (boss && (boss === k || isAbove(k, boss))) { toast('That would make a loop.', { error: true }); return; }
      const rt = { ...(org().reportsTo || {}) };
      if (boss) rt[k] = boss; else delete rt[k];
      org().reportsTo = rt;
      if (data.has('dept')) {
        const dept = String(data.get('dept') || '');
        org().depts = (org().depts || []).map((d) => ({ ...d, members: d.id === dept ? [...new Set([...(d.members || []), p.id])] : (d.members || []).filter((x) => x !== p.id) }));
        stTouchAll();
      }
      if (!ocCloud()) {
        const a = (org().admins || []).filter((x) => x !== p.id);
        org().admins = data.get('admin') ? [...a, p.id] : a;
      }
      $$('dialog.oc-dlg').forEach((x) => x.close());
      commit();
      toast(form.dataset.id ? 'Saved.' : `${name} added to the chart.`);
    },
  });
});
