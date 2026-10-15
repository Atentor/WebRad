import {
  useRef,
  useState,
  type CSSProperties,
  type DragEvent,
  type PointerEvent,
  type ReactElement,
} from 'react';
import {
  reportPaperSize,
  reportRepeaterAppearance,
  reportRepeaterColumnWidth,
  reportRepeaterLayout,
  reportRepeaterTemplateHeight,
  reportRepeaterSectionLayout,
  reportRepeaterSectionColumnWidth,
  type WebReportElement,
  type WebReportTemplate,
} from '@webrad/runtime/report-template';
import { Icon } from './Icon';
import {
  editReportElement,
  REPORT_BAND_LABELS,
  REPORT_CANVAS_PIXELS_PER_MM,
  reportContentWidth,
  reportContainer,
  reportOrderedBands,
  reportValueLabel,
  snapReportCoordinate,
  type ReportSelection,
  type ReportRepeaterSection,
} from '@webrad/designer';

interface ReportCanvasProps {
  readonly template: WebReportTemplate;
  readonly selection: ReportSelection;
  readonly zoom: number;
  readonly paletteType: WebReportElement['type'] | null;
  readonly onInsert: (
    type: WebReportElement['type'],
    target: ReportSelection,
    x: number,
    y: number,
  ) => void;
  readonly onSelect: (selection: ReportSelection) => void;
  readonly onChange: (template: WebReportTemplate, history?: boolean) => void;
}

export const REPORT_COMPONENT_DRAG_TYPE = 'application/x-webrad-report-component';

interface ReportDrag {
  changed: boolean;
  readonly pointerId: number;
  readonly x: number;
  readonly y: number;
  readonly selection: ReportSelection;
  readonly original: WebReportElement;
  readonly snapshot: WebReportTemplate;
  readonly width: number;
  readonly height: number;
  readonly resize: boolean;
}

function bounded(value: number, maximum: number, minimum = 0): number {
  return Math.min(Math.max(minimum, Math.round(value * 2) / 2), Math.max(minimum, maximum));
}

export function ReportCanvas({
  template,
  selection,
  zoom,
  paletteType,
  onInsert,
  onSelect,
  onChange,
}: ReportCanvasProps): ReactElement {
  const drag = useRef<ReportDrag | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const scale = REPORT_CANVAS_PIXELS_PER_MM * zoom;
  const paper = reportPaperSize(template);
  const width = reportContentWidth(template);
  const canDrop = (target: ReportSelection): boolean => {
    if (paletteType === null) return false;
    const { band, parent: row, height } = reportContainer(template, target);
    return (
      band !== undefined &&
      (target.parentId === undefined || row !== undefined) &&
      (height ?? 0) >= 0.1 &&
      (paletteType !== 'repeater' || (band.kind !== 'pageHeader' && band.kind !== 'pageFooter'))
    );
  };
  const over = (event: DragEvent<HTMLElement>, target: ReportSelection): void => {
    event.stopPropagation();
    if (!canDrop(target)) {
      event.dataTransfer.dropEffect = 'none';
      setDropTarget(null);
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    setDropTarget(target.parentId ?? target.bandId);
  };
  const drop = (event: DragEvent<HTMLElement>, target: ReportSelection): void => {
    event.preventDefault();
    event.stopPropagation();
    setDropTarget(null);
    if (
      paletteType === null ||
      !canDrop(target) ||
      event.dataTransfer.getData(REPORT_COMPONENT_DRAG_TYPE) !== paletteType
    )
      return;
    const box = event.currentTarget.getBoundingClientRect();
    onInsert(
      paletteType,
      target,
      (event.clientX - box.left - event.currentTarget.clientLeft) / scale,
      (event.clientY - box.top - event.currentTarget.clientTop) / scale,
    );
  };
  const start = (
    event: PointerEvent<HTMLElement>,
    element: WebReportElement,
    target: ReportSelection,
    parentWidth: number,
    parentHeight: number,
    resize = false,
  ): void => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    onSelect(target);
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {
      changed: false,
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      original: element,
      selection: target,
      snapshot: template,
      width: parentWidth,
      height: parentHeight,
      resize,
    };
  };
  const move = (event: PointerEvent<HTMLElement>): void => {
    const gesture = drag.current;
    if (gesture === null || gesture.pointerId !== event.pointerId) return;
    event.stopPropagation();
    const dx = (event.clientX - gesture.x) / scale;
    const dy = (event.clientY - gesture.y) / scale;
    const original = gesture.original;
    const extraHeight =
      original.type === 'repeater' ? reportRepeaterTemplateHeight(original) - original.height : 0;
    const geometry = gesture.resize
      ? {
          width:
            dx === 0
              ? original.width
              : snapReportCoordinate(
                  original.x + original.width + dx,
                  gesture.width,
                  original.x + 0.5,
                ) - original.x,
          height:
            dy === 0
              ? original.height
              : snapReportCoordinate(
                  original.y + original.height + extraHeight + dy,
                  gesture.height,
                  original.y + extraHeight + 0.5,
                ) -
                original.y -
                extraHeight,
        }
      : {
          x:
            dx === 0
              ? original.x
              : snapReportCoordinate(original.x + dx, gesture.width - original.width),
          y:
            dy === 0
              ? original.y
              : snapReportCoordinate(
                  original.y + dy,
                  gesture.height - original.height - extraHeight,
                ),
        };
    const next = { ...original, ...geometry };
    if (
      next.x === original.x &&
      next.y === original.y &&
      next.width === original.width &&
      next.height === original.height &&
      !gesture.changed
    )
      return;
    if (!gesture.changed) {
      onChange(gesture.snapshot);
      gesture.changed = true;
    }
    onChange(
      editReportElement(gesture.snapshot, gesture.selection, (element) => ({
        ...element,
        ...geometry,
      })),
      false,
    );
  };
  const end = (event: PointerEvent<HTMLElement>): void => {
    if (drag.current?.pointerId !== event.pointerId) return;
    event.stopPropagation();
    drag.current = null;
  };
  const renderElement = (
    element: WebReportElement,
    bandId: string,
    parentWidth: number,
    parentHeight: number,
    parentId?: string,
    section?: ReportRepeaterSection,
    canvasPath = '',
    primaryProjection = true,
    projectionLabel = '',
    previewColumn = 0,
  ): ReactElement => {
    const target: ReportSelection = {
      bandId,
      elementId: element.id,
      ...(parentId === undefined ? {} : { parentId }),
      ...(section === undefined ? {} : { section }),
      ...(section === undefined
        ? {}
        : { column: section === 'row' ? previewColumn : (element.column ?? 0) }),
      canvasPath,
    };
    const selected =
      selection.elementId === element.id &&
      (selection.canvasPath === undefined
        ? primaryProjection
        : selection.canvasPath === canvasPath);
    const style: CSSProperties = {
      left: element.x * scale,
      top: element.y * scale,
      width: element.width * scale,
      height:
        (element.type === 'repeater' ? reportRepeaterTemplateHeight(element) : element.height) *
        scale,
    };
    if (element.type === 'text')
      Object.assign(style, {
        color: element.color,
        fontSize: ((element.fontSize * 25.4) / 72) * scale,
        fontWeight: element.bold ? 700 : 400,
        textAlign: element.align,
      });
    if (element.type === 'repeater') {
      const paint = reportRepeaterAppearance(element);
      Object.assign(style, {
        backgroundColor: paint.backgroundColor ?? undefined,
      });
    }
    return (
      <div
        key={element.id}
        role="button"
        tabIndex={0}
        aria-label={`Select ${element.name}${primaryProjection ? '' : ` (${projectionLabel})`}`}
        data-report-element-id={element.id}
        data-report-primary={primaryProjection}
        aria-pressed={selected}
        className={`wr-report-element wr-report-element-${element.type}${selected ? ' is-selected' : ''}${paletteType !== null && dropTarget === element.id ? ' is-drop-target' : ''}`}
        style={style}
        onClick={(event) => {
          event.stopPropagation();
          onSelect(target);
        }}
        onFocus={(event) => {
          if (event.currentTarget === event.target) onSelect(target);
        }}
        onPointerDown={(event) => start(event, element, target, parentWidth, parentHeight)}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            event.stopPropagation();
            onSelect(target);
            return;
          }
          if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
          event.preventDefault();
          event.stopPropagation();
          onSelect(target);
          const distance = event.shiftKey ? 5 : 0.5;
          onChange(
            editReportElement(template, target, (item) => ({
              ...item,
              x: bounded(
                item.x +
                  (event.key === 'ArrowRight'
                    ? distance
                    : event.key === 'ArrowLeft'
                      ? -distance
                      : 0),
                parentWidth - item.width,
              ),
              y: bounded(
                item.y +
                  (event.key === 'ArrowDown' ? distance : event.key === 'ArrowUp' ? -distance : 0),
                parentHeight -
                  (item.type === 'repeater' ? reportRepeaterTemplateHeight(item) : item.height),
              ),
            })),
          );
        }}
      >
        {element.type === 'text' && (
          <span className="wr-report-text-value">{reportValueLabel(element.value)}</span>
        )}
        {element.type === 'image' &&
          (element.value.kind === 'static' &&
          /^(https?:\/\/|data:image\/(?:png|jpeg|webp|gif);base64,)/iu.test(element.value.value) ? (
            <img src={element.value.value} draggable={false} alt="" />
          ) : (
            <span className="wr-report-image-value">
              <Icon name="image" />
              <span>
                {element.value.kind === 'static' ? 'Image' : reportValueLabel(element.value)}
              </span>
            </span>
          ))}
        {element.type === 'line' && (
          <span
            className="wr-report-line-value"
            style={{
              borderTopColor: element.color,
              borderTopWidth: ((element.strokeWidth * 25.4) / 72) * scale,
            }}
          />
        )}
        {element.type === 'repeater' && (
          <>
            <span className="wr-report-repeater-label">
              Repeated row · {element.source.listPath || 'choose a response list'}
            </span>
            {(['header', 'row', 'footer'] as const).map((kind) => {
              const part = kind === 'row' ? undefined : element[kind];
              if (kind !== 'row' && part === undefined) return null;
              const height = kind === 'row' ? element.height : part!.height;
              const top =
                kind === 'header'
                  ? 0
                  : (element.header?.height ?? 0) + (kind === 'footer' ? element.height : 0);
              const children = kind === 'row' ? element.children : part!.elements;
              const target: ReportSelection = {
                bandId,
                elementId: null,
                parentId: element.id,
                section: kind,
              };
              const paint = reportRepeaterAppearance(element);
              const layout =
                kind === 'row' ? reportRepeaterLayout(element) : reportRepeaterSectionLayout(part);
              const columns = Math.max(1, Math.min(24, Math.trunc(layout.columns) || 1));
              const columnWidth =
                kind === 'row'
                  ? reportRepeaterColumnWidth(element)
                  : reportRepeaterSectionColumnWidth(element, kind);
              return (
                <div
                  key={kind}
                  data-report-repeater-section={kind}
                  className={`wr-report-repeater-section${dropTarget === `${element.id}:${kind}` ? ' is-drop-target' : ''}`}
                  style={{
                    top: top * scale,
                    height: height * scale,
                    width: element.width * scale,
                  }}
                  onDragOver={(event) => {
                    event.stopPropagation();
                    event.dataTransfer.dropEffect = 'none';
                    setDropTarget(null);
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                  }}
                  onDragLeave={() => setDropTarget(null)}
                >
                  <button
                    type="button"
                    className="wr-report-repeater-section-tag"
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => {
                      event.stopPropagation();
                      onSelect(target);
                    }}
                  >
                    {kind === 'row'
                      ? `Row${layout.columns > 1 ? ` · ${layout.columns} columns` : ''}`
                      : `${kind === 'header' ? 'Header' : 'Footer'}${layout.columns > 1 ? ` · ${layout.columns} columns` : ''}`}
                  </button>
                  {paint.rowLines &&
                    (kind === 'footer' || (kind === 'row' && element.header !== undefined)) && (
                      <span
                        className="wr-report-repeater-row-line"
                        style={{
                          borderTop: `${paint.lineWidth * scale}px solid ${paint.lineColor}`,
                        }}
                      />
                    )}
                  {paint.columnLines &&
                    Array.from({ length: columns - 1 }, (_, index) => (
                      <span
                        key={index}
                        className="wr-report-repeater-divider"
                        style={{
                          left:
                            ((index + 1) * columnWidth + (index + 0.5) * layout.columnGap) * scale,
                          borderLeft: `${paint.lineWidth * scale}px solid ${paint.lineColor}`,
                        }}
                      />
                    ))}
                  {Array.from({ length: columns }, (_, column) => {
                    const cellPath = `${canvasPath}${JSON.stringify([element.id, kind, column])}`;
                    const cellPrimary = primaryProjection && (kind !== 'row' || column === 0);
                    const cellLabel =
                      kind === 'row' && column > 0
                        ? [projectionLabel, `column ${column + 1}`].filter(Boolean).join(' / ')
                        : projectionLabel;
                    const cellTarget: ReportSelection = { ...target, column, canvasPath: cellPath };
                    const dropKey = `${cellPath}:drop`;
                    return (
                      <div
                        key={column}
                        className={`wr-report-section-column${dropTarget === dropKey ? ' is-drop-target' : ''}`}
                        data-report-section-column={column}
                        data-report-primary={cellPrimary}
                        style={{
                          left: column * (columnWidth + layout.columnGap) * scale,
                          width: columnWidth * scale,
                          height: height * scale,
                        }}
                        onDragOver={(event) => {
                          over(event, cellTarget);
                          if (canDrop(cellTarget)) setDropTarget(dropKey);
                        }}
                        onDrop={(event) => drop(event, cellTarget)}
                        onDragLeave={() => setDropTarget(null)}
                      >
                        {layout.columns > 1 && (
                          <button
                            type="button"
                            className="wr-report-section-column-tag"
                            onPointerDown={(event) => event.stopPropagation()}
                            onClick={(event) => {
                              event.stopPropagation();
                              onSelect(cellTarget);
                            }}
                          >
                            Column {column + 1}
                          </button>
                        )}
                        {children
                          .filter((child) => kind === 'row' || (child.column ?? 0) === column)
                          .map((child) =>
                            renderElement(
                              child,
                              bandId,
                              columnWidth,
                              height,
                              element.id,
                              kind,
                              cellPath,
                              cellPrimary,
                              cellLabel,
                              column,
                            ),
                          )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </>
        )}
        {selected && (
          <span
            className="wr-report-resize"
            role="button"
            tabIndex={-1}
            aria-label={`Resize ${element.name}`}
            onPointerDown={(event) =>
              start(event, element, target, parentWidth, parentHeight, true)
            }
            onPointerMove={move}
            onPointerUp={end}
            onPointerCancel={end}
          />
        )}
        {element.type === 'repeater' && (
          <span
            className="wr-report-repeater-border"
            style={{
              border: `${reportRepeaterAppearance(element).borderWidth * scale}px ${reportRepeaterAppearance(element).borderStyle} ${reportRepeaterAppearance(element).borderColor}`,
            }}
          />
        )}
      </div>
    );
  };
  return (
    <div className="wr-report-canvas-scroll">
      <div className="wr-report-paper-caption">
        {template.paper.size} · {template.paper.orientation} · millimetres
      </div>
      <div
        className="wr-report-paper"
        style={{
          width: paper.width * scale,
          minHeight: paper.height * scale,
          padding: `${String(template.paper.margins.top * scale)}px ${String(template.paper.margins.right * scale)}px ${String(template.paper.margins.bottom * scale)}px ${String(template.paper.margins.left * scale)}px`,
        }}
      >
        {reportOrderedBands(template).map((band) => (
          <section
            key={band.id}
            data-report-band-kind={band.kind}
            className={`wr-report-band${selection.bandId === band.id ? ' is-active' : ''}${paletteType !== null && dropTarget === band.id ? ' is-drop-target' : ''}`}
            style={{ height: Math.max(0.5, band.height) * scale }}
            onDragOver={(event) => over(event, { bandId: band.id, elementId: null })}
            onDrop={(event) => drop(event, { bandId: band.id, elementId: null })}
            onDragLeave={() => setDropTarget(null)}
            onClick={() => onSelect({ bandId: band.id, elementId: null })}
          >
            <button
              type="button"
              className="wr-report-band-tag"
              onClick={() => onSelect({ bandId: band.id, elementId: null })}
            >
              {REPORT_BAND_LABELS[band.kind]} <span>{band.height} mm</span>
            </button>
            {band.elements.map((element) => renderElement(element, band.id, width, band.height))}
          </section>
        ))}
      </div>
      <p className="wr-report-canvas-note">
        8 px snapping · drag to move · use the corner to resize · arrows move by 0.5 mm
      </p>
    </div>
  );
}
