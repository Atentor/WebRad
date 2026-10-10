import { describe, expect, it } from 'vitest';
import {
  createProject,
  parseProject,
  projectToManifest,
  assembleProject,
  serializeProjectManifest,
  deserializeProjectManifest,
} from '../src/index';

describe('project debugger preferences', () => {
  it('keeps existing format-v2 projects readable and round-trips debugger preferences in the disk manifest', () => {
    const original = createProject('DebugProject');
    expect(original.debugger).toBeUndefined();
    const debuggerSettings = {
      version: 1 as const,
      breakpoints: [
        { path: 'pages/PageMain.ts', line: 12, enabled: true, condition: 'this.Button1.enabled' },
      ],
      watches: ['this.Button1.text', 'counter'],
      pauseOnExceptions: 'all' as const,
    };
    const project = parseProject({ ...original, debugger: debuggerSettings });
    const manifest = deserializeProjectManifest(
      serializeProjectManifest(projectToManifest(project)),
    );
    expect(assembleProject(manifest, project.pages).debugger).toEqual(debuggerSettings);
  });

  it.each([
    { path: '../outside.ts', line: 1, enabled: true },
    { path: 'C:/private.ts', line: 1, enabled: true },
    { path: 'pages/PageMain.generated.ts', line: 1, enabled: true },
    { path: 'pages/PageMain.ts', line: 0, enabled: true },
    { path: 'pages/PageMain.ts', line: 1.5, enabled: true },
  ])('rejects invalid breakpoint location %j', (breakpoint) => {
    expect(() =>
      parseProject({
        ...createProject('DebugProject'),
        debugger: {
          version: 1,
          breakpoints: [breakpoint],
          watches: [],
          pauseOnExceptions: 'uncaught',
        },
      }),
    ).toThrow();
  });

  it('rejects duplicate locations and unknown debugger preference versions', () => {
    const breakpoint = { path: 'pages/PageMain.ts', line: 1, enabled: true };
    expect(() =>
      parseProject({
        ...createProject(),
        debugger: {
          version: 1,
          breakpoints: [breakpoint, breakpoint],
          watches: [],
          pauseOnExceptions: 'none',
        },
      }),
    ).toThrow();
    expect(() =>
      parseProject({
        ...createProject(),
        debugger: { version: 2, breakpoints: [], watches: [], pauseOnExceptions: 'none' },
      }),
    ).toThrow();
  });
});
