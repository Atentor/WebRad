export interface NavigateOptions {
  readonly replace?: boolean;
  readonly newWindow?: boolean;
  readonly target?: string;
}

export function Message(message: unknown): void {
  globalThis.alert(String(message));
}

export function Confirm(message: unknown): boolean {
  return globalThis.confirm(String(message));
}

export function Navigate(destination: string | URL, options: NavigateOptions = {}): void {
  const url = String(destination);
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
