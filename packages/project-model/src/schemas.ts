import { z } from 'zod';

import { ProjectValidationError } from './errors.js';
import {
  getPageNameError,
  getGeneratedPageMemberNameError,
  getProjectNameError,
  getTypeScriptIdentifierError,
  portableFileNameKey,
} from './naming.js';
import {
  CURRENT_PAGE_FORMAT_VERSION,
  CURRENT_PROJECT_FORMAT_VERSION,
  type Bounds,
  type ComponentNode,
  type ComponentStyleClasses,
  type ComponentStyleModel,
  type PageDescriptor,
  type PageModel,
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

const pageNameSchema = z.string().superRefine((value, context) => {
  const error = getPageNameError(value);
  if (error !== undefined) context.addIssue({ code: 'custom', message: error });
});

const componentStyleNameSchema = nonEmptyStringSchema.refine(
  (value) => value === value.trim(),
  'Style names cannot start or end with whitespace.',
);

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
    styleId: nonEmptyStringSchema.optional(),
    children: z.array(nonEmptyStringSchema),
  })
  .strict();

export const ComponentStyleClassesSchema: z.ZodType<ComponentStyleClasses> = z
  .object({
    base: z.string(),
    hover: z.string(),
    focus: z.string(),
    active: z.string(),
    disabled: z.string(),
    animation: z.string(),
    advanced: z.string(),
  })
  .strict();

export const ComponentStyleSchema: z.ZodType<ComponentStyleModel> = z
  .object({
    id: nonEmptyStringSchema,
    name: componentStyleNameSchema,
    componentType: identifierSchema,
    classes: ComponentStyleClassesSchema,
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

function validatePageRelationships(page: PageModel, context: z.RefinementCtx): void {
  const byId = new Map<string, ComponentNode>();
  const names = new Map<string, number>();

  page.components.forEach((component, index) => {
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
        message: `Component name "${component.name}" must be unique within a page.`,
        path: ['components', index, 'name'],
      });
    } else {
      names.set(component.name, index);
    }

    if (component.id !== page.rootComponentId) {
      const memberNameError = getGeneratedPageMemberNameError(component.name);
      if (memberNameError !== undefined) {
        context.addIssue({
          code: 'custom',
          message: memberNameError,
          path: ['components', index, 'name'],
        });
      }
    }
  });

  const root = byId.get(page.rootComponentId);
  if (root === undefined) {
    context.addIssue({
      code: 'custom',
      message: 'rootComponentId must reference a component in this page.',
      path: ['rootComponentId'],
    });
  } else {
    if (root.parentId !== null) {
      context.addIssue({
        code: 'custom',
        message: 'The root component cannot have a parent.',
        path: ['components', page.components.indexOf(root), 'parentId'],
      });
    }
    if (root.type !== 'WebPage') {
      context.addIssue({
        code: 'custom',
        message: 'The root component must have type WebPage.',
        path: ['components', page.components.indexOf(root), 'type'],
      });
    }
  }

  page.components.forEach((component, componentIndex) => {
    if (component.id !== page.rootComponentId && component.parentId === null) {
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
    page.components.forEach((component, componentIndex) => {
      if (!reachable.has(component.id)) {
        context.addIssue({
          code: 'custom',
          message: 'Every component must be reachable from the page root.',
          path: ['components', componentIndex],
        });
      }
    });
  }
}

export const PageModelSchema: z.ZodType<PageModel> = z
  .object({
    formatVersion: z.literal(CURRENT_PAGE_FORMAT_VERSION),
    id: nonEmptyStringSchema,
    name: pageNameSchema,
    caption: z.string(),
    width: positiveDimensionSchema,
    height: positiveDimensionSchema,
    layoutMode: z.enum(['absolute', 'flex', 'grid']),
    components: z.array(ComponentNodeSchema).min(1),
    rootComponentId: nonEmptyStringSchema,
  })
  .strict()
  .superRefine(validatePageRelationships);

function indexComponentStyles(
  styles: readonly ComponentStyleModel[],
  context: z.RefinementCtx,
): ReadonlyMap<string, ComponentStyleModel> {
  const byId = new Map<string, ComponentStyleModel>();
  const names = new Set<string>();

  styles.forEach((style, index) => {
    if (byId.has(style.id)) {
      context.addIssue({
        code: 'custom',
        message: `Duplicate component style ID "${style.id}".`,
        path: ['styles', index, 'id'],
      });
    } else {
      byId.set(style.id, style);
    }

    const nameKey = portableFileNameKey(style.name);
    if (names.has(nameKey)) {
      context.addIssue({
        code: 'custom',
        message: `Component style name "${style.name}" must be unique within a project.`,
        path: ['styles', index, 'name'],
      });
    }
    names.add(nameKey);
  });

  return byId;
}

function validateProjectRelationships(project: WebRadProject, context: z.RefinementCtx): void {
  const ids = new Set<string>();
  const names = new Set<string>();
  const stylesById = indexComponentStyles(project.styles, context);

  project.pages.forEach((page, index) => {
    if (ids.has(page.id)) {
      context.addIssue({
        code: 'custom',
        message: `Duplicate page ID "${page.id}".`,
        path: ['pages', index, 'id'],
      });
    }
    ids.add(page.id);

    const nameKey = portableFileNameKey(page.name);
    if (names.has(nameKey)) {
      context.addIssue({
        code: 'custom',
        message: `Page name "${page.name}" must be unique within a project on portable filesystems.`,
        path: ['pages', index, 'name'],
      });
    }
    names.add(nameKey);

    page.components.forEach((component, componentIndex) => {
      if (component.styleId === undefined) return;
      const style = stylesById.get(component.styleId);
      if (style === undefined) {
        context.addIssue({
          code: 'custom',
          message: `Unknown component style ID "${component.styleId}".`,
          path: ['pages', index, 'components', componentIndex, 'styleId'],
        });
      } else if (style.componentType !== component.type) {
        context.addIssue({
          code: 'custom',
          message: `Component style "${style.name}" targets ${style.componentType}, not ${component.type}.`,
          path: ['pages', index, 'components', componentIndex, 'styleId'],
        });
      }
    });
  });

  if (!ids.has(project.entryPage)) {
    context.addIssue({
      code: 'custom',
      message: 'entryPage must reference a page in this project.',
      path: ['entryPage'],
    });
  }
}

export const WebRadProjectSchema: z.ZodType<WebRadProject> = z
  .object({
    formatVersion: z.literal(CURRENT_PROJECT_FORMAT_VERSION),
    id: nonEmptyStringSchema,
    name: projectNameSchema,
    entryPage: nonEmptyStringSchema,
    pages: z.array(PageModelSchema).min(1),
    styles: z.array(ComponentStyleSchema),
    settings: ProjectSettingsSchema,
  })
  .strict()
  .superRefine(validateProjectRelationships);

export const PageDescriptorSchema: z.ZodType<PageDescriptor> = z
  .object({
    id: nonEmptyStringSchema,
    name: pageNameSchema,
    pageFile: relativeProjectPathSchema,
    generatedFile: relativeProjectPathSchema,
    codeFile: relativeProjectPathSchema,
  })
  .strict();

export const ProjectManifestSchema: z.ZodType<ProjectManifest> = z
  .object({
    formatVersion: z.literal(CURRENT_PROJECT_FORMAT_VERSION),
    id: nonEmptyStringSchema,
    name: projectNameSchema,
    entryPage: nonEmptyStringSchema,
    pages: z.array(PageDescriptorSchema).min(1),
    styles: z.array(ComponentStyleSchema),
    settings: ProjectSettingsSchema,
  })
  .strict()
  .superRefine((manifest, context) => {
    indexComponentStyles(manifest.styles, context);
    const ids = new Set<string>();
    const names = new Set<string>();
    const paths = new Set<string>();

    manifest.pages.forEach((descriptor, index) => {
      if (ids.has(descriptor.id)) {
        context.addIssue({
          code: 'custom',
          message: `Duplicate page ID "${descriptor.id}".`,
          path: ['pages', index, 'id'],
        });
      }
      ids.add(descriptor.id);

      const nameKey = portableFileNameKey(descriptor.name);
      if (names.has(nameKey)) {
        context.addIssue({
          code: 'custom',
          message: `Duplicate page name "${descriptor.name}".`,
          path: ['pages', index, 'name'],
        });
      }
      names.add(nameKey);

      for (const key of ['pageFile', 'generatedFile', 'codeFile'] as const) {
        const filePath = descriptor[key];
        const pathKey = portableFileNameKey(filePath);
        if (paths.has(pathKey)) {
          context.addIssue({
            code: 'custom',
            message: `Project file path "${filePath}" is used more than once.`,
            path: ['pages', index, key],
          });
        }
        paths.add(pathKey);
      }
    });

    if (!ids.has(manifest.entryPage)) {
      context.addIssue({
        code: 'custom',
        message: 'entryPage must reference a page descriptor.',
        path: ['entryPage'],
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

export function safeParseComponentStyle(
  input: unknown,
): ReturnType<typeof ComponentStyleSchema.safeParse> {
  return ComponentStyleSchema.safeParse(input);
}

export function safeParsePage(input: unknown): ReturnType<typeof PageModelSchema.safeParse> {
  return PageModelSchema.safeParse(input);
}

export function safeParseProject(input: unknown): ReturnType<typeof WebRadProjectSchema.safeParse> {
  return WebRadProjectSchema.safeParse(input);
}

export function safeParseProjectManifest(
  input: unknown,
): ReturnType<typeof ProjectManifestSchema.safeParse> {
  return ProjectManifestSchema.safeParse(input);
}

export const validatePage = safeParsePage;
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

export function parseComponentStyle(input: unknown): ComponentStyleModel {
  const result = safeParseComponentStyle(input);
  if (!result.success) throw issuesFrom(result.error);
  return result.data;
}

export function parsePage(input: unknown): PageModel {
  const result = safeParsePage(input);
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
export const componentStyleClassesSchema = ComponentStyleClassesSchema;
export const componentStyleSchema = ComponentStyleSchema;
export const pageModelSchema = PageModelSchema;
export const projectSettingsSchema = ProjectSettingsSchema;
export const webRadProjectSchema = WebRadProjectSchema;
export const pageDescriptorSchema = PageDescriptorSchema;
export const projectManifestSchema = ProjectManifestSchema;
