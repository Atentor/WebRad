import type { BrowserWindow } from 'electron';

interface SmokeViewport {
  readonly width: number;
  readonly height: number;
}

type SmokeViewportWindow = Pick<
  BrowserWindow,
  'setContentSize' | 'getContentSize' | 'getBounds' | 'getMinimumSize'
> & {
  readonly webContents: Pick<BrowserWindow['webContents'], 'executeJavaScript'>;
};

function matchesViewport(value: unknown, viewport: SmokeViewport): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    Reflect.get(value, 'width') === viewport.width &&
    Reflect.get(value, 'height') === viewport.height
  );
}

/** Keep responsive widths exact while respecting the native screen's available height. */
export async function resizeSmokeViewport(
  window: SmokeViewportWindow,
  requested: SmokeViewport,
): Promise<SmokeViewport> {
  if (
    !Number.isInteger(requested.width) ||
    !Number.isInteger(requested.height) ||
    requested.width <= 0 ||
    requested.height <= 0
  ) {
    throw new Error(`Invalid smoke viewport request: ${JSON.stringify(requested)}`);
  }
  window.setContentSize(requested.width, requested.height, false);
  const deadline = Date.now() + 10_000;
  let native: SmokeViewport | undefined;
  let renderer: unknown;
  while (Date.now() < deadline) {
    const [width, height] = window.getContentSize();
    renderer = await window.webContents.executeJavaScript(
      '({ width: innerWidth, height: innerHeight })',
      true,
    );
    if (width !== undefined && height !== undefined) {
      native = { width, height };
      if (
        width === requested.width &&
        Number.isInteger(height) &&
        height > 0 &&
        height <= requested.height &&
        matchesViewport(renderer, native)
      ) {
        return native;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(
    `Smoke viewport resize timed out: ${JSON.stringify({ requested, native, renderer, bounds: window.getBounds(), minimumSize: window.getMinimumSize() })}`,
  );
}
