import type { NativeBundleFormat, NativeTargetPlatform } from '@webrad/project-model';

/** This module is browser safe. Process execution is exported only by the package root. */
export const NATIVE_BUILD_STAGES = [
  'preparing',
  'compiling-webrad',
  'generating-tauri',
  'checking-dependencies',
  'compiling-native',
  'packaging',
  'completed',
  'failed',
  'cancelled',
] as const;
export type NativeBuildStage = (typeof NATIVE_BUILD_STAGES)[number];
export interface NativeBuildEvent {
  readonly buildId: string;
  readonly stage: NativeBuildStage;
  readonly message: string;
  readonly stream?: 'stdout' | 'stderr' | 'info';
  readonly timestamp: string;
}
export interface NativeBuildArtifact {
  readonly path: string;
  readonly name: string;
  readonly format: NativeBundleFormat;
  readonly size: number;
}
export interface NativePrerequisite {
  readonly id: string;
  readonly name: string;
  readonly status: 'available' | 'missing' | 'unsupported';
  readonly version?: string;
  readonly minimumVersion?: string;
  readonly instruction: string;
}
export interface NativePrerequisiteReport {
  readonly platform: NativeTargetPlatform;
  readonly hostPlatform: string;
  readonly ready: boolean;
  readonly checks: readonly NativePrerequisite[];
}
export interface NativeBuildResult {
  readonly buildId: string;
  readonly status: 'completed' | 'failed' | 'cancelled';
  readonly artifacts: readonly NativeBuildArtifact[];
  readonly workspaceDirectory: string;
  readonly outputDirectory: string;
  readonly prerequisites?: NativePrerequisiteReport;
  readonly error?: string;
}
