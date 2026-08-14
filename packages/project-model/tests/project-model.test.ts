import { describe, expect, it } from 'vitest';

import {
  CURRENT_FORM_FORMAT_VERSION,
  CURRENT_PROJECT_FORMAT_VERSION,
  FutureFormatVersionError,
  ModelUpdateError,
  ProjectValidationError,
  addComponent,
  assembleProject,
  bindComponentEvent,
  createForm,
  createProject,
  createSequentialName,
  deserializeProject,
  deserializeProjectManifest,
  getFormNameError,
  isValidTypeScriptIdentifier,
  projectToManifest,
  removeComponent,
  renameComponent,
  renameForm,
  safeDeserializeProject,
  safeParseForm,
  safeParseProject,
  serializeProject,
  serializeProjectManifest,
  updateComponentBounds,
  updateComponentProps,
  updateForm,
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
  it('creates a complete aggregate with an entry form and WebForm root', () => {
    const project = createProject('CustomerApp', {
      idFactory: idSequence('project-id', 'form-id', 'root-id'),
    });

    expect(project).toMatchObject({
      formatVersion: CURRENT_PROJECT_FORMAT_VERSION,
      id: 'project-id',
      name: 'CustomerApp',
      entryForm: 'form-id',
      settings: {
        gridSize: 8,
        snapToGrid: true,
        showGrid: true,
        outputDirectory: 'dist',
      },
    });
    expect(project.forms).toHaveLength(1);
    expect(project.forms[0]).toMatchObject({
      formatVersion: CURRENT_FORM_FORMAT_VERSION,
      id: 'form-id',
      name: 'FrmMain',
      layoutMode: 'absolute',
      rootComponentId: 'root-id',
    });
    expect(project.forms[0]?.components[0]).toMatchObject({
      id: 'root-id',
      type: 'WebForm',
      name: 'FrmMain',
      parentId: null,
    });
  });

  it('uses crypto UUIDs by default', () => {
    const form = createForm('FrmMain');
    expect(form.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(form.rootComponentId).not.toBe(form.id);
  });

  it('allows portable display names for projects while form names remain identifiers', () => {
    const project = createProject('Customer App', idSequence('project-id', 'form-id', 'root-id'));
    expect(project.name).toBe('Customer App');
    expect(() =>
      createProject('../CustomerApp', idSequence('project-id', 'form-id', 'root-id')),
    ).toThrow('portable');
    expect(() => createForm('Customer Form')).toThrow('TypeScript identifier');
    expect(getFormNameError('CON')).toContain('reserved Windows device');
    expect(() => createForm('CON')).toThrow(ProjectValidationError);
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
    const form = createForm('FrmMain', idSequence('form-id', 'root-id'));
    const withButton = addComponent(
      form,
      component('button-id', 'WebButton', 'Button1', form.rootComponentId),
    );

    expect(validateComponentName('Button1', withButton).valid).toBe(false);
    expect(validateComponentName('Button1', withButton, 'button-id').valid).toBe(true);
    expect(() => renameComponent(withButton, 'button-id', 'FrmMain')).toThrow(ModelUpdateError);
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
    const collisionResult = safeParseForm(collidingDocument);
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
    const form = createForm('FrmMain', idSequence('form-id', 'root-id'));
    const invalid = {
      ...form,
      components: [
        ...form.components,
        component('button-a', 'WebButton', 'Duplicate', form.rootComponentId),
        component('button-b', 'WebButton', 'Duplicate', 'missing-parent'),
      ],
    };
    const result = safeParseForm(invalid);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.message.includes('unique'))).toBe(true);
      expect(result.error.issues.some((issue) => issue.message.includes('Unknown parent'))).toBe(
        true,
      );
    }
  });

  it('rejects components that are disconnected from the form root', () => {
    const form = createForm('FrmMain', idSequence('form-id', 'root-id'));
    const orphan = component('orphan-id', 'WebButton', 'OrphanButton', null);
    const result = safeParseForm({ ...form, components: [...form.components, orphan] });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.message.includes('reachable'))).toBe(true);
    }
  });

  it('rejects non-JSON props, unknown fields, and invalid entry forms', () => {
    const project = createProject('Project1', idSequence('project-id', 'form-id', 'root-id'));
    const root = project.forms[0]?.components[0];
    expect(root).toBeDefined();
    const invalidProps = {
      ...project,
      forms: [
        {
          ...project.forms[0],
          components: [{ ...root, props: { callback: () => undefined } }],
        },
      ],
      extra: true,
    };
    expect(safeParseProject(invalidProps).success).toBe(false);
    expect(safeParseProject({ ...project, entryForm: 'missing' }).success).toBe(false);
  });

  it('rejects form names that collide on case-insensitive portable filesystems', () => {
    const project = createProject('Project1', idSequence('project-id', 'form-id', 'root-id'));
    const collidingForm = createForm('frmmain', idSequence('other-form', 'other-root'));
    const result = safeParseProject({ ...project, forms: [...project.forms, collidingForm] });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.message.includes('portable'))).toBe(true);
    }
  });

  it('throws a useful validation error from strict parsers', () => {
    const project = createProject('Project1', idSequence('project-id', 'form-id', 'root-id'));
    expect(() => serializeProject({ ...project, entryForm: 'missing' })).toThrow(
      ProjectValidationError,
    );
  });
});

describe('serialization and migrations', () => {
  it('round-trips deterministically and sorts arbitrary property keys', () => {
    const project = createProject('Project1', idSequence('project-id', 'form-id', 'root-id'));
    const form = project.forms[0];
    expect(form).toBeDefined();
    if (form === undefined) return;
    const first = addComponent(
      form,
      component('button-id', 'WebButton', 'Button1', form.rootComponentId, {
        zeta: 1,
        alpha: 2,
      }),
    );
    const second = addComponent(
      form,
      component('button-id', 'WebButton', 'Button1', form.rootComponentId, {
        alpha: 2,
        zeta: 1,
      }),
    );
    const firstProject = updateForm(project, form.id, () => first);
    const secondProject = updateForm(project, form.id, () => second);
    const serialized = serializeProject(firstProject);

    expect(serialized).toBe(serializeProject(secondProject));
    expect(serialized.endsWith('\n')).toBe(true);
    expect(deserializeProject(serialized)).toEqual(firstProject);
  });

  it('migrates explicit version zero documents and fills old settings defaults', () => {
    const project = createProject('Project1', idSequence('project-id', 'form-id', 'root-id'));
    const form = project.forms[0];
    expect(form).toBeDefined();
    if (form === undefined) return;
    const legacy = {
      formatVersion: 0,
      id: project.id,
      name: project.name,
      entryForm: project.entryForm,
      forms: [
        {
          id: form.id,
          name: form.name,
          caption: form.caption,
          width: form.width,
          height: form.height,
          components: form.components,
          rootComponentId: form.rootComponentId,
        },
      ],
      settings: { gridSize: 16 },
    };

    const migrated = deserializeProject(JSON.stringify(legacy));
    expect(migrated.formatVersion).toBe(1);
    expect(migrated.forms[0]?.formatVersion).toBe(1);
    expect(migrated.forms[0]?.layoutMode).toBe('absolute');
    expect(migrated.settings).toEqual({
      gridSize: 16,
      snapToGrid: true,
      showGrid: true,
      outputDirectory: 'dist',
    });
  });

  it('rejects future versions and safely reports malformed JSON', () => {
    const project = createProject('Project1', idSequence('project-id', 'form-id', 'root-id'));
    expect(() => deserializeProject(JSON.stringify({ ...project, formatVersion: 99 }))).toThrow(
      FutureFormatVersionError,
    );
    const malformed = safeDeserializeProject('{not json');
    expect(malformed.success).toBe(false);
    if (!malformed.success) expect(malformed.error.message).toContain('Invalid JSON');
  });

  it('creates a portable manifest and reassembles the aggregate', () => {
    const project = createProject('Project1', idSequence('project-id', 'form-id', 'root-id'));
    const manifest = projectToManifest(project);

    expect(manifest.forms[0]).toEqual({
      id: 'form-id',
      name: 'FrmMain',
      formFile: 'forms/FrmMain.wrform',
      generatedFile: 'forms/FrmMain.generated.ts',
      codeFile: 'forms/FrmMain.ts',
    });
    const serialized = serializeProjectManifest(manifest);
    const parsedManifest = deserializeProjectManifest(serialized);
    expect(assembleProject(parsedManifest, project.forms)).toEqual(project);
  });
});

describe('immutable update helpers', () => {
  it('updates props, bounds, events, and names while retaining the component ID', () => {
    const form = createForm('FrmMain', idSequence('form-id', 'root-id'));
    const initial = addComponent(
      form,
      component('button-id', 'WebButton', 'Button1', form.rootComponentId, { caption: 'Button' }),
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

  it('removes a component subtree without mutating the original form', () => {
    const form = createForm('FrmMain', idSequence('form-id', 'root-id'));
    const withPanel = addComponent(
      form,
      component('panel-id', 'WebPanel', 'Panel1', form.rootComponentId),
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

  it('renames a form and its root without changing either stable ID', () => {
    const project = createProject('Project1', idSequence('project-id', 'form-id', 'root-id'));
    const renamed = renameForm(project, 'form-id', 'FrmCustomers');

    expect(renamed.forms[0]).toMatchObject({
      id: 'form-id',
      name: 'FrmCustomers',
      rootComponentId: 'root-id',
    });
    expect(renamed.forms[0]?.components[0]).toMatchObject({
      id: 'root-id',
      name: 'FrmCustomers',
    });
    expect(() => renameForm(project, 'form-id', 'frmmain')).toThrow('more than case');
  });
});
