import { app } from 'electron';
import { UpdateService } from './update-service';
import { selectUpdateBackend } from './update-backends';
import { latestManifestUrl, DEFAULT_RELEASE_REPOSITORY, releaseRepository } from './update-release';
import { readUpdateManifest } from './update-network';

declare const __WEBRAD_RELEASE_REPOSITORY__: string;

export function createApplicationUpdates(canInstall: () => boolean): UpdateService {
  const repository = releaseRepository(
    typeof __WEBRAD_RELEASE_REPOSITORY__ === 'string'
      ? __WEBRAD_RELEASE_REPOSITORY__
      : DEFAULT_RELEASE_REPOSITORY,
  );
  return new UpdateService({
    currentVersion: app.getVersion(),
    disabled: !app.isPackaged || process.argv.includes('--webrad-smoke'),
    canInstall,
    readManifest: () => readUpdateManifest(latestManifestUrl(repository)),
    selectBackend: (manifest) => selectUpdateBackend(repository, manifest),
  });
}

export function scheduleUpdateChecks(service: UpdateService): () => void {
  if (service.getState().status === 'disabled') return () => undefined;
  const first = setTimeout(() => {
    void service.check();
  }, 15_000);
  const recurring = setInterval(
    () => {
      void service.check();
    },
    6 * 60 * 60_000,
  );
  first.unref();
  recurring.unref();
  return () => {
    clearTimeout(first);
    clearInterval(recurring);
  };
}
