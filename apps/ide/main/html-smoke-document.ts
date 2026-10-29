import type { BrowserWindow, WebFrameMain } from 'electron';

interface FrameTarget {
  readonly targetId: string;
  readonly url: string;
}

interface FrameTree {
  readonly frame: { readonly id: string; readonly url: string };
  readonly childFrames?: readonly FrameTree[];
}

/** Inspect only the smoke's owned markup without granting scripts to its sandbox. */
export async function inspectHtmlSmokeDocument(
  window: BrowserWindow,
  parent: WebFrameMain,
  expression: string,
  onPending?: (detail: unknown) => void,
): Promise<unknown> {
  const debuggerClient = window.webContents.debugger;
  const ownedDebugger = !debuggerClient.isAttached();
  const sessions: string[] = [];
  if (ownedDebugger) debuggerClient.attach('1.3');
  try {
    const targets = (await debuggerClient.sendCommand('Target.getTargets', {
      filter: [{ type: 'iframe' }, { exclude: true }],
    })) as { readonly targetInfos: readonly FrameTarget[] };
    const attach = async (targetId: string): Promise<string> => {
      const result = (await debuggerClient.sendCommand('Target.attachToTarget', {
        targetId,
        flatten: true,
      })) as { readonly sessionId: string };
      sessions.push(result.sessionId);
      return result.sessionId;
    };
    let parentSession: string | undefined;
    if (parent.processId !== window.webContents.mainFrame.processId) {
      const target = targets.targetInfos.find((item) => item.url === parent.url);
      if (!target) throw new Error('HTML smoke has no owned Preview debugger target.');
      parentSession = await attach(target.targetId);
    }
    const document = (await debuggerClient.sendCommand(
      'DOM.getDocument',
      { depth: 0 },
      parentSession,
    )) as { readonly root: { readonly nodeId: number } };
    const owner = (await debuggerClient.sendCommand(
      'DOM.querySelector',
      { nodeId: document.root.nodeId, selector: 'iframe[srcdoc*="html-smoke"]' },
      parentSession,
    )) as { readonly nodeId: number };
    if (owner.nodeId === 0) {
      onPending?.({ reason: 'missing-owner', parentUrl: parent.url });
      return undefined;
    }
    const described = (await debuggerClient.sendCommand(
      'DOM.describeNode',
      { nodeId: owner.nodeId },
      parentSession,
    )) as { readonly node: { readonly frameId?: string } };
    const frameId = described.node.frameId;
    if (!frameId) {
      onPending?.({ reason: 'missing-frame-id', node: described.node });
      return undefined;
    }
    // The target ID comes from the owned iframe DOM node, never a global URL match.
    const currentTargets = (await debuggerClient.sendCommand('Target.getTargets', {
      filter: [{ type: 'iframe' }, { exclude: true }],
    })) as { readonly targetInfos: readonly FrameTarget[] };
    const separateTarget = currentTargets.targetInfos.some((item) => item.targetId === frameId);
    // A DOM owner can precede its out-of-process target during srcdoc navigation.
    // Let the existing document-readiness budget wait for that target to mount.
    const parentTree = (await debuggerClient.sendCommand(
      'Page.getFrameTree',
      {},
      parentSession,
    )) as { readonly frameTree: FrameTree };
    const containsFrame = (tree: FrameTree): boolean =>
      tree.frame.id === frameId || tree.childFrames?.some(containsFrame) === true;
    const sameProcessDocument = containsFrame(parentTree.frameTree);
    if (!separateTarget && !sameProcessDocument) {
      onPending?.({
        reason: 'missing-frame-target',
        frameId,
        targets: currentTargets.targetInfos,
        tree: parentTree.frameTree,
      });
      return undefined;
    }
    const frameSession = separateTarget ? await attach(frameId) : parentSession;
    const context = (await debuggerClient.sendCommand(
      'Page.createIsolatedWorld',
      { frameId, worldName: 'webrad-html-smoke' },
      frameSession,
    )) as { readonly executionContextId: number };
    const evaluated = (await debuggerClient.sendCommand(
      'Runtime.evaluate',
      { expression, contextId: context.executionContextId, returnByValue: true },
      frameSession,
    )) as {
      readonly result: { readonly value?: unknown };
      readonly exceptionDetails?: unknown;
    };
    if (evaluated.exceptionDetails !== undefined) {
      throw new Error(
        'HTML smoke inspection failed: ' + JSON.stringify(evaluated.exceptionDetails),
      );
    }
    onPending?.({ reason: 'evaluated', frameId, result: evaluated.result.value });
    return evaluated.result.value;
  } finally {
    for (const sessionId of sessions.reverse()) {
      if (debuggerClient.isAttached()) {
        await debuggerClient.sendCommand('Target.detachFromTarget', { sessionId });
      }
    }
    if (ownedDebugger && debuggerClient.isAttached()) debuggerClient.detach();
  }
}
