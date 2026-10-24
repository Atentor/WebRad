import { applyDefaultComponentStyle } from './default-styles.js';
import { createDefaultComponentLayout, type PageModel, type WebRadProject } from './types.js';

/** Materializes mandatory pages while preserving all existing page and component IDs. */
export function materializeEntryPage(project: WebRadProject): WebRadProject {
  const entry = project.pages.find((page) => page.id === project.entryPage);
  if (entry === undefined) return project;
  const pages = [...project.pages];
  if (!pages.some((page) => page.name === '404')) {
    const occupied = new Set([
      project.id,
      ...[...pages, ...project.reusableElements].flatMap((page) => [
        page.id,
        ...page.components.map((node) => node.id),
      ]),
      ...project.styles.map((style) => style.id),
      ...(project.sourceFiles ?? []).map((file) => file.id),
      ...(project.assets ?? []).map((asset) => asset.id),
    ]);
    const allocate = (kind: string): string => {
      let id = project.id + ':404:' + kind;
      while (occupied.has(id)) id += '_';
      occupied.add(id);
      return id;
    };
    const id = allocate('page');
    const rootId = allocate('root');
    const labelId = allocate('message');
    const page: PageModel = {
      formatVersion: entry.formatVersion,
      id,
      name: '404',
      caption: '404',
      width: entry.width,
      height: entry.height,
      rootComponentId: rootId,
      components: [
        applyDefaultComponentStyle(
          {
            id: rootId,
            type: 'WebPage',
            name: '404',
            parentId: null,
            layout: createDefaultComponentLayout(),
            bounds: { x: 0, y: 0, width: entry.width, height: entry.height },
            props: {
              caption: '404',
              browserTitle: '404 - Page not found',
              routePath: '/404',
              visible: true,
              enabled: true,
              backgroundColor: '#ffffff',
            },
            events: { OnCreate: null, OnShow: null, OnHide: null, OnResize: null },
            children: [labelId],
          },
          project.styles,
        ),
        applyDefaultComponentStyle(
          {
            id: labelId,
            type: 'WebLabel',
            name: 'NotFoundMessage',
            parentId: rootId,
            layout: createDefaultComponentLayout(),
            bounds: {
              x: 24,
              y: 24,
              width: Math.max(1, Math.min(600, entry.width - 48)),
              height: 96,
            },
            props: { caption: '404 - Page not found', visible: true, enabled: true },
            events: {},
            children: [],
          },
          project.styles,
        ),
      ],
    };
    pages.push(page);
  }
  return {
    ...project,
    pages: pages.map((page) => {
      const name = page.name === '404' ? '404' : page.id === project.entryPage ? 'index' : null;
      if (name === null) return page;
      return {
        ...page,
        name,
        components: page.components.map((node) =>
          node.id !== page.rootComponentId
            ? node
            : { ...node, name, props: { ...node.props, routePath: '/' + name } },
        ),
      };
    }),
  };
}
