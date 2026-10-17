/** Area averaging for minification. Colors are accumulated with premultiplied alpha. */
export function resampleImagePixels(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  targetWidth: number,
  targetHeight: number,
): Uint8ClampedArray {
  if (
    ![width, height, targetWidth, targetHeight].every(
      (value) => Number.isSafeInteger(value) && value > 0,
    ) ||
    targetWidth > width ||
    targetHeight > height ||
    pixels.length !== width * height * 4
  )
    throw new RangeError('Image resampling requires valid RGBA dimensions and a smaller target.');
  const output = new Uint8ClampedArray(targetWidth * targetHeight * 4);
  const scaleX = width / targetWidth;
  const scaleY = height / targetHeight;
  const area = scaleX * scaleY;
  for (let y = 0; y < targetHeight; y++) {
    const top = y * scaleY;
    const bottom = (y + 1) * scaleY;
    for (let x = 0; x < targetWidth; x++) {
      const left = x * scaleX;
      const right = (x + 1) * scaleX;
      let alpha = 0;
      let red = 0;
      let green = 0;
      let blue = 0;
      for (let sy = Math.floor(top); sy < Math.min(height, Math.ceil(bottom)); sy++) {
        const weightY = Math.min(bottom, sy + 1) - Math.max(top, sy);
        for (let sx = Math.floor(left); sx < Math.min(width, Math.ceil(right)); sx++) {
          const index = (sy * width + sx) * 4;
          const weight = weightY * (Math.min(right, sx + 1) - Math.max(left, sx));
          const weightedAlpha = (pixels[index + 3] ?? 0) * weight;
          alpha += weightedAlpha;
          red += (pixels[index] ?? 0) * weightedAlpha;
          green += (pixels[index + 1] ?? 0) * weightedAlpha;
          blue += (pixels[index + 2] ?? 0) * weightedAlpha;
        }
      }
      const index = (y * targetWidth + x) * 4;
      if (alpha > 0) {
        output[index] = red / alpha;
        output[index + 1] = green / alpha;
        output[index + 2] = blue / alpha;
      }
      output[index + 3] = alpha / area;
    }
  }
  return output;
}

/** Only known still raster formats are processed; vectors and animations stay native. */
export function isStaticResamplingImage(bytes: Uint8Array): boolean {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return true;
  const text = (offset: number, size: number): string =>
    String.fromCharCode(...bytes.subarray(offset, offset + size));
  if (text(0, 4) === 'RIFF' && text(8, 4) === 'WEBP') {
    return text(12, 4) !== 'VP8X' || ((bytes[20] ?? 0) & 2) === 0;
  }
  if (bytes[0] !== 137 || text(1, 3) !== 'PNG') return false;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let offset = 8; offset + 12 <= bytes.length;) {
    const kind = text(offset + 4, 4);
    if (kind === 'acTL') return false;
    if (kind === 'IDAT') return true;
    offset += view.getUint32(offset) + 12;
  }
  return false;
}
