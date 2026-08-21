import {
  defaultComponentRegistry,
  type ComponentDefinition,
  type ComponentRegistry,
} from '@webrad/component-registry';
import { useMemo, useState, type DragEvent, type ReactElement } from 'react';
import { Panel } from './Panel';

export const WEBRAD_COMPONENT_DRAG_TYPE = 'application/x-webrad-component';

export interface ToolPaletteProps {
  selectedType?: string | null;
  onSelect: (componentType: string) => void;
  onInsert: (componentType: string) => void;
  registry?: ComponentRegistry;
}

interface PaletteCategory {
  readonly name: string;
  readonly components: readonly ComponentDefinition[];
}

function normalizeSearchValue(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function matchesSearch(definition: ComponentDefinition, query: string): boolean {
  if (query.length === 0) return true;
  return [
    definition.palette.caption,
    definition.displayName,
    definition.palette.category,
    definition.type,
  ].some((value) => value.toLocaleLowerCase().includes(query));
}

function groupByCategory(
  definitions: readonly ComponentDefinition[],
  query: string,
): readonly PaletteCategory[] {
  const categories = new Map<string, ComponentDefinition[]>();

  for (const definition of definitions) {
    if (definition.type === 'WebPage' || !matchesSearch(definition, query)) continue;
    const category = categories.get(definition.palette.category) ?? [];
    category.push(definition);
    categories.set(definition.palette.category, category);
  }

  return [...categories].map(([name, components]) => ({ name, components }));
}

function beginComponentDrag(
  event: DragEvent<HTMLButtonElement>,
  definition: ComponentDefinition,
): void {
  event.dataTransfer.effectAllowed = 'copy';
  event.dataTransfer.setData(WEBRAD_COMPONENT_DRAG_TYPE, definition.type);
  event.dataTransfer.setData('text/plain', definition.type);
}

export function ToolPalette({
  selectedType = null,
  onSelect,
  onInsert,
  registry = defaultComponentRegistry,
}: ToolPaletteProps): ReactElement {
  const [search, setSearch] = useState('');
  const [collapsedCategories, setCollapsedCategories] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const normalizedSearch = normalizeSearchValue(search);
  const categories = useMemo(
    () => groupByCategory(registry.list(), normalizedSearch),
    [normalizedSearch, registry],
  );

  const toggleCategory = (category: string): void => {
    setCollapsedCategories((current) => {
      const next = new Set(current);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  };

  return (
    <Panel title="Tool Palette" className="wr-tool-palette">
      <div className="wr-palette-search">
        <span className="wr-palette-search-icon" aria-hidden="true">
          &#128269;
        </span>
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search components..."
          aria-label="Search components"
          spellCheck={false}
        />
        {search.length > 0 && (
          <button
            type="button"
            className="wr-palette-clear"
            onClick={() => setSearch('')}
            aria-label="Clear component search"
            title="Clear search"
          >
            &times;
          </button>
        )}
      </div>

      <div className="wr-palette-categories" aria-label="Components">
        {categories.length === 0 ? (
          <div className="wr-palette-empty">No components match &ldquo;{search.trim()}&rdquo;.</div>
        ) : (
          categories.map((category) => {
            const expanded = normalizedSearch.length > 0 || !collapsedCategories.has(category.name);
            return (
              <section className="wr-palette-category" key={category.name}>
                <button
                  type="button"
                  className="wr-palette-category-header"
                  aria-expanded={expanded}
                  onClick={() => toggleCategory(category.name)}
                >
                  <span className="wr-palette-chevron" aria-hidden="true">
                    {expanded ? '\u25be' : '\u25b8'}
                  </span>
                  <span>{category.name}</span>
                  <small>{category.components.length}</small>
                </button>

                {expanded && (
                  <div className="wr-palette-items">
                    {category.components.map((definition) => {
                      const selected = selectedType === definition.type;
                      return (
                        <button
                          type="button"
                          className={`wr-palette-item${selected ? ' selected' : ''}`}
                          key={definition.type}
                          draggable
                          aria-pressed={selected}
                          title={`Select ${definition.displayName}; drag or double-click to insert`}
                          onClick={() => onSelect(definition.type)}
                          onDoubleClick={() => {
                            onSelect(definition.type);
                            onInsert(definition.type);
                          }}
                          onDragStart={(event) => {
                            onSelect(definition.type);
                            beginComponentDrag(event, definition);
                          }}
                        >
                          <span
                            className="wr-palette-item-icon"
                            data-icon={definition.icon}
                            aria-hidden="true"
                          >
                            {definition.palette.caption.slice(0, 1).toLocaleUpperCase()}
                          </span>
                          <span className="wr-palette-item-caption">
                            {definition.palette.caption}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </section>
            );
          })
        )}
      </div>
    </Panel>
  );
}
