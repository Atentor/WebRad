/**
 * Browser-safe visual contract shared by the generated runtime and design-time
 * projections. Layout positioning and designer interaction intentionally stay
 * outside this module.
 */
export interface VisualPropertySource {
  readonly props: Readonly<Record<string, unknown>>;
}

export interface VisualComponentSource extends VisualPropertySource {
  readonly type: string;
  readonly bounds: {
    readonly width: number;
    readonly height: number;
  };
}

export type VisualSizingMode = 'bounds' | 'fill';

export interface ComponentVisualStyle {
  readonly width: string;
  readonly height: string;
  readonly backgroundColor?: string;
  readonly color?: string;
  readonly borderColor?: string;
  readonly borderStyle?: 'solid';
  readonly borderWidth?: string;
}

export interface ComponentVisualProjection {
  readonly classNames: readonly [base: 'wr-component', type: string];
  readonly style: ComponentVisualStyle;
  readonly visible: boolean;
  readonly enabled: boolean;
  readonly title?: string;
  readonly tabIndex?: number;
}

export function readStringProperty(
  source: VisualPropertySource,
  name: string,
  fallback = '',
): string {
  const value = source.props[name];
  return typeof value === 'string' ? value : fallback;
}

export function readBooleanProperty(
  source: VisualPropertySource,
  name: string,
  fallback = false,
): boolean {
  const value = source.props[name];
  return typeof value === 'boolean' ? value : fallback;
}

export function readIntegerProperty(source: VisualPropertySource, name: string): number | undefined;
export function readIntegerProperty(
  source: VisualPropertySource,
  name: string,
  fallback: number,
): number;
export function readIntegerProperty(
  source: VisualPropertySource,
  name: string,
  fallback?: number,
): number | undefined {
  const value = source.props[name];
  return typeof value === 'number' && Number.isInteger(value) ? value : fallback;
}

export function readStringListProperty(
  source: VisualPropertySource,
  name: string,
): readonly string[] {
  const value = source.props[name];
  return Array.isArray(value) && value.every((item) => typeof item === 'string') ? value : [];
}

export function projectComponentVisual(
  source: VisualComponentSource,
  sizing: VisualSizingMode = 'bounds',
): ComponentVisualProjection {
  const backgroundColor = readStringProperty(source, 'backgroundColor');
  const color = readStringProperty(source, 'color');
  const borderColor = readStringProperty(source, 'borderColor');
  const title = readStringProperty(source, 'title');
  const tabIndex = readIntegerProperty(source, 'tabIndex');
  const style: ComponentVisualStyle = {
    width: sizing === 'fill' ? '100%' : `${String(source.bounds.width)}px`,
    height: sizing === 'fill' ? '100%' : `${String(source.bounds.height)}px`,
    ...(backgroundColor.length > 0 ? { backgroundColor } : {}),
    ...(color.length > 0 ? { color } : {}),
    ...(borderColor.length > 0
      ? { borderColor, borderStyle: 'solid' as const, borderWidth: '1px' }
      : {}),
  };

  return {
    classNames: ['wr-component', `wr-${source.type.toLowerCase()}`],
    style,
    visible: readBooleanProperty(source, 'visible', true),
    enabled: readBooleanProperty(source, 'enabled', true),
    ...(title.length > 0 ? { title } : {}),
    ...(tabIndex === undefined ? {} : { tabIndex }),
  };
}

/** Shared component styling. Hosts may override the custom properties to theme it. */
export const WEBRAD_COMPONENT_CSS = `
.wr-component { box-sizing: border-box; font: inherit; }
.wr-component[hidden] { display: none !important; }
.wr-webform { overflow: hidden; }
.wr-weblabel { display: flex; align-items: center; color: inherit; overflow: hidden; white-space: nowrap; }
.wr-webpanel { border: 1px solid var(--wr-control-border, #677184); background: var(--wr-control-surface, #262b35); padding: 6px; overflow: hidden; }
.wr-webedit, .wr-webtextarea, .wr-webcombobox, .wr-weblistbox { border: 1px solid var(--wr-control-border, #677184); border-radius: 3px; background: var(--wr-input-bg, #11151c); color: inherit; padding: 5px 7px; outline: none; }
.wr-webedit:focus, .wr-webtextarea:focus, .wr-webcombobox:focus, .wr-weblistbox:focus { border-color: var(--wr-accent, #4da3ff); box-shadow: 0 0 0 1px var(--wr-accent, #4da3ff); }
.wr-webbutton { border: 1px solid var(--wr-control-border, #677184); border-radius: 4px; background: var(--wr-button-bg, #343b49); color: inherit; padding: 4px 12px; }
.wr-webbutton:hover:not(:disabled) { background: var(--wr-button-hover, #414a5a); }
.wr-webcheckbox { display: flex; align-items: center; gap: 7px; }
.wr-webimage { display: block; object-fit: contain; border: 1px dashed var(--wr-control-border, #677184); color: var(--wr-muted-text, #8e98aa); }
`.trim();
