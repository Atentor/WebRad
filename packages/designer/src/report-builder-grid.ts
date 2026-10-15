/** Report canvas projection at 100% zoom; persisted geometry remains in millimetres. */
export const REPORT_CANVAS_PIXELS_PER_MM = 3;
export const REPORT_GRID_SIZE_PX = 8;
export const REPORT_GRID_SIZE_MM = REPORT_GRID_SIZE_PX / REPORT_CANVAS_PIXELS_PER_MM;

/** Snap within the local band/row grid, allowing an exact boundary when it is off-grid. */
export function snapReportCoordinate(value: number, maximum: number, minimum = 0): number {
  const snapped = Math.round(value / REPORT_GRID_SIZE_MM) * REPORT_GRID_SIZE_MM;
  return Math.min(Math.max(minimum, snapped), Math.max(minimum, maximum));
}
