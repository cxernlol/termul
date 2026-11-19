/**
 * Makes an avatar upload small before it leaves the browser.
 *
 * The homepage shows avatars at 32px, but people upload phone photos of
 * 1–2 MB. This draws the image at most `maxSide` px on its long side and
 * encodes it as WebP (JPEG where the browser cannot encode WebP). It keeps
 * the original file when:
 * - the file is a GIF (it can be animated);
 * - the browser cannot decode or encode it;
 * - the new file is not smaller.
 */
export async function shrinkAvatar(file: File, maxSide = 256): Promise<File> {
  if (!file.type.startsWith('image/') || file.type === 'image/gif') return file;
  if (typeof createImageBitmap !== 'function') return file;

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const draw = (background?: string) => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      if (!context) return null;
      if (background) {
        context.fillStyle = background;
        context.fillRect(0, 0, width, height);
      }
      context.imageSmoothingQuality = 'high';
      context.drawImage(bitmap, 0, 0, width, height);
      return canvas;
    };
    const encode = (canvas: HTMLCanvasElement, type: string) =>
      new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.86));

    // WebP keeps transparency. Safari cannot encode WebP, so it gets JPEG on
    // the site's muted color (JPEG has no transparency).
    let type = 'image/webp';
    let canvas = draw();
    let blob = canvas ? await encode(canvas, type) : null;
    if (!blob || blob.type !== type) {
      type = 'image/jpeg';
      canvas = draw('#232425');
      blob = canvas ? await encode(canvas, type) : null;
    }
    bitmap.close();
    if (!blob || blob.type !== type || blob.size >= file.size) return file;

    const name = `${file.name.replace(/\.[^.]+$/, '') || 'avatar'}.${type === 'image/webp' ? 'webp' : 'jpg'}`;
    return new File([blob], name, { type });
  } catch {
    return file;
  }
}
