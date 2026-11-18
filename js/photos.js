// Фото точок: перевірка файлів, шлях у Storage, стискання в браузері перед завантаженням.

export const PHOTO_LIMITS = { max: 5, bytes: 2 * 1024 * 1024, width: 1600, types: ['image/jpeg', 'image/png', 'image/webp'] };
const ORIGINAL_MAX_BYTES = 25 * 1024 * 1024; // оригінал до стискання: телефонні фото бувають великими
const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

// beforeResize: оригінал ще буде стиснено, тож ліміт 2 МБ перевіряємо після стискання.
export function checkPhotos(files, existingCount, { beforeResize = false } = {}) {
  const ok = [];
  const errors = [];
  for (const f of files) {
    if (!PHOTO_LIMITS.types.includes(f.type)) {
      errors.push(`«${f.name}»: непідтримуваний формат — лише JPEG, PNG або WebP.`);
    } else if (f.size > (beforeResize ? ORIGINAL_MAX_BYTES : PHOTO_LIMITS.bytes)) {
      errors.push(`«${f.name}»: файл завеликий — до 2 МБ.`);
    } else if (existingCount + ok.length >= PHOTO_LIMITS.max) {
      errors.push(`«${f.name}»: не більше ${PHOTO_LIMITS.max} фото на точку.`);
    } else {
      ok.push(f);
    }
  }
  return { ok, errors };
}

export const photoPath = (ownerId, spotId, type, id = crypto.randomUUID()) => `${ownerId}/${spotId}/${id}.${EXT[type] ?? 'jpg'}`;

export function scaledSize(width, height, maxWidth = PHOTO_LIMITS.width) {
  if (width <= maxWidth) return { width, height };
  return { width: maxWidth, height: Math.round((height * maxWidth) / width) };
}

// PNG лишається PNG (прозорість), решта — JPEG 0.85.
export async function resizeImage(file, { maxWidth = PHOTO_LIMITS.width } = {}) {
  const bitmap = await createImageBitmap(file);
  const { width, height } = scaledSize(bitmap.width, bitmap.height, maxWidth);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d').drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();
  const type = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('resize failed'))), type, 0.85));
}
