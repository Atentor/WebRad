import {
  API_CLIENT_BODY_KINDS,
  API_CLIENT_CREDENTIALS,
  API_CLIENT_HTTP_METHODS,
  type ApiClientBodyKind,
  type ApiClientConfiguration,
  type ApiClientCredentials,
  type ApiClientOperation,
  type ApiClientParameter,
  type RestGoProjectSettings,
} from '@webrad/project-model';
import { useId, useState, type ReactElement, type RefObject } from 'react';

const TABS = ['Query parameters', 'Headers', 'Body', 'Options'] as const;
type Tab = (typeof TABS)[number];
const BODY_LABELS: Readonly<Record<ApiClientBodyKind, string>> = {
  none: 'None',
  json: 'JSON',
  text: 'Text',
  'form-urlencoded': 'Form URL encoded',
  'form-data': 'Multipart form data',
};

interface Props {
  readonly baseUrl: string;
  readonly baseUrlRef: RefObject<HTMLInputElement | null>;
  readonly configuration: ApiClientConfiguration;
  readonly operation: ApiClientOperation;
  readonly restGoSettings?: RestGoProjectSettings;
  readonly sending: boolean;
  readonly testJwt: string;
  readonly uploadField: string;
  readonly uploads: readonly File[];
  readonly onBaseUrlChange: (value: string) => void;
  readonly onConfigurationChange: (value: ApiClientConfiguration) => void;
  readonly onOperationChange: (patch: Partial<ApiClientOperation>) => void;
  readonly onTestJwtChange: (value: string) => void;
  readonly onUploadFieldChange: (value: string) => void;
  readonly onUploadsChange: (value: readonly File[]) => void;
  readonly onTest: () => void;
  readonly onCancelRequest: () => void;
  readonly renderParameters: (
    label: string,
    parameters: readonly ApiClientParameter[],
    onChange: (value: readonly ApiClientParameter[]) => void,
  ) => ReactElement;
}

export function ApiClientRequestEditor({
  baseUrl,
  baseUrlRef,
  configuration,
  operation,
  restGoSettings,
  sending,
  testJwt,
  uploadField,
  uploads,
  onBaseUrlChange,
  onConfigurationChange,
  onOperationChange,
  onTestJwtChange,
  onUploadFieldChange,
  onUploadsChange,
  onTest,
  onCancelRequest,
  renderParameters,
}: Props): ReactElement {
  const tabsId = useId();
  const [activeTab, setActiveTab] = useState<Tab>('Query parameters');
  const [customMethod, setCustomMethod] = useState(
    () => !API_CLIENT_HTTP_METHODS.some((method) => method === operation.method),
  );
  const bound = configuration.connection === 'restgo-session';
  const available = restGoSettings?.enabled === true && restGoSettings.baseUrl.length > 0;
  const method = operation.method.trim().toUpperCase();
  const noBody = ['GET', 'HEAD'].includes(method);
  const forbidden = ['CONNECT', 'TRACE', 'TRACK'].includes(method);
  const bodyInvalid = noBody && operation.body.kind !== 'none';
  const changeConnection = (connection: 'custom' | 'restgo-session'): void => {
    const withoutAuthorization = (
      parameters: readonly ApiClientParameter[],
    ): readonly ApiClientParameter[] =>
      parameters.filter((parameter) => parameter.name.trim().toLowerCase() !== 'authorization');
    onConfigurationChange({
      ...configuration,
      connection,
      defaultHeaders:
        connection === 'restgo-session'
          ? withoutAuthorization(configuration.defaultHeaders)
          : configuration.defaultHeaders,
      operations: configuration.operations.map((candidate) =>
        connection === 'restgo-session'
          ? { ...candidate, headers: withoutAuthorization(candidate.headers), credentials: 'omit' }
          : candidate,
      ),
    });
    onTestJwtChange('');
  };

  return (
    <>
      <fieldset className="wr-api-editor-fields" disabled={sending}>
        <div className="wr-api-fields wr-api-connection-fields">
          <label>
            <span>Connection</span>
            <select
              aria-label="Connection"
              value={configuration.connection ?? 'custom'}
              onChange={(event) =>
                changeConnection(event.currentTarget.value as 'custom' | 'restgo-session')
              }
            >
              <option value="custom">Custom API</option>
              <option value="restgo-session">RestGo authenticated user</option>
            </select>
          </label>
          <label>
            <span>
              Base URL{' '}
              {bound && <small className="wr-api-lock-label">From RestGo integration</small>}
            </span>
            <input
              ref={baseUrlRef}
              aria-label="Base URL"
              value={bound ? (restGoSettings?.baseUrl ?? '') : baseUrl}
              readOnly={bound}
              placeholder="https://api.example.com"
              spellCheck={false}
              onChange={(event) => onBaseUrlChange(event.currentTarget.value)}
            />
          </label>
        </div>
        {bound && (
          <div className="wr-api-authentication">
            <p className="wr-api-hint">
              {available
                ? 'Authorization: Bearer JWT is supplied by the current RestGo user session in Preview and the application.'
                : 'Enable RestGo integration in Project Settings to use this connection.'}
            </p>
            <details>
              <summary>Test authentication</summary>
              <div className="wr-api-fields">
                <label>
                  <span>Test JWT</span>
                  <input
                    aria-label="Test JWT"
                    type="password"
                    autoComplete="off"
                    spellCheck={false}
                    value={testJwt}
                    placeholder="Temporary user JWT"
                    onChange={(event) => onTestJwtChange(event.currentTarget.value)}
                  />
                </label>
              </div>
              <p className="wr-api-hint">
                Only for requests from this editor. Kept in memory and never saved in the project.
              </p>
            </details>
          </div>
        )}
        <div className="wr-api-operation-form">
          <div className="wr-api-fields two-columns">
            <label>
              <span>Operation name</span>
              <input
                aria-label="Operation name"
                value={operation.name}
                spellCheck={false}
                onChange={(event) => onOperationChange({ name: event.currentTarget.value })}
              />
            </label>
            <label>
              <span>Dynamic API version</span>
              <input
                aria-label="Dynamic API version"
                type="number"
                min="1"
                max={Number.MAX_SAFE_INTEGER}
                placeholder="Use endpoint as entered"
                value={operation.apiVersion ?? ''}
                onChange={(event) => {
                  const raw = event.currentTarget.value;
                  const apiVersion = raw.length === 0 ? null : Number(raw);
                  if (
                    apiVersion === null ||
                    (Number.isSafeInteger(apiVersion) && apiVersion >= 1)
                  ) {
                    onOperationChange({ apiVersion });
                  }
                }}
              />
            </label>
          </div>
          <div className="wr-api-fields wr-api-endpoint-fields">
            <label>
              <span>Method</span>
              <select
                aria-label="Method"
                value={customMethod ? '__custom__' : operation.method}
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  setCustomMethod(value === '__custom__');
                  if (value !== '__custom__')
                    onOperationChange({
                      method: value,
                      ...(value === 'GET' || value === 'HEAD'
                        ? { body: { ...operation.body, kind: 'none' } }
                        : {}),
                    });
                }}
              >
                {API_CLIENT_HTTP_METHODS.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
                <option value="__custom__">Custom method</option>
              </select>
            </label>
            <label>
              <span>Endpoint</span>
              <input
                aria-label="Path"
                value={operation.path}
                placeholder={bound ? '/v1/database/endpoint' : '/customers'}
                spellCheck={false}
                onChange={(event) => onOperationChange({ path: event.currentTarget.value })}
              />
            </label>
          </div>
          {customMethod && (
            <div className="wr-api-fields">
              <label>
                <span>Custom method</span>
                <input
                  aria-label="Custom method"
                  value={operation.method}
                  spellCheck={false}
                  onChange={(event) =>
                    onOperationChange({ method: event.currentTarget.value.toUpperCase() })
                  }
                />
              </label>
            </div>
          )}
          {forbidden && (
            <p className="wr-api-hint" role="note">
              Browsers prohibit {method} requests. You can save its configuration; choose another
              method to test or execute in a browser.
            </p>
          )}
          <div className="wr-api-request-tabs" role="tablist" aria-label="Request settings">
            {TABS.map((tab, index) => (
              <button
                key={tab}
                type="button"
                role="tab"
                id={`${tabsId}-tab-${String(index)}`}
                aria-controls={`${tabsId}-panel-${String(index)}`}
                aria-selected={tab === activeTab}
                tabIndex={tab === activeTab ? 0 : -1}
                onClick={() => setActiveTab(tab)}
                onKeyDown={(event) => {
                  let next: number | undefined;
                  if (event.key === 'ArrowRight') next = (index + 1) % TABS.length;
                  if (event.key === 'ArrowLeft') next = (index + TABS.length - 1) % TABS.length;
                  if (event.key === 'Home') next = 0;
                  if (event.key === 'End') next = TABS.length - 1;
                  if (next === undefined) return;
                  event.preventDefault();
                  setActiveTab(TABS[next] ?? 'Query parameters');
                  document.getElementById(`${tabsId}-tab-${String(next)}`)?.focus();
                }}
              >
                {tab}
                {tab === 'Query parameters' && operation.query.length > 0
                  ? ` (${String(operation.query.length)})`
                  : tab === 'Headers' &&
                      operation.headers.length + configuration.defaultHeaders.length > 0
                    ? ` (${String(operation.headers.length + configuration.defaultHeaders.length)})`
                    : ''}
              </button>
            ))}
          </div>
          <div
            className="wr-api-request-tab-panel"
            role="tabpanel"
            id={`${tabsId}-panel-${String(TABS.indexOf(activeTab))}`}
            aria-labelledby={`${tabsId}-tab-${String(TABS.indexOf(activeTab))}`}
          >
            {activeTab === 'Query parameters' &&
              renderParameters('Query parameters', operation.query, (query) =>
                onOperationChange({ query }),
              )}
            {activeTab === 'Headers' && (
              <>
                {bound && (
                  <p className="wr-api-hint">
                    <code>Authorization</code> is managed by RestGo. Add any other request headers
                    below.
                  </p>
                )}
                {renderParameters('Headers', operation.headers, (headers) =>
                  onOperationChange({ headers }),
                )}
                {renderParameters(
                  'Default headers',
                  configuration.defaultHeaders,
                  (defaultHeaders) => onConfigurationChange({ ...configuration, defaultHeaders }),
                )}
                <p className="wr-api-hint">
                  Headers are saved with the project. Supply secrets from application code at
                  runtime.
                </p>
              </>
            )}
            {activeTab === 'Body' && (
              <>
                <div className="wr-api-body-editor">
                  <label>
                    <span>Body type</span>
                    <select
                      aria-label="Body type"
                      value={operation.body.kind}
                      disabled={noBody && !bodyInvalid}
                      onChange={(event) => {
                        onOperationChange({
                          body: {
                            ...operation.body,
                            kind: event.currentTarget.value as ApiClientBodyKind,
                          },
                        });
                        onUploadsChange([]);
                      }}
                    >
                      {API_CLIENT_BODY_KINDS.map((kind) => (
                        <option key={kind} value={kind} disabled={noBody && kind !== 'none'}>
                          {BODY_LABELS[kind]}
                        </option>
                      ))}
                    </select>
                  </label>
                  {operation.body.kind !== 'none' && (
                    <label>
                      <span>
                        {operation.body.kind === 'form-data' ? 'Form fields' : 'Request body'}
                      </span>
                      <textarea
                        aria-label="Request body"
                        value={operation.body.content}
                        placeholder={
                          operation.body.kind === 'json'
                            ? '{\n  "name": "Ada"\n}'
                            : operation.body.kind === 'text'
                              ? 'Request content'
                              : 'name=Ada&active=true'
                        }
                        spellCheck={false}
                        onChange={(event) =>
                          onOperationChange({
                            body: { ...operation.body, content: event.currentTarget.value },
                          })
                        }
                      />
                    </label>
                  )}
                </div>
                {noBody && (
                  <p className="wr-api-hint">
                    {method} requests have no body. Use query parameters or headers.
                  </p>
                )}
                {operation.body.kind === 'form-data' && (
                  <>
                    <div className="wr-api-fields two-columns">
                      <label>
                        <span>File field name</span>
                        <input
                          aria-label="File field name"
                          value={uploadField}
                          onChange={(event) => onUploadFieldChange(event.currentTarget.value)}
                        />
                      </label>
                      <label>
                        <span>Test files</span>
                        <input
                          aria-label="Test files"
                          type="file"
                          multiple
                          onChange={(event) =>
                            onUploadsChange([...(event.currentTarget.files ?? [])])
                          }
                        />
                      </label>
                    </div>
                    <p className="wr-api-hint">
                      Form fields use name=value&amp;name=value.{' '}
                      {uploads.length ? `${String(uploads.length)} file(s) selected. ` : ''}Files
                      are used only for this test; pass FormData from application code for uploads.
                    </p>
                  </>
                )}
              </>
            )}
            {activeTab === 'Options' && (
              <div className="wr-api-fields three-columns">
                <label>
                  <span>Credentials</span>
                  <select
                    aria-label="Credentials"
                    value={bound ? 'omit' : operation.credentials}
                    disabled={bound}
                    onChange={(event) =>
                      onOperationChange({
                        credentials: event.currentTarget.value as ApiClientCredentials,
                      })
                    }
                  >
                    {API_CLIENT_CREDENTIALS.map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Default timeout (ms)</span>
                  <input
                    aria-label="Default timeout"
                    type="number"
                    min="1"
                    max="120000"
                    value={configuration.timeoutMs}
                    onChange={(event) => {
                      const value = Number(event.currentTarget.value);
                      if (Number.isInteger(value) && value >= 1 && value <= 120_000)
                        onConfigurationChange({ ...configuration, timeoutMs: value });
                    }}
                  />
                </label>
                <label>
                  <span>Operation timeout (ms)</span>
                  <input
                    aria-label="Operation timeout"
                    type="number"
                    min="1"
                    max="120000"
                    placeholder="Use default"
                    value={operation.timeoutMs ?? ''}
                    onChange={(event) => {
                      const value = event.currentTarget.value
                        ? Number(event.currentTarget.value)
                        : null;
                      if (
                        value === null ||
                        (Number.isInteger(value) && value >= 1 && value <= 120_000)
                      )
                        onOperationChange({ timeoutMs: value });
                    }}
                  />
                </label>
              </div>
            )}
          </div>
        </div>
      </fieldset>
      <div className="wr-api-test-actions">
        <button
          type="button"
          className="primary"
          disabled={sending || forbidden || bodyInvalid || (bound && !available)}
          onClick={onTest}
        >
          {sending ? 'Sending…' : 'Send test request'}
        </button>
        {sending && (
          <button type="button" onClick={onCancelRequest}>
            Cancel request
          </button>
        )}
        {!sending && (
          <span className="wr-api-hint">
            {['GET', 'HEAD', 'OPTIONS', 'TRACE'].includes(method)
              ? 'Runs a real browser request · API must allow CORS'
              : `${method} may change data on the server`}
          </span>
        )}
      </div>
    </>
  );
}
