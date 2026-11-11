'use strict';
/* Conversation extras: the + menu (attach, photos, camera, location, contact), automatic
   translation into your default language, and the message menu (reply, forward, copy, delete,
   recall), with admin-only "delete for everyone" and a log of every deletion and recall.

   Who is an admin: with cloud sync, team admins (set in Settings > Cloud sync; the team's creator
   always is one, and the server enforces it). Without a team, you are the admin of your own
   Planner. In a shared folder (no server to enforce it) nobody gets admin rights. */

Object.assign(ICON, {
  image: 'M4 5h16v14H4zM8.5 11a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3M20 16l-5-5-9 8',
  camera: 'M4 8h3l2-3h6l2 3h3v11H4zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8',
  pin: 'M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11zM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5',
  reply: 'M10 7L4 12l6 5M4 12h10a6 6 0 0 1 6 6',
  fwd: 'M14 7l6 5-6 5M20 12H10a6 6 0 0 0-6 6',
  doc: 'M7 3h7l5 5v13H7zM14 3v5h5',
  recall: 'M9 14L4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3',
  globe: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M3 12h18M12 3c2.5 2.7 2.5 15.3 0 18M12 3c-2.5 2.7-2.5 15.3 0 18',
});

const RECALL_MS = 5 * 60 * 1000;
const LANGUAGES = [
  ['en', 'English'], ['zh-CN', '中文（简体） Chinese, Simplified'], ['zh-TW', '中文（繁體） Chinese, Traditional'], ['ms', 'Bahasa Melayu'],
  ['id', 'Bahasa Indonesia'], ['ta', 'தமிழ் Tamil'], ['hi', 'हिन्दी Hindi'], ['ja', '日本語 Japanese'], ['ko', '한국어 Korean'],
  ['th', 'ไทย Thai'], ['vi', 'Tiếng Việt'], ['tl', 'Filipino'], ['es', 'Español'], ['fr', 'Français'], ['de', 'Deutsch'],
  ['it', 'Italiano'], ['pt', 'Português'], ['ar', 'العربية Arabic'], ['ru', 'Русский'],
];
const langName = (code) => {
  const hit = LANGUAGES.find(([c]) => c.toLowerCase() === String(code).toLowerCase()) || LANGUAGES.find(([c]) => c.split('-')[0] === String(code).split('-')[0]);
  if (hit) return hit[1].replace(/^[^\sA-Za-z]+\S*\s/, '').split(',')[0];
  try { return new Intl.DisplayNames(['en'], { type: 'language' }).of(code) || code; } catch { return code; }
};
function defaultChatPrefs() {
  const nav = (navigator.language || 'en').toLowerCase();
  const lang = nav.startsWith('zh') ? (/tw|hk|hant/.test(nav) ? 'zh-TW' : 'zh-CN') : (LANGUAGES.find(([c]) => c === nav.split('-')[0])?.[0] || 'en');
  return { lang, translate: true, hidden: [] };
}
function normalizeChatPrefs(c) {
  const d = defaultChatPrefs();
  if (!c || typeof c !== 'object') return d;
  return {
    lang: typeof c.lang === 'string' && /^[a-z]{2,3}(-[A-Za-z]{2,4})?$/.test(c.lang) ? c.lang : d.lang,
    translate: c.translate !== false,
    hidden: Array.isArray(c.hidden) ? [...new Set(c.hidden.filter((x) => typeof x === 'string'))].slice(-5000) : [],
  };
}
const chatPrefs = () => (S.settings.chat = S.settings.chat || defaultChatPrefs());

// ---------- Who may do what ----------
function isAdmin() {
  if (typeof Cloud !== 'undefined' && Cloud.team) return (Cloud.team.admins || []).includes(Cloud.session?.email);
  return !(typeof Team !== 'undefined' && Team.dir);
}
const isRecalled = (c) => !!c.recalled;
const canRecall = (c) => !c.deleted && !isRecalled(c) && (isAdmin() || (c.author === S.meId && Date.now() - c.at < RECALL_MS));
/** You can delete (for yourself) only your own messages; admins can pick anyone's. */
const canSelect = (c) => !c.deleted && (c.author === S.meId || isAdmin());

// ---------- Log of deletions and recalls ----------
/** Keeps a record on this device and, with cloud sync, in the team's message log (admins can read it). */
function logMessage(t, c, action) {
  const entry = {
    id: uid(), at: Date.now(), action, by: S.meId, byName: person(S.meId)?.name || '', taskId: t.id, taskTitle: t.title,
    messageId: c.id, author: c.author, authorName: person(c.author)?.name || '', text: c.text || '', files: (c.files || []).map((f) => f.name), messageAt: c.at,
    scope: t.shared ? 'team' : 'private',
  };
  S.msgLog = [...(S.msgLog || []), entry].slice(-2000);
  S.sync.logQueue = [...(S.sync.logQueue || []), entry];
  if (typeof Cloud !== 'undefined' && Cloud.session) Cloud.flushLog?.();
}
async function messageLogDlg() {
  let rows = (S.msgLog || []).slice().reverse();
  let source = 'this device';
  if (typeof Cloud !== 'undefined' && Cloud.session && Cloud.team && isAdmin()) {
    try { rows = await Cloud.readLog(); source = `the ${Cloud.team.name} team (cloud)`; } catch (err) { toast(`Showing this device's log: ${err.message}`, { error: true }); }
  }
  const actionText = { 'deleted for me': 'Deleted for themselves', 'deleted for everyone': 'Deleted for everyone', recalled: 'Recalled' };
  const d = showDialog({
    title: 'Message Log',
    wide: true,
    html: `
      <div class="log-scroll"><table class="log-table"><thead><tr><th>When</th><th>Who</th><th>Action</th><th>Task</th><th>Message by</th><th>Message</th></tr></thead><tbody>
      ${rows.map((r) => `<tr><td>${esc(fmtDateTime(r.at))}</td><td>${esc(r.byName || r.by)}</td><td>${esc(actionText[r.action] || r.action)}</td><td>${esc(r.taskTitle || '')}</td><td>${esc(r.authorName || r.author || '')}</td><td>${esc(r.text || '')}${r.files?.length ? ` <small class="muted">(${esc(r.files.join(', '))})</small>` : ''}</td></tr>`).join('') || '<tr><td colspan="6" class="muted">Nothing deleted or recalled yet.</td></tr>'}
      </tbody></table></div>
      <div class="dlg-foot"><button class="btn ghost" type="button" data-act="exportMsgLog">${icon('download', 14)} Export CSV</button><span class="spacer"></span><button class="btn primary" type="button" data-role="no">Close</button></div>`,
  });
  d._rows = rows;
  $('[data-role="no"]', d).onclick = () => d.close();
}

// ---------- Message actions ----------
function msgOf(id) {
  const t = openTaskObj();
  return t && t.comments.find((c) => c.id === id);
}
function msgMenu(anchor, id) {
  const t = openTaskObj();
  const c = msgOf(id);
  if (!c || c.deleted || isRecalled(c)) return;
  const items = [
    { label: 'Reply', icon: 'reply', run: () => { ui.draft.replyTo = c.id; ui.focus = 'comment'; renderTask(); } },
    { label: 'Forward', icon: 'fwd', run: () => forwardDlg(c) },
    { label: 'Copy', icon: 'copy', run: () => copyMessage(c) },
  ];
  if (canRecall(c)) {
    const left = Math.max(0, Math.ceil((RECALL_MS - (Date.now() - c.at)) / 60000));
    items.push({ label: c.author === S.meId && !isAdmin() ? `Recall (${left} min left)` : 'Recall', icon: 'recall', run: () => recallMessage(t, c) });
  }
  if (canSelect(c)) items.push('-', { label: 'Delete…', icon: 'trash', danger: true, run: () => { ui.chatSelect = new Set([c.id]); renderTask(); } });
  openMenu(anchor, items);
}
async function copyMessage(c) {
  const text = [c.text, ...(c.files || []).map((f) => (f.kind === 'link' ? f.url : f.kind === 'contact' ? `${f.name} ${f.email || ''}`.trim() : f.name))].filter(Boolean).join('\n');
  try { await navigator.clipboard.writeText(text); toast('Message copied.'); } catch { toast('Copying is blocked here. Select the text and copy it instead.', { error: true }); }
}
function recallMessage(t, c) {
  if (!canRecall(c)) { toast('Messages can only be recalled within 5 minutes of sending.', { error: true }); return; }
  logMessage(t, c, 'recalled');
  c.recalled = { by: S.meId, at: Date.now() };
  c.text = '';
  c.files = [];
  commit();
  toast('Message recalled. Everyone now sees that it was recalled.');
}
/** Deletes the selected messages: for you only, or (admins) for everyone. */
async function deleteSelected(forEveryone) {
  const t = openTaskObj();
  const picked = t.comments.filter((c) => ui.chatSelect?.has(c.id) && canSelect(c));
  if (!picked.length) return;
  if (forEveryone && !isAdmin()) return;
  const n = picked.length;
  const what = `${n} message${n === 1 ? '' : 's'}`;
  if (!await confirmDlg(forEveryone ? `Delete ${what} for everyone?` : `Delete ${what}?`,
    forEveryone ? 'Everyone on this task will see “This message was deleted”. This is recorded in the message log.' : 'They will disappear from your Planner on all your devices. Others still see them. This is recorded in the message log.',
    'Delete')) return;
  const prefs = chatPrefs();
  for (const c of picked) {
    logMessage(t, c, forEveryone ? 'deleted for everyone' : 'deleted for me');
    if (forEveryone) { c.deleted = true; c.deletedBy = S.meId; c.text = ''; c.files = []; } else prefs.hidden = [...prefs.hidden, c.id];
  }
  ui.chatSelect = null;
  commit();
  toast(`Deleted ${what}${forEveryone ? ' for everyone' : ''}.`);
}
function forwardDlg(c) {
  const from = openTaskObj();
  const tasks = S.tasks.filter((t) => t.id !== from.id && !t.box).sort((a, b) => (b.created || 0) - (a.created || 0));
  const d = showDialog({
    title: 'Forward To',
    html: `<form method="dialog" class="stack" data-submit="forwardMsg">
      <input name="q" placeholder="Search tasks" autocomplete="off" data-focus="fwd-search" aria-label="Search tasks">
      <div class="fwd-list">${tasks.map((t) => `<label class="fwd-row" data-name="${esc((t.title + ' ' + (planById(t.planId)?.name || '')).toLowerCase())}"><input type="radio" name="task" value="${esc(t.id)}" required><span>${esc(t.title || 'Untitled task')}</span><small class="muted">${esc(planById(t.planId)?.name || '')}</small></label>`).join('') || '<p class="muted">No other tasks yet.</p>'}</div>
      <div class="dlg-foot"><button class="btn ghost" type="button" data-role="no">Cancel</button><button class="btn primary">${icon('fwd', 14)} Forward</button></div></form>`,
  });
  d._msg = c;
  $('[data-role="no"]', d).onclick = () => d.close();
  const q = $('[name="q"]', d);
  q.oninput = () => { const v = q.value.trim().toLowerCase(); $$('.fwd-row', d).forEach((r) => { r.hidden = !!v && !r.dataset.name.includes(v); }); };
  q.focus();
}
function forwardMessage(form, data) {
  const d = form.closest('dialog');
  const c = d._msg;
  const target = taskById(data.get('task'));
  if (!target || !c) return;
  target.comments.push({ id: uid(), author: S.meId, text: c.text || '', at: Date.now(), fwd: true, ...(c.files?.length ? { files: clone(c.files) } : {}) });
  d.close();
  commit();
  toast(`Forwarded to “${target.title || 'Untitled task'}”.`);
}

// ---------- + menu ----------
function plusMenuHTML() {
  const tile = (act, ic, label, color) => `<button class="plus-tile" data-act="${act}" style="--tc:${color}"><span>${icon(ic, 26)}</span><b>${label}</b></button>`;
  return `<div class="plus-grid">
    ${tile('chatAttach', 'doc', 'Attach', '#4f8fd6')}${tile('chatPhotos', 'image', 'Photos', '#5b8fe0')}${tile('chatCamera', 'camera', 'Camera', '#d9d4c7')}
    ${tile('chatLocation', 'pin', 'Location', '#4fbf94')}${tile('chatContact', 'user', 'Contact', '#c9c4b8')}${tile('chatLink', 'link', 'Link', '#d8b45c')}
  </div>`;
}
function pickFiles(accept, capture) {
  const input = document.createElement('input');
  input.type = 'file';
  input.multiple = !capture;
  if (accept) input.accept = accept;
  if (capture) input.setAttribute('capture', 'environment');
  input.onchange = () => { if (input.files.length) stageFiles([...input.files]); };
  input.click();
}
/** Phones open their camera from the file picker; computers get a live preview to take a photo. */
async function takePhoto() {
  closePop();
  if (matchMedia('(pointer: coarse)').matches || !navigator.mediaDevices?.getUserMedia) { pickFiles('image/*', true); return; }
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia({ video: true }); } catch { toast('The camera is not available. Choose a photo instead.', { error: true }); pickFiles('image/*'); return; }
  const d = showDialog({
    title: 'Camera',
    html: `<div class="stack"><video class="cam-view" autoplay playsinline muted></video>
      <div class="dlg-foot"><button class="btn ghost" type="button" data-role="no">Cancel</button><button class="btn primary" type="button" data-role="snap">${icon('camera', 15)} Take photo</button></div></div>`,
    onClose: () => stream.getTracks().forEach((tr) => tr.stop()),
  });
  const video = $('video', d);
  video.srcObject = stream;
  $('[data-role="no"]', d).onclick = () => d.close();
  $('[data-role="snap"]', d).onclick = () => {
    const cv = document.createElement('canvas');
    cv.width = video.videoWidth || 1280;
    cv.height = video.videoHeight || 720;
    cv.getContext('2d').drawImage(video, 0, 0, cv.width, cv.height);
    cv.toBlob((blob) => {
      d.close();
      if (blob) stageFiles([new File([blob], `Photo ${new Date().toLocaleString().replace(/[/:]/g, '-')}.jpg`, { type: 'image/jpeg' })]);
    }, 'image/jpeg', 0.88);
  };
}
function shareLocation() {
  closePop();
  if (!navigator.geolocation) { toast('Location is not available on this device.', { error: true }); return; }
  toast('Finding your location…');
  navigator.geolocation.getCurrentPosition((pos) => {
    const { latitude: lat, longitude: lng } = pos.coords;
    const url = `https://maps.google.com/?q=${lat.toFixed(6)},${lng.toFixed(6)}`;
    ui.draft.links = [...(ui.draft.links || []), { url, name: 'My location', kind: 'location' }];
    renderTask();
  }, (err) => toast(err.code === 1 ? 'Location permission was declined.' : 'Could not find your location.', { error: true }), { enableHighAccuracy: true, timeout: 15000 });
}
function contactPickerHTML() {
  const q = (ui.contactQuery || '').trim().toLowerCase();
  const people = S.people.filter((p) => !q || p.name.toLowerCase().includes(q) || (p.email || '').includes(q));
  return `<div class="picker"><h4>Share a Contact</h4>
    <input placeholder="Search people" value="${esc(ui.contactQuery || '')}" data-input="contactSearch" data-focus="contact-search" autocomplete="off" aria-label="Search people">
    <div class="picker-scroll">${people.map((p) => `<button class="person-row" data-act="pickContact" data-id="${esc(p.id)}">${avatar(p, 24)}<span>${esc(p.name)}</span><small class="muted">${esc(p.email || '')}</small></button>`).join('') || '<p class="muted small">No match.</p>'}</div></div>`;
}

// ---------- Translation ----------
/* Uses Google Translate's public web endpoint (no key needed). Message text is sent to Google only
   when it isn't already in your language, and only while you're online. Results are cached on
   this device. */
const Translate = {
  cache: (() => { try { return JSON.parse(localStorage.getItem(lsKey('planner-tr')) || '{}'); } catch { return {}; } })(),
  pending: new Set(),
  failed: new Set(),
  timer: null,
  key: (c, lang) => `${c.id}|${lang}`,
  get(c) { return this.cache[this.key(c, chatPrefs().lang)]; },
  save() {
    const keys = Object.keys(this.cache);
    if (keys.length > 3000) keys.slice(0, keys.length - 3000).forEach((k) => delete this.cache[k]);
    try { localStorage.setItem(lsKey('planner-tr'), JSON.stringify(this.cache)); } catch { /* storage full or blocked: keep in memory */ }
  },
  want(c) {
    const p = chatPrefs();
    if (!p.translate || !navigator.onLine || !c.text || c.author === S.meId) return;
    const k = this.key(c, p.lang);
    if (k in this.cache || this.pending.has(k) || this.failed.has(k)) return;
    this.pending.add(k);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.run(), 60);
  },
  async run() {
    const lang = chatPrefs().lang;
    const t = openTaskObj();
    const jobs = [...this.pending].filter((k) => k.endsWith(`|${lang}`)).slice(0, 12);
    this.pending.clear();
    let changed = false;
    for (const k of jobs) {
      const c = t?.comments.find((x) => x.id === k.split('|')[0]);
      if (!c || !c.text) continue;
      try {
        const res = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${encodeURIComponent(lang)}&dt=t`, {
          method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' }, body: `q=${encodeURIComponent(c.text)}`,
        });
        if (!res.ok) throw new Error(String(res.status));
        const j = await res.json();
        const src = String(j[2] || '');
        const text = (j[0] || []).map((s) => s?.[0] || '').join('');
        const same = !src || src.split('-')[0] === lang.split('-')[0] && (src.split('-')[0] !== 'zh' || src === lang);
        this.cache[k] = same || !text || text.trim() === c.text.trim() ? { same: true } : { src, text };
        changed = true;
      } catch { this.failed.add(k); }
    }
    if (changed) { this.save(); if (ui.openTask) renderTask(); }
  },
};
/** The bubble text: translated when needed, with a note saying so. */
function msgTextHTML(c) {
  if (!c.text) return '';
  const tr = c.author !== S.meId && chatPrefs().translate ? Translate.get(c) : null;
  if (!tr && c.author !== S.meId) Translate.want(c);
  if (tr && !tr.same) {
    const showing = ui.showOriginal?.has(c.id);
    return `<p class="msg-text">${esc(showing ? c.text : tr.text)}</p>
      <small class="msg-tr">${icon('globe', 11)} ${showing ? 'Original' : `Translated from ${esc(langName(tr.src))}`} · <button class="link-btn" data-act="toggleOriginal" data-id="${esc(c.id)}">${showing ? 'Show translation' : 'Show original'}</button></small>`;
  }
  return `<p class="msg-text">${esc(c.text)}</p>`;
}
function chatSettingsHTML() {
  const p = chatPrefs();
  return `<div class="task-fields two">
      <label class="field"><span>Default Language</span><select data-change="chatLang">${LANGUAGES.map(([c, n]) => `<option value="${c}" ${c === p.lang ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></label>
    </div>
    <label class="mini"><input type="checkbox" data-change="chatTranslate" ${p.translate ? 'checked' : ''}> Translate automatically (Google Translate)</label>
    
    ${isAdmin() ? `<div class="row"><button class="btn ghost sm" data-act="openMsgLog">${icon('list', 14)} Message log</button></div>` : ''}`;
}
