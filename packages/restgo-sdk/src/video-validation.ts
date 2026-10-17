import { isRecord } from './errors';
import type {
  RestGoVideo,
  RestGoVideoDetails,
  RestGoVideoUploadSession,
  RestGoVideoVariant,
} from './video-types';

export function videoId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]+$/.test(value);
}
export function videoInteger(value: unknown, minimum = 0): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum;
}
export function videoNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}
function strings(value: Record<string, unknown>, keys: string[]): boolean {
  return keys.every((key) => typeof value[key] === 'string');
}
export function videoSession(value: unknown): value is RestGoVideoUploadSession {
  return (
    isRecord(value) &&
    videoId(value.id) &&
    videoId(value.videoId) &&
    videoInteger(value.sizeBytes, 1) &&
    videoInteger(value.offset) &&
    value.offset <= value.sizeBytes &&
    videoInteger(value.maxChunkBytes, 1) &&
    typeof value.expiresAt === 'string' &&
    Number.isFinite(Date.parse(value.expiresAt)) &&
    ['open', 'completed', 'cancelled'].includes(String(value.state))
  );
}
export function videoVariants(value: unknown): value is RestGoVideoVariant[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item: unknown) =>
        isRecord(item) &&
        ['quality', 'width', 'height', 'bandwidth', 'averageBandwidth'].every((key) =>
          videoInteger(item[key]),
        ) &&
        videoNumber(item.fps) &&
        strings(item, ['frameRate', 'codecs']),
    )
  );
}
export function videoRecord(value: unknown): value is RestGoVideo {
  if (!isRecord(value) || !isRecord(value.source)) return false;
  const source = value.source;
  return (
    videoId(value.id) &&
    strings(value, ['title', 'descri', 'error', 'createdAt', 'updatedAt']) &&
    typeof value.isPublic === 'boolean' &&
    typeof value.originalRetained === 'boolean' &&
    typeof value.hasThumbnail === 'boolean' &&
    videoInteger(value.sizeBytes, 1) &&
    ['uploading', 'pending', 'processing', 'ready', 'failed', 'deleting'].includes(
      String(value.status),
    ) &&
    (value.progress === null || (videoNumber(value.progress) && value.progress <= 100)) &&
    (value.ownerId === undefined || videoId(value.ownerId)) &&
    (value.generation === undefined || videoId(value.generation)) &&
    videoVariants(value.variants) &&
    ['width', 'height', 'codedWidth', 'codedHeight', 'fps', 'duration'].every((key) =>
      videoNumber(source[key]),
    ) &&
    ['rotation', 'videoStream', 'audioStream', 'level'].every(
      (key) => typeof source[key] === 'number' && Number.isFinite(source[key]),
    ) &&
    strings(source, ['frameRate', 'format', 'codec']) &&
    typeof source.hasAudio === 'boolean' &&
    (source.audioCodec === undefined || typeof source.audioCodec === 'string')
  );
}
export function videoDetails(value: unknown): value is RestGoVideoDetails {
  return (
    isRecord(value) &&
    videoRecord(value.video) &&
    Array.isArray(value.jobs) &&
    value.jobs.every(
      (job: unknown) =>
        isRecord(job) &&
        videoId(job.id) &&
        ['pending', 'processing', 'ready', 'failed', 'cancelled'].includes(String(job.state)) &&
        typeof job.error === 'string' &&
        videoInteger(job.attempts) &&
        isRecord(job.options) &&
        typeof job.createdAt === 'string' &&
        (job.startedAt === null || typeof job.startedAt === 'string') &&
        (job.finishedAt === null || typeof job.finishedAt === 'string'),
    )
  );
}
