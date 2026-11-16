'use strict';
/* Task complete sound: a short sound when you tick a task off. Made with the Web Audio API in
   alarm.js (note, noise, audio), so there's nothing to download. Chosen in Settings › Sounds. */

const DONE_SOUNDS = [
  { genre: 'Zen', tones: [['tibetan', 'Tibetan singing bowl'], ['bowl', 'Soft bowl'], ['windchime', 'Wind chime'], ['zengarden', 'Zen garden']] },
  { genre: 'Nature', tones: [['wind', 'Wind'], ['wave', 'Wave']] },
  { genre: 'Classic', tones: [['ding', 'Ding'], ['chime', 'Double chime'], ['marimba', 'Marimba']] },
  { genre: 'Young', tones: [['cool', 'Cool'], ['rock', 'Rock'], ['hardrock', 'Hard rock'], ['jet', 'Jet fighter pass']] },
  { genre: 'Fun', tones: [['coin', 'Coin'], ['tada', 'Ta-da'], ['retro-up', '8-bit power-up'], ['retro-clear', '8-bit level clear'], ['retro-jump', '8-bit jump'], ['retro-stage', '8-bit stage clear fanfare'], ['retro-item', '8-bit item pops out']] },
];
/** Filtered noise that swells in and fades out, with the filter sweeping: wind and waves. */
function swell(c, o, { t = 0, d = 1.5, g = 0.4, from = 400, to = 1200, q = 1, type = 'bandpass', peak = 0.4 }) {
  const len = Math.floor(c.sampleRate * d);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource(); src.buffer = buf;
  const fl = c.createBiquadFilter(); fl.type = type; fl.Q.value = q;
  const at = c.currentTime + t;
  fl.frequency.setValueAtTime(from, at); fl.frequency.exponentialRampToValueAtTime(to, at + d * peak); fl.frequency.exponentialRampToValueAtTime(from, at + d);
  const v = c.createGain();
  v.gain.setValueAtTime(0.0001, at); v.gain.exponentialRampToValueAtTime(g, at + d * peak); v.gain.exponentialRampToValueAtTime(0.0001, at + d);
  src.connect(fl).connect(v).connect(o);
  src.start(at); src.stop(at + d + 0.05);
}
const DONE_FX = {
  ding: (c, o) => { note(c, o, { f: 1318.5, d: 0.9, g: 0.35, a: 0.003 }); note(c, o, { f: 2637, d: 0.4, g: 0.06, a: 0.003 }); },
  chime: (c, o) => [[1046.5, 0], [1568, 0.12]].forEach(([f, t]) => { note(c, o, { f, t, d: 0.8, g: 0.28, a: 0.003 }); note(c, o, { f: f * 2, t, d: 0.3, g: 0.05, a: 0.003 }); }),
  coin: (c, o) => [[987.8, 0, 0.08], [1318.5, 0.08, 0.45]].forEach(([f, t, d]) => note(c, o, { f, t, d, type: 'square', g: 0.12, a: 0.002 })),
  tada: (c, o) => [[523.3, 0, 0.12], [659.3, 0.1, 0.12], [784, 0.2, 0.12], [1046.5, 0.3, 0.7]].forEach(([f, t, d]) => { note(c, o, { f, t, d, type: 'triangle', g: 0.25 }); note(c, o, { f: f / 2, t, d, type: 'sawtooth', g: 0.05 }); }),
  marimba: (c, o) => [[784, 0], [1046.5, 0.12]].forEach(([f, t]) => { note(c, o, { f, t, d: 0.45, g: 0.32, a: 0.002 }); note(c, o, { f: f * 4, t, d: 0.06, g: 0.05, a: 0.002 }); }),
  bowl: (c, o) => { note(c, o, { f: 440, d: 1.6, g: 0.25, a: 0.01 }); note(c, o, { f: 440 * 2.76, d: 1.0, g: 0.06, a: 0.01 }); },
  // Wind chime: a few bright metal tubes, each with its own inharmonic ring.
  windchime: (c, o) => [1760, 2093, 2349.3, 2637, 3136].sort(() => Math.random() - 0.5).slice(0, 4).forEach((f, i) => { const t = i * 0.16 + Math.random() * 0.08; note(c, o, { f, t, d: 1.8, g: 0.12, a: 0.002 }); note(c, o, { f: f * 2.76, t, d: 0.5, g: 0.03, a: 0.002 }); }),
  // Tibetan singing bowl: a low strike with its overtones, two near-equal tones beating slowly.
  tibetan: (c, o) => { note(c, o, { f: 196, d: 3.2, g: 0.3, a: 0.01 }); note(c, o, { f: 197.6, d: 3.2, g: 0.22, a: 0.02 }); note(c, o, { f: 196 * 2.71, d: 2.4, g: 0.1, a: 0.01 }); note(c, o, { f: 196 * 5.15, d: 1.4, g: 0.04, a: 0.01 }); noise(c, o, { d: 0.05, g: 0.08, freq: 1500, q: 2 }); },
  // Zen garden: a bamboo knock, then water dripping into a stone basin.
  zengarden: (c, o) => { note(c, o, { f: 560, bend: 480, d: 0.18, type: 'triangle', g: 0.4, a: 0.002 }); noise(c, o, { d: 0.05, g: 0.2, freq: 900, q: 4 }); [0.45, 0.8, 1.1].forEach((t) => { const f = 900 + Math.random() * 500; note(c, o, { f, bend: f * 1.8, t, d: 0.14, g: 0.2, a: 0.002 }); }); },
  wind: (c, o) => { swell(c, o, { d: 1.8, g: 0.45, from: 300, to: 1100, q: 2.5, peak: 0.45 }); swell(c, o, { t: 0.3, d: 1.4, g: 0.15, from: 700, to: 1800, q: 6, peak: 0.5 }); },
  wave: (c, o) => { swell(c, o, { d: 2.2, g: 0.5, from: 250, to: 1600, type: 'lowpass', q: 0.5, peak: 0.4 }); swell(c, o, { t: 0.7, d: 1.4, g: 0.12, from: 2500, to: 5000, type: 'highpass', q: 0.3, peak: 0.2 }); },
  // Young: a cool synth hook, a rock stab, and a heavier distorted hit (original, made here).
  cool: (c, o) => {
    // A laid-back synth hook over a beat, about 2.5 s.
    const hook = [[659.3, 0], [784, 0.2], [987.8, 0.4], [880, 0.6], [784, 0.9], [987.8, 1.1], [1174.7, 1.3], [1318.5, 1.6]];
    hook.forEach(([f, t], i) => { const d = i === hook.length - 1 ? 0.9 : 0.18; note(c, o, { f, t, d, type: 'square', g: 0.06, a: 0.004 }); note(c, o, { f: f * 1.007, t, d, type: 'sawtooth', g: 0.04, a: 0.004 }); });
    [0, 0.4, 0.8, 1.2, 1.6].forEach((t) => kick(c, o, t));
    [0.2, 0.6, 1.0, 1.4].forEach((t) => noise(c, o, { t, d: 0.1, g: 0.25, freq: 1800, q: 0.7 }));
    for (let i = 0; i < 9; i++) noise(c, o, { t: i * 0.2 + 0.1, d: 0.04, g: 0.12, freq: 8000, q: 0.6, type: 'highpass' });
    [[110, 0], [110, 0.4], [146.8, 0.8], [164.8, 1.2], [110, 1.6]].forEach(([f, t]) => note(c, o, { f, t, d: 0.35, type: 'triangle', g: 0.2, a: 0.005 }));
  },
  rock: (c, o) => {
    // A rock riff with drums and a big ringing last chord, about 2.6 s.
    const amp = drive(c, o, 40);
    const riff = [[110, 0, 0.18], [110, 0.2, 0.18], [130.8, 0.4, 0.18], [146.8, 0.6, 0.38], [110, 1.0, 0.18], [164.8, 1.2, 0.18], [146.8, 1.4, 0.18], [110, 1.6, 1.0]];
    riff.forEach(([f, t, d]) => { note(c, amp, { f, t, d, type: 'sawtooth', g: 0.28 }); note(c, amp, { f: f * 1.5, t, d, type: 'sawtooth', g: 0.2 }); });
    [0, 0.4, 0.8, 1.0, 1.2, 1.6].forEach((t) => kick(c, o, t));
    [0.2, 0.6, 1.4].forEach((t) => snare(c, o, t));
    noise(c, o, { t: 1.6, d: 1.0, g: 0.2, freq: 7000, q: 0.5, type: 'highpass' });
  },
  hardrock: (c, o) => {
    // Heavy chugging riff, a drum fill and a crashing final hit, about 2.8 s.
    const amp = drive(c, o, 120);
    const chug = [[82.4, 0], [82.4, 0.12], [82.4, 0.24], [98, 0.36], [82.4, 0.6], [82.4, 0.72], [110, 0.84], [98, 0.96], [82.4, 1.2], [82.4, 1.32], [123.5, 1.44], [110, 1.56]];
    chug.forEach(([f, t]) => { note(c, amp, { f, t, d: 0.1, type: 'sawtooth', g: 0.33 }); note(c, amp, { f: f * 1.5, t, d: 0.1, type: 'sawtooth', g: 0.25 }); note(c, amp, { f: f * 2, t, d: 0.1, type: 'square', g: 0.1 }); });
    chug.forEach(([, t]) => kick(c, o, t));
    [1.7, 1.78, 1.86, 1.94].forEach((t) => snare(c, o, t));
    [[73.4, 2.0]].forEach(([f, t]) => { note(c, amp, { f, t, d: 0.9, type: 'sawtooth', g: 0.35 }); note(c, amp, { f: f * 1.5, t, d: 0.9, type: 'sawtooth', g: 0.28 }); note(c, amp, { f: f * 2, t, d: 0.9, type: 'square', g: 0.12 }); });
    kick(c, o, 2.0); noise(c, o, { t: 2.0, d: 1.0, g: 0.3, freq: 6000, q: 0.4, type: 'highpass' });
  },
  // 8-bit: original chiptune-style blips in the spirit of retro console games (not any game's own sounds).
  'retro-up': (c, o) => [392, 523.3, 659.3, 784, 1046.5, 1318.5, 1568].forEach((f, i) => { note(c, o, { f, t: i * 0.055, d: 0.07, type: 'square', g: 0.1, a: 0.002 }); note(c, o, { f: f * 1.5, t: i * 0.055 + 0.025, d: 0.04, type: 'square', g: 0.04, a: 0.002 }); }),
  'retro-clear': (c, o) => { [[523.3, 0, 0.1], [659.3, 0.12, 0.1], [784, 0.24, 0.1], [1046.5, 0.36, 0.1], [880, 0.5, 0.1], [1046.5, 0.62, 0.45]].forEach(([f, t, d]) => { note(c, o, { f, t, d, type: 'square', g: 0.1, a: 0.002 }); note(c, o, { f: f / 2, t, d, type: 'triangle', g: 0.14, a: 0.002 }); }); },
  'retro-jump': (c, o) => note(c, o, { f: 300, bend: 1100, d: 0.18, type: 'square', g: 0.12, a: 0.002 }),
  // Original 8-bit stage-clear fanfare: a rising run, a held chord and a final flourish.
  'retro-stage': (c, o) => {
    [[392, 0, 0.09], [493.9, 0.1, 0.09], [587.3, 0.2, 0.09], [784, 0.3, 0.09], [987.8, 0.4, 0.09], [1174.7, 0.5, 0.35]].forEach(([f, t, d]) => note(c, o, { f, t, d, type: 'square', g: 0.09, a: 0.002 }));
    [[587.3, 0.9], [740, 0.9], [880, 0.9]].forEach(([f, t]) => note(c, o, { f, t, d: 0.5, type: 'square', g: 0.06, a: 0.003 }));
    [[146.8, 0.9, 0.5], [196, 1.45, 0.2], [220, 1.65, 0.2], [293.7, 1.85, 0.6]].forEach(([f, t, d]) => note(c, o, { f, t, d, type: 'triangle', g: 0.18, a: 0.003 }));
    [[784, 1.45, 0.18], [880, 1.65, 0.18], [1174.7, 1.85, 0.6]].forEach(([f, t, d]) => note(c, o, { f, t, d, type: 'square', g: 0.09, a: 0.002 }));
  },
  // Original 8-bit "item pops out": a quick wobbling climb, like something sprouting from a block.
  'retro-item': (c, o) => {
    for (let i = 0; i < 12; i++) { const f = 300 * Math.pow(2, i / 7) * (i % 2 ? 1.12 : 1); note(c, o, { f, t: i * 0.045, d: 0.05, type: 'square', g: 0.09, a: 0.002 }); }
    note(c, o, { f: 1046.5, t: 0.56, d: 0.25, type: 'triangle', g: 0.15, a: 0.003 });
  },
  // Jet fighter pass: engine roar that swells as it comes over, with the whine dropping in pitch as it passes (Doppler).
  jet: (c, o) => {
    swell(c, o, { d: 2.4, g: 0.55, from: 500, to: 2600, q: 0.7, peak: 0.42 });
    swell(c, o, { d: 2.4, g: 0.35, from: 120, to: 400, type: 'lowpass', q: 0.8, peak: 0.45 });
    const w = c.createOscillator(); const v = c.createGain(); const at = c.currentTime;
    w.type = 'sawtooth';
    w.frequency.setValueAtTime(2400, at); w.frequency.linearRampToValueAtTime(2200, at + 0.95); w.frequency.exponentialRampToValueAtTime(900, at + 1.35); w.frequency.linearRampToValueAtTime(800, at + 2.4);
    v.gain.setValueAtTime(0.0001, at); v.gain.exponentialRampToValueAtTime(0.05, at + 1.0); v.gain.exponentialRampToValueAtTime(0.0001, at + 2.4);
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 3000;
    w.connect(f).connect(v).connect(o); w.start(at); w.stop(at + 2.45);
  },
};
const doneSndPrefs = () => { const p = { on: true, tone: 'ding', vol: 0.6, ...(S.settings.doneSound || {}) }; if (!DONE_FX[p.tone] && p.tone !== 'own') p.tone = 'ding'; return p; };
function playDoneSound(id = doneSndPrefs().tone, vol = doneSndPrefs().vol) {
  const ctx = audio();
  if (!ctx) return;
  const master = ctx.createGain();
  master.gain.value = Math.max(0, Math.min(1, vol));
  master.connect(ctx.destination);
  (DONE_FX[id] || DONE_FX.ding)(ctx, master);
}
const setDoneSnd = (patch) => { S.settings.doneSound = { ...doneSndPrefs(), ...patch }; Store.save(); };

function doneSoundHTML() {
  const pr = doneSndPrefs();
  return `<div class="picker alarm-picker">
    <label class="mini"><input type="checkbox" data-change="doneSndOn" ${pr.on ? 'checked' : ''}> Play a sound when I complete a task</label>
    <label class="mini alarm-vol">Volume <input type="range" min="0" max="1" step="0.1" value="${pr.vol}" data-change="doneSndVol" aria-label="Volume"></label>
    ${DONE_SOUNDS.map((g) => `<div class="alarm-genre"><b>${esc(g.genre)}</b>${g.tones.map(([v, label]) => `<div class="alarm-tone ${pr.tone === v ? 'on' : ''}">
      <button class="alarm-play icon-btn" data-act="doneSndPreview" data-v="${v}" aria-label="Play ${esc(label)}" title="Play">▶</button>
      <button class="alarm-pick" data-act="doneSndPick" data-v="${v}" aria-pressed="${pr.tone === v}"><span>${esc(label)}</span>${pr.tone === v ? icon('check', 14) : ''}</button></div>`).join('')}</div>`).join('')}
  </div>`;
}

// Sound when a task is ticked complete (not when it's unticked).
const doneOrigToggle = actions.toggleDone;
const doneOrigApprove = actions.approveTask;
const doneChime = (id) => { const t = taskById(id); if (t && (isDone(t) || t.review) && doneSndPrefs().on) playDoneSound(); };
Object.assign(actions, {
  toggleDone: (el) => { const r = doneOrigToggle(el); doneChime(el.dataset.id); return r; },
  approveTask: (el) => { const r = doneOrigApprove(el); doneChime(el.dataset.id); return r; },
  doneSndPreview: (el) => playDoneSound(el.dataset.v),
  doneSndPick: (el) => { setDoneSnd({ tone: el.dataset.v }); playDoneSound(el.dataset.v); refreshSettings(); },
});
Object.assign(changes, {
  doneSndOn: (el) => { setDoneSnd({ on: el.checked }); refreshSettings(); },
  doneSndVol: (el) => { setDoneSnd({ vol: Number(el.value) }); playDoneSound(doneSndPrefs().tone, Number(el.value)); },
});
