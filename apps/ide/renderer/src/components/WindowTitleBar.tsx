import { useEffect, useRef, useState, type ReactElement } from 'react';
import { APPLICATION_MENU_LABELS, type ApplicationMenuLabel } from '../../../shared/window-chrome';
import { applicationIconUrl } from '../application-assets';

interface WindowTitleBarProps {
  preview: boolean;
  disabled: boolean;
  theme: 'dark' | 'light';
}

export function WindowTitleBar({ preview, disabled, theme }: WindowTitleBarProps): ReactElement {
  const menuRef = useRef<HTMLElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const [activeMenu, setActiveMenu] = useState<ApplicationMenuLabel | null>(null);
  const mac = window.webrad.platform === 'darwin';

  useEffect(() => {
    void window.webrad.chrome.setTheme(theme).catch((error: unknown) => {
      console.error('[IDE] Failed to update window title bar:', error);
    });
  }, [theme]);

  useEffect(
    () =>
      window.webrad.chrome.onFocusMenu(() => {
        if (disabled || preview) return;
        if (
          document.activeElement instanceof HTMLElement &&
          !menuRef.current?.contains(document.activeElement)
        )
          previousFocus.current = document.activeElement;
        menuRef.current?.querySelector('button')?.focus();
      }),
    [disabled, preview],
  );

  const openMenu = async (
    button: HTMLButtonElement,
    label: ApplicationMenuLabel,
  ): Promise<void> => {
    if (activeMenu !== null) return;
    const rect = button.getBoundingClientRect();
    setActiveMenu(label);
    try {
      await window.webrad.chrome.popupMenu({ label, x: rect.left, y: rect.bottom });
    } catch (error: unknown) {
      console.error('[IDE] Failed to open application menu:', error);
    } finally {
      setActiveMenu(null);
      if (button.isConnected && !button.disabled) button.focus();
    }
  };

  return (
    <header className="wr-window-titlebar" data-platform={window.webrad.platform}>
      <img className="wr-window-icon" src={applicationIconUrl} alt="" draggable={false} />
      {!mac && !preview && (
        <nav
          ref={menuRef}
          className="wr-window-menu"
          aria-label="Application menu"
          role="menubar"
          onKeyDown={(event) => {
            const buttons = [...event.currentTarget.querySelectorAll('button')];
            const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
            if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
              event.preventDefault();
              buttons[
                (index + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length
              ]?.focus();
            } else if (event.key === 'Escape') {
              if (previousFocus.current?.isConnected) previousFocus.current.focus();
              else (document.activeElement as HTMLElement | null)?.blur();
            } else if (event.key === 'Home' || event.key === 'End') {
              event.preventDefault();
              buttons[event.key === 'Home' ? 0 : buttons.length - 1]?.focus();
            }
          }}
        >
          {APPLICATION_MENU_LABELS.map((label) => (
            <button
              key={label}
              type="button"
              role="menuitem"
              aria-haspopup="menu"
              aria-expanded={activeMenu === label}
              disabled={disabled}
              onClick={(event) => {
                void openMenu(event.currentTarget, label);
              }}
              onKeyDown={(event) => {
                if (event.key === 'ArrowDown') {
                  event.preventDefault();
                  void openMenu(event.currentTarget, label);
                }
              }}
            >
              {label}
            </button>
          ))}
        </nav>
      )}
    </header>
  );
}
