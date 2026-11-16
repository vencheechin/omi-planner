'use strict';
// ---------- PD Plan: tasting log ----------
// Every food tasting is one version of the product: photos, comments and what to improve.
// The app counts how many versions a product took before it reached the 100% checkpoint.
// Photos are shrunk to a small JPEG and kept with the plan, so everyone on the plan sees them.
// Each version syncs as its own field (`ts:<id>`), so editing one doesn't resend the others.

const TASTE_MAX_PHOTOS = 6;
function pdNormTaste(v) {
  if (!v || typeof v !== 'object' || !v.id || !v.pid) return null;
  return {
    id: String(v.id).slice(0, 40), pid: String(v.pid).slice(0, 40), n: Number(v.n) || 1, at: Number(v.at) || Date.now(), by: String(v.by || '').slice(0, 80), cp: String(v.cp || '').slice(0, 40),
    comments: String(v.comments || '').slice(0, 4000), improve: String(v.improve || '').slice(0, 4000),
    photos: (Array.isArray(v.photos) ? v.photos : []).filter((u) => typeof u === 'string' && u.startsWith('data:image/') && u.length < 600000).slice(0, TASTE_MAX_PHOTOS),
  };
}
const pdTastings = (p) => (p ? (p.tastings = Array.isArray(p.tastings) ? p.tastings : []) : []);
const pdVersions = (p, x) => pdTastings(p).filter((v) => v.pid === x.id).sort((a, b) => a.n - b.n || a.at - b.at);
/** The 100% checkpoint: the first one whose name starts with 100%, else the one before Launch. */
function pd100(p) {
  const cps = pdFw(p).cps;
  const i = cps.findIndex((c) => /^\s*100\s*%/.test(c.label));
  if (i >= 0) return cps[i];
  const launch = cps.findIndex((c) => /launch/i.test(`${c.stage} ${c.label}`) && !/pre/i.test(`${c.stage} ${c.label}`));
  return cps[Math.max(0, (launch >= 0 ? launch : cps.length) - 1)];
}
/** When the product reached 100% (or null), and how many versions it took to get there. */
function pdTo100(p, x) {
  const c100 = pd100(p);
  const i100 = pdCpIndex(p, c100?.id);
  const hit = x.history.find((h) => h.d === 'advance' && pdCpIndex(p, h.cp) === i100 - 1);
  const jump = x.history.find((h) => h.d === 'move' && pdCpIndex(p, h.cp) < i100 && pdCpIndex(p, h.to) >= i100);
  const reached = hit ? hit.at : jump ? jump.at : (pdCpIndex(p, x.cp) >= i100 && x.status !== 'stopped' ? x.enteredAt : null);
  const vs = pdVersions(p, x);
  return { at: reached, n: reached ? vs.filter((v) => v.at <= reached).length : vs.length, total: vs.length, label: c100?.label || '100%' };
}

/** Shrinks a photo to at most 1000 px on its long side, as JPEG. */
async function pdShrink(file) {
  const bmp = await createImageBitmap(file).catch(() => null);
  let w; let h; let src = bmp;
  if (!bmp) {
    const url = URL.createObjectURL(file);
    src = await new Promise((ok, bad) => { const im = new Image(); im.onload = () => ok(im); im.onerror = bad; im.src = url; }).finally(() => setTimeout(() => URL.revokeObjectURL(url), 1000));
  }
  w = src.width; h = src.height;
  const k = Math.min(1, 1000 / Math.max(w, h));
  const c = document.createElement('canvas');
  c.width = Math.round(w * k); c.height = Math.round(h * k);
  c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
  let q = 0.72;
  let out = c.toDataURL('image/jpeg', q);
  while (out.length > 450000 && q > 0.35) { q -= 0.12; out = c.toDataURL('image/jpeg', q); }
  return out;
}

// ---------- Drawing ----------
function pdTasteHTML(p, x) {
  const ed = stCanEdit(p);
  const vs = pdVersions(p, x);
  const t = pdTo100(p, x);
  return `<h3 class="pd-tl-head">Tasting log <span class="pd-vcount">${vs.length} version${vs.length === 1 ? '' : 's'}</span>${ed ? `<button class="btn sm primary" data-act="pdTasteNew" data-id="${esc(x.id)}">${icon('plus', 13)} New version</button>` : ''}</h3>
    <p class="small muted">${t.at ? `Reached ${esc(t.label)} after <b>${t.n}</b> version${t.n === 1 ? '' : 's'}.` : `Not at ${esc(t.label)} yet${vs.length ? `: ${vs.length} version${vs.length === 1 ? '' : 's'} so far` : ''}. Every tasting session is one version.`}</p>
    ${vs.length ? `<ol class="pd-vers">${[...vs].reverse().map((v) => `<li>
      <header><b>Version ${v.n}</b><small>${esc(fmtDateTime(v.at))}${v.by ? ` · ${esc(v.by)}` : ''}${pdCp(p, v.cp) ? ` · ${esc(pdCp(p, v.cp).label)}` : ''}</small>
        ${ed ? `<span class="spacer"></span><button class="icon-btn" data-act="pdTasteEdit" data-id="${esc(v.id)}" aria-label="Edit version ${v.n}">${icon('pencil', 13)}</button><button class="icon-btn" data-act="pdTasteDel" data-id="${esc(v.id)}" aria-label="Delete version ${v.n}">${icon('trash', 13)}</button>` : ''}</header>
      ${v.photos.length ? `<div class="pd-photos">${v.photos.map((u, i) => `<button class="pd-ph" data-act="pdPhoto" data-id="${esc(v.id)}" data-i="${i}" aria-label="Photo ${i + 1}"><img src="${u}" alt="" loading="lazy"></button>`).join('')}</div>` : ''}
      ${v.comments ? `<div class="pd-vtxt"><small>Comments</small><p>${esc(v.comments).replace(/\n/g, '<br>')}</p></div>` : ''}
      ${v.improve ? `<div class="pd-vtxt pd-imp"><small>To improve</small><p>${esc(v.improve).replace(/\n/g, '<br>')}</p></div>` : ''}
    </li>`).join('')}</ol>` : ''}`;
}
function pdTasteFormHTML(p, x, v) {
  return `<form class="pd-tform" data-submit="pdTasteSave" data-pid="${esc(x.id)}" ${v ? `data-vid="${esc(v.id)}"` : ''}>
    <p class="small muted">${esc(x.name)} · Version ${v ? v.n : pdVersions(p, x).length + 1}</p>
    <label class="pd-f"><span>Photos</span><input type="file" name="photos" accept="image/*" multiple></label>
    ${v?.photos.length ? `<div class="pd-photos pd-keep">${v.photos.map((u, i) => `<label class="pd-ph"><img src="${u}" alt=""><span><input type="checkbox" name="keep" value="${i}" checked> Keep</span></label>`).join('')}</div>` : ''}
    <label class="pd-f"><span>Comments</span><textarea name="comments" rows="4" placeholder="How it tasted, looked and smelled; what people said">${esc(v?.comments || '')}</textarea></label>
    <label class="pd-f"><span>To improve</span><textarea name="improve" rows="3" placeholder="What to change for the next version">${esc(v?.improve || '')}</textarea></label>
    <div class="row"><span class="spacer"></span><button class="btn primary">${v ? 'Save' : 'Add version'}</button></div>
  </form>`;
}

// Into the product window, the cards and Analysis.
const origProductHTML = pdProductHTML;
// eslint-disable-next-line no-global-assign
pdProductHTML = function pdProductWithTasting(p, x) { return origProductHTML(p, x).replace('<h3>Review</h3>', `${pdTasteHTML(p, x)}<h3>Review</h3>`); };
const origCardHTML = pdCardHTML;
// eslint-disable-next-line no-global-assign
pdCardHTML = function pdCardWithVersions(p, x) {
  const n = pdVersions(p, x).length;
  return n ? origCardHTML(p, x).replace('<span class="pd-meta">', `<span class="pd-meta"><i class="pd-vtag" title="Tasting versions">V${n}</i> `) : origCardHTML(p, x);
};
const origAnalysisHTML = pdAnalysisHTML;
// eslint-disable-next-line no-global-assign
pdAnalysisHTML = function pdAnalysisWithVersions(p) {
  const rows = pdProducts(p).map((x) => ({ x, t: pdTo100(p, x) })).filter((r) => r.t.total || r.t.at);
  const done = rows.filter((r) => r.t.at);
  const avg = done.length ? (done.reduce((s, r) => s + r.t.n, 0) / done.length).toFixed(1) : '–';
  const label = pd100(p)?.label || '100%';
  const card = `<section class="pd-acard"><h3>Tasting versions</h3><p class="pd-asub">How many tastings it took to reach ${esc(label)}</p>
    <div class="pd-bigs"><div class="pd-big"><b>${avg}</b><small>Average versions to ${esc(label)}</small></div><div class="pd-big"><b>${pdTastings(p).length}</b><small>Tastings logged</small></div></div>
    ${rows.length ? `<table class="pd-tbl"><thead><tr><th>Product</th><th>Versions</th><th>To ${esc(label)}</th></tr></thead><tbody>${rows.sort((a, b) => b.t.total - a.t.total).map((r) => `<tr><td><button class="linklike" data-act="pdOpen" data-id="${esc(r.x.id)}">${esc(r.x.name)}</button></td><td>${r.t.total}</td><td>${r.t.at ? r.t.n : 'not yet'}</td></tr>`).join('')}</tbody></table>` : '<p class="small muted">Log tastings on a product to see them here.</p>'}</section>`;
  return origAnalysisHTML(p).replace(/<\/div>\s*$/, `${card}</div>`);
};

// ---------- Actions ----------
const pdTasteById = (id) => pdTastings(stCurrent()).find((v) => v.id === id);
Object.assign(actions, {
  pdTasteNew: (el) => {
    const p = stCurrent();
    const x = pdFind(el.dataset.id);
    if (!x || !stCanEdit(p)) return;
    showDialog({ title: 'New tasting version', html: pdTasteFormHTML(p, x, null) })?.classList?.add('pd-taste-dlg');
  },
  pdTasteEdit: (el) => {
    const p = stCurrent();
    const v = pdTasteById(el.dataset.id);
    const x = v && pdFind(v.pid);
    if (!x || !stCanEdit(p)) return;
    showDialog({ title: `Version ${v.n}`, html: pdTasteFormHTML(p, x, v) })?.classList?.add('pd-taste-dlg');
  },
  pdTasteDel: async (el) => {
    const p = stCurrent();
    const v = pdTasteById(el.dataset.id);
    if (!v || !await confirmDlg(`Delete version ${v.n}?`, 'Its photos and notes go too.', 'Delete')) return;
    p.tastings = pdTastings(p).filter((y) => y !== v);
    pdDirty(p);
    commit();
  },
  pdPhoto: (el) => {
    const v = pdTasteById(el.dataset.id);
    const u = v?.photos[Number(el.dataset.i)];
    if (!u) return;
    showDialog({ title: `Version ${v.n} · photo ${Number(el.dataset.i) + 1} of ${v.photos.length}`, html: `<img class="pd-big-photo" src="${u}" alt="">`, wide: true });
  },
});
Object.assign(submits, {
  pdTasteSave: async (form, data) => {
    const p = stCurrent();
    const x = pdFind(form.dataset.pid);
    if (!x || !stCanEdit(p)) return;
    const old = form.dataset.vid ? pdTasteById(form.dataset.vid) : null;
    const keep = old ? data.getAll('keep').map(Number).map((i) => old.photos[i]).filter(Boolean) : [];
    const files = data.getAll('photos').filter((f) => f && f.size && /^image\//.test(f.type || 'image/'));
    const room = TASTE_MAX_PHOTOS - keep.length;
    if (files.length > room) toast(`Up to ${TASTE_MAX_PHOTOS} photos per version; the first ${Math.max(0, room)} new ones are kept.`);
    const comments = String(data.get('comments') || '').trim();
    const improve = String(data.get('improve') || '').trim();
    $$('dialog.pd-taste-dlg').forEach((d) => d.close());
    const shrunk = [];
    for (const f of files.slice(0, Math.max(0, room))) { try { shrunk.push(await pdShrink(f)); } catch { toast(`Could not read ${f.name}.`); } }
    const photos = [...keep, ...shrunk];
    if (!old && !photos.length && !comments && !improve) return;
    if (old) Object.assign(old, pdNormTaste({ ...old, photos, comments, improve }));
    else {
      const n = Math.max(0, ...pdVersions(p, x).map((v) => v.n)) + 1;
      pdTastings(p).push(pdNormTaste({ id: uid(), pid: x.id, n, at: Date.now(), by: pdMe(), cp: x.cp, photos, comments, improve }));
    }
    pdDirty(p);
    commit();
    toast(old ? `Version ${old.n} saved.` : `Version ${pdVersions(p, x).length} added.`);
  },
});
