import type { BrowserWindow, WebFrameMain } from 'electron';
interface FrameTarget {
  readonly targetId: string;
  readonly url: string;
}
interface ProtocolNode {
  readonly nodeId: number;
  readonly nodeType: number;
  readonly nodeValue: string;
  readonly frameId?: string;
  readonly contentDocument?: ProtocolNode;
  readonly children?: readonly ProtocolNode[];
}
export interface HtmlSmokeDocument {
  readonly heading: string;
  readonly text: string;
  readonly color: string;
  readonly backgroundColor: string;
  readonly padding: readonly string[];
  readonly width: number;
  readonly height: number;
}
/** Read the owned opaque document through DOM/CSS, without executing sandboxed scripts. */
export async function inspectHtmlSmokeDocument(
  window: BrowserWindow,
  parent: WebFrameMain,
  onPending: (detail: unknown) => void,
): Promise<HtmlSmokeDocument | undefined> {
  const debuggerClient = window.webContents.debugger;
  const ownedDebugger = !debuggerClient.isAttached();
  const sessions: string[] = [];
  if (ownedDebugger) debuggerClient.attach('1.3');
  try {
    const targets = async (): Promise<readonly FrameTarget[]> => {
      const result = (await debuggerClient.sendCommand('Target.getTargets', {
        filter: [{ type: 'iframe' }, { exclude: true }],
      })) as {
        readonly targetInfos: readonly FrameTarget[];
      };
      return result.targetInfos;
    };
    const attach = async (targetId: string): Promise<string> => {
      const result = (await debuggerClient.sendCommand('Target.attachToTarget', {
        targetId,
        flatten: true,
      })) as {
        readonly sessionId: string;
      };
      sessions.push(result.sessionId);
      return result.sessionId;
    };
    let session: string | undefined;
    if (parent.processId !== window.webContents.mainFrame.processId) {
      const target = (await targets()).find((item) => item.url === parent.url);
      if (!target) throw new Error('HTML smoke has no owned Preview debugger target.');
      session = await attach(target.targetId);
    }
    const query = async (nodeId: number, selector: string): Promise<number> => {
      const result = (await debuggerClient.sendCommand(
        'DOM.querySelector',
        { nodeId, selector },
        session,
      )) as {
        readonly nodeId: number;
      };
      return result.nodeId;
    };
    const root = (await debuggerClient.sendCommand('DOM.getDocument', { depth: 0 }, session)) as {
      readonly root: ProtocolNode;
    };
    const ownerId = await query(root.root.nodeId, 'iframe[srcdoc*="html-smoke"]');
    if (ownerId === 0) {
      onPending({ reason: 'missing-owner', parentUrl: parent.url });
      return undefined;
    }
    const described = (await debuggerClient.sendCommand(
      'DOM.describeNode',
      { nodeId: ownerId, depth: 1, pierce: true },
      session,
    )) as {
      readonly node: ProtocolNode;
    };
    const owner = described.node;
    let documentId = owner.contentDocument?.nodeId;
    if (documentId === undefined || documentId === 0) {
      const target = (await targets()).find((item) => item.targetId === owner.frameId);
      if (!target) {
        onPending({ reason: 'missing-child-document', owner });
        return undefined;
      }
      session = await attach(target.targetId);
      const document = (await debuggerClient.sendCommand(
        'DOM.getDocument',
        { depth: 0 },
        session,
      )) as {
        readonly root: ProtocolNode;
      };
      documentId = document.root.nodeId;
    }
    const ids = await Promise.all(
      ['#html-smoke', '#html-smoke strong', '#html-smoke pre', 'body'].map((selector) =>
        query(documentId, selector),
      ),
    );
    const articleId = ids[0]!;
    const headingId = ids[1]!;
    const textId = ids[2]!;
    const bodyId = ids[3]!;
    if (ids.some((id) => id === 0)) {
      const document = await debuggerClient.sendCommand(
        'DOM.getOuterHTML',
        { nodeId: documentId },
        session,
      );
      onPending({ reason: 'missing-content', ids, document });
      return undefined;
    }
    const text = async (nodeId: number): Promise<string> => {
      const result = (await debuggerClient.sendCommand(
        'DOM.describeNode',
        { nodeId, depth: -1 },
        session,
      )) as {
        readonly node: ProtocolNode;
      };
      const content = (node: ProtocolNode): string =>
        node.nodeType === 3 || node.nodeType === 4
          ? node.nodeValue
          : (node.children ?? []).map(content).join('');
      return content(result.node);
    };
    await debuggerClient.sendCommand('CSS.enable', {}, session);
    const computed = async (nodeId: number): Promise<ReadonlyMap<string, string>> => {
      const result = (await debuggerClient.sendCommand(
        'CSS.getComputedStyleForNode',
        { nodeId },
        session,
      )) as {
        readonly computedStyle: readonly {
          readonly name: string;
          readonly value: string;
        }[];
      };
      return new Map(result.computedStyle.map((item) => [item.name, item.value]));
    };
    const [heading, sampleText, bodyStyle, articleStyle, box] = await Promise.all([
      text(headingId),
      text(textId),
      computed(bodyId),
      computed(articleId),
      debuggerClient.sendCommand('DOM.getBoxModel', { nodeId: articleId }, session) as Promise<{
        readonly model: {
          readonly width: number;
          readonly height: number;
        };
      }>,
    ]);
    const result: HtmlSmokeDocument = {
      heading,
      text: sampleText,
      color: bodyStyle.get('color') ?? '',
      backgroundColor: bodyStyle.get('background-color') ?? '',
      padding: ['top', 'right', 'bottom', 'left'].map(
        (side) => articleStyle.get('padding-' + side) ?? '',
      ),
      width: box.model.width,
      height: box.model.height,
    };
    onPending({ reason: 'inspected', result });
    return result;
  } finally {
    for (const sessionId of sessions.reverse()) {
      if (debuggerClient.isAttached())
        await debuggerClient.sendCommand('Target.detachFromTarget', { sessionId });
    }
    if (ownedDebugger && debuggerClient.isAttached()) debuggerClient.detach();
  }
}
