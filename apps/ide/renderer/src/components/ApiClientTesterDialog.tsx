import { apiOperationPath } from '@webrad/runtime';
import {
  API_CLIENT_BODY_KINDS,
  API_CLIENT_CREDENTIALS,
  API_CLIENT_FIELD_TYPES,
  normalizeApiClientConfiguration,
  parseApiClientConfiguration,
  type ApiClientBodyKind,
  type ApiClientConfiguration,
  type ApiClientCredentials,
  type ApiClientOperation,
  type ApiClientParameter,
  type ApiClientResponseSchema,
  type ApiClientSchemaNode,
  type ComponentNode,
} from '@webrad/project-model';
import {
  collectApiClientSchemaNodeIds as collectInferredNodeIds,
  inferApiClientResponseSchema,
  pruneApiClientResponseSchema,
  reconcileApiClientResponseSchema,
} from '../api-client-schema';
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactElement,
} from 'react';
import { createPortal } from 'react-dom';

const HTTP_METHOD_SUGGESTIONS = [
  'GET',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'HEAD',
  'OPTIONS',
] as const;
const MAX_RESPONSE_PREVIEW_LENGTH = 250_000;

interface ApiTestResult {
  readonly url: string;
  readonly status: number;
  readonly statusText: string;
  readonly durationMs: number;
  readonly headers: readonly (readonly [string, string])[];
  readonly bodyText: string;
  readonly bodyTruncated: boolean;
  readonly json: unknown | undefined;
}

interface ParameterListProps {
  readonly label: string;
  readonly parameters: readonly ApiClientParameter[];
  readonly onChange: (parameters: readonly ApiClientParameter[]) => void;
}

export interface ApiClientTesterDialogProps {
  readonly component: ComponentNode;
  readonly onClose: () => void;
  /** Commits both properties as a single model-history transaction in the host. */
  readonly onSave: (baseUrl: string, configuration: ApiClientConfiguration) => void;
}

function createStableId(prefix: string): string {
  const suffix =
    globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${suffix}`;
}

function createParameter(): ApiClientParameter {
  return { id: createStableId('parameter'), name: '', value: '', enabled: true };
}

function createOperation(sequence: number): ApiClientOperation {
  return {
    id: createStableId('operation'),
    name: `Request${String(sequence)}`,
    method: 'GET',
    path: '',
    headers: [],
    query: [],
    body: { kind: 'none', content: '' },
    credentials: 'omit',
    timeoutMs: null,
    responseSchema: null,
  };
}

function isAbsoluteUrl(value: string): boolean {
  try {
    return new URL(value).protocol.length > 0;
  } catch {
    return false;
  }
}

function joinUrl(baseUrl: string, path: string): string {
  if (baseUrl.length === 0 || isAbsoluteUrl(path)) return path;
  if (isAbsoluteUrl(baseUrl)) {
    return new URL(
      path.startsWith('/') ? path.slice(1) : path,
      baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`,
    ).href;
  }
  const left = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  const right = path.startsWith('/') ? path.slice(1) : path;
  return `${left}/${right}`;
}

function appendEnabledParameters(url: string, parameters: readonly ApiClientParameter[]): string {
  const active = parameters.filter((parameter) => parameter.enabled && parameter.name.trim());
  if (active.length === 0) return url;
  const hashIndex = url.indexOf('#');
  const hash = hashIndex >= 0 ? url.slice(hashIndex) : '';
  const withoutHash = hashIndex >= 0 ? url.slice(0, hashIndex) : url;
  const query = new URLSearchParams();
  active.forEach((parameter) => query.append(parameter.name, parameter.value));
  return `${withoutHash}${withoutHash.includes('?') ? '&' : '?'}${query.toString()}${hash}`;
}

function createTestRequest(
  baseUrl: string,
  configuration: ApiClientConfiguration,
  operation: ApiClientOperation,
): { readonly url: string; readonly init: RequestInit } {
  const url = appendEnabledParameters(
    joinUrl(baseUrl.trim(), apiOperationPath(operation.path.trim(), operation.apiVersion)),
    operation.query,
  );
  if (url.length === 0)
    throw new Error('Enter a base URL or an absolute operation path before testing.');
  const headers = new Headers();
  [...configuration.defaultHeaders, ...operation.headers].forEach((parameter) => {
    if (parameter.enabled && parameter.name.trim().length > 0) {
      headers.set(parameter.name, parameter.value);
    }
  });
  let body: BodyInit | undefined;
  switch (operation.body.kind) {
    case 'none':
      break;
    case 'json':
      if (operation.body.content.trim().length > 0) {
        JSON.parse(operation.body.content);
        body = operation.body.content;
        if (!headers.has('content-type')) headers.set('content-type', 'application/json');
      }
      break;
    case 'text':
      body = operation.body.content;
      if (!headers.has('content-type')) headers.set('content-type', 'text/plain;charset=UTF-8');
      break;
    case 'form-urlencoded':
      body = operation.body.content;
      if (!headers.has('content-type')) {
        headers.set('content-type', 'application/x-www-form-urlencoded;charset=UTF-8');
      }
      break;
  }
  return {
    url,
    init: {
      method: operation.method.trim(),
      headers,
      body,
      credentials: operation.credentials,
    },
  };
}

function editableParameter(
  parameter: ApiClientParameter,
  patch: Partial<ApiClientParameter>,
): ApiClientParameter {
  return { ...parameter, ...patch };
}

function ParameterList({ label, parameters, onChange }: ParameterListProps): ReactElement {
  return (
    <div className="wr-api-parameter-list">
      <div className="wr-api-section-heading">
        <span>{label}</span>
        <button type="button" onClick={() => onChange([...parameters, createParameter()])}>
          Add
        </button>
      </div>
      {parameters.length === 0 ? (
        <p className="wr-api-empty">No {label.toLocaleLowerCase()} configured.</p>
      ) : (
        <div className="wr-api-parameter-rows">
          {parameters.map((parameter) => (
            <div className="wr-api-parameter-row" key={parameter.id}>
              <input
                aria-label={`${label} enabled ${parameter.name || parameter.id}`}
                type="checkbox"
                checked={parameter.enabled}
                onChange={(event) =>
                  onChange(
                    parameters.map((candidate) =>
                      candidate.id === parameter.id
                        ? editableParameter(candidate, { enabled: event.currentTarget.checked })
                        : candidate,
                    ),
                  )
                }
              />
              <input
                aria-label={`${label} name ${parameter.name || parameter.id}`}
                value={parameter.name}
                placeholder="Name"
                spellCheck={false}
                onChange={(event) =>
                  onChange(
                    parameters.map((candidate) =>
                      candidate.id === parameter.id
                        ? editableParameter(candidate, { name: event.currentTarget.value })
                        : candidate,
                    ),
                  )
                }
              />
              <input
                aria-label={`${label} value ${parameter.name || parameter.id}`}
                value={parameter.value}
                placeholder="Value"
                spellCheck={false}
                onChange={(event) =>
                  onChange(
                    parameters.map((candidate) =>
                      candidate.id === parameter.id
                        ? editableParameter(candidate, { value: event.currentTarget.value })
                        : candidate,
                    ),
                  )
                }
              />
              <button
                type="button"
                aria-label={`Remove ${label.toLocaleLowerCase()} ${parameter.name || parameter.id}`}
                onClick={() =>
                  onChange(parameters.filter((candidate) => candidate.id !== parameter.id))
                }
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function replaceSchemaNode(
  node: ApiClientSchemaNode,
  nodeId: string,
  patch: Partial<Pick<ApiClientSchemaNode, 'fieldType' | 'nullable'>>,
): ApiClientSchemaNode {
  return {
    ...node,
    ...(node.id === nodeId ? patch : {}),
    children: node.children.map((child) => replaceSchemaNode(child, nodeId, patch)),
  };
}

interface SchemaNodeEditorProps {
  readonly node: ApiClientSchemaNode;
  readonly depth: number;
  readonly selectedIds: ReadonlySet<string>;
  readonly ancestorIds: readonly string[];
  readonly onSelectedChange: (
    node: ApiClientSchemaNode,
    selected: boolean,
    ancestors: readonly string[],
  ) => void;
  readonly onPatch: (
    nodeId: string,
    patch: Partial<Pick<ApiClientSchemaNode, 'fieldType' | 'nullable'>>,
  ) => void;
}

function SchemaNodeEditor({
  node,
  depth,
  selectedIds,
  ancestorIds,
  onSelectedChange,
  onPatch,
}: SchemaNodeEditorProps): ReactElement {
  const editableField = node.kind === 'field';
  const selected = selectedIds.has(node.id);
  return (
    <li className="wr-api-schema-node" style={{ '--wr-api-depth': depth } as CSSProperties}>
      <div className="wr-api-schema-node-main">
        <input
          aria-label={`Save ${node.name}`}
          type="checkbox"
          checked={selected}
          disabled={node.path.length === 0}
          onChange={(event) => onSelectedChange(node, event.currentTarget.checked, ancestorIds)}
        />
        <span className="wr-api-schema-name">{node.name}</span>
        <code>{node.path || '/'}</code>
        <select
          aria-label={`Type for ${node.name}`}
          value={node.fieldType}
          disabled={!editableField}
          onChange={(event) =>
            onPatch(node.id, {
              fieldType: event.currentTarget.value as ApiClientSchemaNode['fieldType'],
            })
          }
        >
          {editableField ? (
            API_CLIENT_FIELD_TYPES.filter((type) => type !== 'object' && type !== 'list').map(
              (type) => (
                <option value={type} key={type}>
                  {type}
                </option>
              ),
            )
          ) : (
            <option value={node.fieldType}>{node.fieldType}</option>
          )}
        </select>
        <label className="wr-api-nullable">
          <input
            aria-label={`${node.name} nullable`}
            type="checkbox"
            checked={node.nullable}
            onChange={(event) => onPatch(node.id, { nullable: event.currentTarget.checked })}
          />
          Null
        </label>
      </div>
      {node.children.length > 0 && (
        <ul>
          {node.children.map((child) => (
            <SchemaNodeEditor
              key={child.id}
              node={child}
              depth={depth + 1}
              selectedIds={selectedIds}
              ancestorIds={[...ancestorIds, node.id]}
              onSelectedChange={onSelectedChange}
              onPatch={onPatch}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

function responseJson(text: string, contentType: string): unknown | undefined {
  if (!/[/+]json(?:;|$)/iu.test(contentType) && !/^(?:\[|\{)/u.test(text.trim())) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

function testResultBody(text: string): {
  readonly bodyText: string;
  readonly bodyTruncated: boolean;
} {
  if (text.length <= MAX_RESPONSE_PREVIEW_LENGTH) return { bodyText: text, bodyTruncated: false };
  return {
    bodyText: `${text.slice(0, MAX_RESPONSE_PREVIEW_LENGTH)}\n\n… Response preview truncated …`,
    bodyTruncated: true,
  };
}

export function ApiClientTesterDialog({
  component,
  onClose,
  onSave,
}: ApiClientTesterDialogProps): ReactElement {
  const titleId = useId();
  const descriptionId = useId();
  const methodListId = useId();
  const dialogRef = useRef<HTMLElement | null>(null);
  const baseUrlRef = useRef<HTMLInputElement | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(
    document.activeElement instanceof HTMLElement ? document.activeElement : null,
  );
  const requestAbortRef = useRef<AbortController | null>(null);
  const [baseUrl, setBaseUrl] = useState(
    typeof component.props.baseUrl === 'string' ? component.props.baseUrl : '',
  );
  const [configuration, setConfiguration] = useState(() =>
    normalizeApiClientConfiguration(component.props.apiClientConfig),
  );
  const [selectedOperationId, setSelectedOperationId] = useState(
    () => configuration.operations[0]?.id ?? '',
  );
  const [selectedSchemaIds, setSelectedSchemaIds] = useState<ReadonlySet<string>>(() => {
    const schema = configuration.operations[0]?.responseSchema;
    return schema === null || schema === undefined
      ? new Set<string>()
      : collectInferredNodeIds(schema.root);
  });
  const [sending, setSending] = useState(false);
  const [testResult, setTestResult] = useState<ApiTestResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const operation = useMemo(
    () =>
      configuration.operations.find((candidate) => candidate.id === selectedOperationId) ??
      configuration.operations[0],
    [configuration.operations, selectedOperationId],
  );

  useEffect(() => {
    baseUrlRef.current?.focus();
    const returnFocus = returnFocusRef.current;
    return () => {
      requestAbortRef.current?.abort();
      if (returnFocus?.isConnected) returnFocus.focus();
    };
  }, []);

  const updateOperation = (
    operationId: string,
    update: (current: ApiClientOperation) => ApiClientOperation,
  ): void => {
    setConfiguration((current) => ({
      ...current,
      operations: current.operations.map((candidate) =>
        candidate.id === operationId ? update(candidate) : candidate,
      ),
    }));
  };

  const selectOperation = (id: string): void => {
    setSelectedOperationId(id);
    const schema = configuration.operations.find(
      (candidate) => candidate.id === id,
    )?.responseSchema;
    setSelectedSchemaIds(
      schema === null || schema === undefined
        ? new Set<string>()
        : collectInferredNodeIds(schema.root),
    );
    setTestResult(null);
    setError(null);
  };

  const setSchema = (operationId: string, schema: ApiClientResponseSchema | null): void => {
    updateOperation(operationId, (current) => ({ ...current, responseSchema: schema }));
  };

  const testOperation = async (): Promise<void> => {
    if (operation === undefined || sending) return;
    let request: { readonly url: string; readonly init: RequestInit };
    try {
      request = createTestRequest(baseUrl, configuration, operation);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      return;
    }
    const controller = new AbortController();
    requestAbortRef.current = controller;
    const timeoutMs = operation.timeoutMs ?? configuration.timeoutMs;
    const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
    const startedAt = performance.now();
    setSending(true);
    setError(null);
    setTestResult(null);
    try {
      const response = await globalThis.fetch(request.url, {
        ...request.init,
        signal: controller.signal,
      });
      const rawText = await response.text();
      const preview = testResultBody(rawText);
      const json = responseJson(rawText, response.headers.get('content-type') ?? '');
      const result: ApiTestResult = {
        url: response.url || request.url,
        status: response.status,
        statusText: response.statusText,
        durationMs: Math.round(performance.now() - startedAt),
        headers: [...response.headers.entries()],
        ...preview,
        json,
      };
      setTestResult(result);
      // HTTP errors often have a JSON error envelope. It is useful to display
      // that payload, but it must not replace or extend the successful output
      // contract that other components will consume.
      if (response.ok && json !== undefined) {
        const inferred = inferApiClientResponseSchema(json);
        const schema = reconcileApiClientResponseSchema(inferred, operation.responseSchema);
        setSchema(operation.id, schema);
        setSelectedSchemaIds(collectInferredNodeIds(schema.root));
      }
    } catch (caught) {
      const aborted = controller.signal.aborted;
      const reason = aborted
        ? `The request was cancelled or exceeded its ${String(timeoutMs)} ms timeout.`
        : caught instanceof Error
          ? caught.message
          : String(caught);
      setError(
        `${reason} Browser API tests require the target API to permit this application's origin through CORS.`,
      );
    } finally {
      window.clearTimeout(timeout);
      if (requestAbortRef.current === controller) requestAbortRef.current = null;
      setSending(false);
    }
  };

  const save = (): void => {
    try {
      const selectedConfiguration: ApiClientConfiguration = {
        ...configuration,
        operations: configuration.operations.map((candidate) =>
          candidate.id !== selectedOperationId || candidate.responseSchema === null
            ? candidate
            : {
                ...candidate,
                responseSchema: pruneApiClientResponseSchema(
                  candidate.responseSchema,
                  selectedSchemaIds,
                ),
              },
        ),
      };
      onSave(baseUrl.trim(), parseApiClientConfiguration(selectedConfiguration));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    event.stopPropagation();
    if (event.key === 'Escape' && !sending) {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = [
      ...(dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled)',
      ) ?? []),
    ];
    const first = focusable[0];
    const last = focusable.at(-1);
    if (first === undefined || last === undefined) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  if (operation === undefined) {
    return createPortal(<div />, document.body);
  }

  const destructiveMethod = !['GET', 'HEAD', 'OPTIONS'].includes(
    operation.method.trim().toUpperCase(),
  );
  const responseSchema = operation.responseSchema;

  return createPortal(
    <div className="wr-modal-backdrop" role="presentation" onKeyDown={handleKeyDown}>
      <section
        ref={dialogRef}
        className="wr-modal wr-api-client-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        aria-busy={sending}
      >
        <header className="wr-modal-header">
          <div>
            <span className="wr-modal-eyebrow">API Client / {component.name}</span>
            <h2 id={titleId}>Test API Client</h2>
          </div>
          <button
            type="button"
            className="wr-modal-close"
            aria-label="Close API Client tester"
            disabled={sending}
            onClick={onClose}
          >
            &times;
          </button>
        </header>
        <div className="wr-api-client-content">
          <p className="wr-modal-description" id={descriptionId}>
            Configure requests and save only the response contract. Browser tests execute real
            requests and require CORS support from the API.
          </p>
          <div className="wr-api-client-layout">
            <aside className="wr-api-operations" aria-label="API operations">
              <div className="wr-api-section-heading">
                <span>Operations</span>
                <button
                  type="button"
                  onClick={() => {
                    const next = createOperation(configuration.operations.length + 1);
                    setConfiguration((current) => ({
                      ...current,
                      operations: [...current.operations, next],
                    }));
                    selectOperation(next.id);
                  }}
                >
                  Add
                </button>
              </div>
              <nav className="wr-api-operation-list" aria-label="Saved API operations">
                {configuration.operations.map((candidate) => (
                  <button
                    key={candidate.id}
                    type="button"
                    aria-pressed={candidate.id === operation.id}
                    className={candidate.id === operation.id ? 'selected' : ''}
                    onClick={() => selectOperation(candidate.id)}
                  >
                    <strong>{candidate.name || 'Untitled request'}</strong>
                    <small>{candidate.method || 'GET'}</small>
                  </button>
                ))}
              </nav>
              <button
                type="button"
                className="wr-api-remove-operation"
                disabled={configuration.operations.length === 1}
                onClick={() => {
                  const remaining = configuration.operations.filter(
                    (candidate) => candidate.id !== operation.id,
                  );
                  setConfiguration((current) => ({ ...current, operations: remaining }));
                  selectOperation(remaining[0]?.id ?? '');
                }}
              >
                Remove operation
              </button>
            </aside>
            <div className="wr-api-request-editor">
              <div className="wr-api-fields two-columns">
                <label>
                  <span>Base URL</span>
                  <input
                    ref={baseUrlRef}
                    aria-label="Base URL"
                    value={baseUrl}
                    placeholder="https://api.example.com"
                    spellCheck={false}
                    onChange={(event) => setBaseUrl(event.currentTarget.value)}
                  />
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
                      if (Number.isInteger(value) && value >= 1 && value <= 120_000) {
                        setConfiguration((current) => ({ ...current, timeoutMs: value }));
                      }
                    }}
                  />
                </label>
              </div>
              <ParameterList
                label="Default headers"
                parameters={configuration.defaultHeaders}
                onChange={(defaultHeaders) =>
                  setConfiguration((current) => ({ ...current, defaultHeaders }))
                }
              />
              <div className="wr-api-operation-form">
                <div className="wr-api-fields three-columns">
                  <label>
                    <span>Operation name</span>
                    <input
                      aria-label="Operation name"
                      value={operation.name}
                      spellCheck={false}
                      onChange={(event) => {
                        const name = event.currentTarget.value;
                        updateOperation(operation.id, (current) => ({ ...current, name }));
                      }}
                    />
                  </label>
                  <label>
                    <span>Method</span>
                    <input
                      aria-label="Method"
                      list={methodListId}
                      value={operation.method}
                      spellCheck={false}
                      onChange={(event) => {
                        const method = event.currentTarget.value.toUpperCase();
                        updateOperation(operation.id, (current) => ({ ...current, method }));
                      }}
                    />
                    <datalist id={methodListId}>
                      {HTTP_METHOD_SUGGESTIONS.map((method) => (
                        <option value={method} key={method} />
                      ))}
                    </datalist>
                  </label>
                  <label>
                    <span>Credentials</span>
                    <select
                      aria-label="Credentials"
                      value={operation.credentials}
                      onChange={(event) => {
                        const credentials = event.currentTarget.value as ApiClientCredentials;
                        updateOperation(operation.id, (current) => ({ ...current, credentials }));
                      }}
                    >
                      {API_CLIENT_CREDENTIALS.map((credentials) => (
                        <option value={credentials} key={credentials}>
                          {credentials}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="wr-api-fields three-columns">
                  <label>
                    <span>Path</span>
                    <input
                      aria-label="Path"
                      value={operation.path}
                      placeholder="/customers"
                      spellCheck={false}
                      onChange={(event) => {
                        const path = event.currentTarget.value;
                        updateOperation(operation.id, (current) => ({ ...current, path }));
                      }}
                    />
                  </label>
                  <label>
                    <span>Dynamic API version</span>
                    <input
                      aria-label="Dynamic API version"
                      type="number"
                      min={1}
                      max={Number.MAX_SAFE_INTEGER}
                      step={1}
                      placeholder="Use path as entered"
                      value={operation.apiVersion ?? ''}
                      onChange={(event) => {
                        const apiVersion =
                          event.currentTarget.value === ''
                            ? null
                            : event.currentTarget.valueAsNumber;
                        updateOperation(operation.id, (current) => ({ ...current, apiVersion }));
                      }}
                    />
                    <small>
                      Per request. Adds /v&#123;version&#125; before the database/endpoint path.
                    </small>
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
                        const raw = event.currentTarget.value;
                        const value = raw.length === 0 ? null : Number(raw);
                        if (
                          value === null ||
                          (Number.isInteger(value) && value >= 1 && value <= 120_000)
                        ) {
                          updateOperation(operation.id, (current) => ({
                            ...current,
                            timeoutMs: value,
                          }));
                        }
                      }}
                    />
                  </label>
                </div>
                <ParameterList
                  label="Headers"
                  parameters={operation.headers}
                  onChange={(headers) =>
                    updateOperation(operation.id, (current) => ({ ...current, headers }))
                  }
                />
                <ParameterList
                  label="Query parameters"
                  parameters={operation.query}
                  onChange={(query) =>
                    updateOperation(operation.id, (current) => ({ ...current, query }))
                  }
                />
                <div className="wr-api-body-editor">
                  <label>
                    <span>Body type</span>
                    <select
                      aria-label="Body type"
                      value={operation.body.kind}
                      onChange={(event) => {
                        const kind = event.currentTarget.value as ApiClientBodyKind;
                        updateOperation(operation.id, (current) => ({
                          ...current,
                          body: { ...current.body, kind },
                        }));
                      }}
                    >
                      {API_CLIENT_BODY_KINDS.map((kind) => (
                        <option value={kind} key={kind}>
                          {kind}
                        </option>
                      ))}
                    </select>
                  </label>
                  {operation.body.kind !== 'none' && (
                    <label>
                      <span>Request body</span>
                      <textarea
                        aria-label="Request body"
                        value={operation.body.content}
                        placeholder={operation.body.kind === 'json' ? '{\n  "name": "Ada"\n}' : ''}
                        spellCheck={false}
                        onChange={(event) => {
                          const content = event.currentTarget.value;
                          updateOperation(operation.id, (current) => ({
                            ...current,
                            body: { ...current.body, content },
                          }));
                        }}
                      />
                    </label>
                  )}
                </div>
                {destructiveMethod && (
                  <p className="wr-api-write-warning" role="note">
                    This {operation.method.toUpperCase()} test performs a real write operation
                    against the target API.
                  </p>
                )}
                <p className="wr-api-secret-warning">
                  Headers are persisted in the project and generated application. Do not save
                  production secrets; inject them from application code at runtime.
                </p>
                <div className="wr-api-test-actions">
                  <button
                    type="button"
                    className="primary"
                    disabled={sending}
                    onClick={() => void testOperation()}
                  >
                    {sending ? 'Sending…' : 'Send test request'}
                  </button>
                  {sending && (
                    <button type="button" onClick={() => requestAbortRef.current?.abort()}>
                      Cancel request
                    </button>
                  )}
                </div>
              </div>
              {(error !== null || testResult !== null) && (
                <section className="wr-api-test-result" aria-live="polite">
                  {error !== null ? (
                    <div className="wr-modal-error" role="alert">
                      {error}
                    </div>
                  ) : testResult !== null ? (
                    <>
                      <div
                        className={`wr-api-response-status ${testResult.status >= 400 ? 'error' : ''}`}
                      >
                        <strong>
                          {String(testResult.status)} {testResult.statusText}
                        </strong>
                        <span>{testResult.durationMs} ms</span>
                        <code>{testResult.url}</code>
                      </div>
                      <details>
                        <summary>Response headers</summary>
                        <dl className="wr-api-response-headers">
                          {testResult.headers.map(([name, value]) => (
                            <div key={name}>
                              <dt>{name}</dt>
                              <dd>{value}</dd>
                            </div>
                          ))}
                        </dl>
                      </details>
                      <label className="wr-api-response-body">
                        <span>
                          Response body{testResult.bodyTruncated ? ' (preview truncated)' : ''}
                        </span>
                        <textarea readOnly value={testResult.bodyText} />
                      </label>
                    </>
                  ) : null}
                </section>
              )}
              {responseSchema !== null && (
                <section className="wr-api-schema-editor" aria-label="Response definitions">
                  <div className="wr-api-section-heading">
                    <div>
                      <span>Response definitions</span>
                      <small>
                        Choose the fields, objects, and lists that future components may bind to.
                      </small>
                    </div>
                  </div>
                  <ul>
                    <SchemaNodeEditor
                      node={responseSchema.root}
                      depth={0}
                      selectedIds={selectedSchemaIds}
                      ancestorIds={[]}
                      onSelectedChange={(node, selected, ancestors) => {
                        setSelectedSchemaIds((current) => {
                          const next = new Set(current);
                          if (selected) {
                            ancestors.forEach((id) => next.add(id));
                            collectInferredNodeIds(node, next);
                          } else {
                            collectInferredNodeIds(node).forEach((id) => next.delete(id));
                          }
                          return next;
                        });
                      }}
                      onPatch={(nodeId, patch) => {
                        setSchema(operation.id, {
                          ...responseSchema,
                          root: replaceSchemaNode(responseSchema.root, nodeId, patch),
                        });
                      }}
                    />
                  </ul>
                </section>
              )}
            </div>
          </div>
        </div>
        <footer className="wr-modal-actions wr-api-client-actions">
          <button type="button" disabled={sending} onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="primary" disabled={sending} onClick={save}>
            Save API Client
          </button>
        </footer>
      </section>
    </div>,
    document.body,
  );
}
