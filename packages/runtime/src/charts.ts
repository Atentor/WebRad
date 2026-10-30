import type { WebApiClient } from './api-client.js';
import { WebComponent } from './component.js';
import {
  formatWebChartValue,
  freezeWebChartData,
  normalizeWebChartsConfiguration,
  webChartPoints,
  type WebChartPointEventDetail,
  type WebChartSeriesData,
  type WebChartsConfiguration,
} from './charts-data.js';
import { renderChartsSvg } from './charts-render.js';

interface ChartBinding {
  readonly apiClient: WebApiClient;
  readonly operationId: string;
  readonly refresh: () => void;
  readonly dispose: () => void;
}

interface ChartState {
  configuration: WebChartsConfiguration;
  data: readonly WebChartSeriesData[];
  readonly bindings: Map<string, ChartBinding>;
  observer: ResizeObserver | null;
  selected: WebChartPointEventDetail | null;
  disposed: boolean;
  width: number;
  height: number;
}

// The adapter and generated authored class can wrap the same physical component.
// Keep all chart state and subscriptions on that physical instance.
const chartStates = new WeakMap<HTMLElement, ChartState>();

export type WebChartPointEventHandler<TSender = WebCharts> = (
  sender: TSender,
  event: CustomEvent<WebChartPointEventDetail>,
) => void | Promise<void>;

/** Responsive, accessible SVG charts whose API bindings observe completed requests. */
export class WebCharts extends WebComponent {
  readonly #state: ChartState;

  public constructor(element: HTMLElement) {
    super(element);
    const existing = chartStates.get(element);
    if (existing && !existing.disposed) {
      this.#state = existing;
      return;
    }
    this.#state = {
      configuration: normalizeWebChartsConfiguration(undefined),
      data: Object.freeze([]),
      bindings: new Map(),
      observer: null,
      selected: null,
      disposed: false,
      width: element.clientWidth || 640,
      height: element.clientHeight || 360,
    };
    chartStates.set(element, this.#state);
    element.classList.add('wr-charts');
    element.style.overflow = 'hidden';
    element.style.minWidth = '0';
    element.style.minHeight = '0';
    element.setAttribute('role', 'region');
    const Observer = element.ownerDocument.defaultView?.ResizeObserver;
    if (Observer) {
      this.#state.observer = new Observer((entries) => {
        const rectangle = entries[0]?.contentRect;
        if (!rectangle || rectangle.width <= 0 || rectangle.height <= 0 || this.#state.disposed)
          return;
        if (
          Math.abs(rectangle.width - this.#state.width) < 1 &&
          Math.abs(rectangle.height - this.#state.height) < 1
        )
          return;
        this.#state.width = rectangle.width;
        this.#state.height = rectangle.height;
        this.#render();
      });
      this.#state.observer.observe(element);
    }
    this.#render();
  }

  /** Persisted chart appearance and up to five declarative API series. */
  public get chartsConfig(): WebChartsConfiguration {
    return this.#state.configuration;
  }

  public set chartsConfig(value: WebChartsConfiguration) {
    const previousConfiguration = this.#state.configuration;
    const configuration = normalizeWebChartsConfiguration(value);
    this.#state.configuration = configuration;
    const invalidated = new Set<string>();
    for (const [id, binding] of this.#state.bindings) {
      const series = configuration.series.find((candidate) => candidate.id === id);
      if (
        !series ||
        series.operationId !== binding.operationId ||
        series.apiClientId !== binding.apiClient.id
      ) {
        invalidated.add(id);
        binding.dispose();
      }
    }
    const configuredIds = new Set(configuration.series.map((series) => series.id));
    const previouslyConfiguredIds = new Set(
      previousConfiguration.series.map((series) => series.id),
    );
    this.#state.data = freezeWebChartData(
      this.#state.data
        .filter(
          (series) =>
            !invalidated.has(series.id) &&
            (configuredIds.has(series.id) || !previouslyConfiguredIds.has(series.id)),
        )
        .map((series) => {
          const definition = configuration.series.find((candidate) => candidate.id === series.id);
          return definition
            ? { ...series, name: definition.name, color: definition.color }
            : series;
        }),
    );
    for (const binding of this.#state.bindings.values()) binding.refresh();
    this.#resetSelection();
    this.#render();
  }

  /** Current transient series. Values remain numeric and never enter the Project Model. */
  public get data(): readonly WebChartSeriesData[] {
    return this.#state.data;
  }

  public set data(value: readonly WebChartSeriesData[]) {
    this.#state.data = freezeWebChartData(value);
    this.#resetSelection();
    this.#render();
  }

  public get selectedLabel(): string | null {
    return this.#state.selected?.label ?? null;
  }

  public get selectedValue(): number | null {
    return this.#state.selected?.value ?? null;
  }

  public get selectedSeriesId(): string | null {
    return this.#state.selected?.seriesId ?? null;
  }

  public set onPointClick(handler: WebChartPointEventHandler<this> | null) {
    this.bindEvent(
      'OnPointClick',
      handler === null
        ? null
        : (sender, event) => handler(sender, event as CustomEvent<WebChartPointEventDetail>),
    );
  }

  /** Clears displayed points; an existing binding can refresh after the next successful request. */
  public clear(): void {
    this.#state.data = Object.freeze([]);
    this.#resetSelection();
    this.#render();
  }

  /**
   * Binds one configured series to a named API operation by stable operation ID.
   * Reads existing successful data and subsequent results; never executes a request.
   */
  public bindApiClient(apiClient: WebApiClient, operationId: string, seriesId: string): () => void {
    if (this.#state.disposed) throw new Error('Cannot bind a disposed Charts component.');
    const configured = this.chartsConfig.series.find((series) => series.id === seriesId);
    if (!configured) throw new Error(`Unknown chart series "${seriesId}".`);
    if (configured.apiClientId !== apiClient.id || configured.operationId !== operationId) {
      throw new Error(
        'The chart series binding must match its configured API Client and endpoint.',
      );
    }
    this.#state.bindings.get(seriesId)?.dispose();
    let active = true;
    let previousData: unknown = Symbol('unread');
    let previousUpdatedAt: number | undefined;
    let previousMapping = '';
    const refresh = (): void => {
      if (!active || this.#state.disposed) return;
      const series = this.chartsConfig.series.find((candidate) => candidate.id === seriesId);
      const operation = apiClient.operations.find((candidate) => candidate.id === operationId);
      if (!series || !operation) return;
      const state = apiClient.getOperationState(operation.name);
      if (state.status !== 'success') return;
      const mapping = JSON.stringify([series.listPath, series.labelField, series.valueField]);
      if (
        state.data === previousData &&
        state.updatedAt === previousUpdatedAt &&
        mapping === previousMapping
      )
        return;
      previousData = state.data;
      previousUpdatedAt = state.updatedAt;
      previousMapping = mapping;
      const points = webChartPoints(
        apiClient.getList<unknown>(operation.name, series.listPath),
        series,
      );
      const incoming: WebChartSeriesData = {
        id: series.id,
        name: series.name,
        color: series.color,
        points,
      };
      const known = new Map(this.#state.data.map((item) => [item.id, item]));
      known.set(seriesId, incoming);
      this.#state.data = freezeWebChartData(
        this.chartsConfig.series.flatMap((definition) => {
          const data = known.get(definition.id);
          return data ? [data] : [];
        }),
      );
      this.#resetSelection();
      this.#render();
    };
    const unsubscribe = apiClient.subscribe(refresh);
    const dispose = (): void => {
      if (!active) return;
      active = false;
      unsubscribe();
      if (this.#state.bindings.get(seriesId)?.dispose === dispose)
        this.#state.bindings.delete(seriesId);
    };
    this.#state.bindings.set(seriesId, { apiClient, operationId, refresh, dispose });
    refresh();
    return dispose;
  }

  #resetSelection(): void {
    this.#state.selected = null;
  }

  #render(): void {
    if (this.#state.disposed) return;
    const { configuration, data, width, height } = this.#state;
    const document = this.element.ownerDocument;
    const active = document.activeElement;
    const SvgElement = document.defaultView?.SVGElement;
    const focused =
      SvgElement && active instanceof SvgElement && this.element.contains(active) ? active : null;
    const focusSeries = focused?.dataset.chartSeries;
    const focusPoint = focused?.dataset.chartPoint;
    const svg = renderChartsSvg(document, configuration, data, {
      interactive: true,
      width,
      height,
      onPointClick: (detail) => {
        if (!this.enabled || this.#state.disposed) return;
        this.#state.selected = Object.freeze({ ...detail });
        this.emit('OnPointClick', this.#state.selected);
      },
    });
    // A native table preserves all source values, including zero/negative values
    // omitted by circular plots, without filling the visual canvas with rows.
    const accessible = document.createElement('div');
    Object.assign(accessible.style, {
      position: 'absolute',
      width: '1px',
      height: '1px',
      padding: '0',
      margin: '-1px',
      overflow: 'hidden',
      clipPath: 'inset(50%)',
      whiteSpace: 'nowrap',
      border: '0',
    });
    const table = document.createElement('table');
    const caption = document.createElement('caption');
    caption.textContent = configuration.title || 'Chart data';
    table.append(caption);
    const head = document.createElement('thead');
    const headings = document.createElement('tr');
    for (const label of ['Series', 'Label', 'Value']) {
      const cell = document.createElement('th');
      cell.scope = 'col';
      cell.textContent = label;
      headings.append(cell);
    }
    head.append(headings);
    table.append(head);
    const body = document.createElement('tbody');
    for (const series of data) {
      for (const point of series.points) {
        const row = document.createElement('tr');
        for (const value of [
          series.name,
          point.label,
          formatWebChartValue(point.value, configuration),
        ]) {
          const cell = document.createElement('td');
          cell.textContent = value;
          row.append(cell);
        }
        body.append(row);
      }
    }
    table.append(body);
    accessible.append(table);
    this.element.setAttribute('aria-label', configuration.title || this.name || 'Chart');
    this.element.replaceChildren(svg, accessible);
    if (focusSeries !== undefined && focusPoint !== undefined) {
      const target = [...svg.querySelectorAll<SVGElement>('[data-chart-point]')].find(
        (point) =>
          point.dataset.chartSeries === focusSeries && point.dataset.chartPoint === focusPoint,
      );
      target?.focus();
    }
  }

  public override dispose(): void {
    if (!this.#state.disposed) {
      this.#state.disposed = true;
      for (const binding of [...this.#state.bindings.values()]) binding.dispose();
      this.#state.observer?.disconnect();
      this.#state.observer = null;
    }
    super.dispose();
  }
}
