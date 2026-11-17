'use strict';
/* iPhone-style time wheels: hour, minute and am/pm columns you scroll (or tap) to pick a time.
   Used by the Calendar's meeting form. The chosen time is kept in a hidden input (HH:MM), so the
   form reads it as before. Moving the start time moves the end time with it: one hour later, or
   the same length as before once the end time has been set by hand. */

const TW_ROW = 34;
const twHHMM = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
const twMin = (v) => { const [h, m] = String(v || '').split(':').map(Number); return Number.isFinite(h) ? h * 60 + (m || 0) : null; };

/** The field: a hidden input plus a button showing the time. */
function wheelTimeHTML(name, min, label) {
  return `<span class="tw-field"><input type="hidden" name="${name}" value="${twHHMM(min)}"><button type="button" class="tw-btn" data-act="twOpen" data-name="${name}" aria-label="${esc(label)}: ${esc(fmtTime(min))}">${esc(fmtTime(min))}</button></span>`;
}
const TW_COLS = [
  ['h', Array.from({ length: 12 }, (_, i) => [i === 0 ? 12 : i, String(i === 0 ? 12 : i)])],
  ['m', Array.from({ length: 12 }, (_, i) => [i * 5, String(i * 5).padStart(2, '0')])],
  ['ap', [[0, 'am'], [1, 'pm']]],
];
function twParts(min) { const h = Math.floor(min / 60); return { h: h % 12 === 0 ? 12 : h % 12, m: Math.round((min % 60) / 5) * 5 % 60, ap: h >= 12 ? 1 : 0 }; }
function twJoin(p) { return ((p.h % 12) + (p.ap ? 12 : 0)) * 60 + p.m; }

function twPickerHTML(label) {
  return `<div class="picker tw-pick"><h4>${esc(label)}</h4>
    <div class="tw-type" aria-label="Or type the time"><input inputmode="numeric" pattern="[0-9]*" maxlength="2" data-tw="h" placeholder="hr" aria-label="Hour"><input inputmode="numeric" pattern="[0-9]*" maxlength="2" data-tw="m" placeholder="min" aria-label="Minutes"><small class="muted">or scroll</small></div>
    <div class="tw-wheels">${TW_COLS.map(([k, items]) => `<div class="tw-col" data-col="${k}">${items.map(([v, t]) => `<div class="tw-item" data-v="${v}">${t}</div>`).join('')}</div>`).join('')}<div class="tw-band" aria-hidden="true"></div></div>
    <div class="row tw-foot"><span class="spacer"></span><button type="button" class="btn primary sm" data-act="twDone">Done</button></div></div>`;
}

function twSet(form, name, min) {
  const input = form.querySelector(`input[name="${name}"]`);
  const btn = form.querySelector(`.tw-btn[data-name="${name}"]`);
  if (!input) return;
  input.value = twHHMM(min);
  if (btn) btn.textContent = fmtTime(min);
}
function twChanged(form, name, min) {
  const before = twMin(form.querySelector(`input[name="${name}"]`)?.value);
  twSet(form, name, min);
  if (name === 'start') {
    // The end follows: an hour after the start, or the same length once you've set the end yourself.
    const end = twMin(form.querySelector('input[name="end"]')?.value);
    const len = form.dataset.endSet && end !== null && before !== null && end > before ? end - before : 60;
    twSet(form, 'end', Math.min(23 * 60 + 55, min + len));
  } else if (name === 'end') form.dataset.endSet = '1';
}

Object.assign(actions, {
  twOpen: (el) => {
    const form = el.closest('form');
    const name = el.dataset.name;
    const pop = openPop(el, () => twPickerHTML(name === 'end' ? 'End time' : 'Start time'));
    const cur = twParts(twMin(form.querySelector(`input[name="${name}"]`).value) ?? 540);
    const cols = [...pop.querySelectorAll('.tw-col')];
    cols.forEach((col) => {
      const k = col.dataset.col;
      const items = [...col.children];
      const i = Math.max(0, items.findIndex((x) => Number(x.dataset.v) === cur[k]));
      col.scrollTop = i * TW_ROW;
      let t = null;
      const read = () => {
        const idx = Math.max(0, Math.min(items.length - 1, Math.round(col.scrollTop / TW_ROW)));
        items.forEach((x, j) => x.classList.toggle('on', j === idx));
        const p = Object.fromEntries(cols.map((c) => [c.dataset.col, Number(c.children[Math.max(0, Math.min(c.children.length - 1, Math.round(c.scrollTop / TW_ROW)))].dataset.v)]));
        twChanged(form, name, twJoin(p));
      };
      items.forEach((x, j) => x.classList.toggle('on', j === i));
      col.addEventListener('scroll', () => { clearTimeout(t); t = setTimeout(read, 90); }, { passive: true });
      col.addEventListener('click', (e) => { const it = e.target.closest('.tw-item'); if (it) col.scrollTo({ top: items.indexOf(it) * TW_ROW, behavior: 'smooth' }); });
    });
    // Or type it: up to 2 numbers per box, and the wheel rolls to the nearest one.
    // Hours 13-23 (or 0) are read as 24-hour time and switch am/pm; minutes go to the nearest 5.
    const colOf = (k) => cols.find((c) => c.dataset.col === k);
    const roll = (k, v) => {
      const col = colOf(k);
      const items = [...col.children];
      const i = Math.max(0, items.findIndex((x) => Number(x.dataset.v) === v));
      items.forEach((x, j) => x.classList.toggle('on', j === i));
      col.scrollTo({ top: i * TW_ROW, behavior: 'smooth' });
    };
    const now = () => Object.fromEntries(cols.map((c) => [c.dataset.col, Number(c.querySelector('.tw-item.on')?.dataset.v ?? c.children[0].dataset.v)]));
    pop.querySelectorAll('.tw-type input').forEach((inp) => inp.addEventListener('input', () => {
      inp.value = inp.value.replace(/\D/g, '').slice(0, 2);
      if (!inp.value) return;
      const n = Number(inp.value);
      const p = now();
      if (inp.dataset.tw === 'h') {
        if (n === 0 || n > 23) { p.h = 12; p.ap = n === 0 ? 0 : p.ap; } else if (n > 12) { p.h = n - 12; p.ap = 1; } else p.h = n;
        roll('h', p.h); roll('ap', p.ap);
        // One digit that can't start a bigger hour (2-9), or two digits: on to the minutes.
        if (inp.value.length === 2 || n > 2) pop.querySelector('.tw-type input[data-tw="m"]').focus();
      } else {
        p.m = Math.min(55, Math.round(n / 5) * 5);
        roll('m', p.m);
      }
      twChanged(form, name, twJoin(p));
    }));
    pop.querySelectorAll('.tw-type input').forEach((inp) => inp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); closePop(); }
      if (/^[ap]$/i.test(e.key)) { e.preventDefault(); const p = now(); p.ap = /p/i.test(e.key) ? 1 : 0; roll('ap', p.ap); twChanged(form, name, twJoin(p)); }
    }));
  },
  twDone: () => closePop(),
});

// ---------- One-wheel number picker (scroll, or type up to 2 numbers) ----------
function wheelPick(anchor, { title, values, value, unit = '', done }) {
  const nearest = (n) => values.reduce((a, b) => (Math.abs(b - n) < Math.abs(a - n) ? b : a), values[0]);
  const pop = openPop(anchor, () => `<div class="picker tw-pick wp-pick"><h4>${esc(title)}</h4>
    <div class="tw-type"><input inputmode="numeric" pattern="[0-9]*" maxlength="2" placeholder="${esc(unit || 'number')}" aria-label="Type a number"><small class="muted">or scroll</small></div>
    <div class="tw-wheels wp-wheels"><div class="tw-col">${values.map((v) => `<div class="tw-item" data-v="${v}">${v}</div>`).join('')}</div><div class="wp-unit">${esc(unit)}</div><div class="tw-band" aria-hidden="true"></div></div>
    <div class="row tw-foot"><button type="button" class="btn ghost sm" data-act="twDone">Cancel</button><span class="spacer"></span><button type="button" class="btn primary sm" data-wp-ok>Set</button></div></div>`);
  const col = pop.querySelector('.tw-col');
  const items = [...col.children];
  const mark = (v, smooth) => { const i = Math.max(0, values.indexOf(v)); items.forEach((x, j) => x.classList.toggle('on', j === i)); if (smooth) col.scrollTo({ top: i * TW_ROW, behavior: 'smooth' }); else col.scrollTop = i * TW_ROW; };
  mark(nearest(value), false);
  let t = null;
  col.addEventListener('scroll', () => { clearTimeout(t); t = setTimeout(() => { const i = Math.max(0, Math.min(items.length - 1, Math.round(col.scrollTop / TW_ROW))); items.forEach((x, j) => x.classList.toggle('on', j === i)); }, 90); }, { passive: true });
  col.addEventListener('click', (e) => { const it = e.target.closest('.tw-item'); if (it) mark(Number(it.dataset.v), true); });
  const inp = pop.querySelector('.tw-type input');
  inp.addEventListener('input', () => { inp.value = inp.value.replace(/\D/g, '').slice(0, 2); if (inp.value) mark(nearest(Number(inp.value)), true); });
  const ok = () => { const on = col.querySelector('.tw-item.on'); closePop(); if (on) done(Number(on.dataset.v)); };
  inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); ok(); } });
  pop.querySelector('[data-wp-ok]').addEventListener('click', ok);
  setTimeout(() => inp.focus(), 30);
}
