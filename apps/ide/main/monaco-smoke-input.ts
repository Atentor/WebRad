/** Both native Monaco input implementations must be ready before injecting text. */
export function monacoHandlerInputReadyExpression(handlerName: string): string {
  return `(() => {
    const editor = document.querySelector('.monaco-editor');
    const input = editor?.querySelector('.native-edit-context, textarea.inputarea');
    return input instanceof HTMLElement && document.activeElement === input &&
      editor.textContent?.includes(${JSON.stringify(handlerName)}) === true &&
      document.querySelector('.monaco-editor')?.getAttribute('data-cursor-position')?.endsWith('column 5') === true;
  })()`;
}
