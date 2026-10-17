import { useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import type { DeployProgress, DeployResponse } from '../../shared/contracts';
import type { ProjectController } from './state/project-controller';

export interface DeployState {
  readonly status: 'compiling' | 'writing' | 'success' | 'error';
  readonly completedFiles: number;
  readonly totalFiles: number;
  readonly currentFile?: string;
  readonly outputDirectory?: string;
  readonly message?: string;
}

interface UseDeployOptions {
  readonly controller: ProjectController;
  readonly blocked: boolean;
  readonly onConfigure: () => void;
  readonly onResult: (result: DeployResponse) => void;
}

export function useDeploy({ controller, blocked, onConfigure, onResult }: UseDeployOptions) {
  const [state, setState] = useState<DeployState | null>(null);
  const activeRequest = useRef<string | null>(null);
  const busy = state?.status === 'compiling' || state?.status === 'writing';

  useEffect(() => {
    const unsubscribe = window.webrad.deploy.subscribe((progress: DeployProgress) => {
      if (progress.requestId !== activeRequest.current || progress.phase === 'complete') return;
      const status = progress.phase;
      // Commit file counts between IPC messages, including fast local exports.
      flushSync(() =>
        setState(
          (current) =>
            current && {
              ...current,
              status,
              completedFiles: progress.completedFiles,
              totalFiles: progress.totalFiles,
              currentFile: progress.currentFile,
            },
        ),
      );
    });
    return () => {
      activeRequest.current = null;
      unsubscribe();
    };
  }, []);

  const run = useCallback(async (): Promise<void> => {
    if (blocked || activeRequest.current) return;
    const initial = controller.getSnapshot();
    if (!initial.project || !initial.rootPath) return;
    if (!initial.project.settings.build.deployDirectory) {
      onConfigure();
      return;
    }
    const requestId = crypto.randomUUID();
    activeRequest.current = requestId;
    setState({ status: 'compiling', completedFiles: 0, totalFiles: 0 });
    try {
      await controller.save();
      const snapshot = controller.getSnapshot();
      if (
        !snapshot.project ||
        snapshot.project.id !== initial.project.id ||
        snapshot.rootPath !== initial.rootPath
      )
        throw new Error('The project changed before Deploy could start.');
      const result = await window.webrad.deploy.run({
        requestId,
        rootPath: snapshot.rootPath,
        project: snapshot.project,
        userSources: { ...snapshot.userSources },
      });
      if (activeRequest.current !== requestId) return;
      if (result.cancelled) {
        setState(null);
        return;
      }
      if (
        result.outputDirectory &&
        result.outputDirectory !== snapshot.project.settings.build.deployDirectory
      ) {
        controller.updateProjectSettings({
          build: { ...snapshot.project.settings.build, deployDirectory: result.outputDirectory },
        });
        await controller.save();
      }
      const count = result.fileCount ?? 0;
      setState((current) => ({
        status: result.success ? 'success' : 'error',
        completedFiles: result.success ? count : (current?.completedFiles ?? 0),
        totalFiles: result.success ? count : (current?.totalFiles ?? 0),
        outputDirectory: result.outputDirectory,
        message: result.success
          ? undefined
          : (result.diagnostics.find((item) => item.category === 'error')?.message ??
            'Deploy failed. See Problems for details.'),
      }));
      onResult(result);
    } catch (error) {
      if (activeRequest.current !== requestId) return;
      const message = error instanceof Error ? error.message : String(error);
      setState((current) => ({
        status: 'error',
        completedFiles: current?.completedFiles ?? 0,
        totalFiles: current?.totalFiles ?? 0,
        message,
      }));
      onResult({ success: false, diagnostics: [{ category: 'error', source: 'ide', message }] });
    } finally {
      if (activeRequest.current === requestId) activeRequest.current = null;
    }
  }, [blocked, controller, onConfigure, onResult]);

  const close = useCallback(() => {
    if (!activeRequest.current) setState(null);
  }, []);
  return { state, busy, run, close };
}
