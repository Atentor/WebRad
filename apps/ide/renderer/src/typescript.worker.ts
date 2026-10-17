import { initialize } from 'monaco-editor/languages/features/typescript/ts.worker.js';
import { ComponentTypeScriptWorker } from './component-typescript-worker';

self.onmessage = () => {
  initialize((context, data) => new ComponentTypeScriptWorker(context, data));
};
