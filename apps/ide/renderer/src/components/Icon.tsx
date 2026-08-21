import type { ReactElement } from 'react';

export type IconName =
  | 'add'
  | 'chevron-down'
  | 'chevron-right'
  | 'close'
  | 'delete'
  | 'folder-open'
  | 'info'
  | 'layers'
  | 'lightbulb'
  | 'palette'
  | 'page'
  | 'play'
  | 'redo'
  | 'save'
  | 'search'
  | 'settings'
  | 'style'
  | 'undo';

interface IconProps {
  readonly name: IconName;
  readonly className?: string;
}

function IconShape({ name }: Pick<IconProps, 'name'>): ReactElement {
  switch (name) {
    case 'add':
      return <path d="M12 5v14M5 12h14" />;
    case 'chevron-down':
      return <path d="m7 9.5 5 5 5-5" />;
    case 'chevron-right':
      return <path d="m9.5 7 5 5-5 5" />;
    case 'close':
      return <path d="m6 6 12 12M18 6 6 18" />;
    case 'delete':
      return (
        <>
          <path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13" />
          <path d="M10 11v5M14 11v5" />
        </>
      );
    case 'folder-open':
      return (
        <>
          <path d="M3.5 18.5V6.5h6l2 2h9v2" />
          <path d="M5 19.5h13.5l2.5-9H7.5z" />
        </>
      );
    case 'info':
      return (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 11v6" />
          <path d="M12 7.5h.01" strokeWidth="2.6" />
        </>
      );
    case 'layers':
      return (
        <>
          <path d="m12 3 9 5-9 5-9-5z" />
          <path d="m4.5 12 7.5 4 7.5-4M4.5 16l7.5 4 7.5-4" />
        </>
      );
    case 'lightbulb':
      return (
        <>
          <path d="M9 18h6M10 21h4" />
          <path d="M8.5 15.5A6 6 0 1 1 15.5 15.5c-.8.6-1.2 1.3-1.3 2.1h-4.4c-.1-.8-.5-1.5-1.3-2.1Z" />
        </>
      );
    case 'palette':
      return (
        <>
          <path d="M12 3a9 9 0 0 0 0 18h1.1a1.9 1.9 0 0 0 1.4-3.2 1.9 1.9 0 0 1 1.4-3.2H18A3 3 0 0 0 21 12a9 9 0 0 0-9-9Z" />
          <circle cx="7.5" cy="11" r=".7" fill="currentColor" stroke="none" />
          <circle cx="9.2" cy="7.4" r=".7" fill="currentColor" stroke="none" />
          <circle cx="13.2" cy="6.6" r=".7" fill="currentColor" stroke="none" />
          <circle cx="16.5" cy="9" r=".7" fill="currentColor" stroke="none" />
        </>
      );
    case 'page':
      return (
        <>
          <path d="M5 3h10l4 4v14H5z" />
          <path d="M15 3v5h4" />
        </>
      );
    case 'play':
      return <path d="m8 5 11 7-11 7z" fill="currentColor" stroke="none" />;
    case 'redo':
      return <path d="m15 7 5 5-5 5M19 12h-8a6 6 0 0 0-6 6" />;
    case 'save':
      return (
        <>
          <path d="M5 3h12l2 2v16H5z" />
          <path d="M8 3v6h8V3M8 21v-7h8v7" />
        </>
      );
    case 'search':
      return (
        <>
          <circle cx="10.5" cy="10.5" r="6.5" />
          <path d="m15.5 15.5 4.5 4.5" />
        </>
      );
    case 'settings':
      return (
        <>
          <path d="M4 7h10M18 7h2M4 17h2M10 17h10" />
          <circle cx="16" cy="7" r="2" />
          <circle cx="8" cy="17" r="2" />
        </>
      );
    case 'style':
      return (
        <>
          <path d="M4 4h7l9 9-7 7-9-9z" />
          <circle cx="8" cy="8" r="1" />
        </>
      );
    case 'undo':
      return <path d="m9 7-5 5 5 5M5 12h8a6 6 0 0 1 6 6" />;
  }
}

/** Small, network-independent icon used throughout the IDE chrome. */
export function Icon({ name, className = '' }: IconProps): ReactElement {
  return (
    <svg
      className={`wr-icon${className.length > 0 ? ` ${className}` : ''}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      focusable="false"
      aria-hidden="true"
    >
      <IconShape name={name} />
    </svg>
  );
}
