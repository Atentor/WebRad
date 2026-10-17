/** Panel-owned progress; the host's children and layout stay untouched. */
export function projectPanelProgress(props: Readonly<Record<string, unknown>>): {
  enabled: boolean;
  value: number;
  visible: boolean;
} {
  const enabled = props.progressEnabled === true;
  const value =
    typeof props.progressValue === 'number' && Number.isFinite(props.progressValue)
      ? Math.max(0, Math.min(100, props.progressValue))
      : 0;
  return { enabled, value, visible: enabled && value > 0 && value < 100 };
}

type Corner = readonly [number, number];

/** Center the stroke on the Panel's outer contour: half inside and half outside. */
export function panelProgressPath(
  width: number,
  height: number,
  corners: readonly Corner[],
): string {
  const w = Math.max(1, Number.isFinite(width) ? width : 1);
  const h = Math.max(1, Number.isFinite(height) ? height : 1);
  const radii = [0, 1, 2, 3].map((index): Corner => {
    const corner = corners[index] ?? [0, 0];
    const finite = (radius: number): number => (Number.isFinite(radius) ? Math.max(0, radius) : 0);
    return [finite(corner[0]), finite(corner[1])];
  });
  const [tl, tr, br, bl] = radii as [Corner, Corner, Corner, Corner];
  const scale = Math.min(
    1,
    w / Math.max(1, tl[0] + tr[0]),
    w / Math.max(1, bl[0] + br[0]),
    h / Math.max(1, tl[1] + bl[1]),
    h / Math.max(1, tr[1] + br[1]),
  );
  const normalized = radii.map(([x, y]): Corner => [x * scale, y * scale]);
  const [a, b, c, d] = normalized as [Corner, Corner, Corner, Corner];
  const left = 0,
    top = 0,
    right = w,
    bottom = h;
  const arc = ([rx, ry]: Corner, x: number, y: number): string =>
    rx > 0 && ry > 0 ? `A ${rx} ${ry} 0 0 1 ${x} ${y}` : `L ${x} ${y}`;
  return `M ${left + a[0]} ${top} H ${right - b[0]} ${arc(b, right, top + b[1])} V ${bottom - c[1]} ${arc(c, right - c[0], bottom)} H ${left + d[0]} ${arc(d, left, bottom - d[1])} V ${top + a[1]} ${arc(a, left + a[0], top)} Z`;
}

export interface PanelProgressGeometryBinding {
  refresh(): void;
  dispose(): void;
}

/** Shared Designer/runtime observation of the actual CSS border box and radii. */
export function bindPanelProgressGeometry(
  host: HTMLElement,
  svg: SVGSVGElement,
): PanelProgressGeometryBinding {
  const view = host.ownerDocument.defaultView;
  let disposed = false;
  let frame: number | undefined;
  let transitioning = 0;
  const set = (element: Element, name: string, value: string): void => {
    if (element.getAttribute(name) !== value) element.setAttribute(name, value);
  };
  const refresh = (): void => {
    if (disposed || view === null) return;
    const style = view.getComputedStyle(host);
    const px = (value: string): number => Number.parseFloat(value) || 0;
    const borders = [
      style.borderTopWidth,
      style.borderRightWidth,
      style.borderBottomWidth,
      style.borderLeftWidth,
    ].map(px);
    const horizontal = borders[1]! + borders[3]!;
    const vertical = borders[0]! + borders[2]!;
    const borderBoxSize = (value: string, offset: number, extra: number): number =>
      Math.max(1, (value.endsWith('px') ? px(value) + extra : offset) || 1);
    const width = borderBoxSize(
      style.width,
      host.offsetWidth,
      style.boxSizing === 'border-box'
        ? 0
        : horizontal + px(style.paddingLeft) + px(style.paddingRight),
    );
    const height = borderBoxSize(
      style.height,
      host.offsetHeight,
      style.boxSizing === 'border-box'
        ? 0
        : vertical + px(style.paddingTop) + px(style.paddingBottom),
    );
    const thickness = Math.min(
      width,
      height,
      Math.max(0.5, Math.min(20, px(style.getPropertyValue('--wr-panel-progress-thickness')) || 3)),
    );
    const radius = (value: string): Corner => {
      const parts = value.trim().split(/\s+/u);
      const length = (part: string, dimension: number): number =>
        part.endsWith('%') ? (px(part) * dimension) / 100 : px(part);
      return [length(parts[0] ?? '0', width), length(parts[1] ?? parts[0] ?? '0', height)];
    };
    set(svg, 'viewBox', `0 0 ${width} ${height}`);
    const d = panelProgressPath(
      width,
      height,
      [
        style.borderTopLeftRadius,
        style.borderTopRightRadius,
        style.borderBottomRightRadius,
        style.borderBottomLeftRadius,
      ].map(radius),
    );
    for (const path of svg.querySelectorAll('path')) {
      set(path, 'd', d);
      set(path, 'stroke-width', String(thickness));
    }
    svg.style.top = `${-borders[0]!}px`;
    svg.style.left = `${-borders[3]!}px`;
    svg.style.width = `calc(100% + ${horizontal}px)`;
    svg.style.height = `calc(100% + ${vertical}px)`;
  };
  const schedule = (): void => {
    if (disposed || frame !== undefined || view === null) return;
    if (typeof view.requestAnimationFrame !== 'function') {
      refresh();
      return;
    }
    frame = view.requestAnimationFrame(() => {
      frame = undefined;
      refresh();
      if (transitioning > 0) schedule();
    });
  };
  const transitionStart = (event: Event): void => {
    if (event.target === host) {
      transitioning++;
      schedule();
    }
  };
  const transitionEnd = (event: Event): void => {
    if (event.target === host) {
      transitioning = Math.max(0, transitioning - 1);
      schedule();
    }
  };
  const resize = view?.ResizeObserver === undefined ? undefined : new view.ResizeObserver(schedule);
  resize?.observe(host);
  const mutations =
    view?.MutationObserver === undefined ? undefined : new view.MutationObserver(schedule);
  mutations?.observe(host, {
    attributes: true,
    attributeFilter: ['style', 'class', 'aria-disabled'],
  });
  const styles =
    view?.MutationObserver === undefined ? undefined : new view.MutationObserver(schedule);
  for (const sheet of host.ownerDocument.querySelectorAll('style'))
    styles?.observe(sheet, { subtree: true, childList: true, characterData: true });
  const events = ['mouseenter', 'mouseleave', 'focusin', 'focusout', 'pointerdown', 'pointerup'];
  for (const name of events) host.addEventListener(name, schedule);
  host.addEventListener('transitionrun', transitionStart);
  host.addEventListener('transitionend', transitionEnd);
  host.addEventListener('transitioncancel', transitionEnd);
  refresh();
  return {
    refresh,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      resize?.disconnect();
      mutations?.disconnect();
      styles?.disconnect();
      if (frame !== undefined) view?.cancelAnimationFrame(frame);
      for (const name of events) host.removeEventListener(name, schedule);
      host.removeEventListener('transitionrun', transitionStart);
      host.removeEventListener('transitionend', transitionEnd);
      host.removeEventListener('transitioncancel', transitionEnd);
    },
  };
}

const bindings = new WeakMap<
  HTMLElement,
  { svg: SVGSVGElement; binding: PanelProgressGeometryBinding }
>();

export function disposePanelProgress(host: HTMLElement): void {
  const existing = bindings.get(host);
  existing?.binding.dispose();
  existing?.svg.remove();
  bindings.delete(host);
}

export function renderPanelProgress(host: HTMLElement): void {
  const state = projectPanelProgress({
    progressEnabled: host.dataset.webradPanelProgressEnabled === 'true',
    progressValue: Number(host.dataset.webradPanelProgressValue ?? 0),
  });
  if (!state.visible) {
    disposePanelProgress(host);
    return;
  }
  let existing = bindings.get(host);
  if (existing === undefined) {
    const svg = host.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'wr-panel-progress');
    svg.setAttribute('role', 'progressbar');
    svg.setAttribute('aria-valuemin', '0');
    svg.setAttribute('aria-valuemax', '100');
    svg.setAttribute('preserveAspectRatio', 'none');
    for (const name of ['track', 'fill']) {
      const path = host.ownerDocument.createElementNS(svg.namespaceURI, 'path');
      path.setAttribute('class', `wr-panel-progress-${name}`);
      path.setAttribute('pathLength', '100');
      svg.append(path);
    }
    host.append(svg);
    existing = { svg, binding: bindPanelProgressGeometry(host, svg) };
    bindings.set(host, existing);
  }
  existing.svg.setAttribute('aria-label', `${host.dataset.webradName || 'Panel'} progress`);
  existing.svg.setAttribute('aria-valuenow', String(state.value));
  existing.svg.setAttribute('aria-valuetext', `${state.value}%`);
  existing.svg
    .querySelector('.wr-panel-progress-fill')
    ?.setAttribute('stroke-dasharray', `${state.value} 100`);
  existing.binding.refresh();
}
