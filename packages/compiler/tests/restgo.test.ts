import { bindComponentEvent, createProject, updateProjectSettings } from '@webrad/project-model';
import { defaultComponentRegistry } from '@webrad/component-registry';
import { JSDOM } from 'jsdom';
import { describe, expect, it, vi } from 'vitest';

import { compileProjectToMemory } from '../src/index.js';
import { createVirtualSourceGraph, RESTGO_ENTRY_PATH } from '../src/source-graph.js';

describe('compiled native RestGO integration', () => {
  it('rejects user source paths that shadow embedded libraries or generated bootstrap files', async () => {
    const project = createProject('RestGoReservedSources');
    const userSources = {
      '__restgo/index.ts': 'export const maliciousSdk = true;',
      'pages/../__RESTGO/auth.ts': 'export const maliciousAuth = true;',
      '__runtime/index.ts': 'export const maliciousRuntime = true;',
      '__runtime\\globals.ts': 'export const maliciousGlobals = true;',
      'entry.ts': 'export const authoredEntry = true;',
      'APP.CSS': '.authored-style {}',
      'webrad-globals.d.ts': 'declare const RestGO: unknown;',
      'webrad-environment.d.ts': 'declare const Env: unknown;',
      'styles.d.ts': 'declare const AuthoredStyles: unknown;',
    };
    const preservedSources = { ...userSources };
    const graph = createVirtualSourceGraph(project, userSources, defaultComponentRegistry, '');
    expect(graph.sources.get(RESTGO_ENTRY_PATH)).not.toContain('maliciousSdk');
    expect(graph.diagnostics).toHaveLength(Object.keys(userSources).length);
    expect(graph.diagnostics.every((diagnostic) => diagnostic.category === 'error')).toBe(true);
    expect(graph.diagnostics.every((diagnostic) => diagnostic.message.includes('reserved'))).toBe(
      true,
    );
    const result = await compileProjectToMemory(project, { userSources });
    expect(result.success).toBe(false);
    expect(result.files).toEqual({});
    expect(userSources).toEqual(preservedSources);
  });

  it('creates the configured shared client before authored page construction', async () => {
    const original = createProject('RestGoBrowser');
    const page = original.pages[0];
    if (page === undefined) throw new Error('The default project requires an entry page.');
    const boundPage = bindComponentEvent(
      bindComponentEvent(
        bindComponentEvent(page, page.rootComponentId, 'OnLogin', 'PageMainLogin'),
        page.rootComponentId,
        'OnUnauthenticated',
        'PageMainUnauthenticated',
      ),
      page.rootComponentId,
      'OnLogout',
      'PageMainLogout',
    );
    const project = updateProjectSettings(
      { ...original, pages: [boundPage] },
      {
        restGo: {
          apiToken: 'rgo.compiled-token',
          enabled: true,
          baseUrl: 'https://restgo.example.test',
          apiVersion: 2,
          defaultDatabase: 'clientes',
          persistSession: false,
          sessionStorage: 'memory',
          storageKey: 'compiled-restgo-test',
        },
      },
    );
    const userSource = `import { createClient } from '@webrad/restgo-sdk';
import { getRestGoClient, RestGO as SharedRestGO, type WebPage, type WebPageLoginEventDetail, type WebPageLogoutEventDetail } from '@webrad/runtime';
import { ${page.name}Generated } from './${page.name}.generated';

export class ${page.name} extends ${page.name}Generated {
  private usuarioId = '';
  public PageMainUnauthenticated(_sender: WebPage): void {
    this.element.dataset.unauthenticated = 'true';
  }
  public PageMainLogin(_sender: WebPage, event: CustomEvent<WebPageLoginEventDetail>): void {
    const { user } = event.detail;
    this.usuarioId = user.id;
    this.element.dataset.loginUser = this.usuarioId;
    this.element.dataset.loginEmail = user.email;
  }
  public PageMainLogout(_sender: WebPage, event: CustomEvent<WebPageLogoutEventDetail>): void {
    this.element.dataset.logoutUser = event.detail.user.id;
    this.usuarioId = '';
    this.element.dataset.currentUser = this.usuarioId;
  }
  public constructor(element: HTMLElement) {
    super(element);
    const standalone = createClient('https://standalone.example.test', { persistSession: false });
    this.element.dataset.restgoReady = String(RestGO.auth === getRestGoClient().auth);
    this.element.dataset.restgoShared = String(RestGO.storage === SharedRestGO.storage);
    this.element.dataset.restgoImport = String(standalone.auth !== RestGO.auth);
    void this.checkAuthentication();
  }

  private async checkAuthentication(): Promise<void> {
    const login = await RestGO.login('cliente@example.test', 'senha-de-teste');
    if (login.error) throw login.error;
    const current = await SharedRestGO.getUser();
    this.element.dataset.restgoUser = current.data?.id ?? '';
    const result = await RestGO.from<readonly { id: string }[]>('pessoas').get();
    this.element.dataset.restgoData = result.error === null ? result.data[0]?.id ?? '' : result.error.code;
    const logout = await RestGO.logout();
    if (logout.error) throw logout.error;
    const session = await RestGO.getSession();
    this.element.dataset.restgoSignedOut = String(session.error === null && session.data === null);
  }
}
`;
    const userSources = { [`pages/${page.name}.ts`]: userSource };
    const graph = createVirtualSourceGraph(project, userSources, defaultComponentRegistry, '');
    expect([...graph.sources.keys()].some((fileName) => fileName.includes('__restgo'))).toBe(true);
    expect([...graph.sources.values()]).toContain(userSource);

    const result = await compileProjectToMemory(project, { userSources });
    expect(result.success, JSON.stringify(result.diagnostics, null, 2)).toBe(true);
    const application = result.files['assets/app.js'] ?? '';
    expect(application).not.toMatch(/require\(["'](?:electron|node:)/u);
    expect(application).not.toContain('nodeIntegration');
    const dom = new JSDOM('<!doctype html><html><body></body></html>', {
      runScripts: 'outside-only',
      url: 'https://preview.webrad.test/',
    });
    const user = {
      id: 'cliente-1',
      email: 'cliente@example.test',
      fullName: 'Cliente',
      avatarUrl: null,
      active: true,
      emailConfirmed: true,
    };
    const fetch = vi.fn<typeof globalThis.fetch>(async (url, options) => {
      const path = new URL(String(url)).pathname;
      if (path === '/auth/token') {
        expect(JSON.parse(String(options?.body))).toEqual({
          email: user.email,
          password: 'senha-de-teste',
          remember: false,
        });
        expect(new Headers(options?.headers).get('Authorization')).toBeNull();
      } else expect(new Headers(options?.headers).get('Authorization')).toBe('Bearer compiled-jwt');
      const body =
        path === '/auth/token'
          ? { token: 'compiled-jwt', expiresAt: '2099-01-01T00:00:00Z', user }
          : path === '/auth/session'
            ? { success: true, user }
            : path === '/auth/logout'
              ? { success: true }
              : { success: true, data: [{ id: user.id }] };
      return new Response(JSON.stringify(body), {
        headers: { 'Content-Type': 'application/json' },
      });
    });
    Object.defineProperties(dom.window, {
      fetch: { value: fetch },
      Headers: { value: globalThis.Headers },
    });
    try {
      dom.window.eval(application);
      const root = dom.window.document.querySelector('[data-webrad-id]');
      expect(root?.getAttribute('data-restgo-ready')).toBe('true');
      expect(root?.getAttribute('data-restgo-shared')).toBe('true');
      expect(root?.getAttribute('data-restgo-import')).toBe('true');
      await vi.waitFor(() => {
        expect(fetch).toHaveBeenCalledWith(
          'https://restgo.example.test/v2/clientes/pessoas',
          expect.objectContaining({ method: 'GET', credentials: 'omit' }),
        );
        expect(root?.getAttribute('data-restgo-data')).toBe('cliente-1');
        expect(root?.getAttribute('data-restgo-user')).toBe('cliente-1');
        expect(root?.getAttribute('data-restgo-signed-out')).toBe('true');
        expect(root?.getAttribute('data-login-user')).toBe(user.id);
        expect(root?.getAttribute('data-login-email')).toBe(user.email);
        expect(root?.getAttribute('data-logout-user')).toBe(user.id);
        expect(root?.getAttribute('data-current-user')).toBe('');
        expect(root?.getAttribute('data-unauthenticated')).toBe('true');
      });
    } finally {
      dom.window.close();
    }
  });

  it('provides an actionable runtime error when the project integration is disabled', async () => {
    const project = createProject('RestGoDisabled');
    const result = await compileProjectToMemory(project, { userSources: {} });
    expect(result.success, JSON.stringify(result.diagnostics, null, 2)).toBe(true);
    const dom = new JSDOM('<!doctype html><html><body></body></html>', {
      runScripts: 'outside-only',
      url: 'https://preview.webrad.test/',
    });
    try {
      dom.window.eval(result.files['assets/app.js'] ?? '');
      expect(() => dom.window.eval('RestGO.auth')).toThrow('Enable and configure RestGO');
    } finally {
      dom.window.close();
    }
  });
});
