import type { BrowserWindow } from 'electron';

interface WorkbenchResizeSmokeOptions {
  readonly log: (message: string) => void;
  readonly waitFor: (expression: string, description: string) => Promise<unknown>;
}

/** Exercise the existing docks with native input and actual presented geometry. */
export async function runWorkbenchResizeSmoke(
  window: BrowserWindow,
  options: WorkbenchResizeSmokeOptions,
): Promise<void> {
  const measureCanvas = `(() => {
    const surface = document.querySelector('.wr-page-surface');
    const host = document.querySelector('.wr-designer-scroll');
    const overlay = document.querySelector('.wr-design-overlay');
    if (!(surface instanceof HTMLElement) || !(host instanceof HTMLElement) ||
        !(overlay instanceof HTMLElement)) return null;
    const hostStyle = getComputedStyle(host);
    return {
      viewport: Number(surface.dataset.viewportWidth),
      scale: Number(getComputedStyle(surface).getPropertyValue('--wr-designer-scale')),
      available: host.clientWidth - parseFloat(hostStyle.paddingLeft) - parseFloat(hostStyle.paddingRight),
      width: surface.getBoundingClientRect().width,
      fluid: surface.parentElement?.hasAttribute('data-workbench-fluid-width') === true,
      overlay: getComputedStyle(overlay).visibility,
    };
  })()`;
  const afterPaint = () =>
    window.webContents.executeJavaScript(
      'new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))',
      true,
    );

  // The divider's aria value can settle before ResizeObserver has updated the canvas.
  await afterPaint();
  await options.waitFor(
    `(() => {
      const canvas = ${measureCanvas};
      return (canvas !== null && canvas.width > 0 && canvas.viewport > 0 &&
        canvas.overlay === 'visible' &&
        (!canvas.fluid || (Math.abs(canvas.width - canvas.available) <= 1 &&
          Math.abs(canvas.viewport * canvas.scale - canvas.available) <= 1))) || { canvas };
    })()`,
    'Designer canvas measurement after keyboard resizing',
  );

  const targets = [
    { name: 'left', selector: '.wr-splitter-left', panel: '.wr-left-rail', axis: 'x', sign: 1 },
    {
      name: 'right',
      selector: '.wr-splitter-right',
      panel: '.wr-inspector-slot',
      axis: 'x',
      sign: -1,
    },
    {
      name: 'bottom',
      selector: '.wr-splitter-horizontal',
      panel: '.wr-bottom-slot',
      axis: 'y',
      sign: -1,
    },
  ] as const;

  window.webContents.focus();
  for (const target of targets) {
    const panelDimension = target.axis === 'x' ? 'width' : 'height';
    const measure = `(() => {
      const splitter = document.querySelector(${JSON.stringify(target.selector)});
      if (!(splitter instanceof HTMLElement)) throw new Error('Missing ${target.name} divider.');
      const bounds = splitter.getBoundingClientRect();
      if (bounds.width <= 0 || bounds.height <= 0) throw new Error('Hidden ${target.name} divider.');
      return {
        x: Math.round(bounds.left + bounds.width / 2),
        y: Math.round(bounds.top + bounds.height / 2),
        value: Number(splitter.getAttribute('aria-valuenow')),
        maximum: Number(splitter.getAttribute('aria-valuemax')),
        viewport: Number(document.querySelector('.wr-page-surface')?.getAttribute('data-viewport-width')),
      };
    })()`;
    const original = (await window.webContents.executeJavaScript(measure, true)) as {
      x: number;
      y: number;
      value: number;
      maximum: number;
      viewport: number;
    };
    if (!Object.values(original).every(Number.isFinite) || original.maximum - original.value < 24) {
      throw new Error(`Insufficient ${target.name} resize space: ${JSON.stringify(original)}`);
    }

    for (const delta of [24, -24]) {
      const start = (await window.webContents.executeJavaScript(measure, true)) as typeof original;
      const point = (offset: number): { x: number; y: number } => ({
        x: start.x + (target.axis === 'x' ? offset * target.sign : 0),
        y: start.y + (target.axis === 'y' ? offset * target.sign : 0),
      });
      window.webContents.sendInputEvent({ type: 'mouseMove', ...point(0) });
      window.webContents.sendInputEvent({
        type: 'mouseDown',
        ...point(0),
        button: 'left',
        modifiers: ['leftbuttondown'],
        clickCount: 1,
      });
      try {
        await options.waitFor(
          `document.querySelector('.wr-workbench')?.getAttribute('data-resizing') === ${JSON.stringify(target.name)}`,
          `${target.name} divider capture`,
        );
        for (const offset of [delta / 3, (delta * 2) / 3]) {
          window.webContents.sendInputEvent({
            type: 'mouseMove',
            ...point(offset),
            button: 'left',
            modifiers: ['leftbuttondown'],
          });
          await options.waitFor(
            `(() => {
              const splitter = document.querySelector(${JSON.stringify(target.selector)});
              const panel = document.querySelector(${JSON.stringify(target.panel)});
              const canvas = ${measureCanvas};
              const value = Number(splitter?.getAttribute('aria-valuenow'));
              const panelSize = panel instanceof HTMLElement ? panel.getBoundingClientRect().${panelDimension} : null;
              const expected = ${start.value + offset};
              const expectedViewport = ${start.viewport};
              const resizing = document.querySelector('.wr-workbench')?.getAttribute('data-resizing');
              return (canvas !== null && panelSize !== null && value === expected &&
                Math.abs(panelSize - value) <= 1 && canvas.viewport === expectedViewport &&
                canvas.overlay === 'hidden' &&
                (!canvas.fluid || Math.abs(canvas.width - canvas.available) <= 1)) ||
                { resizing, value, expected, panelSize, expectedViewport, canvas };
            })()`,
            `${target.name} live dock and CSS canvas geometry`,
          );
        }
      } finally {
        // Release at a new coordinate: the final input must beat a pending frame.
        window.webContents.sendInputEvent({
          type: 'mouseUp',
          ...point(delta),
          button: 'left',
          clickCount: 1,
        });
      }
      await options.waitFor(
        `(() => {
          const workbench = document.querySelector('.wr-workbench');
          const splitter = document.querySelector(${JSON.stringify(target.selector)});
          const panel = document.querySelector(${JSON.stringify(target.panel)});
          const canvas = ${measureCanvas};
          const value = Number(splitter?.getAttribute('aria-valuenow'));
          const panelSize = panel instanceof HTMLElement ? panel.getBoundingClientRect().${panelDimension} : null;
          const expected = ${start.value + delta};
          const resizing = workbench?.getAttribute('data-resizing');
          const focused = document.activeElement === splitter;
          const active = splitter?.matches(':active');
          return (workbench instanceof HTMLElement && resizing === null && canvas !== null &&
            panelSize !== null && value === expected && !focused && active === false &&
            Math.abs(panelSize - value) <= 1 && canvas.overlay === 'visible' &&
            (!canvas.fluid || Math.abs(canvas.viewport * canvas.scale - canvas.available) <= 1)) ||
            { resizing, value, expected, panelSize, focused, active, canvas };
        })()`,
        `${target.name} final geometry and measurement recovery`,
      );
      window.webContents.sendInputEvent({ type: 'mouseMove', ...point(delta + 8) });
      await afterPaint();
      await options.waitFor(
        `(() => {
          const splitter = document.querySelector(${JSON.stringify(target.selector)});
          return splitter instanceof HTMLElement && !splitter.matches(':hover, :active, :focus') &&
            !document.querySelector('.wr-workbench')?.hasAttribute('data-resizing') &&
            Number(splitter.getAttribute('aria-valuenow')) === ${start.value + delta};
        })()`,
        `${target.name} idle divider without retained focus or further resizing`,
      );
    }
    await options.waitFor(
      `Number(document.querySelector(${JSON.stringify(target.selector)})?.getAttribute('aria-valuenow')) === ${original.value}`,
      `${target.name} original dock size`,
    );
  }
  options.log(
    'renderer workbench pointer resizing passed: left, right and output; live CSS canvas, deferred measurements, final coordinates, released focus, idle pointer movement and restored sizes',
  );
  options.log(
    'renderer workbench pointer release passed: no active focus or movement after mouse-up',
  );
}
