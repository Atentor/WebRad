import { codexContextUpdate, type CodexContextSession } from './codex-context-session';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createInterface } from 'node:readline';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { CodexPlanSchema, codexPlanOutputSchema } from '../shared/codex-schema';
import type { CodexModel, CodexPlan, CodexStatus, CodexUsage } from '../shared/codex-contracts';
import { CODEX_AUTHORING_INSTRUCTIONS } from './codex-context';
import { version } from '../../../package.json';

const recordSchema = z.record(z.string(), z.unknown());
const modelSchema = z.object({
  model: z.string().min(1).max(128),
  displayName: z.string().min(1).max(256),
  description: z.string().default(''),
  defaultReasoningEffort: z.string().min(1).max(32),
  supportedReasoningEfforts: z.array(
    z.object({
      reasoningEffort: z.string().min(1).max(32),
      description: z.string(),
    }),
  ),
});
const MAX_PROTOCOL_LINE = 4_000_000;
const MAX_FINAL_TEXT = 2_000_000;

interface AgentMessage {
  text: string;
  phase: string | null;
}

interface PendingRpc {
  readonly resolve: (value: unknown) => void;
  readonly reject: (error: Error) => void;
  readonly timer: ReturnType<typeof setTimeout>;
}
interface Generation {
  readonly activity: (message: string) => void;
  threadId: string | null;
  turnId?: string;
  readonly messages: Map<string, AgentMessage>;
  textLength: number;
  readonly resolve: (value: CodexPlan) => void;
  readonly reject: (error: Error) => void;
}

/** Owned stdio JSON-RPC client. Only explicit protocol fields cross the bridge. */
export class CodexConnection {
  readonly #sessions = new Map<
    string,
    { threadId: string; turns: number; data: Readonly<Record<string, unknown>> }
  >();

  readonly #pending = new Map<number, PendingRpc>();
  readonly #accountListeners = new Set<() => void>();
  readonly #usageListeners = new Set<() => void>();
  #child: ChildProcessWithoutNullStreams | null = null;
  #sequence = 0;
  #generation: Generation | null = null;
  #loginId: string | null = null;
  #ready: Promise<void> | null = null;
  #loginError: string | null = null;
  #epoch = 0;
  #loginEpoch = 0;
  #pendingLoginEpoch: number | null = null;
  readonly #completedLogins = new Map<string, boolean>();

  public constructor(
    private readonly executable: string,
    private readonly directory: string,
  ) {}

  public onAccountChanged(listener: () => void): () => void {
    this.#accountListeners.add(listener);
    return () => this.#accountListeners.delete(listener);
  }

  public onUsageChanged(listener: () => void): () => void {
    this.#usageListeners.add(listener);
    return () => this.#usageListeners.delete(listener);
  }

  public async usage(): Promise<CodexUsage> {
    await this.start();
    const window = z.object({
      usedPercent: z.number().finite().min(0).max(100),
      windowDurationMins: z.number().nullable(),
      resetsAt: z.number().finite().nullable(),
    });
    const bucket = z.object({
      limitId: z.string().nullable().optional(),
      limitName: z.string().nullable().optional(),
      normalModelSlug: z.string().nullable().optional(),
      primary: window.nullable(),
      secondary: window.nullable(),
    });
    const result = z
      .object({
        rateLimits: bucket,
        rateLimitsByLimitId: z.record(z.string(), bucket).nullable().optional(),
      })
      .parse(await this.#request('account/rateLimits/read', {}));
    const entries =
      result.rateLimitsByLimitId && Object.keys(result.rateLimitsByLimitId).length > 0
        ? Object.entries(result.rateLimitsByLimitId)
        : [[result.rateLimits.limitId ?? 'codex', result.rateLimits] as const];
    return {
      updatedAt: Date.now(),
      buckets: entries.map(([id, value]) => {
        const windows = [value.primary, value.secondary];
        return {
          id,
          name: value.limitName ?? id,
          model: value.normalModelSlug ?? null,
          fiveHour: windows.find((item) => item?.windowDurationMins === 300) ?? null,
          weekly: windows.find((item) => item?.windowDurationMins === 10080) ?? null,
        };
      }),
    };
  }

  public start(): Promise<void> {
    if (this.#ready) return this.#ready;
    const task = this.#start().catch((error: unknown) => {
      if (this.#ready === task) this.dispose();
      throw error;
    });
    this.#ready = task;
    return task;
  }

  async #start(): Promise<void> {
    const epoch = this.#epoch;
    const home = path.join(this.directory, 'profile');
    const workspace = path.join(this.directory, 'workspace');
    await mkdir(home, { recursive: true });
    await mkdir(workspace, { recursive: true });
    if (epoch !== this.#epoch) throw new Error('The Codex connection was canceled.');
    const environment: NodeJS.ProcessEnv = { ...process.env, CODEX_HOME: home };
    for (const key of ['OPENAI_API_KEY', 'CODEX_API_KEY', 'OPENAI_BASE_URL']) {
      delete environment[key];
    }
    const child = spawn(
      this.executable,
      [
        'app-server',
        '--listen',
        'stdio://',
        '-c',
        'web_search="disabled"',
        '-c',
        'features.shell_tool=false',
        '-c',
        'features.unified_exec=false',
        '-c',
        'features.apps=false',
        '-c',
        'features.multi_agent=false',
      ],
      {
        cwd: workspace,
        env: environment,
        windowsHide: true,
        shell: false,
        stdio: ['pipe', 'pipe', 'pipe'],
      },
    );
    this.#child = child;
    // CLI diagnostics can contain user context. They are not forwarded or logged.
    child.stderr.on('data', () => undefined);
    child.stdin.on('error', () => {
      if (this.#child === child) this.#close(new Error('The Codex connection was closed.'));
    });
    child.once('error', () => {
      if (this.#child === child) {
        this.#close(new Error('Could not start Codex. Check the selected executable.'));
      }
    });
    child.stdout.on('error', () => {
      if (this.#child === child) this.#close(new Error('Could not read the Codex response.'));
    });
    child.stderr.on('error', () => undefined);
    child.once('exit', (code) => {
      if (this.#child !== child) return;
      this.#close(new Error(`Codex disconnected (${String(code)}). Reconnect to continue.`));
    });
    const lines = createInterface({ input: child.stdout, crlfDelay: Infinity });
    child.once('close', () => lines.close());
    lines.on('line', (line) => {
      if (this.#child !== child) return;
      if (line.trim().length === 0) return;
      if (line.length > MAX_PROTOCOL_LINE) {
        this.#close(
          new Error('The Codex response exceeded the supported size. Request a smaller change.'),
        );
        return;
      }
      try {
        this.#receive(recordSchema.parse(JSON.parse(line) as unknown));
      } catch {
        this.#close(
          new Error('Codex returned an invalid protocol message. Update Codex and reconnect.'),
        );
      }
    });
    await this.#request('initialize', {
      clientInfo: { name: 'webrad', title: 'WebRAD', version },
      capabilities: { experimentalApi: true },
    });
    this.#write({ method: 'initialized' });
  }

  public async account(): Promise<CodexStatus['account']> {
    await this.start();
    const result = z
      .object({
        account: z
          .object({
            type: z.string(),
            email: z.string().nullable().optional(),
            planType: z.string().nullable().optional(),
          })
          .nullable(),
      })
      .parse(await this.#request('account/read', { refreshToken: false }));
    if (!result.account || result.account.type !== 'chatgpt') return null;
    return {
      label: result.account.email ?? 'ChatGPT account',
      plan: result.account.planType ?? null,
    };
  }

  public async models(): Promise<readonly CodexModel[]> {
    await this.start();
    const models = new Map<string, CodexModel>();
    const cursors = new Set<string>();
    let cursor: string | null = null;
    for (let page = 0; page < 20; page += 1) {
      const result = z
        .object({
          data: z.array(z.unknown()),
          nextCursor: z.string().nullable().optional(),
        })
        .parse(await this.#request('model/list', { limit: 100, includeHidden: false, cursor }));
      for (const entry of result.data) {
        const parsed = modelSchema.safeParse(entry);
        if (!parsed.success) continue;
        const model = parsed.data;
        if (!/^gpt-6\.1-(?:terra|sol)(?:$|-)/i.test(model.model)) continue;
        if (models.has(model.model)) continue;
        const efforts = [
          ...new Map(
            model.supportedReasoningEfforts.map((effort) => [
              effort.reasoningEffort,
              { id: effort.reasoningEffort, description: effort.description },
            ]),
          ).values(),
        ];
        const firstEffort = efforts[0];
        if (!firstEffort) continue;
        models.set(model.model, {
          id: model.model,
          name: model.displayName,
          description: model.description,
          defaultEffort: efforts.some((effort) => effort.id === model.defaultReasoningEffort)
            ? model.defaultReasoningEffort
            : firstEffort.id,
          efforts,
        });
      }
      cursor = result.nextCursor ?? null;
      if (cursor === null) return [...models.values()];
      if (cursors.has(cursor))
        throw new Error('Codex returned a repeated model catalog cursor. Refresh to try again.');
      cursors.add(cursor);
    }
    throw new Error('Codex returned too many model catalog pages.');
  }

  public async login(): Promise<string> {
    if (this.#generation) throw new Error('Stop the current Codex request before signing in.');
    await this.cancelLogin();
    const epoch = ++this.#loginEpoch;
    this.#pendingLoginEpoch = epoch;
    this.#loginError = null;
    try {
      await this.start();
      if (epoch !== this.#loginEpoch) throw new Error('Codex sign-in was canceled.');
      const result = z
        .object({
          type: z.literal('chatgpt'),
          loginId: z.string(),
          authUrl: z.url(),
        })
        .parse(await this.#request('account/login/start', { type: 'chatgpt' }));
      if (epoch !== this.#loginEpoch) {
        if (this.#child) {
          await this.#request('account/login/cancel', { loginId: result.loginId }).catch(
            () => undefined,
          );
        }
        throw new Error('Codex sign-in was canceled.');
      }
      const completed = this.#completedLogins.get(result.loginId);
      this.#completedLogins.delete(result.loginId);
      this.#loginId = completed === undefined ? result.loginId : null;
      if (completed === false)
        this.#loginError = 'Sign-in did not complete. Sign in again to connect your account.';
      if (completed !== undefined) {
        this.#pendingLoginEpoch = null;
        for (const listener of this.#accountListeners) listener();
      }
      return result.authUrl;
    } finally {
      if (this.#pendingLoginEpoch === epoch) this.#pendingLoginEpoch = null;
    }
  }

  public get loginError(): string | null {
    return this.#loginError;
  }

  public get loginPending(): boolean {
    return this.#loginId !== null || this.#pendingLoginEpoch !== null;
  }

  public async cancelLogin(): Promise<void> {
    const starting = this.#pendingLoginEpoch !== null;
    this.#loginEpoch += 1;
    this.#pendingLoginEpoch = null;
    this.#completedLogins.clear();
    if (this.#loginId === null) {
      if (starting) this.#close(new Error('Codex sign-in was canceled.'));
      return;
    }
    const loginId = this.#loginId;
    this.#loginId = null;
    await this.#request('account/login/cancel', { loginId });
  }

  public async generate(
    prompt: string,
    model: string,
    effort: string,
    signal: AbortSignal,
    onActivity: (message: string) => void = () => undefined,
    session?: CodexContextSession,
  ): Promise<CodexPlan> {
    const cacheKey = session ? JSON.stringify([session.key, model]) : undefined;
    const old = cacheKey ? this.#sessions.get(cacheKey) : undefined;
    const cached = old && old.turns < 8 ? old : undefined;
    let retainThread = false;

    signal.throwIfAborted();
    if (this.#generation) throw new Error('A Codex request is already in progress.');
    if (this.loginPending)
      throw new Error('Complete or cancel sign-in before asking Codex to edit.');
    let resolveGeneration!: (value: CodexPlan) => void;
    let rejectGeneration!: (error: Error) => void;
    const result = new Promise<CodexPlan>((resolve, reject) => {
      resolveGeneration = resolve;
      rejectGeneration = reject;
    });
    // Attach immediately: cancellation can happen while turn/start is pending.
    void result.catch(() => undefined);
    let lastActivity = 0;
    const generation: Generation = {
      activity: (message) => {
        const now = Date.now();
        if (now - lastActivity < 750) return;
        lastActivity = now;
        onActivity(message);
      },
      threadId: null,
      messages: new Map(),
      textLength: 0,
      resolve: resolveGeneration,
      reject: rejectGeneration,
    };
    this.#generation = generation;
    let failure: Error | null = null;
    let child: ChildProcessWithoutNullStreams | null = null;
    const stop = (error: Error): void => {
      if (this.#generation !== generation) return;
      failure = error;
      generation.reject(error);
      this.#close(error);
    };
    const cancel = (): void => stop(new Error('Codex request canceled. No changes were applied.'));
    signal.addEventListener('abort', cancel, { once: true });
    const deadline = setTimeout(
      () => stop(new Error('Codex reached the request time limit. Request a smaller change.')),
      30 * 60_000,
    );
    try {
      signal.throwIfAborted();
      await this.start();
      child = this.#child;
      signal.throwIfAborted();
      const thread = cached
        ? { model, thread: { id: cached.threadId, environments: [] } }
        : z
            .object({
              model: z.string().optional(),
              thread: z.object({
                id: z.string(),
                environments: z.array(z.unknown()).nullable().optional(),
              }),
            })
            .parse(
              await this.#request('thread/start', {
                model,
                allowProviderModelFallback: false,
                cwd: path.join(this.directory, 'workspace'),
                runtimeWorkspaceRoots: [],
                environments: [],
                selectedCapabilityRoots: [],
                sandbox: 'read-only',
                approvalPolicy: 'never',
                ephemeral: true,
                baseInstructions: CODEX_AUTHORING_INSTRUCTIONS,
                developerInstructions:
                  'Return the native WebRAD proposal. No filesystem, shell, external tools, agents, or arbitrary code execution.',
                config: { model_reasoning_effort: effort, web_search: 'disabled' },
              }),
            );
      signal.throwIfAborted();
      if (thread.model !== undefined && thread.model !== model) {
        throw new Error(
          'Codex changed the requested model. Refresh the catalog and select an available model.',
        );
      }
      if (thread.thread.environments?.length) {
        throw new Error(
          'Codex enabled an execution environment. Update Codex before using structured WebRAD proposals.',
        );
      }
      generation.threadId = thread.thread.id;
      const inputPrompt = session ? codexContextUpdate(cached?.data, session) : prompt;
      onActivity(
        (cached ? 'Context update' : 'Full context') +
          ' sent: ' +
          inputPrompt.length.toLocaleString() +
          ' characters. Waiting for Codex…',
      );
      const turn = z.object({ turn: recordSchema.and(z.object({ id: z.string() })) }).parse(
        await this.#request(
          'turn/start',
          {
            threadId: generation.threadId,
            input: [{ type: 'text', text: inputPrompt, text_elements: [] }],
            model,
            effort,
            summary: 'none',
            environments: [],
            outputSchema: codexPlanOutputSchema(),
          },
          90_000,
        ),
      );
      generation.turnId = turn.turn.id;
      if (['completed', 'failed', 'interrupted'].includes(String(turn.turn.status))) {
        this.#completeGeneration(generation, turn.turn);
      }
      const plan = await result;
      if (session && cacheKey) {
        if (!cached && old)
          void this.#request('thread/archive', { threadId: old.threadId }).catch(() => undefined);
        if (!this.#sessions.has(cacheKey) && this.#sessions.size >= 8) {
          const first = this.#sessions.entries().next().value;
          if (first) {
            this.#sessions.delete(first[0]);
            void this.#request('thread/archive', { threadId: first[1].threadId }).catch(
              () => undefined,
            );
          }
        }
        this.#sessions.set(cacheKey, {
          threadId: generation.threadId,
          turns: (cached?.turns ?? 0) + 1,
          data: session.data,
        });
        retainThread = true;
      }
      return plan;
    } catch (error) {
      if (child !== null && this.#child === child) {
        this.#close(
          error instanceof Error ? error : new Error('Codex could not complete the proposal.'),
        );
      }
      throw failure ?? error;
    } finally {
      clearTimeout(deadline);
      signal.removeEventListener('abort', cancel);
      if (this.#generation === generation) this.#generation = null;
      if (
        !retainThread &&
        generation.threadId !== null &&
        child !== null &&
        this.#child === child
      ) {
        void this.#request('thread/archive', { threadId: generation.threadId }).catch(
          () => undefined,
        );
      }
    }
  }

  #write(value: unknown): void {
    if (!this.#child || this.#child.stdin.destroyed) throw new Error('Codex is not connected.');
    this.#child.stdin.write(`${JSON.stringify(value)}\n`);
  }

  #request(method: string, params: unknown, timeout = 30_000): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const id = ++this.#sequence;
      const timer = setTimeout(() => {
        this.#pending.delete(id);
        reject(new Error(`Codex did not respond to ${method}. Reconnect and try again.`));
      }, timeout);
      this.#pending.set(id, { resolve, reject, timer });
      try {
        this.#write({ id, method, params });
      } catch (error) {
        clearTimeout(timer);
        this.#pending.delete(id);
        reject(error);
      }
    });
  }

  #receive(message: Record<string, unknown>): void {
    if (typeof message.id === 'number' && typeof message.method !== 'string') {
      const pending = this.#pending.get(message.id);
      if (!pending) return;
      this.#pending.delete(message.id);
      clearTimeout(pending.timer);
      if (message.error) {
        const error = recordSchema.safeParse(message.error);
        pending.reject(
          new Error(
            error.success && typeof error.data.message === 'string'
              ? error.data.message
              : 'Codex rejected the request.',
          ),
        );
      } else pending.resolve(message.result);
      return;
    }
    if (message.id !== undefined && typeof message.method === 'string') {
      // No built-in tool or approval request is authorized by this integration.
      this.#write({
        id: message.id,
        error: {
          code: -32601,
          message: 'WebRAD supports structured proposals only. Tool execution is disabled.',
        },
      });
      return;
    }
    if (message.method === 'account/login/completed') {
      const login = recordSchema.safeParse(message.params);
      if (login.success && typeof login.data.loginId === 'string') {
        if (login.data.loginId === this.#loginId) {
          this.#loginId = null;
          if (login.data.success === false) {
            this.#loginError = 'Sign-in did not complete. Sign in again to connect your account.';
          }
          for (const listener of this.#accountListeners) listener();
        } else if (this.#pendingLoginEpoch !== null && this.#completedLogins.size < 32) {
          // Completion can arrive before the corresponding login/start response.
          this.#completedLogins.set(login.data.loginId, login.data.success === true);
        }
      }
    } else if (message.method === 'account/updated') {
      for (const listener of this.#accountListeners) listener();
    }
    if (message.method === 'account/rateLimits/updated') {
      for (const listener of this.#usageListeners) listener();
    }
    const generation = this.#generation;
    if (!generation) return;
    const params = recordSchema.safeParse(message.params);
    if (!params.success || params.data.threadId !== generation.threadId) return;
    if (message.method === 'turn/started') generation.activity('Codex is working on your request…');
    if (
      message.method === 'item/reasoning/summaryTextDelta' ||
      message.method === 'item/reasoning/textDelta'
    ) {
      generation.activity('Codex is analyzing the request and project context…');
    }
    if (message.method === 'error' && params.data.willRetry === true)
      generation.activity('Codex reported a temporary interruption and is retrying…');
    if (typeof params.data.turnId === 'string') {
      if (generation.turnId && generation.turnId !== params.data.turnId) return;
      generation.turnId ??= params.data.turnId;
    }
    if (message.method === 'item/started' || message.method === 'item/completed') {
      const item = recordSchema.safeParse(params.data.item);
      if (item.success) {
        if (item.data.type === 'reasoning')
          generation.activity('Codex is analyzing the request and project context…');
        if (item.data.type === 'agentMessage')
          generation.activity('Codex is composing the native component and TypeScript proposal…');
        if (
          [
            'commandExecution',
            'fileChange',
            'mcpToolCall',
            'dynamicToolCall',
            'collabAgentToolCall',
            'webSearch',
            'imageGeneration',
          ].includes(String(item.data.type))
        ) {
          this.#close(
            new Error('Codex attempted an unsupported tool operation. No proposal was applied.'),
          );
          return;
        }
        if (item.data.type === 'agentMessage' && typeof item.data.id === 'string') {
          this.#rememberMessage(generation, item.data.id, item.data);
        }
      }
    }
    if (
      message.method === 'item/agentMessage/delta' &&
      typeof params.data.itemId === 'string' &&
      typeof params.data.delta === 'string'
    ) {
      const previous = generation.messages.get(params.data.itemId);
      if (previous?.phase !== 'commentary') {
        this.#rememberMessage(generation, params.data.itemId, {
          text: (previous?.text ?? '') + params.data.delta,
          phase: previous?.phase ?? null,
        });
        generation.activity(
          `Receiving proposal · ${generation.textLength.toLocaleString('en-US')} characters received…`,
        );
      }
    }
    if (message.method === 'turn/completed') {
      const turn = recordSchema.parse(params.data.turn);
      if (generation.turnId && typeof turn.id === 'string' && turn.id !== generation.turnId) return;
      this.#completeGeneration(generation, turn);
    }
  }

  #rememberMessage(generation: Generation, id: string, item: Record<string, unknown>): void {
    const previous = generation.messages.get(id);
    const phase = typeof item.phase === 'string' ? item.phase : (previous?.phase ?? null);
    const text =
      phase === 'commentary'
        ? ''
        : typeof item.text === 'string' && (item.text.length > 0 || !previous)
          ? item.text
          : (previous?.text ?? '');
    const textLength = generation.textLength - (previous?.text.length ?? 0) + text.length;
    if (textLength > MAX_FINAL_TEXT || (generation.messages.size >= 128 && !previous)) {
      throw new Error('The Codex proposal exceeded the supported size. Request a smaller change.');
    }
    generation.messages.set(id, { text, phase });
    generation.textLength = textLength;
  }

  #completeGeneration(generation: Generation, turn: Record<string, unknown>): void {
    if (turn.status !== 'completed') {
      const error = recordSchema.safeParse(turn.error);
      generation.reject(
        new Error(
          error.success && typeof error.data.message === 'string'
            ? error.data.message
            : 'Codex could not complete the proposal.',
        ),
      );
      return;
    }
    if (Array.isArray(turn.items)) {
      for (const entry of turn.items) {
        const item = recordSchema.safeParse(entry);
        if (item.success && item.data.type === 'agentMessage' && typeof item.data.id === 'string') {
          this.#rememberMessage(generation, item.data.id, item.data);
        }
      }
    }
    const final = [...generation.messages.values()]
      .filter((item) => item.phase !== 'commentary')
      .at(-1);
    try {
      generation.resolve(CodexPlanSchema.parse(JSON.parse(final?.text ?? '') as unknown));
    } catch {
      generation.reject(
        new Error('Codex did not return a valid WebRAD proposal. Try a more specific request.'),
      );
    }
  }

  #fail(error: Error): void {
    for (const pending of this.#pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.#pending.clear();
    this.#generation?.reject(error);
    this.#generation = null;
  }

  public dispose(): void {
    this.#close(new Error('The Codex connection was closed.'));
  }

  #close(error: Error): void {
    this.#sessions.clear();
    const signingIn = this.loginPending;
    this.#epoch += 1;
    this.#loginEpoch += 1;
    const child = this.#child;
    this.#child = null;
    this.#ready = null;
    this.#loginId = null;
    this.#pendingLoginEpoch = null;
    this.#completedLogins.clear();
    this.#fail(error);
    child?.stdin.destroy();
    child?.kill();
    if (signingIn) {
      this.#loginError = error.message;
      for (const listener of this.#accountListeners) listener();
    }
  }
}
