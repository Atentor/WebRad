import type { ApiClientConfiguration, ApiClientOperation } from '@webrad/project-model';

export interface ApiClientTestRequest {
  readonly url: string;
  readonly init: RequestInit;
}

/** Builds a real browser request without persisting test credentials or uploads. */
export function createApiClientTestRequest(
  baseUrl: string,
  configuration: ApiClientConfiguration,
  operation: ApiClientOperation,
  uploads: readonly File[] = [],
  uploadField = 'file',
): ApiClientTestRequest {
  const method = operation.method.trim().toUpperCase();
  if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/u.test(method)) {
    throw new Error('Enter a valid HTTP method.');
  }
  if (['CONNECT', 'TRACE', 'TRACK'].includes(method)) {
    throw new Error(`${method} cannot be sent by a browser. Choose a browser-supported method.`);
  }
  if (['GET', 'HEAD'].includes(method) && operation.body.kind !== 'none') {
    throw new Error(`${method} requests cannot have a body. Choose None in the Body tab.`);
  }
  const path = operation.path.trim();
  const base = baseUrl.trim();
  let url = path;
  if (base) {
    try {
      url = new URL(path).href;
    } catch {
      url = new URL(path.startsWith('/') ? path.slice(1) : path, `${base.replace(/\/+$/u, '')}/`)
        .href;
    }
  }
  if (!url) throw new Error('Enter a base URL or an absolute endpoint before testing.');
  const parsedUrl = new URL(url);
  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    throw new Error('API tests require an HTTP or HTTPS URL.');
  }
  for (const parameter of operation.query) {
    if (parameter.enabled && parameter.name.trim()) {
      parsedUrl.searchParams.append(parameter.name, parameter.value);
    }
  }
  const headers = new Headers();
  for (const parameter of [...configuration.defaultHeaders, ...operation.headers]) {
    if (parameter.enabled && parameter.name.trim()) headers.set(parameter.name, parameter.value);
  }
  let body: BodyInit | undefined;
  switch (operation.body.kind) {
    case 'none':
      break;
    case 'json':
      if (operation.body.content.trim()) {
        JSON.parse(operation.body.content);
        body = operation.body.content;
        if (!headers.has('content-type')) headers.set('content-type', 'application/json');
      }
      break;
    case 'text':
      body = operation.body.content;
      if (!headers.has('content-type')) headers.set('content-type', 'text/plain;charset=UTF-8');
      break;
    case 'form-urlencoded':
      body = new URLSearchParams(operation.body.content);
      if (!headers.has('content-type')) {
        headers.set('content-type', 'application/x-www-form-urlencoded;charset=UTF-8');
      }
      break;
    case 'form-data': {
      const form = new FormData();
      new URLSearchParams(operation.body.content).forEach((value, name) =>
        form.append(name, value),
      );
      if (uploads.length && !uploadField.trim()) throw new Error('Enter a file field name.');
      for (const file of uploads) form.append(uploadField, file, file.name);
      headers.delete('content-type');
      body = form;
      break;
    }
  }
  return {
    url: parsedUrl.href,
    init: { method, headers, body, credentials: operation.credentials },
  };
}
