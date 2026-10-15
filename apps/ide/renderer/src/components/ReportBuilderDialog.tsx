import type { ComponentNode } from '@webrad/project-model';
import {
  createDefaultReportTemplate,
  parseReportTemplate,
  serializeReportTemplate,
  type WebReportElement,
  type WebReportTemplate,
} from '@webrad/runtime/report-template';
import { useEffect, useId, useRef, useState, type ReactElement } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon';
import { ReportCanvas, REPORT_COMPONENT_DRAG_TYPE } from './ReportCanvas';
import { ReportElementInspector } from './ReportElementInspector';
import { ReportPageSetup } from './ReportPageSetup';
import { ReportParametersEditor } from './ReportParametersEditor';
import {
  createReportElement,
  duplicateReportElement,
  editReportElement,
  insertReportElement,
  REPORT_BAND_LABELS,
  reportBindingError,
  reportContentWidth,
  reportOrderedBands,
  reportSelectedElement,
  type ReportSelection,
} from '@webrad/designer';
import { useRowConfigurationDialog } from './useRowConfigurationDialog';
import './report-builder.css';

interface ReportBuilderDialogProps {
  readonly component: ComponentNode;
  readonly availableComponents: readonly ComponentNode[];
  readonly onClose: () => void;
  readonly onSave: (template: WebReportTemplate) => void;
}

const MAX_TEMPLATE_BYTES = 5_000_000;
type ReportEditorTab = 'design' | 'parameters' | 'page';
interface ReportHistory {
  readonly past: readonly WebReportTemplate[];
  readonly present: WebReportTemplate;
  readonly future: readonly WebReportTemplate[];
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
function initialTemplate(value: unknown): {
  readonly template: WebReportTemplate;
  readonly error: string | null;
} {
  if (value === undefined) return { template: createDefaultReportTemplate(), error: null };
  try {
    return { template: parseReportTemplate(value), error: null };
  } catch (error) {
    return {
      template: createDefaultReportTemplate(),
      error: `The saved template could not be opened: ${message(error)} Import a valid template to replace it.`,
    };
  }
}

export function ReportBuilderDialog({
  component,
  availableComponents,
  onClose,
  onSave,
}: ReportBuilderDialogProps): ReactElement {
  const titleId = useId();
  const [initial] = useState(() => initialTemplate(component.props.reportTemplate));
  const [history, setHistory] = useState<ReportHistory>(() => ({
    past: [],
    present: initial.template,
    future: [],
  }));
  const draft = history.present;
  const [selection, setSelection] = useState<ReportSelection>(() => ({
    bandId: draft.bands.find((band) => band.kind === 'detail')?.id ?? draft.bands[0]?.id ?? '',
    elementId: null,
  }));
  const [tab, setTab] = useState<ReportEditorTab>('design');
  const [zoom, setZoom] = useState(1);
  const [paletteType, setPaletteType] = useState<WebReportElement['type'] | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [ioError, setIoError] = useState<string | null>(initial.error);
  const [importUrl, setImportUrl] = useState('');
  const [urlOpen, setUrlOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const importController = useRef<AbortController | null>(null);
  useEffect(() => () => importController.current?.abort(), []);
  const close = (): void => {
    importController.current?.abort();
    onClose();
  };
  const { dialogRef, handleKeyDown } = useRowConfigurationDialog(close);
  const change = (next: WebReportTemplate, remember = true): void =>
    setHistory((current) => ({
      past: remember ? [...current.past.slice(-49), current.present] : current.past,
      present: next,
      future: [],
    }));
  const undo = (): void =>
    setHistory((current) => {
      const previous = current.past.at(-1);
      return previous === undefined
        ? current
        : {
            past: current.past.slice(0, -1),
            present: previous,
            future: [current.present, ...current.future],
          };
    });
  const redo = (): void =>
    setHistory((current) => {
      const next = current.future[0];
      return next === undefined
        ? current
        : {
            past: [...current.past, current.present],
            present: next,
            future: current.future.slice(1),
          };
    });
  const band = draft.bands.find((item) => item.id === selection.bandId);
  const element = reportSelectedElement(draft, selection);
  const parentElement =
    selection.parentId === undefined
      ? undefined
      : band?.elements.find((item) => item.id === selection.parentId);
  const row = parentElement?.type === 'repeater' ? parentElement : undefined;
  let parsed: WebReportTemplate | null = null;
  let validationError: string | null = null;
  try {
    parsed = parseReportTemplate(draft);
    validationError = reportBindingError(parsed, availableComponents);
  } catch (error) {
    validationError = message(error);
  }
  const error = ioError ?? validationError;
  const add = (
    type: WebReportElement['type'],
    target: ReportSelection,
    x: number,
    y: number,
  ): void => {
    const band = draft.bands.find((item) => item.id === target.bandId);
    const parent = band?.elements.find((item) => item.id === target.parentId);
    const row = parent?.type === 'repeater' ? parent : undefined;
    if (
      band === undefined ||
      (target.parentId !== undefined && row === undefined) ||
      (type === 'repeater' &&
        (row !== undefined || band.kind === 'pageHeader' || band.kind === 'pageFooter'))
    )
      return;
    const height = row?.height ?? band.height;
    if (height < 0.1) {
      setIoError('Increase the selected band height before adding an element.');
      return;
    }
    const width = row?.width ?? reportContentWidth(draft);
    const created = createReportElement(type, width, height);
    const next = {
      ...created,
      x: Math.max(0, Math.min(Math.round(x * 2) / 2, width - created.width)),
      y: Math.max(0, Math.min(Math.round(y * 2) / 2, height - created.height)),
    };
    change(insertReportElement(draft, target, next));
    setSelection({ ...target, elementId: next.id });
    setPaletteType(null);
    setIoError(null);
  };
  const remove = (): void => {
    if (element === undefined) return;
    change(editReportElement(draft, selection, () => null));
    setSelection({ ...selection, elementId: null });
  };
  const duplicate = (): void => {
    if (element === undefined) return;
    const next = duplicateReportElement(element);
    change(insertReportElement(draft, selection, next));
    setSelection({ ...selection, elementId: next.id });
  };
  const importText = (text: string, origin: string): void => {
    if (new TextEncoder().encode(text).length > MAX_TEMPLATE_BYTES)
      throw new Error('Template exceeds the 5 MB limit.');
    const next = parseReportTemplate(text);
    change(next);
    setSelection({
      bandId: next.bands.find((item) => item.kind === 'detail')?.id ?? next.bands[0]?.id ?? '',
      elementId: null,
    });
    setIoError(null);
    setNotice(`Imported ${origin}. Review the API bindings before saving.`);
    setTab('design');
  };
  const loadUrl = async (): Promise<void> => {
    let url: URL;
    try {
      url = new URL(importUrl);
      if (url.protocol !== 'https:' && url.protocol !== 'http:')
        throw new Error('Use an HTTP or HTTPS template URL.');
    } catch (failure) {
      setIoError(message(failure));
      return;
    }
    const controller = new AbortController();
    importController.current?.abort();
    importController.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), 20_000);
    setLoading(true);
    setIoError(null);
    try {
      const response = await fetch(url.href, { signal: controller.signal });
      if (!response.ok)
        throw new Error(`Template request failed (HTTP ${String(response.status)}).`);
      const length = Number(response.headers.get('content-length'));
      if (Number.isFinite(length) && length > MAX_TEMPLATE_BYTES)
        throw new Error('Template exceeds the 5 MB limit.');
      importText(await response.text(), url.hostname);
      setUrlOpen(false);
    } catch (failure) {
      setIoError(
        controller.signal.aborted
          ? 'Template loading was canceled or timed out.'
          : `Could not load the template: ${message(failure)} The server must allow browser requests (CORS).`,
      );
    } finally {
      window.clearTimeout(timeout);
      if (importController.current === controller) {
        importController.current = null;
        setLoading(false);
      }
    }
  };
  const exportTemplate = (): void => {
    try {
      const url = URL.createObjectURL(
        new Blob([serializeReportTemplate(draft)], { type: 'application/json' }),
      );
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${draft.name.replace(/[\\/:*?"<>|]/gu, '-').trim() || 'report'}.report.json`;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 2_000);
      setNotice('Template exported as versioned JSON.');
      setIoError(null);
    } catch (failure) {
      setIoError(message(failure));
    }
  };
  const select = (target: ReportSelection): void => {
    setSelection(target);
    setTab('design');
  };
  return createPortal(
    <div
      className="wr-modal-backdrop wr-report-backdrop"
      role="presentation"
      onKeyDown={(event) => {
        handleKeyDown(event);
        if (event.defaultPrevented) return;
        const target = event.target;
        const editing =
          target instanceof HTMLElement &&
          (target.matches('input,textarea,select') || target.isContentEditable);
        if (editing) return;
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
          event.preventDefault();
          if (event.shiftKey) redo();
          else undo();
        } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') {
          event.preventDefault();
          redo();
        } else if (event.key === 'Delete' || event.key === 'Backspace') {
          event.preventDefault();
          remove();
        } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'd') {
          event.preventDefault();
          duplicate();
        }
      }}
    >
      <section
        ref={dialogRef}
        className="wr-modal wr-report-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <form
          className="wr-report-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (parsed !== null && validationError === null && !loading) onSave(parsed);
          }}
        >
          <header className="wr-modal-header">
            <div className="wr-report-title">
              <Icon name="page" />
              <div>
                <span className="wr-modal-eyebrow">Report Builder / {component.name}</span>
                <h2 id={titleId}>Report template</h2>
              </div>
            </div>
            <label className="wr-report-name">
              <span>Template name</span>
              <input
                aria-label="Report template name"
                value={draft.name}
                onChange={(event) => {
                  setIoError(null);
                  change({ ...draft, name: event.currentTarget.value });
                }}
              />
            </label>
            <div className="wr-report-header-actions">
              <button type="button" onClick={close}>
                Cancel
              </button>
              <button
                type="submit"
                className="wr-report-save"
                disabled={parsed === null || validationError !== null || loading}
              >
                Save template
              </button>
              <button
                type="button"
                className="wr-modal-close"
                aria-label="Close Report Builder"
                title="Close Report Builder (Esc)"
                onClick={close}
              >
                <Icon name="close" />
              </button>
            </div>
          </header>
          <div className="wr-report-toolbar">
            <div role="tablist" aria-label="Report editor views">
              {(['design', 'parameters', 'page'] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  aria-selected={tab === value}
                  onClick={() => setTab(value)}
                >
                  {value === 'design'
                    ? 'Design'
                    : value === 'parameters'
                      ? `Parameters (${String(draft.parameters.length)})`
                      : 'Page setup'}
                </button>
              ))}
            </div>
            <span className="wr-report-toolbar-divider" />
            <button
              type="button"
              aria-label="Undo report edit"
              title="Undo (Ctrl+Z)"
              disabled={history.past.length === 0}
              onClick={undo}
            >
              Undo
            </button>
            <button
              type="button"
              aria-label="Redo report edit"
              title="Redo (Ctrl+Shift+Z)"
              disabled={history.future.length === 0}
              onClick={redo}
            >
              Redo
            </button>
            <button
              type="button"
              disabled={element === undefined}
              title="Duplicate (Ctrl+D)"
              onClick={duplicate}
            >
              Duplicate
            </button>
            <button type="button" disabled={element === undefined} title="Delete" onClick={remove}>
              Delete
            </button>
            <span className="wr-report-toolbar-spacer" />
            <button type="button" onClick={() => fileRef.current?.click()}>
              Import JSON
            </button>
            <button type="button" aria-expanded={urlOpen} onClick={() => setUrlOpen(!urlOpen)}>
              Import URL
            </button>
            <button type="button" disabled={parsed === null} onClick={exportTemplate}>
              Export JSON
            </button>
            <label className="wr-report-zoom">
              <span>Zoom</span>
              <select
                aria-label="Report canvas zoom"
                value={zoom}
                onChange={(event) => setZoom(Number(event.currentTarget.value))}
              >
                <option value="0.5">50%</option>
                <option value="0.75">75%</option>
                <option value="1">100%</option>
                <option value="1.25">125%</option>
              </select>
            </label>
          </div>
          <input
            ref={fileRef}
            className="wr-report-file-input"
            type="file"
            accept="application/json,.json"
            aria-label="Import report template file"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = '';
              if (file === undefined) return;
              if (file.size > MAX_TEMPLATE_BYTES) {
                setIoError('Template exceeds the 5 MB limit.');
                return;
              }
              void file
                .text()
                .then((text) => importText(text, file.name))
                .catch((failure: unknown) =>
                  setIoError(`Could not import template: ${message(failure)}`),
                );
            }}
          />
          {urlOpen && (
            <div className="wr-report-url-import">
              <label>
                <span>Template URL</span>
                <input
                  type="url"
                  aria-label="Report template URL"
                  value={importUrl}
                  placeholder="https://example.com/report.json"
                  onChange={(event) => setImportUrl(event.currentTarget.value)}
                />
              </label>
              <button
                type="button"
                disabled={loading || importUrl.trim() === ''}
                onClick={() => void loadUrl()}
              >
                {loading ? 'Loading…' : 'Load template'}
              </button>
            </div>
          )}
          <div className="wr-report-workspace">
            <aside className="wr-report-toolbox">
              <h3>Components</h3>
              <div className="wr-report-palette">
                {(['text', 'image', 'line', 'repeater'] as const).map((type) => (
                  <button
                    key={type}
                    type="button"
                    aria-label={`Add report ${type}`}
                    title={`Drag ${type} onto a band or row template`}
                    disabled={tab !== 'design'}
                    draggable={tab === 'design'}
                    onDragStart={(event) => {
                      event.dataTransfer.effectAllowed = 'copy';
                      event.dataTransfer.setData(REPORT_COMPONENT_DRAG_TYPE, type);
                      setPaletteType(type);
                    }}
                    onDragEnd={() => setPaletteType(null)}
                  >
                    <Icon
                      name={
                        type === 'text'
                          ? 'text'
                          : type === 'image'
                            ? 'image'
                            : type === 'line'
                              ? 'minus'
                              : 'repeat'
                      }
                    />
                    <span>
                      {type === 'repeater' ? 'Repeater' : type[0]?.toUpperCase() + type.slice(1)}
                    </span>
                  </button>
                ))}
              </div>
              <h3>Report outline</h3>
              <div className="wr-report-outline">
                {reportOrderedBands(draft).map((item) => (
                  <div key={item.id}>
                    <button
                      type="button"
                      className={`wr-report-outline-band${selection.bandId === item.id && selection.elementId === null && row === undefined ? ' is-selected' : ''}`}
                      onClick={() => select({ bandId: item.id, elementId: null })}
                    >
                      {REPORT_BAND_LABELS[item.kind]}
                      <span>{item.elements.length}</span>
                    </button>
                    {item.elements.map((child) => (
                      <div key={child.id}>
                        <button
                          type="button"
                          className={`wr-report-outline-element${selection.elementId === child.id ? ' is-selected' : ''}`}
                          onClick={() => select({ bandId: item.id, elementId: child.id })}
                        >
                          <span>
                            {child.type === 'repeater'
                              ? '↻'
                              : child.type === 'text'
                                ? 'T'
                                : child.type === 'image'
                                  ? '▧'
                                  : '—'}
                          </span>
                          {child.name}
                        </button>
                        {child.type === 'repeater' &&
                          child.children.map((leaf) => (
                            <button
                              key={leaf.id}
                              type="button"
                              className={`wr-report-outline-element wr-report-outline-child${selection.elementId === leaf.id ? ' is-selected' : ''}`}
                              onClick={() =>
                                select({ bandId: item.id, elementId: leaf.id, parentId: child.id })
                              }
                            >
                              {leaf.name}
                            </button>
                          ))}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
              <p className="wr-report-hint">Drag components onto a band or row template.</p>
            </aside>
            <main className="wr-report-main">
              {tab === 'design' ? (
                <ReportCanvas
                  template={draft}
                  selection={selection}
                  zoom={zoom}
                  paletteType={paletteType}
                  onInsert={add}
                  onSelect={select}
                  onChange={change}
                />
              ) : tab === 'parameters' ? (
                <ReportParametersEditor template={draft} onChange={change} />
              ) : (
                <ReportPageSetup template={draft} onChange={change} />
              )}
            </main>
            <ReportElementInspector
              template={draft}
              band={band}
              element={element}
              row={row}
              components={availableComponents}
              onElementChange={(next) => {
                setIoError(null);
                change(editReportElement(draft, selection, () => next));
              }}
              onBandChange={(height) => {
                setIoError(null);
                change({
                  ...draft,
                  bands: draft.bands.map((item) =>
                    item.id === selection.bandId ? { ...item, height } : item,
                  ),
                });
              }}
              onEditRow={(next) =>
                select({ bandId: selection.bandId, elementId: null, parentId: next.id })
              }
              onExitRow={() =>
                select({ bandId: selection.bandId, elementId: selection.parentId ?? null })
              }
            />
          </div>
          <footer className="wr-report-status">
            {error !== null ? (
              <p role="alert">{error}</p>
            ) : (
              <p role="status">
                {notice ??
                  'Template changes are saved to the project when you choose Save template.'}
              </p>
            )}
            <span>
              PDF · {draft.paper.size} · {draft.bands.length} bands
            </span>
          </footer>
        </form>
      </section>
    </div>,
    document.body,
  );
}
