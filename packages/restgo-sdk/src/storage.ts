import { failure, success, type RestGoResult } from './errors';
import { type RestGoTransport } from './transport';
import type {
  RestGoFileOptions,
  RestGoFileUpdate,
  RestGoList,
  RestGoListOptions,
  RestGoStorageUsage,
  RestGoStoredFile,
} from './types';

function validId(id: string): boolean {
  return /^[A-Za-z0-9_-]+$/.test(id);
}

function fileForm(file: Blob | undefined, options: RestGoFileOptions): FormData {
  const body = new FormData();
  if (file)
    body.append(
      'file',
      file,
      options.name ?? (typeof File !== 'undefined' && file instanceof File ? file.name : 'file'),
    );
  if (options.name !== undefined) body.append('name', options.name);
  if (options.isPublic !== undefined) body.append('isPublic', String(options.isPublic));
  if (options.ownerId !== undefined) body.append('ownerId', options.ownerId);
  return body;
}

export class RestGoStorageClient {
  constructor(private readonly transport: RestGoTransport) {}

  list(options: RestGoListOptions = {}): Promise<RestGoResult<RestGoList<RestGoStoredFile>>> {
    return this.transport.request('/storage/files', {
      auth: 'session',
      sessionAuthority: true,
      signal: options.signal,
      query: {
        page: options.page,
        page_size: options.pageSize,
        q: options.q,
        ownerId: options.ownerId,
      },
    });
  }

  upload(file: Blob, options: RestGoFileOptions = {}): Promise<RestGoResult<RestGoStoredFile>> {
    return this.transport.request('/storage/files', {
      method: 'POST',
      body: fileForm(file, options),
      signal: options.signal,
      auth: 'session',
      sessionAuthority: true,
    });
  }

  get(id: string, options: { signal?: AbortSignal } = {}): Promise<RestGoResult<RestGoStoredFile>> {
    return this.fileRequest(id, 'GET', options);
  }

  update(id: string, input: RestGoFileUpdate): Promise<RestGoResult<RestGoStoredFile>> {
    if (!validId(id))
      return Promise.resolve(failure('A valid file ID is required.', 'INVALID_ARGUMENT'));
    return this.transport.request(`/storage/files/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: fileForm(input.file, input),
      signal: input.signal,
      auth: 'session',
      sessionAuthority: true,
    });
  }

  remove(id: string, options: { signal?: AbortSignal } = {}): Promise<RestGoResult<null>> {
    return this.fileRequest(id, 'DELETE', options);
  }

  private fileRequest<T>(
    id: string,
    method: string,
    options: { signal?: AbortSignal },
  ): Promise<RestGoResult<T>> {
    if (!validId(id))
      return Promise.resolve(failure('A valid file ID is required.', 'INVALID_ARGUMENT'));
    return this.transport.request(`/storage/files/${encodeURIComponent(id)}`, {
      ...options,
      method,
      auth: 'session',
      sessionAuthority: true,
    });
  }

  download(
    id: string,
    options: { range?: string; public?: boolean; signal?: AbortSignal } = {},
  ): Promise<RestGoResult<Blob>> {
    if (!validId(id))
      return Promise.resolve(failure('A valid file ID is required.', 'INVALID_ARGUMENT'));
    return this.transport.request(`/storage/files/${encodeURIComponent(id)}/download`, {
      responseType: 'blob',
      auth: options.public || !this.transport.session() ? 'none' : 'session',
      sessionAuthority: true,
      signal: options.signal,
      headers: options.range ? { Range: options.range } : undefined,
    });
  }

  /** Constructs a URL; public access still depends on the file's isPublic metadata. */
  getPublicUrl(id: string): RestGoResult<{ publicUrl: string }> {
    if (!validId(id)) return failure('A valid file ID is required.', 'INVALID_ARGUMENT');
    return success({
      publicUrl: this.transport.url(`/storage/files/${encodeURIComponent(id)}/download`),
    });
  }

  usage(options: { signal?: AbortSignal } = {}): Promise<RestGoResult<RestGoStorageUsage>> {
    return this.transport.request('/storage/usage', {
      ...options,
      auth: 'session',
      sessionAuthority: true,
    });
  }
}
