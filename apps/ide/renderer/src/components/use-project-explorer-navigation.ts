import { useRef, type KeyboardEvent } from 'react';

/** Shared keyboard behavior for every resource projected into the Explorer tree. */
export function useProjectExplorerNavigation(): (event: KeyboardEvent<HTMLDivElement>) => void {
  const typeahead = useRef({ text: '', time: 0 });
  return (event) => {
    if (!(event.target instanceof HTMLElement)) return;
    if (event.target.closest('input, textarea, [contenteditable="true"]')) return;
    const item = event.target.closest<HTMLElement>('[data-explorer-key]');
    if (!item) return;
    const items = [...event.currentTarget.querySelectorAll<HTMLElement>('[data-explorer-key]')];
    const index = items.indexOf(item);
    let next: HTMLElement | undefined;
    switch (event.key) {
      case 'ArrowDown':
        next = items[index + 1];
        break;
      case 'ArrowUp':
        next = items[index - 1];
        break;
      case 'Home':
        next = items[0];
        break;
      case 'End':
        next = items.at(-1);
        break;
      case 'ArrowRight':
        if (item.getAttribute('aria-expanded') === 'false') {
          item.querySelector<HTMLButtonElement>('[data-explorer-toggle]')?.click();
        } else if (item.getAttribute('aria-expanded') === 'true') {
          next = item.querySelector<HTMLElement>('[role="group"] [data-explorer-key]') ?? undefined;
        }
        break;
      case 'ArrowLeft':
        if (item.getAttribute('aria-expanded') === 'true') {
          item.querySelector<HTMLButtonElement>('[data-explorer-toggle]')?.click();
        } else {
          next = item.parentElement?.closest<HTMLElement>('[data-explorer-key]') ?? undefined;
        }
        break;
      case 'Enter':
      case ' ':
        if (event.target instanceof HTMLButtonElement) return;
        if (item.hasAttribute('aria-expanded')) {
          item.querySelector<HTMLButtonElement>('[data-explorer-toggle]')?.click();
        } else if (event.key === ' ') {
          item.click();
        } else {
          return;
        }
        break;
      default: {
        if (event.key.length !== 1 || event.ctrlKey || event.metaKey || event.altKey) return;
        const now = Date.now();
        const character = event.key.toLocaleLowerCase();
        const previous = now - typeahead.current.time < 700 ? typeahead.current.text : '';
        const text = previous === character ? character : previous + character;
        typeahead.current = { text, time: now };
        const ordered = [...items.slice(index + 1), ...items.slice(0, index + 1)];
        next = ordered.find((entry) =>
          entry.dataset.explorerLabel?.toLocaleLowerCase().startsWith(text),
        );
      }
    }
    event.preventDefault();
    next?.focus();
  };
}
