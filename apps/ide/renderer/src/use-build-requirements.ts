import { useEffect, useRef, useState } from 'react';
import type { NativeApplicationSettings } from '@webrad/project-model';
import type { NativePrerequisiteReport } from '@webrad/native-build/contracts';
import type { NativeBuildResponse } from '../../shared/native-build-contracts';

/** Only toolchain-affecting settings invalidate a prerequisite report. */
export function buildRequirementsKey(settings: NativeApplicationSettings): string {
  const { platform, architecture, bundleFormat, configuration } = settings.build;
  return JSON.stringify({
    platform,
    architecture,
    bundleFormat,
    configuration,
    signing: settings.signing,
  });
}

interface Inspection {
  readonly key: string;
  readonly revision: number;
  readonly resultId?: string;
  readonly report?: NativePrerequisiteReport;
  readonly error?: string;
}

export function useBuildRequirements({
  settings,
  inspect,
  result,
  submittedKey,
}: {
  readonly settings: NativeApplicationSettings;
  readonly inspect: (settings: NativeApplicationSettings) => Promise<NativePrerequisiteReport>;
  readonly result?: NativeBuildResponse;
  readonly submittedKey: string | null;
}) {
  const key = buildRequirementsKey(settings);
  const [revision, setRevision] = useState(0);
  const [inspection, setInspection] = useState<Inspection | null>(null);
  const appliedResult = useRef<string | undefined>(undefined);
  const resultId = result?.requestId;

  useEffect(() => {
    let active = true;
    const returnedReport =
      result?.prerequisites && result.requestId !== appliedResult.current && submittedKey === key
        ? result.prerequisites
        : undefined;
    if (returnedReport !== undefined) appliedResult.current = result?.requestId;
    // Reports from the build's real preflight take precedence once; Check again
    // then inspects the machine afresh, including tools installed after a failure.
    const pending =
      returnedReport === undefined ? inspect(settings) : Promise.resolve(returnedReport);
    void pending.then(
      (report) => {
        if (active) setInspection({ key, revision, resultId, report });
      },
      (cause: unknown) => {
        if (active)
          setInspection({
            key,
            revision,
            resultId,
            error: cause instanceof Error ? cause.message : String(cause),
          });
      },
    );
    return () => {
      active = false;
    };
  }, [inspect, settings, key, revision, resultId, result, submittedKey]);

  const current = inspection?.key === key ? inspection : null;
  return {
    report: current?.report,
    error: current?.error,
    checking: current === null || current.revision !== revision || current.resultId !== resultId,
    refresh: (): void => setRevision((value) => value + 1),
  };
}
