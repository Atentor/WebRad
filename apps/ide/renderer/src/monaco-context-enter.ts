import { KeyCode, type IDisposable, type editor } from 'monaco-editor/editor';

/** Consume Enter in IntelliSense even when accepting would not change the text. */
export function registerMonacoContextEnter(target: editor.IStandaloneCodeEditor): IDisposable {
  const actions = [
    target.addAction({
      id: 'webrad.accept-context-suggestion',
      label: 'Accept Context Suggestion',
      keybindings: [KeyCode.Enter],
      precondition: 'textInputFocus && suggestWidgetVisible && suggestWidgetHasFocusedSuggestion',
      run: () => target.trigger('webrad', 'acceptSelectedSuggestion', undefined),
    }),
    target.addAction({
      id: 'webrad.dismiss-context-suggestions',
      label: 'Dismiss Context Suggestions',
      keybindings: [KeyCode.Enter],
      precondition: 'textInputFocus && suggestWidgetVisible && !suggestWidgetHasFocusedSuggestion',
      run: () => target.trigger('webrad', 'hideSuggestWidget', undefined),
    }),
    target.addAction({
      id: 'webrad.dismiss-parameter-hints',
      label: 'Dismiss Parameter Hints',
      keybindings: [KeyCode.Enter],
      precondition: 'textInputFocus && parameterHintsVisible && !suggestWidgetVisible',
      run: () => target.trigger('webrad', 'closeParameterHints', undefined),
    }),
  ];
  return { dispose: () => actions.forEach((action) => action.dispose()) };
}
