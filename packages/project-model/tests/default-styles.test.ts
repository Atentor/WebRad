import { expect, it } from 'vitest';
import { defaultComponentRegistry } from '@webrad/component-registry';
import {
  addComponent,
  applyDefaultComponentStyle,
  createComponentStyle,
  createProject,
  deserializeProject,
  findDefaultComponentStyle,
  parseProject,
  parseProjectManifest,
  projectToManifest,
  serializeProject,
  updateComponentStyle,
  updatePage,
} from '../src/index.js';

it('restores the missing Aurora Video Player style in projects and manifests without replacing saved styles or bindings', () => {
  let project = createProject('VideoStyles');
  let page = project.pages[0]!;
  const custom = createComponentStyle('Default Video Player', 'WebVideoPlayer', {
    idFactory: () => `${project.id}:default-style:WebVideoPlayer`,
    states: { base: { backgroundColor: '#ff0000' } },
  });
  const player = defaultComponentRegistry.createComponent('WebVideoPlayer', {
    id: 'video',
    name: 'VideoPlayer1',
    parentId: page.rootComponentId,
  });
  page = addComponent(page, { ...player, styleId: custom.id }, page.rootComponentId);
  project = updatePage(project, page.id, page);
  const legacy = {
    ...project,
    styles: [...project.styles.filter((style) => style.componentType !== 'WebVideoPlayer'), custom],
  };
  const restored = deserializeProject(JSON.stringify(legacy));
  const style = findDefaultComponentStyle(restored.styles, 'WebVideoPlayer')!;
  expect(style).toMatchObject({
    id: `${custom.id}-2`,
    name: 'Default Video Player 2',
    preset: 'default',
    states: {
      base: {
        backgroundGradient: {
          from: '#334155',
          to: '#0f172a',
        },
        borderGradient: {
          from: '#60a5fa',
          to: '#a78bfa',
        },
        borderRadius: { value: 6, unit: 'px' },
        objectFit: 'contain',
      },
    },
  });
  expect(restored.styles.find((entry) => entry.id === custom.id)).toEqual(custom);
  expect(restored.pages[0]!.components.find((node) => node.id === player.id)?.styleId).toBe(
    custom.id,
  );
  expect(restored.styles.indexOf(style)).toBe(
    restored.styles.findIndex((entry) => entry.componentType === 'WebImage') + 1,
  );
  expect(applyDefaultComponentStyle(player, restored.styles).styleId).toBe(style.id);
  expect(
    applyDefaultComponentStyle({ ...player, styleId: custom.id }, restored.styles).styleId,
  ).toBe(custom.id);
  expect(deserializeProject(serializeProject(restored))).toEqual(restored);
  expect(
    parseProjectManifest({ ...projectToManifest(project), styles: legacy.styles }).styles,
  ).toEqual(restored.styles);
});

it('keeps edited Video Player defaults and uses the actual project palette when restoring a missing style', () => {
  const project = createProject('VideoStyles');
  const style = findDefaultComponentStyle(project.styles, 'WebVideoPlayer')!;
  const edited = updateComponentStyle(project, style.id, {
    states: { ...style.states, base: { backgroundColor: '#123456', fontFamily: 'roboto' } },
  });
  expect(deserializeProject(serializeProject(edited))).toEqual(edited);
  const colors = [{ id: 'custom-ink', name: 'Ink', color: '#0f172a' }];
  const restored = parseProject({
    ...project,
    styles: project.styles
      .filter((entry) => entry.componentType !== 'WebVideoPlayer')
      .map((entry) => ({
        ...entry,
        states: { base: {}, hover: {}, focus: {}, active: {}, disabled: {} },
      })),
    settings: { ...project.settings, colorPalette: colors },
  });
  expect(findDefaultComponentStyle(restored.styles, 'WebVideoPlayer')?.states.base).toMatchObject({
    backgroundGradient: { from: '#334155', to: 'var(--wr-palette-custom-ink)' },
    borderGradient: { from: '#60a5fa', to: '#a78bfa' },
    textColor: '#ffffff',
  });
});
