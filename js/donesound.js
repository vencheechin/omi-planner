'use strict';
/* Task complete sound: a short sound when you tick a task off. Made with the Web Audio API in
   alarm.js (note, noise, audio), so there's nothing to download. Chosen in Settings › Sounds. */

const DONE_SOUNDS = [
  ['ding', 'Ding'], ['chime', 'Double chime'], ['pop', 'Pop'], ['coin', 'Coin'],
  ['tada', 'Ta-da'], ['sparkle', 'Sparkle'], ['marimba', 'Marimba'], ['whoosh', 'Whoosh'], ['bowl', 'Soft bowl'],
];
const DONE_FX = {
  ding: (c, o) => { note(c, o, { f: 1318.5, d: 0.9, g: 0.35, a: 0.003 }); note(c, o, { f: 2637, d: 0.4, g: 0.06, a: 0.003 }); },
  chime: (c, o) => [[1046.5, 0], [1568, 0.12]].forEach(([f, t]) => { note(c, o, { f, t, d: 0.8, g: 0.28, a: 0.003 }); note(c, o, { f: f * 2, t, d: 0.3, g: 0.05, a: 0.003 }); }),
  pop: (c, o) => { note(c, o, { f: 380, bend: 900, d: 0.09, g: 0.5, a: 0.002 }); noise(c, o, { d: 0.04, g: 0.15, freq: 2500, q: 1 }); },
  coin: (c, o) => [[987.8, 0, 0.08], [1318.5, 0.08, 0.45]].forEach(([f, t, d]) => note(c, o, { f, t, d, type: 'square', g: 0.12, a: 0.002 })),
  tada: (c, o) => [[523.3, 0, 0.12], [659.3, 0.1, 0.12], [784, 0.2, 0.12], [1046.5, 0.3, 0.7]].forEach(([f, t, d]) => { note(c, o, { f, t, d, type: 'triangle', g: 0.25 }); note(c, o, { f: f / 2, t, d, type: 'sawtooth', g: 0.05 }); }),
  sparkle: (c, o) => [1568, 2093, 2637, 3136, 2637].forEach((f, i) => note(c, o, { f, t: i * 0.06, d: 0.35, g: 0.12, a: 0.002 })),
  marimba: (c, o) => [[784, 0], [1046.5, 0.12]].forEach(([f, t]) => { note(c, o, { f, t, d: 0.45, g: 0.32, a: 0.002 }); note(c, o, { f: f * 4, t, d: 0.06, g: 0.05, a: 0.002 }); }),
  whoosh: (c, o) => { noise(c, o, { d: 0.35, g: 0.35, freq: 1200, q: 0.8 }); note(c, o, { f: 600, bend: 1400, d: 0.3, g: 0.1 }); },
  bowl: (c, o) => { note(c, o, { f: 440, d: 1.6, g: 0.25, a: 0.01 }); note(c, o, { f: 440 * 2.76, d: 1.0, g: 0.06, a: 0.01 }); },
};
const doneSndPrefs = () => ({ on: true, tone: 'ding', vol: 0.6, ...(S.settings.doneSound || {}) });
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
    <div class="alarm-genre">${DONE_SOUNDS.map(([v, label]) => `<div class="alarm-tone ${pr.tone === v ? 'on' : ''}">
      <button class="alarm-play icon-btn" data-act="doneSndPreview" data-v="${v}" aria-label="Play ${esc(label)}" title="Play">▶</button>
      <button class="alarm-pick" data-act="doneSndPick" data-v="${v}" aria-pressed="${pr.tone === v}"><span>${esc(label)}</span>${pr.tone === v ? icon('check', 14) : ''}</button></div>`).join('')}</div>
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
