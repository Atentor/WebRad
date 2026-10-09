import { isStaticResamplingImage, resampleImagePixels } from './image-resampling.js';

const MAX_SOURCE_PIXELS = 16_777_216;
const MAX_DISPLAY_PIXELS = 4_194_304;
const MAX_SOURCE_BYTES = 20 * 1024 * 1024;

async function imageBlob(
  url: string,
  signal: AbortSignal,
  credentials: RequestCredentials,
): Promise<Blob> {
  if (url.startsWith('data:')) {
    const comma = url.indexOf(',');
    const header = url.slice(5, comma);
    const body = url.slice(comma + 1);
    if (comma < 0 || body.length > MAX_SOURCE_BYTES * 1.4)
      throw new Error('Invalid image data URL.');
    const bytes = header.endsWith(';base64')
      ? Uint8Array.from(atob(body), (character) => character.charCodeAt(0))
      : new TextEncoder().encode(decodeURIComponent(body));
    return new Blob([bytes], { type: header.split(';')[0] });
  }
  const response = await fetch(url, { signal, credentials });
  if (!response.ok || Number(response.headers.get('content-length')) > MAX_SOURCE_BYTES) {
    throw new Error('Image cannot be processed.');
  }
  const reader = response.body?.getReader();
  if (reader === undefined) return response.blob();
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let size = 0;
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    size += chunk.value.byteLength;
    if (size > MAX_SOURCE_BYTES) {
      await reader.cancel();
      throw new Error('Image exceeds the resampling limit.');
    }
    chunks.push(new Uint8Array(chunk.value));
  }
  return new Blob(chunks, { type: response.headers.get('content-type') ?? '' });
}

/**
 * Keeps the original src and intrinsic dimensions while selecting a temporary
 * resampled bitmap through srcset. All browser-owned resources belong to this binding.
 */
export function bindImageResampling(element: HTMLImageElement): () => void {
  const ownerWindow = element.ownerDocument.defaultView;
  if (
    ownerWindow === null ||
    element.hasAttribute('srcset') ||
    typeof ownerWindow.URL.createObjectURL !== 'function'
  ) {
    return () => undefined;
  }
  const view = ownerWindow;
  const originalSizes = element.getAttribute('sizes');
  let disposed = false;
  let timer: number | undefined;
  let sourceUrl = '';
  let source: HTMLImageElement | undefined;
  let inputUrl: string | undefined;
  let controller: AbortController | undefined;
  let revision = 0;
  let signature = '';
  let failedSignature: string | undefined;
  let generatedSourceSet: string | undefined;
  let generatedSizes: string | undefined;
  let outputUrl: string | undefined;
  const outputUrls = new Set<string>();
  const ancestors = new Set<Element>();

  const clearDisplay = (): void => {
    revision++;
    signature = '';
    if (element.getAttribute('srcset') === generatedSourceSet) element.removeAttribute('srcset');
    if (element.getAttribute('sizes') === generatedSizes) {
      if (originalSizes === null) element.removeAttribute('sizes');
      else element.setAttribute('sizes', originalSizes);
    }
    generatedSourceSet = generatedSizes = outputUrl = undefined;
    for (const url of outputUrls) view.URL.revokeObjectURL(url);
    outputUrls.clear();
  };
  const schedule = (): void => {
    if (disposed || timer !== undefined) return;
    timer = view.setTimeout(update, 60);
  };
  const observeAncestors = (): void => {
    for (let parent = element.parentElement; parent !== null; parent = parent.parentElement) {
      if (ancestors.has(parent)) continue;
      ancestors.add(parent);
      mutations?.observe(parent, { attributes: true, attributeFilter: ['style', 'class'] });
    }
  };
  const loadSource = async (url: string): Promise<void> => {
    controller?.abort();
    controller = new AbortController();
    const request = controller;
    try {
      const blob = await imageBlob(
        element.src,
        request.signal,
        element.crossOrigin === 'use-credentials' ? 'include' : 'same-origin',
      );
      if (request.signal.aborted || disposed || sourceUrl !== url || blob.size > MAX_SOURCE_BYTES)
        return;
      const bytes = new Uint8Array(await blob.arrayBuffer());
      if (
        !isStaticResamplingImage(bytes) ||
        request.signal.aborted ||
        disposed ||
        sourceUrl !== url
      )
        return;
      const bitmap = element.ownerDocument.createElement('img');
      inputUrl = view.URL.createObjectURL(blob);
      bitmap.src = inputUrl;
      await bitmap.decode();
      if (request.signal.aborted || disposed || sourceUrl !== url) return;
      source = bitmap;
      schedule();
    } catch {
      // CORS/CSP, malformed data or decoder failures leave the original image visible.
    }
  };
  function update(): void {
    timer = undefined;
    if (disposed) return;
    observeAncestors();
    const url = element.getAttribute('src') ?? '';
    if (url !== sourceUrl) {
      clearDisplay();
      source = undefined;
      sourceUrl = url;
      failedSignature = undefined;
      controller?.abort();
      if (inputUrl !== undefined) view.URL.revokeObjectURL(inputUrl);
      inputUrl = undefined;
      if (url) void loadSource(url);
      return;
    }
    if (source === undefined) return;
    // Respect an explicitly authored responsive image source.
    if (element.hasAttribute('srcset') && element.getAttribute('srcset') !== generatedSourceSet)
      return;
    const style = view.getComputedStyle(element);
    const bounds = element.getBoundingClientRect();
    const zoomX = element.offsetWidth > 0 ? bounds.width / element.offsetWidth : 1;
    const zoomY = element.offsetHeight > 0 ? bounds.height / element.offsetHeight : 1;
    const width =
      (element.clientWidth -
        parseFloat(style.paddingLeft || '0') -
        parseFloat(style.paddingRight || '0')) *
      zoomX;
    const height =
      (element.clientHeight -
        parseFloat(style.paddingTop || '0') -
        parseFloat(style.paddingBottom || '0')) *
      zoomY;
    if (width <= 0 || height <= 0) return;
    const ratioX = width / source.naturalWidth;
    const ratioY = height / source.naturalHeight;
    const fit = style.objectFit || 'contain';
    const scale =
      (fit === 'cover' || fit === 'fill' ? Math.max(ratioX, ratioY) : Math.min(ratioX, ratioY)) *
      (view.devicePixelRatio || 1);
    const targetWidth = Math.max(
      1,
      Math.min(source.naturalWidth, Math.ceil(source.naturalWidth * scale)),
    );
    const targetHeight = Math.max(
      1,
      Math.min(
        source.naturalHeight,
        Math.round((targetWidth * source.naturalHeight) / source.naturalWidth),
      ),
    );
    if (
      fit === 'none' ||
      scale >= 1 ||
      source.naturalWidth * source.naturalHeight > MAX_SOURCE_PIXELS ||
      targetWidth * targetHeight > MAX_DISPLAY_PIXELS
    ) {
      if (generatedSourceSet !== undefined) clearDisplay();
      return;
    }
    const key = `${url}:${String(targetWidth)}:${String(targetHeight)}`;
    if (key === signature || key === failedSignature) return;
    signature = key;
    const generation = ++revision;
    try {
      const canvas = element.ownerDocument.createElement('canvas');
      canvas.width = source.naturalWidth;
      canvas.height = source.naturalHeight;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (context === null) return;
      context.drawImage(source, 0, 0);
      const pixels = resampleImagePixels(
        context.getImageData(0, 0, canvas.width, canvas.height).data,
        canvas.width,
        canvas.height,
        targetWidth,
        targetHeight,
      );
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const result = context.createImageData(targetWidth, targetHeight);
      result.data.set(pixels);
      context.putImageData(result, 0, 0);
      if (disposed || generation !== revision || element.getAttribute('src') !== url) return;
      // The SVG envelope retains the exact original aspect ratio and intrinsic
      // dimensions even when the reduced bitmap has rounded pixel dimensions.
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${String(source.naturalWidth)}" height="${String(source.naturalHeight)}" viewBox="0 0 ${String(source.naturalWidth)} ${String(source.naturalHeight)}" preserveAspectRatio="none"><image width="100%" height="100%" preserveAspectRatio="none" href="${canvas.toDataURL('image/png')}"/></svg>`;
      const nextUrl = view.URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
      outputUrls.add(nextUrl);
      outputUrl = nextUrl;
      generatedSizes = `${String(source.naturalWidth)}px`;
      generatedSourceSet = `${nextUrl} ${String(source.naturalWidth)}w`;
      element.setAttribute('sizes', generatedSizes);
      element.setAttribute('srcset', generatedSourceSet);
    } catch {
      // Canvas limits or unavailable browser APIs preserve native rendering.
    }
  }
  const onLoad = (): void => {
    if (element.currentSrc === outputUrl) {
      for (const url of outputUrls) {
        if (url === outputUrl) continue;
        view.URL.revokeObjectURL(url);
        outputUrls.delete(url);
      }
    }
    schedule();
  };
  const onError = (): void => {
    if (generatedSourceSet === undefined) return;
    failedSignature = signature;
    clearDisplay();
  };
  const mutations =
    typeof view.MutationObserver === 'function'
      ? new view.MutationObserver(() => {
          if (
            generatedSourceSet !== undefined &&
            ((element.getAttribute('src') ?? '') !== sourceUrl ||
              element.getAttribute('srcset') !== generatedSourceSet ||
              element.getAttribute('sizes') !== generatedSizes)
          )
            clearDisplay();
          schedule();
        })
      : undefined;
  mutations?.observe(element, {
    attributes: true,
    attributeFilter: ['src', 'srcset', 'sizes', 'style', 'class', 'width', 'height'],
  });
  const resize =
    typeof view.ResizeObserver === 'function' ? new view.ResizeObserver(schedule) : undefined;
  let densityQuery: MediaQueryList | undefined;
  const watchDensity = (): void => {
    densityQuery?.removeEventListener('change', onDensityChange);
    densityQuery = view.matchMedia?.(`(resolution: ${String(view.devicePixelRatio || 1)}dppx)`);
    densityQuery?.addEventListener('change', onDensityChange);
  };
  const onDensityChange = (): void => {
    watchDensity();
    schedule();
  };
  watchDensity();
  resize?.observe(element);
  element.addEventListener('load', onLoad);
  element.addEventListener('error', onError);
  view.addEventListener('resize', schedule);
  schedule();
  return () => {
    disposed = true;
    controller?.abort();
    if (timer !== undefined) view.clearTimeout(timer);
    mutations?.disconnect();
    resize?.disconnect();
    densityQuery?.removeEventListener('change', onDensityChange);
    element.removeEventListener('load', onLoad);
    element.removeEventListener('error', onError);
    view.removeEventListener('resize', schedule);
    if (inputUrl !== undefined) view.URL.revokeObjectURL(inputUrl);
    clearDisplay();
  };
}
