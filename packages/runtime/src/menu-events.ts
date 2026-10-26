const menuEventHosts = new WeakMap<HTMLElement, HTMLElement>();

/** Internal placement relay; it is not part of the authored Menu API. */
export function bindWebMenuEventHost(element: HTMLElement, host: HTMLElement): () => void {
  menuEventHosts.set(element, host);
  return () => {
    if (menuEventHosts.get(element) === host) menuEventHosts.delete(element);
  };
}

export function webMenuEventHost(element: HTMLElement): HTMLElement | undefined {
  return menuEventHosts.get(element);
}
