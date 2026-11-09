/**
 * Shrinks a photo in the browser before upload: longest side 1200px, JPEG at 80% quality.
 * A phone photo of 4 to 8 MB usually becomes 150 to 300 KB, which saves data and keeps pages light.
 * If anything fails (old browser, odd file) the original file is returned unchanged.
 */
export async function compressImage(file: File, maxSide = 1200, quality = 0.8): Promise<File> {
  try {
    if (!file.type.startsWith('image/') || typeof createImageBitmap !== 'function') {
      return file;
    }
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      bitmap.close();
      return file;
    }
    ctx.fillStyle = '#ffffff'; // PNGs with transparency would turn black as JPEG
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    if (!blob || (blob.size >= file.size && file.size < 5 * 1024 * 1024)) {
      return file;
    }
    return new File([blob], `${file.name.replace(/\.[^.]+$/, '') || 'photo'}.jpg`, { type: 'image/jpeg' });
  } catch {
    return file;
  }
}