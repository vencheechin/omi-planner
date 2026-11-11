'use strict';
/* Colour styles. "OMI Corporate Colour" is the OMI Branding Style Guide (cream, navy, olive, ochre,
   charcoal) and the default. The others keep the same structure (a light paper colour, a deep main
   colour, a soft secondary, a warm accent and a near-black ink), so every screen stays readable
   and calm. Each style also has a palette of 8 colours for Time Box blocks.

   A style only replaces the five base colours; css/app.css works out the rest from them. The chosen
   style is kept per device (like Light/Dark) and applied before the page draws. */

const STYLES = [
  {
    id: 'omi', name: 'OMI Corporate Colour', note: 'The OMI style guide: navy, olive, ochre on cream.',
    base: null, // the colours already in css/app.css
    swatch: ['#233246', '#7b8060', '#b5894d', '#332f2a', '#f2ede3'],
    palette: [['#b5894d', 'Ochre'], ['#7b8060', 'Olive'], ['#3e5170', 'Steel Navy'], ['#be7f5c', 'Terracotta'], ['#6e7a8f', 'Slate'], ['#9ba080', 'Sage'], ['#c9a46e', 'Sand'], ['#8c6a3c', 'Bronze']],
  },
  {
    id: 'coastal', name: 'Coastal Blue', note: 'Deep sea blue, sea-glass teal and warm sand.',
    base: { navy: '#1f3a4d', olive: '#4f7f86', ochre: '#cf9a5f', charcoal: '#22313a', cream: '#eef1ee' },
    swatch: ['#1f3a4d', '#4f7f86', '#cf9a5f', '#22313a', '#eef1ee'],
    palette: [['#4f7f86', 'Sea Glass'], ['#cf9a5f', 'Sand'], ['#3d6385', 'Harbour'], ['#7fa7a3', 'Seafoam'], ['#b9785a', 'Driftwood'], ['#5c7d9e', 'Bay'], ['#d7b98a', 'Shell'], ['#2f5866', 'Deep Teal']],
  },
  {
    id: 'eucalyptus', name: 'Eucalyptus', note: 'Bush green, gum-leaf grey and wattle gold.',
    base: { navy: '#2f4538', olive: '#7a9471', ochre: '#c4a24f', charcoal: '#2b302a', cream: '#f0efe5' },
    swatch: ['#2f4538', '#7a9471', '#c4a24f', '#2b302a', '#f0efe5'],
    palette: [['#7a9471', 'Gum Leaf'], ['#c4a24f', 'Wattle'], ['#4d6b55', 'Bush'], ['#a3b18a', 'Sage'], ['#b47a52', 'Bark'], ['#6f8a8a', 'Saltbush'], ['#d1bd83', 'Straw'], ['#3e5a48', 'Forest']],
  },
  {
    id: 'clay', name: 'Desert Clay', note: 'Red earth, clay and dusk brown.',
    base: { navy: '#4a2f27', olive: '#8a7a58', ochre: '#c0673f', charcoal: '#33261f', cream: '#f6ece2' },
    swatch: ['#4a2f27', '#8a7a58', '#c0673f', '#33261f', '#f6ece2'],
    palette: [['#c0673f', 'Clay'], ['#8a7a58', 'Spinifex'], ['#9a5a43', 'Red Earth'], ['#d29a6a', 'Dune'], ['#6f6a55', 'Mulga'], ['#b88a5a', 'Ochre'], ['#a4746a', 'Dusk'], ['#7d4a3a', 'Rust']],
  },
  {
    id: 'graphite', name: 'Graphite', note: 'Quiet greys with a muted gold accent.',
    base: { navy: '#2b2f36', olive: '#6f7782', ochre: '#a68d5c', charcoal: '#222428', cream: '#f1f1ee' },
    swatch: ['#2b2f36', '#6f7782', '#a68d5c', '#222428', '#f1f1ee'],
    palette: [['#a68d5c', 'Brass'], ['#6f7782', 'Slate'], ['#4f5a68', 'Steel'], ['#9aa3ad', 'Pewter'], ['#8a7768', 'Taupe'], ['#5f6f6a', 'Moss Grey'], ['#c2b08a', 'Linen'], ['#3f4650', 'Charcoal']],
  },
];
const styleOf = (id) => STYLES.find((s) => s.id === id) || STYLES[0];
const currentStyle = () => styleOf(typeof S !== 'undefined' && S ? S.settings.style : null);

/** The CSS that turns a style's five colours into the app's light and dark colours. */
function styleCSS(st) {
  if (!st.base) return '';
  const b = st.base;
  const baseVars = `--navy: ${b.navy}; --olive: ${b.olive}; --ochre: ${b.ochre}; --charcoal: ${b.charcoal}; --cream: ${b.cream};`;
  const light = `${baseVars}
    --accent: var(--navy); --highlight: var(--ochre); --heading: var(--navy);
    --bg: var(--cream); --surface: color-mix(in srgb, var(--cream) 45%, #fff); --surface-2: color-mix(in srgb, var(--cream) 86%, var(--ochre));
    --hover: color-mix(in srgb, var(--cream) 90%, var(--charcoal)); --accent-soft: color-mix(in srgb, var(--cream) 86%, var(--ochre));
    --ink: var(--charcoal); --ink-2: color-mix(in srgb, var(--olive) 55%, var(--charcoal)); --muted: color-mix(in srgb, var(--olive) 80%, var(--charcoal));
    --line: color-mix(in srgb, var(--cream) 84%, var(--olive)); --line-strong: color-mix(in srgb, var(--cream) 68%, var(--olive));
    --st-doing: color-mix(in srgb, var(--navy) 80%, #fff); --st-done: var(--olive); --chart: var(--surface);`;
  const dark = `${baseVars}
    --accent: color-mix(in srgb, var(--ochre) 80%, #fff); --accent-ink: var(--charcoal); --highlight: color-mix(in srgb, var(--ochre) 80%, #fff); --heading: var(--cream);
    --bg: color-mix(in srgb, var(--navy) 72%, #000); --surface: var(--navy); --surface-2: color-mix(in srgb, var(--navy) 90%, #fff);
    --hover: color-mix(in srgb, var(--navy) 84%, #fff); --accent-soft: color-mix(in srgb, var(--navy) 88%, #fff);
    --ink: var(--cream); --ink-2: color-mix(in srgb, var(--cream) 85%, var(--navy)); --muted: color-mix(in srgb, var(--olive) 45%, var(--cream));
    --line: color-mix(in srgb, var(--navy) 84%, #fff); --line-strong: color-mix(in srgb, var(--navy) 70%, #fff);
    --st-doing: color-mix(in srgb, var(--olive) 50%, var(--cream)); --st-done: color-mix(in srgb, var(--olive) 70%, var(--cream)); --chart: color-mix(in srgb, var(--navy) 85%, #000);`;
  return `:root { ${light} }
@media (prefers-color-scheme: dark) { :root:where(:not([data-theme="light"])) { ${dark} } }
:root[data-theme="dark"] { ${dark} }`;
}
function applyStyle() {
  const st = currentStyle();
  const css = styleCSS(st);
  let tag = document.getElementById('style-tokens');
  if (!tag) { tag = document.createElement('style'); tag.id = 'style-tokens'; document.head.append(tag); }
  tag.textContent = css;
  try { localStorage.setItem(lsKey('planner-style-css'), css); } catch { /* the style is applied after load instead */ }
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = st.swatch[0];
}

/** Time Box colours: each task keeps the same colour from the style's palette unless you pick one. */
const hashOf = (id) => { let h = 0; for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h; };
function autoColor(t) {
  const pal = currentStyle().palette.map(([c]) => c);
  if (!(t.slotDate && Number.isFinite(t.slotStart))) return pal[hashOf(t.id) % pal.length];
  // On the grid, walk that day's blocks in time order so the one before never has the same colour.
  const day = S.tasks.filter((x) => x.slotDate === t.slotDate && Number.isFinite(x.slotStart) && !(x.boxId && taskById(x.boxId)))
    .sort((a, b) => a.slotStart - b.slotStart || String(a.id).localeCompare(String(b.id)));
  let prev = null;
  for (const x of day) {
    let c = x.tbColor || pal[hashOf(x.id) % pal.length];
    if (!x.tbColor && c === prev) c = pal[(pal.indexOf(c) + 1) % pal.length];
    if (x.id === t.id) return c;
    prev = c;
  }
  return pal[hashOf(t.id) % pal.length];
}
/** Colour choices for a dropdown: Automatic, then the style's palette (plus a colour picked earlier, if it's from another style). */
function tbColors(cur) {
  const list = [{ v: '', label: 'Automatic' }, ...currentStyle().palette.map(([v, label]) => ({ v, label }))];
  if (cur && !list.some((c) => c.v.toLowerCase() === String(cur).toLowerCase())) list.push({ v: cur, label: 'Earlier colour' });
  return list;
}
function styleSettingsHTML() {
  const cur = currentStyle().id;
  return `<div class="style-list" role="radiogroup" aria-label="Colour style">${STYLES.map((st) => `<button class="style-card ${st.id === cur ? 'on' : ''}" role="radio" aria-checked="${st.id === cur}" data-act="setStyle" data-v="${st.id}">
      <span class="style-sw">${st.swatch.map((c) => `<i style="background:${c}"></i>`).join('')}</span>
      <span class="style-txt"><b>${esc(st.name)}</b><small>${esc(st.note)}</small></span>
      <span class="style-pal">${st.palette.map(([c]) => `<i style="background:${c}"></i>`).join('')}</span>
      ${st.id === cur ? icon('check', 16) : ''}</button>`).join('')}</div>
    `;
}
