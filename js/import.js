'use strict';
/* Import from Microsoft Planner.

   In Microsoft Planner, open a plan, choose ••• next to its name, then "Export plan to Excel".
   That .xlsx (or a .csv saved from it) is read here with no library: an .xlsx is a zip of XML
   files, unzipped with the browser's own DecompressionStream. Each file becomes a plan, with the
   same buckets, tasks, progress, priority, dates, labels, checklist, description and people. */

// ---------- Reading the file ----------
/** The files inside a zip, as { name: Uint8Array }. Supports stored and deflated entries. */
async function unzip(buf) {
  const bytes = new Uint8Array(buf);
  const view = new DataView(buf);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('This file is not an Excel workbook.');
  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  const out = {};
  const dec = new TextDecoder();
  for (let n = 0; n < count; n++) {
    if (view.getUint32(p, true) !== 0x02014b50) break;
    const method = view.getUint16(p + 10, true);
    const size = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const local = view.getUint32(p + 42, true);
    const name = dec.decode(bytes.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;
    if (!/\.(xml|rels)$/.test(name)) continue;
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    const data = bytes.subarray(start, start + size);
    if (method === 0) out[name] = data;
    else if (method === 8) out[name] = new Uint8Array(await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
  }
  return out;
}
const xmlDoc = (bytes) => new DOMParser().parseFromString(new TextDecoder().decode(bytes), 'application/xml');
const byTag = (node, tag) => [...node.getElementsByTagName(tag)];
/** Column letters to a 0-based index: A → 0, AB → 27. */
const colIndex = (ref) => [...ref.replace(/\d+/g, '')].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1;

/** The first worksheet of an .xlsx as rows of cell values (strings or numbers). */
async function readXlsx(buf) {
  const files = await unzip(buf);
  const strings = files['xl/sharedStrings.xml'] ? byTag(xmlDoc(files['xl/sharedStrings.xml']), 'si').map((si) => byTag(si, 't').map((t) => t.textContent).join('')) : [];
  let sheetPath = 'xl/worksheets/sheet1.xml';
  if (files['xl/workbook.xml'] && files['xl/_rels/workbook.xml.rels']) {
    const first = byTag(xmlDoc(files['xl/workbook.xml']), 'sheet')[0];
    const rid = first?.getAttribute('r:id') || first?.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
    const rel = byTag(xmlDoc(files['xl/_rels/workbook.xml.rels']), 'Relationship').find((r) => r.getAttribute('Id') === rid);
    if (rel) { const t = rel.getAttribute('Target').replace(/^\//, ''); sheetPath = t.startsWith('xl/') ? t : `xl/${t}`; }
  }
  if (!files[sheetPath]) sheetPath = Object.keys(files).find((k) => /^xl\/worksheets\/sheet\d+\.xml$/.test(k));
  if (!sheetPath) throw new Error('No worksheet found in this file.');
  return byTag(xmlDoc(files[sheetPath]), 'row').map((row) => {
    const cells = [];
    byTag(row, 'c').forEach((c, i) => {
      const at = c.getAttribute('r') ? colIndex(c.getAttribute('r')) : i;
      const type = c.getAttribute('t');
      const v = byTag(c, 'v')[0]?.textContent;
      let val = '';
      if (type === 's') val = strings[Number(v)] ?? '';
      else if (type === 'inlineStr') val = byTag(c, 't').map((t) => t.textContent).join('');
      else if (type === 'str' || type === 'e') val = v ?? '';
      else if (type === 'b') val = v === '1' ? 'TRUE' : 'FALSE';
      else if (v !== undefined && v !== '') val = Number(v);
      cells[at] = val;
    });
    return Array.from(cells, (x) => (x === undefined ? '' : x));
  });
}
/** A CSV file as rows of strings (quoted fields, commas or semicolons). */
function readCsv(text) {
  text = text.replace(/^﻿/, '');
  const firstLine = text.split(/\r?\n/, 1)[0];
  const sep = (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ';' : ',';
  const rows = [];
  let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') q = false; else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === sep) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

// ---------- Understanding a Planner export ----------
const MSP_COLUMNS = {
  id: ['task id'], title: ['task name', 'title', 'name'], bucket: ['bucket name', 'bucket'], progress: ['progress', 'status'],
  priority: ['priority'], assigned: ['assigned to', 'assignees'], start: ['start date', 'start'], due: ['due date', 'due'],
  completed: ['completed date', 'completed'], created: ['created date'], labels: ['labels', 'categories'], notes: ['description', 'notes'],
  checklist: ['checklist items', 'checklist'], checkDone: ['completed checklist items'], recurring: ['is recurring'],
};
/** Finds the header row and the plan name above it, and turns each row below into a plain object. */
function parsePlannerRows(rows, fileName) {
  const norm = (v) => String(v ?? '').trim().toLowerCase();
  const headerAt = rows.findIndex((r) => r.some((c) => MSP_COLUMNS.title.includes(norm(c))) && r.filter((c) => norm(c)).length >= 2);
  if (headerAt < 0) throw new Error(`“${fileName}” doesn't look like a Microsoft Planner export (no “Task Name” column).`);
  const header = rows[headerAt].map(norm);
  const col = {};
  for (const [k, names] of Object.entries(MSP_COLUMNS)) { const i = header.findIndex((h) => names.includes(h)); if (i >= 0) col[k] = i; }
  let planName = '';
  for (const r of rows.slice(0, headerAt)) {
    const i = r.findIndex((c) => norm(c) === 'plan name');
    if (i >= 0) planName = String(r.slice(i + 1).find((c) => String(c).trim()) || '').trim();
  }
  if (!planName) planName = fileName.replace(/\.(xlsx|csv)$/i, '').replace(/[_-]+/g, ' ').trim() || 'Imported plan';
  const tasks = rows.slice(headerAt + 1).map((r) => {
    const o = {};
    for (const [k, i] of Object.entries(col)) o[k] = r[i] ?? '';
    return o;
  }).filter((o) => String(o.title || '').trim());
  // Dates written as text: work out day/month order from the whole file.
  const texts = tasks.flatMap((o) => [o.start, o.due, o.completed, o.created]).filter((v) => typeof v === 'string' && /^\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}/.test(v.trim()));
  const parts = texts.map((v) => v.trim().split(/[/.-]/).map(Number));
  const dayFirst = parts.some((p) => p[0] > 12) ? true : parts.some((p) => p[1] > 12) ? false : !/^en-US/i.test(navigator.language || '');
  return { planName, tasks, dayFirst };
}
/** A Planner date cell (Excel day number, text or ISO) to YYYY-MM-DD, or null. */
function plannerDate(v, dayFirst) {
  if (v === '' || v === null || v === undefined) return null;
  if (typeof v === 'number' && v > 1000) return new Date(Date.UTC(1899, 11, 30) + Math.floor(v) * 86400000).toISOString().slice(0, 10);
  const s = String(v).trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) return `${m[1]}-${pad(+m[2])}-${pad(+m[3])}`;
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/.exec(s);
  if (m) {
    const [d, mo] = dayFirst ? [+m[1], +m[2]] : [+m[2], +m[1]];
    const y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) return `${y}-${pad(mo)}-${pad(d)}`;
  }
  const t = Date.parse(s);
  return Number.isFinite(t) ? toISO(new Date(t)) : null;
}
const splitList = (v) => String(v || '').split(/;|\n/).map((x) => x.trim()).filter(Boolean);
function plannerProgress(v) {
  const s = String(v).trim().toLowerCase();
  if (typeof v === 'number') return v >= 1 || v === 100 ? 100 : v >= 0.8 ? 80 : v >= 0.5 ? 50 : v > 0 ? 10 : 0;
  if (/complete|done|100/.test(s)) return 100;
  if (/progress|started/.test(s) && !/not/.test(s)) return 50;
  return 0;
}
const plannerPriority = (v) => ({ urgent: 1, important: 3, high: 3, medium: 5, low: 9 })[String(v).trim().toLowerCase()] || 5;
/** Matches a name from Microsoft Planner to someone already here: full name, or first name ("Ven Chin" → Ven). */
function matchPerson(name) {
  const n = name.toLowerCase();
  const first = n.split(/\s+/)[0];
  return S.people.find((p) => p.name.toLowerCase() === n || (p.email || '') === n)
    || S.people.find((p) => p.name.toLowerCase() === first || p.name.toLowerCase().split(/\s+/)[0] === first) || null;
}

// ---------- Importing ----------
/** Reads the chosen files, then asks how to bring them in. */
async function importPlannerFiles(files) {
  const parsed = [];
  for (const f of files) {
    try {
      const rows = /\.csv$/i.test(f.name) ? readCsv(await f.text()) : await readXlsx(await f.arrayBuffer());
      parsed.push({ file: f.name, ...parsePlannerRows(rows, f.name) });
    } catch (err) {
      toast(err.message || `Couldn't read “${f.name}”.`, { error: true });
    }
  }
  if (!parsed.length) return;
  const d = showDialog({
    title: 'Import from Microsoft Planner',
    wide: true,
    html: `<form method="dialog" class="stack" data-submit="importPlanner">
      ${parsed.map((p, i) => {
        const buckets = new Set(p.tasks.map((t) => String(t.bucket || '').trim()).filter(Boolean));
        const existing = S.plans.find((x) => x.name.toLowerCase() === p.planName.toLowerCase());
        return `<div class="imp-file"><label class="field"><span>Plan Name</span><input name="plan${i}" value="${esc(p.planName)}" required autocomplete="off"></label>
          <p class="muted small">${esc(p.file)}: ${p.tasks.length} task${p.tasks.length === 1 ? '' : 's'} in ${buckets.size || 1} bucket${buckets.size === 1 ? '' : 's'}.${existing ? ' Adds to your existing plan.' : ''}</p></div>`;
      }).join('')}
      <label class="mini"><input type="checkbox" name="people" checked> Keep who each task is assigned to</label>
      <div class="dlg-foot"><button class="btn ghost" type="button" data-role="no">Cancel</button><button class="btn primary">Import</button></div>
    </form>`,
  });
  d._parsed = parsed;
  $('[data-role="no"]', d).onclick = () => d.close();
}
function importPlanner(form, data) {
  const parsed = form.closest('dialog')._parsed;
  const keepPeople = data.get('people') === 'on';
  const before = JSON.stringify(S);
  let added = 0, skipped = 0, lastPlan = null;
  parsed.forEach((p, i) => {
    const name = String(data.get(`plan${i}`) || p.planName).trim() || p.planName;
    let plan = S.plans.find((x) => x.name.toLowerCase() === name.toLowerCase());
    if (!plan) {
      plan = makePlan(name, PLAN_COLORS[S.plans.length % PLAN_COLORS.length]);
      plan.buckets = [];
      S.plans.push(plan);
    }
    lastPlan = plan;
    const bucketFor = (bname) => {
      bname = String(bname || '').trim() || 'To do';
      let b = plan.buckets.find((x) => x.name.toLowerCase() === bname.toLowerCase());
      if (!b) { b = { id: uid(), name: bname }; plan.buckets.push(b); }
      return b;
    };
    // Planner's own label names (Pink, Blue...) map to the same colour; your own names take a colour nobody uses.
    const reserved = new Set(p.tasks.flatMap((row) => splitList(row.labels)).map((n) => LABELS.findIndex(([c]) => c.toLowerCase() === n.toLowerCase())).filter((i) => i >= 0));
    const labelFor = (lname) => {
      const low = lname.toLowerCase();
      let i = plan.labels.findIndex((x) => x && x.toLowerCase() === low);
      if (i >= 0) return i;
      i = LABELS.findIndex(([n]) => n.toLowerCase() === low);
      if (i < 0 && /^category\d+$/.test(low)) i = Number(low.slice(8)) - 1;
      if (i >= 0 && i < LABELS.length) return i;
      i = plan.labels.findIndex((x, n) => !x && !reserved.has(n) && !S.tasks.some((t) => t.planId === plan.id && t.labels.includes(n)));
      if (i < 0) i = plan.labels.findIndex((x) => !x);
      if (i < 0) return null;
      plan.labels[i] = lname;
      return i;
    };
    const known = new Set(S.tasks.filter((t) => t.planId === plan.id).map((t) => t.msId || `${t.title.toLowerCase()}|${t.bucketId}`));
    p.tasks.forEach((row, n) => {
      const title = String(row.title).trim();
      const bucket = bucketFor(row.bucket);
      const key = row.id ? String(row.id) : `${title.toLowerCase()}|${bucket.id}`;
      if (known.has(key) || known.has(`${title.toLowerCase()}|${bucket.id}`)) { skipped++; return; }
      known.add(key);
      const progress = plannerProgress(row.progress);
      const assignees = keepPeople ? [...new Set(splitList(row.assigned).map((nm) => (matchPerson(nm) || ensurePerson(nm)).id))] : [];
      assignees.forEach((a) => { if (!plan.members.includes(a)) plan.members.push(a); });
      const items = splitList(row.checklist);
      const doneCount = Number(String(row.checkDone || '').split('/')[0]) || 0;
      const t = makeTask({
        planId: plan.id, bucketId: bucket.id, title, notes: String(row.notes || '').trim(),
        progress, priority: plannerPriority(row.priority),
        start: plannerDate(row.start, p.dayFirst), due: plannerDate(row.due, p.dayFirst),
        assignees, labels: splitList(row.labels).map(labelFor).filter((x) => x !== null),
        checklist: items.map((text, k) => ({ id: uid(), text, done: progress === 100 || (doneCount >= items.length) || false })),
        completedAt: progress === 100 ? (Date.parse(plannerDate(row.completed, p.dayFirst) || '') || Date.now()) : null,
        created: Date.parse(plannerDate(row.created, p.dayFirst) || '') || Date.now(),
        order: n, msId: row.id ? String(row.id) : null,
      });
      if (t.checklist.length && doneCount && doneCount < items.length) t.checklist.slice(0, doneCount).forEach((c) => { c.done = true; });
      S.tasks.push(t);
      // Imported assignments are a copy of Microsoft Planner, not new work handed out from here.
      S.sync.seenAssignees[t.id] = [...t.assignees];
      added++;
    });
    if (!plan.buckets.length) plan.buckets.push({ id: uid(), name: 'To do' });
  });
  form.closest('dialog').close();
  commit();
  toast(`Imported ${added} task${added === 1 ? '' : 's'}${skipped ? `, skipped ${skipped} already here` : ''}.`, { undo: () => { S = JSON.parse(before); commit(); } });
  if (lastPlan && parsed.length === 1) location.hash = `#/plan/${lastPlan.id}`;
}
