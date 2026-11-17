import type { PageModel, ComponentStyleModel, WebRadProject } from '@webrad/project-model';
import type { CodexConversationEntry, CodexPlan } from './codex-schema';

export type { CodexPlan, CodexOperation } from './codex-schema';

export interface CodexPreferences {
  readonly executablePath: string | null;
  readonly model: string;
  readonly effort: string;
}

export interface CodexModel {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly defaultEffort: string;
  readonly efforts: readonly { readonly id: string; readonly description: string }[];
}

export interface CodexStatus {
  readonly available: boolean;
  readonly executablePath: string | null;
  readonly account: { readonly label: string; readonly plan: string | null } | null;
  readonly models: readonly CodexModel[];
  readonly preferences: CodexPreferences;
  readonly loginPending?: boolean;
  readonly message?: string;
}

export interface CodexGenerateRequest {
  readonly requestId: string;
  readonly rootPath: string;
  readonly project: WebRadProject;
  readonly userSources: Readonly<Record<string, string>>;
  readonly revision: number;
  readonly documentId: string;
  readonly selection: readonly string[];
  readonly prompt: string;
  readonly conversation: readonly CodexConversationEntry[];
  readonly model: string;
  readonly effort: string;
}

export interface CodexProposal {
  readonly requestId: string;
  readonly projectId: string;
  readonly documentId: string;
  readonly documentKind: 'page' | 'reusable' | 'menu';
  readonly baseRevision: number;
  readonly summary: string;
  readonly changes: readonly string[];
  readonly plan: CodexPlan;
  readonly page: PageModel;
  readonly styles: readonly ComponentStyleModel[];
  readonly sourcePath: string;
  readonly sourceBefore: string;
  readonly sourceAfter: string;
  readonly diagnostics: readonly { readonly message: string; readonly line?: number; readonly file?: string }[];
  readonly contextSummary?: CodexContextSummary;
}

export interface CodexContextSummary {
  readonly documents: number;
  readonly sources: number;
  readonly fullSources: number;
  readonly summarizedSources: number;
  readonly omittedSources: number;
  readonly summarizedDocuments: number;
  readonly omittedDocuments: number;
  readonly assets: number;
  readonly characters: number;
  readonly limited: boolean;
}

export interface CodexReviewRequest extends Pick<
  CodexGenerateRequest,
  'requestId' | 'rootPath' | 'project' | 'userSources' | 'revision' | 'documentId'
> {
  readonly plan: CodexPlan;
}

export interface CodexProgress {
  readonly requestId: string;
  readonly phase: 'connecting' | 'designing' | 'checking';
  readonly message: string;
}

export interface CodexUsageWindow {
  readonly usedPercent: number;
  readonly resetsAt: number | null;
}
export interface CodexUsage {
  readonly updatedAt: number;
  readonly buckets: readonly {
    readonly id: string;
    readonly name: string;
    readonly model: string | null;
    readonly fiveHour: CodexUsageWindow | null;
    readonly weekly: CodexUsageWindow | null;
  }[];
}

export interface CodexBridge {
  usage(): Promise<CodexUsage>;
  onUsageChanged(listener: () => void): () => void;
  status(): Promise<CodexStatus>;
  chooseExecutable(): Promise<CodexStatus>;
  preferences(preferences: CodexPreferences): Promise<CodexStatus>;
  login(): Promise<void>;
  cancelLogin(): Promise<void>;
  generate(request: CodexGenerateRequest): Promise<CodexProposal>;
  review(request: CodexReviewRequest): Promise<CodexProposal>;
  cancel(requestId: string): Promise<void>;
  subscribe(listener: (progress: CodexProgress) => void): () => void;
  onAccountChanged(listener: () => void): () => void;
}
