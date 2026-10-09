import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

type BrowserSend = (
  method: string,
  params?: Record<string, unknown>,
) => Promise<Record<string, unknown>>;

export async function withChromium(
  executable: string,
  url: string,
  check: (send: BrowserSend) => Promise<void>,
): Promise<void> {
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'webrad-image-browser-'));
  const resolved = path.resolve(profile);
  if (!resolved.startsWith(`${path.resolve(os.tmpdir())}${path.sep}`))
    throw new Error('Invalid browser profile path.');
  const child = spawn(
    executable,
    [
      '--headless=new',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-gpu',
      `--user-data-dir=${profile}`,
      '--window-size=1280,700',
      '--force-device-scale-factor=1',
      '--remote-debugging-port=0',
      'about:blank',
    ],
    { windowsHide: true, stdio: 'ignore' },
  );
  let socket: WebSocket | undefined;
  const pending = new Map<
    number,
    { resolve: (result: Record<string, unknown>) => void; reject: (error: Error) => void }
  >();
  try {
    const deadline = Date.now() + 20_000;
    let port = '';
    while (!port && Date.now() < deadline) {
      port =
        (await fs.readFile(path.join(profile, 'DevToolsActivePort'), 'utf8').catch(() => '')).split(
          '\n',
        )[0] ?? '';
      if (!port) await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if (!port) throw new Error('Browser debugging endpoint unavailable.');
    const targets = (await (
      await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(5_000) })
    ).json()) as {
      type: string;
      webSocketDebuggerUrl: string;
    }[];
    const target = targets.find((entry) => entry.type === 'page');
    if (!target) throw new Error('Missing browser page.');
    socket = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Browser WebSocket timed out.')), 5_000);
      socket!.addEventListener(
        'open',
        () => {
          clearTimeout(timeout);
          resolve();
        },
        { once: true },
      );
      socket!.addEventListener(
        'error',
        () => {
          clearTimeout(timeout);
          reject(new Error('Browser WebSocket failed.'));
        },
        { once: true },
      );
    });
    let sequence = 0;
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data)) as {
        id?: number;
        result?: Record<string, unknown>;
        error?: { message: string };
      };
      if (message.id === undefined) return;
      const request = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) request?.reject(new Error(message.error.message));
      else request?.resolve(message.result ?? {});
    });
    const send: BrowserSend = (method, params = {}) =>
      new Promise((resolve, reject) => {
        const id = ++sequence;
        const timeout = setTimeout(() => {
          pending.delete(id);
          reject(new Error(`Browser command timed out: ${method}`));
        }, 10_000);
        pending.set(id, {
          resolve: (result) => {
            clearTimeout(timeout);
            resolve(result);
          },
          reject: (error) => {
            clearTimeout(timeout);
            reject(error);
          },
        });
        socket!.send(JSON.stringify({ id, method, params }));
      });
    await send('Page.navigate', { url });
    await check(send);
  } finally {
    for (const request of pending.values()) request.reject(new Error('Browser test ended.'));
    socket?.close();
    child.kill();
    await fs.rm(resolved, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  }
}
