export interface MainWindowPresentationTarget {
  maximize(): void;
  show(): void;
}

export interface MainWindowPresentationOptions {
  readonly hidden: boolean;
}

/** Presents the user-facing IDE maximized while leaving automation windows hidden. */
export function presentMainWindow(
  window: MainWindowPresentationTarget,
  options: MainWindowPresentationOptions,
): void {
  if (options.hidden) return;
  window.maximize();
  window.show();
}
