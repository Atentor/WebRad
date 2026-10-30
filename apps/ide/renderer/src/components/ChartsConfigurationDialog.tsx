import { ChartsPreview } from '@webrad/components';
import {
  ChartsConfigurationSchema,
  createDefaultChartsConfiguration,
  type ChartSeriesConfiguration,
  type ChartsConfiguration,
  type ComponentNode,
} from '@webrad/project-model';
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactElement } from 'react';
import { createPortal } from 'react-dom';
import { ChartsAppearanceEditor } from './ChartsAppearanceEditor';
import { ChartsSeriesEditor } from './ChartsSeriesEditor';
import { ChartsTypePicker } from './ChartsTypePicker';
import { CHART_SERIES_COLORS, chartSeriesIssue } from './charts-configuration';
import { Icon } from './Icon';
import './charts-configuration.css';

interface ChartsConfigurationDialogProps {
  readonly component: ComponentNode;
  readonly availableComponents: readonly ComponentNode[];
  readonly onClose: () => void;
  readonly onSave: (configuration: ChartsConfiguration) => void;
}

export function ChartsConfigurationDialog({
  component,
  availableComponents,
  onClose,
  onSave,
}: ChartsConfigurationDialogProps): ReactElement {
  const titleId = useId();
  const dialogRef = useRef<HTMLElement>(null);
  const returnFocusRef = useRef(
    document.activeElement instanceof HTMLElement ? document.activeElement : null,
  );
  const [draft, setDraft] = useState<ChartsConfiguration>(() => {
    const parsed = ChartsConfigurationSchema.safeParse(component.props.chartsConfig);
    return parsed.success ? parsed.data : createDefaultChartsConfiguration();
  });
  const [section, setSection] = useState<'data' | 'appearance'>('data');
  const [selectedId, setSelectedId] = useState<string | null>(draft.series[0]?.id ?? null);
  const selected = draft.series.find((series) => series.id === selectedId) ?? draft.series[0];
  const invalidSeries = draft.series.filter(
    (series) => chartSeriesIssue(series, availableComponents) !== null,
  );
  const parsed = ChartsConfigurationSchema.safeParse(draft);
  const valid = parsed.success && invalidSeries.length === 0;
  const configurationIssue = parsed.success
    ? null
    : (parsed.error.issues[0]?.message ?? 'Review the chart configuration before saving.');

  useEffect(() => {
    dialogRef.current
      ?.querySelector<HTMLButtonElement>('.wr-charts-type-picker button[aria-pressed="true"]')
      ?.focus();
    const returnFocus = returnFocusRef.current;
    return () => {
      if (returnFocus?.isConnected) returnFocus.focus();
    };
  }, []);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== 'Tab') return;
    const elements = [
      ...(dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex="0"]',
      ) ?? []),
    ];
    const first = elements[0];
    const last = elements.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  };

  const addSeries = (): void => {
    if (draft.series.length >= 5) return;
    const id = crypto.randomUUID();
    const index = draft.series.length;
    const names = new Set(draft.series.map((series) => series.name));
    let number = index + 1;
    while (names.has(`Series ${number}`)) number += 1;
    setDraft({
      ...draft,
      series: [
        ...draft.series,
        {
          id,
          name: `Series ${number}`,
          color: CHART_SERIES_COLORS[index] ?? CHART_SERIES_COLORS[0],
          apiClientId: null,
          operationId: null,
          listPath: '',
          labelField: '',
          valueField: '',
        },
      ],
    });
    setSelectedId(id);
    setSection('data');
  };

  const updateSeries = (nextSeries: ChartSeriesConfiguration): void => {
    setDraft({
      ...draft,
      series: draft.series.map((series) => (series.id === nextSeries.id ? nextSeries : series)),
    });
  };

  const removeSelectedSeries = (): void => {
    const series = draft.series.filter((entry) => entry.id !== selected?.id);
    setDraft({ ...draft, series });
    setSelectedId(series[0]?.id ?? null);
  };

  return createPortal(
    <div
      className="wr-modal-backdrop wr-charts-backdrop"
      role="presentation"
      onKeyDown={handleKeyDown}
    >
      <section
        ref={dialogRef}
        className="wr-modal wr-charts-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header className="wr-modal-header">
          <div>
            <span className="wr-modal-eyebrow">Charts / {component.name}</span>
            <h2 id={titleId}>Configure Charts</h2>
          </div>
          <button
            type="button"
            className="wr-modal-close"
            aria-label="Close Charts configuration"
            onClick={onClose}
          >
            <Icon name="close" />
          </button>
        </header>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (valid && parsed.success) onSave(parsed.data);
          }}
        >
          <div className="wr-charts-body">
            <div className="wr-charts-controls">
              <section className="wr-charts-types" aria-label="Choose a chart">
                <div className="wr-charts-section-heading">
                  <h3>Chart type</h3>
                  <span>8 visualizations</span>
                </div>
                <ChartsTypePicker
                  value={draft.type}
                  onChange={(type) => setDraft({ ...draft, type })}
                />
              </section>
              <div
                className="wr-charts-sections"
                role="group"
                aria-label="Chart configuration section"
              >
                <button
                  type="button"
                  aria-label="Data"
                  aria-pressed={section === 'data'}
                  onClick={() => setSection('data')}
                >
                  <Icon name="database" />
                  Data
                </button>
                <button
                  type="button"
                  aria-label="Appearance"
                  aria-pressed={section === 'appearance'}
                  onClick={() => setSection('appearance')}
                >
                  <Icon name="sliders-horizontal" />
                  Appearance
                </button>
              </div>
              {section === 'data' ? (
                <div className="wr-charts-data">
                  <div className="wr-charts-section-heading">
                    <h3>Data series</h3>
                    <span>{draft.series.length} / 5</span>
                  </div>
                  <div
                    className="wr-charts-series-list"
                    role="group"
                    aria-label="Chart data series"
                  >
                    {draft.series.map((series, index) => (
                      <button
                        key={series.id}
                        data-chart-series-id={series.id}
                        type="button"
                        aria-pressed={selected?.id === series.id}
                        onClick={() => setSelectedId(series.id)}
                      >
                        <span
                          className="wr-charts-series-dot"
                          style={{ background: series.color }}
                        />
                        <span>{series.name || `Series ${index + 1}`}</span>
                        {chartSeriesIssue(series, availableComponents) !== null && (
                          <Icon name="alert-circle" />
                        )}
                      </button>
                    ))}
                    <button
                      type="button"
                      className="wr-charts-add-series"
                      aria-label="Add chart series"
                      disabled={draft.series.length >= 5}
                      onClick={addSeries}
                    >
                      <Icon name="add" />
                      Add series
                    </button>
                  </div>
                  {selected === undefined ? (
                    <div className="wr-charts-no-series">
                      <Icon name="chart-no-axes-combined" />
                      <h3>Connect your first series</h3>
                      <p>
                        Choose an endpoint and map its label and numeric value fields. Combine up to
                        five sources in one chart.
                      </p>
                      <button type="button" onClick={addSeries}>
                        Add first series
                      </button>
                    </div>
                  ) : (
                    <ChartsSeriesEditor
                      key={selected.id}
                      series={selected}
                      components={availableComponents}
                      onChange={updateSeries}
                      onRemove={removeSelectedSeries}
                    />
                  )}
                </div>
              ) : (
                <ChartsAppearanceEditor configuration={draft} onChange={setDraft} />
              )}
            </div>
            <aside className="wr-charts-preview-panel" aria-label="Chart preview">
              <div className="wr-charts-section-heading">
                <h3>Preview</h3>
                <span>Updates as you edit</span>
              </div>
              <div className="wr-charts-preview">
                <ChartsPreview configuration={draft} />
              </div>
              <div className="wr-charts-preview-note">
                <Icon name="info" />
                <p>
                  This preview uses sample values. In your application, each series updates when its
                  API Client endpoint executes.
                </p>
              </div>
              <div className="wr-charts-click-note">
                <Icon name="mouse-pointer-2" />
                <p>
                  Use <strong>OnPointClick</strong> in Interaction to receive the selected label,
                  value and series.
                </p>
              </div>
            </aside>
          </div>
          <footer className="wr-modal-actions wr-charts-actions">
            <p role="status">
              {invalidSeries.length > 0
                ? `Finish configuring ${invalidSeries.length} series to save.`
                : (configurationIssue ?? 'Changes apply when you save.')}
            </p>
            <button type="button" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="primary" disabled={!valid}>
              Save chart
            </button>
          </footer>
        </form>
      </section>
    </div>,
    document.body,
  );
}
