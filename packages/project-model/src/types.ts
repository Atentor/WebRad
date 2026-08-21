export const CURRENT_PROJECT_FORMAT_VERSION = 1 as const;
export const CURRENT_PAGE_FORMAT_VERSION = 1 as const;

/** Aggregate project format version. */
export const PROJECT_FORMAT_VERSION = CURRENT_PROJECT_FORMAT_VERSION;

export type ProjectFormatVersion = typeof CURRENT_PROJECT_FORMAT_VERSION;
export type PageFormatVersion = typeof CURRENT_PAGE_FORMAT_VERSION;
export type LayoutMode = 'absolute' | 'flex' | 'grid';

export interface Bounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface ComponentNode {
  /** Immutable identity. User-facing renames must never change this value. */
  readonly id: string;
  readonly type: string;
  readonly name: string;
  readonly parentId: string | null;
  readonly bounds: Bounds;
  readonly props: Readonly<Record<string, unknown>>;
  readonly events: Readonly<Record<string, string | null>>;
  /** Ordered child IDs; this order is also the visual stacking order. */
  readonly children: readonly string[];
}

export interface PageModel {
  readonly formatVersion: PageFormatVersion;
  readonly id: string;
  readonly name: string;
  readonly caption: string;
  readonly width: number;
  readonly height: number;
  readonly layoutMode: LayoutMode;
  readonly components: readonly ComponentNode[];
  readonly rootComponentId: string;
}

export interface ProjectSettings {
  readonly gridSize: number;
  readonly snapToGrid: boolean;
  readonly showGrid: boolean;
  /** POSIX-style relative path persisted in the project, independent of the host OS. */
  readonly outputDirectory: string;
}

export interface WebRadProject {
  readonly formatVersion: ProjectFormatVersion;
  readonly id: string;
  readonly name: string;
  /** ID of the page that starts the generated application. */
  readonly entryPage: string;
  /** Complete in-memory aggregate and the single source of truth. */
  readonly pages: readonly PageModel[];
  readonly settings: ProjectSettings;
}

/** A page entry stored in the lightweight `.wrproj` manifest. */
export interface PageDescriptor {
  readonly id: string;
  readonly name: string;
  readonly pageFile: string;
  readonly generatedFile: string;
  readonly codeFile: string;
}

/** Disk manifest. Page contents live in the descriptor's `.wrpage` file. */
export interface ProjectManifest {
  readonly formatVersion: ProjectFormatVersion;
  readonly id: string;
  readonly name: string;
  readonly entryPage: string;
  readonly pages: readonly PageDescriptor[];
  readonly settings: ProjectSettings;
}

export type IdFactory = () => string;

export const DEFAULT_PROJECT_SETTINGS: Readonly<ProjectSettings> = Object.freeze({
  gridSize: 8,
  snapToGrid: true,
  showGrid: true,
  outputDirectory: 'dist',
});

export const DEFAULT_PAGE_WIDTH = 800;
export const DEFAULT_PAGE_HEIGHT = 600;
