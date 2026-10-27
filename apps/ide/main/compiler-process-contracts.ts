import type {
  CompileProjectOptions,
  CompileProjectPhase,
  CompileProjectResult,
} from '@webrad/compiler';
import type { ComponentStyleModel, WebRadProject } from '@webrad/project-model';

export type CompilerProcessOptions = Omit<CompileProjectOptions, 'registry' | 'onProgress'>;
export interface CompilerProcessMetrics {
  readonly pid: number;
  readonly cpu: NodeJS.CpuUsage;
  readonly memory: NodeJS.MemoryUsage;
}
export type CompilerOperation =
  | {
      readonly kind: 'project';
      readonly project: WebRadProject;
      readonly options: CompilerProcessOptions;
    }
  | { readonly kind: 'styles'; readonly styles: readonly ComponentStyleModel[] };
export type CompilerProcessRequest = CompilerOperation & { readonly id: number };
export type CompilerProcessResponse =
  | {
      readonly kind: 'progress';
      readonly id: number;
      readonly phase: CompileProjectPhase;
      readonly metrics: CompilerProcessMetrics;
    }
  | { readonly kind: 'result'; readonly id: number; readonly value: CompileProjectResult | string }
  | {
      readonly kind: 'error';
      readonly id: number;
      readonly message: string;
      readonly stack?: string;
    };
