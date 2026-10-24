import type { WebRadIconName } from '@webrad/runtime/icons';
import {
  applyDefaultComponentStyle,
  createDefaultComponentLayout,
  type ComponentLayout,
  type ComponentNode,
  type ComponentStyleModel,
  type PageModel,
} from '@webrad/project-model';
import { defaultComponentRegistry } from '../mvp-components.js';

export interface DemoNode {
  readonly type: string;
  readonly name: string;
  readonly id?: string;
  readonly width?: number;
  readonly height?: number;
  readonly props?: Readonly<Record<string, unknown>>;
  readonly events?: Readonly<Record<string, string>>;
  readonly container?: Partial<ComponentLayout['container']>;
  readonly item?: Partial<ComponentLayout['item']>;
  readonly children?: readonly DemoNode[];
}

/** Compose ordinary registered nodes, binding only the protected default style library. */
export function composeDemoDocument(
  document: PageModel,
  styles: readonly ComponentStyleModel[],
  children: readonly DemoNode[],
  rootContainer: Partial<ComponentLayout['container']> = {},
  rootEvents: Readonly<Record<string, string>> = {},
): PageModel {
  const root = document.components.find((node) => node.id === document.rootComponentId);
  if (!root) throw new Error('Demo document has no root.');
  const components: ComponentNode[] = [];
  const add = (spec: DemoNode, parentId: string): string => {
    const definition = defaultComponentRegistry.require(spec.type);
    const node = defaultComponentRegistry.createComponent(spec.type, {
      id: spec.id,
      name: spec.name,
      parentId,
      existingNames: [root, ...components],
      width: spec.width,
      height: spec.height,
      props: spec.props,
      events: spec.events,
    });
    const index = components.length;
    components.push(node);
    const childIds = (spec.children ?? []).map((child) => add(child, node.id));
    components[index] = applyDefaultComponentStyle(
      {
        ...node,
        children: childIds,
        layout: {
          container: definition.canHaveChildren
            ? { ...node.layout.container, mode: 'column', gap: 12, ...spec.container }
            : node.layout.container,
          item: {
            ...node.layout.item,
            width: 'stretch',
            height: 'fixed',
            shrink: false,
            ...spec.item,
          },
        },
      },
      styles,
    );
    return node.id;
  };
  const childIds = children.map((spec) => add(spec, root.id));
  const layout = createDefaultComponentLayout();
  return {
    ...document,
    components: [
      applyDefaultComponentStyle(
        {
          ...root,
          children: childIds,
          events: { ...root.events, ...rootEvents },
          layout: {
            ...layout,
            item: {
              ...layout.item,
              ...(root.type === 'WebPage'
                ? { height: 'fit-content' as const, minHeight: 600 }
                : {}),
            },
            container: {
              ...layout.container,
              mode: 'column',
              gap: 20,
              alignItems: 'stretch',
              paddingTop: 24,
              paddingRight: 24,
              paddingBottom: 24,
              paddingLeft: 24,
              ...rootContainer,
            },
          },
        },
        styles,
      ),
      ...components,
    ],
  };
}

export function text(name: string, caption: string, height = 44): DemoNode {
  return { type: 'WebLabel', name, height, props: { caption, autoSize: false } };
}

export function button(
  name: string,
  caption: string,
  handler: string,
  icon: WebRadIconName = 'arrow-right',
): DemoNode {
  return {
    type: 'WebButton',
    name,
    width: 240,
    height: 44,
    props: { caption, icon },
    events: { OnClick: handler },
    item: { width: 'stretch', minWidth: 180, maxWidth: 260 },
  };
}

export const padding = {
  paddingTop: 20,
  paddingRight: 20,
  paddingBottom: 20,
  paddingLeft: 20,
};

export function panel(name: string, children: readonly DemoNode[], width = 440): DemoNode {
  return {
    type: 'WebPanel',
    name,
    width,
    item: { width: 'stretch', height: 'fit-content', minWidth: 0, grow: 0, shrink: true },
    container: { ...padding, gap: 14 },
    children,
  };
}

export function row(name: string, children: readonly DemoNode[]): DemoNode {
  return {
    type: 'WebGroup',
    name,
    item: { height: 'fit-content' },
    container: { mode: 'row', gap: 20, wrap: true, alignItems: 'start' },
    children: children.map((child) =>
      child.type === 'WebPanel'
        ? {
            ...child,
            item: { ...child.item, width: 'fixed', minWidth: 260, grow: 1, shrink: true },
          }
        : child,
    ),
  };
}

/** Short Default Labels form readable paragraphs without overriding the Default style. */
export function paragraph(name: string, caption: string): DemoNode {
  const lines: string[] = [];
  let line = '';
  for (const word of caption.split(' ')) {
    if (line && line.length + word.length + 1 > 28) {
      lines.push(line);
      line = word;
    } else line = line ? line + ' ' + word : word;
  }
  if (line) lines.push(line);
  return {
    type: 'WebGroup',
    name,
    item: { height: 'fit-content' },
    container: { mode: 'column', gap: 0 },
    children: lines.map((caption, index) => text(name + 'Line' + String(index + 1), caption, 24)),
  };
}

/** Readonly native text areas preserve full dynamic messages using their Default style. */
export function status(name: string, value: string, height = 76): DemoNode {
  return {
    type: 'WebTextArea',
    name,
    height: Math.max(64, height),
    props: { value, readOnly: true, rows: 3 },
  };
}

export function sidebarContent(children: readonly DemoNode[]): DemoNode {
  return {
    type: 'WebGroup',
    name: 'PageContent',
    props: { marginLeft: 264 },
    item: { height: 'fit-content' },
    container: { mode: 'column', gap: 20 },
    children,
  };
}
