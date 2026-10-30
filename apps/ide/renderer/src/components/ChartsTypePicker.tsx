import { CHART_TYPES, type ChartType } from '@webrad/project-model';
import type { ReactElement } from 'react';

interface ChartsTypePickerProps {
  readonly value: ChartType;
  readonly onChange: (value: ChartType) => void;
}

const CAPTIONS: Readonly<Record<ChartType, string>> = {
  doughnut: 'Doughnut',
  pie: 'Pie',
  bar: 'Bars',
  horizontalBar: 'Horizontal bars',
  line: 'Line',
  area: 'Area',
  radar: 'Radar',
  polarArea: 'Polar area',
};

function TypeGlyph({ type }: { readonly type: ChartType }): ReactElement {
  const circular = ['doughnut', 'pie', 'polarArea'].includes(type);
  return (
    <svg viewBox="0 0 48 32" aria-hidden="true" fill="none">
      {circular ? (
        <>
          <circle
            cx="24"
            cy="16"
            r="12"
            stroke="currentColor"
            strokeWidth={type === 'doughnut' ? 7 : 1.5}
            opacity="0.25"
          />
          <path
            d="M24 4a12 12 0 0 1 11.4 15.7"
            stroke="currentColor"
            strokeWidth={type === 'doughnut' ? 7 : 4}
          />
          {type !== 'doughnut' && (
            <path d="M24 4v12l11.4 3.7M24 16l-7 10" stroke="currentColor" strokeWidth="1.5" />
          )}
          {type === 'polarArea' && (
            <path d="M24 16l-10-8v8l6 5Z" fill="currentColor" opacity="0.4" />
          )}
        </>
      ) : type === 'radar' ? (
        <>
          <path
            d="M24 3l14 10-5 16H15l-5-16ZM24 3v26M10 13l23 16M38 13L15 29"
            stroke="currentColor"
            opacity="0.25"
          />
          <path
            d="m24 8 11 6-8 11-9-1-5-10Z"
            fill="currentColor"
            fillOpacity="0.2"
            stroke="currentColor"
            strokeWidth="1.5"
          />
        </>
      ) : type === 'bar' || type === 'horizontalBar' ? (
        <g
          transform={type === 'horizontalBar' ? 'translate(8 40) rotate(-90)' : undefined}
          fill="currentColor"
        >
          <rect x="9" y="18" width="7" height="11" rx="1.5" opacity="0.45" />
          <rect x="21" y="7" width="7" height="22" rx="1.5" />
          <rect x="33" y="12" width="7" height="17" rx="1.5" opacity="0.7" />
        </g>
      ) : (
        <>
          {type === 'area' && (
            <path d="m5 25 12-14 10 6L43 4v25H5Z" fill="currentColor" opacity="0.2" />
          )}
          <path
            d="m5 25 12-14 10 6L43 4"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {[
            ['5', '25'],
            ['17', '11'],
            ['27', '17'],
            ['43', '4'],
          ].map(([cx, cy]) => (
            <circle key={cx} cx={cx} cy={cy} r="2" fill="currentColor" />
          ))}
        </>
      )}
    </svg>
  );
}

export function ChartsTypePicker({ value, onChange }: ChartsTypePickerProps): ReactElement {
  return (
    <div className="wr-charts-type-picker" role="group" aria-label="Chart type">
      {CHART_TYPES.map((type) => (
        <button
          key={type}
          type="button"
          aria-label={`Chart type: ${type}`}
          aria-pressed={value === type}
          onClick={() => onChange(type)}
        >
          <TypeGlyph type={type} />
          <span>{CAPTIONS[type]}</span>
        </button>
      ))}
    </div>
  );
}
