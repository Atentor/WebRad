import { contextBridge } from 'electron';

// A marker stands in for the IDE bridge and must never appear in report windows.
contextBridge.exposeInMainWorld('webradSmokeBridge', Object.freeze({ marker: 'parent-only' }));
