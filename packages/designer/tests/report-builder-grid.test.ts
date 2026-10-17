import { expect, it } from 'vitest';
import {
  REPORT_CANVAS_PIXELS_PER_MM,
  REPORT_GRID_SIZE_MM,
  snapReportCoordinate,
} from '../src/index.js';

it('snaps report millimetres to exact 8 px grid lines independent of zoom', () => {
  for (const zoom of [0.5, 0.75, 1, 1.25]) {
    const scale = REPORT_CANVAS_PIXELS_PER_MM * zoom;
    const position = snapReportCoordinate((21 * zoom) / scale, 180);
    expect(position * scale).toBeCloseTo(24 * zoom);
    expect(snapReportCoordinate(position, 180)).toBe(position);
  }
  expect(snapReportCoordinate(-10, 180)).toBe(0);
  expect(snapReportCoordinate(200, 17.5)).toBe(17.5);
  expect(snapReportCoordinate(0, 10, 0.5)).toBe(0.5);
  expect(snapReportCoordinate(8, -10)).toBe(0);
});

it('aligns the resized trailing edge when the authored origin is between grid lines', () => {
  const origin = 0.5;
  const width = snapReportCoordinate(origin + 100 + 5, 180, origin + 0.5) - origin;
  expect((origin + width) / REPORT_GRID_SIZE_MM).toBe(40);
  expect(width).toBeGreaterThan(100);
});
