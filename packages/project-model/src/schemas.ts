import { z } from 'zod';

import { ProjectValidationError } from './errors.js';
import {
  getFormNameError,
  getGeneratedFormMemberNameError,
  getProjectNameError,
  getTypeScriptIdentifierError,
  portableFileNameKey,
} from './naming.js';
import {
  CURRENT_FORM_FORMAT_VERSION,
  CURRENT_PROJECT_FORMAT_VERSION,
  type Bounds,
  type ComponentNode,
  type FormDescriptor,
  type FormModel,
  type ProjectManifest,
  type ProjectSettings,
  type WebRadProject,
} from './types.js';

const nonEmptyStringSchema = z.string().refine((value) => value.trim().length > 0, {
  message: 'Must not be empty.',
});

const identifierSchema = z.string().superRefine((value, context) => {
  const error = getTypeScriptIdentifierError(value);
  if (error !== undefined) {
    context.addIssue({ code: 'custom', message: error });
  }
});

const projectNameSchema = z.string().superRefine((value, context) => {
  const error = getProjectNameError(value);
  if (error !== undefined) context.addIssue({ code: 'custom', message: error });
});

const formNameSchema = z.string().superRefine((value, context) => {
  const error = getFormNameError(value);
  if (error !== undefined) context.addIssue({ code: 'custom', message: error });
});

const finiteCoordinateSchema = z.number().finite();
const positiveDimensionSchema = z.number().finite().positive();
const relativeProjectPathSchema = z
  .string()
  .min(1)
  .refine((value) => !value.includes('\\'), 'Persisted paths must use forward slashes.')
  .refine(
    (value) =>
      !value.startsWith('/') &&
      !/^[A-Za-z]:/.test(value) &&
      value.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..'),
    'Expected a normalized relative project path.',
  );

export const BoundsSchema: z.ZodType<Bounds> = z
  .object({
    x: finiteCoordinateSchema,
    y: finiteCoordinateSchema,
    width: positiveDimensionSchema,
    height: positiveDimensionSchema,
  })
  .strict();

export const ComponentNodeSchema: z.ZodType<ComponentNode> = z
  .object({
    id: nonEmptyStringSchema,
    type: identifierSchema,
    name: identifierSchema,
    parentId: nonEmptyStringSchema.nullable(),
    bounds: BoundsSchema,
    props: z.record(z.string(), z.json()),
    events: z.record(z.string(), z.string().min(1).nullable()),
    children: z.array(nonEmptyStringSchema),
  })
  .strict();

export const ProjectSettingsSchema: z.ZodType<ProjectSettings> = z
  .object({
    gridSize: z.number().int().positive(),
    snapToGrid: z.boolean(),
    showGrid: z.boolean(),
    outputDirectory: relativeProjectPathSchema,
  })
  .strict();

function validateFormRelationships(form: FormModel, context: z.RefinementCtx): void {
  const byId = new Map<string, ComponentNode>();
  const names = new Map<string, number>();

  form.components.forEach((component, index) => {
    const previousIdIndex = byId.has(component.id);
    if (previousIdIndex) {
      context.addIssue({
        code: 'custom',
        message: `Duplicate component ID "${component.id}".`,
        path: ['components', index, 'id'],
      });
    } else {
      byId.set(component.id, component);
    }

    const previousNameIndex = names.get(component.name);
    if (previousNameIndex !== undefined) {
      context.addIssue({
        code: 'custom',
        message: `Component name "${component.name}" must be unique within a form.`,
        path: ['components', index, 'name'],
      });
    } else {
      names.set(component.name, index);
    }

    if (component.id !== form.rootComponentId) {
      const memberNameError = getGeneratedFormMemberNameError(component.name);
      if (memberNameError !== undefined) {
        context.addIssue({
          code: 'custom',
          message: memberNameError,
          path: ['components', index, 'name'],
        });
      }
    }
  });

  const root = byId.get(form.rootComponentId);
  if (root === undefined) {
    context.addIssue({
      code: 'custom',
      message: 'rootComponentId must reference a component in this form.',
      path: ['rootComponentId'],
    });
  } else {
    if (root.parentId !== null) {
      context.addIssue({
        code: 'custom',
        message: 'The root component cannot have a parent.',
        path: ['components', form.components.indexOf(root), 'parentId'],
      });
    }
    if (root.type !== 'WebForm') {
      context.addIssue({
        code: 'custom',
        message: 'The root component must have type WebForm.',
        path: ['components', form.components.indexOf(root), 'type'],
      });
    }
  }

  form.components.forEach((component, componentIndex) => {
    if (component.id !== form.rootComponentId && component.parentId === null) {
      context.addIssue({
        code: 'custom',
        message: 'Every non-root component must have a parent.',
        path: ['components', componentIndex, 'parentId'],
      });
    }
    if (component.parentId !== null) {
      const parent = byId.get(component.parentId);
      if (parent === undefined) {
        context.addIssue({
          code: 'custom',
          message: `Unknown parent component ID "${component.parentId}".`,
          path: ['components', componentIndex, 'parentId'],
        });
      } else if (!parent.children.includes(component.id)) {
        context.addIssue({
          code: 'custom',
          message: 'The parent children list must contain this component ID.',
          path: ['components', componentIndex, 'parentId'],
        });
      }
    }

    const childIds = new Set<string>();
    component.children.forEach((childId, childIndex) => {
      if (childIds.has(childId)) {
        context.addIssue({
          code: 'custom',
          message: `Child ID "${childId}" is listed more than once.`,
          path: ['components', componentIndex, 'children', childIndex],
        });
        return;
      }
      childIds.add(childId);

      const child = byId.get(childId);
      if (child === undefined) {
        context.addIssue({
          code: 'custom',
          message: `Unknown child component ID "${childId}".`,
          path: ['components', componentIndex, 'children', childIndex],
        });
      } else if (child.parentId !== component.id) {
        context.addIssue({
          code: 'custom',
          message: 'A child parentId must point back to the owning component.',
          path: ['components', componentIndex, 'children', childIndex],
        });
      }
    });

    const ancestors = new Set<string>([component.id]);
    let parentId = component.parentId;
    while (parentId !== null) {
      if (ancestors.has(parentId)) {
        context.addIssue({
          code: 'custom',
          message: 'Component parent relationships cannot contain a cycle.',
          path: ['components', componentIndex, 'parentId'],
        });
        break;
      }
      ancestors.add(parentId);
      parentId = byId.get(parentId)?.parentId ?? null;
    }
  });

  if (root !== undefined) {
    const reachable = new Set<string>();
    const pending = [root.id];
    while (pending.length > 0) {
      const componentId = pending.pop();
      if (componentId === undefined || reachable.has(componentId)) continue;
      reachable.add(componentId);
      const current = byId.get(componentId);
      if (current !== undefined) pending.push(...current.children);
    }
    form.components.forEach((component, componentIndex) => {
      if (!reachable.has(component.id)) {
        context.addIssue({
          code: 'custom',
          message: 'Every component must be reachable from the form root.',
          path: ['components', componentIndex],
        });
      }
    });
  }
}

export const FormModelSchema: z.ZodType<FormModel> = z
  .object({
    formatVersion: z.literal(CURRENT_FORM_FORMAT_VERSION),
    id: nonEmptyStringSchema,
    name: formNameSchema,
    caption: z.string(),
    width: positiveDimensionSchema,
    height: positiveDimensionSchema,
    layoutMode: z.enum(['absolute', 'flex', 'grid']),
    components: z.array(ComponentNodeSchema).min(1),
    rootComponentId: nonEmptyStringSchema,
  })
  .strict()
  .superRefine(validateFormRelationships);

function validateProjectRelationships(project: WebRadProject, context: z.RefinementCtx): void {
  const ids = new Set<string>();
  const names = new Set<string>();

  project.forms.forEach((form, index) => {
    if (ids.has(form.id)) {
      context.addIssue({
        code: 'custom',
        message: `Duplicate form ID "${form.id}".`,
        path: ['forms', index, 'id'],
      });
    }
    ids.add(form.id);

    const nameKey = portableFileNameKey(form.name);
    if (names.has(nameKey)) {
      context.addIssue({
        code: 'custom',
        message: `Form name "${form.name}" must be unique within a project on portable filesystems.`,
        path: ['forms', index, 'name'],
      });
    }
    names.add(nameKey);
  });

  if (!ids.has(project.entryForm)) {
    context.addIssue({
      code: 'custom',
      message: 'entryForm must reference a form in this project.',
      path: ['entryForm'],
    });
  }
}

export const WebRadProjectSchema: z.ZodType<WebRadProject> = z
  .object({
    formatVersion: z.literal(CURRENT_PROJECT_FORMAT_VERSION),
    id: nonEmptyStringSchema,
    name: projectNameSchema,
    entryForm: nonEmptyStringSchema,
    forms: z.array(FormModelSchema).min(1),
    settings: ProjectSettingsSchema,
  })
  .strict()
  .superRefine(validateProjectRelationships);

export const FormDescriptorSchema: z.ZodType<FormDescriptor> = z
  .object({
    id: nonEmptyStringSchema,
    name: formNameSchema,
    formFile: relativeProjectPathSchema,
    generatedFile: relativeProjectPathSchema,
    codeFile: relativeProjectPathSchema,
  })
  .strict();

export const ProjectManifestSchema: z.ZodType<ProjectManifest> = z
  .object({
    formatVersion: z.literal(CURRENT_PROJECT_FORMAT_VERSION),
    id: nonEmptyStringSchema,
    name: projectNameSchema,
    entryForm: nonEmptyStringSchema,
    forms: z.array(FormDescriptorSchema).min(1),
    settings: ProjectSettingsSchema,
  })
  .strict()
  .superRefine((manifest, context) => {
    const ids = new Set<string>();
    const names = new Set<string>();
    const paths = new Set<string>();

    manifest.forms.forEach((descriptor, index) => {
      if (ids.has(descriptor.id)) {
        context.addIssue({
          code: 'custom',
          message: `Duplicate form ID "${descriptor.id}".`,
          path: ['forms', index, 'id'],
        });
      }
      ids.add(descriptor.id);

      const nameKey = portableFileNameKey(descriptor.name);
      if (names.has(nameKey)) {
        context.addIssue({
          code: 'custom',
          message: `Duplicate form name "${descriptor.name}".`,
          path: ['forms', index, 'name'],
        });
      }
      names.add(nameKey);

      for (const key of ['formFile', 'generatedFile', 'codeFile'] as const) {
        const filePath = descriptor[key];
        const pathKey = portableFileNameKey(filePath);
        if (paths.has(pathKey)) {
          context.addIssue({
            code: 'custom',
            message: `Project file path "${filePath}" is used more than once.`,
            path: ['forms', index, key],
          });
        }
        paths.add(pathKey);
      }
    });

    if (!ids.has(manifest.entryForm)) {
      context.addIssue({
        code: 'custom',
        message: 'entryForm must reference a form descriptor.',
        path: ['entryForm'],
      });
    }
  });

function issuesFrom(error: z.ZodError): ProjectValidationError {
  return new ProjectValidationError(
    'The WebRAD model failed validation.',
    error.issues.map((issue) => ({
      code: issue.code,
      message: issue.message,
      path: issue.path,
    })),
  );
}

export function safeParseBounds(input: unknown): ReturnType<typeof BoundsSchema.safeParse> {
  return BoundsSchema.safeParse(input);
}

export function safeParseComponentNode(
  input: unknown,
): ReturnType<typeof ComponentNodeSchema.safeParse> {
  return ComponentNodeSchema.safeParse(input);
}

export function safeParseForm(input: unknown): ReturnType<typeof FormModelSchema.safeParse> {
  return FormModelSchema.safeParse(input);
}

export function safeParseProject(input: unknown): ReturnType<typeof WebRadProjectSchema.safeParse> {
  return WebRadProjectSchema.safeParse(input);
}

export function safeParseProjectManifest(
  input: unknown,
): ReturnType<typeof ProjectManifestSchema.safeParse> {
  return ProjectManifestSchema.safeParse(input);
}

export const validateForm = safeParseForm;
export const validateProject = safeParseProject;
export const validateProjectManifest = safeParseProjectManifest;

export function parseBounds(input: unknown): Bounds {
  const result = safeParseBounds(input);
  if (!result.success) throw issuesFrom(result.error);
  return result.data;
}

export function parseComponentNode(input: unknown): ComponentNode {
  const result = safeParseComponentNode(input);
  if (!result.success) throw issuesFrom(result.error);
  return result.data;
}

export function parseForm(input: unknown): FormModel {
  const result = safeParseForm(input);
  if (!result.success) throw issuesFrom(result.error);
  return result.data;
}

export function parseProject(input: unknown): WebRadProject {
  const result = safeParseProject(input);
  if (!result.success) throw issuesFrom(result.error);
  return result.data;
}

export function parseProjectManifest(input: unknown): ProjectManifest {
  const result = safeParseProjectManifest(input);
  if (!result.success) throw issuesFrom(result.error);
  return result.data;
}

// Lowercase aliases keep schema imports ergonomic without weakening the canonical names.
export const boundsSchema = BoundsSchema;
export const componentNodeSchema = ComponentNodeSchema;
export const formModelSchema = FormModelSchema;
export const projectSettingsSchema = ProjectSettingsSchema;
export const webRadProjectSchema = WebRadProjectSchema;
export const formDescriptorSchema = FormDescriptorSchema;
export const projectManifestSchema = ProjectManifestSchema;
