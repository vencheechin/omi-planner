'use strict';
/* Reminder sound: what plays when a task reminder goes off. Chosen in Settings › Sounds.
   Any of the Task complete sounds or Time's up ringtones can be used. */

const remSndPrefs = () => ({ on: true, tone: 'chime', vol: 0.6, ...(S.settings.remSound || {}) });
const setRemSnd = (patch) => { S.settings.remSound = { ...remSndPrefs(), ...patch }; Store.save(); };
function playAnySound(id, vol) {
  if (DONE_FX[id]) return playDoneSound(id, vol);
  if (TONES[id]) return playTone(id, vol);
  return playDoneSound('chime', vol);
}
function playReminderSound() { const p = remSndPrefs(); if (p.on) playAnySound(p.tone, p.vol); }

function remSoundHTML() {
  const pr = remSndPrefs();
  const genres = [...DONE_SOUNDS, ...ALARM_TONES.map((g) => ({ genre: `Ringtone · ${g.genre}`, tones: g.tones }))];
  return `<div class="picker alarm-picker">
    <label class="mini"><input type="checkbox" data-change="remSndOn" ${pr.on ? 'checked' : ''}> Play a sound when a reminder goes off</label>
    <label class="mini alarm-vol">Volume <input type="range" min="0" max="1" step="0.1" value="${pr.vol}" data-change="remSndVol" aria-label="Volume"></label>
    ${genres.map((g) => `<div class="alarm-genre"><b>${esc(g.genre)}</b>${g.tones.map(([v, label]) => `<div class="alarm-tone ${pr.tone === v ? 'on' : ''}">
      <button class="alarm-play icon-btn" data-act="remSndPreview" data-v="${v}" aria-label="Play ${esc(label)}" title="Play">▶</button>
      <button class="alarm-pick" data-act="remSndPick" data-v="${v}" aria-pressed="${pr.tone === v}"><span>${esc(label)}</span>${pr.tone === v ? icon('check', 14) : ''}</button></div>`).join('')}</div>`).join('')}
  </div>`;
}
Object.assign(actions, {
  remSndPreview: (el) => playAnySound(el.dataset.v, remSndPrefs().vol),
  remSndPick: (el) => { setRemSnd({ tone: el.dataset.v }); playAnySound(el.dataset.v, remSndPrefs().vol); refreshSettings(); },
});
Object.assign(changes, {
  remSndOn: (el) => { setRemSnd({ on: el.checked }); refreshSettings(); },
  remSndVol: (el) => { setRemSnd({ vol: Number(el.value) }); playAnySound(remSndPrefs().tone, Number(el.value)); },
});
