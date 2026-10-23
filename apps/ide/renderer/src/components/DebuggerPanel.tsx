import { Icon } from './Icon';
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactElement,
} from 'react';
import type {
  DebugAction,
  DebugBreakpoint,
  DebugBridge,
  DebugEvaluation,
  DebugExceptionMode,
  DebugFrame,
  DebugLocation,
  DebugState,
  DebugValue,
} from '../../../shared/debugger-contracts';
import { DebuggerValue } from './DebuggerValues';
import '../debugger.css';

export interface DebuggerPanelProps {
  readonly state: DebugState;
  readonly bridge: DebugBridge;
  readonly breakpoints: readonly DebugBreakpoint[];
  readonly watches: readonly string[];
  readonly pauseOnExceptions: DebugExceptionMode;
  readonly selectedFrameId?: string;
  readonly busy?: boolean;
  readonly canStart?: boolean;
  readonly onAction: (action: DebugAction) => void;
  readonly onStart: () => void;
  readonly onToggleBreakpoint: (path: string, line: number) => void;
  readonly onUpdateBreakpoint: (breakpoint: DebugBreakpoint) => void;
  readonly onRemoveBreakpoint: (path: string, line: number) => void;
  readonly onClearBreakpoints: () => void;
  readonly onWatchesChange: (watches: readonly string[]) => void;
  readonly onExceptionModeChange: (mode: DebugExceptionMode) => void;
  readonly onSelectFrame: (frame: DebugFrame) => void;
  readonly onNavigateLocation?: (location: DebugLocation) => void;
}

interface ConsoleEntry {
  readonly id: number;
  readonly expression?: string;
  readonly level?: string;
  readonly values: readonly DebugValue[];
  readonly error?: string;
  readonly pending?: boolean;
}

function errorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}
function locationLabel(location: DebugLocation): string {
  return `${location.path}:${String(location.line)}:${String(location.column)}`;
}

function BreakpointRow({
  breakpoint,
  state,
  onUpdate,
  onRemove,
  onNavigate,
}: {
  readonly breakpoint: DebugBreakpoint;
  readonly state: DebugState;
  readonly onUpdate: (breakpoint: DebugBreakpoint) => void;
  readonly onRemove: (path: string, line: number) => void;
  readonly onNavigate: ((location: DebugLocation) => void) | undefined;
}): ReactElement {
  const [condition, setCondition] = useState(breakpoint.condition ?? '');
  const savedConditionRef = useRef(breakpoint.condition ?? '');
  useLayoutEffect(() => {
    savedConditionRef.current = breakpoint.condition ?? '';
  }, [breakpoint.condition]);
  const resolved = state.breakpoints.find(
    (entry) => entry.path === breakpoint.path && entry.line === breakpoint.line,
  );
  const saveCondition = (): void => {
    const normalized = condition.trim();
    if (normalized !== savedConditionRef.current) {
      savedConditionRef.current = normalized;
      onUpdate({ ...breakpoint, condition: normalized || undefined });
    }
  };
  return (
    <li className="wr-debug-breakpoint-row">
      <div className="wr-debug-breakpoint-heading">
        <input
          type="checkbox"
          aria-label={`Enable breakpoint ${breakpoint.path}:${String(breakpoint.line)}`}
          checked={breakpoint.enabled}
          onChange={(event) => onUpdate({ ...breakpoint, enabled: event.currentTarget.checked })}
        />
        <button
          type="button"
          className="wr-debug-source-link"
          title={
            resolved?.message ??
            (resolved?.verified
              ? 'Verified breakpoint'
              : 'Breakpoint will resolve when executable code loads')
          }
          onClick={() =>
            onNavigate?.({
              path: breakpoint.path,
              line: breakpoint.line,
              column: breakpoint.column ?? 1,
            })
          }
          disabled={onNavigate === undefined}
        >
          {breakpoint.path}:{breakpoint.line}
          {resolved?.actualLine !== undefined && resolved.actualLine !== breakpoint.line
            ? ` → ${String(resolved.actualLine)}`
            : ''}
        </button>
        <button
          type="button"
          className="wr-debug-remove"
          aria-label={`Remove breakpoint ${breakpoint.path}:${String(breakpoint.line)}`}
          onClick={() => onRemove(breakpoint.path, breakpoint.line)}
        >
          <Icon name="close" />
        </button>
      </div>
      <input
        className="wr-debug-condition"
        aria-label={`Condition for ${breakpoint.path}:${String(breakpoint.line)}`}
        placeholder="Condition (optional)"
        maxLength={4096}
        value={condition}
        onChange={(event) => setCondition(event.currentTarget.value)}
        onBlur={saveCondition}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            saveCondition();
            event.currentTarget.blur();
          }
        }}
      />
      {resolved?.message !== undefined && (
        <small className="wr-debug-muted">{resolved.message}</small>
      )}
    </li>
  );
}

function PausedInspector({
  state,
  bridge,
  frame,
  watches,
  onWatchesChange,
}: {
  readonly state: DebugState;
  readonly bridge: DebugBridge;
  readonly frame: DebugFrame;
  readonly watches: readonly string[];
  readonly onWatchesChange: (watches: readonly string[]) => void;
}): ReactElement {
  const [watchResults, setWatchResults] = useState<ReadonlyMap<string, DebugEvaluation>>(new Map());
  const [watchExpression, setWatchExpression] = useState('');
  const sessionId = state.sessionId;
  useEffect(() => {
    if (sessionId === null) return;
    let active = true;
    void Promise.all(
      watches.map(async (expression): Promise<readonly [string, DebugEvaluation]> => {
        try {
          return [expression, await bridge.evaluate({ sessionId, frameId: frame.id, expression })];
        } catch (reason) {
          return [
            expression,
            {
              value: { type: 'undefined', description: 'unavailable' },
              error: errorMessage(reason),
            },
          ];
        }
      }),
    ).then((results) => {
      if (active) setWatchResults(new Map(results));
    });
    return () => {
      active = false;
    };
  }, [bridge, sessionId, frame.id, state.frames, watches]);

  const addWatch = (event: FormEvent): void => {
    event.preventDefault();
    const expression = watchExpression.trim();
    if (expression.length === 0) return;
    if (!watches.includes(expression)) onWatchesChange([...watches, expression]);
    setWatchExpression('');
  };
  return (
    <>
      <section className="wr-debug-section" aria-label="Variables">
        <h3>Variables</h3>
        {sessionId !== null && (
          <>
            <DebuggerValue
              key={frame.thisValue.objectId ?? 'this'}
              name="this"
              value={frame.thisValue}
              bridge={bridge}
              sessionId={sessionId}
            />
            {frame.scopes.map((scope, index) => (
              <DebuggerValue
                key={`${scope.objectId}-${String(index)}`}
                name={scope.name ?? scope.type}
                value={{ type: 'object', description: scope.type, objectId: scope.objectId }}
                bridge={bridge}
                sessionId={sessionId}
              />
            ))}
          </>
        )}
      </section>
      <section className="wr-debug-section" aria-label="Watch expressions">
        <h3>Watch</h3>
        <form className="wr-debug-inline-form" onSubmit={addWatch}>
          <input
            aria-label="New watch expression"
            placeholder="Expression"
            value={watchExpression}
            onChange={(event) => setWatchExpression(event.currentTarget.value)}
          />
          <button type="submit" disabled={watchExpression.trim().length === 0}>
            Add
          </button>
        </form>
        {watches.length === 0 && (
          <p className="wr-debug-empty">Add an expression to inspect at each pause.</p>
        )}
        {watches.map((expression) => {
          const result = watchResults.get(expression);
          return (
            <div className="wr-debug-watch" key={expression}>
              <div className="wr-debug-watch-value">
                {result?.error ? (
                  <span className="wr-debug-error" title={result.error}>
                    {expression}: {result.error}
                  </span>
                ) : result !== undefined && sessionId !== null ? (
                  <DebuggerValue
                    key={result.value.objectId ?? expression}
                    name={expression}
                    value={result.value}
                    bridge={bridge}
                    sessionId={sessionId}
                  />
                ) : (
                  <span className="wr-debug-muted">{expression}: evaluating…</span>
                )}
              </div>
              <button
                type="button"
                className="wr-debug-remove"
                aria-label={`Remove watch ${expression}`}
                onClick={() => onWatchesChange(watches.filter((item) => item !== expression))}
              >
                <Icon name="close" />
              </button>
            </div>
          );
        })}
      </section>
    </>
  );
}

export function DebuggerPanel({
  state,
  bridge,
  breakpoints,
  watches,
  pauseOnExceptions,
  selectedFrameId,
  busy = false,
  canStart = true,
  onAction,
  onStart,
  onUpdateBreakpoint,
  onRemoveBreakpoint,
  onClearBreakpoints,
  onWatchesChange,
  onExceptionModeChange,
  onSelectFrame,
  onNavigateLocation,
}: DebuggerPanelProps): ReactElement {
  const paused = state.status === 'paused';
  const active = paused || state.status === 'running' || state.status === 'starting';
  const frame = state.frames.find((item) => item.id === selectedFrameId) ?? state.frames[0];
  const [consoleEntries, setConsoleEntries] = useState<readonly ConsoleEntry[]>([]);
  const [consoleExpression, setConsoleExpression] = useState('');
  const [evaluating, setEvaluating] = useState(false);
  const [consoleError, setConsoleError] = useState<string | null>(null);
  const [consoleContext, setConsoleContext] = useState({
    sessionId: state.sessionId,
    status: state.status,
    frames: state.frames,
    selectedFrameId,
  });
  const [watchExpression, setWatchExpression] = useState('');
  const consoleIdRef = useRef(0);
  const consoleHistoryRef = useRef<string[]>([]);
  const historyPositionRef = useRef(0);
  const epochRef = useRef(0);
  const mountedRef = useRef(true);
  const consoleLogRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    epochRef.current += 1;
  }, [state.sessionId, state.status, state.frames, selectedFrameId]);
  if (
    consoleContext.sessionId !== state.sessionId ||
    consoleContext.status !== state.status ||
    consoleContext.frames !== state.frames ||
    consoleContext.selectedFrameId !== selectedFrameId
  ) {
    setConsoleContext({
      sessionId: state.sessionId,
      status: state.status,
      frames: state.frames,
      selectedFrameId,
    });
    setEvaluating(false);
    setConsoleError(null);
    setConsoleEntries((current) =>
      current.some((entry) => entry.pending)
        ? current.map((entry) =>
            entry.pending
              ? {
                  ...entry,
                  pending: false,
                  error: 'Evaluation interrupted by a debugger state change.',
                }
              : entry,
          )
        : current,
    );
  }
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  useEffect(
    () =>
      bridge.subscribe((event) => {
        if (event.type !== 'console') return;
        const entry: ConsoleEntry = {
          id: ++consoleIdRef.current,
          values: event.values,
          level: event.level,
        };
        setConsoleEntries((current) => [...current, entry].slice(-300));
      }),
    [bridge],
  );
  useEffect(() => {
    if (consoleLogRef.current !== null)
      consoleLogRef.current.scrollTop = consoleLogRef.current.scrollHeight;
  }, [consoleEntries]);

  const evaluate = (event: FormEvent): void => {
    event.preventDefault();
    const expression = consoleExpression.trim();
    if (
      !paused ||
      frame === undefined ||
      state.sessionId === null ||
      expression.length === 0 ||
      evaluating
    )
      return;
    const epoch = epochRef.current;
    const id = ++consoleIdRef.current;
    consoleHistoryRef.current.push(expression);
    historyPositionRef.current = consoleHistoryRef.current.length;
    setConsoleExpression('');
    setConsoleError(null);
    setEvaluating(true);
    setConsoleEntries((current) =>
      [...current, { id, expression, values: [], pending: true }].slice(-300),
    );
    void bridge
      .evaluate({ sessionId: state.sessionId, frameId: frame.id, expression })
      .then((result) => {
        if (!mountedRef.current || epochRef.current !== epoch) return;
        setConsoleEntries((current) =>
          current.map((entry) =>
            entry.id === id
              ? { ...entry, values: [result.value], error: result.error, pending: false }
              : entry,
          ),
        );
      })
      .catch((reason: unknown) => {
        if (!mountedRef.current || epochRef.current !== epoch) return;
        const message = errorMessage(reason);
        setConsoleError(message);
        setConsoleEntries((current) =>
          current.map((entry) =>
            entry.id === id ? { ...entry, error: message, pending: false } : entry,
          ),
        );
      })
      .finally(() => {
        if (mountedRef.current && epochRef.current === epoch) setEvaluating(false);
      });
  };
  const addInactiveWatch = (event: FormEvent): void => {
    event.preventDefault();
    const expression = watchExpression.trim();
    if (expression.length === 0) return;
    if (!watches.includes(expression)) onWatchesChange([...watches, expression]);
    setWatchExpression('');
  };

  return (
    <section className="wr-debugger" aria-label="Code debugger">
      <div className="wr-debug-toolbar" role="toolbar" aria-label="Debugger controls">
        {active ? (
          <button
            type="button"
            disabled={busy || state.status === 'starting'}
            onClick={() => onAction(paused ? 'resume' : 'pause')}
            title={paused ? 'Continue (F5)' : 'Pause'}
          >
            <Icon name={paused ? 'play' : 'pause'} />
            {paused ? 'Continue' : 'Pause'}
          </button>
        ) : (
          <button
            type="button"
            disabled={busy || !canStart}
            onClick={onStart}
            title="Start debugging (F5)"
          >
            <Icon name="play" /> Start
          </button>
        )}
        <button
          type="button"
          disabled={!paused || busy}
          onClick={() => onAction('stepOver')}
          title="Step over (F10)"
        >
          Step over
        </button>
        <button
          type="button"
          disabled={!paused || busy}
          onClick={() => onAction('stepInto')}
          title="Step into (F11)"
        >
          Step into
        </button>
        <button
          type="button"
          disabled={!paused || busy}
          onClick={() => onAction('stepOut')}
          title="Step out (Shift+F11)"
        >
          Step out
        </button>
        <button
          type="button"
          disabled={!active || busy}
          onClick={() => onAction('restart')}
          title="Restart (Ctrl+Shift+F5)"
        >
          <Icon name="refresh-cw" /> Restart
        </button>
        <button
          type="button"
          disabled={!(active || busy)}
          onClick={() => onAction('stop')}
          title="Stop (Shift+F5)"
        >
          <Icon name="square" /> Stop
        </button>
        <span className={`wr-debug-status wr-debug-status-${state.status}`} role="status">
          {busy
            ? 'Working…'
            : state.status === 'paused'
              ? `Paused${state.reason ? `: ${state.reason}` : ''}`
              : state.status[0]?.toUpperCase() + state.status.slice(1)}
        </span>
        <label className="wr-debug-exceptions">
          Pause on exceptions{' '}
          <select
            aria-label="Pause on exceptions"
            value={pauseOnExceptions}
            onChange={(event) =>
              onExceptionModeChange(event.currentTarget.value as DebugExceptionMode)
            }
          >
            <option value="none">Never</option>
            <option value="uncaught">Uncaught</option>
            <option value="all">All</option>
          </select>
        </label>
      </div>
      {state.message && (
        <div
          className={
            state.status === 'error'
              ? 'wr-debug-error wr-debug-message'
              : 'wr-debug-muted wr-debug-message'
          }
          role={state.status === 'error' ? 'alert' : undefined}
        >
          {state.message}
        </div>
      )}
      {state.exception && (
        <div className="wr-debug-error wr-debug-message" role="alert">
          {state.exception.description}
        </div>
      )}
      <div className="wr-debug-layout">
        <section className="wr-debug-section" aria-label="Call stack">
          <h3>Call stack</h3>
          {paused ? (
            <ol className="wr-debug-stack">
              {state.frames.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className={item.id === frame?.id ? 'selected' : ''}
                    aria-pressed={item.id === frame?.id}
                    onClick={() => onSelectFrame(item)}
                    title={
                      item.location === undefined
                        ? 'Source unavailable'
                        : locationLabel(item.location)
                    }
                  >
                    <strong>{item.name || '(anonymous)'}</strong>
                    <small>
                      {item.location === undefined ? 'External code' : locationLabel(item.location)}
                    </small>
                  </button>
                </li>
              ))}
            </ol>
          ) : (
            <p className="wr-debug-empty">
              {active
                ? 'Running. Pause to inspect the call stack.'
                : 'Start debugging or set breakpoints in the editor gutter.'}
            </p>
          )}
        </section>
        {paused && frame !== undefined ? (
          <PausedInspector
            key={`${state.sessionId ?? ''}:${frame.id}:${frame.thisValue.objectId ?? ''}:${frame.scopes.map((scope) => scope.objectId).join(',')}`}
            state={state}
            bridge={bridge}
            frame={frame}
            watches={watches}
            onWatchesChange={onWatchesChange}
          />
        ) : (
          <>
            <section className="wr-debug-section" aria-label="Variables">
              <h3>Variables</h3>
              <p className="wr-debug-empty">Variables are available while paused.</p>
            </section>
            <section className="wr-debug-section" aria-label="Watch expressions">
              <h3>Watch</h3>
              <form className="wr-debug-inline-form" onSubmit={addInactiveWatch}>
                <input
                  aria-label="New watch expression"
                  placeholder="Expression"
                  value={watchExpression}
                  onChange={(event) => setWatchExpression(event.currentTarget.value)}
                />
                <button type="submit" disabled={watchExpression.trim().length === 0}>
                  Add
                </button>
              </form>
              {watches.map((expression) => (
                <div className="wr-debug-watch" key={expression}>
                  <span>{expression}</span>
                  <button
                    type="button"
                    className="wr-debug-remove"
                    aria-label={`Remove watch ${expression}`}
                    onClick={() => onWatchesChange(watches.filter((item) => item !== expression))}
                  >
                    <Icon name="close" />
                  </button>
                </div>
              ))}
            </section>
          </>
        )}
        <section className="wr-debug-section" aria-label="Breakpoints">
          <div className="wr-debug-section-heading">
            <h3>Breakpoints</h3>
            <button
              type="button"
              className="wr-debug-remove"
              disabled={breakpoints.length === 0}
              onClick={onClearBreakpoints}
            >
              Clear all
            </button>
          </div>
          {breakpoints.length === 0 ? (
            <p className="wr-debug-empty">Click the editor gutter or press Ctrl+F9.</p>
          ) : (
            <ul className="wr-debug-breakpoints">
              {breakpoints.map((breakpoint) => (
                <BreakpointRow
                  key={`${breakpoint.path}:${String(breakpoint.line)}:${breakpoint.condition ?? ''}`}
                  breakpoint={breakpoint}
                  state={state}
                  onUpdate={onUpdateBreakpoint}
                  onRemove={onRemoveBreakpoint}
                  onNavigate={onNavigateLocation}
                />
              ))}
            </ul>
          )}
        </section>
      </div>
      <section className="wr-debug-console" aria-label="Debug console">
        <div className="wr-debug-section-heading">
          <h3>Debug console</h3>
          <button
            type="button"
            className="wr-debug-remove"
            onClick={() => {
              setConsoleEntries([]);
              setConsoleError(null);
            }}
          >
            Clear
          </button>
        </div>
        <div
          className="wr-debug-console-log"
          ref={consoleLogRef}
          role="log"
          aria-label="Debug console output"
        >
          {consoleEntries.map((entry) => (
            <div
              key={entry.id}
              className={`wr-debug-console-entry wr-debug-console-${entry.level ?? 'result'}`}
            >
              {entry.expression !== undefined && (
                <div className="wr-debug-muted">
                  <Icon name="chevron-right" />
                  {entry.expression}
                </div>
              )}
              {entry.pending && <span className="wr-debug-muted">Evaluating…</span>}
              {entry.error ? (
                <div className="wr-debug-error">{entry.error}</div>
              ) : (
                entry.values.map((value, index) => (
                  <span key={String(index)} className={`wr-debug-type-${value.type}`}>
                    {value.description}
                    {index < entry.values.length - 1 ? ' ' : ''}
                  </span>
                ))
              )}
            </div>
          ))}
        </div>
        {consoleError !== null && (
          <div className="wr-debug-error" role="alert">
            {consoleError}
          </div>
        )}
        <form className="wr-debug-console-form" onSubmit={evaluate}>
          <span aria-hidden="true">
            <Icon name="chevron-right" />
          </span>
          <input
            aria-label="Debug console expression"
            placeholder={
              paused
                ? 'Evaluate an expression in the selected frame'
                : 'Pause to evaluate expressions'
            }
            disabled={!paused || busy || evaluating}
            value={consoleExpression}
            onChange={(event) => setConsoleExpression(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
              event.preventDefault();
              historyPositionRef.current = Math.max(
                0,
                Math.min(
                  consoleHistoryRef.current.length,
                  historyPositionRef.current + (event.key === 'ArrowUp' ? -1 : 1),
                ),
              );
              setConsoleExpression(consoleHistoryRef.current[historyPositionRef.current] ?? '');
            }}
          />
          <button
            type="submit"
            disabled={!paused || busy || evaluating || consoleExpression.trim().length === 0}
          >
            {evaluating ? 'Evaluating…' : 'Evaluate'}
          </button>
        </form>
      </section>
    </section>
  );
}
