// ---------- PD Plan: the S-Team Plan table for product development ----------
// PD plans are S-Team plan records with module 'pd'. An admin chooses who can View, Suggest edits
// or Edit. Suggestions wait in the plan until someone who can edit accepts or rejects them.
const PD_ROLES = [['', 'No access'], ['view', 'View'], ['suggest', 'Suggest edits'], ['edit', 'Edit']];

/** A fresh copy of the groups, with new ids so the two plans never mix. */
function pdCloneGroups(groups) {
  const row = (r) => ({ ...clone(r), id: uid(), ...(r.items ? { items: r.items.map(row) } : {}) });
  return clone(groups).map((g) => ({ ...g, id: uid(), rows: g.rows.map(row) }));
}

// ---------- Suggestions ----------
const pdSuggs = (p) => (p.sugg = Array.isArray(p.sugg) ? p.sugg : []);
const pdSuggFor = (p, rid, m, field) => pdSuggs(p).filter((s) => s.r === rid && (m ? s.m === m : s.field === field));
const pdSame = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
/** Records a suggestion instead of changing the plan. Returns true when one was added. */
function pdSuggest(p, s) {
  if (pdSame(s.value, s.old)) return false;
  const me = pkey(S.meId);
  // A newer suggestion from you for the same spot replaces your earlier one.
  p.sugg = pdSuggs(p).filter((x) => !(x.by === me && x.r === s.r && x.m === s.m && x.field === s.field));
  p.sugg.push({ id: uid(), by: me, byName: person(S.meId)?.name || 'Someone', at: Date.now(), ...s });
  return true;
}
function pdSuggText(s) {
  if (s.kind === 'cell') {
    const items = Array.isArray(s.value) ? s.value : [];
    return items.length ? items.map((i) => [i.text, i.pic && `(${i.pic})`, i.status && BP_STATUS.find((x) => x.v === i.status)?.label, i.progress && `${i.progress}%`].filter(Boolean).join(' ') || 'Empty').join('; ') : 'Clear this month';
  }
  return s.value ? `“${s.value}”` : 'Clear it';
}
function pdSuggWhere(p, s) {
  const g = p.groups.find((x) => x.id === s.g);
  const all = g ? g.rows.flatMap((r) => [r, ...(r.items || [])]) : [];
  const r = all.find((x) => x.id === s.r);
  const parent = g?.rows.find((x) => (x.items || []).some((i) => i.id === s.r));
  const name = r ? `${parent ? `${parent.brand || 'Brand'} · ` : ''}${r.brand || (parent ? 'Item' : 'Brand')}` : 'A deleted row';
  return s.kind === 'cell' ? `${name} · ${bpMonthLabel(s.m)}` : `${name} · ${s.field === 'pic' ? 'PIC' : 'Name'}`;
}
function pdSuggListHTML(p) {
  const can = stCanEdit(p);
  const list = pdSuggs(p).filter((s) => can || s.by === pkey(S.meId)).sort((a, b) => b.at - a.at);
  if (!list.length) return `<p class="muted">${can ? 'No suggestions waiting.' : 'You have no suggestions waiting.'}</p>`;
  return `<ul class="bin-list pd-sugg-list">${list.map((s) => `<li>
      <span class="bin-ic">${icon('pencil', 15)}</span>
      <span class="bin-txt"><b>${esc(pdSuggWhere(p, s))}</b><span class="pd-sugg-new">${esc(pdSuggText(s))}</span>
        <small>${s.kind === 'cell' ? '' : `Was ${esc(s.old ? `“${s.old}”` : 'empty')} · `}${esc(s.byName)} · ${esc(fmtDateTime(s.at))}</small></span>
      ${can ? `<button class="btn primary sm" data-act="pdSuggAccept" data-id="${esc(s.id)}">Accept</button><button class="btn ghost sm" data-act="pdSuggReject" data-id="${esc(s.id)}">Reject</button>`
        : `<button class="btn ghost sm" data-act="pdSuggReject" data-id="${esc(s.id)}">Withdraw</button>`}</li>`).join('')}</ul>`;
}
function pdSuggApply(p, s) {
  const r = p.groups.find((g) => g.id === s.g)?.rows.flatMap((x) => [x, ...(x.items || [])]).find((x) => x.id === s.r);
  if (!r) return false;
  if (s.kind === 'cell') { const items = (s.value || []).filter((i) => i.text || i.pic || i.status || i.progress); if (items.length) r.cells[s.m] = { items }; else delete r.cells[s.m]; }
  else r[s.field] = String(s.value || '');
  return true;
}
const pdRefreshSugg = () => { const b = $('dialog.pd-sugg-dlg .dlg-body'); if (b) b.innerHTML = pdSuggListHTML(stCurrent()); };

// ---------- Access ----------
function pdAccessHTML(p) {
  const people = [...new Map(S.people.map((x) => [pkey(x.id), x])).values()].sort((a, b) => a.name.localeCompare(b.name));
  const admins = new Set((org().admins || []).map((id) => pkey(id)));
  return `<p class="small muted">Choose what each person can do in ${esc(stName(p))}. <b>Suggest edits</b> lets them propose changes that someone with Edit accepts or rejects. Admins can always edit.</p>
    <div class="adm-block pd-access">${people.map((x) => {
      const k = pkey(x.id);
      const isOwner = p.owner === x.id;
      const fixed = isOwner || admins.has(k);
      return `<div class="adm-row"><span class="org-node">${avatar(x, 22)}<b>${esc(x.name)}</b></span>
        ${fixed ? `<span class="muted small">${isOwner ? 'Owner' : 'Admin'} · Edit</span>`
          : `<select data-change="pdAccessSet" data-k="${esc(k)}" aria-label="Access for ${esc(x.name)}">${PD_ROLES.map(([v, l]) => `<option value="${v}" ${(p.access?.[k] || '') === v ? 'selected' : ''}>${l}</option>`).join('')}</select>`}</div>`;
    }).join('')}</div>`;
}

// ---------- Excel (.xlsx) download ----------
const XL_CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const xlCrc = (b) => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = XL_CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
/** A plain (stored, uncompressed) zip: all an .xlsx needs. */
function xlZip(files) {
  const enc = new TextEncoder();
  const parts = [];
  const central = [];
  let offset = 0;
  for (const [name, text] of files) {
    const nb = enc.encode(name);
    const data = enc.encode(text);
    const crc = xlCrc(data);
    const head = new DataView(new ArrayBuffer(30));
    head.setUint32(0, 0x04034b50, true); head.setUint16(4, 20, true); head.setUint16(6, 0x0800, true);
    head.setUint32(14, crc, true); head.setUint32(18, data.length, true); head.setUint32(22, data.length, true); head.setUint16(26, nb.length, true);
    parts.push(new Uint8Array(head.buffer), nb, data);
    const cd = new DataView(new ArrayBuffer(46));
    cd.setUint32(0, 0x02014b50, true); cd.setUint16(4, 20, true); cd.setUint16(6, 20, true); cd.setUint16(8, 0x0800, true);
    cd.setUint32(16, crc, true); cd.setUint32(20, data.length, true); cd.setUint32(24, data.length, true); cd.setUint16(28, nb.length, true); cd.setUint32(42, offset, true);
    central.push(new Uint8Array(cd.buffer), nb);
    offset += 30 + nb.length + data.length;
  }
  const cdSize = central.reduce((n, b) => n + b.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
  end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, new Uint8Array(end.buffer)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
const xlEsc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
const xlCol = (n) => { let s = ''; for (n += 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s; return s; };
// Styles: 0 normal, 1 header, 2 group, 3 brand, 4 item, 5 green, 6 yellow, 7 red, 8 cell, 9 title
const XL_STYLE = { green: 5, yellow: 6, red: 7 };
const XL_STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="4"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font><font><b/><sz val="14"/><name val="Calibri"/></font></fonts>
<fills count="7"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FF1F2A3A"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFEADBC3"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFC9E7C8"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFFBE7A6"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFF4C2C0"/></patternFill></fill></fills>
<borders count="2"><border/><border><left style="thin"><color rgb="FFD0D0D0"/></left><right style="thin"><color rgb="FFD0D0D0"/></right><top style="thin"><color rgb="FFD0D0D0"/></top><bottom style="thin"><color rgb="FFD0D0D0"/></bottom></border></borders>
<cellStyleXfs count="1"><xf/></cellStyleXfs>
<cellXfs count="10">
<xf/>
<xf fontId="2" fillId="2" borderId="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
<xf fontId="1" fillId="3" borderId="1" applyFont="1" applyFill="1" applyBorder="1"/>
<xf fontId="1" borderId="1" applyFont="1" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
<xf borderId="1" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1" indent="1"/></xf>
<xf fillId="4" borderId="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
<xf fillId="5" borderId="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
<xf fillId="6" borderId="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
<xf borderId="1" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
<xf fontId="3" applyFont="1"/>
</cellXfs></styleSheet>`;
/** The plan as it's shown (the months on screen), one row per brand and item. */
function stToXlsx(p, months) {
  const rows = [];
  const cellOf = (items) => items.map((i) => [i.text, i.pic && `(${i.pic})`, i.status && BP_STATUS.find((x) => x.v === i.status)?.label, i.progress ? `${i.progress}%` : ''].filter(Boolean).join(' ')).join('\n');
  // One light per cell: the most worrying one wins.
  const lightOf = (items) => (items.some((i) => i.status === 'red') ? 'red' : items.some((i) => i.status === 'yellow') ? 'yellow' : items.some((i) => i.status === 'green') ? 'green' : '');
  const line = (vals, style) => rows.push(vals.map((v) => (typeof v === 'object' && v ? v : { v, s: style })));
  line([`${stName(p)} · ${months.length ? `${bpMonthLabel(months[0])} – ${bpMonthLabel(months[months.length - 1])}` : ''}`], 9);
  line([`Downloaded ${fmtDateTime(Date.now())}`], 0);
  line([], 0);
  line(['Brand', 'Item', 'PIC', ...months.map(bpMonthLabel)], 1);
  const monthCells = (r) => months.map((k) => { const items = cellItems(r.cells[k]); return { v: cellOf(items), s: XL_STYLE[lightOf(items)] || 8 }; });
  for (const g of p.groups) {
    line([g.name, '', '', ...months.map(() => '')], 2);
    for (const r of g.rows) {
      line([{ v: r.brand, s: 3 }, { v: '', s: 3 }, { v: r.pic, s: 3 }, ...monthCells(r)], 3);
      for (const it of r.items || []) line([{ v: '', s: 4 }, { v: it.brand, s: 4 }, { v: it.pic, s: 4 }, ...monthCells(it)], 4);
    }
  }
  line([], 0);
  line(BP_STATUS.map((s) => ({ v: `${s.label}: ${s.meaning}`, s: XL_STYLE[s.v] })), 0);
  const sheetRows = rows.map((r, i) => `<row r="${i + 1}">${r.map((c, j) => (c.v === '' || c.v == null) && !c.s ? '' : `<c r="${xlCol(j)}${i + 1}" s="${c.s || 0}" t="inlineStr"><is><t xml:space="preserve">${xlEsc(c.v)}</t></is></c>`).join('')}</row>`).join('');
  const cols = `<cols><col min="1" max="1" width="24" customWidth="1"/><col min="2" max="2" width="24" customWidth="1"/><col min="3" max="3" width="14" customWidth="1"/>${months.length ? `<col min="4" max="${3 + months.length}" width="26" customWidth="1"/>` : ''}</cols>`;
  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane xSplit="3" ySplit="4" topLeftCell="D5" activePane="bottomRight" state="frozen"/></sheetView></sheetViews>${cols}<sheetData>${sheetRows}</sheetData></worksheet>`;
  const sheetName = xlEsc(stName(p).replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || 'Plan');
  return xlZip([
    ['[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>'],
    ['_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
    ['xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${sheetName}" sheetId="1" r:id="rId1"/></sheets></workbook>`],
    ['xl/_rels/workbook.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'],
    ['xl/styles.xml', XL_STYLES],
    ['xl/worksheets/sheet1.xml', sheet],
  ]);
}

Object.assign(actions, {
  pdNew: async () => {
    if (!stAdmin()) return;
    const src = stPlans().filter((x) => (x.module || 'st') === 'st' && !x.deleted && stCanSee(x) && x.groups.length);
    const opts = src.map((x, i) => ({ v: x.id, label: `Copy ${stName(x)}`, primary: i === 0 })).concat({ v: 'blank', label: 'Start blank' }, { v: '', label: 'Cancel' });
    const v = await choiceDlg('New PD Plan', src.length ? '<p>Start from a copy of an S-Team Plan (brands, items and months), or blank.</p>' : '', opts);
    if (!v) return;
    const from = src.find((x) => x.id === v);
    const p = normalizeStPlan({ id: uid(), module: 'pd', kind: 'dept', owner: S.meId, name: 'PD Plan', groups: from ? pdCloneGroups(from.groups) : [], ...(from?.cfg ? { cfg: clone(from.cfg) } : {}) });
    stPlans().push(p);
    ui.stPlanId = p.id;
    commit();
    toast(from ? `PD Plan created from ${stName(from)}.` : 'PD Plan created.');
  },
  pdRename: async () => {
    const p = stCurrent();
    if (!stAdmin() || !p) return;
    const name = await promptDlg('Rename', 'Plan name', p.name || 'PD Plan', 'Save');
    if (!name) return;
    p.name = name.slice(0, 80);
    commit();
  },
  pdAccess: () => {
    const p = stCurrent();
    if (!p || !stAdmin()) return;
    const d = showDialog({ title: `Who can use ${stName(p)}`, html: pdAccessHTML(p), wide: true });
    d?.classList?.add('pd-access-dlg');
  },
  pdSuggestions: () => {
    const p = stCurrent();
    if (!p) return;
    const d = showDialog({ title: stCanEdit(p) ? 'Suggested edits' : 'My suggestions', html: pdSuggListHTML(p), wide: true });
    d?.classList?.add('pd-sugg-dlg');
  },
  pdSuggAccept: (el) => {
    const p = stCurrent();
    const s = pdSuggs(p).find((x) => x.id === el.dataset.id);
    if (!s || !stCanEdit(p)) return;
    if (!pdSuggApply(p, s)) toast('That row has been deleted, so the suggestion was dropped.');
    p.sugg = pdSuggs(p).filter((x) => x !== s);
    commit();
    pdRefreshSugg();
  },
  pdSuggReject: (el) => {
    const p = stCurrent();
    const s = pdSuggs(p).find((x) => x.id === el.dataset.id);
    if (!s || !(stCanEdit(p) || s.by === pkey(S.meId))) return;
    p.sugg = pdSuggs(p).filter((x) => x !== s);
    commit();
    pdRefreshSugg();
  },
  bpExcel: () => {
    const p = stCurrent();
    if (!p) return;
    const months = bpMonths(bpHalf());
    const blob = stToXlsx(p, months);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${stName(p).replace(/[\\/:*?"<>|]/g, '')} ${months[0] || ''}.xlsx`.replace(/\s+/g, ' ').trim();
    document.body.append(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    toast('Excel file downloaded.');
  },
});
Object.assign(changes, {
  pdAccessSet: (el) => {
    const p = stCurrent();
    if (!p || !stAdmin()) return;
    const access = { ...(p.access || {}) };
    if (el.value) access[el.dataset.k] = el.value; else delete access[el.dataset.k];
    p.access = access;
    commit();
  },
});
