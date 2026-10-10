import type { IdeCommand } from '../../shared/contracts';

export function isTextEditingElement(element: Element | null): boolean {
  return (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLSelectElement ||
    (element instanceof HTMLElement && element.isContentEditable)
  );
}

/** Route native menu commands using the visible editor and the current focus. */
export function editCommandTarget(
  editorVisible: boolean,
  designerVisible: boolean,
  focusedElement: Element | null,
): 'editor' | 'designer' | 'text' {
  if (isTextEditingElement(focusedElement) && !focusedElement?.closest('.monaco-editor')) {
    return 'text';
  }
  if (editorVisible) return 'editor';
  return designerVisible ? 'designer' : 'text';
}

export function executeTextEditingCommand(command: IdeCommand): void {
  const commandNames: Partial<Record<IdeCommand, string>> = {
    'edit.undo': 'undo',
    'edit.redo': 'redo',
    'edit.cut': 'cut',
    'edit.copy': 'copy',
    'edit.paste': 'paste',
    'edit.delete': 'delete',
  };
  const commandName = commandNames[command];
  if (commandName !== undefined) document.execCommand(commandName);
}
