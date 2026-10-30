import { describe, expect, it } from 'vitest';
import { defaultComponentRegistry } from '@webrad/component-registry';
import {
  createPage,
  createProject,
  deserializeProject,
  serializeProject,
  updateProjectSettings,
  safeParseProject,
  addPage,
  updateComponentProps,
} from '@webrad/project-model';

describe('page routing configuration', () => {
  it('defaults old projects to History and persists compatibility and base directory choices', () => {
    const initial = createProject('Routes');
    const raw = JSON.parse(serializeProject(initial)) as { settings: Record<string, unknown> };
    delete raw.settings.routingMode;
    delete raw.settings.routingBasePath;
    expect(deserializeProject(JSON.stringify(raw)).settings).toMatchObject({
      routingMode: 'history',
      routingBasePath: '/',
    });
    const updated = updateProjectSettings(initial, {
      routingMode: 'hash',
      routingBasePath: '/portal/',
    });
    expect(deserializeProject(serializeProject(updated)).settings).toMatchObject({
      routingMode: 'hash',
      routingBasePath: '/portal/',
    });
    for (const routingBasePath of ['portal', '//external/', '/../', '/app?x=1/']) {
      expect(
        safeParseProject({ ...initial, settings: { ...initial.settings, routingBasePath } })
          .success,
      ).toBe(false);
    }
  });

  it('removes custom route configuration while preserving page identity', () => {
    expect(
      defaultComponentRegistry
        .require('WebPage')
        .properties.find(({ name }) => name === 'routePath'),
    ).toBeUndefined();
    const page = createPage('PageCustomers');
    const legacy = updateComponentProps(page, page.rootComponentId, {
      routePath: '/admin/clientes',
    });
    const project = deserializeProject(
      serializeProject(addPage(createProject('Routes'), legacy)),
    );
    const saved = project.pages.find(({ id }) => id === page.id)!;
    expect(saved.components[0]?.props.routePath).toBeUndefined();
    expect(saved.rootComponentId).toBe(page.rootComponentId);
    expect(saved.name).toBe('PageCustomers');
  });
});
