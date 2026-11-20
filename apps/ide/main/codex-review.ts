import type { CodexProposal, CodexReviewRequest } from '../shared/codex-contracts';
import { codexDocument, prepareCodexEdits } from '../shared/codex-project-edits';
import { checkProjectTypes } from './compiler-service';

/** Pure preparation followed by an isolated type review; never executes app code. */
export async function reviewCodexProposal(
  request: CodexReviewRequest,
  signal: AbortSignal,
): Promise<CodexProposal> {
  signal.throwIfAborted();
  const base = {
    requestId: request.requestId,
    projectId: request.project.id,
    documentId: request.documentId,
    baseRevision: request.revision,
  };
  try {
    const { candidate, ...proposal } = prepareCodexEdits(
      request.project,
      request.documentId,
      request.userSources,
      request.plan,
    );
    const bindings = new Map<string, { componentId: string; eventName: string; method: string }>();
    for (const operation of request.plan.operations) {
      if (operation.kind !== 'event') continue;
      const node = proposal.page.components.find((item) =>
        operation.component === '$root'
          ? item.id === proposal.page.rootComponentId
          : item.name === operation.component || item.id === operation.component,
      );
      // Only surviving final bindings need a handler signature check. A later
      // operation can replace a binding or remove its component entirely.
      if (!node || node.events[operation.event] !== operation.method) continue;
      bindings.set(JSON.stringify([node.id, operation.event]), {
        componentId: node.id,
        eventName: operation.event,
        method: operation.method,
      });
    }
    const editedMethods = new Set(request.plan.methods.map((method) => method.name));
    for (const node of proposal.page.components) {
      for (const [eventName, method] of Object.entries(node.events)) {
        if (!method || !editedMethods.has(method)) continue;
        bindings.set(JSON.stringify([node.id, eventName]), {
          componentId: node.id,
          eventName,
          method,
        });
      }
    }
    const result =
      proposal.changes.length === 0
        ? null
        : await checkProjectTypes(
            candidate,
            {
              userSources: { ...request.userSources, [proposal.sourcePath]: proposal.sourceAfter },
              packageRoot: request.rootPath,
              assistantMethods: {
                [proposal.sourcePath]: request.plan.methods.map((method) => method.name),
              },
              assistantEvents: {
                [proposal.sourcePath]: [...bindings.values()],
              },
            },
            signal,
          );
    signal.throwIfAborted();
    return {
      ...proposal,
      ...base,
      diagnostics:
        result?.diagnostics
          .filter((item) => item.category === 'error')
          .map((item) => ({
            message: item.message,
            ...(item.line === undefined ? {} : { line: item.line }),
            ...(item.file === undefined ? {} : { file: item.file }),
          })) ?? [],
    };
  } catch (error) {
    signal.throwIfAborted();
    const document = codexDocument(request.project, request.documentId);
    const source = request.userSources[document.sourcePath] ?? '';
    // Keep invalid plans reviewable and available as feedback for the next turn.
    // No part of this fallback can be applied while a diagnostic is present.
    return {
      ...base,
      documentKind: document.kind,
      summary: request.plan.summary,
      plan: request.plan,
      page: document.page,
      styles: [],
      sourcePath: document.sourcePath,
      sourceBefore: source,
      sourceAfter: source,
      changes: [
        ...request.plan.operations.map((operation) =>
          operation.kind === 'add'
            ? `Add ${operation.componentType} “${operation.name}”`
            : `${operation.kind}: ${operation.component}`,
        ),
        ...request.plan.styles.map((style) => `Create style “${style.name}”`),
        ...request.plan.methods.map((method) => `Write typed method ${method.name}`),
      ],
      diagnostics: [
        {
          message:
            error instanceof Error
              ? error.message
              : 'The proposal could not be prepared. Ask Codex to revise it.',
        },
      ],
    };
  }
}
