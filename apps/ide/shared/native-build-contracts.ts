import type { BuildDiagnostic, SaveProjectRequest } from './contracts';
import type { NativeApplicationSettings } from '@webrad/project-model';
import type { NativeBuildStage, NativePrerequisiteReport } from '@webrad/native-build/contracts';
export type { NativeBuildStage } from '@webrad/native-build/contracts';

export interface NativeBuildRequest extends SaveProjectRequest {
  readonly requestId: string;
}

export interface NativeBuildProgress {
  readonly requestId: string;
  readonly stage: NativeBuildStage;
  readonly message?: string;
  readonly stream?: 'stdout' | 'stderr' | 'info';
}

export interface NativeBuildArtifact {
  readonly path: string;
  readonly format: string;
}

export interface NativeBuildResponse {
  readonly requestId: string;
  readonly success: boolean;
  readonly cancelled?: boolean;
  readonly outputDirectory?: string;
  /** Picker-authorized parent directory persisted in Project Settings. */
  readonly configuredOutputDirectory?: string;
  readonly artifacts: readonly NativeBuildArtifact[];
  readonly diagnostics: readonly BuildDiagnostic[];
  readonly prerequisites?: NativePrerequisiteReport;
}

/** Only main-owned build results can authorize filesystem/clipboard actions. */
export interface NativeBuildBridge {
  inspect(request: {
    readonly rootPath: string;
    readonly settings: NativeApplicationSettings;
  }): Promise<NativePrerequisiteReport>;
  chooseDirectory(rootPath: string): Promise<string | null>;
  run(request: NativeBuildRequest): Promise<NativeBuildResponse>;
  exportCi(request: NativeBuildRequest): Promise<NativeBuildResponse>;
  cancel(requestId: string): Promise<void>;
  subscribe(listener: (progress: NativeBuildProgress) => void): () => void;
  openOutput(request: { readonly requestId: string }): Promise<void>;
  copyArtifact(request: {
    readonly requestId: string;
    readonly artifactIndex: number;
  }): Promise<void>;
}
