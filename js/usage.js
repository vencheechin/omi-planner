'use strict';
/* Button usage: counts how often each button, menu item and page is used, so the layout can be
   trimmed later. Counts are kept per person on each device and, with cloud sync, sent to the
   button_usage table (one row per person and button). Admins see the whole team's counts.
   Only names of buttons are recorded, never what was typed. */

const USAGE_NAMES = {
  // Pages
  'page:my-day': 'My Day page', 'page:timebox': 'Time Box page', 'page:my-tasks': 'My Tasks page', 'page:hub': 'Planner page',
  'page:plan': 'A plan', 'page:person': 'A person plan', 'page:report': 'Assignment report', 'page:halfplan': 'S-Team Plan',
  // Common buttons
  newPlan: 'New plan', openSettings: 'Settings', openInbox: 'Notifications', openNav: 'Menu (phone)', taskMenu: 'Task ••• menu',
  toggleMyDay: 'My Day (task)', toggleDone: 'Tick task', pickAssignees: 'Delegate', decisionSend: 'Decision Request', decisionApprove: 'Approve decision', decisionReject: 'Reject decision', pickLabels: 'Add label', healthMenu: 'Traffic light',
  assignTimebox: 'Assign to Time Box', openInTimebox: 'Open in Time Box', removeFromTimebox: 'Remove from Time Box', toggleMio: '3MIO (task)',
  chatPlus: 'Chat +', chatAttach: 'Attach', chatPhotos: 'Photos', chatCamera: 'Camera', chatLocation: 'Location', chatContact: 'Contact', chatLink: 'Link',
  msgMenu: 'Message menu', setDayView: 'Day / Week / Month', tbNav: 'Time Box ‹ ›', tbToday: 'Time Box Today', tbAdd: 'Tap empty time',
  tbPlaceQueued: 'Pick from Time Box list', moveUnfinished: 'Move unfinished', planTomorrow: 'Tomorrow Planning', mioMenu: '3MIO choose',
  tbCombine: 'Combine into one box', bookNextFree: 'Book next free', importPlanner: 'Import from Microsoft Planner', exportBackup: 'Export backup',
  filterMenu: 'Filter', groupMenu: 'Group by', setTab: 'Board / Grid / Schedule / Charts', toggleCheck: 'Tick checklist item',
  toggleCheckAlerts: 'Checklist notifications', cardMenu: 'Card ••• menu', cardCheck: 'Tick card', sizeMenu: 'Text size',
};
// Plumbing that isn't a real choice (closing things, typing), left out of the counts.
const USAGE_SKIP = new Set(['closeDialog', 'closeTask', 'menuPick', 'commentDraft', 'checkText', 'notes', 'title', 'filterQ', 'contactSearch', 'labelSearch', 'assignSearch', 'decisionField', 'approvalField', 'healthNote']);

const Usage = {
  track(name) {
    if (!name || USAGE_SKIP.has(name) || typeof S === 'undefined' || !S) return;
    const u = (S.usage = S.usage || { since: Date.now(), counts: {} });
    const c = (u.counts[name] = u.counts[name] || { n: 0, first: Date.now(), last: 0 });
    c.n++;
    c.last = Date.now();
    u.dirty = true;
  },
  label: (name) => USAGE_NAMES[name] || (name.startsWith('menu:') ? `Menu: ${name.slice(5)}` : name.startsWith('page:') ? `Page: ${name.slice(5)}` : name.replace(/([A-Z])/g, ' $1').replace(/^./, (x) => x.toUpperCase())),
  rows(counts) {
    return Object.entries(counts || {}).map(([name, c]) => ({ name, label: this.label(name), n: c.n, last: c.last })).sort((a, b) => b.n - a.n);
  },
  /** Suggestions: what to bring forward, what could go. Needs a couple of weeks of use to mean much. */
  suggest(counts, since) {
    const rows = this.rows(counts);
    const total = rows.reduce((s, r) => s + r.n, 0);
    const days = Math.max(1, Math.round((Date.now() - (since || Date.now())) / 86400000));
    const out = { show: [], hide: [], days, total, early: days < 14 || total < 200 };
    // Often used but tucked away in a menu or Settings: bring forward.
    rows.filter((r) => (r.name.startsWith('menu:') || ['importPlanner', 'exportBackup', 'mioMenu', 'bookNextFree'].includes(r.name)) && r.n >= Math.max(5, total * 0.03))
      .slice(0, 5).forEach((r) => out.show.push(`${r.label}: used ${r.n} times. Put it on the screen instead of in a menu.`));
    // Always on screen but rarely or never used: could hide or move into a menu.
    const visible = ['moveUnfinished', 'planTomorrow', 'tbToday', 'importPlanner', 'toggleMyDay', 'assignTimebox', 'toggleMio', 'chatPlus', 'healthMenu', 'openInbox', 'setTab', 'filterMenu', 'groupMenu', 'tbNav', 'setDayView', 'newPlan', 'pickLabels'];
    visible.forEach((name) => {
      const n = counts?.[name]?.n || 0;
      if (n === 0 || n < total * 0.005) out.hide.push(`${this.label(name)}: used ${n} time${n === 1 ? '' : 's'} in ${days} days. Could move into a menu.`);
    });
    return out;
  },
};

async function usageDlg() {
  let counts = S.usage?.counts || {};
  let since = S.usage?.since;
  let source = 'you on this device';
  if (typeof Cloud !== 'undefined' && Cloud.session && Cloud.team && isAdmin()) {
    try { ({ counts, since } = await Cloud.readUsage()); source = `everyone in ${Cloud.team.name}`; } catch (err) { toast(`Showing this device only: ${err.message}`, { error: true }); }
  }
  const rows = Usage.rows(counts);
  const sug = Usage.suggest(counts, since);
  const d = showDialog({
    title: 'Button Usage',
    wide: true,
    html: `<p class="small">${sug.total} uses over ${sug.days} day${sug.days === 1 ? '' : 's'} · ${esc(source)}</p>
      <section class="set-sec"><h3>Suggestions</h3>
        ${sug.early ? '<p class="small muted">Early days: suggestions firm up after two weeks or 200 uses.</p>' : ''}
        ${sug.show.length ? `<p class="small"><b>Show</b></p><ul class="sug">${sug.show.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
        ${sug.hide.length ? `<p class="small"><b>Hide or move</b></p><ul class="sug">${sug.hide.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
        ${!sug.show.length && !sug.hide.length ? '<p class="small muted">No changes suggested.</p>' : ''}</section>
      <div class="log-scroll"><table class="log-table"><thead><tr><th>Button</th><th>Uses</th><th>Last used</th></tr></thead><tbody>
        ${rows.map((r) => `<tr><td>${esc(r.label)}</td><td>${r.n}</td><td>${r.last ? esc(fmtDateTime(r.last)) : ''}</td></tr>`).join('') || '<tr><td colspan="3" class="muted">Nothing yet.</td></tr>'}
      </tbody></table></div>
      <div class="dlg-foot"><button class="btn ghost" type="button" data-act="exportUsage">${icon('download', 14)} Export CSV</button><span class="spacer"></span><button class="btn primary" type="button" data-role="no">Close</button></div>`,
  });
  d._rows = rows;
  $('[data-role="no"]', d).onclick = () => d.close();
}
