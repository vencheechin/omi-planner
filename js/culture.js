'use strict';
// ---------- OMI culture quotes ----------
// Admins write the team's culture quotes (Admin Portal › Culture) and choose where each one shows:
// the rest reminder, task reminders, and a quiet line at the top of the Time Box, the Work Planner
// and the Calendar. Shared with everyone through the org record (field "quotes"). When no quotes
// are set, the rest reminder keeps its built-in OMI culture lines and the pages show nothing.

const CULTURE_PLACES = [['rest', 'Rest reminder'], ['reminder', 'Task reminders'], ['timebox', 'Time Box'], ['planner', 'Work Planner'], ['calendar', 'Calendar']];
const CULTURE_MISSION = 'Creating a Happier Life for Everyone We Touch';
function normalizeQuotes(list) {
  if (!Array.isArray(list)) return null;
  return list.filter((q) => q && typeof q === 'object').slice(0, 100).map((q) => ({
    id: String(q.id || uid()).slice(0, 40),
    theme: String(q.theme || '').slice(0, 40),
    text: String(q.text || '').slice(0, 240),
    where: (Array.isArray(q.where) ? q.where : []).filter((w) => CULTURE_PLACES.some(([k]) => k === w)),
  }));
}
const cultureQuotes = () => normalizeQuotes(org().quotes) || [];
/** A quote for a place: the same one all day for page lines, a different one each time for reminders. */
function cultureQuote(place, { random = false } = {}) {
  const list = cultureQuotes().filter((q) => q.text.trim() && q.where.includes(place));
  if (!list.length) return null;
  if (!random) { const day = Math.floor(Date.now() / 864e5); return list[day % list.length]; }
  let last = '';
  try { last = localStorage.getItem(`planner-quote-${place}`) || ''; } catch { /* fine */ }
  const pool = list.length > 1 ? list.filter((q) => q.id !== last) : list;
  const q = pool[Math.floor(Math.random() * pool.length)];
  try { localStorage.setItem(`planner-quote-${place}`, q.id); } catch { /* fine */ }
  return q;
}
const cultureStripHTML = (q) => (q ? `<div class="culture-strip"><small>OMI Culture${q.theme ? ` · ${esc(q.theme)}` : ''}</small><span>${esc(q.text)}</span></div>` : '');

// The rest reminder takes the admins' quotes when there are some.
if (typeof nextCulture === 'function') {
  const builtIn = nextCulture;
  // eslint-disable-next-line no-global-assign
  nextCulture = function () { const q = cultureQuote('rest', { random: true }); return q ? [q.theme || 'OMI Culture', q.text] : builtIn(); };
}

// Pages: a quiet line at the top of the Time Box, the Work Planner and the Calendar.
const cultureOrigRender = render;
// eslint-disable-next-line no-global-assign
render = function renderWithCulture(...args) {
  const out = cultureOrigRender.apply(this, args);
  try {
    const r = ui.route || {};
    const place = r.view === 'timebox' ? 'timebox' : r.view === 'meet' ? 'calendar' : r.view === 'plan' && typeof ownPlanner === 'function' && ownPlanner()?.id === r.id ? 'planner' : '';
    const q = place ? cultureQuote(place) : null;
    const page = document.querySelector('#main .page, #main .plan-page, #main .tb-page, main .page, main .plan-page');
    if (q && page && !page.querySelector(':scope > .culture-strip')) page.insertAdjacentHTML('afterbegin', cultureStripHTML(q));
  } catch { /* never block the page */ }
  return out;
};

// ---------- Admin Portal › Culture ----------
function cultureAdminHTML() {
  const list = cultureQuotes();
  return `<section class="dr-hub culture-admin"><h2>Culture quotes</h2>
    <p class="small muted">Meaningful words for the team. Choose where each one shows; they rotate. Everyone sees the same quotes.</p>
    ${list.map((q, i) => `<div class="culture-row">
      <div class="culture-fields"><input value="${esc(q.theme)}" placeholder="Theme, e.g. Gratitude" data-change="cqEdit" data-i="${i}" data-k="theme" aria-label="Theme">
        <textarea rows="2" placeholder="The quote" data-change="cqEdit" data-i="${i}" data-k="text" aria-label="Quote">${esc(q.text)}</textarea>
        <div class="culture-where">${CULTURE_PLACES.map(([k, l]) => `<label class="mini"><input type="checkbox" data-change="cqWhere" data-i="${i}" value="${k}" ${q.where.includes(k) ? 'checked' : ''}> ${l}</label>`).join('')}</div></div>
      <button class="icon-btn" data-act="cqDel" data-i="${i}" aria-label="Remove quote">${icon('close', 14)}</button></div>`).join('') || '<p class="muted small">No quotes yet. The rest reminder uses the built-in OMI culture lines until you add some.</p>'}
    <div class="row"><button class="btn ghost sm" data-act="cqAdd">${icon('plus', 13)} Add quote</button>${list.length ? '' : `<button class="btn ghost sm" data-act="cqDefaults">Start from the OMI culture lines</button>`}</div>
    <p class="small muted culture-mission">${esc(CULTURE_MISSION)}</p></section>`;
}
function cultureEdit(fn) {
  if (!stAdmin()) return;
  const list = cultureQuotes().map((q) => ({ ...q, where: [...q.where] }));
  fn(list);
  org().quotes = normalizeQuotes(list);
  commit();
}
Object.assign(actions, {
  cqAdd: () => cultureEdit((l) => l.push({ id: uid(), theme: '', text: '', where: ['rest', 'timebox', 'planner', 'calendar'] })),
  cqDel: (el) => cultureEdit((l) => { l.splice(Number(el.dataset.i), 1); }),
  cqDefaults: () => cultureEdit((l) => { (typeof OMI_CULTURE !== 'undefined' ? OMI_CULTURE : []).forEach(([theme, text]) => l.push({ id: uid(), theme, text, where: ['rest', 'reminder', 'timebox', 'planner', 'calendar'] })); }),
});
Object.assign(changes, {
  cqEdit: (el) => cultureEdit((l) => { const q = l[Number(el.dataset.i)]; if (q) q[el.dataset.k] = el.value.trim(); }),
  cqWhere: (el) => cultureEdit((l) => { const q = l[Number(el.dataset.i)]; if (!q) return; const w = new Set(q.where); if (el.checked) w.add(el.value); else w.delete(el.value); q.where = [...w]; }),
});
if (typeof ADMIN_TABS !== 'undefined' && !ADMIN_TABS.some(([k]) => k === 'culture')) ADMIN_TABS.splice(ADMIN_TABS.length - 1, 0, ['culture', 'Culture']);
