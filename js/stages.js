'use strict';
// ---------- Stages for S-Team / PD Plan entries ----------
// An entry in a month can be given a stage (Stage 1 Direction … Stage 5 Review) picked from a
// list. Admins set the stage numbers and names in Admin Portal › Stages; the list is shared with
// the team. Entries keep the stage's id, so renaming a stage renames it everywhere.

const DEFAULT_STAGES = () => [
  { id: 's1', n: 1, name: 'Direction' }, { id: 's2', n: 2, name: 'Development' }, { id: 's3', n: 3, name: 'Pre-Launch' },
  { id: 's4', n: 4, name: 'Launch' }, { id: 's5', n: 5, name: 'Review' },
];
function normalizeStages(list) {
  if (!Array.isArray(list)) return null;
  return list.filter((s) => s && s.id).slice(0, 30).map((s) => ({ id: String(s.id).slice(0, 40), n: String(s.n ?? '').slice(0, 8), name: String(s.name || '').slice(0, 60) }));
}
const bpStages = () => normalizeStages(org().stages) || DEFAULT_STAGES();
const stageById = (id) => (id ? bpStages().find((s) => s.id === id) : null);
const stageLabel = (s) => (s ? `${s.n !== '' ? `Stage ${s.n} ` : ''}${s.name}`.trim() : '');
/** What an entry says: its stage, then its own words. */
function bpItemText(i) {
  return [stageLabel(stageById(i?.stage)), i?.text].filter(Boolean).join(' · ');
}

// ---------- Admin Portal › Stages ----------
function stagesAdminHTML() {
  const list = bpStages();
  return `<section class="dr-hub"><h2>Stages</h2>
    <p class="small muted">The stages people pick for an entry in the S-Team Plan and PD Plan. Changing a number or name updates every entry that uses it. Shared with the whole team.</p>
    <ul class="stg-list">${list.map((s, i) => `<li>
      <span class="stg-pill">Stage</span>
      <input class="stg-n" value="${esc(s.n)}" inputmode="numeric" data-change="stageEdit" data-i="${i}" data-k="n" aria-label="Stage number">
      <input class="stg-name" value="${esc(s.name)}" data-change="stageEdit" data-i="${i}" data-k="name" aria-label="Stage name">
      <button class="icon-btn" data-act="stageMove" data-i="${i}" data-d="-1" aria-label="Move up" ${i ? '' : 'disabled'}>${icon('chevL', 14)}</button>
      <button class="icon-btn" data-act="stageMove" data-i="${i}" data-d="1" aria-label="Move down" ${i < list.length - 1 ? '' : 'disabled'}>${icon('chevR', 14)}</button>
      <button class="icon-btn" data-act="stageDel" data-i="${i}" aria-label="Remove ${esc(stageLabel(s))}">${icon('close', 13)}</button></li>`).join('')}</ul>
    <div class="row"><button class="btn ghost sm" data-act="stageAdd">${icon('plus', 13)} Stage</button><span class="spacer"></span><button class="btn ghost sm" data-act="stageReset">Back to the standard five</button></div>
  </section>`;
}
function stagesEdit(fn) {
  if (!stAdmin()) return;
  const list = clone(bpStages());
  fn(list);
  org().stages = normalizeStages(list);
  commit();
}
Object.assign(actions, {
  stageAdd: () => stagesEdit((l) => { const last = l.at(-1); l.push({ id: uid(), n: String((Number(last?.n) || l.length) + 1), name: 'New stage' }); }),
  stageDel: async (el) => {
    const s = bpStages()[Number(el.dataset.i)];
    if (!s || !await confirmDlg(`Remove ${stageLabel(s)}?`, 'Entries that use it keep their own words but lose the stage.', 'Remove')) return;
    stagesEdit((l) => { l.splice(Number(el.dataset.i), 1); });
  },
  stageMove: (el) => stagesEdit((l) => { const i = Number(el.dataset.i); const j = i + Number(el.dataset.d); if (j >= 0 && j < l.length) [l[i], l[j]] = [l[j], l[i]]; }),
  stageReset: async () => { if (await confirmDlg('Go back to the standard five stages?', 'Direction, Development, Pre-Launch, Launch and Review.', 'Reset')) stagesEdit((l) => { l.splice(0, l.length, ...DEFAULT_STAGES()); }); },
});
Object.assign(changes, {
  stageEdit: (el) => stagesEdit((l) => { const s = l[Number(el.dataset.i)]; if (s) s[el.dataset.k] = el.value.trim(); }),
});
