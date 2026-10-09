import { describe, expect, it } from 'vitest';
import {
  ComboBoxConfigurationSchema,
  comboBoxSchemaChoices,
  deserializeProject,
  serializeProject,
  parseProject,
} from '../src/index.js';
import {
  comboBoxBinding,
  comboBoxProject,
  comboBoxResponseSchema,
} from '../../../tests/fixtures/combo-box.js';

describe('ComboBox persisted binding', () => {
  it('round-trips stable references and fields without API response data', () => {
    const project = comboBoxProject();
    const restored = deserializeProject(serializeProject(project));
    const combo = restored.pages[0]?.components.find(
      (component) => component.type === 'WebComboBox',
    );
    expect(combo?.id).toBe('customer-combo');
    expect(combo?.props.comboBoxConfig).toEqual(comboBoxBinding);
    expect(combo?.props.items).toEqual(['Static item']);
    expect(serializeProject(project)).not.toContain('Bruno');
  });

  it('rejects malformed bindings during project parsing while allowing static ComboBoxes', () => {
    const project = comboBoxProject();
    const change = (binding: unknown) => ({
      ...project,
      pages: project.pages.map((page) => ({
        ...page,
        components: page.components.map((component) =>
          component.type === 'WebComboBox'
            ? { ...component, props: { ...component.props, comboBoxConfig: binding } }
            : component,
        ),
      })),
    });
    expect(() => parseProject(change({ ...comboBoxBinding, keyField: 'id' }))).toThrow();
    expect(() =>
      parseProject(change({ ...comboBoxBinding, displayField: '/bad~pointer' })),
    ).toThrow();
    expect(() => parseProject(change(null))).not.toThrow();
    expect(
      ComboBoxConfigurationSchema.safeParse({ ...comboBoxBinding, schemaVersion: 2 }).success,
    ).toBe(false);
  });

  it('offers item-relative scalar fields, including whole primitive items', () => {
    expect(comboBoxSchemaChoices(comboBoxResponseSchema, '/customers')).toEqual({
      lists: [
        { path: '/customers', label: 'customers' },
        { path: '/codes', label: 'codes' },
      ],
      fields: [
        { path: '/id', label: 'id' },
        { path: '/name', label: 'name' },
        { path: '/full~1name', label: 'full/name' },
      ],
    });
    expect(comboBoxSchemaChoices(comboBoxResponseSchema, '/codes').fields).toEqual([
      { path: '', label: 'Item value' },
    ]);
    expect(comboBoxSchemaChoices(null, '').fields).toEqual([]);
  });
});
