import { ChangePropertyCommand } from '@webrad/designer';
import type * as projectModel from '@webrad/project-model';
import {
  createPage,
  getComponent,
  parsePage,
  serializeVisualDocument,
  updateComponentProps,
} from '@webrad/project-model';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DesignerController } from './designer-controller';

vi.mock('@webrad/project-model', async (importOriginal) => {
  const actual = await importOriginal<typeof projectModel>();
  return { ...actual, serializeVisualDocument: vi.fn(actual.serializeVisualDocument) };
});

beforeEach(() => vi.clearAllMocks());

describe('DesignerController model synchronization', () => {
  it('compares equivalent model projections once without clearing history', () => {
    const controller = new DesignerController();
    const page = createPage('PageMain');
    const edited = controller.execute(
      page,
      new ChangePropertyCommand(page.rootComponentId, 'caption', 'Edited'),
    );
    const projected = parsePage(edited);
    expect(controller.canUndo(projected)).toBe(true);
    expect(serializeVisualDocument).toHaveBeenCalledTimes(2);
    expect(controller.canRedo(projected)).toBe(false);
    expect(controller.canUndo(projected)).toBe(true);
    expect(serializeVisualDocument).toHaveBeenCalledTimes(2);
    const restored = controller.undo(projected);
    expect(getComponent(restored, restored.rootComponentId).props.caption).toBe('PageMain');
  });

  it('invalidates a cached comparison after direct history changes or external model edits', () => {
    const controller = new DesignerController();
    const page = createPage('PageMain');
    const history = controller.synchronize(page);
    history.execute(new ChangePropertyCommand(page.rootComponentId, 'caption', 'Changed directly'));
    expect(controller.synchronize(page).state).toBe(page);
    expect(history.canUndo).toBe(false);
    const edited = controller.execute(
      page,
      new ChangePropertyCommand(page.rootComponentId, 'caption', 'Edited'),
    );
    const external = updateComponentProps(edited, page.rootComponentId, {
      caption: 'External edit',
    });
    expect(controller.synchronize(external).state).toBe(external);
    expect(history.canUndo).toBe(false);
  });

  it('opening an existing event does not create history or discard redo', () => {
    const controller = new DesignerController();
    const page = createPage('PageMain');
    const bound = controller.bindEvent(page, page.rootComponentId, 'OnCreate', 'PageMainCreate');
    const edited = controller.execute(
      bound,
      new ChangePropertyCommand(page.rootComponentId, 'caption', 'Edited'),
    );
    const restored = controller.undo(edited);
    expect(controller.bindEvent(restored, page.rootComponentId, 'OnCreate', 'PageMainCreate')).toBe(
      restored,
    );
    expect(controller.canRedo(restored)).toBe(true);
    expect(controller.undo(restored).components[0]?.events.OnCreate).toBeNull();
  });
});
