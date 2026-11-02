import { applyNavigationParameters, type PageParameterValues } from './page-parameters.js';
import type { WebRadPageParameters } from './index.js';

export type PageDestination = keyof WebRadPageParameters | (string & {}) | URL;

export type NavigateArguments<Destination extends string | URL> =
  Destination extends keyof WebRadPageParameters
    ? Record<never, never> extends WebRadPageParameters[Destination]
      ? [
          options?: Omit<NavigateOptions, 'params'> & {
            readonly params?: WebRadPageParameters[Destination];
          },
        ]
      : [
          options: Omit<NavigateOptions, 'params'> & {
            readonly params: WebRadPageParameters[Destination];
          },
        ]
    : [options?: NavigateOptions];

export interface NavigateOptions {
  readonly replace?: boolean;
  readonly newWindow?: boolean;
  readonly target?: string;
  readonly params?: PageParameterValues;
  /** New values replace old ones by default; omitted values retain legacy behavior. */
  readonly paramsHandling?: 'replace' | 'merge' | 'preserve';
}

export function Message(message: unknown): void {
  globalThis.alert(String(message));
}

export function Confirm(message: unknown): boolean {
  return globalThis.confirm(String(message));
}

export function Navigate<Destination extends PageDestination>(
  destination: Destination,
  ...args: NavigateArguments<Destination>
): void {
  const options = (args[0] ?? {}) as NavigateOptions;
  const resolved = new URL(destination, globalThis.location.href);
  if (options.params !== undefined && options.paramsHandling !== 'preserve') {
    if (options.paramsHandling !== 'merge') resolved.search = '';
    applyNavigationParameters(resolved.searchParams, options.params);
  }
  const url = resolved.href;
  if (options.newWindow === true || options.target !== undefined) {
    globalThis.open(url, options.target ?? '_blank', 'noopener,noreferrer');
    return;
  }
  if (options.replace === true) globalThis.location.replace(url);
  else globalThis.location.assign(url);
}

export const message = Message;
export const confirm = Confirm;
export const navigate = Navigate;
