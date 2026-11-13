/* Time's up: when a time box ends, Planner plays your chosen ringtone and shows a notice (with +5 min).
   Ringtones are made in the browser with the Web Audio API, so there's nothing to download.
   Alerts sound while Planner is open; phones may keep it quiet in the background or on silent. */

const ALARM_TONES = [
  { genre: 'Zen', tones: [['zen-bowl', 'Singing bowl'], ['zen-chimes', 'Wind chimes'], ['zen-gong', 'Temple gong']] },
  { genre: 'Energetic', tones: [['en-rise', 'Rising arpeggio'], ['en-pulse', 'Electro pulse'], ['en-fanfare', 'Fanfare']] },
  { genre: 'Rock', tones: [['rock-riff', 'Power riff'], ['rock-drums', 'Drum fill'], ['rock-arena', 'Arena chord']] },
  { genre: 'Classic', tones: [['cl-dingdong', 'Ding dong'], ['cl-beep', 'Beep beep'], ['cl-marimba', 'Marimba']] },
  { genre: 'Funk & Retro Pop', tones: [['funk-groove', 'Slap bass groove'], ['funk-horns', 'Horn stabs'], ['funk-disco', 'Disco strut']] },
  { genre: 'Nature', tones: [['na-birds', 'Morning birds'], ['na-drops', 'Water drops']] },
];
const alarmPrefs = () => ({ on: true, tone: 'zen-bowl', vol: 0.7, ...(TB().alarm || {}) });
const toneName = (id) => { for (const g of ALARM_TONES) { const t = g.tones.find(([v]) => v === id); if (t) return `${g.genre} · ${t[1]}`; } return 'Zen · Singing bowl'; };

let audioCtx = null;
/** Phones only allow sound after a tap, so the audio is unlocked on the first one. */
function audio() {
  if (!audioCtx) { const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null; audioCtx = new AC(); }
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}
document.addEventListener('pointerdown', () => { if (!audioCtx || audioCtx.state === 'suspended') audio(); }, { passive: true });

/** One note: an oscillator with a quick attack and a decay, into the master volume. */
function note(ctx, out, { f, t = 0, d = 0.6, type = 'sine', g = 0.3, a = 0.01, bend }) {
  const o = ctx.createOscillator();
  const v = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, ctx.currentTime + t);
  if (bend) o.frequency.exponentialRampToValueAtTime(bend, ctx.currentTime + t + d);
  v.gain.setValueAtTime(0.0001, ctx.currentTime + t);
  v.gain.exponentialRampToValueAtTime(g, ctx.currentTime + t + a);
  v.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + d);
  o.connect(v).connect(out);
  o.start(ctx.currentTime + t);
  o.stop(ctx.currentTime + t + d + 0.05);
}
/** A burst of filtered noise: drums, gong shimmer, water. */
function noise(ctx, out, { t = 0, d = 0.2, g = 0.3, freq = 1500, q = 1, type = 'bandpass' }) {
  const len = Math.max(1, Math.floor(ctx.sampleRate * d));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const fl = ctx.createBiquadFilter();
  fl.type = type; fl.frequency.value = freq; fl.Q.value = q;
  const v = ctx.createGain();
  v.gain.value = g;
  src.connect(fl).connect(v).connect(out);
  src.start(ctx.currentTime + t);
}
/** Distortion for the rock tones. */
function drive(ctx, out, amount = 40) {
  const ws = ctx.createWaveShaper();
  const n = 1024;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) { const x = (i * 2) / n - 1; curve[i] = ((3 + amount) * x * 20 * (Math.PI / 180)) / (Math.PI + amount * Math.abs(x)); }
  ws.curve = curve;
  ws.connect(out);
  return ws;
}
const kick = (ctx, out, t) => note(ctx, out, { f: 140, bend: 45, t, d: 0.35, g: 0.9, a: 0.003 });
const snare = (ctx, out, t) => noise(ctx, out, { t, d: 0.18, g: 0.5, freq: 1800, q: 0.7 });

const TONES = {
  'zen-bowl': (c, o) => [0, 1.8].forEach((t) => { note(c, o, { f: 220, t, d: 3.6, g: 0.35, a: 0.02 }); note(c, o, { f: 220 * 2.76, t, d: 2.6, g: 0.12, a: 0.02 }); note(c, o, { f: 220 * 5.4, t, d: 1.6, g: 0.05, a: 0.02 }); }),
  'zen-chimes': (c, o) => [880, 1046.5, 1318.5, 987.8, 1174.7, 1568].forEach((f, i) => note(c, o, { f, t: i * 0.32 + Math.random() * 0.1, d: 2.2, g: 0.16, a: 0.005 })),
  'zen-gong': (c, o) => { note(c, o, { f: 98, t: 0, d: 4.5, g: 0.5, a: 0.03 }); note(c, o, { f: 147, t: 0, d: 3.5, g: 0.2, a: 0.05 }); noise(c, o, { t: 0, d: 2.5, g: 0.12, freq: 900, q: 3 }); },
  'en-rise': (c, o) => [523.3, 659.3, 784, 1046.5, 784, 1046.5, 1318.5, 1568].forEach((f, i) => note(c, o, { f, t: i * 0.11, d: 0.22, type: 'triangle', g: 0.3 })),
  'en-pulse': (c, o) => { for (let i = 0; i < 8; i++) note(c, o, { f: i % 2 ? 880 : 1320, t: i * 0.14, d: 0.12, type: 'square', g: 0.12 }); kick(c, o, 0); kick(c, o, 0.56); },
  'en-fanfare': (c, o) => [[523.3, 0, 0.18], [523.3, 0.2, 0.18], [523.3, 0.4, 0.18], [698.5, 0.6, 0.5], [880, 1.15, 0.25], [1046.5, 1.4, 0.8]].forEach(([f, t, d]) => { note(c, o, { f, t, d, type: 'sawtooth', g: 0.14 }); note(c, o, { f: f / 2, t, d, type: 'triangle', g: 0.12 }); }),
  'rock-riff': (c, o) => { const amp = drive(c, o, 60); [[82.4, 0], [82.4, 0.25], [98, 0.5], [110, 0.75], [82.4, 1.0], [123.5, 1.25]].forEach(([f, t]) => { note(c, amp, { f, t, d: 0.24, type: 'sawtooth', g: 0.4 }); note(c, amp, { f: f * 1.5, t, d: 0.24, type: 'sawtooth', g: 0.3 }); }); [0, 0.5, 1.0].forEach((t) => kick(c, o, t)); [0.25, 0.75, 1.25].forEach((t) => snare(c, o, t)); },
  'rock-drums': (c, o) => { [0, 0.3, 0.6, 0.9].forEach((t) => kick(c, o, t)); [0.15, 0.45, 0.75, 1.0, 1.1, 1.2, 1.3].forEach((t) => snare(c, o, t)); noise(c, o, { t: 1.45, d: 1.2, g: 0.35, freq: 7000, q: 0.5, type: 'highpass' }); kick(c, o, 1.45); },
  'rock-arena': (c, o) => { const amp = drive(c, o, 80); [82.4, 123.5, 164.8, 207.7].forEach((f) => note(c, amp, { f, t: 0, d: 2.4, type: 'sawtooth', g: 0.22, a: 0.01 })); kick(c, o, 0); noise(c, o, { t: 0, d: 1.5, g: 0.3, freq: 6000, q: 0.5, type: 'highpass' }); },
  'cl-dingdong': (c, o) => [[659.3, 0], [523.3, 0.55], [659.3, 1.4], [523.3, 1.95]].forEach(([f, t]) => note(c, o, { f, t, d: 1.2, g: 0.32 })),
  'cl-beep': (c, o) => [0, 0.2, 0.6, 0.8, 1.2, 1.4].forEach((t) => note(c, o, { f: 1000, t, d: 0.14, type: 'square', g: 0.12, a: 0.003 })),
  'cl-marimba': (c, o) => [523.3, 659.3, 784, 659.3, 784, 1046.5].forEach((f, i) => { note(c, o, { f, t: i * 0.18, d: 0.5, g: 0.3, a: 0.002 }); note(c, o, { f: f * 4, t: i * 0.18, d: 0.08, g: 0.05, a: 0.002 }); }),
  'na-birds': (c, o) => { for (let i = 0; i < 7; i++) { const f = 2400 + Math.random() * 1400; note(c, o, { f, bend: f * (1.3 + Math.random() * 0.4), t: i * 0.28 + Math.random() * 0.1, d: 0.12, g: 0.12, a: 0.005 }); } },
  // Funk & Retro Pop: original grooves in that style (no real songs).
  'funk-groove': (c, o) => {
    const bass = c.createBiquadFilter(); bass.type = 'lowpass'; bass.frequency.value = 900; bass.Q.value = 6; bass.connect(o);
    [[82.4, 0], [82.4, 0.18], [164.8, 0.27], [98, 0.45], [110, 0.63], [123.5, 0.72], [82.4, 0.9], [164.8, 1.08], [146.8, 1.26]].forEach(([f, t]) => note(c, bass, { f, t, d: 0.14, type: 'sawtooth', g: 0.5, a: 0.003 }));
    [0, 0.45, 0.9].forEach((t) => kick(c, o, t));
    [0.36, 1.26].forEach((t) => noise(c, o, { t, d: 0.12, g: 0.55, freq: 1200, q: 0.8 }));
    for (let i = 0; i < 8; i++) noise(c, o, { t: i * 0.18, d: 0.04, g: 0.18, freq: 8000, q: 0.7, type: 'highpass' });
  },
  'funk-horns': (c, o) => [[0, [392, 493.9, 587.3]], [0.3, [392, 493.9, 587.3]], [0.6, [440, 554.4, 659.3]], [1.05, [523.3, 659.3, 784]], [1.2, [587.3, 740, 880]]].forEach(([t, chord]) => chord.forEach((f) => { note(c, o, { f, t, d: 0.2, type: 'sawtooth', g: 0.11, a: 0.01 }); note(c, o, { f: f * 1.005, t, d: 0.2, type: 'square', g: 0.04, a: 0.01 }); })),
  'funk-disco': (c, o) => {
    for (let i = 0; i < 4; i++) kick(c, o, i * 0.4);
    for (let i = 0; i < 4; i++) noise(c, o, { t: i * 0.4 + 0.2, d: 0.08, g: 0.3, freq: 9000, q: 0.6, type: 'highpass' });
    [[110, 0], [220, 0.2], [110, 0.4], [220, 0.6], [130.8, 0.8], [261.6, 1.0], [146.8, 1.2], [293.7, 1.4]].forEach(([f, t]) => note(c, o, { f, t, d: 0.18, type: 'square', g: 0.14, a: 0.004 }));
    [[659.3, 0.8], [784, 1.0], [880, 1.2], [987.8, 1.4]].forEach(([f, t]) => note(c, o, { f, t, d: 0.35, type: 'triangle', g: 0.16 }));
  },
  'na-drops': (c, o) => { for (let i = 0; i < 6; i++) { const f = 700 + Math.random() * 900; note(c, o, { f, bend: f * 2, t: i * 0.35 + Math.random() * 0.15, d: 0.18, g: 0.28, a: 0.002 }); } },
};
/** Plays a ringtone (your choice, unless one is given) at your volume. */
function playTone(id = alarmPrefs().tone, vol = alarmPrefs().vol) {
  const ctx = audio();
  if (!ctx) return;
  const master = ctx.createGain();
  master.gain.value = Math.max(0, Math.min(1, vol));
  master.connect(ctx.destination);
  (TONES[id] || TONES['zen-bowl'])(ctx, master);
}

/** Checks for time boxes that just ended (today, not ticked off) and sounds the alert once for each. */
function checkAlarms() {
  const pr = alarmPrefs();
  if (!pr.on) return;
  const iso = todayISO();
  const now = nowMin();
  ui.alarmed = ui.alarmed || new Set();
  const first = ui.alarmFrom === undefined;
  if (first) ui.alarmFrom = now; // don't ring for boxes that ended before Planner was opened
  for (const t of scheduledOn(iso)) {
    const real = t._task || t;
    if (isDone(real) || isBox(real)) continue;
    const end = t.slotStart + durOf(t);
    const key = `${t.id}|${iso}|${end}`;
    if (end > now || end <= ui.alarmFrom || ui.alarmed.has(key)) continue;
    ui.alarmed.add(key);
    playTone();
    toast(`Time’s up: ${real.title || 'Untitled task'} (${fmtTime(t.slotStart)} – ${fmtTime(end)})`, { action: { label: '+5 min', run: () => extendBox(t) } });
    if ('Notification' in window && Notification.permission === 'granted' && document.hidden) {
      try { new Notification('Time’s up', { body: `${real.title || 'Untitled task'} · ${fmtTime(t.slotStart)} – ${fmtTime(end)}`, tag: key }); } catch { /* not supported */ }
    }
  }
}
/** Five more minutes on the box that just ended. */
function extendBox(t) {
  if (t._sess) { t._sess.dur += 5; commit(); } else { const real = taskById(t.id); scheduleTask(real, real.slotDate, real.slotStart, durOf(real) + 5); }
  toast('5 more minutes.');
}

/** The ringtone picker: on/off, volume, and every tone by genre with a play button. */
function alarmPickerHTML() {
  const pr = alarmPrefs();
  return `<div class="picker alarm-picker">
    <h4>Alert when a time box ends</h4>
    <label class="mini"><input type="checkbox" data-change="alarmOn" ${pr.on ? 'checked' : ''}> Play a ringtone when time is up</label>
    <label class="mini alarm-vol">Volume <input type="range" min="0" max="1" step="0.1" value="${pr.vol}" data-change="alarmVol" aria-label="Volume"></label>
    ${ALARM_TONES.map((g) => `<div class="alarm-genre"><b>${esc(g.genre)}</b>${g.tones.map(([v, label]) => `<div class="alarm-tone ${pr.tone === v ? 'on' : ''}">
      <button class="alarm-play icon-btn" data-act="alarmPreview" data-v="${v}" aria-label="Play ${esc(label)}" title="Play">▶</button>
      <button class="alarm-pick" data-act="alarmPick" data-v="${v}" aria-pressed="${pr.tone === v}"><span>${esc(label)}</span>${pr.tone === v ? icon('check', 14) : ''}</button></div>`).join('')}</div>`).join('')}
    <p class="small muted">Sounds while Planner is open. On a phone, keep the ringer on.</p>
  </div>`;
}
const setAlarm = (patch) => { TB().alarm = { ...alarmPrefs(), ...patch }; commit(); };

Object.assign(actions, {
  alarmMenu: (el) => openPop(el, alarmPickerHTML),
  alarmPreview: (el) => playTone(el.dataset.v),
  alarmPick: (el) => { setAlarm({ tone: el.dataset.v }); playTone(el.dataset.v); refreshPop(); refreshSettings(); },
});
Object.assign(changes, {
  alarmOn: (el) => { setAlarm({ on: el.checked }); refreshPop(); refreshSettings(); },
  alarmVol: (el) => { setAlarm({ vol: Number(el.value) }); playTone(alarmPrefs().tone, Number(el.value)); },
});
setInterval(checkAlarms, 15000);
setTimeout(checkAlarms, 3000);
