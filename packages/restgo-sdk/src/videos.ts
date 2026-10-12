import { failure, isRecord, success, type RestGoResult } from './errors';
import type { RestGoTransport, TransportRequest } from './transport';
import { transferVideo, videoAbort, videoDelay, videoTransient } from './video-upload';
import {
  videoDetails,
  videoId,
  videoInteger,
  videoNumber,
  videoRecord,
  videoSession,
  videoVariants,
} from './video-validation';
import type {
  RestGoVideo,
  RestGoVideoChunkOptions,
  RestGoVideoCreateInput,
  RestGoVideoDetails,
  RestGoVideoHlsDescriptor,
  RestGoVideoList,
  RestGoVideoListOptions,
  RestGoVideoRequestOptions,
  RestGoVideoResumeOptions,
  RestGoVideoUpdate,
  RestGoVideoUploadOptions,
  RestGoVideoUploadSession,
  RestGoVideoWaitOptions,
} from './video-types';

export class RestGoVideoUploadsClient {
  constructor(private readonly transport: RestGoTransport) {}
  async create(
    input: RestGoVideoCreateInput,
    options: RestGoVideoRequestOptions = {},
  ): Promise<RestGoResult<RestGoVideoUploadSession>> {
    if (
      !videoInteger(input.sizeBytes, 1) ||
      !/\.(mp4|mov|mkv|webm)$/i.test(input.filename) ||
      /[/\\\0]/.test(input.filename) ||
      input.filename.length > 255 ||
      (input.title !== undefined && typeof input.title !== 'string') ||
      (input.descri !== undefined && typeof input.descri !== 'string') ||
      (input.isPublic !== undefined && typeof input.isPublic !== 'boolean')
    )
      return failure('Invalid video upload metadata.', 'INVALID_ARGUMENT');
    return this.request(
      '',
      { ...options, method: 'POST', body: input, retryUnauthorized: false },
      videoSession,
    );
  }
  get(
    id: string,
    options: RestGoVideoRequestOptions = {},
  ): Promise<RestGoResult<RestGoVideoUploadSession>> {
    return this.requestId(id, '', options, videoSession);
  }
  sendChunk(
    id: string,
    chunk: Blob,
    options: RestGoVideoChunkOptions,
  ): Promise<RestGoResult<RestGoVideoUploadSession>> {
    if (
      !videoInteger(options.offset) ||
      !videoInteger(chunk.size, 1) ||
      !/^[a-fA-F0-9]{64}$/.test(options.checksum)
    )
      return Promise.resolve(
        failure('Invalid chunk offset, size or SHA-256 checksum.', 'INVALID_ARGUMENT'),
      );
    return this.requestId(
      id,
      '/chunks',
      {
        signal: options.signal,
        method: 'PUT',
        body: chunk,
        binary: true,
        retryUnauthorized: false,
        headers: { 'Upload-Offset': String(options.offset), 'Upload-Checksum': options.checksum },
        onUploadProgress: options.onUploadProgress,
      },
      videoSession,
    );
  }
  complete(
    id: string,
    options: RestGoVideoRequestOptions = {},
  ): Promise<RestGoResult<RestGoVideo>> {
    return this.requestId(
      id,
      '/complete',
      { ...options, method: 'POST', retryUnauthorized: false },
      videoRecord,
    );
  }
  cancel(
    id: string,
    options: RestGoVideoRequestOptions = {},
  ): Promise<RestGoResult<{ status: 'deleting' }>> {
    return this.requestId(
      id,
      '',
      { ...options, method: 'DELETE' },
      (value): value is { status: 'deleting' } => isRecord(value) && value.status === 'deleting',
    );
  }
  private requestId<T>(
    id: string,
    suffix: string,
    options: TransportRequest,
    guard: (value: unknown) => value is T,
  ): Promise<RestGoResult<T>> {
    if (!videoId(id))
      return Promise.resolve(failure('A valid upload ID is required.', 'INVALID_ARGUMENT'));
    return this.request(`/${encodeURIComponent(id)}${suffix}`, options, guard);
  }
  private async request<T>(
    suffix: string,
    options: TransportRequest,
    guard: (value: unknown) => value is T,
  ): Promise<RestGoResult<T>> {
    const result = await this.transport.request<unknown>(`/videos/uploads${suffix}`, {
      ...options,
      auth: 'session',
    });
    if (result.error) return result;
    return guard(result.data)
      ? success(result.data)
      : failure('RestGO returned invalid video upload data.', 'INVALID_RESPONSE');
  }
}

export class RestGoVideosClient {
  readonly uploads: RestGoVideoUploadsClient;
  constructor(private readonly transport: RestGoTransport) {
    this.uploads = new RestGoVideoUploadsClient(transport);
  }
  upload(file: File, options: RestGoVideoUploadOptions = {}): Promise<RestGoResult<RestGoVideo>> {
    return transferVideo(this, this.transport, file, options);
  }
  resumeUpload(
    id: string,
    file: File,
    options: RestGoVideoResumeOptions,
  ): Promise<RestGoResult<RestGoVideo>> {
    if (!videoId(id) || id !== options.resumeToken.uploadId)
      return Promise.resolve(
        failure('The resume checkpoint must match the upload ID.', 'INVALID_ARGUMENT'),
      );
    return transferVideo(this, this.transport, file, options, options);
  }
  async list(options: RestGoVideoListOptions = {}): Promise<RestGoResult<RestGoVideoList>> {
    if (
      !videoInteger(options.limit ?? 25, 1) ||
      (options.limit ?? 25) > 100 ||
      !videoInteger(options.offset ?? 0)
    )
      return failure('Invalid video pagination.', 'INVALID_ARGUMENT');
    const result = await this.transport.request<unknown>('/videos', {
      auth: 'session',
      signal: options.signal,
      query: { limit: options.limit, offset: options.offset, q: options.q, status: options.status },
    });
    if (result.error) return result;
    const data = result.data;
    return isRecord(data) &&
      Array.isArray(data.data) &&
      data.data.every(videoRecord) &&
      videoInteger(data.total) &&
      videoInteger(data.limit, 1) &&
      videoInteger(data.offset)
      ? success(data as unknown as RestGoVideoList)
      : failure('RestGO returned invalid video list data.', 'INVALID_RESPONSE');
  }
  get(
    id: string,
    options: RestGoVideoRequestOptions = {},
  ): Promise<RestGoResult<RestGoVideoDetails>> {
    return this.request(id, '', options, videoDetails);
  }
  update(
    id: string,
    input: RestGoVideoUpdate,
    options: RestGoVideoRequestOptions = {},
  ): Promise<RestGoResult<RestGoVideo>> {
    if (
      typeof input.title !== 'string' ||
      typeof input.descri !== 'string' ||
      typeof input.isPublic !== 'boolean'
    )
      return Promise.resolve(
        failure('Supply complete title, descri and isPublic metadata.', 'INVALID_ARGUMENT'),
      );
    return this.request(id, '', { ...options, method: 'PUT', body: input }, videoRecord);
  }
  remove(
    id: string,
    options: RestGoVideoRequestOptions = {},
  ): Promise<RestGoResult<{ id: string; status: 'deleting' }>> {
    return this.request(
      id,
      '',
      { ...options, method: 'DELETE' },
      (value): value is { id: string; status: 'deleting' } =>
        isRecord(value) && value.id === id && value.status === 'deleting',
    );
  }
  process(
    id: string,
    options: RestGoVideoRequestOptions = {},
  ): Promise<RestGoResult<{ id: string; jobId: string; status: 'pending' }>> {
    return this.job(id, 'process', options);
  }
  reprocess(
    id: string,
    options: RestGoVideoRequestOptions = {},
  ): Promise<RestGoResult<{ id: string; jobId: string; status: 'pending' }>> {
    return this.job(id, 'reprocess', options);
  }
  cancelProcessing(
    id: string,
    options: RestGoVideoRequestOptions = {},
  ): Promise<RestGoResult<{ id: string; state: 'cancelled' }>> {
    return this.request(
      id,
      '/cancel',
      { ...options, method: 'POST' },
      (value): value is { id: string; state: 'cancelled' } =>
        isRecord(value) && value.id === id && value.state === 'cancelled',
    );
  }
  async getHls(
    id: string,
    options: RestGoVideoRequestOptions & { public?: boolean } = {},
  ): Promise<RestGoResult<RestGoVideoHlsDescriptor>> {
    const result = await this.request(
      id,
      '/hls',
      { ...options, auth: options.public ? 'none' : 'session' },
      (
        value,
      ): value is Omit<RestGoVideoHlsDescriptor, 'masterAbsoluteUrl' | 'thumbnailAbsoluteUrl'> =>
        isRecord(value) &&
        value.id === id &&
        typeof value.title === 'string' &&
        typeof value.isPublic === 'boolean' &&
        typeof value.masterUrl === 'string' &&
        typeof value.thumbnailUrl === 'string' &&
        videoVariants(value.variants) &&
        videoNumber(value.duration) &&
        typeof value.authentication === 'string',
    );
    if (result.error) return result;
    const resolve = (value: string): string | null => {
      // Descriptors are module-relative paths, never external credential destinations.
      if (
        !value.startsWith(`/videos/${id}/`) ||
        /[\\?#]/.test(value) ||
        value.split('/').some((part) => part === '..' || part === '.' || part.includes('%'))
      )
        return null;
      return this.transport.url(value);
    };
    const masterAbsoluteUrl = resolve(result.data.masterUrl);
    const thumbnailAbsoluteUrl = resolve(result.data.thumbnailUrl);
    return masterAbsoluteUrl && thumbnailAbsoluteUrl
      ? success({ ...result.data, masterAbsoluteUrl, thumbnailAbsoluteUrl })
      : failure('RestGO returned a video URL outside the module scope.', 'INVALID_RESPONSE');
  }
  getThumbnail(
    id: string,
    options: RestGoVideoRequestOptions & { public?: boolean } = {},
  ): Promise<RestGoResult<Blob>> {
    return this.request(
      id,
      '/thumbnail',
      { ...options, responseType: 'blob', auth: options.public ? 'none' : 'session' },
      (value): value is Blob => value instanceof Blob,
    );
  }
  async waitUntilReady(
    id: string,
    options: RestGoVideoWaitOptions = {},
  ): Promise<RestGoResult<RestGoVideo>> {
    const timeout = options.timeoutMs ?? 600_000;
    const interval = options.intervalMs ?? 2000;
    if (!videoInteger(timeout, 1) || !videoInteger(interval, 1))
      return failure('Invalid polling interval or timeout.', 'INVALID_ARGUMENT');
    const deadline = Date.now() + timeout;
    const controller = new AbortController();
    const abort = (): void => controller.abort();
    options.signal?.addEventListener('abort', abort, { once: true });
    if (options.signal?.aborted) abort();
    const timer = setTimeout(abort, timeout);
    const version = this.transport.sessionVersion();
    let retries = 0;
    try {
      for (;;) {
        videoAbort(controller.signal);
        if (version !== this.transport.sessionVersion())
          return failure('The user session changed.', 'AUTH_OPERATION_CANCELLED');
        const result = await this.get(id, { signal: controller.signal });
        videoAbort(controller.signal);
        if (version !== this.transport.sessionVersion())
          return failure('The user session changed.', 'AUTH_OPERATION_CANCELLED');
        if (result.error) {
          if (!videoTransient(result.error) || result.error.status === 409 || retries++ >= 3)
            return result;
          await videoDelay(
            Math.min(30_000, result.error.retryAfterMs ?? interval * 2 ** retries),
            controller.signal,
          );
          continue;
        }
        retries = 0;
        options.onProgress?.(result.data);
        const video = result.data.video;
        if (video.status === 'ready' && video.generation) {
          const hls = await this.getHls(id, { signal: controller.signal });
          if (hls.error) return hls;
          return success(video);
        }
        if (
          video.status === 'failed' ||
          video.status === 'deleting' ||
          result.data.jobs[0]?.state === 'cancelled'
        )
          return failure(
            video.error || 'Video processing failed or was cancelled.',
            'HTTP_ERROR',
            409,
          );
        await videoDelay(interval, controller.signal);
      }
    } catch (error) {
      return failure(
        Date.now() >= deadline && !options.signal?.aborted
          ? 'Video processing timed out.'
          : error instanceof Error
            ? error.message
            : String(error),
        'ABORTED',
      );
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', abort);
    }
  }
  private job(
    id: string,
    operation: string,
    options: RestGoVideoRequestOptions,
  ): Promise<RestGoResult<{ id: string; jobId: string; status: 'pending' }>> {
    return this.request(
      id,
      `/${operation}`,
      { ...options, method: 'POST', retryUnauthorized: false },
      (value): value is { id: string; jobId: string; status: 'pending' } =>
        isRecord(value) && value.id === id && videoId(value.jobId) && value.status === 'pending',
    );
  }
  private async request<T>(
    id: string,
    suffix: string,
    options: TransportRequest,
    guard: (value: unknown) => value is T,
  ): Promise<RestGoResult<T>> {
    if (!videoId(id)) return failure('A valid video ID is required.', 'INVALID_ARGUMENT');
    const result = await this.transport.request<unknown>(
      `/videos/${encodeURIComponent(id)}${suffix}`,
      { auth: 'session', ...options },
    );
    if (result.error) return result;
    return guard(result.data)
      ? success(result.data)
      : failure('RestGO returned invalid video data.', 'INVALID_RESPONSE');
  }
}
