import { ModelUpdateError, ProjectModelError } from './errors.js';
import { assertValidProjectName, assertValidTypeScriptIdentifier } from './naming.js';
import { parseForm, parseProject, parseProjectManifest } from './schemas.js';
import {
  CURRENT_FORM_FORMAT_VERSION,
  CURRENT_PROJECT_FORMAT_VERSION,
  DEFAULT_FORM_HEIGHT,
  DEFAULT_FORM_WIDTH,
  DEFAULT_PROJECT_SETTINGS,
  type ComponentNode,
  type FormDescriptor,
  type FormModel,
  type IdFactory,
  type LayoutMode,
  type ProjectManifest,
  type ProjectSettings,
  type WebRadProject,
} from './types.js';

export const defaultIdFactory: IdFactory = () => {
  if (typeof globalThis.crypto?.randomUUID !== 'function') {
    throw new ProjectModelError('crypto.randomUUID() is required to create stable model IDs.');
  }
  return globalThis.crypto.randomUUID();
};

function resolveFactory(
  options: { readonly idFactory?: IdFactory } | IdFactory | undefined,
): IdFactory {
  return typeof options === 'function' ? options : (options?.idFactory ?? defaultIdFactory);
}

export interface CreateDefaultRootOptions {
  readonly idFactory?: IdFactory;
  readonly caption?: string;
  readonly width?: number;
  readonly height?: number;
}

export function createDefaultRoot(
  name: string,
  options: CreateDefaultRootOptions | IdFactory = {},
): ComponentNode {
  assertValidTypeScriptIdentifier(name);
  const width =
    typeof options === 'function' ? DEFAULT_FORM_WIDTH : (options.width ?? DEFAULT_FORM_WIDTH);
  const height =
    typeof options === 'function' ? DEFAULT_FORM_HEIGHT : (options.height ?? DEFAULT_FORM_HEIGHT);
  const caption = typeof options === 'function' ? name : (options.caption ?? name);

  return {
    id: resolveFactory(options)(),
    type: 'WebForm',
    name,
    parentId: null,
    bounds: { x: 0, y: 0, width, height },
    props: {
      caption,
      visible: true,
      enabled: true,
      backgroundColor: '#ffffff',
    },
    events: {
      OnCreate: null,
      OnShow: null,
      OnHide: null,
      OnResize: null,
    },
    children: [],
  };
}

export interface CreateFormOptions extends CreateDefaultRootOptions {
  readonly layoutMode?: LayoutMode;
}

export function createForm(
  name = 'FrmMain',
  options: CreateFormOptions | IdFactory = {},
): FormModel {
  assertValidTypeScriptIdentifier(name);
  const idFactory = resolveFactory(options);
  const width =
    typeof options === 'function' ? DEFAULT_FORM_WIDTH : (options.width ?? DEFAULT_FORM_WIDTH);
  const height =
    typeof options === 'function' ? DEFAULT_FORM_HEIGHT : (options.height ?? DEFAULT_FORM_HEIGHT);
  const caption = typeof options === 'function' ? name : (options.caption ?? name);
  const layoutMode =
    typeof options === 'function' ? 'absolute' : (options.layoutMode ?? 'absolute');
  const formId = idFactory();
  const root = createDefaultRoot(name, { idFactory, caption, width, height });

  return parseForm({
    formatVersion: CURRENT_FORM_FORMAT_VERSION,
    id: formId,
    name,
    caption,
    width,
    height,
    layoutMode,
    components: [root],
    rootComponentId: root.id,
  });
}

export interface CreateProjectOptions {
  readonly idFactory?: IdFactory;
  readonly formName?: string;
  readonly formCaption?: string;
  readonly formWidth?: number;
  readonly formHeight?: number;
  readonly settings?: Partial<ProjectSettings>;
}

export function createProject(
  name = 'Project1',
  options: CreateProjectOptions | IdFactory = {},
): WebRadProject {
  assertValidProjectName(name);
  const idFactory = resolveFactory(options);
  const projectId = idFactory();
  const form = createForm(
    typeof options === 'function' ? 'FrmMain' : (options.formName ?? 'FrmMain'),
    {
      idFactory,
      caption: typeof options === 'function' ? undefined : options.formCaption,
      width: typeof options === 'function' ? undefined : options.formWidth,
      height: typeof options === 'function' ? undefined : options.formHeight,
    },
  );
  const settings = {
    ...DEFAULT_PROJECT_SETTINGS,
    ...(typeof options === 'function' ? {} : options.settings),
  };

  return parseProject({
    formatVersion: CURRENT_PROJECT_FORMAT_VERSION,
    id: projectId,
    name,
    entryForm: form.id,
    forms: [form],
    settings,
  });
}

export function createFormDescriptor(form: FormModel): FormDescriptor {
  const parsed = parseForm(form);
  const basePath = `forms/${parsed.name}`;
  return {
    id: parsed.id,
    name: parsed.name,
    formFile: `${basePath}.wrform`,
    generatedFile: `${basePath}.generated.ts`,
    codeFile: `${basePath}.ts`,
  };
}

export function projectToManifest(project: WebRadProject): ProjectManifest {
  const parsed = parseProject(project);
  return parseProjectManifest({
    formatVersion: parsed.formatVersion,
    id: parsed.id,
    name: parsed.name,
    entryForm: parsed.entryForm,
    forms: parsed.forms.map(createFormDescriptor),
    settings: parsed.settings,
  });
}

/** Reassembles the in-memory source-of-truth aggregate from a manifest and form files. */
export function assembleProject(
  manifestInput: ProjectManifest,
  formDocuments: Iterable<FormModel>,
): WebRadProject {
  const manifest = parseProjectManifest(manifestInput);
  const formsById = new Map<string, FormModel>();

  for (const input of formDocuments) {
    const form = parseForm(input);
    if (formsById.has(form.id)) {
      throw new ModelUpdateError(`Form ID "${form.id}" was supplied more than once.`);
    }
    formsById.set(form.id, form);
  }

  const forms = manifest.forms.map((descriptor) => {
    const form = formsById.get(descriptor.id);
    if (form === undefined) {
      throw new ModelUpdateError(`Missing form document for descriptor "${descriptor.name}".`);
    }
    if (form.name !== descriptor.name) {
      throw new ModelUpdateError(
        `Form descriptor name "${descriptor.name}" does not match document name "${form.name}".`,
      );
    }
    formsById.delete(descriptor.id);
    return form;
  });

  if (formsById.size > 0) {
    throw new ModelUpdateError(
      'One or more form documents are not listed in the project manifest.',
    );
  }

  return parseProject({
    formatVersion: manifest.formatVersion,
    id: manifest.id,
    name: manifest.name,
    entryForm: manifest.entryForm,
    forms,
    settings: manifest.settings,
  });
}

export const createWebRadProject = createProject;
export const createFormModel = createForm;
export const toProjectManifest = projectToManifest;
