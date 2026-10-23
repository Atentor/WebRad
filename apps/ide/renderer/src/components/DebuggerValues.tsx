import { Icon } from './Icon';
import { useEffect, useRef, useState, type ReactElement } from 'react';
import type { DebugBridge, DebugValue, DebugVariable } from '../../../shared/debugger-contracts';

interface DebuggerValueProps {
  readonly name: string;
  readonly value: DebugValue;
  readonly bridge: DebugBridge;
  readonly sessionId: string;
  readonly depth?: number;
}

/** Remote objects are expanded on demand; no getters or expressions are executed by rendering. */
export function DebuggerValue({
  name,
  value,
  bridge,
  sessionId,
  depth = 0,
}: DebuggerValueProps): ReactElement {
  const [expanded, setExpanded] = useState(false);
  const [properties, setProperties] = useState<readonly DebugVariable[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const activeRef = useRef(true);
  useEffect(() => {
    activeRef.current = true;
    return () => {
      activeRef.current = false;
    };
  }, []);

  const toggle = (): void => {
    setExpanded(!expanded);
    if (expanded || properties !== null || loading || value.objectId === undefined) return;
    setLoading(true);
    setError(null);
    void bridge
      .properties({ sessionId, objectId: value.objectId })
      .then((next) => {
        if (activeRef.current) setProperties(next);
      })
      .catch((reason: unknown) => {
        if (activeRef.current) setError(reason instanceof Error ? reason.message : String(reason));
      })
      .finally(() => {
        if (activeRef.current) setLoading(false);
      });
  };
  const expandable = value.objectId !== undefined && depth < 10;
  return (
    <div className="wr-debug-value">
      <div className="wr-debug-value-line">
        {expandable ? (
          <button
            type="button"
            className="wr-debug-disclosure"
            aria-label={`${expanded ? 'Collapse' : 'Expand'} ${name}`}
            aria-expanded={expanded}
            onClick={toggle}
          >
            <Icon name={expanded ? 'chevron-down' : 'chevron-right'} />
          </button>
        ) : (
          <span className="wr-debug-disclosure" />
        )}
        <span className="wr-debug-value-name">{name}</span>
        <span aria-hidden="true">: </span>
        <span
          className={`wr-debug-value-description wr-debug-type-${value.type}`}
          title={value.description}
        >
          {value.description}
        </span>
      </div>
      {expanded && (
        <div className="wr-debug-value-children">
          {loading && <span role="status">Loading properties…</span>}
          {error !== null && (
            <span role="alert" className="wr-debug-error">
              {error}
            </span>
          )}
          {properties?.length === 0 && <span className="wr-debug-empty">No own properties.</span>}
          {properties?.map((property, index) => (
            <DebuggerValue
              key={`${property.name}-${String(index)}`}
              name={property.name}
              value={property.value}
              bridge={bridge}
              sessionId={sessionId}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}
