import { createHash, randomUUID } from 'node:crypto';
import {
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { safeStorage } from 'electron';
import { z } from 'zod';

export interface PreviewRestGoSessionOptions {
  readonly rootPath: string;
  readonly projectId: string;
  readonly userDataPath: string;
  readonly baseUrl: string;
  readonly storageKey: string;
}

export interface PreviewRestGoSession {
  readonly baseUrl: string;
  readonly storageKey: string;
  readonly scope: string;
  readonly durable: boolean;
  read(): string | null;
  write(value: string): void;
  remove(): void;
}

const temporarySessions = new Map<string, string>();

export class InvalidPreviewSessionError extends Error {}

/** Only application credentials live here; no administrative token or Project Model data. */
export function createPreviewRestGoSession(
  options: PreviewRestGoSessionOptions,
): PreviewRestGoSession {
  const durable =
    safeStorage?.isEncryptionAvailable() === true &&
    (process.platform !== 'linux' || safeStorage.getSelectedStorageBackend() !== 'basic_text');
  const baseUrl = new URL(options.baseUrl).href.replace(/\/+$/u, '');
  const root = realpathSync(options.rootPath);
  const scope = createHash('sha256')
    .update(
      JSON.stringify([
        process.platform === 'win32' ? root.toLowerCase() : root,
        options.projectId,
        baseUrl,
        options.storageKey,
      ]),
    )
    .digest('hex');
  const directory = path.join(options.userDataPath, 'preview-restgo-sessions');
  const target = path.join(directory, scope + '.bin');
  const schema = z
    .object({
      baseUrl: z.literal(baseUrl),
      token: z.string().min(1).max(8192),
      expiresAt: z.string().datetime({ offset: true }),
      refreshToken: z.string().min(1).max(8192).optional(),
      refreshExpiresAt: z.string().datetime({ offset: true }).optional(),
    })
    .strict()
    .refine(
      (value) => (value.refreshToken === undefined) === (value.refreshExpiresAt === undefined),
    );
  const validate = (value: string): string => {
    try {
      if (Buffer.byteLength(value) > 32768) throw new Error('Invalid size.');
      return JSON.stringify(schema.parse(JSON.parse(value)));
    } catch {
      throw new InvalidPreviewSessionError('Invalid Preview session.');
    }
  };
  return {
    baseUrl: options.baseUrl,
    storageKey: options.storageKey,
    scope,
    durable,
    read: () => {
      if (!durable) return temporarySessions.get(scope) ?? null;
      try {
        const encrypted = readFileSync(target);
        if (encrypted.byteLength > 65536) return null;
        return validate(safeStorage.decryptString(encrypted));
      } catch {
        return null;
      }
    },
    write: (value) => {
      if (!durable) {
        temporarySessions.set(scope, validate(value));
        return;
      }
      const encrypted = safeStorage.encryptString(validate(value));
      mkdirSync(directory, { recursive: true, mode: 0o700 });
      const temporary = target + '.' + randomUUID() + '.tmp';
      try {
        writeFileSync(temporary, encrypted, { flag: 'wx', mode: 0o600 });
        renameSync(temporary, target);
      } finally {
        try {
          unlinkSync(temporary);
        } catch {
          // Already renamed or never created.
        }
      }
    },
    remove: () => {
      if (!durable) {
        temporarySessions.delete(scope);
        return;
      }
      try {
        unlinkSync(target);
      } catch (error) {
        if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
      }
    },
  };
}

/** A per-publication capability exposes only this project's application session. */
export function previewRestGoSessionScript(
  session: PreviewRestGoSession,
  endpoint: string,
  capability: string,
): string {
  const configuration = JSON.stringify({
    baseUrl: session.baseUrl,
    storageKey: session.storageKey,
    scope: session.scope,
    endpoint,
    capability,
  }).replaceAll('<', '\\u003c');
  return `<script>(() => {
    const config = ${configuration};
    const notificationKey = 'webrad-preview-session:' + config.scope;
    function request(method, value) {
      const xhr = new XMLHttpRequest();
      xhr.open(method, config.endpoint, false);
      xhr.setRequestHeader('X-WebRAD-Preview-Session', config.capability);
      if (method === 'PUT') xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.send(value === undefined ? null : value);
      if (xhr.status !== 200) throw new Error('Preview session storage is unavailable.');
      return JSON.parse(xhr.responseText);
    }
    function notify() {
      try { localStorage.setItem(notificationKey, crypto.randomUUID()); } catch {}
    }
    window.addEventListener('webrad:restgo-storage', event => {
      const detail = event.detail;
      if (!detail || detail.baseUrl !== config.baseUrl || detail.storageKey !== config.storageKey) return;
      detail.storage = {
        getItem(key) { return key === config.storageKey ? request('GET') : null; },
        setItem(key, value) {
          if (key !== config.storageKey) throw new Error('Invalid Preview session key.');
          request('PUT', value); notify();
        },
        removeItem(key) {
          if (key !== config.storageKey) throw new Error('Invalid Preview session key.');
          request('DELETE'); notify();
        },
        subscribe(callback) {
          const listener = event => { if (event.key === notificationKey) callback(); };
          window.addEventListener('storage', listener);
          return () => window.removeEventListener('storage', listener);
        }
      };
    });
  })();</script>`;
}
