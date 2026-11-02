import type { BrowserWindow, NativeImage } from 'electron';

/** Capture a newly presented frame, including after hidden offscreen resizes. */
export async function capturePresentedSmokePage(
  window: BrowserWindow,
  deadline: number,
  label: string,
): Promise<NativeImage> {
  // requestAnimationFrame describes DOM work, not compositor presentation.
  // Observe a temporary pixel and then its removal in real frames. Consume the
  // delivered bitmap instead of starting a second Viz surface-copy request.
  const markerId = 'webrad-smoke-paint-marker';
  const removeMarker = `document.getElementById('${markerId}')?.remove()`;
  const contents = window.webContents;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let stopFrames: (() => void) | undefined;
  let onDestroyed: (() => void) | undefined;
  try {
    return await new Promise<NativeImage>((resolve, reject) => {
      let markerPresented = false;
      let settled = false;
      const fail = (error: unknown): void => {
        settled = true;
        reject(error);
      };
      timeout = setTimeout(
        () => fail(new Error(`${label} screenshot did not receive its paint fence.`)),
        Math.max(1, deadline - Date.now()),
      );
      onDestroyed = () => fail(new Error(`${label} screenshot renderer was destroyed.`));
      contents.once('destroyed', onDestroyed);
      const onFrame = (frame: NativeImage): void => {
        if (settled) return;
        try {
          if (frame.isEmpty()) throw new Error(`${label} screenshot was empty.`);
          const pixel = frame.crop({ x: 0, y: 0, width: 1, height: 1 }).toBitmap();
          // Pure green has the same byte order in RGBA and BGRA bitmaps.
          const hasMarker =
            pixel[0] === 0 && pixel[1] === 255 && pixel[2] === 0 && pixel[3] === 255;
          if (!markerPresented) {
            if (hasMarker) {
              markerPresented = true;
              void contents.executeJavaScript(removeMarker).catch(fail);
            }
            return;
          }
          if (!hasMarker) {
            settled = true;
            resolve(frame);
          }
        } catch (error: unknown) {
          fail(error);
        }
      };
      const onPaint = (
        _event: Electron.Event,
        _dirty: Electron.Rectangle,
        frame: NativeImage,
      ): void => onFrame(frame);
      stopFrames = contents.isOffscreen()
        ? () => contents.off('paint', onPaint)
        : () => contents.endFrameSubscription();
      if (contents.isOffscreen()) contents.on('paint', onPaint);
      else contents.beginFrameSubscription(false, onFrame);
      void contents
        .executeJavaScript(
          `(() => {
            const marker = document.createElement('div');
            marker.id = '${markerId}';
            marker.style.cssText = 'all: initial; position: fixed; left: 0; top: 0; width: 2px; height: 2px; background: #00ff00; z-index: 2147483647; pointer-events: none;';
            document.body.append(marker);
          })()`,
        )
        .catch(fail);
    });
  } finally {
    clearTimeout(timeout);
    if (!contents.isDestroyed()) {
      stopFrames?.();
      if (onDestroyed !== undefined) contents.off('destroyed', onDestroyed);
      await contents.executeJavaScript(removeMarker).catch(() => undefined);
    }
  }
}
