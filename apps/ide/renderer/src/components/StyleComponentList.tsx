import { defaultComponentRegistry } from '@webrad/component-registry';
import type { ComponentStyleModel } from '@webrad/project-model';
import type { ReactElement } from 'react';
import { ComponentIcon } from './ComponentIcon';
import { Panel } from './Panel';

interface StyleComponentListProps {
  readonly styles: readonly ComponentStyleModel[];
  readonly selectedType: string;
  readonly onSelect: (type: string) => void;
}

export function StyleComponentList({
  styles,
  selectedType,
  onSelect,
}: StyleComponentListProps): ReactElement {
  const definitions = defaultComponentRegistry.list().filter((definition) => definition.visual);
  const types = [
    ...new Set([
      ...definitions.map((definition) => definition.type),
      ...styles.map((style) => style.componentType),
    ]),
  ];
  return (
    <Panel title="Style components">
      <div className="wr-style-list" role="listbox" aria-label="Style components">
        {types.map((type) => {
          const definition = defaultComponentRegistry.get(type);
          return (
            <button
              key={type}
              type="button"
              role="option"
              data-style-component-type={type}
              aria-selected={selectedType === type}
              className={selectedType === type ? 'selected' : ''}
              onClick={() => onSelect(type)}
            >
              <span className="wr-style-component-glyph" aria-hidden="true">
                <ComponentIcon icon={definition?.icon} />
              </span>
              <span>
                <strong>{definition?.displayName ?? type}</strong>
              </span>
            </button>
          );
        })}
      </div>
    </Panel>
  );
}
