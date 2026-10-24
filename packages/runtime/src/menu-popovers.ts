/** Expanded horizontal branches use the browser top layer, outside ancestor clipping and stacking contexts. */
export function bindWebMenuPopovers(menu: HTMLElement): () => void {
  const view = menu.ownerDocument.defaultView;
  if (!view || !menu.isConnected || menu.getClientRects().length === 0) return () => undefined;
  const flyouts: HTMLElement[] = [];
  for (const submenu of menu.querySelectorAll<HTMLElement>('.wr-menu-submenu')) {
    if (submenu.hidden || submenu.parentElement?.closest('.wr-menu-submenu[hidden]')) continue;
    submenu.classList.add('wr-menu-flyout');
    submenu.popover = 'manual';
    submenu.showPopover();
    flyouts.push(submenu);
  }
  const place = (): void => {
    const viewport = view.visualViewport;
    const left = (viewport?.offsetLeft ?? 0) + 8;
    const top = (viewport?.offsetTop ?? 0) + 8;
    const right = left + (viewport?.width ?? view.innerWidth) - 16;
    const bottom = top + (viewport?.height ?? view.innerHeight) - 16;
    const clamp = (value: number, start: number, end: number): number =>
      Math.max(start, Math.min(value, Math.max(start, end)));
    for (const submenu of flyouts) {
      const line = submenu.parentElement?.querySelector<HTMLElement>(':scope > .wr-menu-line');
      if (!line) continue;
      submenu.style.maxWidth = `${Math.max(0, right - left)}px`;
      submenu.style.maxHeight = `${Math.max(0, bottom - top)}px`;
      const anchor = line.getBoundingClientRect();
      const size = submenu.getBoundingClientRect();
      const nested = line.closest('.wr-menu-submenu') !== null;
      const availableAfter = nested ? right - anchor.right : bottom - anchor.bottom;
      const availableBefore = nested ? anchor.left - left : anchor.top - top;
      const flip =
        availableAfter < (nested ? size.width : size.height) + 6 &&
        availableBefore > availableAfter;
      const x = nested ? (flip ? anchor.left - size.width - 6 : anchor.right + 6) : anchor.left;
      const y = nested ? anchor.top : flip ? anchor.top - size.height - 6 : anchor.bottom + 6;
      submenu.style.left = `${clamp(x, left, right - size.width)}px`;
      submenu.style.top = `${clamp(y, top, bottom - size.height)}px`;
      submenu.dataset.openDirection = nested ? (flip ? 'left' : 'right') : flip ? 'up' : 'down';
    }
  };
  place();
  const observer =
    typeof view.ResizeObserver === 'undefined' ? undefined : new view.ResizeObserver(place);
  observer?.observe(menu);
  flyouts.forEach((element) => observer?.observe(element));
  view.addEventListener('resize', place);
  view.addEventListener('scroll', place, true);
  view.visualViewport?.addEventListener('resize', place);
  view.visualViewport?.addEventListener('scroll', place);
  return () => {
    observer?.disconnect();
    view.removeEventListener('resize', place);
    view.removeEventListener('scroll', place, true);
    view.visualViewport?.removeEventListener('resize', place);
    view.visualViewport?.removeEventListener('scroll', place);
    for (const submenu of flyouts) {
      if (submenu.matches(':popover-open')) submenu.hidePopover();
    }
  };
}
