import { failure, RestGoError, success, type RestGoResult } from './errors';
import type { RestGoTransport } from './transport';
import type { RestGoVideosClient } from './videos';
import type {
  RestGoVideo,
  RestGoVideoResumeOptions,
  RestGoVideoResumeToken,
  RestGoVideoUploadOptions,
} from './video-types';
import { videoInteger } from './video-validation';

const fingerprintPartBytes = 8 * 1024 * 1024;

export function videoAbort(signal?: AbortSignal): void {
  if (signal?.aborted) throw new RestGoError('Video operation was aborted.', 'ABORTED');
}
export function videoDelay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    videoAbort(signal);
    const abort = (): void => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      reject(new RestGoError('Video operation was aborted.', 'ABORTED'));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', abort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', abort, { once: true });
  });
}
export function videoTransient(error: RestGoError): boolean {
  return (
    error.code === 'NETWORK_ERROR' ||
    [401, 409, 429].includes(error.status) ||
    (error.status >= 500 && error.status !== 507)
  );
}
export async function videoChecksum(chunk: Blob, signal?: AbortSignal): Promise<string> {
  videoAbort(signal);
  if (!globalThis.crypto?.subtle)
    throw new RestGoError(
      'Video upload requires Web Crypto in an HTTPS or localhost context.',
      'INVALID_ARGUMENT',
    );
  const hash = await crypto.subtle.digest('SHA-256', await chunk.arrayBuffer());
  videoAbort(signal);
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
/** Bounded memory fingerprint of every byte, independent of server chunk limits. */
async function fingerprint(file: File, signal?: AbortSignal): Promise<string> {
  let chain = await videoChecksum(new Blob([String(file.size)]), signal);
  for (let offset = 0; offset < file.size; offset += fingerprintPartBytes) {
    const part = await videoChecksum(file.slice(offset, offset + fingerprintPartBytes), signal);
    chain = await videoChecksum(new Blob([chain, part]), signal);
  }
  return chain;
}

export async function transferVideo(
  client: RestGoVideosClient,
  transport: RestGoTransport,
  file: File,
  options: RestGoVideoUploadOptions,
  resume?: RestGoVideoResumeOptions,
): Promise<RestGoResult<RestGoVideo>> {
  try {
    videoAbort(options.signal);
    const chunkBytes = options.chunkSizeBytes ?? fingerprintPartBytes;
    const maxRetries = options.maxRetries ?? 3;
    if (
      !videoInteger(chunkBytes, 1) ||
      !videoInteger(maxRetries) ||
      maxRetries > 10 ||
      !videoInteger(file.size, 1) ||
      !/\.(mp4|mov|mkv|webm)$/i.test(file.name)
    )
      return failure('Invalid video file, chunk size or retry count.', 'INVALID_ARGUMENT');
    const prepared = await transport.prepareSession();
    if (prepared.error) return prepared;
    const ownerId = transport.session()?.user.id;
    if (!ownerId) return failure('A user session is required.', 'AUTH_REQUIRED', 401);
    const version = transport.sessionVersion();
    const current = (): void => {
      videoAbort(options.signal);
      if (version !== transport.sessionVersion() || transport.session()?.user.id !== ownerId)
        throw new RestGoError(
          'The user session changed. Resume with the original owner.',
          'AUTH_OPERATION_CANCELLED',
        );
    };
    const checkpoint = resume?.resumeToken;
    if (
      checkpoint &&
      (checkpoint.version !== 1 ||
        checkpoint.baseUrl !== transport.baseUrl ||
        checkpoint.ownerId !== ownerId ||
        checkpoint.name !== file.name ||
        checkpoint.sizeBytes !== file.size ||
        checkpoint.lastModified !== file.lastModified ||
        !/^[a-f0-9]{64}$/.test(checkpoint.fingerprint))
    )
      return failure(
        'The resume checkpoint does not match this server, owner or file.',
        'INVALID_ARGUMENT',
      );
    options.onPhase?.('hashing');
    const hash = await fingerprint(file, options.signal);
    current();
    if (checkpoint && hash !== checkpoint.fingerprint)
      return failure(
        'The selected video content differs from the original upload.',
        'INVALID_ARGUMENT',
      );
    // Creation is deliberately attempted once: the backend has no creation idempotency key.
    if (!checkpoint) options.onPhase?.('creating');
    current();
    const initial = checkpoint
      ? await client.uploads.get(checkpoint.uploadId, options)
      : await client.uploads.create(
          {
            filename: file.name,
            sizeBytes: file.size,
            title: options.title,
            descri: options.descri,
            isPublic: options.isPublic,
          },
          options,
        );
    if (initial.error) return initial;
    current();
    let session = initial.data;
    if (checkpoint && session.videoId !== checkpoint.videoId)
      return failure('The resume checkpoint references a different video.', 'INVALID_RESPONSE');
    const token: RestGoVideoResumeToken = Object.freeze({
      version: 1,
      baseUrl: transport.baseUrl,
      ownerId,
      uploadId: session.id,
      videoId: session.videoId,
      name: file.name,
      sizeBytes: file.size,
      lastModified: file.lastModified,
      fingerprint: hash,
    });
    const notify = (): void => {
      current();
      if (session.sizeBytes !== file.size || session.state === 'cancelled')
        throw new RestGoError(
          'Upload session is cancelled or has an incompatible file size.',
          'INVALID_ARGUMENT',
        );
      if (session.state === 'open' && Date.parse(session.expiresAt) <= Date.now())
        throw new RestGoError(
          'Upload session expired. Start a new upload explicitly.',
          'HTTP_ERROR',
          410,
        );
      options.onSession?.(Object.freeze({ ...session }));
      options.onProgress?.({
        confirmedBytes: session.offset,
        totalBytes: file.size,
        percentage: (session.offset / file.size) * 100,
        chunk: null,
      });
    };
    options.onSession?.(Object.freeze({ ...session }));
    options.onResumeToken?.(token);
    notify();
    let retries = 0;
    const reconcile = async (error: RestGoError): Promise<void> => {
      let cause = error;
      for (;;) {
        if (!videoTransient(cause) || retries++ >= maxRetries) throw cause;
        await videoDelay(
          Math.min(30_000, cause.retryAfterMs ?? 250 * 2 ** (retries - 1)),
          options.signal,
        );
        current();
        const fetched = await client.uploads.get(session.id, options);
        if (fetched.error) {
          cause = fetched.error;
          continue;
        }
        if (
          fetched.data.id !== session.id ||
          fetched.data.videoId !== session.videoId ||
          fetched.data.offset < session.offset
        )
          throw new RestGoError(
            'RestGO returned an inconsistent upload session.',
            'INVALID_RESPONSE',
          );
        session = fetched.data;
        notify();
        return;
      }
    };
    while (session.state === 'open' && session.offset < file.size) {
      current();
      options.onPhase?.('uploading');
      const start = session.offset;
      const chunk = file.slice(
        start,
        Math.min(file.size, start + chunkBytes, start + session.maxChunkBytes),
      );
      const checksum = await videoChecksum(chunk, options.signal);
      current();
      const sent = await client.uploads.sendChunk(session.id, chunk, {
        offset: start,
        checksum,
        signal: options.signal,
        onUploadProgress: (progress) => {
          current();
          options.onProgress?.({
            confirmedBytes: session.offset,
            totalBytes: file.size,
            percentage: (session.offset / file.size) * 100,
            chunk: progress,
          });
        },
      });
      current();
      if (sent.error) {
        await reconcile(sent.error);
        continue;
      }
      if (
        sent.data.id !== session.id ||
        sent.data.videoId !== session.videoId ||
        sent.data.sizeBytes !== file.size ||
        sent.data.offset !== start + chunk.size ||
        sent.data.state !== 'open'
      )
        return failure('RestGO returned an inconsistent chunk confirmation.', 'INVALID_RESPONSE');
      session = sent.data;
      retries = 0;
      notify();
    }
    options.onPhase?.('finalizing');
    retries = 0;
    for (;;) {
      current();
      const completed = await client.uploads.complete(session.id, options);
      current();
      if (completed.error) {
        await reconcile(completed.error);
        continue;
      }
      if (
        completed.data.id !== session.videoId ||
        completed.data.sizeBytes !== file.size ||
        completed.data.status === 'uploading'
      )
        return failure('RestGO returned an inconsistent completed video.', 'INVALID_RESPONSE');
      session = { ...session, offset: file.size, state: 'completed' };
      notify();
      return success(completed.data);
    }
  } catch (error) {
    if (error instanceof RestGoError) return { data: null, error };
    return failure(error instanceof Error ? error.message : String(error), 'INVALID_ARGUMENT');
  }
}
