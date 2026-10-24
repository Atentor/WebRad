// Monaco exports the grammar module as JavaScript without its declaration file.
declare module 'monaco-editor/languages/definitions/typescript/typescript' {
  import type { languages } from 'monaco-editor/editor';

  export const conf: languages.LanguageConfiguration;
  export const language: languages.IMonarchLanguage;
}
