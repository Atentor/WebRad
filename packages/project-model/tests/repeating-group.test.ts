import { describe, expect, it } from 'vitest';
import { componentRegistry, getCurrentRowBindableProperties } from '@webrad/component-registry';
import {
  CurrentRowBindingsSchema,
  RepeatingGroupConfigurationSchema,
  createDefaultRepeatingGroupConfiguration,
  createPage,
  addComponent,
  serializePage,
  deserializePage,
} from '../src/index.js';

describe('Repeating Group persisted contract', () => {
  it('serializes one stable responsive template and bindings without sampled API results', () => {
    let page = createPage('PageMain');
    const group = componentRegistry.createComponent('WebRepeatingGroup', {
      id: 'group',
      parentId: page.rootComponentId,
    });
    page = addComponent(page, group);
    page = addComponent(
      page,
      componentRegistry.createComponent('WebLabel', {
        id: 'label',
        parentId: 'group',
        props: {
          caption: 'Fallback',
          currentRowBindings: [{ property: 'caption', fieldPath: '/name' }],
        },
      }),
    );
    const restored = deserializePage(serializePage(page));
    expect(restored.components.find((component) => component.id === 'group')?.children).toEqual([
      'label',
    ]);
    expect(
      restored.components.find((component) => component.id === 'group')?.props.repeatingGroupConfig,
    ).toEqual(createDefaultRepeatingGroupConfiguration());
    expect(
      restored.components.find((component) => component.id === 'label')?.props.currentRowBindings,
    ).toEqual([{ property: 'caption', fieldPath: '/name' }]);
    expect(restored).toEqual(page);
    expect(JSON.stringify(restored)).not.toContain('sampleData');
  });

  it('rejects invalid pointers, paired sources, bounds and duplicate or unsafe binding targets', () => {
    const defaults = createDefaultRepeatingGroupConfiguration();
    for (const patch of [
      { listPath: 'wrong' },
      { listPath: '/bad~2' },
      { apiClientId: 'api', operationId: null },
      { minRowHeight: 100, maxRowHeight: 20 },
      { fixedRowHeight: 0 },
      { gap: -1 },
    ])
      expect(RepeatingGroupConfigurationSchema.safeParse({ ...defaults, ...patch }).success).toBe(
        false,
      );
    for (const bindings of [
      [{ property: '__proto__', fieldPath: '' }],
      [{ property: 'caption', fieldPath: '/bad~2' }],
      [
        { property: 'caption', fieldPath: '' },
        { property: 'caption', fieldPath: '/name' },
      ],
    ])
      expect(CurrentRowBindingsSchema.safeParse(bindings).success).toBe(false);
  });

  it('declares visual template hosting and binding metadata through the central registry', () => {
    const definition = componentRegistry.require('WebRepeatingGroup');
    expect(definition).toMatchObject({
      visual: true,
      canHaveChildren: true,
      designerChildHost: 'repeating-row',
      designerAction: 'repeating-group-configurator',
    });
    expect(
      getCurrentRowBindableProperties(componentRegistry.require('WebButton')).map(
        (property) => property.name,
      ),
    ).toContain('caption');
    expect(
      getCurrentRowBindableProperties(componentRegistry.require('WebImage')).map(
        (property) => property.name,
      ),
    ).toContain('src');
    expect(getCurrentRowBindableProperties(componentRegistry.require('WebApiClient'))).toEqual([]);
    expect(
      getCurrentRowBindableProperties(componentRegistry.require('WebLabel')).map(
        (property) => property.name,
      ),
    ).not.toContain('margin');
  });
});
