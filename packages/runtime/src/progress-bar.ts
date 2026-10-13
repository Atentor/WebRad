import { WebComponent, type WebComponentEventHandler } from './component.js';

export type WebProgressBarFormat = 'bars' | 'dunnet' | 'circus';

export interface ProgressBarProjection {
  readonly format: WebProgressBarFormat;
  readonly min: number;
  readonly max: number;
  readonly value: number;
  readonly showValue: boolean;
  readonly percentage: number;
  readonly label: string;
  readonly shapes: readonly {
    readonly tag: 'rect' | 'circle' | 'path';
    readonly attributes: Readonly<Record<string, string>>;
  }[];
}

function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** Shared browser-safe geometry for the model's Designer and runtime projections. */
export function projectProgressBar(
  props: Readonly<Record<string, unknown>>,
): ProgressBarProjection {
  let min = finite(props.min, 0);
  let max = finite(props.max, 100);
  if (max <= min || !Number.isFinite(max - min)) {
    min = 0;
    max = 100;
  }
  const value = Math.min(max, Math.max(min, finite(props.value, min)));
  const percentage = ((value - min) / (max - min)) * 100;
  const format = props.format === 'dunnet' || props.format === 'circus' ? props.format : 'bars';
  const showValue = props.showValue !== false;
  const trackClass = 'wr-progress-track';
  const fillClass = 'wr-progress-fill';
  let shapes: ProgressBarProjection['shapes'];
  if (format === 'bars') {
    shapes = [
      {
        tag: 'rect',
        attributes: { class: trackClass, x: '0', y: '0', width: '100', height: '100' },
      },
      {
        tag: 'rect',
        attributes: { class: fillClass, x: '0', y: '0', width: String(percentage), height: '100' },
      },
    ];
  } else if (format === 'dunnet') {
    const circle = { cx: '50', cy: '50', r: '40', fill: 'none' };
    shapes = [
      { tag: 'circle', attributes: { ...circle, class: trackClass } },
      {
        tag: 'circle',
        attributes: {
          ...circle,
          class: fillClass,
          pathLength: '100',
          'stroke-dasharray': `${String(percentage)} 100`,
          transform: 'rotate(-90 50 50)',
        },
      },
    ];
  } else {
    const radians = (percentage / 100) * 2 * Math.PI;
    const x = 50 + 48 * Math.sin(radians);
    const y = 50 - 48 * Math.cos(radians);
    shapes = [{ tag: 'circle', attributes: { class: trackClass, cx: '50', cy: '50', r: '48' } }];
    if (percentage >= 100) {
      shapes = [
        ...shapes,
        { tag: 'circle', attributes: { class: fillClass, cx: '50', cy: '50', r: '48' } },
      ];
    } else if (percentage > 0) {
      shapes = [
        ...shapes,
        {
          tag: 'path',
          attributes: {
            class: fillClass,
            d: `M 50 50 L 50 2 A 48 48 0 ${percentage > 50 ? '1' : '0'} 1 ${String(x)} ${String(y)} Z`,
          },
        },
      ];
    }
  }
  return {
    format,
    min,
    max,
    value,
    showValue,
    percentage,
    label: `${String(Math.round(percentage))}%`,
    shapes,
  };
}

/** A determinate progress indicator. All wrappers share the element's live state. */
export class WebProgressBar extends WebComponent<HTMLElement> {
  public constructor(element: HTMLElement) {
    super(element);
    this.#render(this.#state());
  }

  #state(): ProgressBarProjection {
    const data = this.element.dataset;
    return projectProgressBar({
      min: data.webradProgressMin === undefined ? 0 : Number(data.webradProgressMin),
      max: data.webradProgressMax === undefined ? 100 : Number(data.webradProgressMax),
      value: data.webradProgressValue === undefined ? 0 : Number(data.webradProgressValue),
      format: data.webradProgressFormat,
      showValue: data.webradProgressShowValue !== 'false',
    });
  }

  public get value(): number {
    return this.#state().value;
  }
  public set value(value: number) {
    if (!Number.isFinite(value)) throw new RangeError('ProgressBar value must be finite.');
    this.#update({ ...this.#state(), value });
  }
  public get min(): number {
    return this.#state().min;
  }
  public set min(value: number) {
    this.setRange(value, this.max);
  }
  public get max(): number {
    return this.#state().max;
  }
  public set max(value: number) {
    this.setRange(this.min, value);
  }
  public get percentage(): number {
    return this.#state().percentage;
  }
  public get format(): WebProgressBarFormat {
    return this.#state().format;
  }
  public set format(value: WebProgressBarFormat) {
    if (value !== 'bars' && value !== 'dunnet' && value !== 'circus') {
      throw new RangeError('Unknown ProgressBar format.');
    }
    this.#update({ ...this.#state(), format: value });
  }
  public get showValue(): boolean {
    return this.#state().showValue;
  }
  public set showValue(value: boolean) {
    this.#update({ ...this.#state(), showValue: value });
  }

  /** Sets both boundaries atomically and clamps the current value to them. */
  public setRange(min: number, max: number): void {
    if (
      !Number.isFinite(min) ||
      !Number.isFinite(max) ||
      max <= min ||
      !Number.isFinite(max - min)
    ) {
      throw new RangeError('ProgressBar requires finite min < max.');
    }
    this.#update({ ...this.#state(), min, max });
  }
  public increment(amount = 1): void {
    this.value += amount;
  }
  public reset(): void {
    this.value = this.min;
  }
  public set onChange(handler: WebComponentEventHandler<this> | null) {
    this.bindEvent('OnChange', handler);
  }

  #update(props: Readonly<Record<string, unknown>>): void {
    const previousValue = this.value;
    const state = projectProgressBar(props);
    this.#render(state);
    if (state.value !== previousValue) {
      const event = this.element.ownerDocument.createEvent('Event');
      event.initEvent('change', false, false);
      this.element.dispatchEvent(event);
    }
  }

  #render(state: ProgressBarProjection): void {
    const { element } = this;
    const document = element.ownerDocument;
    element.dataset.webradProgressFormat = state.format;
    element.dataset.webradProgressMin = String(state.min);
    element.dataset.webradProgressMax = String(state.max);
    element.dataset.webradProgressValue = String(state.value);
    element.dataset.webradProgressShowValue = String(state.showValue);
    element.setAttribute('role', 'progressbar');
    element.setAttribute(
      'aria-label',
      this.name || element.getAttribute('aria-label') || 'Progress',
    );
    element.setAttribute('aria-valuemin', String(state.min));
    element.setAttribute('aria-valuemax', String(state.max));
    element.setAttribute('aria-valuenow', String(state.value));
    element.setAttribute('aria-valuetext', state.label);
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'wr-progress-graphic');
    svg.setAttribute('viewBox', '0 0 100 100');
    svg.setAttribute('preserveAspectRatio', state.format === 'bars' ? 'none' : 'xMidYMid meet');
    svg.setAttribute('aria-hidden', 'true');
    for (const shape of state.shapes) {
      const child = document.createElementNS(svg.namespaceURI, shape.tag);
      for (const [key, value] of Object.entries(shape.attributes)) child.setAttribute(key, value);
      svg.append(child);
    }
    const label = document.createElement('span');
    label.className = 'wr-progress-label';
    label.setAttribute('aria-hidden', 'true');
    label.hidden = !state.showValue;
    label.textContent = state.label;
    element.replaceChildren(svg, label);
  }
}
