// Resizes a picked image in the browser and returns a JPEG data URL small enough to upload.
// Cropping covers the target box (centre crop), so avatars come out square and thumbnails 16:9.
export async function prepareImage(file, width, height) {
  if (!file) throw Error('Choose an image.');
  if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type)) throw Error('Choose a PNG, JPEG or WebP image.');
  if (file.size > 15 * 1024 * 1024) throw Error('That image is larger than 15 MB.');
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => bad(Error('That image could not be read.')); i.src = url; });
    const scale = Math.max(width / img.naturalWidth, height / img.naturalHeight);
    const sw = width / scale, sh = height / scale, sx = (img.naturalWidth - sw) / 2, sy = (img.naturalHeight - sh) / 2;
    const c = document.createElement('canvas'); c.width = width; c.height = height;
    const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, width, height);
    g.imageSmoothingQuality = 'high'; g.drawImage(img, sx, sy, sw, sh, 0, 0, width, height);
    for (const q of [0.86, 0.75, 0.6]) { const d = c.toDataURL('image/jpeg', q); if (d.length < 1100000) return d; }
    throw Error('That image is too detailed to upload. Try a smaller one.');
  } finally { URL.revokeObjectURL(url); }
}

export const initials = name => String(name || '?').split(/\s+/).filter(Boolean).map(x => x[0]).slice(0, 2).join('').toUpperCase();
