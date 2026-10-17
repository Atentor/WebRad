import { useCallback, useEffect, useRef, useState } from 'react';
import type { UpdateState } from '../../shared/update-contracts';
import type { ProjectController } from './state/project-controller';

export function useUpdates(controller: ProjectController) {
  const [state, setState] = useState<UpdateState>({ status: 'idle', currentVersion: '' });
  const busy = useRef(false);

  useEffect(() => {
    let active = true;
    let receivedEvent = false;
    const unsubscribe = window.webrad.updates.subscribe((value) => {
      receivedEvent = true;
      if (active) setState(value);
    });
    void window.webrad.updates
      .getState()
      .then((value) => {
        if (active && !receivedEvent) setState(value);
      })
      .catch(() => {
        /* Startup must not depend on the update bridge. */
      });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    const shell = document.querySelector<HTMLElement>('.wr-ide-shell');
    if (!shell || state.status !== 'installing') return;
    shell.inert = true;
    return () => {
      shell.inert = false;
    };
  }, [state.status]);

  const check = useCallback(async (): Promise<void> => {
    try {
      setState(await window.webrad.updates.check());
    } catch (error) {
      setState((current) => ({
        ...current,
        status: 'error',
        message: error instanceof Error ? error.message : 'Could not check for updates.',
      }));
    }
  }, []);

  const update = useCallback(async (): Promise<void> => {
    if (busy.current) return;
    busy.current = true;
    try {
      let next = await window.webrad.updates.getState();
      if (next.status === 'available') next = await window.webrad.updates.download();
      setState(next);
      if (next.status !== 'ready') return;
      const initial = controller.getSnapshot();
      if (initial.dirty) await controller.save();
      const current = controller.getSnapshot();
      if (current.dirty || current.saving)
        throw new Error('Save your project before installing the update.');
      setState(await window.webrad.updates.install());
    } catch (error) {
      // Preserve a downloaded native update so saving/cancellation can be retried.
      setState((current) => ({
        ...current,
        status: current.status === 'ready' ? 'ready' : 'error',
        message: error instanceof Error ? error.message : 'Could not install the update.',
      }));
    } finally {
      busy.current = false;
    }
  }, [controller]);

  return { state, check, update };
}
