import type { WebRadProject } from '@webrad/project-model';
import type { SaveProjectRequest } from './contracts';

export interface PackageProjectRequest {
  readonly rootPath: string;
  readonly projectId: string;
}
export interface InstalledPackage {
  readonly name: string;
  readonly requested: string;
  readonly installedVersion: string | null;
  readonly description?: string;
  readonly latestVersion?: string;
}
export interface PackageToolchain {
  readonly available: boolean;
  readonly nodeVersion?: string;
  readonly npmVersion?: string;
  readonly message?: string;
}
export interface PackageStatus {
  readonly dependencies: readonly InstalledPackage[];
  readonly toolchain: PackageToolchain;
  readonly revision: string;
}
export interface PackageOperationRequest extends SaveProjectRequest {
  readonly requestId: string;
  readonly action: 'install' | 'update' | 'remove' | 'restore';
  readonly name?: string;
  readonly version?: string;
}
export type PackageAction = PackageOperationRequest['action'];
export interface PackageOperationResult {
  readonly success: boolean;
  readonly cancelled?: boolean;
  readonly error?: string;
  readonly state: PackageStatus;
  readonly project: WebRadProject;
}
export interface PackageProgress {
  readonly requestId: string;
  readonly phase: 'preparing' | 'running' | 'complete';
  readonly stream?: 'stdout' | 'stderr';
  readonly message: string;
}
export interface RegistryPackage {
  readonly name: string;
  readonly version: string;
  readonly description: string;
  readonly homepage?: string;
  readonly license?: string;
}
export interface PackageSearchRequest {
  readonly requestId: string;
  readonly query: string;
  readonly offset?: number;
}
export interface PackageSearchResult {
  readonly packages: readonly RegistryPackage[];
  readonly total: number;
  readonly offset: number;
}
export interface PackageTypesRequest extends PackageProjectRequest {
  readonly imports: readonly string[];
}
export interface PackageTypesSnapshot {
  readonly revision: string;
  /** Keys are file:///node_modules/... URIs consumed by the existing TS worker. */
  readonly files: Readonly<Record<string, string>>;
  readonly warnings: readonly string[];
}
export interface PackagesBridge {
  status(request: PackageProjectRequest): Promise<PackageStatus>;
  run(request: PackageOperationRequest): Promise<PackageOperationResult>;
  search(request: PackageSearchRequest): Promise<PackageSearchResult>;
  cancel(requestId: string): Promise<void>;
  types(request: PackageTypesRequest): Promise<PackageTypesSnapshot>;
  subscribe(listener: (progress: PackageProgress) => void): () => void;
}
