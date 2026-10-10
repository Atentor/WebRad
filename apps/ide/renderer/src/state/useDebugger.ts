import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { WebRadProject, ProjectDebuggerSettings } from '@webrad/project-model';
import type { BuildDiagnostic } from '../../../shared/contracts';
import type {
  DebugAction,
  DebugBreakpoint,
  DebugExceptionMode,
  DebugFrame,
  DebugLocation,
  DebugState,
} from '../../../shared/debugger-contracts';
import type { ProjectController } from './project-controller';
import type { DebugHoverContext } from '../debugger-hover';

const EMPTY_DEBUG_STATE: DebugState = {
  sessionId: null,
  status: 'idle',
  frames: [],
  breakpoints: [],
};
const EMPTY_SETTINGS: ProjectDebuggerSettings = {
  version: 1,
  breakpoints: [],
  watches: [],
  pauseOnExceptions: 'uncaught',
};

function authoredBreakpoints(breakpoints: readonly DebugBreakpoint[]): readonly DebugBreakpoint[] {
  const unique = new Map<string, DebugBreakpoint>();
  for (const { path, line, column, enabled, condition } of breakpoints) {
    const key = `${path}:${line}:${column ?? 1}`;
    if (!unique.has(key)) unique.set(key, { path, line, column, enabled, condition });
  }
  return [...unique.values()];
}

interface UseDebuggerOptions {
  readonly controller: ProjectController;
  readonly project: WebRadProject | null;
  readonly onOutput: (category: string, message: string) => void;
  readonly onShow: () => void;
  readonly onNavigate: (location: DebugLocation) => void;
  readonly onDiagnostics: (diagnostics: readonly BuildDiagnostic[]) => void;
}

export function useDebugger({
  controller,
  project,
  onOutput,
  onShow,
  onNavigate,
  onDiagnostics,
}: UseDebuggerOptions) {
  const bridge = window.webrad.debugger;
  const [state, setState] = useState<DebugState>(EMPTY_DEBUG_STATE);
  const [busy, setBusy] = useState(false);
  const [selectedFrameId, setSelectedFrameId] = useState<string>();
  const stateRef = useRef(state);
  const busyRef = useRef(false);
  const requestRef = useRef(0);
  const callbacks = useRef({ onOutput, onShow, onNavigate, onDiagnostics });
  useLayoutEffect(() => {
    callbacks.current = { onOutput, onShow, onNavigate, onDiagnostics };
  }, [onOutput, onShow, onNavigate, onDiagnostics]);
  const settings = project?.debugger ?? EMPTY_SETTINGS;
  const active =
    state.status === 'starting' || state.status === 'running' || state.status === 'paused';

  const acceptState = useCallback((next: DebugState) => {
    const previous = stateRef.current;
    stateRef.current = next;
    setState(next);
    if (next.status === 'paused') {
      const first = next.frames.find((frame) => frame.location !== undefined) ?? next.frames[0];
      if (previous.status !== 'paused' || previous.frames[0]?.id !== next.frames[0]?.id) {
        setSelectedFrameId(first?.id);
        callbacks.current.onShow();
        if (first?.location) callbacks.current.onNavigate(first.location);
        callbacks.current.onOutput('PREVIEW', `Debugger paused: ${next.reason ?? 'breakpoint'}.`);
      }
    } else {
      setSelectedFrameId(undefined);
    }
    if (next.status === 'error')
      callbacks.current.onOutput('PREVIEW', next.message ?? 'Debug session failed.');
  }, []);

  useEffect(() => {
    let mounted = true;
    const unsubscribe = bridge.subscribe((event) => {
      if (!mounted) return;
      if (event.type === 'state') acceptState(event.state);
      else
        callbacks.current.onOutput(
          'PREVIEW',
          `[${event.level}] ${event.values.map((value) => value.description).join(' ')}`,
        );
    });
    void bridge
      .getState()
      .then((next) => {
        if (mounted) acceptState(next);
      })
      .catch((error: unknown) => {
        if (mounted) callbacks.current.onOutput('PREVIEW', String(error));
      });
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [acceptState, bridge]);

  // Debug preferences can change during a pause without invalidating the compiled code.
  const contentFingerprint = useMemo(() => {
    if (project === null) return '';
    const content = { ...project };
    delete content.debugger;
    return JSON.stringify(content);
  }, [project]);
  const projectFingerprintRef = useRef(contentFingerprint);
  const sourcesRef = useRef(controller.getSnapshot().userSources);
  useEffect(() => {
    const unsubscribe = controller.subscribe(() => {
      const current = controller.getSnapshot();
      const previousSources = sourcesRef.current;
      sourcesRef.current = current.userSources;
      if (JSON.stringify(previousSources) === JSON.stringify(current.userSources)) return;
      requestRef.current += 1;
      if (busyRef.current || ['starting', 'running', 'paused'].includes(stateRef.current.status)) {
        void bridge
          .command('stop')
          .then(acceptState)
          .catch((error: unknown) => callbacks.current.onOutput('PREVIEW', String(error)));
      }
    });
    return unsubscribe;
  }, [acceptState, bridge, controller]);
  useEffect(() => {
    if (projectFingerprintRef.current === contentFingerprint) return;
    projectFingerprintRef.current = contentFingerprint;
    requestRef.current += 1;
    if (busyRef.current || ['starting', 'running', 'paused'].includes(stateRef.current.status)) {
      void bridge
        .command('stop')
        .then(acceptState)
        .catch((error: unknown) => callbacks.current.onOutput('PREVIEW', String(error)));
    }
  }, [acceptState, bridge, contentFingerprint]);

  const command = useCallback(
    async (action: DebugAction): Promise<void> => {
      if (busyRef.current && action !== 'stop') return;
      try {
        if (action === 'stop') requestRef.current += 1;
        acceptState(await bridge.command(action));
      } catch (error) {
        callbacks.current.onOutput('PREVIEW', String(error));
      }
    },
    [acceptState, bridge],
  );

  const start = useCallback(async (): Promise<void> => {
    if (busyRef.current) return;
    if (stateRef.current.status === 'paused') {
      await command('resume');
      return;
    }
    if (stateRef.current.status === 'running') {
      callbacks.current.onShow();
      return;
    }
    busyRef.current = true;
    setBusy(true);
    const request = ++requestRef.current;
    callbacks.current.onShow();
    callbacks.current.onOutput('COMPILER', 'Building the browser application for debugging.');
    try {
      await controller.save();
      const current = controller.getSnapshot();
      if (!current.project || !current.rootPath || request !== requestRef.current) return;
      const preferences = current.project.debugger ?? EMPTY_SETTINGS;
      const result = await bridge.start({
        rootPath: current.rootPath,
        project: current.project,
        userSources: { ...current.userSources },
        breakpoints: preferences.breakpoints,
        pauseOnExceptions: preferences.pauseOnExceptions,
      });
      if (request !== requestRef.current) return;
      callbacks.current.onDiagnostics(result.build.diagnostics);
      acceptState(result.state);
      callbacks.current.onOutput(
        'COMPILER',
        result.build.success
          ? 'Debug Preview started.'
          : 'Debug build failed. See Problems for details.',
      );
    } catch (error) {
      callbacks.current.onOutput('PREVIEW', String(error));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, [acceptState, bridge, command, controller]);

  const persist = useCallback(
    (patch: Partial<ProjectDebuggerSettings>): void => {
      const current = controller.getSnapshot().project;
      if (!current) return;
      const next = {
        ...(current.debugger ?? EMPTY_SETTINGS),
        ...patch,
        ...(patch.breakpoints ? { breakpoints: authoredBreakpoints(patch.breakpoints) } : {}),
      };
      controller.updateDebugger(next);
      if (
        patch.breakpoints &&
        ['starting', 'running', 'paused'].includes(stateRef.current.status)
      ) {
        void bridge
          .setBreakpoints(next.breakpoints)
          .then(acceptState)
          .catch((error: unknown) => callbacks.current.onOutput('PREVIEW', String(error)));
      }
      if (
        patch.pauseOnExceptions &&
        ['starting', 'running', 'paused'].includes(stateRef.current.status)
      ) {
        void bridge
          .setPauseOnExceptions(next.pauseOnExceptions)
          .catch((error: unknown) => callbacks.current.onOutput('PREVIEW', String(error)));
      }
    },
    [acceptState, bridge, controller],
  );
  const updateBreakpoint = useCallback(
    (breakpoint: DebugBreakpoint): void => {
      const current = controller.getSnapshot().project?.debugger ?? EMPTY_SETTINGS;
      const others = current.breakpoints.filter(
        (item) => item.path !== breakpoint.path || item.line !== breakpoint.line,
      );
      persist({
        breakpoints: [...others, breakpoint].sort(
          (a, b) => a.path.localeCompare(b.path) || a.line - b.line,
        ),
      });
    },
    [controller, persist],
  );
  const removeBreakpoint = useCallback(
    (path: string, line: number): void => {
      persist({
        breakpoints: (controller.getSnapshot().project?.debugger?.breakpoints ?? []).filter(
          (item) => item.path !== path || item.line !== line,
        ),
      });
    },
    [controller, persist],
  );
  const toggleBreakpoint = useCallback(
    (path: string, line: number): void => {
      const current = controller.getSnapshot().project?.debugger?.breakpoints ?? [];
      if (current.some((item) => item.path === path && item.line === line))
        removeBreakpoint(path, line);
      else updateBreakpoint({ path, line, enabled: true });
    },
    [controller, removeBreakpoint, updateBreakpoint],
  );
  const selectFrame = useCallback((frame: DebugFrame): void => {
    setSelectedFrameId(frame.id);
    if (frame.location) callbacks.current.onNavigate(frame.location);
  }, []);
  const breakpoints = settings.breakpoints.map((breakpoint) => {
    const resolved = state.breakpoints.find(
      (item) => item.path === breakpoint.path && item.line === breakpoint.line,
    );
    return {
      ...breakpoint,
      verified: active && (resolved?.verified ?? false),
      actualLine: active ? resolved?.actualLine : undefined,
      message: active ? resolved?.message : undefined,
    };
  });
  const selectedFrame =
    state.frames.find((frame) => frame.id === selectedFrameId) ??
    state.frames.find((frame) => frame.location);
  const hoverContext = useMemo<DebugHoverContext | null>(
    () =>
      state.status === 'paused' && state.sessionId && selectedFrame?.location
        ? {
            bridge,
            sessionId: state.sessionId,
            frameId: selectedFrame.id,
            path: selectedFrame.location.path,
          }
        : null,
    [bridge, state.status, state.sessionId, selectedFrame],
  );
  return {
    state,
    busy,
    active,
    bridge,
    settings,
    selectedFrameId,
    location: selectedFrame?.location ?? null,
    hoverContext,
    breakpoints,
    start,
    command,
    selectFrame,
    toggleBreakpoint,
    updateBreakpoint,
    removeBreakpoint,
    clearBreakpoints: () => persist({ breakpoints: [] }),
    setWatches: (watches: readonly string[]) => persist({ watches }),
    setExceptionMode: (pauseOnExceptions: DebugExceptionMode) => persist({ pauseOnExceptions }),
    moveBreakpoints: (breakpoints: readonly DebugBreakpoint[]) => persist({ breakpoints }),
  };
}
