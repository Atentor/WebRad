import { Icon } from './Icon';
import { useState } from 'react';
import { EXTERNAL_LINKS, type ExternalLinkTarget } from '../../../shared/external-links';
import { useEffect, useId, useRef, type KeyboardEvent, type ReactElement } from 'react';
import { version, description } from '../../../../../package.json';
import { applicationIconUrl } from '../application-assets';

export function AboutDialog({ onClose }: { readonly onClose: () => void }): ReactElement {
  const [linkError, setLinkError] = useState<string | null>(null);
  const openLink = async (target: ExternalLinkTarget): Promise<void> => {
    setLinkError(null);
    try {
      await window.webrad.links.open(target);
    } catch {
      setLinkError('Could not open the browser. Please try again.');
    }
  };
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(
    document.activeElement instanceof HTMLElement ? document.activeElement : null,
  );

  useEffect(() => {
    closeRef.current?.focus();
    const returnFocus = returnFocusRef.current;
    return () => {
      if (returnFocus?.isConnected) returnFocus.focus();
    };
  }, []);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    event.stopPropagation();
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
    } else if (event.key === 'Tab') {
      const buttons = dialogRef.current?.querySelectorAll<HTMLElement>('button, a[href]');
      const first = buttons?.[0];
      const last = buttons?.[buttons.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }
  };

  return (
    <div className="wr-modal-backdrop" role="presentation" onKeyDown={handleKeyDown}>
      <section
        ref={dialogRef}
        className="wr-modal wr-about-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
      >
        <header className="wr-modal-header">
          <div>
            <span className="wr-modal-eyebrow">Help</span>
            <h2 id={titleId}>About WebRAD</h2>
          </div>
          <button
            ref={closeRef}
            type="button"
            className="wr-modal-close"
            aria-label="Close About WebRAD"
            onClick={onClose}
          >
            <Icon name="close" />
          </button>
        </header>
        <div className="wr-modal-description">
          <img src={applicationIconUrl} width={48} height={48} alt="" />
          <p>WebRAD</p>
          <p>Version {version}</p>
          <p id={descriptionId}>{description}</p>
          <p className="wr-about-attribution">
            Powered by{' '}
            <a
              href={EXTERNAL_LINKS.atentor}
              onClick={(event) => {
                event.preventDefault();
                void openLink('atentor');
              }}
            >
              Atentor
            </a>
          </p>
          <a
            className="wr-about-website"
            href={EXTERNAL_LINKS.webrad}
            onClick={(event) => {
              event.preventDefault();
              void openLink('webrad');
            }}
          >
            <strong>WebRAD website &amp; documentation</strong>
            <span>
              webrad.atentor.com <Icon name="external-link" />
            </span>
          </a>
          {linkError !== null && (
            <p className="wr-modal-error" role="alert">
              {linkError}
            </p>
          )}
        </div>
        <footer className="wr-modal-actions">
          <button type="button" className="primary" onClick={onClose}>
            Close
          </button>
        </footer>
      </section>
    </div>
  );
}
