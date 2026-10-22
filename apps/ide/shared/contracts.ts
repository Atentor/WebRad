import type { UpdateBridge } from './update-contracts';
import type { NativeBuildBridge } from './native-build-contracts';
import type { ExternalLinkTarget } from './external-links';
import type { RestGoAdminBridge } from './restgo-admin';
import type { RestGoDevelopmentBridge } from './restgo-development';
import type { DebugBridge } from './debugger-contracts';
import type { ComponentStyleModel, ProjectAsset, WebRadProject } from '@webrad/project-model';

export const IDE_COMMANDS = [
  'file.newProject',
  'file.openProject',
  'file.closeProject',
  'file.save',
  'file.saveAll',
  'file.exit',
  'edit.undo',
  'edit.redo',
  'edit.cut',
  'edit.copy',
  'edit.paste',
  'edit.delete',
  'search.find',
  'view.design',
  'view.code',
  'view.preview',
  'view.projectExplorer',
  'view.objectInspector',
  'view.toolPalette',
  'view.output',
  'project.addPage',
  'project.addReusableElement',
  'project.addModel',
  'project.addUnit',
  'project.importAsset',
  'project.build',
  'project.buildApplication',
  'project.deploy',
  'run.run',
  'debug.start',
  'debug.pause',
  'debug.stepOver',
  'debug.stepInto',
  'debug.stepOut',
  'debug.stop',
  'debug.restart',
  'view.debugger',
  'view.toggleTheme',
  'help.about',
  'help.checkUpdates',
] as const;

export type IdeCommand = (typeof IDE_COMMANDS)[number];

export interface ProjectSession {
  rootPath: string;
  projectFilePath: string;
  project: WebRadProject;
  userSources: Record<string, string>;
}

export interface CreateProjectRequest {
  name: string;
}

export interface SaveProjectRequest {
  rootPath: string;
  project: WebRadProject;
  userSources: Record<string, string>;
}

export interface WriteFileRequest {
  rootPath: string;
  relativePath: string;
  content: string;
}

export interface ReadFileRequest {
  rootPath: string;
  relativePath: string;
}

export interface BuildDiagnostic {
  category: 'error' | 'warning' | 'info';
  message: string;
  source?: 'model' | 'registry' | 'typescript' | 'esbuild' | 'compiler' | 'ide';
  code?: string | number;
  file?: string;
  line?: number;
  column?: number;
  length?: number;
  path?: readonly (string | number)[];
}

export interface BuildRequest extends SaveProjectRequest {
  outputDirectory?: string;
}

export interface BuildResponse {
  success: boolean;
  outputDirectory?: string;
  previewUrl?: string;
  diagnostics: readonly BuildDiagnostic[];
}

export interface DeployRequest extends SaveProjectRequest {
  requestId: string;
}

export interface DeployResponse {
  success: boolean;
  cancelled?: boolean;
  outputDirectory?: string;
  diagnostics: readonly BuildDiagnostic[];
  fileCount?: number;
}

export interface DeployProgress {
  requestId: string;
  phase: 'compiling' | 'writing' | 'complete';
  completedFiles: number;
  totalFiles: number;
  currentFile?: string;
}

export interface CompileStylesRequest {
  readonly styles: readonly ComponentStyleModel[];
}

export interface CompileStylesResponse {
  readonly css: string;
}

export interface WebRadBridge {
  readonly nativeBuild: NativeBuildBridge;
  readonly updates: UpdateBridge;
  readonly debugger: DebugBridge;
  readonly restgoAdmin: RestGoAdminBridge;
  readonly restgoDevelopment: RestGoDevelopmentBridge;
  links: { open(target: ExternalLinkTarget): Promise<void> };
  project: {
    create(request: CreateProjectRequest): Promise<ProjectSession | null>;
    open(): Promise<ProjectSession | null>;
    /** Reopens the last project recorded by the main process, without a file picker. */
    restore(): Promise<ProjectSession | null>;
    save(request: SaveProjectRequest): Promise<ProjectSession>;
    saveAs(request: Omit<SaveProjectRequest, 'rootPath'>): Promise<ProjectSession | null>;
    release(rootPath: string): Promise<void>;
    importAsset(rootPath: string): Promise<ProjectAsset | null>;
  };
  files: {
    read(request: ReadFileRequest): Promise<string>;
    write(request: WriteFileRequest): Promise<void>;
  };
  build: {
    run(request: BuildRequest): Promise<BuildResponse>;
  };
  deploy: {
    chooseDirectory(rootPath: string): Promise<string | null>;
    run(request: DeployRequest): Promise<DeployResponse>;
    subscribe(listener: (progress: DeployProgress) => void): () => void;
  };
  styles: {
    /** Compiles the project style catalog for live design-time preview. */
    compile(request: CompileStylesRequest): Promise<CompileStylesResponse>;
  };
  commands: {
    subscribe(listener: (command: IdeCommand) => void): () => void;
  };
  lifecycle: {
    setDirty(dirty: boolean): void;
  };
  platform: NodeJS.Platform;
}
