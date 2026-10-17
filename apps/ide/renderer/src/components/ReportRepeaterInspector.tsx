import type { ComponentNode } from '@webrad/project-model';
import {
  reportRepeaterAppearance,
  reportRepeaterLayout,
  reportRepeaterSectionLayout,
  type WebReportRepeaterElement,
} from '@webrad/runtime/report-template';
import {
  reportApiSource,
  resizeReportRepeaterLayout,
  resizeReportRepeaterSectionColumns,
  type ReportRepeaterSection,
} from '@webrad/designer';
import type { ReactElement } from 'react';
import { ReportApiBinding } from './ReportApiBinding';
import { ReportNumberField as NumberField } from './ReportNumberField';

interface Props {
  readonly element: WebReportRepeaterElement;
  readonly parentSource?: WebReportRepeaterElement['source'];
  readonly components: readonly ComponentNode[];
  readonly onChange: (element: WebReportRepeaterElement) => void;
  readonly onEdit: (element: WebReportRepeaterElement, section?: ReportRepeaterSection) => void;
}
export function ReportRepeaterInspector({
  element,
  parentSource,
  components,
  onChange,
  onEdit,
}: Props): ReactElement {
  const layout = reportRepeaterLayout(element);
  const paint = reportRepeaterAppearance(element);
  const lists =
    parentSource === undefined
      ? []
      : reportApiSource(
          components,
          parentSource.apiClientId,
          parentSource.operationId,
          parentSource.listPath,
        ).rowLists;
  return (
    <>
      <fieldset>
        <legend>Repeated records</legend>
        {parentSource !== undefined && (
          <label>
            <span>List source</span>
            <select
              aria-label="Report repeater list source"
              value={element.source.scope ?? 'api'}
              onChange={(event) =>
                onChange({
                  ...element,
                  source:
                    event.currentTarget.value === 'row'
                      ? {
                          apiClientId: '',
                          operationId: '',
                          scope: 'row',
                          listPath: lists[0]?.path ?? '',
                        }
                      : { apiClientId: '', operationId: '', listPath: '' },
                })
              }
            >
              <option value="api">API response</option>
              <option value="row">Parent row list</option>
            </select>
          </label>
        )}
        {element.source.scope === 'row' ? (
          <label>
            <span>Parent row list</span>
            <select
              aria-label="Report parent row list"
              value={
                lists.some((list) => list.path === element.source.listPath)
                  ? element.source.listPath
                  : '__missing__'
              }
              onChange={(event) =>
                onChange({
                  ...element,
                  source: { ...element.source, listPath: event.currentTarget.value },
                })
              }
            >
              <option value="__missing__" disabled>
                Choose a parent row list
              </option>
              {lists.map((list) => (
                <option key={list.path} value={list.path}>
                  {list.label}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <ReportApiBinding
            value={{ ...element.source, path: element.source.listPath }}
            list
            components={components}
            onChange={(source) =>
              onChange({
                ...element,
                source: {
                  apiClientId: source.apiClientId,
                  operationId: source.operationId,
                  listPath: source.path,
                },
              })
            }
          />
        )}
      </fieldset>
      <fieldset>
        <legend>Header and Footer</legend>
        {(['header', 'footer'] as const).map((kind) => (
          <div key={kind}>
            <label className="wr-report-checkbox">
              <input
                type="checkbox"
                aria-label={`Report repeater ${kind}`}
                checked={element[kind] !== undefined}
                onChange={(event) => {
                  if (event.currentTarget.checked)
                    onChange({ ...element, [kind]: { height: 8, elements: [] } });
                  else {
                    const { [kind]: removed, ...rest } = element;
                    void removed;
                    onChange(rest);
                  }
                }}
              />
              <span>{kind === 'header' ? 'Header' : 'Footer'}</span>
            </label>
            {element[kind] !== undefined && (
              <>
                <NumberField
                  label={`${kind === 'header' ? 'Header' : 'Footer'} height (mm)`}
                  value={element[kind].height}
                  min={0.1}
                  onChange={(height) =>
                    onChange({ ...element, [kind]: { ...element[kind], height } })
                  }
                />
                <div className="wr-report-field-grid">
                  <NumberField
                    label={`${kind === 'header' ? 'Header' : 'Footer'} columns`}
                    value={reportRepeaterSectionLayout(element[kind]).columns}
                    min={1}
                    max={24}
                    onChange={(columns) =>
                      onChange(
                        resizeReportRepeaterSectionColumns(element, kind, {
                          ...reportRepeaterSectionLayout(element[kind]),
                          columns,
                        }),
                      )
                    }
                  />
                  <NumberField
                    label={`${kind === 'header' ? 'Header' : 'Footer'} column gap (mm)`}
                    value={reportRepeaterSectionLayout(element[kind]).columnGap}
                    max={100}
                    onChange={(columnGap) =>
                      onChange(
                        resizeReportRepeaterSectionColumns(element, kind, {
                          ...reportRepeaterSectionLayout(element[kind]),
                          columnGap,
                        }),
                      )
                    }
                  />
                </div>
                <button
                  type="button"
                  className="wr-report-edit-row"
                  onClick={() => onEdit(element, kind)}
                >
                  Edit {kind}
                </button>
              </>
            )}
          </div>
        ))}
        <p className="wr-report-hint">
          Header appears before the records; Footer appears after them. Nested groups have their own
          sections.
        </p>
      </fieldset>
      <fieldset>
        <legend>Rows and columns</legend>
        <div className="wr-report-field-grid">
          <NumberField
            label="Columns"
            value={layout.columns}
            min={1}
            max={24}
            onChange={(columns) =>
              onChange(resizeReportRepeaterLayout(element, { ...layout, columns }))
            }
          />
          <NumberField
            label="Rows per block"
            value={layout.rows}
            max={100000}
            onChange={(rows) => onChange({ ...element, layout: { ...layout, rows } })}
          />
          <NumberField
            label="Column gap (mm)"
            value={layout.columnGap}
            max={100}
            onChange={(columnGap) =>
              onChange(resizeReportRepeaterLayout(element, { ...layout, columnGap }))
            }
          />
          <NumberField
            label="Row gap (mm)"
            value={element.gap}
            max={100}
            onChange={(gap) => onChange({ ...element, gap })}
          />
        </div>
        <label>
          <span>Fill order</span>
          <select
            aria-label="Report fill order"
            value={layout.fill}
            onChange={(event) =>
              onChange({
                ...element,
                layout: {
                  ...layout,
                  fill: event.currentTarget.value === 'columns' ? 'columns' : 'rows',
                },
              })
            }
          >
            <option value="rows">Across rows</option>
            <option value="columns">Down columns</option>
          </select>
        </label>
        <p className="wr-report-hint">
          Zero rows fits all records into the columns. The first column contains the editable record
          template; other columns use that same template.
        </p>
      </fieldset>
      <fieldset>
        <legend>Appearance</legend>
        <label className="wr-report-checkbox">
          <input
            type="checkbox"
            aria-label="Report repeater background"
            checked={paint.backgroundColor !== null}
            onChange={(event) =>
              onChange({
                ...element,
                appearance: {
                  ...paint,
                  backgroundColor: event.currentTarget.checked ? '#f1f5f9' : null,
                },
              })
            }
          />
          <span>Background</span>
        </label>
        <div className="wr-report-field-grid">
          {(
            [
              ['Background color', 'backgroundColor'],
              ['Border color', 'borderColor'],
              ['Divider color', 'lineColor'],
            ] as const
          ).map(([label, key]) => (
            <label key={key}>
              <span>{label}</span>
              <input
                type="color"
                aria-label={`Report repeater ${label.toLowerCase()}`}
                disabled={key === 'backgroundColor' && paint.backgroundColor === null}
                value={paint[key] ?? '#ffffff'}
                onChange={(event) =>
                  onChange({
                    ...element,
                    appearance: { ...paint, [key]: event.currentTarget.value },
                  })
                }
              />
            </label>
          ))}
          <NumberField
            label="Border width (mm)"
            value={paint.borderWidth}
            max={10}
            onChange={(borderWidth) =>
              onChange({ ...element, appearance: { ...paint, borderWidth } })
            }
          />
          <NumberField
            label="Divider width (mm)"
            value={paint.lineWidth}
            min={0.01}
            max={10}
            onChange={(lineWidth) => onChange({ ...element, appearance: { ...paint, lineWidth } })}
          />
        </div>
        <label>
          <span>Border style</span>
          <select
            aria-label="Report repeater border style"
            value={paint.borderStyle}
            onChange={(event) =>
              onChange({
                ...element,
                appearance: {
                  ...paint,
                  borderStyle: event.currentTarget.value === 'dashed' ? 'dashed' : 'solid',
                },
              })
            }
          >
            <option value="solid">Solid</option>
            <option value="dashed">Dashed</option>
          </select>
        </label>
        {(['rowLines', 'columnLines'] as const).map((key) => (
          <label className="wr-report-checkbox" key={key}>
            <input
              type="checkbox"
              aria-label={`Report repeater ${key}`}
              checked={paint[key]}
              onChange={(event) =>
                onChange({
                  ...element,
                  appearance: { ...paint, [key]: event.currentTarget.checked },
                })
              }
            />
            <span>{key === 'rowLines' ? 'Row dividers' : 'Column dividers'}</span>
          </label>
        ))}
      </fieldset>
      <button type="button" className="wr-report-edit-row" onClick={() => onEdit(element)}>
        Edit row template
      </button>
      <p className="wr-report-hint">
        Height defines one record. Complete records, including nested groups, continue on the next
        page when necessary.
      </p>
    </>
  );
}
