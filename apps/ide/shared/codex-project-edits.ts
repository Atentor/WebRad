import {
  componentRegistry,
  resetComponentStyleOverrides,
  resolveInspectorLayoutProperty,
  type ComponentPropertyDefinition,
} from '@webrad/component-registry';
import {
  AddComponentCommand,
  ChangeLayoutPropertyCommand,
  ChangePropertyCommand,
  RemoveComponentCommand,
} from '@webrad/designer';
import {
  applyDefaultComponentStyle,
  bindComponentEvent,
  createComponentStyle,
  menuSourcePath,
  pageClassName,
  parseComponentStyle,
  parseProject,
  projectSourceFilePath,
  COMPONENT_STYLE_PROPERTY_DEFINITIONS,
  type ComponentNode,
  type ComponentStyleModel,
  type PageModel,
  type WebRadProject,
} from '@webrad/project-model';
import { applyAssistantMethods } from '@webrad/language';
import type { CodexPlan, CodexProposal } from './codex-contracts';
import { responsiveLayoutPropertyReference } from './layout-property';
import {
  assertNoCodexPrivatePlaceholder,
  readCodexJsonValue,
  readCodexPropertyValue,
} from './codex-values';

export function codexDocument(
  project: WebRadProject,
  id: string,
): {
  page: PageModel;
  kind: CodexProposal['documentKind'];
  sourcePath: string;
} {
  const page = project.pages.find((item) => item.id === id);
  if (page) return { page, kind: 'page', sourcePath: `pages/${page.name}.ts` };
  const reusable = project.reusableElements.find((item) => item.id === id);
  if (reusable)
    return { page: reusable, kind: 'reusable', sourcePath: `reusables/${reusable.name}.ts` };
  const menu = project.menus?.find((item) => item.id === id);
  if (menu) return { page: menu, kind: 'menu', sourcePath: menuSourcePath(menu) };
  throw new Error('Open a visual document before asking Codex to edit it.');
}

export function replaceCodexDocument(
  project: WebRadProject,
  page: PageModel,
  kind: CodexProposal['documentKind'],
  styles: readonly ComponentStyleModel[],
): WebRadProject {
  const collection = kind === 'page' ? 'pages' : kind === 'menu' ? 'menus' : 'reusableElements';
  return parseProject({
    ...project,
    [collection]: project[collection]?.map((document) =>
      document.id === page.id ? page : document,
    ),
    styles,
  });
}

function checkedValue(
  property: ComponentPropertyDefinition,
  value: unknown,
  props: Readonly<Record<string, unknown>>,
): void {
  if (
    property.readOnly ||
    property.readOnlyWhen?.(props) ||
    property.type === 'designer-action' ||
    property.type === 'page-parameters'
  ) {
    throw new Error(`"${property.name}" is not an editable component property.`);
  }
  if (property.validateValue && !property.validateValue(value)) {
    throw new Error(`Invalid value for "${property.name}".`);
  }
}

export function prepareCodexEdits(
  project: WebRadProject,
  documentId: string,
  sources: Readonly<Record<string, string>>,
  plan: CodexPlan,
): Omit<CodexProposal, 'requestId' | 'baseRevision' | 'diagnostics'> & {
  candidate: WebRadProject;
} {
  const document = codexDocument(project, documentId);
  let page = document.page;
  const styles = [...project.styles];
  const createdStyles: ComponentStyleModel[] = [];
  const changes: string[] = [];
  for (const style of plan.styles) {
    assertNoCodexPrivatePlaceholder(style.name, 'style name');
    const definition = componentRegistry.require(style.componentType);
    if (
      !definition.visual ||
      definition.supportsStyles === false ||
      definition.type === 'WebHtml'
    ) {
      throw new Error(`${style.componentType} does not accept native visual styles.`);
    }
    if (
      styles.some(
        (existing) =>
          existing.name === style.name && existing.componentType === style.componentType,
      )
    ) {
      throw new Error(
        `Style "${style.name}" already exists. Choose a new name or use the existing style.`,
      );
    }
    const base = createComponentStyle(style.name, style.componentType);
    const states = readCodexJsonValue(style.statesJson, `style "${style.name}"`);
    const created = parseComponentStyle({
      ...base,
      states: { ...base.states, ...objectValue(states) },
    });
    for (const [state, properties] of Object.entries(created.states)) {
      for (const name of Object.keys(properties)) {
        const property = COMPONENT_STYLE_PROPERTY_DEFINITIONS.find((item) => item.name === name);
        if (
          !property ||
          (property.componentTypes && !property.componentTypes.includes(created.componentType)) ||
          (property.stateNames && !property.stateNames.some((item) => item === state))
        ) {
          throw new Error(
            `Style property "${name}" is not supported for ${created.componentType} in ${state}.`,
          );
        }
      }
    }
    styles.push(created);
    createdStyles.push(created);
    changes.push(`Create ${style.componentType} style “${style.name}”`);
  }
  const resolve = (name: string): ComponentNode => {
    const node =
      name === '$root'
        ? page.components.find((item) => item.id === page.rootComponentId)
        : page.components.find((item) => item.id === name || item.name === name);
    if (!node) throw new Error(`Component "${name}" was not found.`);
    if (node.type === 'WebHtml')
      throw new Error('Codex cannot author embedded HTML; use the native component catalog.');
    return node;
  };
  const replaceNode = (node: ComponentNode): void => {
    page = {
      ...page,
      components: page.components.map((item) => (item.id === node.id ? node : item)),
    };
  };
  const changeLayout = (
    node: ComponentNode,
    property: ComponentPropertyDefinition,
    value: unknown,
  ): void => {
    const resolved = resolveInspectorLayoutProperty(
      property,
      node,
      page.components.find((item) => item.id === node.parentId)?.layout.container.mode,
    );
    if (resolved.readOnly)
      throw new Error(resolved.description ?? 'This layout property is read-only.');
    const reference = responsiveLayoutPropertyReference(resolved);
    if (!reference) throw new Error('The registered layout property has no persisted field.');
    if (reference.target === 'bounds') {
      replaceNode({ ...node, bounds: { ...node.bounds, [reference.field]: value } });
    } else {
      page = new ChangeLayoutPropertyCommand(
        node.id,
        reference.target,
        reference.field,
        value,
      ).execute(page);
    }
  };
  for (const operation of plan.operations) {
    if (operation.kind === 'add') {
      const definition = componentRegistry.require(operation.componentType);
      if (['WebPage', 'WebHtml'].includes(definition.type))
        throw new Error(`Codex cannot insert ${definition.type}.`);
      const parent = resolve(operation.parent);
      if (!componentRegistry.require(parent.type).canHaveChildren)
        throw new Error(`${parent.name} cannot contain components.`);
      const node = applyDefaultComponentStyle(
        componentRegistry.createComponent(operation.componentType, {
          name: operation.name,
          existingNames: page.components,
          parentId: parent.id,
          x: operation.x,
          y: operation.y,
          width: operation.width,
          height: operation.height,
        }),
        styles,
      );
      page = new AddComponentCommand(node, { parentId: parent.id }).execute(page);
      changes.push(`Add ${definition.displayName} “${node.name}” to ${parent.name}`);
      continue;
    }
    const node = resolve(operation.component);
    const definition = componentRegistry.require(node.type);
    switch (operation.kind) {
      case 'property': {
        const registered = definition.properties.find((item) => item.name === operation.property);
        if (!registered) throw new Error(`${node.type}.${operation.property} is not registered.`);
        const property = resolveInspectorLayoutProperty(
          registered,
          node,
          page.components.find((item) => item.id === node.parentId)?.layout.container.mode,
        );
        const value = readCodexPropertyValue(
          property,
          operation.valueJson,
          `${node.name}.${operation.property}`,
        );
        checkedValue(property, value, node.props);
        const source = property.source ?? 'props';
        if (
          node.id === page.rootComponentId &&
          ['width', 'height', 'caption'].includes(property.name)
        ) {
          if (property.name === 'caption') {
            if (typeof value !== 'string') throw new Error('A document caption must be text.');
            page = { ...page, caption: value };
            replaceNode({ ...node, props: { ...node.props, caption: value } });
          } else {
            if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0)
              throw new Error('Document dimensions must be positive numbers.');
            page = { ...page, [property.name]: value };
            replaceNode({ ...node, bounds: { ...node.bounds, [property.name]: value } });
          }
        } else if (source === 'layout-container' || source === 'layout-item') {
          changeLayout(node, property, value);
        } else if (source === 'bounds') {
          replaceNode({ ...node, bounds: { ...node.bounds, [property.name]: value } });
        } else if (source === 'props') {
          page = new ChangePropertyCommand(node.id, property.name, value).execute(page);
          if (
            property.type === 'color' &&
            ['backgroundColor', 'borderColor', 'color'].includes(property.name)
          ) {
            const previous = node.props.webradPaintOverrides;
            const overrides = Array.isArray(previous)
              ? previous.filter((item): item is string => typeof item === 'string')
              : [];
            page = new ChangePropertyCommand(node.id, 'webradPaintOverrides', [
              ...new Set([...overrides, property.name]),
            ]).execute(page);
          }
        } else {
          throw new Error('Codex cannot change document identities or names.');
        }
        changes.push(`Set ${node.name}.${operation.property}`);
        break;
      }
      case 'layout': {
        const source = operation.section === 'container' ? 'layout-container' : 'layout-item';
        const property = definition.properties.find(
          (item) => item.source === source && item.name === operation.property,
        );
        if (!property)
          throw new Error(
            `${operation.section}.${operation.property} is not registered for ${node.type}.`,
          );
        const value = readCodexPropertyValue(
          property,
          operation.valueJson,
          `${node.name}.${operation.property}`,
        );
        checkedValue(property, value, node.props);
        changeLayout(node, property, value);
        changes.push(`Adjust ${node.name} layout: ${operation.property}`);
        break;
      }
      case 'bounds': {
        for (const coordinate of ['x', 'y', 'width', 'height'] as const) {
          if (operation[coordinate] === node.bounds[coordinate]) continue;
          const property = definition.properties.find(
            (item) => item.source === 'bounds' && item.name === coordinate,
          );
          if (!property) {
            throw new Error(`The active layout controls ${node.name}.${coordinate}.`);
          }
          const resolved = resolveInspectorLayoutProperty(
            property,
            node,
            page.components.find((item) => item.id === node.parentId)?.layout.container.mode,
          );
          checkedValue(resolved, operation[coordinate], node.props);
        }
        replaceNode({
          ...node,
          bounds: {
            x: operation.x,
            y: operation.y,
            width: operation.width,
            height: operation.height,
          },
        });
        if (node.id === page.rootComponentId)
          page = { ...page, width: operation.width, height: operation.height };
        changes.push(`Move or resize ${node.name}`);
        break;
      }
      case 'remove':
        if (node.id === page.rootComponentId)
          throw new Error('Codex cannot remove the document root.');
        page = new RemoveComponentCommand([node.id]).execute(page);
        changes.push(`Remove ${node.name} and its children`);
        break;
      case 'style': {
        const style =
          operation.style === null
            ? undefined
            : styles.find(
                (item) =>
                  (item.id === operation.style || item.name === operation.style) &&
                  item.componentType === node.type,
              );
        if (operation.style !== null && !style)
          throw new Error(`No compatible style “${operation.style}” exists for ${node.type}.`);
        const { styleId: previousStyle, ...unstyled } = node;
        void previousStyle;
        replaceNode({
          ...unstyled,
          props: resetComponentStyleOverrides(node.props),
          ...(style ? { styleId: style.id } : {}),
        });
        changes.push(`Apply ${style?.name ?? 'no style'} to ${node.name}`);
        break;
      }
      case 'event': {
        const events =
          definition.eventsForNode?.(node, {
            document: page,
            reusableElements: project.reusableElements,
          }) ?? definition.events;
        if (!events.some((event) => event.name === operation.event))
          throw new Error(`${node.type}.${operation.event} is not a registered event.`);
        page = bindComponentEvent(page, node.id, operation.event, operation.method);
        changes.push(`Bind ${node.name}.${operation.event} to ${operation.method}`);
        break;
      }
    }
  }
  const sourceBefore = sources[document.sourcePath];
  if (sourceBefore === undefined)
    throw new Error('Save or reopen the document to restore its authored TypeScript source.');
  const allowedTypeImports = new Set([
    `./${page.name}.generated`,
    ...(project.sourceFiles ?? []).map((file) => `../${projectSourceFilePath(file).slice(0, -3)}`),
  ]);
  const sourceAfter = applyAssistantMethods(sourceBefore, pageClassName(page.name), plan.methods, {
    allowedTypeImports,
  });
  if (sourceAfter !== sourceBefore) {
    changes.push(...plan.methods.map((method) => `Write typed method ${method.name}`));
  }
  const candidate = replaceCodexDocument(project, page, document.kind, styles);
  const canonical = codexDocument(candidate, page.id).page;
  if (
    createdStyles.length === 0 &&
    sourceAfter === sourceBefore &&
    JSON.stringify(canonical) === JSON.stringify(document.page)
  ) {
    changes.length = 0;
  }
  return {
    projectId: project.id,
    documentId,
    documentKind: document.kind,
    summary: plan.summary,
    changes,
    plan,
    page: canonical,
    styles: createdStyles,
    sourcePath: document.sourcePath,
    sourceBefore,
    sourceAfter,
    candidate,
  };
}

function objectValue(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Style states must be a JSON object.');
  return Object.fromEntries(Object.entries(value));
}
