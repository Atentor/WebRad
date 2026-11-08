import { useEffect, useRef, useState } from 'react';
import type { RestGoPublishedApi } from '@webrad/designer';
import { restGoCatalogToPublishedApis, restGoErrorMessage } from './restgo-workspace-model';

/** Catalog data stays in the IDE; only the selected request is saved to the project. */
export function useRestGoApiCatalog(enabled: boolean, baseUrl: string) {
  const [apis, setApis] = useState<readonly RestGoPublishedApi[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadedBaseUrl, setLoadedBaseUrl] = useState<string | null>(null);
  const requestVersion = useRef(0);
  useEffect(() => {
    if (!enabled || loadedBaseUrl === baseUrl) return;
    const version = ++requestVersion.current;
    let cancelled = false;
    void (async () => {
      try {
        await Promise.resolve();
        if (cancelled || requestVersion.current !== version) return;
        setApis([]);
        setError(null);
        setLoading(true);
        const status = await window.webrad.restgoAdmin.status({ baseUrl });
        if (cancelled || requestVersion.current !== version) return;
        if (!status.connected)
          throw new Error('Connect administrative access in Import from RestGo to load methods.');
        const catalog = await window.webrad.restgoAdmin.catalog({ baseUrl });
        if (cancelled || requestVersion.current !== version) return;
        setLoadedBaseUrl(baseUrl);
        setApis(restGoCatalogToPublishedApis(catalog));
      } catch (reason) {
        if (!cancelled && requestVersion.current === version) setError(restGoErrorMessage(reason));
      } finally {
        if (!cancelled && requestVersion.current === version) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, baseUrl, loadedBaseUrl]);
  const acceptApis = (next: readonly RestGoPublishedApi[]): void => {
    requestVersion.current += 1;
    setLoadedBaseUrl(baseUrl);
    setApis(next);
    setLoading(false);
    setError(null);
  };
  return { apis: loadedBaseUrl === baseUrl ? apis : [], loading, error, acceptApis };
}
