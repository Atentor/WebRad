export interface ModelValidationIssue {
  readonly code: string;
  readonly message: string;
  readonly path: readonly PropertyKey[];
}

export class ProjectModelError extends Error {
  public constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
  }
}

export class ProjectParseError extends ProjectModelError {}

export class ProjectValidationError extends ProjectModelError {
  public readonly issues: readonly ModelValidationIssue[];

  public constructor(message: string, issues: readonly ModelValidationIssue[]) {
    super(message);
    this.issues = issues;
  }
}

export class UnsupportedFormatVersionError extends ProjectModelError {
  public readonly foundVersion: number;
  public readonly currentVersion: number;

  public constructor(kind: 'project' | 'form', foundVersion: number, currentVersion: number) {
    super(
      `Unsupported ${kind} format version ${String(foundVersion)}; ` +
        `this WebRAD supports version ${String(currentVersion)}.`,
    );
    this.foundVersion = foundVersion;
    this.currentVersion = currentVersion;
  }
}

export class FutureFormatVersionError extends UnsupportedFormatVersionError {
  public constructor(kind: 'project' | 'form', foundVersion: number, currentVersion: number) {
    super(kind, foundVersion, currentVersion);
    this.name = 'FutureFormatVersionError';
    this.message =
      `Cannot open ${kind} format version ${String(foundVersion)} because it was created by ` +
      `a newer WebRAD (maximum supported version: ${String(currentVersion)}).`;
  }
}

export class ModelUpdateError extends ProjectModelError {}

export class InvalidIdentifierError extends ProjectModelError {
  public readonly identifier: string;

  public constructor(identifier: string, reason: string) {
    super(`Invalid TypeScript identifier "${identifier}": ${reason}`);
    this.identifier = identifier;
  }
}

export class InvalidProjectNameError extends ProjectModelError {
  public readonly projectName: string;

  public constructor(projectName: string, reason: string) {
    super(`Invalid project name "${projectName}": ${reason}`);
    this.projectName = projectName;
  }
}
