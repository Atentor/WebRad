import {
  formatWebChartValue,
  webChartSliceColor,
  type WebChartPoint,
  type WebChartPointEventDetail,
  type WebChartSeriesData,
  type WebChartsConfiguration,
} from './charts-data.js';
import { WEBRAD_FONT_FAMILIES } from './fonts.js';
import { createLucideIconElement } from './icon.js';

export interface WebChartsRenderOptions {
  readonly interactive?: boolean;
  readonly width?: number;
  readonly height?: number;
  readonly onPointClick?: (detail: WebChartPointEventDetail) => void;
}

interface ChartCategory {
  readonly key: string;
  readonly label: string;
}

interface ChartMark {
  readonly point: WebChartPoint;
  readonly index: number;
}

interface Plot {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

interface ChartSegment {
  readonly coordinates: (readonly [number, number])[];
  readonly bases: (readonly [number, number])[];
  readonly points: ChartMark[];
}

const SVG_NS = 'http://www.w3.org/2000/svg';
const TAU = Math.PI * 2;

function svgElement<K extends keyof SVGElementTagNameMap>(
  document: Document,
  tag: K,
  attributes: Readonly<Record<string, string | number>> = {},
): SVGElementTagNameMap[K] {
  const element = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, String(value));
  return element;
}

function text(
  root: SVGElement,
  label: string,
  x: number,
  y: number,
  attributes: Readonly<Record<string, string | number>> = {},
): SVGTextElement {
  const fontSize = attributes['font-size'];
  const element = svgElement(root.ownerDocument, 'text', {
    x,
    y,
    fill: 'currentColor',
    ...attributes,
    'font-size':
      typeof fontSize === 'number'
        ? `${String(fontSize / 14)}em`
        : (fontSize ?? `${String(11 / 14)}em`),
  });
  element.textContent = label;
  root.append(element);
  return element;
}

function shorten(value: string, maximum: number): string {
  return value.length > maximum ? `${value.slice(0, Math.max(1, maximum - 1))}…` : value;
}

function line(
  root: SVGElement,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  opacity = 0.12,
): void {
  root.append(
    svgElement(root.ownerDocument, 'line', {
      x1,
      y1,
      x2,
      y2,
      stroke: 'currentColor',
      'stroke-opacity': opacity,
      'stroke-width': 1,
    }),
  );
}

function activate(
  element: SVGElement,
  series: WebChartSeriesData,
  point: WebChartPoint,
  index: number,
  configuration: WebChartsConfiguration,
  options: WebChartsRenderOptions,
): void {
  const label = `${series.name}, ${point.label}: ${formatWebChartValue(point.value, configuration)}`;
  const title = svgElement(element.ownerDocument, 'title');
  title.textContent = label;
  element.append(title);
  element.setAttribute('aria-label', label);
  element.dataset.chartPoint = String(index);
  element.dataset.chartSeries = series.id;
  if (!options.interactive) return;
  element.setAttribute('role', 'button');
  element.setAttribute('tabindex', '0');
  element.style.cursor = 'pointer';
  const select = (): void =>
    options.onPointClick?.({
      label: point.label,
      value: point.value,
      seriesId: series.id,
      seriesName: series.name,
      index,
    });
  element.addEventListener('click', select);
  element.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      select();
    }
  });
}

function categories(data: readonly WebChartSeriesData[]): {
  readonly categories: readonly ChartCategory[];
  readonly marks: readonly ReadonlyMap<string, ChartMark>[];
} {
  const known = new Map<string, ChartCategory>();
  const marks = data.map((series) => {
    const counts = new Map<string, number>();
    const result = new Map<string, ChartMark>();
    series.points.forEach((point, index) => {
      const occurrence = counts.get(point.label) ?? 0;
      counts.set(point.label, occurrence + 1);
      const key = JSON.stringify([point.label, occurrence]);
      if (!known.has(key)) known.set(key, { key, label: point.label });
      result.set(key, { point, index });
    });
    return result;
  });
  return { categories: [...known.values()], marks };
}

function niceExtent(minimum: number, maximum: number): readonly [number, number, number] {
  const span = maximum - minimum || Math.max(1, Math.abs(maximum));
  const rawStep = span / 4;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const normalized = rawStep / magnitude;
  const step = (normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10) * magnitude;
  return [Math.floor(minimum / step) * step, Math.ceil(maximum / step) * step || step, step];
}

/** Work in units of the largest point so both sums and subnormal inputs stay finite. */
function chartUnit(data: readonly WebChartSeriesData[]): number {
  let largest = 0;
  for (const series of data) {
    for (const point of series.points) largest = Math.max(largest, Math.abs(point.value));
  }
  return largest || 1;
}

/** Axis labels may represent stacked totals outside JavaScript's numeric range. */
function formatAxisValue(
  value: number,
  unit: number,
  configuration: WebChartsConfiguration,
): string {
  if (value === 0) return formatWebChartValue(0, configuration);
  const actual = value * unit;
  if (Number.isFinite(actual) && Math.abs(actual) >= 0.001 && Math.abs(actual) < 1_000_000_000) {
    return formatWebChartValue(actual, configuration);
  }
  const logarithm = Math.log10(Math.abs(value)) + Math.log10(unit);
  const exponent = Math.floor(logarithm);
  const coefficient = (value < 0 ? -1 : 1) * 10 ** (logarithm - exponent);
  return `${configuration.valuePrefix}${coefficient.toFixed(1)}e${String(exponent)}${configuration.valueSuffix}`;
}

function curve(points: readonly (readonly [number, number])[], smooth: boolean): string {
  const first = points[0];
  if (!first) return '';
  let path = `M ${String(first[0])} ${String(first[1])}`;
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    if (!previous || !current) continue;
    if (smooth) {
      const center = (previous[0] + current[0]) / 2;
      path += ` C ${String(center)} ${String(previous[1])} ${String(center)} ${String(current[1])} ${String(current[0])} ${String(current[1])}`;
    } else path += ` L ${String(current[0])} ${String(current[1])}`;
  }
  return path;
}

function drawCartesian(
  root: SVGSVGElement,
  configuration: WebChartsConfiguration,
  data: readonly WebChartSeriesData[],
  plot: Plot,
  options: WebChartsRenderOptions,
): void {
  const { categories: labels, marks } = categories(data);
  if (labels.length === 0) return;
  const horizontal = configuration.type === 'horizontalBar';
  const bars = configuration.type === 'bar' || horizontal;
  const unit = chartUnit(data);
  let minimum = 0;
  let maximum = 0;
  for (const category of labels) {
    let positive = 0;
    let negative = 0;
    for (const entries of marks) {
      const value = (entries.get(category.key)?.point.value ?? 0) / unit;
      if (configuration.stacked) {
        positive += Math.max(0, value);
        negative += Math.min(0, value);
      } else {
        maximum = Math.max(maximum, value);
        minimum = Math.min(minimum, value);
      }
    }
    if (configuration.stacked) {
      maximum = Math.max(maximum, positive);
      minimum = Math.min(minimum, negative);
    }
  }
  const [low, high, step] = niceExtent(minimum, maximum);
  const domain = high - low || 1;
  const area = {
    x: plot.x + (horizontal ? Math.min(104, plot.width * 0.24) : 68),
    y: plot.y + 14,
    width: Math.max(32, plot.width - (horizontal ? Math.min(104, plot.width * 0.24) : 68) - 22),
    height: Math.max(32, plot.height - 54),
  };
  const scale = (value: number): number =>
    horizontal
      ? area.x + ((value - low) / domain) * area.width
      : area.y + ((high - value) / domain) * area.height;
  const zero = scale(0);
  // The axis always has a small fixed number of ticks, regardless of response size.
  const ticks = Math.min(12, Math.round(domain / step));
  for (let tick = 0; tick <= ticks; tick += 1) {
    const value = low + step * tick;
    const position = scale(value);
    if (configuration.showGrid) {
      if (horizontal) line(root, position, area.y, position, area.y + area.height);
      else line(root, area.x, position, area.x + area.width, position);
    }
    text(
      root,
      shorten(formatAxisValue(value, unit, configuration), 13),
      horizontal ? position : area.x - 10,
      horizontal ? area.y + area.height + 23 : position + 4,
      { 'text-anchor': horizontal ? 'middle' : 'end', opacity: 0.62, 'font-size': 10 },
    );
  }
  if (horizontal) line(root, zero, area.y, zero, area.y + area.height, 0.24);
  else line(root, area.x, zero, area.x + area.width, zero, 0.24);
  const slot = (horizontal ? area.height : area.width) / labels.length;
  const labelCapacity = Math.max(
    2,
    Math.floor((horizontal ? area.height : area.width) / (horizontal ? 27 : 76)),
  );
  const labelEvery = Math.max(1, Math.ceil(labels.length / labelCapacity));
  labels.forEach((category, index) => {
    if (index % labelEvery !== 0) return;
    const position = (horizontal ? area.y : area.x) + slot * (index + 0.5);
    text(
      root,
      shorten(category.label, horizontal ? 15 : Math.max(4, Math.floor((slot * labelEvery) / 7))),
      horizontal ? area.x - 10 : position,
      horizontal ? position + 4 : area.y + area.height + 23,
      { 'text-anchor': horizontal ? 'end' : 'middle', opacity: 0.72, 'font-size': 10 },
    );
  });
  const positives = new Map<string, number>();
  const negatives = new Map<string, number>();
  data.forEach((series, seriesIndex) => {
    const seriesMarks = marks[seriesIndex];
    const segments: ChartSegment[] = [];
    let segment: ChartSegment = { coordinates: [], bases: [], points: [] };
    segments.push(segment);
    labels.forEach((category, categoryIndex) => {
      const mark = seriesMarks?.get(category.key);
      if (!mark) {
        if (segment.points.length > 0) {
          segment = { coordinates: [], bases: [], points: [] };
          segments.push(segment);
        }
        return;
      }
      const accumulated = mark.point.value < 0 ? negatives : positives;
      const base = configuration.stacked ? (accumulated.get(category.key) ?? 0) : 0;
      const normalizedValue = mark.point.value / unit;
      if (configuration.stacked) accumulated.set(category.key, base + normalizedValue);
      const valuePosition = scale(base + normalizedValue);
      const basePosition = scale(base);
      const categoryPosition = (horizontal ? area.y : area.x) + slot * (categoryIndex + 0.5);
      if (bars) {
        const barWidth = (slot * 0.7) / (configuration.stacked ? 1 : Math.max(1, data.length));
        const offset = configuration.stacked
          ? -barWidth / 2
          : -slot * 0.35 + seriesIndex * barWidth;
        const rect = svgElement(root.ownerDocument, 'rect', {
          x: horizontal ? Math.min(valuePosition, basePosition) : categoryPosition + offset,
          y: horizontal ? categoryPosition + offset : Math.min(valuePosition, basePosition),
          width: horizontal
            ? Math.max(1, Math.abs(valuePosition - basePosition))
            : Math.max(0.5, barWidth - 2),
          height: horizontal
            ? Math.max(0.5, barWidth - 2)
            : Math.max(1, Math.abs(valuePosition - basePosition)),
          rx: configuration.stacked ? 1 : 3,
          fill: series.color,
        });
        activate(rect, series, mark.point, mark.index, configuration, options);
        root.append(rect);
        if (configuration.showLabels)
          text(
            root,
            formatWebChartValue(mark.point.value, configuration),
            horizontal
              ? valuePosition + (mark.point.value < 0 ? -6 : 6)
              : categoryPosition + offset + barWidth / 2,
            horizontal
              ? categoryPosition + offset + barWidth / 2 + 3
              : valuePosition + (mark.point.value < 0 ? 13 : -7),
            {
              'text-anchor': horizontal ? (mark.point.value < 0 ? 'end' : 'start') : 'middle',
              'font-size': 9,
            },
          );
      } else {
        segment.coordinates.push([categoryPosition, valuePosition]);
        segment.bases.push([categoryPosition, basePosition]);
        segment.points.push(mark);
      }
    });
    if (bars) return;
    for (const part of segments) {
      if (part.coordinates.length === 0) continue;
      const path = curve(part.coordinates, configuration.smooth);
      if (configuration.type === 'area') {
        const reverse = [...part.bases].reverse();
        const firstBase = reverse[0];
        if (firstBase)
          root.append(
            svgElement(root.ownerDocument, 'path', {
              d: `${path} L ${String(firstBase[0])} ${String(firstBase[1])} ${curve(reverse, false).replace(/^M [^ ]+ [^ ]+/u, '')} Z`,
              fill: series.color,
              'fill-opacity': configuration.stacked ? 0.3 : 0.14,
              stroke: 'none',
            }),
          );
      }
      root.append(
        svgElement(root.ownerDocument, 'path', {
          d: path,
          fill: 'none',
          stroke: series.color,
          'stroke-width': 2.5,
          'stroke-linejoin': 'round',
        }),
      );
      part.coordinates.forEach((position, index) => {
        const mark = part.points[index];
        if (!mark) return;
        const circle = svgElement(root.ownerDocument, 'circle', {
          cx: position[0],
          cy: position[1],
          r: 4,
          fill: series.color,
          stroke: 'currentColor',
          'stroke-opacity': 0.2,
          'stroke-width': 1.5,
        });
        activate(circle, series, mark.point, mark.index, configuration, options);
        root.append(circle);
        if (configuration.showLabels)
          text(
            root,
            formatWebChartValue(mark.point.value, configuration),
            position[0],
            position[1] - 10,
            { 'text-anchor': 'middle', 'font-size': 9 },
          );
      });
    }
  });
}

function polarPoint(
  cx: number,
  cy: number,
  radius: number,
  angle: number,
): readonly [number, number] {
  return [cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius];
}

function ringPath(
  cx: number,
  cy: number,
  outer: number,
  inner: number,
  start: number,
  end: number,
): string {
  const span = Math.min(TAU - 0.00001, Math.max(0, end - start));
  const outerStart = polarPoint(cx, cy, outer, start);
  const outerEnd = polarPoint(cx, cy, outer, start + span);
  const large = span > Math.PI ? 1 : 0;
  const outerPath = `M ${String(outerStart[0])} ${String(outerStart[1])} A ${String(outer)} ${String(outer)} 0 ${String(large)} 1 ${String(outerEnd[0])} ${String(outerEnd[1])}`;
  if (inner === 0) return `${outerPath} L ${String(cx)} ${String(cy)} Z`;
  const innerEnd = polarPoint(cx, cy, inner, start + span);
  const innerStart = polarPoint(cx, cy, inner, start);
  return `${outerPath} L ${String(innerEnd[0])} ${String(innerEnd[1])} A ${String(inner)} ${String(inner)} 0 ${String(large)} 0 ${String(innerStart[0])} ${String(innerStart[1])} Z`;
}

function drawCircular(
  root: SVGSVGElement,
  configuration: WebChartsConfiguration,
  data: readonly WebChartSeriesData[],
  plot: Plot,
  options: WebChartsRenderOptions,
): void {
  const columns = Math.min(data.length, plot.width < 400 ? 2 : 3);
  const rows = Math.ceil(data.length / Math.max(1, columns));
  const cellWidth = plot.width / Math.max(1, columns);
  const cellHeight = plot.height / Math.max(1, rows);
  let omitted = 0;
  data.forEach((series, seriesIndex) => {
    const cx = plot.x + cellWidth * ((seriesIndex % Math.max(1, columns)) + 0.5);
    const cy = plot.y + cellHeight * (Math.floor(seriesIndex / Math.max(1, columns)) + 0.5) - 7;
    const radius = Math.max(12, Math.min(cellWidth, cellHeight) * 0.36);
    const points = series.points
      .map((point, index) => ({ point, index }))
      .filter(({ point }) => point.value >= 0);
    omitted += series.points.length - points.length;
    const total = points.reduce((sum, { point }) => sum + point.value, 0);
    const maximum = points.reduce((largest, { point }) => Math.max(largest, point.value), 0) || 1;
    const relativeTotal = points.reduce((sum, { point }) => sum + point.value / maximum, 0);
    root.append(
      svgElement(root.ownerDocument, 'circle', {
        cx,
        cy,
        r: radius,
        fill: 'currentColor',
        'fill-opacity': 0.04,
      }),
    );
    if (configuration.type === 'polarArea' && configuration.showGrid) {
      for (let level = 1; level <= 4; level += 1) {
        root.append(
          svgElement(root.ownerDocument, 'circle', {
            cx,
            cy,
            r: (radius * level) / 4,
            fill: 'none',
            stroke: 'currentColor',
            'stroke-opacity': 0.15,
          }),
        );
      }
    }
    let angle = -Math.PI / 2;
    points.forEach(({ point, index }, colorIndex) => {
      const span =
        configuration.type === 'polarArea'
          ? TAU / Math.max(1, points.length)
          : relativeTotal === 0
            ? 0
            : (TAU * (point.value / maximum)) / relativeTotal;
      const start = angle;
      angle += span;
      if (point.value === 0) return;
      const outer =
        configuration.type === 'polarArea' ? radius * Math.sqrt(point.value / maximum) : radius;
      const inner =
        configuration.type === 'doughnut' ? (radius * configuration.innerRadius) / 100 : 0;
      const color = webChartSliceColor(series.color, colorIndex);
      const path = svgElement(root.ownerDocument, 'path', {
        d: ringPath(cx, cy, outer, inner, start, start + span),
        fill: color,
        stroke: 'currentColor',
        'stroke-opacity': 0.18,
        'stroke-width': 2,
      });
      activate(path, series, point, index, configuration, options);
      root.append(path);
      if (configuration.showLabels && span > 0.25) {
        const position = polarPoint(cx, cy, inner + (outer - inner) * 0.6, start + span / 2);
        text(
          root,
          shorten(formatWebChartValue(point.value, configuration), 10),
          position[0],
          position[1] + 3,
          {
            'text-anchor': 'middle',
            fill: configuration.textColor ?? '#fff',
            'font-size': 9,
            'font-weight': 600,
          },
        );
      }
    });
    if (configuration.type === 'doughnut') {
      const totalLabel = Number.isFinite(total)
        ? formatWebChartValue(total, configuration)
        : 'Total exceeds range';
      const label = text(root, shorten(totalLabel, 18), cx, cy + 5, {
        'text-anchor': 'middle',
        'font-size': Number.isFinite(total) ? Math.max(11, Math.min(22, radius * 0.24)) : 10,
        'font-weight': 650,
      });
      if (!Number.isFinite(total)) {
        const title = svgElement(root.ownerDocument, 'title');
        title.textContent =
          'The sum exceeds the maximum JavaScript numeric value. Individual values remain available in the chart data table.';
        label.append(title);
      }
    }
    if (total === 0)
      text(root, 'No positive values', cx, cy + (configuration.type === 'doughnut' ? 23 : 4), {
        'text-anchor': 'middle',
        opacity: 0.6,
        'font-size': 10,
      });
    if (data.length > 1)
      text(root, shorten(series.name, 24), cx, cy + radius + 21, {
        'text-anchor': 'middle',
        'font-size': 11,
        'font-weight': 600,
      });
  });
  if (omitted > 0)
    text(
      root,
      `${String(omitted)} negative ${omitted === 1 ? 'value is' : 'values are'} excluded from circular charts`,
      plot.x + plot.width / 2,
      plot.y + plot.height - 2,
      { 'text-anchor': 'middle', 'font-size': 9, opacity: 0.65 },
    );
}

function drawRadar(
  root: SVGSVGElement,
  configuration: WebChartsConfiguration,
  data: readonly WebChartSeriesData[],
  plot: Plot,
  options: WebChartsRenderOptions,
): void {
  const { categories: labels, marks } = categories(data);
  if (labels.length === 0) return;
  const cx = plot.x + plot.width / 2;
  const cy = plot.y + plot.height / 2;
  const radius = Math.max(12, Math.min(plot.width - 100, plot.height - 50) / 2);
  const unit = chartUnit(data);
  let minimum = 0;
  let maximum = 0;
  for (const series of data) {
    for (const point of series.points) {
      minimum = Math.min(minimum, point.value / unit);
      maximum = Math.max(maximum, point.value / unit);
    }
  }
  if (minimum === maximum) maximum = minimum + 1;
  const position = (index: number, value: number): readonly [number, number] =>
    polarPoint(cx, cy, value, -Math.PI / 2 + (TAU * index) / Math.max(3, labels.length));
  if (configuration.showGrid) {
    for (let level = 1; level <= 4; level += 1) {
      const vertices = Array.from({ length: Math.max(3, labels.length) }, (_, index) =>
        position(index, (radius * level) / 4),
      );
      root.append(
        svgElement(root.ownerDocument, 'polygon', {
          points: vertices.map((point) => point.join(',')).join(' '),
          fill: 'none',
          stroke: 'currentColor',
          'stroke-opacity': 0.12,
        }),
      );
    }
  }
  labels.forEach((category, index) => {
    const edge = position(index, radius);
    if (configuration.showGrid) line(root, cx, cy, edge[0], edge[1]);
    const label = position(index, radius + 16);
    text(root, shorten(category.label, 18), label[0], label[1] + 3, {
      'text-anchor': label[0] < cx - 4 ? 'end' : label[0] > cx + 4 ? 'start' : 'middle',
      'font-size': 10,
      opacity: 0.72,
    });
  });
  if (minimum < 0)
    text(
      root,
      `Scale: ${formatAxisValue(minimum, unit, configuration)} to ${formatAxisValue(maximum, unit, configuration)}`,
      plot.x + 4,
      plot.y + plot.height - 3,
      { 'font-size': 9, opacity: 0.65 },
    );
  data.forEach((series, seriesIndex) => {
    const entries = marks[seriesIndex];
    const points = labels.map((category, index) => {
      const mark = entries?.get(category.key);
      return {
        mark,
        position: mark
          ? position(index, (radius * (mark.point.value / unit - minimum)) / (maximum - minimum))
          : null,
      };
    });
    const complete = points.every(({ position: point }) => point !== null);
    if (complete) {
      root.append(
        svgElement(root.ownerDocument, 'polygon', {
          points: points
            .flatMap(({ position: point }) => (point ? [point.join(',')] : []))
            .join(' '),
          fill: series.color,
          'fill-opacity': 0.12,
          stroke: series.color,
          'stroke-width': 2,
        }),
      );
    } else {
      // Missing categories break the outline; they are never projected as zero.
      points.forEach(({ position: point }, index) => {
        const next = points[(index + 1) % points.length]?.position;
        if (point && next)
          root.append(
            svgElement(root.ownerDocument, 'line', {
              x1: point[0],
              y1: point[1],
              x2: next[0],
              y2: next[1],
              stroke: series.color,
              'stroke-width': 2,
            }),
          );
      });
    }
    points.forEach(({ mark, position: point }) => {
      if (!mark || !point) return;
      const circle = svgElement(root.ownerDocument, 'circle', {
        cx: point[0],
        cy: point[1],
        r: 4,
        fill: series.color,
      });
      activate(circle, series, mark.point, mark.index, configuration, options);
      root.append(circle);
      if (configuration.showLabels)
        text(root, formatWebChartValue(mark.point.value, configuration), point[0], point[1] - 9, {
          'text-anchor': 'middle',
          'font-size': 9,
        });
    });
  });
}

/** Shared SVG projection. It creates no subscriptions, observers or API requests. */
export function renderChartsSvg(
  document: Document,
  configuration: WebChartsConfiguration,
  data: readonly WebChartSeriesData[],
  options: WebChartsRenderOptions = {},
): SVGSVGElement {
  const width = Math.max(260, options.width ?? 640);
  const height = Math.max(180, options.height ?? 360);
  const root = svgElement(document, 'svg', {
    viewBox: `0 0 ${String(width)} ${String(height)}`,
    width: '100%',
    height: '100%',
    preserveAspectRatio: 'xMidYMid meet',
    role: 'group',
    'aria-label': configuration.title || 'Chart',
  });
  root.classList.add('wr-charts-svg');
  root.style.display = 'block';
  const fontStack = (id: string | undefined): string => {
    const font = WEBRAD_FONT_FAMILIES.find((candidate) => candidate.id === id);
    return font === undefined
      ? 'inherit'
      : `'${font.label}', '${font.label} Variable', ${font.fallback}`;
  };
  root.style.fontFamily = fontStack(configuration.fontFamily);
  root.style.fontSize = 'inherit';
  if (configuration.textColor != null) root.style.color = configuration.textColor;
  root.style.overflow = 'hidden';
  const stylesheet = svgElement(document, 'style');
  stylesheet.textContent =
    '.wr-charts-svg [role="button"]:focus-visible{outline:none;stroke:currentColor;stroke-width:3;paint-order:stroke fill}.wr-charts-svg [role="button"]:hover{opacity:.8}';
  root.append(stylesheet);
  let headerHeight = 12;
  if (configuration.title) {
    const titleX = configuration.titleIcon == null ? 20 : 49;
    const titleColor = configuration.titleColor ?? 'currentColor';
    if (configuration.titleIcon != null) {
      const icon = createLucideIconElement(document, configuration.titleIcon);
      icon.dataset.chartTitleIcon = configuration.titleIcon;
      for (const [name, value] of Object.entries({ x: '20', y: '11', width: '21', height: '21' }))
        icon.setAttribute(name, value);
      icon.style.color = titleColor;
      root.append(icon);
    }
    const title = text(
      root,
      shorten(configuration.title, Math.floor((width - titleX - 20) / 9)),
      titleX,
      28,
      { 'font-size': 17, 'font-weight': 650, fill: titleColor },
    );
    title.dataset.chartTitle = '';
    headerHeight = 44;
  }
  if (configuration.subtitle) {
    const subtitle = text(
      root,
      shorten(configuration.subtitle, Math.floor(width / 7)),
      20,
      headerHeight + 7,
      {
        'font-size': 11,
        fill: configuration.subtitleColor ?? 'currentColor',
        opacity: configuration.subtitleColor == null ? 0.58 : 1,
      },
    );
    subtitle.dataset.chartSubtitle = '';
    headerHeight += 24;
  }
  const circular = ['doughnut', 'pie', 'polarArea'].includes(configuration.type);
  const legendItems = circular
    ? data.flatMap((series) =>
        series.points
          .filter((point) => point.value >= 0)
          .map((point, index) => ({
            label: data.length > 1 ? `${series.name} · ${point.label}` : point.label,
            color: webChartSliceColor(series.color, index),
          })),
      )
    : data.map((series) => ({ label: series.name, color: series.color }));
  const rightLegend =
    configuration.showLegend && configuration.legendPosition === 'right' && width >= 440;
  const legendWidth = rightLegend ? Math.min(150, width * 0.24) : 0;
  const bottomLegendRows = Math.ceil(
    legendItems.length / Math.max(1, Math.floor((width - 24) / 135)),
  );
  const legendHeight =
    configuration.showLegend && !rightLegend
      ? Math.min(height * 0.3, bottomLegendRows * 22 + 8)
      : 0;
  const plot = {
    x: 12,
    y: headerHeight,
    width: width - 24 - legendWidth,
    height: Math.max(60, height - headerHeight - legendHeight - 10),
  };
  if (data.every((series) => series.points.length === 0)) {
    text(
      root,
      configuration.emptyText || 'No data to display',
      width / 2,
      headerHeight + plot.height / 2,
      { 'text-anchor': 'middle', 'font-size': 13, opacity: 0.58 },
    );
  } else if (circular) drawCircular(root, configuration, data, plot, options);
  else if (configuration.type === 'radar') drawRadar(root, configuration, data, plot, options);
  else drawCartesian(root, configuration, data, plot, options);
  if (configuration.showLegend) {
    const columns = Math.max(1, Math.floor((width - 24) / 135));
    const capacity = rightLegend
      ? Math.max(1, Math.floor((height - headerHeight - 30) / 24) + 1)
      : Math.max(1, Math.floor((legendHeight - 24) / 22) + 1) * columns;
    const overflow = legendItems.length > capacity;
    const visibleCount = overflow ? Math.max(0, capacity - 1) : legendItems.length;
    const displayed = legendItems.slice(0, visibleCount);
    if (overflow)
      displayed.push({
        label: `+${String(legendItems.length - visibleCount)} more`,
        color: 'currentColor',
      });
    displayed.forEach((item, index) => {
      const x = rightLegend
        ? width - legendWidth + 4
        : 22 + (index % columns) * ((width - 24) / columns);
      const y = rightLegend
        ? headerHeight + 22 + index * 24
        : height - legendHeight + 16 + Math.floor(index / columns) * 22;
      root.append(
        svgElement(document, 'rect', {
          x,
          y: y - 7,
          width: 8,
          height: 8,
          rx: 2,
          fill: item.color,
        }),
      );
      const labelWidth = rightLegend ? legendWidth - 26 : (width - 24) / columns - 27;
      const label = text(root, shorten(item.label, Math.floor(labelWidth / 6)), x + 15, y, {
        'font-size': 10,
        fill: configuration.legendColor ?? 'currentColor',
        opacity: configuration.legendColor == null ? 0.76 : 1,
      });
      label.dataset.chartLegend = '';
      label.style.fontFamily = fontStack(configuration.legendFontFamily);
      if (overflow && index === displayed.length - 1) {
        const title = svgElement(document, 'title');
        title.textContent =
          'Additional categories are available through each chart point and the complete accessible chart data table.';
        label.append(title);
      }
    });
  }
  return root;
}
