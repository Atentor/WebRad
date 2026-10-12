import type { RestGoUploadProgress } from './types';

export type RestGoVideoStatus =
  'uploading' | 'pending' | 'processing' | 'ready' | 'failed' | 'deleting';
export type RestGoVideoUploadState = 'open' | 'completed' | 'cancelled';
export type RestGoVideoJobState = 'pending' | 'processing' | 'ready' | 'failed' | 'cancelled';

export interface RestGoVideoUploadSession {
  id: string;
  videoId: string;
  offset: number;
  sizeBytes: number;
  state: RestGoVideoUploadState;
  expiresAt: string;
  maxChunkBytes: number;
}
export interface RestGoVideoSource {
  width: number;
  height: number;
  codedWidth: number;
  codedHeight: number;
  rotation: number;
  fps: number;
  frameRate: string;
  duration: number;
  format: string;
  codec: string;
  hasAudio: boolean;
  audioCodec?: string;
  videoStream: number;
  audioStream: number;
  level: number;
}
export interface RestGoVideoVariant {
  quality: number;
  width: number;
  height: number;
  fps: number;
  frameRate: string;
  bandwidth: number;
  averageBandwidth: number;
  codecs: string;
}
export interface RestGoVideo {
  id: string;
  ownerId?: string;
  title: string;
  descri: string;
  isPublic: boolean;
  sizeBytes: number;
  source: RestGoVideoSource;
  originalRetained: boolean;
  status: RestGoVideoStatus;
  progress: number | null;
  error: string;
  generation?: string;
  variants: RestGoVideoVariant[];
  hasThumbnail: boolean;
  createdAt: string;
  updatedAt: string;
}
export interface RestGoVideoJob {
  id: string;
  state: RestGoVideoJobState;
  error: string;
  attempts: number;
  options: Readonly<Record<string, unknown>>;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}
export interface RestGoVideoDetails {
  video: RestGoVideo;
  jobs: RestGoVideoJob[];
}
export interface RestGoVideoList {
  data: RestGoVideo[];
  total: number;
  limit: number;
  offset: number;
}
export interface RestGoVideoHlsDescriptor {
  id: string;
  title: string;
  isPublic: boolean;
  masterUrl: string;
  thumbnailUrl: string;
  variants: RestGoVideoVariant[];
  duration: number;
  authentication: string;
  masterAbsoluteUrl: string;
  thumbnailAbsoluteUrl: string;
}
export interface RestGoVideoRequestOptions {
  signal?: AbortSignal;
}
export interface RestGoVideoCreateInput {
  filename: string;
  sizeBytes: number;
  title?: string;
  descri?: string;
  isPublic?: boolean;
}
export interface RestGoVideoUpdate {
  title: string;
  descri: string;
  isPublic: boolean;
}
export interface RestGoVideoListOptions extends RestGoVideoRequestOptions {
  limit?: number;
  offset?: number;
  q?: string;
  status?: RestGoVideoStatus;
}
export interface RestGoVideoChunkOptions extends RestGoVideoRequestOptions {
  offset: number;
  checksum: string;
  onUploadProgress?: (progress: RestGoUploadProgress) => void;
}
export interface RestGoVideoProgress {
  readonly confirmedBytes: number;
  readonly totalBytes: number;
  readonly percentage: number;
  /** Transient network measurement, separate from confirmedBytes. */
  readonly chunk: RestGoUploadProgress | null;
}
/** Serializable runtime checkpoint. No credential or File is included. */
export interface RestGoVideoResumeToken {
  readonly version: 1;
  readonly baseUrl: string;
  readonly ownerId: string;
  readonly uploadId: string;
  readonly videoId: string;
  readonly name: string;
  readonly sizeBytes: number;
  readonly lastModified: number;
  /** SHA-256 chain over consecutive 8 MiB parts of the complete file. */
  readonly fingerprint: string;
}
export interface RestGoVideoUploadOptions extends RestGoVideoRequestOptions {
  title?: string;
  descri?: string;
  isPublic?: boolean;
  chunkSizeBytes?: number;
  maxRetries?: number;
  onSession?: (session: RestGoVideoUploadSession) => void;
  onResumeToken?: (token: RestGoVideoResumeToken) => void;
  onProgress?: (progress: RestGoVideoProgress) => void;
  onPhase?: (phase: 'hashing' | 'creating' | 'uploading' | 'finalizing') => void;
}
export interface RestGoVideoResumeOptions extends RestGoVideoUploadOptions {
  resumeToken: RestGoVideoResumeToken;
}
export interface RestGoVideoWaitOptions extends RestGoVideoRequestOptions {
  intervalMs?: number;
  timeoutMs?: number;
  onProgress?: (details: RestGoVideoDetails) => void;
}
