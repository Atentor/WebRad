import type { RestGoUploadProgress } from './types';

type UploadProgressCallback = (progress: RestGoUploadProgress) => void;

/** XHR omits ambient credentials only for requests that start across origins. */
export function supportsCrossOriginUpload(url: string): boolean {
  if (typeof XMLHttpRequest === 'undefined' || typeof location === 'undefined') return false;
  const target = new URL(url);
  return (
    ['http:', 'https:'].includes(target.protocol) &&
    ['http:', 'https:'].includes(location.protocol) &&
    target.origin !== location.origin
  );
}

export function notifyUploadProgress(
  callback: UploadProgressCallback,
  progress: RestGoUploadProgress,
): void {
  try {
    callback({ ...progress });
  } catch {
    // A consumer's progress handler must not interrupt the underlying request.
  }
}

/**
 * Cross-origin XHR provides bytes sent by the browser without dashboard cookies.
 * Unlike fetch, XHR cannot prevent redirects before following them. Reject a changed
 * response URL so a redirected response cannot be accepted as RestGo metadata.
 */
export function requestWithUploadProgress(
  url: string,
  method: string,
  headers: Headers,
  body: FormData | Blob | string,
  signal: AbortSignal | undefined,
  callback: UploadProgressCallback,
  responseType: 'json' | 'blob' | undefined,
): Promise<Response> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let settled = false;
    const cleanup = () => {
      signal?.removeEventListener('abort', abort);
      xhr.upload.removeEventListener('progress', progress);
      xhr.removeEventListener('load', load);
      xhr.removeEventListener('error', error);
      xhr.removeEventListener('abort', aborted);
      xhr.removeEventListener('timeout', error);
    };
    const fail = (reason: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(reason);
    };
    const aborted = () => fail(new DOMException('RestGo request was aborted.', 'AbortError'));
    const abort = () => {
      xhr.abort();
      // An abort before send() may not dispatch an XHR abort event.
      aborted();
    };
    const error = () => fail(new TypeError('Unable to reach RestGo.'));
    const progress = (event: ProgressEvent<XMLHttpRequestEventTarget>) => {
      if (settled || signal?.aborted) return;
      const lengthComputable = event.lengthComputable && event.total > 0;
      notifyUploadProgress(callback, {
        loaded: event.loaded,
        total: lengthComputable ? event.total : null,
        percentage: lengthComputable
          ? Math.min(100, Math.max(0, (event.loaded / event.total) * 100))
          : null,
        lengthComputable,
      });
    };
    const load = () => {
      if (settled) return;
      try {
        if (!xhr.responseURL || new URL(xhr.responseURL).href !== url) {
          fail(new TypeError('RestGo upload redirects are not accepted.'));
          return;
        }
        const responseHeaders = new Headers();
        for (const line of xhr.getAllResponseHeaders().split(/\r?\n/)) {
          const separator = line.indexOf(':');
          if (separator > 0)
            responseHeaders.append(line.slice(0, separator), line.slice(separator + 1).trim());
        }
        const responseBody =
          xhr.status === 204 || xhr.status === 205 || method === 'HEAD'
            ? null
            : responseType === 'blob'
              ? (xhr.response as Blob)
              : xhr.responseText;
        const response = new Response(responseBody, {
          status: xhr.status,
          statusText: xhr.statusText,
          headers: responseHeaders,
        });
        settled = true;
        cleanup();
        resolve(response);
      } catch (reason) {
        fail(reason);
      }
    };

    try {
      // Register upload listeners before open() for browser interoperability.
      xhr.upload.addEventListener('progress', progress);
      xhr.addEventListener('load', load);
      xhr.addEventListener('error', error);
      xhr.addEventListener('abort', aborted);
      xhr.addEventListener('timeout', error);
      signal?.addEventListener('abort', abort, { once: true });
      if (signal?.aborted) {
        aborted();
        return;
      }
      xhr.open(method, url, true);
      xhr.withCredentials = false;
      xhr.responseType = responseType === 'blob' ? 'blob' : 'text';
      headers.forEach((value, name) => xhr.setRequestHeader(name, value));
      xhr.send(body);
    } catch (reason) {
      fail(reason);
    }
  });
}
