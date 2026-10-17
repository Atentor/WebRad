import type { ReactElement } from 'react';
import { Icon, type IconName } from './Icon';
import './restgo-workspace.css';

export type RestGoSection = 'connection' | 'published' | 'endpoints';

interface RestGoSidebarProps {
  readonly section: RestGoSection;
  readonly onSelect: (section: RestGoSection) => void;
  readonly enabled: boolean;
  readonly baseUrl: string;
}

const SECTIONS: readonly {
  id: RestGoSection;
  label: string;
  description: string;
  icon: IconName;
}[] = [
  {
    id: 'connection',
    label: 'Connection',
    description: 'Application and administrator access',
    icon: 'settings',
  },
  {
    id: 'published',
    label: 'Published APIs',
    description: 'Available endpoints and methods',
    icon: 'globe',
  },
  {
    id: 'endpoints',
    label: 'Endpoints',
    description: 'SQL, API Operations, and publishing',
    icon: 'code',
  },
];

export function RestGoSidebar({
  section,
  onSelect,
  enabled,
  baseUrl,
}: RestGoSidebarProps): ReactElement {
  return (
    <aside className="wr-restgo-sidebar">
      <div className="wr-restgo-sidebar-heading">
        <Icon name="database" />
        <strong>RestGO</strong>
      </div>
      <nav aria-label="RestGO integration">
        {SECTIONS.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-current={section === item.id ? 'page' : undefined}
            onClick={() => onSelect(item.id)}
          >
            <Icon name={item.icon} />
            <span>
              <strong>{item.label}</strong>
              <small>{item.description}</small>
            </span>
          </button>
        ))}
      </nav>
      <div className="wr-restgo-sidebar-instance">
        <span className={`wr-restgo-dot${enabled ? ' is-active' : ''}`} />
        <span>{enabled ? 'Integration enabled' : 'Integration disabled'}</span>
        <small title={baseUrl}>{baseUrl || 'Configure your RestGO instance'}</small>
      </div>
      <p className="wr-restgo-sidebar-help">
        Configure the SDK, manage endpoints, and bring published APIs directly into your project.
      </p>
    </aside>
  );
}
