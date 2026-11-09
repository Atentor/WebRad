import path from 'node:path';
import { utilityProcess, type UtilityProcess } from 'electron';
import type {
  CompileProjectMemoryOptions,
  CompileProjectPhase,
  CompileProjectResult,
} from '@webrad/compiler';
import type { ComponentStyleModel, WebRadProject } from '@webrad/project-model';
import type {
  CompilerOperation,
  CompilerProcessMetrics,
  CompilerProcessOptions,
  CompilerProcessResponse,
} from './compiler-process-contracts';

type Result = CompileProjectResult | string;
type Progress = (phase: CompileProjectPhase, metrics: CompilerProcessMetrics) => void;
interface Pending {
  readonly resolve: (value: Result) => void;
  readonly reject: (error: Error) => void;
  readonly progress?: Progress;
}
interface Service {
  readonly child: UtilityProcess;
  readonly pending: Map<number, Pending>;
}
let service: Service | undefined;
const fixtureServices = new Set<Service>();
let sequence = 0;
let stopped = false;

function fail(service: Service, error: Error): void {
  for (const request of service.pending.values()) request.reject(error);
  service.pending.clear();
}

function createCompilerService(): Service {
  if (stopped) throw new Error('The compiler service is shutting down.');
  const child = utilityProcess.fork(path.join(__dirname, 'compiler-process.cjs'), [], {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit',
    serviceName: 'WebRAD compiler',
  });
  const current: Service = { child, pending: new Map() };
  child.on('message', (message: CompilerProcessResponse) => {
    const request = current.pending.get(message.id);
    if (request === undefined) return;
    if (message.kind === 'progress') {
      try {
        request.progress?.(message.phase, message.metrics);
      } catch (error) {
        current.pending.delete(message.id);
        request.reject(error instanceof Error ? error : new Error(String(error)));
      }
      return;
    }
    current.pending.delete(message.id);
    if (message.kind === 'result') request.resolve(message.value);
    else {
      const error = new Error(message.message);
      if (message.stack !== undefined) error.stack = message.stack;
      request.reject(error);
    }
  });
  child.once('exit', (code) => {
    if (service === current) service = undefined;
    fixtureServices.delete(current);
    fail(current, new Error(`The compiler process exited (${String(code)}).`));
  });
  child.once('error', (type, location) => {
    if (service === current) service = undefined;
    fixtureServices.delete(current);
    fail(current, new Error(`Compiler ${type}: ${location}`));
    child.kill();
  });
  return current;
}

function compilerService(): Service {
  if (stopped) throw new Error('The compiler service is shutting down.');
  return (service ??= createCompilerService());
}

function send(
  operation: CompilerOperation,
  progress?: Progress,
  current = compilerService(),
): Promise<Result> {
  return new Promise((resolve, reject) => {
    const id = ++sequence;
    current.pending.set(id, { resolve, reject, ...(progress === undefined ? {} : { progress }) });
    try {
      current.child.postMessage({ ...operation, id });
    } catch (error) {
      current.pending.delete(id);
      reject(error);
    }
  });
}

export async function compileProject(
  project: WebRadProject,
  options: CompilerProcessOptions & { readonly onProgress?: Progress },
): Promise<CompileProjectResult> {
  const { onProgress, ...serializable } = options;
  const value = await send({ kind: 'project', project, options: serializable }, onProgress);
  if (typeof value === 'string') throw new Error('Unexpected styles result from the compiler.');
  return value;
}

export async function compileProjectToMemory(
  project: WebRadProject,
  options: Omit<CompileProjectMemoryOptions, 'registry' | 'onProgress'>,
): Promise<CompileProjectResult> {
  // Smoke fixtures are independent projects. Keep their compiler graphs out of
  // the live IDE service so they cannot evict the open project's latest graph.
  const current = createCompilerService();
  fixtureServices.add(current);
  try {
    const value = await send(
      {
        kind: 'project',
        project,
        options: {
          ...options,
          outputDirectory: options.outputDirectory ?? path.resolve('.webrad-preview'),
          write: false,
        },
      },
      undefined,
      current,
    );
    if (typeof value === 'string') throw new Error('Unexpected styles result from the compiler.');
    return value;
  } finally {
    fixtureServices.delete(current);
    current.child.kill();
  }
}

export async function compileTailwindStyles(
  styles: readonly ComponentStyleModel[],
): Promise<string> {
  const value = await send({ kind: 'styles', styles });
  if (typeof value !== 'string') throw new Error('Unexpected project result from the compiler.');
  return value;
}

export function stopCompilerService(): void {
  stopped = true;
  for (const fixture of fixtureServices) {
    fail(fixture, new Error('The compiler service is shutting down.'));
    fixture.child.kill();
  }
  fixtureServices.clear();
  if (service === undefined) return;
  const current = service;
  service = undefined;
  fail(current, new Error('The compiler service is shutting down.'));
  current.child.kill();
}
