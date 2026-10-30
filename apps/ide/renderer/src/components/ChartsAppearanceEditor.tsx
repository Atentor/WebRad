import type { ChartsConfiguration } from '@webrad/project-model';
import type { ReactElement } from 'react';
import { ChartsTypographyEditor } from './ChartsTypographyEditor';

interface ChartsAppearanceEditorProps {
  readonly configuration: ChartsConfiguration;
  readonly onChange: (configuration: ChartsConfiguration) => void;
}

export function ChartsAppearanceEditor({
  configuration: draft,
  onChange,
}: ChartsAppearanceEditorProps): ReactElement {
  const cartesian = ['bar', 'horizontalBar', 'line', 'area'].includes(draft.type);
  const toggles = [
    { key: 'showLegend', label: 'Show legend', visible: true },
    { key: 'showGrid', label: 'Show grid', visible: !['pie', 'doughnut'].includes(draft.type) },
    { key: 'showLabels', label: 'Show values', visible: true },
    { key: 'smooth', label: 'Smooth lines', visible: ['line', 'area'].includes(draft.type) },
    { key: 'stacked', label: 'Stack series', visible: cartesian },
  ] as const;
  return (
    <section className="wr-charts-appearance" aria-label="Chart appearance">
      <h3>Titles & legend</h3>
      <label>
        <span>Title</span>
        <input
          aria-label="Chart title"
          value={draft.title}
          maxLength={240}
          onChange={(event) => onChange({ ...draft, title: event.currentTarget.value })}
        />
      </label>
      <label>
        <span>Subtitle</span>
        <input
          aria-label="Chart subtitle"
          value={draft.subtitle}
          maxLength={500}
          placeholder="Optional context for this chart"
          onChange={(event) => onChange({ ...draft, subtitle: event.currentTarget.value })}
        />
      </label>
      <div className="wr-charts-toggles">
        {toggles
          .filter((toggle) => toggle.visible)
          .map(({ key, label }) => (
            <label key={key} className="wr-charts-toggle">
              <input
                type="checkbox"
                checked={draft[key]}
                onChange={(event) => onChange({ ...draft, [key]: event.currentTarget.checked })}
              />
              <span>{label}</span>
            </label>
          ))}
      </div>
      {draft.showLegend && (
        <label>
          <span>Legend position</span>
          <select
            aria-label="Chart legend position"
            value={draft.legendPosition}
            onChange={(event) =>
              onChange({
                ...draft,
                legendPosition: event.currentTarget.value === 'right' ? 'right' : 'bottom',
              })
            }
          >
            <option value="bottom">Bottom</option>
            <option value="right">Right</option>
          </select>
        </label>
      )}
      {draft.type === 'doughnut' && (
        <label>
          <span>
            Hole size <small>{draft.innerRadius}%</small>
          </span>
          <input
            aria-label="Chart doughnut hole size"
            type="range"
            min={20}
            max={85}
            value={draft.innerRadius}
            onChange={(event) =>
              onChange({ ...draft, innerRadius: event.currentTarget.valueAsNumber })
            }
          />
        </label>
      )}
      <ChartsTypographyEditor configuration={draft} onChange={onChange} />
      <h3>Number format</h3>
      <div className="wr-charts-field-pair">
        <label>
          <span>Prefix</span>
          <input
            aria-label="Chart value prefix"
            value={draft.valuePrefix}
            maxLength={40}
            placeholder="$"
            onChange={(event) => onChange({ ...draft, valuePrefix: event.currentTarget.value })}
          />
        </label>
        <label>
          <span>Suffix</span>
          <input
            aria-label="Chart value suffix"
            value={draft.valueSuffix}
            maxLength={40}
            placeholder="%"
            onChange={(event) => onChange({ ...draft, valueSuffix: event.currentTarget.value })}
          />
        </label>
      </div>
      <label>
        <span>Decimal places</span>
        <select
          aria-label="Chart decimal places"
          value={draft.decimalPlaces}
          onChange={(event) =>
            onChange({ ...draft, decimalPlaces: Number(event.currentTarget.value) })
          }
        >
          {Array.from({ length: 7 }, (_, value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </label>
      <h3>Empty state</h3>
      <label>
        <span>Message when no data is available</span>
        <input
          aria-label="Chart empty message"
          value={draft.emptyText}
          maxLength={500}
          onChange={(event) => onChange({ ...draft, emptyText: event.currentTarget.value })}
        />
      </label>
    </section>
  );
}
