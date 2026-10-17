import { createHash } from 'node:crypto';
import sharp from 'sharp';
import type { ProjectSettings } from '@webrad/project-model';

export interface PwaOutput {
  readonly files: Readonly<Record<string, string>>;
  readonly binaryFiles: Readonly<Record<string, Uint8Array>>;
}

function defaultIcon(settings: ProjectSettings): Buffer {
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><rect width="512" height="512" rx="96" fill="${settings.pwa.themeColor}"/><path d="M112 162h64l40 150 40-112 40 112 40-150h64l-70 216h-64l-10-34-10 34h-64z" fill="#ffffff"/></svg>`,
  );
}

export async function createPwaOutput(
  settings: ProjectSettings,
  appFiles: Readonly<Record<string, string>>,
  appBinaryFiles: Readonly<Record<string, Uint8Array>>,
): Promise<PwaOutput> {
  const icon = settings.applicationIcon;
  const iconSource =
    icon === null
      ? defaultIcon(settings)
      : Buffer.from(icon.dataUrl.slice(icon.dataUrl.indexOf(',') + 1), 'base64');
  const binaryFiles: Record<string, Uint8Array> = {};
  await Promise.all(
    [192, 512].map(async (size) => {
      binaryFiles[`assets/icons/pwa-${String(size)}.png`] = await sharp(iconSource, {
        limitInputPixels: 40_000_000,
      })
        .resize(size, size, { fit: 'contain', background: settings.pwa.backgroundColor })
        .flatten({ background: settings.pwa.backgroundColor })
        .png()
        .toBuffer();
    }),
  );
  const manifest = {
    id: './',
    name: settings.applicationName,
    short_name: settings.pwa.shortName || settings.applicationName,
    description: settings.applicationDescription,
    lang: settings.locale,
    start_url: './',
    scope: './',
    display: settings.pwa.display,
    orientation: settings.pwa.orientation,
    theme_color: settings.pwa.themeColor,
    background_color: settings.pwa.backgroundColor,
    icons: [192, 512].map((size) => ({
      src: `./assets/icons/pwa-${String(size)}.png`,
      sizes: `${String(size)}x${String(size)}`,
      type: 'image/png',
      purpose: 'any',
    })),
  };
  const files: Record<string, string> = {
    'manifest.webmanifest': `${JSON.stringify(manifest, null, 2)}\n`,
  };
  files['assets/pwa-register.js'] = `(() => {
  if (!('serviceWorker' in navigator) || !window.isSecureContext || !['http:', 'https:'].includes(location.protocol)) return;
  const script = document.currentScript;
  if (!(script instanceof HTMLScriptElement)) return;
  const scope = new URL('../', script.src);
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register(new URL('service-worker.js', scope), { scope: scope.href, updateViaCache: 'none' }).catch(() => {});
  }, { once: true });
})();
`;
  const shellFiles = Object.keys({ ...appFiles, ...files, ...appBinaryFiles, ...binaryFiles })
    .filter((name) => !name.endsWith('.map') && !name.includes('/licenses/'))
    .sort();
  const revision = createHash('sha256');
  for (const [name, contents] of Object.entries({
    ...appFiles,
    ...files,
    ...appBinaryFiles,
    ...binaryFiles,
  }).sort(([a], [b]) => a.localeCompare(b)))
    revision.update(name).update(contents);
  files['service-worker.js'] =
    `// Generated application shell. API responses and user data are never cached.
const scope = new URL(self.registration.scope);
const prefix = 'webrad-' + encodeURIComponent(scope.pathname) + '-';
const cacheName = prefix + ${JSON.stringify(revision.digest('hex').slice(0, 20))};
const offline = ${String(settings.pwa.offline)};
const shell = ${JSON.stringify(shellFiles)}.map((path) => new URL(path.split('/').map(encodeURIComponent).join('/'), scope).href);
const shellUrls = new Set(shell);
const indexUrl = new URL('index.html', scope).href;

self.addEventListener('install', (event) => {
  if (offline) event.waitUntil(caches.open(cacheName).then((cache) => cache.addAll(shell.map((url) => new Request(url, { cache: 'reload' })))));
  // Updates wait for existing windows to close, keeping each application version coherent.
});
self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((names) => Promise.all(names.filter((name) => name.startsWith(prefix) && (!offline || name !== cacheName)).map((name) => caches.delete(name)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (!offline || request.method !== 'GET' || url.origin !== scope.origin) return;
  const navigation = request.mode === 'navigate' && (url.pathname === scope.pathname || url.pathname === new URL(indexUrl).pathname);
  if (!navigation && url.search !== '') return;
  if (!navigation && !shellUrls.has(url.href)) return;
  event.respondWith(caches.open(cacheName).then(async (cache) => {
    const cached = await cache.match(navigation ? indexUrl : request);
    return cached || fetch(request);
  }));
});
`;
  return { files, binaryFiles };
}

/** Replaces a previously installed worker when PWA is disabled in a subsequent deploy. */
export function createPwaRetirementWorker(): string {
  return `// Retire only this application's prior offline shell.
self.addEventListener('install', (event) => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', (event) => {
  const scope = new URL(self.registration.scope);
  const prefix = 'webrad-' + encodeURIComponent(scope.pathname) + '-';
  event.waitUntil(caches.keys().then((names) => Promise.all(names.filter((name) => name.startsWith(prefix)).map((name) => caches.delete(name)))).then(() => self.registration.unregister()));
});
`;
}
