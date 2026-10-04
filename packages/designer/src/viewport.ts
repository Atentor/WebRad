/** Browser-safe design-time viewport presets; these never change persisted page geometry. */
export const DESIGNER_VIEWPORTS = {
  desktop: { label: 'Desktop', width: 1280 },
  tablet: { label: 'Tablet', width: 768 },
  mobile: { label: 'Mobile', width: 390 },
} as const;

export type DesignerViewportName = keyof typeof DESIGNER_VIEWPORTS;

export function isDesignerViewportName(value: string): value is DesignerViewportName {
  return Object.prototype.hasOwnProperty.call(DESIGNER_VIEWPORTS, value);
}
