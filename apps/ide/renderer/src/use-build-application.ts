import { useCallback, useEffect, useRef, useState } from 'react';
import type { NativeApplicationSettings } from '@webrad/project-model';
import type { NativePrerequisiteReport } from '@webrad/native-build/contracts';
import type { NativeBuildProgress, NativeBuildResponse } from '../../shared/native-build-contracts';
import type { ProjectController } from './state/project-controller';

export interface BuildApplicationState {
  readonly stage: NativeBuildProgress['stage'] | 'idle';
  readonly logs: readonly NativeBuildProgress[];
  readonly result?: NativeBuildResponse;
  readonly error?: string;
  readonly exportingCi: boolean;
  readonly cancelling: boolean;
}

interface UseBuildApplicationOptions {
  readonly controller: ProjectController;
  readonly isBlocked: () => boolean;
  readonly onResult: (result: NativeBuildResponse, exportingCi: boolean) => void;
}

export interface BuildApplicationController {
  readonly inspect: (settings: NativeApplicationSettings) => Promise<NativePrerequisiteReport>;
  readonly state: BuildApplicationState | null;
  readonly busy: boolean;
  readonly open: () => void;
  readonly close: () => void;
  readonly run: (settings: NativeApplicationSettings, exportingCi?: boolean) => Promise<void>;
  readonly cancel: () => Promise<void>;
  readonly openOutput: () => Promise<void>;
  readonly copyArtifact: (artifactIndex: number) => Promise<void>;
}

const TERMINAL_STAGES = new Set(['completed', 'failed', 'cancelled']);

export function useBuildApplication({
  controller,
  isBlocked,
  onResult,
}: UseBuildApplicationOptions): BuildApplicationController {
  const [state, setState] = useState<BuildApplicationState | null>(null);
  const activeRequest = useRef<string | null>(null);
  const cancelRequested = useRef(false);
  const busy = state !== null && state.stage !== 'idle' && !TERMINAL_STAGES.has(state.stage);
  const inspect = useCallback(
    async (settings: NativeApplicationSettings): Promise<NativePrerequisiteReport> => {
      const snapshot = controller.getSnapshot();
      if (!snapshot.project || !snapshot.rootPath)
        throw new Error('Open a project to check build requirements.');
      return window.webrad.nativeBuild.inspect({ rootPath: snapshot.rootPath, settings });
    },
    [controller],
  );

  useEffect(() => {
    const unsubscribe = window.webrad.nativeBuild.subscribe((progress) => {
      if (progress.requestId !== activeRequest.current) return;
      setState((current) =>
        current
          ? {
              ...current,
              // Only the final response confirms valid artifacts or cancellation.
              stage: TERMINAL_STAGES.has(progress.stage) ? current.stage : progress.stage,
              logs: [...current.logs.slice(-1999), progress],
            }
          : current,
      );
    });
    return () => {
      activeRequest.current = null;
      unsubscribe();
    };
  }, []);

  const open = useCallback(() => {
    const snapshot = controller.getSnapshot();
    if (isBlocked() || activeRequest.current || !snapshot.project || !snapshot.rootPath) return;
    setState({ stage: 'idle', logs: [], exportingCi: false, cancelling: false });
  }, [controller, isBlocked]);

  const close = useCallback(() => {
    if (!activeRequest.current) setState(null);
  }, []);

  const run = useCallback(
    async (settings: NativeApplicationSettings, exportingCi = false): Promise<void> => {
      if (isBlocked() || activeRequest.current) return;
      const initial = controller.getSnapshot();
      if (!initial.project || !initial.rootPath) return;
      const requestId = crypto.randomUUID();
      activeRequest.current = requestId;
      cancelRequested.current = false;
      setState({ stage: 'preparing', logs: [], exportingCi, cancelling: false });
      try {
        controller.updateProjectSettings({ nativeApplication: settings });
        await controller.save();
        const snapshot = controller.getSnapshot();
        if (
          !snapshot.project ||
          snapshot.project.id !== initial.project.id ||
          snapshot.rootPath !== initial.rootPath
        ) {
          throw new Error('The project changed before Build Application could start.');
        }
        if (cancelRequested.current) {
          setState((current) => current && { ...current, stage: 'cancelled', cancelling: false });
          return;
        }
        const request = {
          requestId,
          rootPath: snapshot.rootPath,
          project: snapshot.project,
          userSources: { ...snapshot.userSources },
        };
        const response = await (exportingCi
          ? window.webrad.nativeBuild.exportCi(request)
          : window.webrad.nativeBuild.run(request));
        if (activeRequest.current !== requestId) return;
        let result: NativeBuildResponse =
          response.success && response.artifacts.length === 0
            ? {
                ...response,
                success: false,
                diagnostics: [
                  ...response.diagnostics,
                  {
                    category: 'error',
                    source: 'ide',
                    message: 'The build finished without producing a valid artifact.',
                  },
                ],
              }
            : response;
        const latest = controller.getSnapshot();
        const configuredDirectory = result.configuredOutputDirectory;
        if (
          configuredDirectory !== undefined &&
          latest.project?.id === initial.project.id &&
          latest.rootPath === initial.rootPath &&
          latest.project.settings.nativeApplication.build.outputDirectory !== configuredDirectory
        ) {
          try {
            // The picker may authorize another parent directory. Merge only that setting
            // into the latest model so newer metadata and authored changes are preserved.
            controller.updateProjectSettings({
              nativeApplication: {
                ...latest.project.settings.nativeApplication,
                build: {
                  ...latest.project.settings.nativeApplication.build,
                  outputDirectory: configuredDirectory,
                },
              },
            });
            await controller.save();
          } catch (error) {
            result = {
              ...result,
              diagnostics: [
                ...result.diagnostics,
                {
                  category: 'warning',
                  source: 'ide',
                  message: `The output directory setting could not be saved: ${error instanceof Error ? error.message : String(error)}`,
                },
              ],
            };
          }
        }
        setState((current) => ({
          stage: result.cancelled ? 'cancelled' : result.success ? 'completed' : 'failed',
          logs: current?.logs ?? [],
          result,
          error: result.success
            ? undefined
            : result.diagnostics.find((item) => item.category === 'error')?.message,
          exportingCi,
          cancelling: false,
        }));
        onResult(result, exportingCi);
      } catch (error) {
        if (activeRequest.current !== requestId) return;
        const message = error instanceof Error ? error.message : String(error);
        const result: NativeBuildResponse = {
          requestId,
          success: false,
          artifacts: [],
          diagnostics: [{ category: 'error', source: 'ide', message }],
        };
        setState((current) => ({
          stage: 'failed',
          logs: current?.logs ?? [],
          result,
          error: message,
          exportingCi,
          cancelling: false,
        }));
        onResult(result, exportingCi);
      } finally {
        if (activeRequest.current === requestId) activeRequest.current = null;
      }
    },
    [controller, isBlocked, onResult],
  );

  const cancel = useCallback(async (): Promise<void> => {
    const requestId = activeRequest.current;
    if (!requestId || cancelRequested.current) return;
    cancelRequested.current = true;
    setState((current) => current && { ...current, cancelling: true });
    try {
      await window.webrad.nativeBuild.cancel(requestId);
    } catch (error) {
      cancelRequested.current = false;
      setState(
        (current) =>
          current && {
            ...current,
            cancelling: false,
            error: error instanceof Error ? error.message : String(error),
          },
      );
    }
  }, []);

  const openOutput = useCallback(async (): Promise<void> => {
    if (!state?.result?.success) return;
    try {
      await window.webrad.nativeBuild.openOutput({ requestId: state.result.requestId });
    } catch (error) {
      setState(
        (current) =>
          current && { ...current, error: error instanceof Error ? error.message : String(error) },
      );
    }
  }, [state?.result]);

  const copyArtifact = useCallback(
    async (artifactIndex: number): Promise<void> => {
      if (!state?.result?.success) return;
      try {
        await window.webrad.nativeBuild.copyArtifact({
          requestId: state.result.requestId,
          artifactIndex,
        });
      } catch (error) {
        setState(
          (current) =>
            current && {
              ...current,
              error: error instanceof Error ? error.message : String(error),
            },
        );
      }
    },
    [state?.result],
  );

  return { state, busy, inspect, open, close, run, cancel, openOutput, copyArtifact };
}
