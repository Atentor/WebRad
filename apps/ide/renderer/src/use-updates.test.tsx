// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createProject } from '@webrad/project-model';
import { createUpdateTestBridge } from '../../shared/update-test-bridge';
import { createDebugTestBridge } from '../../shared/debugger-test-bridge';
import type { WebRadBridge } from '../../shared/contracts';
import { ProjectController } from './state/project-controller';
import { useUpdates } from './use-updates';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
describe('update action saves the latest project', () => {
  it('saves edits made during the download before requesting installation', async () => {
    const updates = createUpdateTestBridge();
    vi.mocked(updates.getState).mockResolvedValue({
      status: 'available',
      currentVersion: '0.1.11',
      latestVersion: '0.2.0',
      mode: 'automatic',
    });
    const session = {
      rootPath: 'C:/fixture',
      projectFilePath: 'C:/fixture/Test.wrproj',
      project: createProject('Test'),
      userSources: {},
    };
    const save = vi.fn(async (request) => ({ ...session, ...request }));
    const bridge = {
      updates,
      debugger: createDebugTestBridge(),
      project: { save },
      lifecycle: { setDirty: vi.fn() },
    } as unknown as WebRadBridge;
    vi.stubGlobal('webrad', bridge);
    const controller = new ProjectController(bridge);
    controller.load(session);
    vi.mocked(updates.download).mockImplementation(async () => {
      controller.replaceProject({ ...session.project, name: 'Edited during download' });
      return {
        status: 'ready',
        currentVersion: '0.1.11',
        latestVersion: '0.2.0',
        mode: 'automatic',
      };
    });
    vi.mocked(updates.install).mockImplementation(async () => {
      expect(controller.getSnapshot().dirty).toBe(false);
      expect(save).toHaveBeenCalledWith(
        expect.objectContaining({
          project: expect.objectContaining({ name: 'Edited during download' }),
        }),
      );
      return { status: 'installing', currentVersion: '0.1.11' };
    });
    const { result } = renderHook(() => useUpdates(controller));
    await waitFor(() => expect(result.current.state.status).toBe('available'));
    await act(async () => {
      await result.current.update();
    });
    expect(updates.install).toHaveBeenCalledTimes(1);
  });
  it('retains the ready update and does not quit when saving fails', async () => {
    const updates = createUpdateTestBridge();
    vi.mocked(updates.getState).mockResolvedValue({
      status: 'ready',
      currentVersion: '0.1.11',
      mode: 'automatic',
    });
    const bridge = {
      updates,
      project: {
        save: vi.fn(async () => {
          throw new Error('disk full');
        }),
      },
      lifecycle: { setDirty: vi.fn() },
    } as unknown as WebRadBridge;
    vi.stubGlobal('webrad', bridge);
    const session = {
      rootPath: 'C:/fixture',
      projectFilePath: 'C:/fixture/Test.wrproj',
      project: createProject('Test'),
      userSources: {},
    };
    const controller = new ProjectController(bridge);
    controller.load(session);
    controller.replaceProject({ ...session.project, name: 'Unsaved' });
    const { result } = renderHook(() => useUpdates(controller));
    await waitFor(() => expect(result.current.state.status).toBe('ready'));
    await act(async () => {
      await result.current.update();
    });
    expect(updates.install).not.toHaveBeenCalled();
    expect(result.current.state.status).toBe('ready');
    expect(result.current.state.message).toBe('disk full');
  });
});
