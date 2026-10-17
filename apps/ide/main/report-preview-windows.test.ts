import type { HandlerDetails, WebContents } from 'electron';
import { afterEach, expect, it, vi } from 'vitest';
import { closePreviewServer, publishPreviewHtml, revokePreview } from './preview-server';
import { installReportPreviewWindows, reportPreviewOrigin } from './report-preview-windows';

const harness = vi.hoisted(() => ({
  options: [] as Record<string, unknown>[],
  childContents: { setWindowOpenHandler: vi.fn(), on: vi.fn() },
}));
vi.mock('electron', () => ({
  app: { isPackaged: false },
  BrowserWindow: class {
    webContents = harness.childContents;
    constructor(options: Record<string, unknown>) {
      harness.options.push(options);
    }
    removeMenu = vi.fn();
    once = vi.fn();
  },
}));

afterEach(async () => {
  await closePreviewServer();
  vi.clearAllMocks();
  harness.options.length = 0;
});

it('allows only named report Blobs from live Preview origins and revokes authorization', async () => {
  const url = await publishPreviewHtml(91, '<p>Report</p>');
  const origin = new URL(url).origin;
  const blob = `blob:${origin}/a5e3e6c1-5d03-4639-a089-6c2cbe2c11c6`;
  expect(reportPreviewOrigin({ url: blob, frameName: 'webrad-report' }, [url])).toBe(origin);
  for (const target of [
    { url: blob, frameName: '_blank' },
    { url: 'about:blank', frameName: 'webrad-report' },
    { url: url, frameName: 'webrad-report' },
    {
      url: 'blob:https://evil.example/a5e3e6c1-5d03-4639-a089-6c2cbe2c11c6',
      frameName: 'webrad-report',
    },
    { url: 'javascript:alert(1)', frameName: 'webrad-report' },
  ])
    expect(reportPreviewOrigin(target, [url])).toBeUndefined();
  expect(
    reportPreviewOrigin({ url: blob, frameName: 'webrad-report' }, ['https://ide.example']),
  ).toBeUndefined();
  revokePreview(91);
  expect(reportPreviewOrigin({ url: blob, frameName: 'webrad-report' }, [url])).toBeUndefined();
});

it('constructs report windows without inherited preload privileges', async () => {
  const url = await publishPreviewHtml(92, '<p>Report</p>');
  const origin = new URL(url).origin;
  const contents = {
    once: vi.fn(),
    on: vi.fn(),
    session: { partition: 'preview-session' },
    mainFrame: { framesInSubtree: [{ url }] },
    setWindowOpenHandler: vi.fn(),
  };
  installReportPreviewWindows(contents as unknown as WebContents);
  const handler = contents.setWindowOpenHandler.mock.calls[0]![0] as (
    details: HandlerDetails,
  ) => Electron.WindowOpenHandlerResponse;
  const response = handler({
    url: `blob:${origin}/a5e3e6c1-5d03-4639-a089-6c2cbe2c11c6`,
    frameName: 'webrad-report',
    features: '',
    disposition: 'new-window',
    referrer: { url: '', policy: 'no-referrer' },
  });
  expect(response.action).toBe('allow');
  expect(response.createWindow).toBeUndefined();
  expect(response.overrideBrowserWindowOptions?.webPreferences).toEqual({
    preload: undefined,
    nodeIntegration: false,
    nodeIntegrationInWorker: false,
    nodeIntegrationInSubFrames: false,
    webviewTag: false,
    contextIsolation: true,
    sandbox: true,
    webSecurity: true,
    session: contents.session,
  });
  const created = contents.on.mock.calls.find(([event]) => event === 'did-create-window')![1] as (
    child: unknown,
    details: { url: string },
  ) => void;
  created(
    { webContents: harness.childContents, removeMenu: vi.fn(), once: vi.fn() },
    { url: `blob:${origin}/a5e3e6c1-5d03-4639-a089-6c2cbe2c11c6` },
  );
  expect(harness.childContents.setWindowOpenHandler.mock.calls[0]![0]()).toEqual({
    action: 'deny',
  });
});
