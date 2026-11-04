import type { ApiClientAuthorization } from '@webrad/project-model';
import { useId, useState, type ReactElement } from 'react';

interface Props {
  readonly authorization: ApiClientAuthorization | null | undefined;
  readonly defaultAuthorization: ApiClientAuthorization | null | undefined;
  readonly onChange: (value: ApiClientAuthorization | null) => void;
  readonly onDefaultChange: (value: ApiClientAuthorization | null) => void;
}

const LABELS = {
  none: 'No auth',
  basic: 'Basic Auth',
  bearer: 'Bearer Token',
  'api-key': 'API Key',
} as const;

export function ApiClientAuthorizationEditor({
  authorization,
  defaultAuthorization,
  onChange,
  onDefaultChange,
}: Props): ReactElement {
  const hintId = useId();
  const [scope, setScope] = useState<'request' | 'client'>('request');
  const value = (scope === 'client' ? defaultAuthorization : authorization) ?? null;
  const change = scope === 'client' ? onDefaultChange : onChange;
  return (
    <div className="wr-api-authorization-editor">
      <div className="wr-api-fields two-columns">
        <label>
          <span>Apply to</span>
          <select
            aria-label="Authorization scope"
            value={scope}
            onChange={(event) => setScope(event.currentTarget.value as 'request' | 'client')}
          >
            <option value="request">This request</option>
            <option value="client">Client defaults</option>
          </select>
        </label>
        <label>
          <span>Type</span>
          <select
            aria-label="Authorization type"
            value={value?.type ?? 'inherit'}
            onChange={(event) => {
              switch (event.currentTarget.value) {
                case 'inherit':
                  change(null);
                  break;
                case 'none':
                  change({ type: 'none' });
                  break;
                case 'basic':
                  change({ type: 'basic', username: '', password: '' });
                  break;
                case 'bearer':
                  change({ type: 'bearer', token: '' });
                  break;
                case 'api-key':
                  change({ type: 'api-key', name: 'X-API-Key', value: '', in: 'header' });
                  break;
              }
            }}
          >
            <option value="inherit">
              {scope === 'request' ? 'Inherit from client' : 'Use manual headers'}
            </option>
            {Object.entries(LABELS).map(([type, label]) => (
              <option key={type} value={type}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>
      {value === null && (
        <p className="wr-api-empty">
          {scope === 'request'
            ? `Client authorization: ${defaultAuthorization == null ? 'Use manual headers' : LABELS[defaultAuthorization.type]}.`
            : 'Authorization headers configured in Headers are used as entered.'}
        </p>
      )}
      {value?.type === 'none' && (
        <p className="wr-api-empty">Sends the request without an Authorization header.</p>
      )}
      {value?.type === 'basic' && (
        <div className="wr-api-fields two-columns">
          <label>
            <span>Username</span>
            <input
              aria-label="Basic Auth username"
              autoComplete="off"
              spellCheck={false}
              value={value.username}
              onChange={(event) => change({ ...value, username: event.currentTarget.value })}
            />
          </label>
          <label>
            <span>Password</span>
            <input
              aria-label="Basic Auth password"
              type="password"
              autoComplete="new-password"
              spellCheck={false}
              aria-describedby={hintId}
              value={value.password}
              onChange={(event) => change({ ...value, password: event.currentTarget.value })}
            />
          </label>
        </div>
      )}
      {value?.type === 'bearer' && (
        <div className="wr-api-fields">
          <label>
            <span>Token</span>
            <input
              aria-label="Bearer token"
              type="password"
              autoComplete="new-password"
              spellCheck={false}
              placeholder="Token without the Bearer prefix"
              aria-describedby={hintId}
              value={value.token}
              onChange={(event) => change({ ...value, token: event.currentTarget.value })}
            />
          </label>
        </div>
      )}
      {value?.type === 'api-key' && (
        <div className="wr-api-fields three-columns">
          <label>
            <span>Key name</span>
            <input
              aria-label="API key name"
              autoComplete="off"
              spellCheck={false}
              value={value.name}
              onChange={(event) => change({ ...value, name: event.currentTarget.value })}
            />
          </label>
          <label>
            <span>Value</span>
            <input
              aria-label="API key value"
              type="password"
              autoComplete="new-password"
              spellCheck={false}
              aria-describedby={hintId}
              value={value.value}
              onChange={(event) => change({ ...value, value: event.currentTarget.value })}
            />
          </label>
          <label>
            <span>Add to</span>
            <select
              aria-label="API key location"
              value={value.in}
              onChange={(event) =>
                change({ ...value, in: event.currentTarget.value as 'header' | 'query' })
              }
            >
              <option value="header">Header</option>
              <option value="query">Query parameter</option>
            </select>
          </label>
        </div>
      )}
      {value !== null && value.type !== 'none' && (
        <p className="wr-api-hint" id={hintId}>
          These credentials are saved in the project and included in generated browser apps. Use
          credentials intended for client-side access. You can also assign Authorization in code at
          runtime.
        </p>
      )}
    </div>
  );
}
