import { Icon } from './Icon';
import { REPORT_BAND_LABELS, reportOrderedBands, type ReportSelection } from '@webrad/designer';
import type { WebReportElement, WebReportTemplate } from '@webrad/runtime/report-template';
import type { ReactElement } from 'react';

interface Props {
  readonly template: WebReportTemplate;
  readonly selection: ReportSelection;
  readonly onSelect: (selection: ReportSelection) => void;
}
export function ReportOutline({ template, selection, onSelect }: Props): ReactElement {
  const elements = (
    items: readonly WebReportElement[],
    target: ReportSelection,
    depth: number,
  ): ReactElement[] =>
    items.map((element) => {
      const selected = selection.elementId === element.id;
      return (
        <div key={element.id}>
          <button
            type="button"
            className={`wr-report-outline-element${selected ? ' is-selected' : ''}`}
            style={{ paddingLeft: 18 + depth * 12 }}
            onClick={() =>
              onSelect({
                ...target,
                elementId: element.id,
                ...(target.section === undefined || target.section === 'row'
                  ? {}
                  : { column: element.column ?? 0 }),
              })
            }
          >
            <span>
              <Icon
                name={
                  element.type === 'group'
                    ? 'group'
                    : element.type === 'repeater'
                      ? 'repeat'
                      : element.type === 'text'
                        ? 'type'
                        : element.type === 'image'
                          ? 'image'
                          : 'minus'
                }
              />
            </span>
            {element.name}
          </button>
          {element.type === 'group' &&
            elements(
              element.children,
              { bandId: target.bandId, elementId: null, parentId: element.id },
              depth + 1,
            )}
          {element.type === 'repeater' &&
            (['header', 'row', 'footer'] as const).map((kind) => {
              if (kind !== 'row' && element[kind] === undefined) return null;
              const destination: ReportSelection = {
                bandId: target.bandId,
                elementId: null,
                parentId: element.id,
                section: kind,
              };
              return (
                <div key={kind}>
                  <button
                    type="button"
                    className="wr-report-outline-section"
                    style={{ paddingLeft: 24 + depth * 12 }}
                    onClick={() => onSelect(destination)}
                  >
                    {kind === 'header' ? 'Header' : kind === 'footer' ? 'Footer' : 'Row template'}
                  </button>
                  {elements(
                    kind === 'row' ? element.children : element[kind]!.elements,
                    destination,
                    depth + 1,
                  )}
                </div>
              );
            })}
        </div>
      );
    });
  return (
    <div className="wr-report-outline">
      {reportOrderedBands(template).map((band) => (
        <div key={band.id}>
          <button
            type="button"
            className={`wr-report-outline-band${selection.bandId === band.id && selection.elementId === null && selection.parentId === undefined ? ' is-selected' : ''}`}
            onClick={() => onSelect({ bandId: band.id, elementId: null })}
          >
            {REPORT_BAND_LABELS[band.kind]}
            <span>{band.elements.length}</span>
          </button>
          {elements(band.elements, { bandId: band.id, elementId: null }, 0)}
        </div>
      ))}
    </div>
  );
}
