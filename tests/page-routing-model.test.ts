import { describe, expect, it } from 'vitest';
import { defaultComponentRegistry } from '@webrad/component-registry';
import { ChangePropertyCommand, CommandHistory } from '@webrad/designer';
import {
  createPage,
  createProject,
  deserializePage,
  deserializeProject,
  serializePage,
  serializeProject,
  updateProjectSettings,
  safeParseProject,
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

  it('registers and saves an independent route with undo/redo and stable component identity', () => {
    expect(
      defaultComponentRegistry
        .require('WebPage')
        .properties.find(({ name }) => name === 'routePath'),
    ).toMatchObject({ label: 'Route path', source: 'props', defaultValue: '' });
    const page = createPage('PageCustomers');
    const history = new CommandHistory(page);
    history.execute(
      new ChangePropertyCommand(page.rootComponentId, 'routePath', '/admin/clientes'),
    );
    const saved = deserializePage(serializePage(history.state));
    expect(saved.components[0]?.props.routePath).toBe('/admin/clientes');
    expect(saved.rootComponentId).toBe(page.rootComponentId);
    expect(saved.name).toBe('PageCustomers');
    history.undo();
    expect(history.state.components[0]?.props.routePath ?? '').toBe('');
    history.redo();
    expect(history.state.components[0]?.props.routePath).toBe('/admin/clientes');
  });
});
