import { Icon } from './Icon';
import { componentRegistry, getCurrentRowBindableProperties } from '@webrad/component-registry';
import {
  normalizeCurrentRowBindings,
  type ComponentNode,
  type CurrentRowBinding,
} from '@webrad/project-model';
import { useId, useState, type ReactElement } from 'react';
import { createPortal } from 'react-dom';
import { compatibleCurrentRowField, currentRowFields } from './repeating-group-editor';
import { useRowConfigurationDialog } from './useRowConfigurationDialog';

interface CurrentRowBindingsDialogProps {
  readonly component: ComponentNode;
  readonly group: ComponentNode;
  readonly availableComponents: readonly ComponentNode[];
  readonly onClose: () => void;
  readonly onSave: (bindings: readonly CurrentRowBinding[]) => void;
}

const STATIC_VALUE = '__static__';

export function CurrentRowBindingsDialog({
  component,
  group,
  availableComponents,
  onClose,
  onSave,
}: CurrentRowBindingsDialogProps): ReactElement {
  const titleId = useId();
  const { dialogRef, handleKeyDown } = useRowConfigurationDialog(onClose);
  const [draft, setDraft] = useState(() =>
    normalizeCurrentRowBindings(component.props.currentRowBindings),
  );
  const definition = componentRegistry.get(component.type);
  const properties =
    definition === undefined
      ? []
      : getCurrentRowBindableProperties(definition).filter(
          (property) => property.readOnlyWhen?.(component.props) !== true,
        );
  const fields = currentRowFields(group, availableComponents);
  const categoryOrder = ['Appearance', 'Data', 'Behavior', 'Size & position'];
  const categoryPriority = (category: string): number => {
    const index = categoryOrder.indexOf(category);
    return index < 0 ? categoryOrder.length : index;
  };
  const categories = [
    ...new Set(properties.map((property) => property.category ?? 'Visual values')),
  ].sort((left, right) => categoryPriority(left) - categoryPriority(right));
  const obsoleteBindings = draft.filter(
    (binding) => !properties.some((property) => property.name === binding.property),
  );
  const valid = draft.every((binding) =>
    properties.some(
      (property) =>
        property.name === binding.property &&
        fields.some(
          (field) => field.path === binding.fieldPath && compatibleCurrentRowField(property, field),
        ),
    ),
  );
  return createPortal(
    <div className="wr-modal-backdrop" role="presentation" onKeyDown={handleKeyDown}>
      <section
        ref={dialogRef}
        className="wr-modal wr-data-grid-configuration-dialog wr-current-row-bindings-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header className="wr-modal-header">
          <div>
            <span className="wr-modal-eyebrow">
              {group.name} / {component.name}
            </span>
            <h2 id={titleId}>Bind Current Row</h2>
          </div>
          <button
            type="button"
            className="wr-modal-close"
            aria-label="Close current row bindings"
            onClick={onClose}
          >
            <Icon name="close" />
          </button>
        </header>
        <form
          className="wr-data-grid-configuration-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (valid) onSave(draft);
          }}
        >
          <div className="wr-data-grid-configuration-content">
            <p className="wr-modal-description">
              Choose a field for each visual value. Every repeated component receives the value from
              its own row. Static value uses the component's saved property.
            </p>
            {fields.length === 0 && (
              <p className="wr-modal-description">
                Configure this Repeating Group with an API Client response list to choose fields.
              </p>
            )}
            {categories.map((category) => (
              <fieldset className="wr-row-editor-section" key={category}>
                <legend>{category}</legend>
                <div className="wr-data-grid-configuration-fields">
                  {properties
                    .filter((property) => (property.category ?? 'Visual values') === category)
                    .map((property) => {
                      const binding = draft.find(
                        (candidate) => candidate.property === property.name,
                      );
                      const choices = fields.filter((field) =>
                        compatibleCurrentRowField(property, field),
                      );
                      const savedValue = component.props[property.name] ?? property.defaultValue;
                      const staticValue =
                        savedValue === '' || savedValue == null ? 'Empty' : String(savedValue);
                      const hintId = `${titleId}-${property.name}-static`;
                      return (
                        <label key={property.name}>
                          <span>{property.label ?? property.name}</span>
                          <select
                            aria-label={`Current row ${property.label ?? property.name}`}
                            aria-describedby={hintId}
                            aria-invalid={
                              binding !== undefined &&
                              !choices.some((field) => field.path === binding.fieldPath)
                            }
                            value={binding?.fieldPath ?? STATIC_VALUE}
                            onChange={(event) => {
                              const fieldPath = event.currentTarget.value;
                              setDraft((current) => [
                                ...current.filter(
                                  (candidate) => candidate.property !== property.name,
                                ),
                                ...(fieldPath === STATIC_VALUE
                                  ? []
                                  : [{ property: property.name, fieldPath }]),
                              ]);
                            }}
                          >
                            <option value={STATIC_VALUE}>Static value</option>
                            {binding !== undefined &&
                              !choices.some((field) => field.path === binding.fieldPath) && (
                                <option value={binding.fieldPath} disabled>
                                  (unavailable field: {binding.fieldPath || 'Item value'})
                                </option>
                              )}
                            {choices.map((field) => (
                              <option key={field.path} value={field.path}>
                                {field.label} ({field.fieldType})
                              </option>
                            ))}
                          </select>
                          <small
                            id={hintId}
                            className="wr-row-binding-static-value"
                            title={staticValue}
                          >
                            Static value: {staticValue}
                          </small>
                        </label>
                      );
                    })}
                </div>
              </fieldset>
            ))}
            {obsoleteBindings.map((binding) => (
              <p className="wr-modal-description" key={binding.property}>
                Unavailable visual property: {binding.property}{' '}
                <button
                  type="button"
                  aria-label={`Remove binding for ${binding.property}`}
                  onClick={() =>
                    setDraft((current) =>
                      current.filter((candidate) => candidate.property !== binding.property),
                    )
                  }
                >
                  Remove binding
                </button>
              </p>
            ))}
            {!valid && (
              <p role="alert" className="wr-modal-description">
                A saved binding is unavailable. Choose an existing field or Static value.
              </p>
            )}
            <p className="wr-modal-description">
              In component events, use <code>CurrentRow.value</code> to read the current item and{' '}
              <code>CurrentRow.index</code> for its position.
            </p>
          </div>
          <footer className="wr-modal-actions wr-data-grid-configuration-actions">
            <button type="button" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="primary" disabled={!valid}>
              Save
            </button>
          </footer>
        </form>
      </section>
    </div>,
    document.body,
  );
}
