// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WebApiClient, WebComboBox } from '../src/index.js';
import { comboBoxApiConfiguration, comboBoxBinding } from '../../../tests/fixtures/combo-box.js';

afterEach(() => {
  document.body.replaceChildren();
});

function setup() {
  const responses: unknown[] = [];
  const fetcher = vi.fn<typeof fetch>(
    async () =>
      new Response(JSON.stringify(responses.shift()), {
        headers: { 'content-type': 'application/json' },
      }),
  );
  const api = new WebApiClient({
    id: 'customers-api',
    baseUrl: 'https://api.example.test',
    apiClientConfig: comboBoxApiConfiguration(),
    fetch: fetcher,
  });
  const element = document.createElement('select');
  document.body.append(element);
  const combo = new WebComboBox(element);
  combo.items = ['Static item'];
  combo.comboBoxConfig = comboBoxBinding;
  combo.value = '2';
  combo.bindApiClient(api);
  return { combo, api, fetcher, responses };
}

describe('ComboBox API binding', () => {
  it('exposes typed static values while preserving labels and the selected index', () => {
    const combo = new WebComboBox(document.createElement('select'));
    combo.items = ['Ana', 'Bruno'];
    combo.selectedIndex = 1;
    combo.values = ['1', '2'];
    expect(combo.value).toBe('2');
    expect(combo.items.map((item) => item.label)).toEqual(['Ana', 'Bruno']);
    expect(combo.values).toEqual(['1', '2']);
    expect(() => {
      combo.values = ['1'];
    }).toThrow(RangeError);
    combo.values = [];
    expect(combo.value).toBe('Bruno');
  });
  it('observes named results, uses keys as values, preserves selection across reordering, and emits OnChange', async () => {
    const { combo, api, fetcher, responses } = setup();
    expect(fetcher).not.toHaveBeenCalled();
    expect(combo.items).toEqual([]);
    responses.push({
      customers: [
        { id: 1, name: 'Ana' },
        { id: 2, name: 'Bruno' },
      ],
    });
    await api.execute('Load');
    expect(combo.items).toEqual([
      { value: '1', label: 'Ana', disabled: false },
      { value: '2', label: 'Bruno', disabled: false },
    ]);
    expect(combo.value).toBe('2');
    const change = vi.fn();
    combo.onChange = (sender) => {
      change(sender.value);
    };
    combo.element.value = '1';
    combo.element.dispatchEvent(new Event('change'));
    expect(change).toHaveBeenCalledWith('1');
    responses.push({
      customers: [
        { id: 2, name: 'Bruno updated' },
        { id: 1, name: 'Ana updated' },
      ],
    });
    await api.execute('Load');
    expect(combo.value).toBe('1');
    expect(combo.selectedIndex).toBe(1);
    expect(combo.items[1]?.label).toBe('Ana updated');
    responses.push({ customers: [] });
    await api.execute('Load');
    expect(combo.items).toEqual([]);
    expect(combo.value).toBe('');
    responses.push({ customers: [{ id: 1, name: 'Ana restored' }] });
    await api.execute('Load');
    expect(combo.value).toBe('1');
    expect(change).toHaveBeenCalledTimes(1);
  });

  it('reads escaped and nested pointers, ignores missing/non-scalar fields, and supports primitive lists', async () => {
    const { combo, api, responses } = setup();
    combo.comboBoxConfig = { ...comboBoxBinding, displayField: '/full~1name' };
    responses.push({
      customers: [
        { id: 0, 'full/name': 'Zero' },
        { id: false, 'full/name': '<script>unsafe</script>' },
        { id: null, 'full/name': 'Ignored' },
        { id: 3 },
        { id: {}, 'full/name': 'Ignored' },
      ],
    });
    await api.execute('Load');
    expect(combo.items.map(({ value, label }) => ({ value, label }))).toEqual([
      { value: '0', label: 'Zero' },
      { value: 'false', label: '<script>unsafe</script>' },
    ]);
    expect(combo.element.querySelector('script')).toBeNull();
    combo.comboBoxConfig = { ...comboBoxBinding, displayField: '/profile/name', keyField: '/id' };
    responses.push({ customers: [{ id: 7, profile: { name: 'Nested' } }] });
    await api.execute('Load');
    expect(combo.items[0]?.label).toBe('Nested');
    combo.comboBoxConfig = {
      ...comboBoxBinding,
      listPath: '/codes',
      displayField: '',
      keyField: '',
    };
    responses.push({ codes: ['A', 'B'] });
    await api.execute('Load');
    expect(combo.items.map((item) => item.value)).toEqual(['A', 'B']);
  });

  it('releases old subscriptions on rebinding/disposal and restores static items when detached', async () => {
    const { combo, api, responses } = setup();
    responses.push({ customers: [{ id: 2, name: 'Bruno' }] });
    await api.execute('Load');
    combo.bindApiClient(null);
    expect(combo.items).toEqual([]);
    responses.push({ customers: [{ id: 3, name: 'Other' }] });
    await api.execute('Load');
    expect(combo.items).toEqual([]);
    combo.bindApiClient(api);
    expect(combo.items[0]?.value).toBe('3');
    combo.dispose();
    responses.push({ customers: [{ id: 4, name: 'After disposal' }] });
    await api.execute('Load');
    expect(combo.items[0]?.value).toBe('3');
    combo.comboBoxConfig = null;
    expect(combo.items[0]?.label).toBe('Static item');
  });
});
