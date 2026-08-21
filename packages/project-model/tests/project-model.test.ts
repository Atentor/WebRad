import { describe, expect, it } from 'vitest';

import {
  CURRENT_PAGE_FORMAT_VERSION,
  CURRENT_PROJECT_FORMAT_VERSION,
  FutureFormatVersionError,
  ModelUpdateError,
  ProjectValidationError,
  UnsupportedFormatVersionError,
  addComponent,
  assembleProject,
  bindComponentEvent,
  createPage,
  createProject,
  createSequentialName,
  deserializePage,
  deserializeProject,
  deserializeProjectManifest,
  getPageNameError,
  isValidTypeScriptIdentifier,
  projectToManifest,
  removeComponent,
  renameComponent,
  renamePage,
  safeDeserializeProject,
  safeParsePage,
  safeParseProject,
  serializeProject,
  serializeProjectManifest,
  updateComponentBounds,
  updateComponentProps,
  updatePage,
  validateComponentName,
  type ComponentNode,
  type IdFactory,
} from '../src/index.js';

function idSequence(...values: readonly string[]): IdFactory {
  let index = 0;
  return () => {
    const value = values[index];
    if (value === undefined) throw new Error('Test ID sequence exhausted.');
    index += 1;
    return value;
  };
}

function component(
  id: string,
  type: string,
  name: string,
  parentId: string | null,
  props: Readonly<Record<string, unknown>> = {},
): ComponentNode {
  return {
    id,
    type,
    name,
    parentId,
    bounds: { x: 8, y: 8, width: 100, height: 32 },
    props,
    events: { OnClick: null },
    children: [],
  };
}

describe('project factories', () => {
  it('creates a complete aggregate with an entry page and WebPage root', () => {
    const project = createProject('CustomerApp', {
      idFactory: idSequence('project-id', 'page-id', 'root-id'),
    });

    expect(project).toMatchObject({
      formatVersion: CURRENT_PROJECT_FORMAT_VERSION,
      id: 'project-id',
      name: 'CustomerApp',
      entryPage: 'page-id',
      settings: {
        gridSize: 8,
        snapToGrid: true,
        showGrid: true,
        outputDirectory: 'dist',
      },
    });
    expect(project.pages).toHaveLength(1);
    expect(project.pages[0]).toMatchObject({
      formatVersion: CURRENT_PAGE_FORMAT_VERSION,
      id: 'page-id',
      name: 'PageMain',
      layoutMode: 'absolute',
      rootComponentId: 'root-id',
    });
    expect(project.pages[0]?.components[0]).toMatchObject({
      id: 'root-id',
      type: 'WebPage',
      name: 'PageMain',
      parentId: null,
    });
  });

  it('uses crypto UUIDs by default', () => {
    const page = createPage('PageMain');
    expect(page.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(page.rootComponentId).not.toBe(page.id);
  });

  it('allows portable display names for projects while page names remain identifiers', () => {
    const project = createProject('Customer App', idSequence('project-id', 'page-id', 'root-id'));
    expect(project.name).toBe('Customer App');
    expect(() =>
      createProject('../CustomerApp', idSequence('project-id', 'page-id', 'root-id')),
    ).toThrow('portable');
    expect(() => createPage('Customer Page')).toThrow('TypeScript identifier');
    expect(getPageNameError('CON')).toContain('reserved Windows device');
    expect(() => createPage('CON')).toThrow(ProjectValidationError);
  });
});

describe('name validation', () => {
  it('accepts TypeScript identifiers and rejects reserved or malformed names', () => {
    expect(isValidTypeScriptIdentifier('BTNMostrar')).toBe(true);
    expect(isValidTypeScriptIdentifier('ação')).toBe(true);
    expect(isValidTypeScriptIdentifier('2Buttons')).toBe(false);
    expect(isValidTypeScriptIdentifier('two-buttons')).toBe(false);
    expect(isValidTypeScriptIdentifier('class')).toBe(false);
  });

  it('generates the first available sequential name and validates uniqueness', () => {
    expect(createSequentialName('Button', ['Button1', 'Button2', 'Button4'])).toBe('Button3');
    const page = createPage('PageMain', idSequence('page-id', 'root-id'));
    const withButton = addComponent(
      page,
      component('button-id', 'WebButton', 'Button1', page.rootComponentId),
    );

    expect(validateComponentName('Button1', withButton).valid).toBe(false);
    expect(validateComponentName('Button1', withButton, 'button-id').valid).toBe(true);
    expect(() => renameComponent(withButton, 'button-id', 'PageMain')).toThrow(ModelUpdateError);
    expect(validateComponentName('show', withButton, 'button-id')).toMatchObject({
      valid: false,
      reason: expect.stringContaining('runtime API'),
    });
    expect(() => renameComponent(withButton, 'button-id', 'show')).toThrow('runtime API');
    for (const inheritedMember of [
      'backgroundColor',
      'borderColor',
      'caption',
      'color',
      'height',
      'layoutMode',
      'tabIndex',
      'width',
      'x',
      'y',
    ]) {
      expect(validateComponentName(inheritedMember, withButton, 'button-id')).toMatchObject({
        valid: false,
        reason: expect.stringContaining('runtime API'),
      });
    }

    const collidingDocument = {
      ...withButton,
      components: withButton.components.map((node) =>
        node.id === 'button-id' ? { ...node, name: 'element' } : node,
      ),
    };
    const collisionResult = safeParsePage(collidingDocument);
    expect(collisionResult.success).toBe(false);
    if (!collisionResult.success) {
      expect(
        collisionResult.error.issues.some((issue) => issue.message.includes('runtime API')),
      ).toBe(true);
    }
  });
});

describe('zod validation', () => {
  it('detects duplicate names and broken parent/child links without throwing', () => {
    const page = createPage('PageMain', idSequence('page-id', 'root-id'));
    const invalid = {
      ...page,
      components: [
        ...page.components,
        component('button-a', 'WebButton', 'Duplicate', page.rootComponentId),
        component('button-b', 'WebButton', 'Duplicate', 'missing-parent'),
      ],
    };
    const result = safeParsePage(invalid);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.message.includes('unique'))).toBe(true);
      expect(result.error.issues.some((issue) => issue.message.includes('Unknown parent'))).toBe(
        true,
      );
    }
  });

  it('rejects components that are disconnected from the page root', () => {
    const page = createPage('PageMain', idSequence('page-id', 'root-id'));
    const orphan = component('orphan-id', 'WebButton', 'OrphanButton', null);
    const result = safeParsePage({ ...page, components: [...page.components, orphan] });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.message.includes('reachable'))).toBe(true);
    }
  });

  it('rejects non-JSON props, unknown fields, and invalid entry pages', () => {
    const project = createProject('Project1', idSequence('project-id', 'page-id', 'root-id'));
    const root = project.pages[0]?.components[0];
    expect(root).toBeDefined();
    const invalidProps = {
      ...project,
      pages: [
        {
          ...project.pages[0],
          components: [{ ...root, props: { callback: () => undefined } }],
        },
      ],
      extra: true,
    };
    expect(safeParseProject(invalidProps).success).toBe(false);
    expect(safeParseProject({ ...project, entryPage: 'missing' }).success).toBe(false);
  });

  it('rejects page names that collide on case-insensitive portable filesystems', () => {
    const project = createProject('Project1', idSequence('project-id', 'page-id', 'root-id'));
    const collidingPage = createPage('pagemain', idSequence('other-page', 'other-root'));
    const result = safeParseProject({ ...project, pages: [...project.pages, collidingPage] });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.message.includes('portable'))).toBe(true);
    }
  });

  it('throws a useful validation error from strict parsers', () => {
    const project = createProject('Project1', idSequence('project-id', 'page-id', 'root-id'));
    expect(() => serializeProject({ ...project, entryPage: 'missing' })).toThrow(
      ProjectValidationError,
    );
  });
});

describe('serialization', () => {
  it('round-trips deterministically and sorts arbitrary property keys', () => {
    const project = createProject('Project1', idSequence('project-id', 'page-id', 'root-id'));
    const page = project.pages[0];
    expect(page).toBeDefined();
    if (page === undefined) return;
    const first = addComponent(
      page,
      component('button-id', 'WebButton', 'Button1', page.rootComponentId, {
        zeta: 1,
        alpha: 2,
      }),
    );
    const second = addComponent(
      page,
      component('button-id', 'WebButton', 'Button1', page.rootComponentId, {
        alpha: 2,
        zeta: 1,
      }),
    );
    const firstProject = updatePage(project, page.id, () => first);
    const secondProject = updatePage(project, page.id, () => second);
    const serialized = serializeProject(firstProject);

    expect(serialized).toBe(serializeProject(secondProject));
    expect(serialized.endsWith('\n')).toBe(true);
    expect(deserializeProject(serialized)).toEqual(firstProject);
  });

  it('rejects the former Form-shaped version 1 contract', () => {
    const project = createProject('Project1', idSequence('project-id', 'page-id', 'root-id'));
    const page = project.pages[0];
    expect(page).toBeDefined();
    if (page === undefined) return;

    expect(() =>
      deserializeProject(
        JSON.stringify({
          formatVersion: 1,
          id: project.id,
          name: project.name,
          entryForm: project.entryPage,
          forms: [page],
          settings: project.settings,
        }),
      ),
    ).toThrow(ProjectValidationError);

    expect(() =>
      deserializeProjectManifest(
        JSON.stringify({
          formatVersion: 1,
          id: project.id,
          name: project.name,
          entryForm: project.entryPage,
          forms: [
            {
              id: page.id,
              name: page.name,
              formFile: `forms/${page.name}.wrform`,
              generatedFile: `forms/${page.name}.generated.ts`,
              codeFile: `forms/${page.name}.ts`,
            },
          ],
          settings: project.settings,
        }),
      ),
    ).toThrow(ProjectValidationError);

    expect(() =>
      deserializePage(
        JSON.stringify({
          ...page,
          components: page.components.map((component) =>
            component.id === page.rootComponentId ? { ...component, type: 'WebForm' } : component,
          ),
        }),
      ),
    ).toThrow(ProjectValidationError);
  });

  it('rejects unsupported versions and safely reports malformed JSON', () => {
    const project = createProject('Project1', idSequence('project-id', 'page-id', 'root-id'));
    expect(() => deserializeProject(JSON.stringify({ ...project, formatVersion: 0 }))).toThrow(
      UnsupportedFormatVersionError,
    );
    expect(() => deserializeProject(JSON.stringify({ ...project, formatVersion: 99 }))).toThrow(
      FutureFormatVersionError,
    );
    const malformed = safeDeserializeProject('{not json');
    expect(malformed.success).toBe(false);
    if (!malformed.success) expect(malformed.error.message).toContain('Invalid JSON');
  });

  it('creates a portable manifest and reassembles the aggregate', () => {
    const project = createProject('Project1', idSequence('project-id', 'page-id', 'root-id'));
    const manifest = projectToManifest(project);

    expect(manifest.pages[0]).toEqual({
      id: 'page-id',
      name: 'PageMain',
      pageFile: 'pages/PageMain.wrpage',
      generatedFile: 'pages/PageMain.generated.ts',
      codeFile: 'pages/PageMain.ts',
    });
    const serialized = serializeProjectManifest(manifest);
    const parsedManifest = deserializeProjectManifest(serialized);
    expect(assembleProject(parsedManifest, project.pages)).toEqual(project);
  });
});

describe('immutable update helpers', () => {
  it('updates props, bounds, events, and names while retaining the component ID', () => {
    const page = createPage('PageMain', idSequence('page-id', 'root-id'));
    const initial = addComponent(
      page,
      component('button-id', 'WebButton', 'Button1', page.rootComponentId, { caption: 'Button' }),
    );
    const renamed = renameComponent(initial, 'button-id', 'BTNGravar');
    const moved = updateComponentBounds(renamed, 'button-id', { x: 420, y: 300 });
    const captioned = updateComponentProps(moved, 'button-id', { caption: 'Gravar' });
    const bound = bindComponentEvent(captioned, 'button-id', 'OnClick', 'BTNGravarClick');
    const button = bound.components.find((candidate) => candidate.id === 'button-id');

    expect(button).toMatchObject({
      id: 'button-id',
      name: 'BTNGravar',
      bounds: { x: 420, y: 300 },
      props: { caption: 'Gravar' },
      events: { OnClick: 'BTNGravarClick' },
    });
    expect(initial.components.find((candidate) => candidate.id === 'button-id')).toMatchObject({
      name: 'Button1',
      bounds: { x: 8, y: 8 },
      props: { caption: 'Button' },
      events: { OnClick: null },
    });
  });

  it('removes a component subtree without mutating the original page', () => {
    const page = createPage('PageMain', idSequence('page-id', 'root-id'));
    const withPanel = addComponent(
      page,
      component('panel-id', 'WebPanel', 'Panel1', page.rootComponentId),
    );
    const withLabel = addComponent(
      withPanel,
      component('label-id', 'WebLabel', 'Label1', 'panel-id'),
    );
    const removed = removeComponent(withLabel, 'panel-id');

    expect(withLabel.components).toHaveLength(3);
    expect(removed.components.map((candidate) => candidate.id)).toEqual(['root-id']);
    expect(removed.components[0]?.children).toEqual([]);
  });

  it('renames a page and its root without changing either stable ID', () => {
    const project = createProject('Project1', idSequence('project-id', 'page-id', 'root-id'));
    const renamed = renamePage(project, 'page-id', 'PageCustomers');

    expect(renamed.pages[0]).toMatchObject({
      id: 'page-id',
      name: 'PageCustomers',
      rootComponentId: 'root-id',
    });
    expect(renamed.pages[0]?.components[0]).toMatchObject({
      id: 'root-id',
      name: 'PageCustomers',
    });
    expect(() => renamePage(project, 'page-id', 'pagemain')).toThrow('more than case');
  });
});
