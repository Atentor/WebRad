import { describe, expect, it } from 'vitest';
import { isStaticResamplingImage, resampleImagePixels } from '../src/image-resampling.js';

describe('image area resampling', () => {
  it('averages all covered source pixels instead of sampling isolated points', () => {
    const pixels = new Uint8ClampedArray([
      0, 0, 0, 255, 255, 255, 255, 255, 255, 255, 255, 255, 0, 0, 0, 255,
    ]);
    expect([...resampleImagePixels(pixels, 2, 2, 1, 1)]).toEqual([128, 128, 128, 255]);
  });

  it('weights fractional coverage during a noninteger reduction', () => {
    const pixels = new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 255, 0, 0, 0, 255]);
    expect([...resampleImagePixels(pixels, 3, 1, 2, 1)]).toEqual([
      85, 85, 85, 255, 85, 85, 85, 255,
    ]);
  });

  it('preserves transparent edges without dark or colored halos', () => {
    const pixels = new Uint8ClampedArray([255, 0, 0, 0, 0, 200, 255, 255]);
    expect([...resampleImagePixels(pixels, 2, 1, 1, 1)]).toEqual([0, 200, 255, 128]);
    expect([...resampleImagePixels(new Uint8ClampedArray([255, 0, 0, 0]), 1, 1, 1, 1)]).toEqual([
      0, 0, 0, 0,
    ]);
  });

  it('keeps native-size pixels sharp', () => {
    const pixels = new Uint8ClampedArray([20, 40, 80, 128, 255, 0, 0, 255]);
    expect(resampleImagePixels(pixels, 2, 1, 2, 1)).toEqual(pixels);
  });

  it('rejects invalid buffers and dimensions rather than silently losing data', () => {
    for (const dimensions of [
      [0, 1, 1, 1],
      [1, 1, 2, 1],
      [1, 1, 1, 0.5],
      [2, 1, 1, 1],
    ]) {
      const [width, height, targetWidth, targetHeight] = dimensions as [
        number,
        number,
        number,
        number,
      ];
      expect(() =>
        resampleImagePixels(new Uint8ClampedArray(4), width, height, targetWidth, targetHeight),
      ).toThrow(RangeError);
    }
  });
});

describe('still image detection', () => {
  const png = (animated: boolean): Uint8Array => {
    const signature = [137, 80, 78, 71, 13, 10, 26, 10];
    const chunk = (kind: string): number[] => [
      0,
      0,
      0,
      0,
      ...new TextEncoder().encode(kind),
      0,
      0,
      0,
      0,
    ];
    return new Uint8Array([
      ...signature,
      ...chunk('IHDR'),
      ...(animated ? chunk('acTL') : []),
      ...chunk('IDAT'),
    ]);
  };
  it('accepts static PNG/JPEG/WebP but keeps animated formats and SVG native', () => {
    expect(isStaticResamplingImage(png(false))).toBe(true);
    expect(isStaticResamplingImage(png(true))).toBe(false);
    expect(isStaticResamplingImage(new Uint8Array([255, 216, 255, 224]))).toBe(true);
    const webp = new Uint8Array(30);
    webp.set(new TextEncoder().encode('RIFF'), 0);
    webp.set(new TextEncoder().encode('WEBPVP8X'), 8);
    expect(isStaticResamplingImage(webp)).toBe(true);
    webp[20] = 2;
    expect(isStaticResamplingImage(webp)).toBe(false);
    for (const data of ['GIF89a', '<svg xmlns="http://www.w3.org/2000/svg"/>', 'invalid']) {
      expect(isStaticResamplingImage(new TextEncoder().encode(data))).toBe(false);
    }
  });
});
