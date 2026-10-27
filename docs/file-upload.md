# File Upload

**File Upload** is a nonvisual component in the **Nonvisual** palette and Designer
tray. It uses the shared RestGo SDK client. Configure **RestGo integration →
Connection** and authenticate with `RestGO.login()` before uploading.

## Select a file

Call from a user interaction, with a component named `FileUpload1`:

```ts
const file = await FileUpload1.OpenFile();
if (!file) return; // Selection cancelled.

const name: string = file.name;
const path: string | null = file.path;
const size: number = file.size; // Bytes.
const extension: string = file.extension; // For example, '.pdf'.
```

`OpenFile()` opens the browser file picker without uploading. Cancellation returns
`null` and preserves an earlier selection. `this.FileUpload1` provides the same
typed API, including in reusable components.

`WebFileUploadSelection` contains `name`, `path`, `size`, and `extension`. `path`
is a browser-provided relative path or `null`, never a fabricated absolute local
path. This follows the [browser file picker contract](<https://html.spec.whatwg.org/multipage/input.html#file-upload-state-(type=file)>).
Extensions include the dot and use lowercase; extensionless files return `''`.
`accept`, for example `.pdf,image/*`, filters the picker.

## Upload to RestGo

After selecting, upload in the same handler or through another button:

```ts
try {
  const result = await FileUpload1.SendToRestGO({ isPublic: false });
  Message(`File ${result.id}: ${result.url}`);
} catch (error) {
  Message(error instanceof Error ? error.message : String(error));
}
```

`isPublic` overrides the Inspector's **Public file** setting, which defaults to
`false`. Options also accept Storage `name` and an abort `signal`. Concurrent calls
share the active upload.

`WebFileUploadResult` preserves all RestGo file metadata: `id`, `ownerId?`,
`ownerEmail?`, `originalName`, `contentType`, `sizeBytes`, `isPublic`, `createdAt`,
`updatedAt`, and `downloadUrl`. It adds `url`, an absolute download URL preserving
any reverse-proxy prefix, without changing `downloadUrl`.

A private URL does not grant access. Use `RestGO.storage.download(result.id)`
with the owner's authorized session. A dynamic API token does not replace the
JWT required by Storage.

## Progress in the Inspector and Monaco

Select the tray component, open **Interaction**, and double-click **OnProgress**.
The generated handler receives `sender: WebFileUpload` and
`event: CustomEvent<WebFileUploadProgressEventDetail>`, exposing `percentage`,
`loaded`, `total`, and `lengthComputable` in `event.detail`. With an existing
`Label1`, its body can update the caption:

```ts
const { percentage } = event.detail;
Label1.caption = percentage === null ? 'Uploading...' : `${Math.round(percentage)}%`;
```

Measurements come from the browser and include the entire multipart body.
`loaded` is bytes sent; `total` and `percentage` are `null` when the total is
unknown. Otherwise, percentage ranges from 0 to 100. The current value is also
available as `FileUpload1.progress`.

The SDK uses `XMLHttpRequest.upload` for cross-origin HTTP(S) progress without
administrative-session cookies. Same-origin requests, environments without XHR,
and custom `fetch` clients retain fetch transport and report indeterminate
progress. Intermediate percentages are never simulated. A successful server
response confirms 100%; measured 100% can arrive earlier, so use **OnSuccess** to
confirm server storage.

Configure the final RestGo URL without redirects. XHR can follow a redirect before
the SDK rejects a different final URL. See the [SDK transport rules](../packages/restgo-sdk/README.md#storage).

## State and events

| API            | Behavior                                                     |
| -------------- | ------------------------------------------------------------ |
| `accept`       | Picker filter; does not replace server validation.           |
| `enabled`      | Enables selection and starting an upload.                    |
| `isPublic`     | Default visibility, initially private.                       |
| `selectedFile` | Read-only selected `File` or `null`.                         |
| `selection`    | Read-only selection metadata or `null`.                      |
| `fileName`     | Read-only selected name.                                     |
| `uploading`    | Read-only upload-in-progress flag.                           |
| `progress`     | Read-only percentage or `null`.                              |
| `result`       | Read-only last upload result or `null`.                      |
| `lastError`    | Read-only last error or `null`.                              |
| `Clear()`      | Clear selection/state and abort upload; retain remote files. |

**OnChange** receives selection or `null`; **OnProgress** receives measurements;
**OnSuccess** receives complete result metadata; **OnError** receives the error;
**OnComplete** receives `{ result, error }`. Upload failures also reject the
`SendToRestGO()` promise. Selection, request, and progress belong to each instance
and are not persisted. Disposing the page/reusable releases selection, cancels
uploads, and removes event subscriptions.

The public methods are `OpenFile()`, `SendToRestGO()`, and `Clear()`. This
nonvisual component has no visual properties, styles, file conversion, or aliases.
