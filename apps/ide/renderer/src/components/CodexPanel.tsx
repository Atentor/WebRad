import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactElement } from 'react';
import type { PageModel } from '@webrad/project-model';
import type { CodexAssistant, CodexMessage } from '../state/useCodex';
import { Icon } from './Icon';
import { CodexActivity } from './CodexActivity';
import { CodexUsage } from './CodexUsage';
import './codex-panel.css';

interface CodexPanelProps {
  readonly assistant: CodexAssistant;
  readonly page: PageModel | null;
  readonly revision: number;
  readonly selectionCount: number;
  readonly editingEnabled: boolean;
  readonly onClose: () => void;
}

const suggestions = [
  {
    icon: 'panels-top-left' as const,
    label: 'Build a form',
    prompt:
      'Create a polished, responsive registration form with name and email fields, a save button, and typed validation using the existing WebRAD components.',
  },
  {
    icon: 'layout-dashboard' as const,
    label: 'Refine this layout',
    prompt:
      'Improve this page’s layout, spacing, alignment and visual hierarchy using the existing components and native styles. Preserve its behavior.',
  },
  {
    icon: 'code-xml' as const,
    label: 'Add typed behavior',
    prompt:
      'Review the selected components and suggest useful typed event handlers. Ask for any missing business rules before adding behavior.',
  },
];

const effortLabels: Readonly<Record<string, string>> = {
  none: 'None',
  minimal: 'Minimal',
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  xhigh: 'Extra high',
  max: 'Maximum',
  ultra: 'Ultra',
};

function SourceVersion({
  label,
  source,
}: {
  readonly label: string;
  readonly source: string;
}): ReactElement {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);
  const copy = async (): Promise<void> => {
    setError(false);
    try {
      await navigator.clipboard.writeText(source);
      setCopied(true);
    } catch {
      setError(true);
    }
  };
  return (
    <div className="wr-codex-code-version">
      <div className="wr-codex-code-heading">
        <span>{label}</span>
        <button
          type="button"
          aria-label={`Copy ${label.toLowerCase()}`}
          onClick={() => void copy()}
        >
          <Icon name={copied ? 'check' : 'copy'} />
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre tabIndex={0} aria-label={`TypeScript ${label.toLowerCase()}`}>
        <code>{source}</code>
      </pre>
      {error && (
        <p className="wr-codex-copy-error" role="status">
          Copy is unavailable. Select the source to copy it manually.
        </p>
      )}
    </div>
  );
}

function ProposalReview({
  message,
  assistant,
  page,
  revision,
  editingEnabled,
}: Pick<CodexPanelProps, 'assistant' | 'page' | 'revision' | 'editingEnabled'> & {
  readonly message: CodexMessage;
}): ReactElement | null {
  const proposal = message.proposal;
  if (!proposal || (proposal.changes.length === 0 && proposal.diagnostics.length === 0))
    return null;
  const stale = proposal.baseRevision !== revision || proposal.documentId !== page?.id;
  const invalid = proposal.diagnostics.length > 0;
  const applied = message.disposition === 'applied';
  const discarded = message.disposition === 'discarded';
  return (
    <section className="wr-codex-review" aria-label="Review Codex changes">
      <div className="wr-codex-review-heading">
        <Icon name={applied ? 'circle-check' : invalid ? 'triangle-alert' : 'git-pull-request'} />
        <strong>
          {applied ? 'Changes applied' : discarded ? 'Proposal discarded' : 'Review changes'}
        </strong>
        <span>{proposal.changes.length}</span>
      </div>
      <details className="wr-codex-change-list" open={!message.disposition}>
        <summary>Components, layout and code</summary>
        <ul>
          {proposal.changes.map((change, index) => (
            <li key={`${index}:${change}`}>{change}</li>
          ))}
        </ul>
      </details>
      {proposal.sourceBefore !== proposal.sourceAfter && (
        <details className="wr-codex-source-review">
          <summary>TypeScript · {proposal.sourcePath}</summary>
          <SourceVersion label="Current source" source={proposal.sourceBefore} />
          <SourceVersion label="Proposed source" source={proposal.sourceAfter} />
        </details>
      )}
      {invalid && !message.disposition && (
        <div className="wr-codex-review-errors" role="status">
          <strong>Review needs attention</strong>
          <p>
            These changes cannot be applied yet. Recheck the proposal locally without a new AI
            request, or ask Codex to revise it.
          </p>
          <ul>
            {proposal.diagnostics.slice(0, 10).map((diagnostic, index) => (
              <li key={index}>
                {diagnostic.line ? `Line ${diagnostic.line}: ` : ''}
                {diagnostic.message}
              </li>
            ))}
          </ul>
          {proposal.diagnostics.length > 10 && (
            <p>{proposal.diagnostics.length - 10} more errors.</p>
          )}
        </div>
      )}
      {!message.disposition && stale && (
        <p className="wr-codex-review-note">
          <Icon name="info" />
          The project changed. Prepare a new proposal to include your latest edits.
        </p>
      )}
      {applied ? (
        <p className="wr-codex-review-note">Use Undo in the Designer to revert this change.</p>
      ) : discarded ? null : (
        <div className="wr-codex-review-actions">
          <button
            type="button"
            className="wr-codex-primary"
            disabled={
              stale || invalid || proposal.changes.length === 0 || assistant.busy || !editingEnabled
            }
            onClick={() => assistant.apply(message)}
          >
            <Icon name="check" /> Apply changes
          </button>
          {invalid && (
            <button
              type="button"
              className="wr-codex-secondary"
              title="Run local checks again without a new AI request"
              disabled={stale || assistant.busy || assistant.loading || !editingEnabled}
              onClick={() => void assistant.review(message)}
            >
              <Icon name="refresh-cw" />
              Recheck
            </button>
          )}
          <button
            type="button"
            className="wr-codex-secondary"
            disabled={assistant.busy}
            onClick={() => assistant.discard(message.id)}
          >
            Discard
          </button>
        </div>
      )}
    </section>
  );
}

export function CodexPanel(props: CodexPanelProps): ReactElement {
  const { assistant, page, revision, selectionCount, editingEnabled, onClose } = props;
  const { draft, setDraft } = assistant;
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [chatsOpen, setChatsOpen] = useState(false);
  const composer = useRef<HTMLTextAreaElement>(null);
  const history = useRef<HTMLDivElement>(null);
  const follow = useRef(true);
  const returnFocus = useRef<HTMLElement | null>(
    document.activeElement instanceof HTMLElement ? document.activeElement : null,
  );
  const status = assistant.status;
  const connected = status?.available === true && status.account !== null;
  const hintId = useId();

  useEffect(() => {
    const target = returnFocus.current;
    return () => {
      if (target?.isConnected) target.focus();
    };
  }, []);

  useEffect(() => {
    if (follow.current && history.current)
      history.current.scrollTop =
        assistant.messages.length === 0 ? 0 : history.current.scrollHeight;
  }, [assistant.messages.length, assistant.progress, assistant.activeChatId]);

  useEffect(() => {
    composer.current?.focus();
  }, []);

  useEffect(() => {
    const input = composer.current;
    if (!input) return;
    input.style.height = 'auto';
    input.style.height = `${Math.min(180, Math.max(78, input.scrollHeight))}px`;
  }, [draft]);

  const send = (): void => {
    if (!assistant.canSend || !draft.trim()) return;
    const prompt = draft;
    follow.current = true;
    void assistant.generate(prompt);
  };
  const keyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (
      event.key === 'Enter' &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing &&
      assistant.canSend
    ) {
      event.preventDefault();
      send();
    }
  };

  return (
    <section
      className="wr-codex-panel"
      aria-label="Codex assistant"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          onClose();
        }
      }}
    >
      <header className="wr-codex-header">
        <div className="wr-codex-title">
          <Icon name="openai" />
          <h2>Codex</h2>
        </div>
        <div className="wr-codex-header-actions">
          <button
            type="button"
            aria-label="Codex conversation history"
            title="Conversation history"
            aria-expanded={chatsOpen}
            onClick={() => setChatsOpen((value) => !value)}
          >
            <Icon name="messages-square" />
          </button>
          <button
            type="button"
            aria-label="New Codex conversation"
            title="New conversation"
            disabled={assistant.busy || (assistant.messages.length === 0 && !draft)}
            onClick={assistant.clear}
          >
            <Icon name="square-pen" />
          </button>
          <button
            type="button"
            aria-label="Codex connection settings"
            title="Connection settings"
            aria-expanded={settingsOpen}
            onClick={() => setSettingsOpen((value) => !value)}
          >
            <Icon name="settings-2" />
          </button>
          <button type="button" aria-label="Close Codex" title="Close Codex" onClick={onClose}>
            <Icon name="x" />
          </button>
        </div>
      </header>

      {chatsOpen && (
        <section className="wr-codex-chats" aria-label="Previous Codex conversations">
          <div className="wr-codex-chats-heading">
            <strong>Conversations</strong>
            <span>{assistant.chats.length}</span>
          </div>
          <p>
            {assistant.historyReady
              ? 'Conversations are saved locally for this project. Restored messages are reference only; request a new proposal to make changes.'
              : 'Local history is unavailable. New requests are disabled to protect saved conversations.'}
          </p>
          <div className="wr-codex-chats-list">
            {assistant.chats.map((chat) => (
              <div className="wr-codex-chat-row" key={chat.id}>
                <button
                  type="button"
                  aria-current={chat.id === assistant.activeChatId ? 'true' : undefined}
                  disabled={assistant.busy}
                  onClick={() => {
                    assistant.selectChat(chat.id);
                    setChatsOpen(false);
                    follow.current = true;
                    composer.current?.focus();
                  }}
                >
                  <span>{chat.title}</span>
                  <small>
                    {chat.messages} messages
                    {chat.updatedAt ? ` · ${new Date(chat.updatedAt).toLocaleString()}` : ''}
                  </small>
                </button>
                <button
                  type="button"
                  aria-label={`Delete conversation: ${chat.title}`}
                  title="Delete conversation"
                  disabled={assistant.busy}
                  onClick={() => assistant.deleteChat(chat.id)}
                >
                  <Icon name="trash" />
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {settingsOpen && (
        <section className="wr-codex-settings" aria-label="Codex connection">
          <div className="wr-codex-account">
            <span
              className={connected ? 'wr-codex-status-dot is-connected' : 'wr-codex-status-dot'}
            />
            <div>
              <strong>{status?.account?.label ?? 'ChatGPT account'}</strong>
              <span>
                {status?.account?.plan
                  ? `${status.account.plan} plan`
                  : connected
                    ? 'Connected'
                    : 'Sign in to connect'}
              </span>
            </div>
          </div>
          <p>WebRAD keeps its Codex sign-in separate from your other editors.</p>
          <div className="wr-codex-settings-actions">
            <button
              type="button"
              className="wr-codex-secondary"
              disabled={
                assistant.loading || assistant.busy || assistant.connecting || !status?.available
              }
              onClick={() => void assistant.connect()}
            >
              <Icon name="log-in" />
              {connected ? 'Change account' : 'Sign in'}
            </button>
            <button
              type="button"
              className="wr-codex-secondary"
              disabled={assistant.loading || assistant.busy || assistant.connecting}
              onClick={() => void assistant.refresh()}
            >
              <Icon name="refresh-cw" />
              Refresh
            </button>
          </div>
          <details>
            <summary>Codex installation</summary>
            <p>Use Codex CLI or the native executable included with the Codex IDE extension.</p>
            {status?.executablePath && (
              <code className="wr-codex-executable">{status.executablePath}</code>
            )}
            <button
              type="button"
              className="wr-codex-secondary"
              disabled={assistant.busy || assistant.loading || assistant.connecting}
              onClick={() => void assistant.chooseExecutable()}
            >
              Select executable…
            </button>
          </details>
        </section>
      )}

      <div
        className="wr-codex-history"
        ref={history}
        role="log"
        aria-label="Codex conversation"
        aria-live="polite"
        aria-relevant="additions"
        onScroll={() => {
          const element = history.current;
          if (element)
            follow.current = element.scrollHeight - element.scrollTop - element.clientHeight < 64;
        }}
      >
        {status && !connected && (
          <section className="wr-codex-connect-card" aria-label="Connect to Codex">
            <Icon name={status.available ? 'log-in' : 'plug'} />
            <h3>{status.available ? 'Connect your ChatGPT account' : 'Set up Codex'}</h3>
            <p>{status.message ?? 'Sign in in your browser to use Codex in WebRAD.'}</p>
            {status.available ? (
              assistant.connecting ? (
                <>
                  <p role="status">Complete sign-in in your browser.</p>
                  <button
                    type="button"
                    className="wr-codex-secondary"
                    onClick={() => void assistant.cancelLogin()}
                  >
                    Cancel sign-in
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="wr-codex-primary"
                  disabled={assistant.loading || assistant.busy}
                  onClick={() => void assistant.connect()}
                >
                  <Icon name="log-in" />
                  Sign in with ChatGPT
                </button>
              )
            ) : (
              <button
                type="button"
                className="wr-codex-primary"
                disabled={assistant.loading}
                onClick={() => void assistant.chooseExecutable()}
              >
                <Icon name="folder-open" />
                Select Codex executable
              </button>
            )}
          </section>
        )}
        {assistant.messages.length === 0 && (
          <div className="wr-codex-welcome">
            <div className="wr-codex-welcome-icon">
              <Icon name="openai" />
            </div>
            <h3>Build with your components.</h3>
            <p>
              Describe a screen or a change. Codex works with native WebRAD components and typed
              TypeScript.
            </p>
            <div className="wr-codex-suggestions">
              {suggestions.map((suggestion) => (
                <button
                  type="button"
                  key={suggestion.label}
                  onClick={() => {
                    setDraft(suggestion.prompt);
                    composer.current?.focus();
                  }}
                >
                  <Icon name={suggestion.icon} />
                  <span>{suggestion.label}</span>
                  <Icon name="arrow-up-right" />
                </button>
              ))}
            </div>
          </div>
        )}

        {assistant.loading && status === null && (
          <p className="wr-codex-inline-status" role="status">
            <Icon name="loader-circle" />
            Connecting to Codex…
          </p>
        )}
        {connected && status.message && (
          <p className="wr-codex-feedback" role="status">
            {status.message}
          </p>
        )}
        {connected && assistant.connecting && (
          <p className="wr-codex-inline-status" role="status">
            Complete account sign-in in your browser.{' '}
            <button type="button" onClick={() => void assistant.cancelLogin()}>
              Cancel
            </button>
          </p>
        )}

        {assistant.messages.map((message) => (
          <article
            key={message.id}
            className={`wr-codex-message is-${message.role}${message.error ? ' is-error' : ''}`}
          >
            <div className="wr-codex-message-author">
              <strong>{message.role === 'user' ? 'You' : 'Codex'}</strong>
            </div>
            <p>{message.text}</p>
            <ProposalReview
              message={message}
              assistant={assistant}
              page={page}
              revision={revision}
              editingEnabled={editingEnabled}
            />
          </article>
        ))}
        {assistant.busy && (
          <CodexActivity progress={assistant.progress} stopping={assistant.stopping} />
        )}
      </div>

      <footer className="wr-codex-footer">
        {assistant.error && (
          <div className="wr-codex-feedback is-error" role="alert">
            <Icon name="triangle-alert" />
            <span>{assistant.error}</span>
          </div>
        )}
        {connected &&
          !assistant.loading &&
          status.models.length > 0 &&
          !assistant.selectedModel && (
            <p className="wr-codex-feedback" role="status">
              The saved model is unavailable. Choose an available Terra or Sol model below.
            </p>
          )}
        <div
          className="wr-codex-context"
          title="This is the document Codex may change. The project context is read-only."
        >
          <Icon name="file-code" />
          <span>{page?.name ?? 'Open a page to begin'}</span>
          {selectionCount > 0 && <small>{selectionCount} selected</small>}
          <span className="wr-codex-context-badge">Native components</span>
        </div>
        <div className="wr-codex-composer">
          <textarea
            ref={composer}
            aria-label="Message Codex"
            aria-describedby={hintId}
            placeholder={
              page ? 'Describe what you want to build…' : 'Open a page, then describe your idea…'
            }
            value={draft}
            maxLength={24_000}
            rows={3}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={keyDown}
          />
          <div className="wr-codex-composer-toolbar">
            <label className="wr-codex-model-select">
              <span className="wr-sr-only">Codex model</span>
              <select
                aria-label="Codex model"
                title={assistant.selectedModel?.name ?? 'Codex model'}
                value={assistant.selectedModel ? assistant.model : ''}
                disabled={
                  assistant.busy ||
                  assistant.loading ||
                  assistant.connecting ||
                  !status?.models.length
                }
                onChange={(event) => void assistant.preferences({ model: event.target.value })}
              >
                {!assistant.selectedModel && (
                  <option value="">
                    {assistant.loading
                      ? 'Loading models…'
                      : status?.models.length
                        ? 'Choose a model'
                        : connected
                          ? 'No models available'
                          : 'Connect to choose a model'}
                  </option>
                )}
                {status?.models.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.name}
                  </option>
                ))}
              </select>
            </label>
            <label
              className="wr-codex-effort-select"
              title={assistant.selectedEffort?.description ?? 'Reasoning effort'}
            >
              <span className="wr-sr-only">Reasoning effort</span>
              <Icon name="brain" />
              <select
                aria-label="Reasoning effort"
                value={assistant.selectedEffort ? assistant.effort : ''}
                disabled={
                  assistant.busy ||
                  assistant.loading ||
                  assistant.connecting ||
                  !assistant.selectedModel
                }
                onChange={(event) => void assistant.preferences({ effort: event.target.value })}
              >
                {!assistant.selectedEffort && <option value="">Choose reasoning</option>}
                {assistant.selectedModel?.efforts.map((effort) => (
                  <option key={effort.id} value={effort.id}>
                    {effortLabels[effort.id] ?? effort.id}
                  </option>
                ))}
              </select>
            </label>
            {assistant.busy ? (
              <button
                type="button"
                className="wr-codex-send is-stop"
                aria-label="Stop Codex"
                title={assistant.stopping ? 'Stopping…' : 'Stop'}
                disabled={assistant.stopping}
                onClick={() => void assistant.cancel()}
              >
                <Icon name="square" />
              </button>
            ) : (
              <button
                type="button"
                className="wr-codex-send"
                aria-label="Send to Codex"
                title="Send (Enter)"
                disabled={!assistant.canSend || !draft.trim()}
                onClick={send}
              >
                <Icon name="arrow-up" />
              </button>
            )}
          </div>
        </div>
        <p id={hintId} className="wr-codex-composer-hint">
          {!editingEnabled && page
            ? 'Return to the page to edit with Codex.'
            : 'Review every change before applying.'}
          <span>Shift + Enter for a new line</span>
        </p>
        <CodexUsage
          usage={assistant.usage}
          error={assistant.usageError}
          model={assistant.model}
          connected={connected}
        />
      </footer>
    </section>
  );
}
