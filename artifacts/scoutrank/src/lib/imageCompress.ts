/**
 * Resizes and re-encodes an image client-side before upload. Modern
 * phone photos are often 3000-4000px+ per side, which is far more
 * detail than any vision model actually needs to read a stopwatch or
 * scoreboard — sending them at full resolution can push a single
 * request's token usage over a vision API's per-request limit (this is
 * exactly what caused stat evidence reviews to fail with a Groq 413
 * "request too large" error). Resizing down to a sensible max dimension
 * keeps evidence perfectly legible while keeping token usage well
 * within any reasonable limit.
 */
export function compressImage(file: File, maxDimension = 800, quality = 0.75): Promise<File> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      let { width, height } = img;
      if (width > maxDimension || height > maxDimension) {
        if (width > height) {
          height = Math.round((height / width) * maxDimension);
          width = maxDimension;
        } else {
          width = Math.round((width / height) * maxDimension);
          height = maxDimension;
        }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('Canvas not supported.')); return; }
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        blob => {
          if (!blob) { reject(new Error('Image compression failed.')); return; }
          resolve(new File([blob], file.name.replace(/\.\w+$/, '.jpg'), { type: 'image/jpeg' }));
        },
        'image/jpeg',
        quality,
      );
    };
    img.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error('Failed to load image for compression.')); };
    img.src = objectUrl;
  });
}
