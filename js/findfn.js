'use strict';
if (!ICON.moon) ICON.moon = 'M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z';
// ---------- Search finds what the app can do, not just plans and tasks ----------
// Typing "bin", "ringtone", "backup" or "excel" lists the page, setting or action that matches.

function fnCatalog() {
  const pdOn = typeof stAdmin === 'function' && (stAdmin() || stPlans().some((x) => x.module === 'pd' && stCanSee(x)));
  const settings = (tab, section) => () => {
    actions.openSettings();
    actions.settingsTab({ dataset: { v: tab } });
    if (section) setTimeout(() => {
      const head = $$('dialog.settings h3, dialog.settings summary').find((n) => n.textContent.toLowerCase().includes(section.toLowerCase()));
      head?.scrollIntoView({ block: 'start', behavior: 'smooth' });
      if (head?.tagName === 'SUMMARY' && !head.parentElement.open) head.parentElement.open = true;
    }, 60);
  };
  const theme = (v) => () => { S.settings.theme = v; applyTheme(); Store.save(); toast(`${v === 'system' ? 'Automatic' : v[0].toUpperCase() + v.slice(1)} appearance on.`); };
  const list = [
    // Pages
    { label: 'S-Team Plan', words: 'brand half year h1 h2 months traffic light pic', ic: 'table', go: '#/halfplan' },
    ...(pdOn ? [{ label: 'PD Plan', words: 'product development suggest access', ic: 'flag', go: '#/pdplan' }] : []),
    { label: 'Planner', words: 'home hub plans tasks due', ic: 'home', go: '#/hub' },
    { label: 'Time Box', words: 'timebox schedule calendar day week block allocation', ic: 'clock', go: '#/timebox' },
    { label: 'Assignments', words: 'report delegated check review', ic: 'chart', go: '#/report' },
    { label: 'Fitness', words: 'exercise health workout', ic: 'pulse', go: '#/fitness' },
    { label: 'Growth', words: 'learning books recommendations', ic: 'book', go: '#/growth' },
    { label: 'Approval History', words: 'approved decided decisions', ic: 'check', go: '#/history' },
    ...(stAdmin() ? [{ label: 'Admin Portal', words: 'admin departments staff usage', ic: 'shield', go: '#/admin' }] : []),
    // Actions
    { label: 'Recycle bin', words: 'trash deleted restore recover undo delete', ic: 'trash', run: () => actions.binOpen() },
    { label: 'New plan', words: 'create add project', ic: 'plus', run: () => actions.newPlan() },
    { label: 'Download S-Team Plan to Excel', words: 'export xlsx spreadsheet', ic: 'download', run: () => { location.hash = '#/halfplan'; setTimeout(() => actions.bpExcel(), 80); } },
    { label: 'Export backup', words: 'save download file', ic: 'download', run: () => actions.exportBackup() },
    { label: 'Import backup', words: 'restore load file', ic: 'upload', run: () => actions.importBackup() },
    { label: 'Dark mode', words: 'theme night appearance', ic: 'moon', run: theme('dark') },
    { label: 'Light mode', words: 'theme day appearance', ic: 'sun', run: theme('light') },
    { label: 'Automatic appearance', words: 'theme system dark light', ic: 'gear', run: theme('system') },
    { label: 'Set up again', words: 'setup welcome onboarding start', ic: 'gear', run: () => actions.runSetup() },
    { label: 'Settings', words: 'preferences options', ic: 'gear', run: settings('general') },
  ];
  // Every section of Settings, by its tab.
  const extra = { general: 'name size theme font colour style', timebox: 'working hours snap length', ringtone: 'alarm sound alert time up', people: 'team staff manager reporting', messages: 'chat language translate', sync: 'cloud dropbox folder import microsoft backup reset' };
  for (const [k, tab, sections] of SETTINGS_TABS) {
    list.push({ label: `${tab} settings`, sub: 'Settings', words: `settings ${extra[k] || ''}`, ic: 'gear', run: settings(k) });
    for (const s of sections) list.push({ label: s, sub: `Settings · ${tab}`, words: `settings ${tab}`, ic: 'gear', run: settings(k, s) });
  }
  return list;
}
function fnSearch(q) {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const score = (e) => {
    const label = e.label.toLowerCase();
    const all = `${label} ${(e.sub || '').toLowerCase()} ${e.words.toLowerCase()}`;
    if (!words.every((w) => all.includes(w))) return 0;
    return 1 + (label.startsWith(words[0]) ? 3 : 0) + (words.every((w) => label.includes(w)) ? 2 : 0) + (e.sub ? 0 : 1);
  };
  return fnCatalog().map((e) => [e, score(e)]).filter(([, s]) => s > 0).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([e]) => e);
}

const origRenderSearch = renderSearch;
// eslint-disable-next-line no-global-assign
renderSearch = function renderSearchWithFunctions() {
  const hits = fnSearch(ui.search.trim());
  ui.fnHits = hits;
  let html = origRenderSearch.apply(this, arguments);
  if (!hits.length) return html;
  const block = `<h2 class="sub-head">Functions</h2><ul class="day-list fn-list">${hits.map((e, i) => `<li class="day-row">${e.go
    ? `<a class="day-title" href="${e.go}">${icon(e.ic, 18)} <span><b>${esc(e.label)}</b><small>Page</small></span></a>`
    : `<button class="day-title" data-act="fnRun" data-i="${i}">${icon(e.ic, 18)} <span><b>${esc(e.label)}</b><small>${esc(e.sub || 'Action')}</small></span></button>`}</li>`).join('')}</ul>`;
  html = html.replace('<div class="empty"><h2>No matches</h2></div>', '');
  return html.replace('</header>', `</header>${block}`);
};
Object.assign(actions, {
  fnRun: (el) => {
    const e = ui.fnHits?.[Number(el.dataset.i)];
    if (!e) return;
    ui.search = '';
    $('#search').value = '';
    renderMainOnly();
    e.run();
  },
});
(function relabel() {
  const s = document.getElementById('search');
  if (!s) { setTimeout(relabel, 200); return; }
  s.placeholder = 'Search plans, tasks and functions';
  s.setAttribute('aria-label', 'Search plans, tasks and functions');
}());
