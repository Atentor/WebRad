import { compileProject, compileTailwindStyles } from '@webrad/compiler';
import type { CompilerProcessRequest, CompilerProcessResponse } from './compiler-process-contracts';

const parent = process.parentPort;
if (!parent) throw new Error('The compiler process requires its owned parent port.');
const send = (message: CompilerProcessResponse): void => parent.postMessage(message);

// One compiler owns the latest TypeScript graph and Tailwind cache. Never overlap
// requests or move those retained graphs into the IDE's V8 isolate.
let queue = Promise.resolve();
parent.on('message', (event: Electron.MessageEvent) => {
  const request = event.data as CompilerProcessRequest;
  queue = queue.then(async () => {
    try {
      const value =
        request.kind === 'styles'
          ? await compileTailwindStyles(request.styles)
          : await compileProject(request.project, {
              ...request.options,
              onProgress: (phase) =>
                send({
                  kind: 'progress',
                  id: request.id,
                  phase,
                  metrics: {
                    pid: process.pid,
                    cpu: process.cpuUsage(),
                    memory: process.memoryUsage(),
                  },
                }),
            });
      send({ kind: 'result', id: request.id, value });
    } catch (error) {
      send({
        kind: 'error',
        id: request.id,
        message: error instanceof Error ? error.message : String(error),
        ...(error instanceof Error && error.stack !== undefined ? { stack: error.stack } : {}),
      });
    }
  });
});
