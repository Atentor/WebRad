# Video Upload

`WebVideoUpload` is a nonvisual component in the **Nonvisual** palette and Designer
tray. Each page/reusable placement owns its instance. It uses RestGo's `/videos`
service with the shared Authentication session and refresh flow. Use File Upload
for ordinary Storage files. Configure RestGo and sign in before uploading;
selection alone does not log in, create an upload session, or send data.

```ts
const login = await RestGO.login('user@example.com', 'password');
if (!login.sucess) throw login.error;

VideoUpload1.maxFileSizeMB = 100;
VideoUpload1.maxDurationSeconds = 60;
const selection = await VideoUpload1.OpenFile();
if (!selection) return;

const video = await this.VideoUpload1.SendToRestGO({
  title: 'Lesson 1',
  descri: 'Introduction',
  isPublic: false,
});
// Upload completion confirms the original; server conversion may continue.
const ready = await VideoUpload1.WaitUntilReady({ timeoutMs: 600_000 });
```

Call `OpenFile()` from a user interaction. Cancellation returns `null` and
preserves the previous selection. Metadata includes `name`, `path`, `size` in
bytes, `extension`, and `duration` in seconds. `path` may be `null`; browsers do
not expose an absolute local path.

| Inspector property         | API                  | Effect                                                                        |
| -------------------------- | -------------------- | ----------------------------------------------------------------------------- |
| Accepted video types       | `accept`             | Defaults to `.mp4,.mov,.mkv,.webm`; validation also rejects other extensions. |
| Enabled                    | `enabled`            | Allows selection and starting/resuming; does not cancel existing work.        |
| Title / Description        | `title` / `descri`   | Defaults overridden by upload options.                                        |
| Public video               | `isPublic`           | Defaults to `false`; publishing also needs server support.                    |
| Chunk size (bytes)         | `chunkSizeBytes`     | Defaults to 8 MiB, capped by session `maxChunkBytes`.                         |
| Maximum file size (MB)     | `maxFileSizeMB`      | Optional positive limit; 1 MB = 1024² bytes; empty/`null` disables.           |
| Maximum duration (seconds) | `maxDurationSeconds` | Optional positive limit; empty/`null` disables.                               |

Limits are checked on selection and before upload, including code changes.
Duration comes from video `loadedmetadata` without playback. Unsupported codecs
or containers can yield `null`; selection then fails explicitly if a duration
limit is enabled. Object URLs are revoked after inspection/cancellation. These
local checks do not replace server size/quota/format limits or FFprobe.

`SendToRestGO()` and `Resume()` return `Promise<RestGoVideo>`. Concurrent upload
calls share the active promise. Binary chunks use `PUT /videos/uploads/{id}/chunks`,
`Upload-Offset`, and hexadecimal SHA-256. Confirmed offsets govern resume. Uncertain
creation responses are not retried automatically; transient chunk failures and
conflicts use bounded retries, offset reconciliation, and backoff. Finalization
is idempotent by session ID. Cookies and administrative credentials are omitted.

`Pause()` aborts local work; `Resume()` continues the existing session. Pausing
during hashing can resume preparation without a session. Pausing during creation
waits for the returned session ID to avoid duplicate creation. `CancelUpload()`
cancels the remote open session and schedules deletion. Remove completed videos
with `RestGO.videos.remove(videoId)`. `Clear()` and `dispose()` stop local I/O
without remote deletion. Use `Clear()` before selecting a different upload; use
`Resume()` when a checkpoint exists.

To resume after reload, save `resumeToken` in application storage, reselect the
original file, and call `Resume({ resumeToken })`. The checkpoint includes server,
owner, IDs, filename, size, date, and a streamed SHA-256 fingerprint of every byte;
it contains no authentication tokens or `File`. Resume rejects another server,
user, or content, including same-name/size/date replacements. Files/checkpoints
are not automatically persisted in the Project Model.

`state` distinguishes selection, hashing, upload, pause, finalization, and waiting.
`confirmedBytes`, `totalBytes`, and `percentage` describe acknowledged data.
`OnProgress.detail.chunk` contains transient request measurements, possibly
indeterminate. Web Crypto requires HTTPS or localhost. Hashing uses bounded
memory and rereads files before resume to verify identity.

| Event                  | Meaning                                                                |
| ---------------------- | ---------------------------------------------------------------------- |
| `OnChange`             | Validated selection or local clearing.                                 |
| `OnStateChange`        | Previous and current state.                                            |
| `OnProgress`           | Confirmed bytes/percentage and transient chunk measurement.            |
| `OnUploadComplete`     | Original accepted; HLS may not be ready.                               |
| `OnProcessingProgress` | Video and jobs during explicit waiting.                                |
| `OnReady`              | Ready state with a published generation and confirmed HLS descriptor.  |
| `OnError`              | Validation, network, or processing error; local pause is not an error. |
| `OnComplete`           | Upload, processing, or cancellation completion with video/error.       |

Handlers receive `sender: WebVideoUpload` and typed `CustomEvent` details. Bare
and `this` access provide Monaco completion, hover, signatures, and diagnostics.

`RestGO.videos` exposes sessions/chunks, upload/resume, library, complete metadata,
deletion, processing/reprocessing/cancellation, HLS descriptors, and thumbnails.
Responses are validated. Absolute descriptor URLs preserve the proxy prefix and
original paths. The component does not access administrative module settings.

`WaitUntilReady()` does not start processing. If automatic server processing is
disabled, call `RestGO.videos.process(video.id)`. Waiting supports cancellation,
timeout, and failure/cancel states. It follows current video availability; track
a returned `jobId` through `RestGO.videos.get()` to monitor a particular reprocessing
job. Playback belongs to the separate Video Player component.

Existing tests cover SDK contracts, limits, lifecycle, persistence, Registry,
Monaco, compiled Preview, and reusable isolation. Optional
`tests/video-upload.browser.test.ts` uses real WebM metadata, binary HTTP checksums,
pause, reconciliation, and resume in Chrome. Its server implements the protocol;
it does not establish FFmpeg conversion against a real RestGo instance.
