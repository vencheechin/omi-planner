'use strict';
/* Your own sound, for the Time's up alert and the Task complete sound.
   Two ways in: choose an audio file on this device (kept on this device only, in IndexedDB),
   or paste a link to an audio file (Dropbox and Google Drive share links are converted to direct links).
   Played through Web Audio when it can be decoded (works after the first tap on phones), otherwise
   with a plain <audio> element. If the sound can't be found or loaded, the usual tone plays instead. */

const OWN_LIMIT = { alarm: 30, done: 6 }; // seconds played at most
const OWN_MAX_MB = 8;
const ownPrefs = (kind) => (kind === 'alarm' ? alarmPrefs() : doneSndPrefs());
const ownOf = (kind) => ownPrefs(kind).own || null;
const setOwnPrefs = (kind, patch) => { if (kind === 'alarm') setAlarm(patch); else setDoneSnd(patch); };

// ---------- Storage of chosen files (this device only) ----------
let ownDb = null;
function ownStore(mode) {
  ownDb = ownDb || new Promise((res, rej) => {
    const r = indexedDB.open('planner-sounds', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('files');
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  return ownDb.then((db) => db.transaction('files', mode).objectStore('files'));
}
const ownReq = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const ownPut = (kind, blob) => ownStore('readwrite').then((s) => ownReq(s.put(blob, kind)));
const ownGet = (kind) => ownStore('readonly').then((s) => ownReq(s.get(kind))).catch(() => null);
const ownDel = (kind) => ownStore('readwrite').then((s) => ownReq(s.delete(kind))).catch(() => null);

/** Share links that aren't the file itself, turned into direct links where the service allows it. */
function ownDirectLink(raw) {
  let u;
  try { u = new URL(String(raw).trim()); } catch { return { error: 'That isn’t a web link. It should start with https://' }; }
  const h = u.hostname.replace(/^www\./, '');
  if (/(youtube\.com|youtu\.be|spotify\.com|music\.apple\.com|soundcloud\.com|tiktok\.com|instagram\.com)$/.test(h)) {
    return { error: 'Links to YouTube, Spotify, SoundCloud and similar pages can’t be played. Download the sound as an MP3 and choose it as a file, or use a direct link to an .mp3 file.' };
  }
  if (h.endsWith('dropbox.com')) { u.searchParams.delete('dl'); u.searchParams.set('raw', '1'); return { url: u.href }; }
  const gd = u.href.match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?.*id=)([\w-]+)/);
  if (gd) return { url: `https://drive.google.com/uc?export=download&id=${gd[1]}` };
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return { error: 'Use a link that starts with https://' };
  return { url: u.href };
}

// ---------- Playing ----------
const ownBuf = {}; // kind -> { key, buf } decoded audio, so it plays instantly next time
async function ownSource(kind) {
  const own = ownOf(kind);
  if (!own) return null;
  if (own.type === 'file') { const blob = await ownGet(kind); return blob ? { key: `file:${own.name}:${blob.size}`, blob } : null; }
  return own.url ? { key: `link:${own.url}`, url: own.url } : null;
}
let ownEl = null;
/** Plays your own sound; returns false when there is none to play (so the usual tone plays). */
async function playOwn(kind, vol) {
  const src = await ownSource(kind);
  if (!src) return false;
  const v = Math.max(0, Math.min(1, vol));
  const ctx = audio();
  try {
    if (!ctx) throw new Error('no web audio');
    if (ownBuf[kind]?.key !== src.key) {
      const data = src.blob ? await src.blob.arrayBuffer() : await (await fetch(src.url)).arrayBuffer();
      ownBuf[kind] = { key: src.key, buf: await ctx.decodeAudioData(data) };
    }
    const node = ctx.createBufferSource();
    node.buffer = ownBuf[kind].buf;
    const g = ctx.createGain();
    const at = ctx.currentTime;
    const len = Math.min(node.buffer.duration, OWN_LIMIT[kind]);
    g.gain.setValueAtTime(v, at);
    if (node.buffer.duration > OWN_LIMIT[kind]) g.gain.setValueAtTime(v, at + len - 0.4), g.gain.linearRampToValueAtTime(0.0001, at + len);
    node.connect(g).connect(ctx.destination);
    node.start(at);
    node.stop(at + len + 0.05);
    return true;
  } catch {
    // A link that can't be read by the page (no CORS) can still often play in an <audio> element.
    try {
      if (ownEl) ownEl.pause();
      ownEl = new Audio(src.blob ? URL.createObjectURL(src.blob) : src.url);
      ownEl.volume = v;
      await ownEl.play();
      const el = ownEl;
      setTimeout(() => el.pause(), OWN_LIMIT[kind] * 1000);
      return true;
    } catch { return false; }
  }
}

// Route 'own' through both players; anything else plays as before.
const ownOrigTone = playTone;
playTone = function (id = alarmPrefs().tone, vol = alarmPrefs().vol) {
  if (id !== 'own') return ownOrigTone(id, vol);
  playOwn('alarm', vol).then((ok) => { if (!ok) ownOrigTone('zen-bowl', vol); });
};
const ownOrigDone = playDoneSound;
playDoneSound = function (id = doneSndPrefs().tone, vol = doneSndPrefs().vol) {
  if (id !== 'own') return ownOrigDone(id, vol);
  playOwn('done', vol).then((ok) => { if (!ok) ownOrigDone('ding', vol); });
};

// ---------- Picker ----------
function ownSoundHTML(kind) {
  const pr = ownPrefs(kind);
  const own = pr.own;
  const on = pr.tone === 'own';
  return `<div class="alarm-genre own-sound"><b>Your own sound</b>
    ${own ? `<div class="alarm-tone ${on ? 'on' : ''}">
      <button class="alarm-play icon-btn" data-act="ownPlay" data-kind="${kind}" aria-label="Play your sound" title="Play">▶</button>
      <button class="alarm-pick" data-act="ownUse" data-kind="${kind}" aria-pressed="${on}"><span>${esc(own.name)} <small class="muted">${own.type === 'file' ? 'file on this device' : 'link'}</small></span>${on ? icon('check', 14) : ''}</button>
      <button class="icon-btn" data-act="ownRemove" data-kind="${kind}" aria-label="Remove your sound" title="Remove">${icon('close', 13)}</button></div>` : ''}
    <div class="row own-btns"><button class="btn ghost xs" data-act="ownFile" data-kind="${kind}">${icon('upload', 12)} Choose a sound file…</button><button class="btn ghost xs" data-act="ownLink" data-kind="${kind}">${icon('link', 12)} Use a link…</button></div>
    <p class="small muted">A file: MP3, M4A or WAV up to ${OWN_MAX_MB} MB, kept on this device. A link: a direct link to a sound file, or a Dropbox or Google Drive share link (set to “anyone with the link”). YouTube and Spotify links can’t be played. ${kind === 'alarm' ? 'Plays up to 30 seconds.' : 'Plays the first 6 seconds.'}</p>
  </div>`;
}
// The "Your own sound" picker is hidden for now (Spotify / Instagram music can't be used anyway).
// A sound someone already chose keeps playing; picking any listed sound replaces it.
const OWN_PICKER = false;
const ownOrigAlarmHTML = alarmPickerHTML;
alarmPickerHTML = function () {
  const html = ownOrigAlarmHTML();
  if (!OWN_PICKER) return html;
  const at = html.lastIndexOf('<p class="small muted">');
  return at < 0 ? html : html.slice(0, at) + ownSoundHTML('alarm') + html.slice(at);
};
const ownOrigDoneHTML = doneSoundHTML;
doneSoundHTML = function () {
  const html = ownOrigDoneHTML();
  if (!OWN_PICKER) return html;
  const at = html.lastIndexOf('</div>');
  return html.slice(0, at) + ownSoundHTML('done') + html.slice(at);
};
const ownRefresh = () => { try { refreshPop(); } catch { /* no picker open */ } refreshSettings(); };

Object.assign(actions, {
  ownFile: (el) => {
    const kind = el.dataset.kind;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'audio/*,.mp3,.m4a,.wav,.aac,.ogg';
    input.onchange = async () => {
      const f = input.files[0];
      if (!f) return;
      if (f.size > OWN_MAX_MB * 1048576) { toast(`That file is ${Math.round(f.size / 1048576)} MB. Choose one under ${OWN_MAX_MB} MB.`, { error: true }); return; }
      try { await ownPut(kind, f); } catch { toast('Couldn’t keep that file on this device.', { error: true }); return; }
      delete ownBuf[kind];
      setOwnPrefs(kind, { tone: 'own', own: { type: 'file', name: f.name.replace(/\.[^.]+$/, '').slice(0, 60) || 'My sound' } });
      const ok = await playOwn(kind, ownPrefs(kind).vol);
      toast(ok ? 'Your sound is set.' : 'Saved, but this file couldn’t be played here. Try an MP3.', ok ? {} : { error: true });
      ownRefresh();
    };
    input.click();
  },
  ownLink: async (el) => {
    const kind = el.dataset.kind;
    const v = await promptDlg('Use a sound from a link', 'Link to a sound file (MP3, M4A, WAV), Dropbox or Google Drive', ownOf(kind)?.type === 'link' ? ownOf(kind).src || '' : '', 'Use');
    if (!v) return;
    const r = ownDirectLink(v);
    if (r.error) { toast(r.error, { error: true }); return; }
    const name = (() => { try { return decodeURIComponent(new URL(v).pathname.split('/').pop() || '').replace(/\.[^.]+$/, '').slice(0, 60); } catch { return ''; } })() || 'Sound from link';
    delete ownBuf[kind];
    setOwnPrefs(kind, { tone: 'own', own: { type: 'link', name, url: r.url, src: String(v).trim() } });
    await ownDel(kind);
    const ok = await playOwn(kind, ownPrefs(kind).vol);
    toast(ok ? 'Your sound is set.' : 'Saved, but that link didn’t play. Check it opens the sound itself and is shared with anyone.', ok ? {} : { error: true });
    ownRefresh();
  },
  ownPlay: (el) => { playOwn(el.dataset.kind, ownPrefs(el.dataset.kind).vol).then((ok) => { if (!ok) toast('That sound couldn’t be played.', { error: true }); }); },
  ownUse: (el) => { setOwnPrefs(el.dataset.kind, { tone: 'own' }); playOwn(el.dataset.kind, ownPrefs(el.dataset.kind).vol); ownRefresh(); },
  ownRemove: async (el) => {
    const kind = el.dataset.kind;
    await ownDel(kind);
    delete ownBuf[kind];
    const pr = ownPrefs(kind);
    setOwnPrefs(kind, { own: null, ...(pr.tone === 'own' ? { tone: kind === 'alarm' ? 'zen-bowl' : 'ding' } : {}) });
    toast('Your sound is removed.');
    ownRefresh();
  },
});
