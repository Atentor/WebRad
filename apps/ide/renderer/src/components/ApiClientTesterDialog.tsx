import {
  getApiClientTemplateParameters,
  parseApiClientTemplateTestValue,
  resolveApiClientBodyTemplate,
  type WebApiTemplateValue,
  apiOperationPath,
  prepareRestGoApiRequest,
  prepareRestGoApplicationApiRequest,
} from '@webrad/runtime';
import {
  API_CLIENT_FIELD_TYPES,
  normalizeApiClientConfiguration,
  parseApiClientConfiguration,
  type ApiClientConfiguration,
  type ApiClientOperation,
  type ApiClientParameter,
  type ApiClientResponseSchema,
  type ApiClientSchemaNode,
  type ComponentNode,
  type RestGoProjectSettings,
} from '@webrad/project-model';
import {
  createApiClientTestRequest,
  importRestGoPublishedApis,
  type RestGoPublishedApi,
} from '@webrad/designer';
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
import { ApiClientRequestEditor } from './ApiClientRequestEditor';
import { RestGoApiPickerDialog } from './RestGoApiPickerDialog';
import './api-client-editor.css';

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
  readonly restGoSettings?: RestGoProjectSettings;
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
        <button
          type="button"
          aria-label={`Add ${label.toLocaleLowerCase()}`}
          onClick={() => onChange([...parameters, createParameter()])}
        >
          Add
        </button>
      </div>
      {parameters.length === 0 ? (
        <p className="wr-api-empty">No {label.toLocaleLowerCase()}.</p>
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
  restGoSettings,
  onClose,
  onSave,
}: ApiClientTesterDialogProps): ReactElement {
  const titleId = useId();
  const dialogRef = useRef<HTMLElement | null>(null);
  const baseUrlRef = useRef<HTMLInputElement | null>(null);
  const addOperationRef = useRef<HTMLButtonElement | null>(null);
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
  const [testJwt, setTestJwt] = useState('');
  const [showRestGoPicker, setShowRestGoPicker] = useState(false);
  const [uploads, setUploads] = useState<readonly File[]>([]);
  const [uploadField, setUploadField] = useState('file');
  const [testParameterValues, setTestParameterValues] = useState<
    ReadonlyMap<string, ReadonlyMap<string, string>>
  >(() => new Map());
  const restGoBound = (configuration.connection ?? 'custom') !== 'custom';
  const effectiveBaseUrl = restGoBound ? (restGoSettings?.baseUrl ?? '') : baseUrl;
  const restGoAvailable = restGoSettings?.enabled === true && restGoSettings.baseUrl.length > 0;

  const operation = useMemo(
    () =>
      configuration.operations.find((candidate) => candidate.id === selectedOperationId) ??
      configuration.operations[0],
    [configuration.operations, selectedOperationId],
  );

  useEffect(() => {
    (baseUrlRef.current ?? addOperationRef.current)?.focus();
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
    if (id === selectedOperationId) return;
    if (operation !== undefined && operation.id !== id && operation.responseSchema !== null) {
      const schema = pruneApiClientResponseSchema(operation.responseSchema, selectedSchemaIds);
      updateOperation(operation.id, (current) => ({ ...current, responseSchema: schema }));
    }
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
    setUploads([]);
  };

  const setSchema = (operationId: string, schema: ApiClientResponseSchema | null): void => {
    updateOperation(operationId, (current) => ({ ...current, responseSchema: schema }));
  };

  const addOperation = (): void => {
    const names = new Set(configuration.operations.map((candidate) => candidate.name));
    let sequence = configuration.operations.length + 1;
    while (names.has(`Request${String(sequence)}`)) sequence += 1;
    const next = createOperation(sequence);
    setConfiguration((current) => ({ ...current, operations: [...current.operations, next] }));
    selectOperation(next.id);
  };

  const testOperation = async (): Promise<void> => {
    if (operation === undefined || sending) return;
    const controller = new AbortController();
    requestAbortRef.current = controller;
    const timeoutMs = operation.timeoutMs ?? configuration.timeoutMs;
    const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
    const startedAt = performance.now();
    setSending(true);
    setError(null);
    setTestResult(null);
    try {
      const endpoint = apiOperationPath(operation.path, operation.apiVersion);
      const parameterValues = Object.fromEntries(
        (operation.body.kind === 'none'
          ? []
          : getApiClientTemplateParameters(operation.body.content, operation.body.parameters)
        ).map((parameter): readonly [string, WebApiTemplateValue] => {
          const inputs = testParameterValues.get(operation.id);
          if (parameter.type !== 'null' && !inputs?.has(parameter.name))
            throw new TypeError('Enter a test value for <' + parameter.name + '>.');
          return [
            parameter.name,
            parseApiClientTemplateTestValue(parameter, inputs?.get(parameter.name) ?? ''),
          ];
        }),
      );
      const body = {
        ...operation.body,
        content: resolveApiClientBodyTemplate(operation.body, parameterValues),
      };
      let request = createApiClientTestRequest(
        effectiveBaseUrl,
        configuration,
        { ...operation, path: endpoint, body },
        uploads,
        uploadField,
      );
      if (restGoBound) {
        if (!restGoAvailable)
          throw new Error('Enable RestGo integration in the RestGo sidebar first.');
        if (configuration.connection === 'restgo-session')
          request = await prepareRestGoApiRequest(
            endpoint,
            { ...request.init, signal: controller.signal },
            {
              baseUrl: effectiveBaseUrl,
              getSession: async () => ({
                data: {
                  token: testJwt.trim()
                    ? testJwt.trim().replace(/^Bearer\s+/iu, '')
                    : await window.webrad.restgoDevelopment.token({ baseUrl: effectiveBaseUrl }),
                },
                error: null,
              }),
            },
          );
        else
          request = prepareRestGoApplicationApiRequest(
            endpoint,
            configuration.connection === 'restgo-public' ? 'public' : 'api-token',
            { ...request.init, signal: controller.signal },
            { baseUrl: effectiveBaseUrl, apiToken: testJwt.trim() || restGoSettings?.apiToken },
          );
        const url = new URL(request.url);
        for (const parameter of operation.query) {
          if (parameter.enabled && parameter.name.trim())
            url.searchParams.append(parameter.name, parameter.value);
        }
        request = { ...request, url: url.href };
      }
      controller.signal.throwIfAborted();
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
      setError(reason);
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
        operations: configuration.operations
          .map((candidate) =>
            candidate.id !== selectedOperationId || candidate.responseSchema === null
              ? candidate
              : {
                  ...candidate,
                  responseSchema: pruneApiClientResponseSchema(
                    candidate.responseSchema,
                    selectedSchemaIds,
                  ),
                },
          )
          .map((candidate) => {
            const parameters = getApiClientTemplateParameters(
              candidate.body.content,
              candidate.body.parameters,
            );
            return parameters.length === 0 && candidate.body.parameters === undefined
              ? candidate
              : { ...candidate, body: { ...candidate.body, parameters } };
          }),
      };
      if (restGoBound && !restGoAvailable)
        throw new Error('Enable RestGo integration in the RestGo sidebar first.');
      onSave(restGoBound ? '' : baseUrl.trim(), parseApiClientConfiguration(selectedConfiguration));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    event.stopPropagation();
    if (showRestGoPicker) return;
    if (event.key === 'Escape' && !sending) {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = [
      ...(dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary',
      ) ?? []),
    ].filter(
      (element) =>
        !element.closest('fieldset:disabled') &&
        !element.closest('details:not([open]) > :not(summary)'),
    );
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

  const responseSchema = operation?.responseSchema ?? null;

  const importApis = (apis: readonly RestGoPublishedApi[], convertCustom: boolean): void => {
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
      const next = importRestGoPublishedApis(apis, selectedConfiguration, {
        replaceCustom: convertCustom,
      });
      const importedOperation =
        next.operations.find(
          (candidate) => !configuration.operations.some((existing) => existing.id === candidate.id),
        ) ?? next.operations[0];
      setConfiguration(next);
      setBaseUrl('');
      setSelectedOperationId(importedOperation?.id ?? '');
      setSelectedSchemaIds(
        importedOperation?.responseSchema == null
          ? new Set()
          : collectInferredNodeIds(importedOperation.responseSchema.root),
      );
      setTestResult(null);
      setTestJwt('');
      setUploads([]);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
    setShowRestGoPicker(false);
  };

  return createPortal(
    <>
      <div className="wr-modal-backdrop" role="presentation" onKeyDown={handleKeyDown}>
        <section
          ref={dialogRef}
          className="wr-modal wr-api-client-dialog"
          role="dialog"
          aria-modal={!showRestGoPicker}
          aria-labelledby={titleId}
          aria-busy={sending}
          aria-hidden={showRestGoPicker || undefined}
          inert={showRestGoPicker}
        >
          <header className="wr-modal-header">
            <div className="wr-api-client-heading">
              <h2 id={titleId}>API Client</h2>
              <span className="wr-api-component-name">{component.name}</span>
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
            <div className="wr-api-client-layout">
              <aside className="wr-api-operations" aria-label="API operations">
                <div className="wr-api-section-heading">
                  <span>
                    Requests <small>{configuration.operations.length}</small>
                  </span>
                  <button
                    ref={addOperationRef}
                    type="button"
                    aria-label="Add operation"
                    disabled={sending}
                    onClick={addOperation}
                  >
                    New
                  </button>
                </div>
                <button
                  className="wr-api-import-button"
                  type="button"
                  disabled={sending}
                  onClick={() => setShowRestGoPicker(true)}
                >
                  Import from RestGo
                </button>
                <nav className="wr-api-operation-list" aria-label="Saved API operations">
                  {configuration.operations.map((candidate) => (
                    <button
                      key={candidate.id}
                      type="button"
                      disabled={sending}
                      aria-label={`${candidate.name || 'Untitled request'} ${candidate.method || 'GET'}`}
                      aria-pressed={candidate.id === operation?.id}
                      title={`${candidate.method || 'GET'} ${candidate.path || 'No endpoint'}`}
                      className={candidate.id === operation?.id ? 'selected' : ''}
                      onClick={() => selectOperation(candidate.id)}
                    >
                      <small
                        className={`wr-api-operation-method method-${(candidate.method || 'GET').toLowerCase()}`}
                      >
                        {candidate.method || 'GET'}
                      </small>
                      <span className="wr-api-operation-label">
                        <strong>{candidate.name || 'Untitled request'}</strong>
                        <span className="wr-api-operation-path">
                          {candidate.path || 'No endpoint'}
                        </span>
                      </span>
                    </button>
                  ))}
                </nav>
                <button
                  type="button"
                  className="wr-api-remove-operation"
                  aria-label="Remove operation"
                  disabled={sending || operation === undefined}
                  onClick={() => {
                    if (operation === undefined) return;
                    const remaining = configuration.operations.filter(
                      (candidate) => candidate.id !== operation.id,
                    );
                    setConfiguration((current) => ({ ...current, operations: remaining }));
                    selectOperation(remaining[0]?.id ?? '');
                    if (remaining.length === 0) addOperationRef.current?.focus();
                  }}
                >
                  Delete request
                </button>
              </aside>
              <div className="wr-api-request-editor">
                {operation === undefined ? (
                  <div className="wr-api-no-operations" role="status">
                    <h3>No requests</h3>
                    <div className="wr-api-empty-actions">
                      <button type="button" disabled={sending} onClick={addOperation}>
                        New request
                      </button>
                      <button
                        type="button"
                        disabled={sending}
                        onClick={() => setShowRestGoPicker(true)}
                      >
                        Import from RestGo
                      </button>
                    </div>
                  </div>
                ) : (
                  <ApiClientRequestEditor
                    testParameterValues={
                      testParameterValues.get(operation.id) ?? new Map<string, string>()
                    }
                    onTestParameterChange={(name, value) =>
                      setTestParameterValues((current) => {
                        const next = new Map(current);
                        const values = new Map(current.get(operation.id));
                        values.set(name, value);
                        next.set(operation.id, values);
                        return next;
                      })
                    }
                    key={operation.id}
                    baseUrl={baseUrl}
                    baseUrlRef={baseUrlRef}
                    configuration={configuration}
                    operation={operation}
                    restGoSettings={restGoSettings}
                    sending={sending}
                    testJwt={testJwt}
                    uploads={uploads}
                    uploadField={uploadField}
                    onBaseUrlChange={setBaseUrl}
                    onConfigurationChange={setConfiguration}
                    onOperationChange={(patch) =>
                      updateOperation(operation.id, (current) => ({ ...current, ...patch }))
                    }
                    onTestJwtChange={setTestJwt}
                    onUploadFieldChange={setUploadField}
                    onUploadsChange={setUploads}
                    onTest={() => void testOperation()}
                    onCancelRequest={() => requestAbortRef.current?.abort()}
                    renderParameters={(label, parameters, onChange) => (
                      <ParameterList label={label} parameters={parameters} onChange={onChange} />
                    )}
                  />
                )}
                {(error !== null || testResult !== null) && (
                  <section className="wr-api-test-result" aria-live="polite">
                    <h3>Response</h3>
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
                {responseSchema !== null && operation !== undefined && (
                  <section className="wr-api-schema-editor" aria-label="Response definitions">
                    <div className="wr-api-section-heading">
                      <div>
                        <span>Response fields</span>
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
      </div>
      {showRestGoPicker && (
        <RestGoApiPickerDialog
          restGoSettings={restGoSettings}
          configuration={configuration}
          customBaseUrl={baseUrl}
          onClose={() => setShowRestGoPicker(false)}
          onImport={importApis}
        />
      )}
    </>,
    document.body,
  );
}
