import * as monacoApi from 'monaco-editor/editor';
import { useEffect, useId, useRef, type ReactElement } from 'react';
import { createPortal } from 'react-dom';
import { webradMonacoTheme } from '../monaco-setup';
import { Icon } from './Icon';
import './PackageDefinitionDialog.css';

export interface PackageDefinitionTarget {
  readonly resource: string;
  readonly content: string;
  readonly selection?: monacoApi.IRange | monacoApi.IPosition;
}

export function PackageDefinitionDialog({
  target,
  theme,
  onClose,
  onEditorMount,
}: {
  readonly target: PackageDefinitionTarget;
  readonly theme: 'dark' | 'light';
  readonly onClose: () => void;
  readonly onEditorMount: (editor: monacoApi.editor.IStandaloneCodeEditor | null) => void;
}): ReactElement {
  const titleId = useId();
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!host.current) return;
    const uri = monacoApi.Uri.parse(target.resource);
    const existing = monacoApi.editor.getModel(uri);
    const model = existing ?? monacoApi.editor.createModel(target.content, 'typescript', uri);
    const editor = monacoApi.editor.create(host.current, {
      model,
      readOnly: true,
      domReadOnly: true,
      automaticLayout: true,
      theme: webradMonacoTheme(theme),
      fontSize: 13,
      fontFamily: "'JetBrains Mono', monospace",
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      contextmenu: true,
      useShadowDOM: false,
      ariaLabel: 'Read-only package declaration',
    });
    if (target.selection) {
      if ('startLineNumber' in target.selection) {
        editor.setSelection(target.selection);
        editor.revealRangeInCenter(target.selection);
      } else {
        editor.setPosition(target.selection);
        editor.revealPositionInCenter(target.selection);
      }
    }
    onEditorMount(editor);
    editor.focus();
    return () => {
      onEditorMount(null);
      editor.dispose();
      if (!existing && !model.isDisposed()) model.dispose();
    };
  }, [target, theme, onEditorMount]);
  return createPortal(
    <div
      className="wr-modal-backdrop"
      role="presentation"
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === 'Escape') {
          event.preventDefault();
          onClose();
        }
        if (event.key === 'Tab') {
          const dialog = event.currentTarget.querySelector<HTMLElement>('[role="dialog"]');
          if (
            event.shiftKey &&
            document.activeElement?.getAttribute('aria-label') === 'Close package declaration'
          ) {
            event.preventDefault();
            host.current
              ?.querySelector<HTMLElement>(
                '.native-edit-context, textarea, [contenteditable="true"]',
              )
              ?.focus();
          } else if (!event.shiftKey && document.activeElement?.closest('.monaco-editor')) {
            event.preventDefault();
            dialog?.querySelector<HTMLButtonElement>('button')?.focus();
          }
        }
      }}
    >
      <section
        className="wr-modal wr-package-definition-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-package-definition-dialog
      >
        <header className="wr-modal-header">
          <div>
            <span className="wr-modal-eyebrow">Read-only declaration</span>
            <h2 id={titleId}>{target.resource.replace('file:///node_modules/', '')}</h2>
          </div>
          <button
            type="button"
            className="wr-modal-close"
            aria-label="Close package declaration"
            onClick={onClose}
          >
            <Icon name="close" />
          </button>
        </header>
        <div ref={host} className="wr-package-definition-host" />
      </section>
    </div>,
    document.body,
  );
}
