import type { ComponentStyleModel, WebRadProject } from '@webrad/project-model';

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
  'project.build',
  'run.run',
  'view.toggleTheme',
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

export interface CompileStylesRequest {
  readonly styles: readonly ComponentStyleModel[];
}

export interface CompileStylesResponse {
  readonly css: string;
}

export interface WebRadBridge {
  project: {
    create(request: CreateProjectRequest): Promise<ProjectSession | null>;
    open(): Promise<ProjectSession | null>;
    save(request: SaveProjectRequest): Promise<ProjectSession>;
    saveAs(request: Omit<SaveProjectRequest, 'rootPath'>): Promise<ProjectSession | null>;
    release(rootPath: string): Promise<void>;
  };
  files: {
    read(request: ReadFileRequest): Promise<string>;
    write(request: WriteFileRequest): Promise<void>;
  };
  build: {
    run(request: BuildRequest): Promise<BuildResponse>;
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
