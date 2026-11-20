# Codex integration

Open **Codex assistant** in the activity bar to describe changes to the active
page, reusable component or menu. Codex proposes native WebRAD components,
responsive layout, structured visual styles and typed event methods. Inspect
the proposal before applying it to the project.

The assistant's instructions identify [the official WebRAD documentation](https://webrad.atentor.com/docs)
as the reference for documentation and examples. This supplies the reference URL;
it does not fetch the website or add its contents to the request. Registered
components and generated public API declarations remain the implementation contract.

## Connect

1. Install [Codex CLI](https://developers.openai.com/codex/cli) or the Codex IDE
   extension. WebRAD discovers the native executable on PATH and in standard
   extension locations. Use **Connection settings > Codex installation > Select
   executable** if discovery cannot find it. Windows requires `codex.exe`, not
   an npm `.cmd`, PowerShell script or command shell.
2. Select **Sign in with ChatGPT** and complete the browser flow. WebRAD uses
   a separate Codex profile; it does not read authentication tokens from another
   editor or ask you to paste credentials into the project.
3. Choose **GPT-6.1 Terra** or **GPT-6.1 Sol** and **Reasoning effort** in the composer.
   Choices come from Codex `model/list`; unavailable models or effort levels are
   not silently replaced. The catalog describes client capabilities; successful
   inference is required to establish account access to a selected model.
4. Open a visual document and enter a request. **Enter** sends it;
   **Shift+Enter** inserts a newline. **Stop** cancels generation or review.

Example requests:

- “Create a registration form with name and email fields, a save button and
  typed validation. Use a column layout with consistent spacing.”
- “Improve this page's spacing and alignment while preserving its behavior.”
- “Bind the selected button to a typed handler that copies NameEdit.value
  into SummaryLabel.text.”

## Review and apply

While a request is running, the activity indicator shows elapsed time and
provider activity without a stage checklist. Proposal text is
counted as it arrives; partial JSON and internal reasoning text are not shown.
After 30 seconds without a new event, a note explains the quiet period. The timer
does not prove server activity or estimate completion. **Stop** remains available.

The footer shows **5 hours** and **Weekly** usage percentages and reset times
reported by Codex. Only matching window durations are labeled this way; missing
windows remain unavailable. Usage refreshes every minute while the panel is open
and after quota notifications and requests. Errors identify stale snapshots.
These meters describe reported usage, not a guarantee that another request will
be accepted; account entitlement remains controlled by Codex.

Use **Conversation history** in the header to list and reopen previous chats for
the current project. **New conversation** preserves the current chat and starts
an independent conversation context. Each chat retains its draft; the history
shows its first request as the title, message count and last update. Chats can
be deleted from this list without changing the project or undoing applied edits.
Switching and deletion are unavailable during generation or review. History is
kept for the current IDE session, including reopening a project, and is cleared
when the application exits. It is not disk-persisted history.

The review lists each component, layout, style and code change. Expand
**TypeScript** to inspect current and proposed authored source. Model and Registry
validation and strict TypeScript diagnostics must succeed before **Apply changes**
is enabled. Existing project errors can also prevent a proposal from being
applied; the errors are shown in the review.

An invalid proposal stays visible with its diagnostics. Use **Recheck** to run
the local model/TypeScript review again without sending another inference
request. This can recover an interrupted or timed-out review; deterministic
errors require a revised proposal or a project correction. Review is cancellable
and stops after two minutes if the compiler does not respond.

Continue the conversation to clarify business rules or ask Codex to revise a
proposal. Recent proposal details and diagnostics accompany follow-up requests.
If the project changes during generation, prepare a new proposal against its
current revision. A stale proposal cannot overwrite later work.

Applying changes creates one **Apply Codex proposal** entry in the document's
Designer history. **Undo** and **Redo** cover its component, code and style deltas.
Undo refuses to overwrite a later source edit or delete a newly shared/edited
style. Save the project normally to persist the result. Use **F9** separately to
execute Preview; a successful type review does not establish runtime correctness.

## Authoring boundaries

The integration edits an existing active visual document. Create or open pages
through the normal IDE workflow first. Other documents, settings, dependencies,
assets and generated source files are not edited by the assistant.

Component types, properties, events and layout fields come from the central
Registry. New styles use the existing structured style catalog. Method edits use
the TypeScript AST and preserve surrounding authored code. Both `Name.member`
and `this.Name.member` retain their existing instance-scoped semantics. Inline
type-only imports can reference public runtime types, the active generated
document types, and declared project Models/Units. They do not load scripts or
alter the authored file's executable imports.

The assistant cannot insert `WebHtml`, author a substitute HTML/React interface,
install packages, create component classes or directly manipulate DOM objects.
New methods reject `any`, inferred-any values, type assertions, non-null
assertions, diagnostic suppressions, external script imports and nonnumeric
computed property access. Existing authored code and embedded HTML are retained;
these checks govern the new assistant edits, not all behavior of existing code
or third-party services. Unsupported requirements should be reported rather
than presented as working functionality.

## Local state and context

Preferences are stored in `<WebRAD user data>/codex/preferences.json`. Codex owns
authentication in `<WebRAD user data>/codex/profile`; its working directory is an
empty sibling folder. No credentials are serialized into `.wrproj`, generated
applications, renderer state or diagnostic logs. Shells and environment access
are disabled for proposal threads, and unexpected tool/approval requests are
rejected by the host.

Requests use the current in-memory project snapshot, including unsaved edits.
Context includes the active document and its authored source, selection, the
inventory of all pages, reusables, menus and TypeScript sources, navigation and
instance types, native component metadata, runtime declarations, styles, themes,
package declarations, API configuration and asset metadata. Asset binary bodies
and environment-variable values are excluded. Other document models and source
files, including Models and Units, are read-only reference; changes still target
the active visual document only.

Context has a 1,200,000-character budget, with room reserved for the request and
instructions. The active document/source and core metadata must fit completely;
otherwise the request fails before inference. Supplemental sources prioritize
the active import graph. Larger sources can fall back to AST-generated outlines
without implementations; larger documents can fall back to component structure.
The complete inventory remains visible to the model, and the review reports
full, summarized and omitted source/document coverage. A summary or inventory
entry does not establish the behavior of omitted code. Large runtime type
aliases can be omitted and are identified in the context.

Common password, token, authorization, credential and header configuration
fields are masked. AST-based source snapshots mask recognizable credential
literals and credentials in HTTP URL parameters; this does not detect every
possible secret in arbitrary code or chat. Do not include credentials in chat
or source. Omission markers cannot be written back through a proposal.

Conversation and unfinished drafts stay in bounded IDE memory scoped by project
folder and project ID. Failed or cancelled sends restore the prompt when its
draft is still empty. Late responses cannot populate another project's
conversation. Project edits use normal filesystem persistence. Preferences are
written atomically, and unavailable saved model choices remain explicit until
you select an available model and reasoning level.

This implementation uses the documented
[Codex app-server protocol](https://developers.openai.com/codex/app-server).
Local source review is separate from verification of sign-in, inference,
appearance and native packaging.
