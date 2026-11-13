/* Growth: the books you plan to read or listen to, what you're on now and what you've finished (with the
   time it took). Reading sessions go into the Time Box like any task; after each one Planner asks whether
   you did it and counts the time. Hours by day, week, month and year. Recommend a book to a colleague. */

/** How you take it in. "listen" is kept as the value for Audio so older entries still match. */
const GROW_FORMATS = { read: { label: 'Read', badge: '📖 Read', verb: 'Read' }, listen: { label: 'Audio', badge: '🎧 Audio', verb: 'Listen' }, video: { label: 'Video', badge: '🎬 Video', verb: 'Watch' } };
function growth() {
  if (!S.settings.growth || !Array.isArray(S.settings.growth.books)) S.settings.growth = { books: [], log: [], recSeen: [] };
  const g = S.settings.growth;
  g.log = Array.isArray(g.log) ? g.log : [];
  g.recSeen = Array.isArray(g.recSeen) ? g.recSeen : [];
  return g;
}
const bookById = (id) => growth().books.find((b) => b.id === id);
const bookMins = (id) => growth().log.filter((l) => l.bookId === id).reduce((n, l) => n + l.min, 0);
const fmtHours = (min) => (min >= 60 ? `${Math.floor(min / 60)}h${min % 60 ? ` ${min % 60}m` : ''}` : `${min}m`);
/** Book recommendations sent to you that you haven't handled yet. */
const recsForMe = () => S.tasks.filter((t) => t.bookRec && isMeId(t.bookRec.to) && !growth().recSeen.includes(t.id));

function renderGrowth() {
  const g = growth();
  const today = todayISO();
  const sum = (from) => g.log.filter((l) => l.date >= from && l.date <= today).reduce((n, l) => n + l.min, 0);
  const weekStart = weekStartOf(today);
  const monthStart = `${today.slice(0, 7)}-01`;
  const yearStart = `${today.slice(0, 4)}-01-01`;
  const tile = (label, min, note) => `<div class="stat-tile"><small>${label}</small><b>${fmtHours(min)}</b>${note ? `<span class="muted small">${note}</span>` : ''}</div>`;
  const period = ui.growPeriod || 'week';
  const bars = growthBars(period);
  const max = Math.max(1, ...bars.map((b) => b.min));
  const lists = { plan: g.books.filter((b) => b.status === 'plan'), reading: g.books.filter((b) => b.status === 'reading'), done: g.books.filter((b) => b.status === 'done') };
  const fmtBadge = (b) => `<span class="grow-fmt">${GROW_FORMATS[b.format]?.badge || GROW_FORMATS.read.badge}</span>`;
  const bookCard = (b) => {
    const mins = bookMins(b.id);
    const inTb = S.tasks.some((t) => t.growBook === b.id && !isDone(t) && (t.tbQueued || isScheduled(t)));
    return `<article class="grow-book">
      <header><div><h3>${esc(b.title)}</h3>${b.author ? `<span class="muted small">${esc(b.author)}</span>` : ''}</div>
        <button class="icon-btn" data-act="growMenu" data-id="${esc(b.id)}" aria-label="More for ${esc(b.title)}">${icon('more', 15)}</button></header>
      <div class="grow-meta">${fmtBadge(b)}${b.recBy ? `<span class="muted small">Recommended by ${esc(b.recBy)}</span>` : ''}${mins ? `<span class="grow-time">${fmtHours(mins)}</span>` : ''}${b.status === 'done' && b.finished ? `<span class="muted small">Finished ${esc(fmtDate(b.finished))}</span>` : ''}</div>
      ${b.status === 'done' ? '' : `<div class="row grow-actions">
        <button class="btn ${inTb ? 'ghost' : 'primary'} sm" data-act="growTimebox" data-id="${esc(b.id)}" ${inTb ? 'disabled' : ''}>${icon('clock', 13)} ${inTb ? 'In Time Box' : 'Allocate to Time Box'}</button>
        <button class="btn ghost sm" data-act="growLog" data-id="${esc(b.id)}">${icon('plus', 13)} Log time</button>
        ${b.status === 'plan' ? `<button class="btn ghost sm" data-act="growStart" data-id="${esc(b.id)}">Start</button>` : `<button class="btn ghost sm" data-act="growFinish" data-id="${esc(b.id)}">${icon('check', 13)} Finished</button>`}
      </div>`}
    </article>`;
  };
  const section = (title, list, empty) => `<section class="dr-hub"><h2>${title} <span class="count">${list.length}</span></h2>${list.length ? `<div class="grow-grid">${list.map(bookCard).join('')}</div>` : `<p class="muted small">${empty}</p>`}</section>`;
  const recs = recsForMe();
  return `<div class="page grow-page">
    <header class="page-head"><h1>Growth</h1><button class="btn primary sm" data-act="growAdd">${icon('plus', 14)} Add a book</button></header>
    ${recs.length ? `<section class="dr-hub grow-recs"><h2>Recommended to you <span class="count">${recs.length}</span></h2>${recs.map((t) => `<div class="grow-rec"><div><b>${esc(t.bookRec.title)}</b>${t.bookRec.author ? ` <span class="muted">· ${esc(t.bookRec.author)}</span>` : ''}<div class="small muted">From ${esc(person(t.bookRec.by)?.name || 'a colleague')}${t.bookRec.note ? `: “${esc(t.bookRec.note)}”` : ''}</div></div>
      <div class="row"><button class="btn primary sm" data-act="growRecAdd" data-id="${esc(t.id)}">Add to my list</button><button class="btn ghost sm" data-act="growRecSkip" data-id="${esc(t.id)}">Not now</button></div></div>`).join('')}</section>` : ''}
    <div class="stat-row">
      ${tile('Today', sum(today))}${tile('This week', sum(weekStart))}${tile('This month', sum(monthStart))}${tile('This year', sum(yearStart), `${lists.done.length} book${lists.done.length === 1 ? '' : 's'} finished`)}
    </div>
    <section class="dr-hub"><div class="grow-chart-head"><h2>Hours spent growing</h2>
      <div class="seg">${[['day', 'Day'], ['week', 'Week'], ['month', 'Month'], ['year', 'Year']].map(([v, l]) => `<button class="${period === v ? 'on' : ''}" data-act="growPeriod" data-v="${v}">${l}</button>`).join('')}</div></div>
      <div class="grow-bars" role="img" aria-label="Hours spent growing by ${period}">${bars.map((b) => `<div class="grow-bar" title="${esc(`${b.label}: ${fmtHours(b.min)}`)}"><span class="v">${b.min ? fmtHours(b.min) : ''}</span><i style="height:${(b.min / max) * 100}%"></i><span class="l">${esc(b.short)}</span></div>`).join('')}</div>
    </section>
    ${section('Reading now', lists.reading, 'Nothing on the go. Start one from your list below.')}
    ${section('Want to read, listen or watch', lists.plan, 'Add the books, audiobooks and videos you plan to learn from.')}
    ${section('Finished', lists.done, 'Books you finish show here with the time they took.')}
  </div>`;
}
/** Minutes per day (last 14), week (last 12), month (last 12) or year (last 5). */
function growthBars(period) {
  const log = growth().log;
  const today = todayISO();
  const by = (from, to) => log.filter((l) => l.date >= from && l.date <= to).reduce((n, l) => n + l.min, 0);
  if (period === 'day') return Array.from({ length: 14 }, (_, i) => { const d = addDays(today, i - 13); return { label: dayLabel(d), short: String(parseISO(d).getDate()), min: by(d, d) }; });
  if (period === 'week') return Array.from({ length: 12 }, (_, i) => { const s = addDays(weekStartOf(today), (i - 11) * 7); return { label: `Week of ${fmtDate(s)}`, short: fmtDate(s).replace(/\s\w+$/, ''), min: by(s, addDays(s, 6)) }; });
  if (period === 'month') return Array.from({ length: 12 }, (_, i) => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - (11 - i)); const s = toISO(d); const e = toISO(new Date(d.getFullYear(), d.getMonth() + 1, 0)); return { label: d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }), short: d.toLocaleDateString(undefined, { month: 'short' }), min: by(s, e) }; });
  const y = Number(today.slice(0, 4));
  return Array.from({ length: 5 }, (_, i) => { const yr = y - 4 + i; return { label: String(yr), short: String(yr), min: by(`${yr}-01-01`, `${yr}-12-31`) }; });
}
function growEditDlg(b) {
  const isNew = !b;
  const v = b || { title: '', author: '', format: 'read', status: 'plan' };
  const d = showDialog({
    title: isNew ? 'Add a book' : 'Edit book',
    html: `<form class="fit-form">
      ${isNew ? `<div class="scan-cover"><label class="btn ghost sm scan-btn">${icon('camera', 15)} Scan the book cover<input type="file" accept="image/*" data-role="cover" hidden></label><span class="small muted" data-role="scan-status">Take or choose a photo of the cover: Planner reads the title and author for you to confirm.</span></div>` : ''}
      <label class="field"><span>Title</span><input name="title" value="${esc(v.title)}" required maxlength="120" placeholder="e.g. Atomic Habits"></label>
      <label class="field"><span>Author</span><input name="author" value="${esc(v.author || '')}" maxlength="80"></label>
      <div class="task-fields two">
        <label class="field"><span>How</span><select name="format">${Object.entries(GROW_FORMATS).map(([k, f]) => `<option value="${k}" ${(v.format || 'read') === k ? 'selected' : ''}>${f.label}</option>`).join('')}</select></label>
        <label class="field"><span>Where it's at</span><select name="status"><option value="plan" ${v.status === 'plan' ? 'selected' : ''}>Want to read</option><option value="reading" ${v.status === 'reading' ? 'selected' : ''}>Reading now</option><option value="done" ${v.status === 'done' ? 'selected' : ''}>Finished</option></select></label>
      </div>
      <div class="dlg-foot"><span class="spacer"></span><button class="btn primary">${isNew ? 'Add' : 'Save'}</button></div>
    </form>`,
  });
  const form = $('form', d);
  form.onsubmit = (e) => {
    e.preventDefault();
    const data = new FormData(form);
    const next = { title: String(data.get('title')).trim().slice(0, 120), author: String(data.get('author') || '').trim().slice(0, 80), format: data.get('format'), status: data.get('status') };
    if (!next.title) return;
    if (next.status === 'done' && (!b || b.status !== 'done')) next.finished = todayISO();
    if (isNew) growth().books.unshift({ id: uid(), added: Date.now(), ...next }); else Object.assign(b, next);
    d.close();
    commit();
  };
  const cover = $('[data-role="cover"]', d);
  if (cover) cover.onchange = () => { if (cover.files[0]) scanCover(cover.files[0], form, $('[data-role="scan-status"]', d)); cover.value = ''; };
  setTimeout(() => $('input[name="title"]', d)?.focus(), 50);
}
// ---------- Scan a book cover ----------
/** Loads a script once (the text reader is only fetched the first time you scan). */
const loadScript = (src) => new Promise((resolve, reject) => {
  if ([...document.scripts].some((s) => s.src === src)) { resolve(); return; }
  const el = document.createElement('script');
  el.src = src; el.async = true; el.onload = () => resolve(); el.onerror = () => reject(new Error('Could not load the text reader.'));
  document.head.append(el);
});
/** Reads the cover photo, looks the book up in Open Library and asks you to confirm before filling the form. */
async function scanCover(file, form, status) {
  const say = (msg) => { if (status) status.textContent = msg; };
  try {
    say('Reading the cover… (the first scan takes a little longer)');
    await loadScript('https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js');
    const worker = await Tesseract.createWorker('eng');
    const { data } = await worker.recognize(file);
    await worker.terminate();
    // The title is usually the biggest text on the cover; the author is often next.
    const lines = (data.lines || []).map((l) => ({ text: String(l.text || '').replace(/[^\p{L}\p{N}'’&:,. -]/gu, ' ').replace(/\s+/g, ' ').trim(), h: (l.bbox?.y1 || 0) - (l.bbox?.y0 || 0), conf: l.confidence || 0 }))
      .filter((l) => l.text.length > 1 && /[a-z]{2,}/i.test(l.text) && l.conf > 35);
    if (!lines.length) { say('Couldn’t read any words. Try a sharper, straight-on photo, or type the title.'); return; }
    const big = [...lines].sort((a, b) => b.h - a.h);
    const query = big.slice(0, 4).map((l) => l.text).join(' ').slice(0, 140);
    say('Looking the book up…');
    let docs = [];
    try {
      const r = await fetch(`https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&limit=3&fields=title,author_name,first_publish_year,cover_i`);
      docs = (await r.json()).docs || [];
    } catch { /* offline: fall back to what was read */ }
    const fill = (title, author) => { form.title.value = title || ''; form.author.value = author || ''; form.title.focus(); };
    if (!docs.length) {
      fill(big[0]?.text || '', big[1]?.text || '');
      say('Couldn’t find it online, so I filled in what I read. Please check it before adding.');
      return;
    }
    const opt = (doc) => `${doc.title}${doc.author_name?.[0] ? ` — ${doc.author_name[0]}` : ''}`;
    const first = docs[0];
    const choice = await choiceDlg('Is this your book?', `<div class="scan-match">${first.cover_i ? `<img src="https://covers.openlibrary.org/b/id/${first.cover_i}-M.jpg" alt="" width="72">` : ''}<div><b>${esc(first.title)}</b><span>${esc(first.author_name?.join(', ') || 'Author not found')}</span>${first.first_publish_year ? `<small class="muted">First published ${first.first_publish_year}</small>` : ''}</div></div>${docs.length > 1 ? '<p class="small muted">Or pick another match:</p>' : ''}`,
      [{ v: 0, label: 'Yes, that’s it', primary: true }, ...docs.slice(1).map((doc, i) => ({ v: i + 1, label: opt(doc) })), { v: 'edit', label: 'None of these' }]);
    if (choice === null || choice === undefined) { say('Scan cancelled.'); return; }
    if (choice === 'edit') { fill(big[0]?.text || '', big[1]?.text || ''); say('Filled in what I read. Please correct it before adding.'); return; }
    const doc = docs[choice];
    fill(doc.title, doc.author_name?.[0] || '');
    say('Filled in from the cover. Check it, then tap Add.');
  } catch (err) {
    say(`Couldn’t scan the cover: ${err.message || 'something went wrong'}. You can type the title instead.`);
  }
}
/** A reading (or listening) session waits in Time Box Allocation, ready to drag into a time. */
function growToTimebox(b) {
  const p = personalPlan();
  if (!p) { toast('Make a plan first.', { error: true }); return; }
  const t = addTask({ planId: p.id, bucketId: p.buckets[0].id, title: `${GROW_FORMATS[b.format]?.verb || 'Read'}: ${b.title}`, assignees: [S.meId], estimate: 30, workType: '' });
  Object.assign(t, { growBook: b.id, tbQueued: true, tbQueuedAt: Date.now() });
  if (b.status === 'plan') { b.status = 'reading'; b.started = todayISO(); }
  commit();
  toast(`“${b.title}” is in Time Box Allocation. Drag it into a time.`);
}
function growLogTime(b, min, date = todayISO()) {
  growth().log.push({ id: uid(), bookId: b.id, date, min, at: Date.now() });
  if (b.status === 'plan') { b.status = 'reading'; b.started = date; }
}
/** After a reading time box ends: count it (from the time's up pop-up). */
function growSessionDone(t, min) {
  const b = bookById(t.growBook);
  if (b) growLogTime(b, min);
}

Object.assign(actions, {
  growAdd: () => growEditDlg(null),
  growPeriod: (el) => { ui.growPeriod = el.dataset.v; render(); },
  growTimebox: (el) => growToTimebox(bookById(el.dataset.id)),
  growStart: (el) => { const b = bookById(el.dataset.id); b.status = 'reading'; b.started = todayISO(); commit(); },
  growFinish: (el) => { const b = bookById(el.dataset.id); b.status = 'done'; b.finished = todayISO(); commit(); toast(`Finished “${b.title}” · ${fmtHours(bookMins(b.id))} in total.`); },
  growLog: async (el) => {
    const b = bookById(el.dataset.id);
    const v = await promptDlg(`Time on “${b.title}”`, 'Minutes (today)', '30', 'Log');
    if (v === null || v === undefined) return;
    const min = Math.round(Number(String(v).replace(/[^\d.]/g, '')));
    if (!min || min > 1440) { toast('Enter the minutes, like 30.', { error: true }); return; }
    growLogTime(b, min);
    commit();
    toast(`${fmtHours(min)} logged · ${fmtHours(bookMins(b.id))} on this book so far.`);
  },
  growMenu: (el) => {
    const b = bookById(el.dataset.id);
    openMenu(el, [
      { label: 'Edit', icon: 'pencil', run: () => growEditDlg(b) },
      { label: 'Recommend to a colleague', icon: 'user', run: () => growRecommend(el, b) },
      '-',
      { label: 'Remove book', icon: 'trash', danger: true, run: () => { growth().books = growth().books.filter((x) => x !== b); commit(); toast(`Removed “${b.title}”. Its logged time stays in your totals.`); } },
    ]);
  },
  growRecAdd: (el) => {
    const t = taskById(el.dataset.id);
    const g = growth();
    g.books.unshift({ id: uid(), added: Date.now(), title: t.bookRec.title, author: t.bookRec.author || '', format: t.bookRec.format || 'read', status: 'plan', recBy: person(t.bookRec.by)?.name || '' });
    g.recSeen.push(t.id);
    commit();
    toast(`Added “${t.bookRec.title}” to your list.`);
  },
  growRecSkip: (el) => { growth().recSeen.push(el.dataset.id); commit(); },
});
/** Recommend a book: your colleague sees it in their Growth page and gets a notice. */
function growRecommend(el, b) {
  const seen = new Map();
  for (const p of S.people) { const k = pkey(p.id); if (k !== pkey(S.meId) && (!seen.has(k) || String(p.id).startsWith('e:'))) seen.set(k, p); }
  const people = [...seen.values()].sort((a, c) => a.name.localeCompare(c.name));
  if (!people.length) { toast('Add colleagues in Settings › People first.', { error: true }); return; }
  openMenu(el, people.map((p) => ({ label: p.name, icon: 'user', run: async () => {
    const note = await promptDlg(`Recommend “${b.title}” to ${p.name}`, 'Why they should read it (optional)', '', 'Send');
    if (note === null || note === undefined) return;
    const plan = personalPlan();
    const t = addTask({ planId: plan.id, bucketId: plan.buckets[0].id, title: `Book for ${p.name}: ${b.title}`, assignees: [S.meId] });
    t.bookRec = { to: p.id, by: S.meId, title: b.title, author: b.author || '', format: b.format, note: String(note).trim().slice(0, 300), at: Date.now() };
    t.shared = true;
    addEvent(t, 'bookRec', { to: p.id });
    commit();
    toast(`Recommended “${b.title}” to ${p.name}.`);
  } })));
}
