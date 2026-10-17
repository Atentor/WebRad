import type { WebFileUploadSelection } from './file-upload.js';

export interface WebVideoUploadSelection extends WebFileUploadSelection {
  /** Seconds, or null when the browser cannot decode this container/codec. */
  readonly duration: number | null;
}

export function validateVideoFile(file: File, maxFileSizeMB: number | null): void {
  if (!/\.(mp4|mov|mkv|webm)$/i.test(file.name))
    throw new Error('Select an MP4, MOV, MKV or WebM video.');
  if (file.size <= 0) throw new Error('The video file is empty.');
  if (maxFileSizeMB !== null && file.size > maxFileSizeMB * 1024 * 1024)
    throw new RangeError(`The video file exceeds the ${maxFileSizeMB} MB limit.`);
}

/** Uses native media metadata; never reads the entire file or starts playback. */
export function inspectVideo(file: File, signal: AbortSignal): Promise<WebVideoUploadSelection> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('Video selection was aborted.', 'AbortError'));
      return;
    }
    const dot = file.name.lastIndexOf('.');
    const metadata = (duration: number | null): WebVideoUploadSelection =>
      Object.freeze({
        name: file.name,
        path: file.webkitRelativePath || null,
        size: file.size,
        extension: file.name.slice(dot).toLowerCase(),
        duration,
      });
    if (typeof URL.createObjectURL !== 'function') {
      resolve(metadata(null));
      return;
    }
    const video = document.createElement('video');
    const url = URL.createObjectURL(file);
    const finish = (duration: number | null, aborted = false): void => {
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
      video.removeEventListener('loadedmetadata', loaded);
      video.removeEventListener('error', failed);
      video.removeAttribute('src');
      video.load();
      URL.revokeObjectURL(url);
      if (aborted) reject(new DOMException('Video selection was aborted.', 'AbortError'));
      else resolve(metadata(duration));
    };
    const loaded = (): void =>
      finish(Number.isFinite(video.duration) && video.duration > 0 ? video.duration : null);
    const failed = (): void => finish(null);
    const abort = (): void => finish(null, true);
    const timer = setTimeout(failed, 10_000);
    video.preload = 'metadata';
    video.addEventListener('loadedmetadata', loaded, { once: true });
    video.addEventListener('error', failed, { once: true });
    signal.addEventListener('abort', abort, { once: true });
    video.src = url;
  });
}

export function validateVideoDuration(
  selection: WebVideoUploadSelection,
  maxDurationSeconds: number | null,
): void {
  if (maxDurationSeconds === null) return;
  if (selection.duration === null)
    throw new Error(
      'The browser could not read the video duration. Select a supported codec to enforce the duration limit.',
    );
  if (selection.duration > maxDurationSeconds)
    throw new RangeError(`The video exceeds the ${maxDurationSeconds} second duration limit.`);
}
