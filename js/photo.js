'use strict';
// ---------- Profile photo ----------
// Your photo is cropped square and shrunk to 160 px (a few KB), then synced with your profile so
// teammates see it on avatars. Set it in Settings › People by tapping your own picture.

async function photoSquare(file, size = 160) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((ok, bad) => { const im = new Image(); im.onload = () => ok(im); im.onerror = bad; im.src = url; });
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    const c = document.createElement('canvas');
    c.width = size; c.height = size;
    c.getContext('2d').drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, size, size);
    for (const q of [0.82, 0.7, 0.55]) { const out = c.toDataURL('image/jpeg', q); if (out.length < 60000) return out; }
    return null;
  } finally { URL.revokeObjectURL(url); }
}
function photoMenuHTML() {
  const me = person(S.meId);
  return `<div class="menu" role="menu">
    <button role="menuitem" data-act="photoUpload">${icon('image', 15)} ${me?.photo ? 'Change photo' : 'Upload photo'}</button>
    ${me?.photo ? `<button role="menuitem" data-act="photoRemove">${icon('close', 15)} Remove photo</button>` : ''}</div>`;
}
Object.assign(actions, {
  photoPick: (el) => openPop(el, photoMenuHTML),
  photoUpload: () => {
    closePop();
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async () => {
      const f = input.files[0];
      if (!f) return;
      let data = null;
      try { data = await photoSquare(f); } catch { /* not an image this browser can read */ }
      if (!data) { toast('Couldn’t use that picture. Try a JPEG or PNG.', { error: true }); return; }
      person(S.meId).photo = data;
      commit();
      toast('Profile photo updated.', { keep: true });
      if (typeof refreshSettings === 'function') refreshSettings();
    };
    input.click();
  },
  photoRemove: () => { closePop(); delete person(S.meId).photo; commit(); if (typeof refreshSettings === 'function') refreshSettings(); },
});
