import type { ReactElement } from 'react';
interface Props {
  readonly label: string;
  readonly value: number;
  readonly min?: number;
  readonly max?: number;
  readonly onChange: (value: number) => void;
}
export function ReportNumberField({ label, value, min = 0, max, onChange }: Props): ReactElement {
  return (
    <label>
      <span>{label}</span>
      <input
        aria-label={`Report ${label.toLowerCase()}`}
        type="number"
        min={min}
        max={max}
        step="any"
        value={value}
        onChange={(event) => {
          const next = Number(event.currentTarget.value);
          if (Number.isFinite(next)) onChange(next);
        }}
      />
    </label>
  );
}
