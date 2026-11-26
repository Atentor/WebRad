import type { GraphQLOperationChoice, GraphQLValueChoice } from '@webrad/project-model';
import type { ReactElement } from 'react';
import { Icon } from './Icon';
import {
  newGraphQLParameter,
  type ConditionDraft,
  type ConditionGroupDraft,
  type ParameterDraft,
} from './restgo-graphql-draft';

const operatorLabels = new Map([
  ['eq', '='],
  ['neq', '<>'],
  ['gt', '>'],
  ['gte', '>='],
  ['lt', '<'],
  ['lte', '<='],
  ['in', 'IN'],
  ['is', 'IS'],
  ['like', 'LIKE'],
  ['ilike', 'ILIKE'],
]);

interface ParameterFieldsProps {
  readonly draft: ParameterDraft;
  readonly choice: GraphQLValueChoice | undefined;
  readonly required?: boolean;
  readonly onChange: (draft: ParameterDraft) => void;
}

function defaultValueFor(choice: GraphQLValueChoice | undefined): string {
  if (choice?.list) return '[]';
  if (choice?.enumValues[0]) return choice.enumValues[0];
  if (choice?.kind === 'boolean') return 'false';
  if (choice?.kind === 'json') return '{}';
  return '';
}

function ParameterFields({
  draft,
  choice,
  required = false,
  onChange,
}: ParameterFieldsProps): ReactElement {
  const setValue = (value: string) => onChange({ ...draft, value });
  const mustSupply = required || choice?.nullable === false;
  return (
    <div className="wr-restgo-graphql-parameters">
      <label>
        Parameter name
        <input
          required
          value={draft.parameter}
          onChange={(event) => onChange({ ...draft, parameter: event.currentTarget.value })}
        />
        {choice && <small>{choice.type}</small>}
      </label>
      <label>
        Value source
        <select
          value={draft.source}
          onChange={(event) => {
            const source = event.currentTarget.value;
            if (source === 'application' || source === 'default' || source === 'null') {
              onChange({ ...draft, source, value: draft.value || defaultValueFor(choice) });
            }
          }}
        >
          <option value="application">Application parameter</option>
          <option value="default">Parameter with default value</option>
          {choice?.nullable && !mustSupply && !draft.required && (
            <option value="null">Parameter with null default</option>
          )}
        </select>
      </label>
      <label className="wr-restgo-graphql-check">
        <input
          type="checkbox"
          checked={mustSupply || draft.required}
          disabled={mustSupply}
          onChange={(event) => {
            const checked = event.currentTarget.checked;
            onChange({
              ...draft,
              required: checked,
              source: checked && draft.source === 'null' ? 'application' : draft.source,
            });
          }}
        />
        Required
      </label>
      {draft.source === 'default' && choice && (
        <label className="wr-restgo-graphql-default">
          Default value
          {choice.list || choice.kind === 'json' ? (
            <textarea
              rows={2}
              value={draft.value}
              onChange={(event) => setValue(event.currentTarget.value)}
            />
          ) : choice.enumValues.length > 0 || choice.kind === 'boolean' ? (
            <select value={draft.value} onChange={(event) => setValue(event.currentTarget.value)}>
              {(choice.kind === 'boolean' ? ['false', 'true'] : choice.enumValues).map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          ) : (
            <input
              type={choice.kind === 'integer' || choice.kind === 'number' ? 'number' : 'text'}
              step={choice.kind === 'integer' ? '1' : 'any'}
              value={draft.value}
              onChange={(event) => setValue(event.currentTarget.value)}
            />
          )}
        </label>
      )}
    </div>
  );
}

interface ConditionGroupProps {
  readonly group: ConditionGroupDraft;
  readonly operation: GraphQLOperationChoice;
  readonly onChange: (group: ConditionGroupDraft) => void;
  readonly onRemove?: () => void;
  readonly depth?: number;
  readonly requireValues?: boolean;
}

function makeCondition(operation: GraphQLOperationChoice, field: string): ConditionDraft | null {
  const filter = operation.filters.find((item) => item.field === field);
  const operator =
    filter?.operators.find((option) => option.operator === 'eq') ?? filter?.operators[0];
  return operator ? { ...newGraphQLParameter(field), operator: operator.operator } : null;
}

export function RestGoGraphQLConditionGroup({
  group,
  operation,
  onChange,
  onRemove,
  depth = 0,
  requireValues,
}: ConditionGroupProps): ReactElement {
  const firstField =
    operation.filters.find(
      (filter) => !group.items.some((item) => 'field' in item && item.field === filter.field),
    ) ?? operation.filters[0];
  const firstCondition = makeCondition(operation, firstField?.field ?? '');
  const replaceItem = (index: number, next: ConditionDraft | ConditionGroupDraft) =>
    onChange({
      ...group,
      items: group.items.map((item, itemIndex) => (itemIndex === index ? next : item)),
    });
  const removeItem = (index: number) =>
    onChange({ ...group, items: group.items.filter((_, itemIndex) => itemIndex !== index) });
  return (
    <div
      className={
        depth === 0
          ? 'wr-restgo-graphql-condition-group'
          : 'wr-restgo-graphql-condition-group is-nested'
      }
    >
      <div className="wr-restgo-graphql-group-actions">
        {(operation.supportsOr || group.logic === 'or') && (
          <label className="wr-restgo-graphql-match">
            Match
            <select
              value={group.logic}
              onChange={(event) =>
                onChange({ ...group, logic: event.currentTarget.value === 'or' ? 'or' : 'and' })
              }
            >
              <option value="and">All conditions (AND)</option>
              <option value="or" disabled={!operation.supportsOr}>
                {operation.supportsOr ? 'Any condition (OR)' : 'Any condition (OR, unavailable)'}
              </option>
            </select>
          </label>
        )}
        <button
          type="button"
          className="wr-restgo-button"
          disabled={!firstCondition}
          onClick={() =>
            firstCondition && onChange({ ...group, items: [...group.items, firstCondition] })
          }
        >
          <Icon name="add" />
          Add condition
        </button>
        {operation.supportsAnd && operation.supportsOr && (
          <button
            type="button"
            className="wr-restgo-button is-quiet"
            onClick={() =>
              onChange({
                ...group,
                items: [...group.items, { logic: group.logic === 'and' ? 'or' : 'and', items: [] }],
              })
            }
          >
            <Icon name="add" />
            Add condition group
          </button>
        )}
        {onRemove && <RemoveField label="Remove condition group" onClick={onRemove} />}
      </div>
      {group.items.map((item, index) => {
        if ('items' in item) {
          return (
            <RestGoGraphQLConditionGroup
              key={index}
              group={item}
              operation={operation}
              onChange={(next) => replaceItem(index, next)}
              onRemove={() => removeItem(index)}
              depth={depth + 1}
              requireValues={requireValues}
            />
          );
        }
        const filter = operation.filters.find((candidate) => candidate.field === item.field);
        const operator = filter?.operators.find(
          (candidate) => candidate.operator === item.operator,
        );
        return (
          <div className="wr-restgo-graphql-row wr-restgo-graphql-filter-row" key={index}>
            <div className="wr-restgo-graphql-row-fields">
              <label>
                Filter field
                <select
                  value={item.field}
                  onChange={(event) => {
                    const next = makeCondition(operation, event.currentTarget.value);
                    if (next) replaceItem(index, next);
                  }}
                >
                  {!filter && <option value={item.field}>{item.field} (unavailable)</option>}
                  {operation.filters.map((choice) => (
                    <option key={choice.field}>{choice.field}</option>
                  ))}
                </select>
              </label>
              <label>
                Operator
                <select
                  value={item.operator}
                  onChange={(event) =>
                    replaceItem(index, {
                      ...item,
                      operator: event.currentTarget.value,
                      source: 'application',
                      value: '',
                    })
                  }
                >
                  {!operator && (
                    <option value={item.operator}>
                      {operatorLabels.get(item.operator) ?? item.operator} (unavailable)
                    </option>
                  )}
                  {filter?.operators.map(({ operator: value }) => (
                    <option key={value} value={value}>
                      {operatorLabels.get(value) ?? value}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <ParameterFields
              draft={item}
              choice={operator}
              required={requireValues}
              onChange={(next) => replaceItem(index, { ...next, operator: item.operator })}
            />
            <RemoveField label="Remove condition" onClick={() => removeItem(index)} />
          </div>
        );
      })}
    </div>
  );
}

interface MutationInputsProps {
  readonly inputs: readonly ParameterDraft[];
  readonly operation: GraphQLOperationChoice;
  readonly onChange: (inputs: readonly ParameterDraft[]) => void;
}

export function RestGoGraphQLMutationInputs({
  inputs,
  operation,
  onChange,
}: MutationInputsProps): ReactElement {
  const available = operation.inputs.filter(
    (choice) => !inputs.some((input) => input.field === choice.field),
  );
  const first = available[0];
  return (
    <div className="wr-restgo-graphql-condition-group">
      {inputs.map((input, index) => {
        const choice = operation.inputs.find((candidate) => candidate.field === input.field);
        return (
          <div className="wr-restgo-graphql-row" key={input.field}>
            <div className="wr-restgo-graphql-row-fields">
              <label>
                Input field
                <select
                  value={input.field}
                  disabled={choice?.required}
                  onChange={(event) => {
                    const next = available.find(
                      (candidate) => candidate.field === event.currentTarget.value,
                    );
                    if (next)
                      onChange(
                        inputs.map((entry, at) =>
                          at === index ? newGraphQLParameter(next.field) : entry,
                        ),
                      );
                  }}
                >
                  <option value={input.field}>
                    {input.field}
                    {choice ? '' : ' (unavailable)'}
                  </option>
                  {available.map((item) => (
                    <option key={item.field}>{item.field}</option>
                  ))}
                </select>
              </label>
            </div>
            <ParameterFields
              draft={input}
              choice={choice}
              required={choice?.required ?? false}
              onChange={(next) =>
                onChange(inputs.map((entry, at) => (at === index ? next : entry)))
              }
            />
            {!choice?.required && (
              <RemoveField
                label="Remove input field"
                onClick={() => onChange(inputs.filter((_, at) => at !== index))}
              />
            )}
          </div>
        );
      })}
      <div>
        <button
          type="button"
          className="wr-restgo-button"
          disabled={!first}
          onClick={() => first && onChange([...inputs, newGraphQLParameter(first.field)])}
        >
          <Icon name="add" />
          Add input field
        </button>
      </div>
    </div>
  );
}

export function RemoveField({
  label,
  onClick,
}: {
  readonly label: string;
  readonly onClick: () => void;
}): ReactElement {
  return (
    <button
      type="button"
      className="wr-restgo-button is-quiet is-danger"
      aria-label={label}
      title={label}
      onClick={onClick}
    >
      <Icon name="delete" />
    </button>
  );
}
