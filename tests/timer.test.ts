import { expect, it } from 'vitest';
import {
  defaultComponentRegistry,
  resolveComponentDesignerPresentation,
} from '@webrad/component-registry';
import { serializeProject, deserializeProject } from '@webrad/project-model';
import { compileProjectToMemory } from '@webrad/compiler';
import { timerProject, timerUserSources } from './fixtures/timer';

it('persists Timer identity, properties and Interact bindings without visual styles', () => {
  const project = timerProject();
  const restored = deserializeProject(serializeProject(project));
  expect(restored).toEqual(project);
  const timer = restored.pages[0]!.components.find((c) => c.id === 'timer')!;
  expect(timer).toMatchObject({
    type: 'WebTimer',
    name: 'Timer1',
    props: { time: 30, loop: true, enabled: true },
    events: { OnTimer: 'tick' },
  });
  expect(timer.styleId).toBeUndefined();
  const definition = defaultComponentRegistry.require('WebTimer');
  expect(resolveComponentDesignerPresentation(definition)).toBe('tray');
  const time = definition.properties.find((p) => p.name === 'time')!;
  for (const value of [0, -1, 1.5, Infinity, '1000', 2147483648])
    expect(time.validateValue?.(value)).toBe(false);
  expect(time.validateValue?.(1)).toBe(true);
});

it('compiles a browser-only Timer with bare and this instance access', async () => {
  const result = await compileProjectToMemory(timerProject(), { userSources: timerUserSources });
  expect(result.success, JSON.stringify(result.diagnostics)).toBe(true);
  expect(result.previewHtml).toBeTruthy();
});
