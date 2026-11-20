import { useCallback, useEffect, useRef, useState } from 'react';
import type { PageModel } from '@webrad/project-model';
import type {
  CodexPreferences,
  CodexProgress,
  CodexProposal,
  CodexStatus,
} from '../../../shared/codex-contracts';
import { CodexProjectCommand } from './codex-command';
import { useCodexUsage } from './useCodexUsage';
import type { DesignerController } from './designer-controller';
import type { ProjectController, ProjectControllerSnapshot } from './project-controller';

export interface CodexMessage {
  readonly id: string;
  readonly role: 'user' | 'assistant';
  readonly text: string;
  readonly error?: boolean;
  readonly proposal?: CodexProposal;
  readonly disposition?: 'applied' | 'discarded';
}

interface Conversation {
  readonly id: string;
  readonly updatedAt: number;
  readonly draft: string;
  readonly messages: readonly CodexMessage[];
}

interface ConversationGroup {
  readonly activeId: string;
  readonly chats: readonly Conversation[];
}

interface ActiveRequest {
  readonly id: string;
  readonly scope: string;
  readonly prompt?: string;
  canceled: boolean;
}

const emptyConversation: Conversation = Object.freeze({
  id: 'initial',
  updatedAt: 0,
  draft: '',
  messages: [],
});
const emptyGroup: ConversationGroup = { activeId: 'initial', chats: [emptyConversation] };
const welcomeScope = 'webrad:codex:welcome';

function retainCodexMessages(messages: readonly CodexMessage[]): readonly CodexMessage[] {
  if (messages.length <= 30) return messages;
  const first = messages[0];
  return first ? [first, ...messages.slice(-29)] : [];
}

function projectScope(snapshot: ProjectControllerSnapshot): string | null {
  if (!snapshot.project || !snapshot.rootPath) return null;
  const portable = snapshot.rootPath.replaceAll('\\', '/');
  const root = window.webrad.platform === 'win32' ? portable.toLowerCase() : portable;
  return JSON.stringify([root, snapshot.project.id]);
}

function messageOf(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const prefix = "Error invoking remote method '";
  if (!message.startsWith(prefix)) return message;
  const separator = message.indexOf("': ", prefix.length);
  if (separator < 0) return message;
  const detail = message.slice(separator + "': ".length);
  for (const name of [
    'Error',
    'SyntaxError',
    'TypeError',
    'RangeError',
    'AbortError',
    'ZodError',
  ]) {
    const errorPrefix = `${name}: `;
    if (detail.startsWith(errorPrefix)) return detail.slice(errorPrefix.length);
  }
  return detail;
}

export function useCodex(
  controller: ProjectController,
  designer: DesignerController,
  snapshot: ProjectControllerSnapshot,
  page: PageModel | null,
  selection: readonly string[],
  open: boolean,
  editingEnabled: boolean,
) {
  const bridge = window.webrad.codex;
  const [status, setStatus] = useState<CodexStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [feedback, setFeedback] = useState<{ scope: string | null; text: string } | null>(null);
  const [model, setModel] = useState('gpt-6.1-terra');
  const [effort, setEffort] = useState('medium');
  const [progress, setProgress] = useState<CodexProgress | null>(null);
  const [busy, setBusy] = useState(false);
  const [stopping, setStopping] = useState(false);
  const usage = useCodexUsage(
    open && status?.account && !connecting
      ? JSON.stringify([status.executablePath, status.account.label, status.account.plan])
      : null,
    busy,
  );
  const [conversations, setConversations] = useState<ReadonlyMap<string, ConversationGroup>>(
    new Map(),
  );
  const [historyReady, setHistoryReady] = useState(false);
  const [historyFailed, setHistoryFailed] = useState(false);
  useEffect(() => {
    let active = true;
    void bridge
      .readHistory()
      .then((saved) => {
        if (!active) return;
        setConversations(
          (current) => new Map<string, ConversationGroup>([...Object.entries(saved), ...current]),
        );
        setHistoryReady(true);
      })
      .catch((cause: unknown) => {
        if (active) {
          setHistoryFailed(true);
          setFeedback({
            scope: null,
            text: 'Could not load local chat history: ' + messageOf(cause),
          });
        }
      });
    return () => {
      active = false;
    };
  }, [bridge]);
  const request = useRef<ActiveRequest | null>(null);
  const alive = useRef(true);
  const settingsRevision = useRef(0);
  const settingsMutation = useRef(false);
  const refreshPending = useRef(false);
  const loginRevision = useRef(0);
  const loginOperation = useRef(false);
  const loginPending = useRef(false);
  const loginCanceling = useRef(false);
  const scope = projectScope(snapshot);
  const group = conversations.get(scope ?? welcomeScope) ?? emptyGroup;
  const pendingHistory = useRef(new Map<string, ConversationGroup>());
  useEffect(() => {
    if (!historyReady || !conversations.has(scope ?? welcomeScope)) return;
    const key = scope ?? welcomeScope;
    pendingHistory.current.set(key, group);
    const save = (): void => {
      const value = pendingHistory.current.get(key);
      if (!value) return;
      const stored = {
        ...value,
        chats: value.chats.map((chat) => ({
          ...chat,
          messages: chat.messages.map(({ id, role, text, error, disposition }) => ({
            id,
            role,
            text,
            error,
            disposition,
          })),
        })),
      };
      void bridge
        .saveHistory(key, stored)
        .then(() => {
          if (pendingHistory.current.get(key) === value) pendingHistory.current.delete(key);
        })
        .catch((cause: unknown) => {
          if (alive.current)
            setFeedback({ scope, text: 'Could not save local chat history: ' + messageOf(cause) });
        });
    };
    const timer = setTimeout(save, 400);
    return () => clearTimeout(timer);
  }, [bridge, conversations, group, historyReady, scope]);
  useEffect(() => {
    const pending = pendingHistory.current;
    const flush = (): void => {
      for (const [key, value] of pending) {
        const stored = {
          ...value,
          chats: value.chats.map((chat) => ({
            ...chat,
            messages: chat.messages.map(({ id, role, text, error, disposition }) => ({
              id,
              role,
              text,
              error,
              disposition,
            })),
          })),
        };
        void bridge.saveHistory(key, stored).catch((cause: unknown) => {
          console.error('[IDE] Could not flush Codex conversation history:', messageOf(cause));
        });
      }
    };
    window.addEventListener('pagehide', flush);
    window.addEventListener('beforeunload', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      window.removeEventListener('beforeunload', flush);
      flush();
    };
  }, [bridge, scope]);
  const conversation = group.chats.find((chat) => chat.id === group.activeId) ?? emptyConversation;
  const { messages, draft } = conversation;
  const error =
    feedback && (feedback.scope === null || feedback.scope === scope) ? feedback.text : null;
  const selectedModel = status?.models.find((item) => item.id === model);
  const selectedEffort = selectedModel?.efforts.find((item) => item.id === effort);
  const canSend =
    historyReady &&
    editingEnabled &&
    page !== null &&
    scope !== null &&
    status?.available === true &&
    status.account !== null &&
    selectedEffort !== undefined &&
    !busy &&
    !loading &&
    !connecting;

  const updateConversation = useCallback(
    (
      key: string,
      update: (current: Conversation) => Pick<Conversation, 'draft' | 'messages'>,
    ): void => {
      if (!historyReady) return;
      setConversations((current) => {
        const next = new Map(current);
        const previous = next.get(key) ?? emptyGroup;
        next.set(key, {
          ...previous,
          chats: previous.chats.map((chat) =>
            chat.id === previous.activeId
              ? { ...chat, ...update(chat), updatedAt: Date.now() }
              : chat,
          ),
        });
        return next;
      });
    },
    [historyReady],
  );

  const receiveStatus = useCallback((next: CodexStatus): void => {
    setStatus(next);
    if (!loginOperation.current) loginPending.current = Boolean(next.loginPending);
    setConnecting(loginPending.current || loginOperation.current);
    // Keep an unavailable saved choice visible; never silently replace its model.
    setModel(next.preferences.model);
    setEffort(next.preferences.effort);
  }, []);

  const refresh = useCallback(
    async (clearFeedback = true): Promise<void> => {
      if (settingsMutation.current) {
        refreshPending.current = true;
        return;
      }
      const revision = ++settingsRevision.current;
      setLoading(true);
      if (clearFeedback) setFeedback(null);
      try {
        const next = await bridge.status();
        if (alive.current && revision === settingsRevision.current) receiveStatus(next);
      } catch (cause) {
        if (alive.current && revision === settingsRevision.current) {
          setFeedback({ scope: null, text: messageOf(cause) });
        }
      } finally {
        if (alive.current && revision === settingsRevision.current) setLoading(false);
      }
    },
    [bridge, receiveStatus],
  );

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      settingsRevision.current += 1;
      loginRevision.current += 1;
      const active = request.current;
      if (active) {
        active.canceled = true;
        void bridge.cancel(active.id).catch(() => undefined);
      }
    };
  }, [bridge]);

  useEffect(() => {
    if (open) void refresh();
  }, [open, refresh]);

  useEffect(() => {
    const unsubscribe = bridge.subscribe((next) => {
      if (alive.current && request.current?.id === next.requestId && !request.current.canceled) {
        setProgress(next);
      }
    });
    const unsubscribeAccount = bridge.onAccountChanged(() => {
      if (!alive.current) return;
      void refresh(false);
    });
    return () => {
      unsubscribe();
      unsubscribeAccount();
    };
  }, [bridge, refresh]);

  useEffect(() => {
    const active = request.current;
    if (active && active.scope !== scope && !active.canceled) {
      active.canceled = true;
      setStopping(true);
      void bridge.cancel(active.id).catch(() => undefined);
    }
  }, [scope, bridge]);

  const finish = useCallback((active: ActiveRequest): void => {
    if (request.current !== active) return;
    request.current = null;
    if (alive.current) {
      setBusy(false);
      setStopping(false);
      setProgress(null);
    }
  }, []);

  const generate = useCallback(
    async (prompt: string): Promise<void> => {
      const current = controller.getSnapshot();
      if (
        !canSend ||
        !scope ||
        !page ||
        !current.project ||
        !current.rootPath ||
        request.current ||
        settingsMutation.current ||
        loginOperation.current ||
        loginPending.current
      )
        return;
      if (projectScope(current) !== scope || !prompt.trim()) return;
      if (prompt.length > 24_000) {
        setFeedback({ scope, text: 'Keep your request under 24,000 characters.' });
        return;
      }
      const documentExists = [
        ...current.project.pages,
        ...current.project.reusableElements,
        ...(current.project.menus ?? []),
      ].some((document) => document.id === page.id);
      if (!documentExists) {
        setFeedback({ scope, text: 'Open a visual document before sending this request.' });
        return;
      }
      const active: ActiveRequest = {
        id: crypto.randomUUID(),
        scope,
        prompt: prompt.trim(),
        canceled: false,
      };
      request.current = active;
      setBusy(true);
      setStopping(false);
      setFeedback(null);
      setProgress({ requestId: active.id, phase: 'connecting', message: 'Connecting to Codex…' });
      updateConversation(scope, (previous) => ({
        draft: '',
        messages: retainCodexMessages([
          ...previous.messages,
          {
            id: `${active.id}:user`,
            role: 'user' as const,
            text: prompt.trim(),
          },
        ]),
      }));
      try {
        const proposal = await bridge.generate({
          conversationId: conversation.id,
          requestId: active.id,
          rootPath: current.rootPath,
          project: current.project,
          userSources: current.userSources,
          revision: current.revision,
          documentId: page.id,
          selection,
          prompt: prompt.trim(),
          model,
          effort,
          conversation: (messages.length > 6
            ? [messages[0]!, ...messages.slice(-5)]
            : messages
          ).map((message) => ({
            diagnostics: message.disposition
              ? []
              : message.proposal?.diagnostics.slice(0, 5).map((item) => item.message.slice(0, 500)),
            role: message.role,
            text: message.text.slice(0, 8000),
            ...(message.disposition ? { disposition: message.disposition } : {}),
          })),
        });
        if (!alive.current || request.current !== active) return;
        if (active.canceled || projectScope(controller.getSnapshot()) !== active.scope) {
          throw new Error('The request was stopped. No changes were applied.');
        }
        updateConversation(active.scope, (previous) => ({
          ...previous,
          messages: retainCodexMessages([
            ...previous.messages,
            {
              id: `${active.id}:assistant`,
              role: 'assistant' as const,
              text: proposal.summary,
              proposal,
            },
          ]),
        }));
      } catch (cause) {
        if (alive.current && request.current === active) {
          updateConversation(active.scope, (previous) => ({
            draft: previous.draft || active.prompt || '',
            messages: retainCodexMessages([
              ...previous.messages,
              {
                id: `${active.id}:assistant`,
                role: 'assistant' as const,
                text: active.canceled
                  ? 'Request stopped. No changes were applied.'
                  : messageOf(cause),
                error: !active.canceled,
              },
            ]),
          }));
        }
      } finally {
        finish(active);
      }
    },
    [
      conversation.id,
      bridge,
      canSend,
      controller,
      effort,
      finish,
      messages,
      model,
      page,
      scope,
      selection,
      updateConversation,
    ],
  );

  const review = async (message: CodexMessage): Promise<void> => {
    const proposal = message.proposal;
    const current = controller.getSnapshot();
    if (
      !proposal ||
      !scope ||
      !page ||
      !current.project ||
      !current.rootPath ||
      request.current ||
      settingsMutation.current ||
      !editingEnabled ||
      message.disposition
    )
      return;
    if (
      projectScope(current) !== scope ||
      proposal.projectId !== current.project.id ||
      proposal.documentId !== page.id ||
      proposal.baseRevision !== current.revision
    ) {
      setFeedback({
        scope,
        text: 'The project changed. Ask Codex for a new proposal before reviewing it again.',
      });
      return;
    }
    const active: ActiveRequest = { id: crypto.randomUUID(), scope, canceled: false };
    request.current = active;
    setBusy(true);
    setStopping(false);
    setFeedback(null);
    setProgress({
      requestId: active.id,
      phase: 'checking',
      message: 'Rechecking the proposal locally…',
    });
    try {
      const checked = await bridge.review({
        requestId: active.id,
        rootPath: current.rootPath,
        project: current.project,
        userSources: current.userSources,
        revision: current.revision,
        documentId: page.id,
        plan: proposal.plan,
      });
      if (!alive.current || request.current !== active || active.canceled) return;
      if (projectScope(controller.getSnapshot()) !== active.scope) return;
      updateConversation(active.scope, (previous) => ({
        ...previous,
        messages: previous.messages.map((entry) =>
          entry.id === message.id
            ? {
                ...entry,
                text: checked.summary,
                proposal: {
                  ...checked,
                  contextSummary: checked.contextSummary ?? proposal.contextSummary,
                },
              }
            : entry,
        ),
      }));
    } catch (cause) {
      if (alive.current && request.current === active && !active.canceled) {
        setFeedback({ scope: active.scope, text: messageOf(cause) });
      }
    } finally {
      finish(active);
    }
  };

  const cancel = async (): Promise<void> => {
    const active = request.current;
    if (!active || active.canceled) return;
    active.canceled = true;
    setStopping(true);
    setProgress({ requestId: active.id, phase: 'connecting', message: 'Stopping Codex…' });
    try {
      await bridge.cancel(active.id);
    } catch (cause) {
      if (!alive.current || request.current !== active) return;
      active.canceled = false;
      setStopping(false);
      setFeedback({ scope: active.scope, text: messageOf(cause) });
    }
  };

  const connect = async (): Promise<void> => {
    if (
      loginOperation.current ||
      loginPending.current ||
      settingsMutation.current ||
      request.current ||
      connecting ||
      loading
    )
      return;
    const revision = ++loginRevision.current;
    loginOperation.current = true;
    loginPending.current = true;
    setConnecting(true);
    setFeedback(null);
    try {
      await bridge.login();
    } catch (cause) {
      if (alive.current && revision === loginRevision.current) {
        loginPending.current = false;
        setFeedback({ scope: null, text: messageOf(cause) });
      }
    } finally {
      if (revision === loginRevision.current) {
        loginOperation.current = false;
        if (alive.current) {
          setConnecting(loginPending.current);
          void refresh(false);
        }
      }
    }
  };

  const cancelLogin = async (): Promise<void> => {
    if (loginCanceling.current) return;
    const revision = ++loginRevision.current;
    loginCanceling.current = true;
    loginOperation.current = true;
    try {
      await bridge.cancelLogin();
    } catch (cause) {
      if (alive.current && revision === loginRevision.current) {
        setFeedback({ scope: null, text: messageOf(cause) });
      }
    } finally {
      if (revision === loginRevision.current) {
        loginCanceling.current = false;
        loginOperation.current = false;
        loginPending.current = false;
        if (alive.current) {
          setConnecting(false);
          void refresh(false);
        }
      }
    }
  };

  const changeSettings = async (operation: () => Promise<CodexStatus>): Promise<void> => {
    if (
      settingsMutation.current ||
      request.current ||
      loginOperation.current ||
      loginPending.current ||
      connecting
    )
      return;
    settingsMutation.current = true;
    const revision = ++settingsRevision.current;
    setLoading(true);
    setFeedback(null);
    try {
      const next = await operation();
      if (alive.current && revision === settingsRevision.current) receiveStatus(next);
    } catch (cause) {
      if (alive.current && revision === settingsRevision.current) {
        setFeedback({ scope: null, text: messageOf(cause) });
      }
    } finally {
      settingsMutation.current = false;
      if (alive.current && revision === settingsRevision.current) setLoading(false);
      if (alive.current && refreshPending.current) {
        refreshPending.current = false;
        void refresh();
      }
    }
  };

  const preferences = async (
    patch: Partial<Pick<CodexPreferences, 'model' | 'effort'>>,
  ): Promise<void> => {
    if (!status || busy || loading) return;
    const nextModel = patch.model ?? model;
    const selected = status.models.find((item) => item.id === nextModel);
    const nextEffort =
      patch.effort ??
      (selected?.efforts.some((item) => item.id === effort)
        ? effort
        : (selected?.defaultEffort ?? effort));
    await changeSettings(() =>
      bridge.preferences({
        ...status.preferences,
        model: nextModel,
        effort: nextEffort,
      }),
    );
  };

  const disposition = (id: string, value: 'applied' | 'discarded'): void => {
    if (!scope) return;
    updateConversation(scope, (previous) => ({
      ...previous,
      messages: previous.messages.map((message) =>
        message.id === id ? { ...message, disposition: value } : message,
      ),
    }));
  };

  const apply = (message: CodexMessage): void => {
    const proposal = message.proposal;
    if (
      !proposal ||
      request.current ||
      settingsMutation.current ||
      busy ||
      !editingEnabled ||
      message.disposition
    )
      return;
    const current = controller.getSnapshot();
    try {
      if (proposal.diagnostics.length > 0)
        throw new Error('Resolve the reported review errors before applying this proposal.');
      if (
        !page ||
        projectScope(current) !== scope ||
        proposal.baseRevision !== current.revision ||
        proposal.documentId !== page.id ||
        proposal.projectId !== current.project?.id
      ) {
        throw new Error(
          'The project changed after this proposal was prepared. Ask Codex for a new proposal for the current version.',
        );
      }
      if (proposal.changes.length === 0) return;
      designer.execute(page, new CodexProjectCommand(page, proposal, controller));
      disposition(message.id, 'applied');
      setFeedback(null);
    } catch (cause) {
      setFeedback({ scope, text: messageOf(cause) });
    }
  };

  const clear = (): void => {
    if (!historyReady) return;
    if (!request.current && !busy) {
      if (group.chats.length >= 100) {
        setFeedback({
          scope,
          text: 'This project has 100 conversations. Delete an old conversation before creating another.',
        });
        return;
      }
      if (messages.length === 0 && !draft) return;
      const chat: Conversation = {
        id: crypto.randomUUID(),
        updatedAt: Date.now(),
        draft: '',
        messages: [],
      };
      setConversations((current) =>
        new Map(current).set(scope ?? welcomeScope, {
          activeId: chat.id,
          chats: [...(current.get(scope ?? welcomeScope) ?? emptyGroup).chats, chat],
        }),
      );
      setFeedback(null);
    }
  };

  return {
    usage: usage.usage,
    usageError: usage.error,
    status,
    loading: loading || (!historyReady && !historyFailed),
    historyReady,
    connecting,
    error,
    model,
    effort,
    selectedModel,
    selectedEffort,
    busy,
    stopping,
    progress,
    messages,
    canSend,
    refresh,
    generate,
    review,
    cancel,
    connect,
    cancelLogin,
    chooseExecutable: () => changeSettings(() => bridge.chooseExecutable()),
    preferences,
    apply,
    discard: (id: string) => disposition(id, 'discarded'),
    clear,
    chats: group.chats
      .map((chat) => ({
        id: chat.id,
        title:
          chat.messages.find((message) => message.role === 'user')?.text.slice(0, 100) ||
          chat.draft.slice(0, 100) ||
          'New conversation',
        updatedAt: chat.updatedAt,
        messages: chat.messages.length,
      }))
      .sort((left, right) => right.updatedAt - left.updatedAt),
    activeChatId: group.activeId,
    selectChat: (id: string): void => {
      if (!historyReady) return;
      if (request.current || busy) return;
      setConversations((current) => {
        const previous = current.get(scope ?? welcomeScope) ?? emptyGroup;
        return previous.chats.some((chat) => chat.id === id)
          ? new Map(current).set(scope ?? welcomeScope, { ...previous, activeId: id })
          : current;
      });
      setFeedback(null);
    },
    deleteChat: (id: string): void => {
      if (!historyReady) return;
      if (request.current || busy) return;
      setConversations((current) => {
        const previous = current.get(scope ?? welcomeScope) ?? emptyGroup;
        const chats = previous.chats.filter((chat) => chat.id !== id);
        return new Map(current).set(
          scope ?? welcomeScope,
          chats.length === 0
            ? (() => {
                const id = crypto.randomUUID();
                return {
                  activeId: id,
                  chats: [{ id, updatedAt: Date.now(), draft: '', messages: [] }],
                };
              })()
            : {
                activeId: previous.activeId === id ? chats[0]!.id : previous.activeId,
                chats,
              },
        );
      });
    },
    draft,
    setDraft: (text: string) =>
      updateConversation(scope ?? welcomeScope, (previous) => ({ ...previous, draft: text })),
    contextInventory: {
      documents:
        (snapshot.project?.pages.length ?? 0) +
        (snapshot.project?.reusableElements.length ?? 0) +
        (snapshot.project?.menus?.length ?? 0),
      sources: Object.keys(snapshot.userSources).length,
      assets: snapshot.project?.assets?.length ?? 0,
    },
    contextSummary: [...messages].reverse().find((message) => message.proposal)?.proposal
      ?.contextSummary,
  };
}

export type CodexAssistant = ReturnType<typeof useCodex>;
