import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { collectExternalPackageImports } from '@webrad/language';
import type { PackageAction } from '../../shared/package-contracts';
import type { ProjectController, ProjectControllerSnapshot } from './state/project-controller';
import { PackageController } from './state/package-controller';

const EMPTY_LIBRARIES: Readonly<Record<string, string>> = Object.freeze({});

export function useProjectPackages({
  controller,
  snapshot,
  blocked,
}: {
  readonly controller: ProjectController;
  readonly snapshot: ProjectControllerSnapshot;
  readonly blocked: boolean;
}) {
  const projectId = snapshot.project?.id;
  const rootPath = snapshot.rootPath;
  const context = `${rootPath ?? ''}\n${projectId ?? ''}`;
  const manager = useMemo(
    () => new PackageController(controller, window.webrad.packages, context),
    [controller, context],
  );
  const state = useSyncExternalStore(manager.subscribe, manager.getSnapshot, manager.getSnapshot);
  const [typeSnapshot, setTypeSnapshot] = useState<{
    context: string;
    files: Readonly<Record<string, string>>;
    warnings: readonly string[];
  } | null>(null);
  const packageState = snapshot.project?.packages;
  const hasPackages = !!packageState && Object.keys(packageState.dependencies).length > 0;
  const dependencyRevision =
    packageState?.lockfile ?? JSON.stringify(packageState?.dependencies ?? {});
  const imports = useMemo(
    () => collectExternalPackageImports(snapshot.userSources),
    [snapshot.userSources],
  );
  const importsKey = JSON.stringify(imports);

  useEffect(() => manager.activate(), [manager]);
  useEffect(() => {
    if (!rootPath || !projectId || !hasPackages || !window.webrad.packages) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void window.webrad.packages
        .types({ rootPath, projectId, imports: JSON.parse(importsKey) as string[] })
        .then((result) => {
          if (!cancelled)
            setTypeSnapshot({ context, files: result.files, warnings: result.warnings });
        })
        .catch((failure: unknown) => {
          if (!cancelled)
            setTypeSnapshot({
              context,
              files: EMPTY_LIBRARIES,
              warnings: [failure instanceof Error ? failure.message : String(failure)],
            });
        });
    }, 180);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    context,
    rootPath,
    projectId,
    hasPackages,
    dependencyRevision,
    state.status?.revision,
    importsKey,
  ]);

  const run = useCallback(
    async (action: PackageAction, name?: string, version?: string): Promise<void> => {
      if (!blocked) await manager.run(action, name, version);
    },
    [blocked, manager],
  );
  return {
    ...state,
    show: manager.show,
    close: manager.close,
    refresh: manager.refresh,
    cancel: manager.cancel,
    run,
    packageLibraries:
      hasPackages && typeSnapshot?.context === context ? typeSnapshot.files : EMPTY_LIBRARIES,
    typeWarnings: hasPackages && typeSnapshot?.context === context ? typeSnapshot.warnings : [],
  };
}
