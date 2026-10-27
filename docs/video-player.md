# Video Player

**Video Player** is a visual **Standard** component backed by `WebVideoPlayer` and
bundled Shaka Player. The embedded snapshot currently records Shaka **5.3.2** in
`packages/compiler/src/shaka-sources.generated.json`. Applications using the
component include its JavaScript, control CSS, and
`assets/licenses/Shaka-Player-Apache-2.0.txt`, without a CDN or Electron/Node.js.

The protected **Default Video Player** style supplies its surface, border,
corners, interaction states, and centered `contain` fit. Missing defaults are
restored on project load with deterministic identities; existing styles and
bindings are preserved. New players use the default. See [themes](themes.md) for
current theme behavior and legacy style preservation.

## Sizing and sources

In **Properties → Video → Aspect ratio**, select `none` (default), `16:9`, or
`9:16`. A fixed ratio derives height from responsive width in Designer, Preview,
and exports. **Stretch** width follows available container space. The ratio
overrides saved vertical height, limits, stretch, and growth without deleting
those rules; `none` restores them. **Object fit** controls content framing.
The typed property is also available as `VideoPlayer1.aspectRatio`.

For a processed RestGo video:

```ts
try {
  await VideoPlayer1.LoadRestGo('VIDEO-ID');
  await VideoPlayer1.Play();
} catch (error) {
  Message(error instanceof Error ? error.message : String(error));
}
```

Configure the project RestGo connection first. Loading tries the public descriptor,
then the shared Authentication session when required. Explicit
`LoadRestGo(id, { public: true })` or `{ public: false }` selects the route. Private
videos require an authorized owner session, without administrative/API-token fallback.

To connect upload and playback:

```ts
const file = await VideoUpload1.OpenFile();
if (!file) return;
const video = await VideoUpload1.SendToRestGO({ isPublic: false });
// Sign in before upload. If automatic processing is disabled on the server,
// explicitly call RestGO.videos.process(video.id).
await VideoUpload1.WaitUntilReady({ timeoutMs: 600_000 });
await this.VideoPlayer1.LoadRestGo(video.id);
await this.VideoPlayer1.Play();
```

Upload never starts playback automatically. A long operation may require a fresh
user activation before `Play()`. Autoplay defaults to false; rejection leaves
the source loaded for another attempt.

The **Video source** editor offers **None (load by code)**, **RestGo video** with
ID, or **HLS / DASH URL**. **Apply source** commits an undoable model change.
Saved sources load at runtime; Designer renders a representation without fetching
playlists/segments or playing media. YouTube URLs are rejected; iframe embedding
and stream extraction are outside this contract.

```ts
await VideoPlayer1.LoadUrl('https://cdn.example.com/master.m3u8', { format: 'hls' });
await VideoPlayer1.LoadUrl('https://cdn.example.com/manifest.mpd', { format: 'dash' });
```

External URLs receive no cookies or RestGo credentials. Use final URLs without
redirects. HTTPS applications need compatible HTTPS media and CORS.

## Public API

| Property                                           | Meaning                                                                                     |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `source`                                           | `null`, `{ kind: 'restgo', videoId }`, or `{ kind: 'url', url, format }` with `hls`/`dash`. |
| `controls`                                         | Accessible, localized Shaka controls.                                                       |
| `autoplay`, `muted`, `loop`, `playsInline`         | Playback preferences subject to browser policy.                                             |
| `volume`                                           | Number from 0 to 1.                                                                         |
| `playbackRate`                                     | Positive number.                                                                            |
| `objectFit`, `poster`                              | Content fit and optional poster; styles can also set fit/position.                          |
| `quality`                                          | `'auto'` or a numeric quality present in loaded media.                                      |
| `state`, `error`                                   | Read-only state and last error.                                                             |
| `duration`, `currentTime`, `buffered`, `isPlaying` | Read-only projections of actual media.                                                      |
| `availableQualities`, `currentQuality`             | Read-only available variants and effective quality.                                         |

```ts
VideoPlayer1.Pause();
VideoPlayer1.Seek(20); // Seconds within media duration.
VideoPlayer1.Stop(); // Pause and rewind, retaining the source.
const quality = VideoPlayer1.availableQualities[0];
if (quality) VideoPlayer1.SetQuality(quality.quality);
VideoPlayer1.SetQuality('auto');
await VideoPlayer1.Unload();
```

Manual qualities come from actual Shaka tracks. RestGo dimensions map to nominal
descriptor qualities, including portrait video; unavailable variants are not
invented. Inspector starts at Auto; choose manual quality through player controls
or `SetQuality()`. Events report requested/effective quality; buffering/network
can delay the visible change. Captions/languages reflect existing tracks; the
RestGo module does not upload subtitles. Fullscreen/PiP depend on browser support.

Typed events are `OnLoaded`, `OnPlay`, `OnPause`, `OnEnded`, `OnTimeUpdate`,
`OnBuffering`, `OnQualityChange`, and `OnError`. Bare and `this` access expose
completion, hover, signatures, and diagnostics. Each reusable placement owns its
media element, player, observers, and state.

## Private media and lifecycle

`videos.getMedia()` validates origin and `/videos/{id}/hls/...` prefix before
transport. Shaka's network plugin uses it for private playlists/segments, including
Range, current JWT, coordinated refresh on 401, omitted cookies, and rejected
redirects. External/other-video URLs never receive credentials; 403 stops playback.
Logout/user changes abort requests and clear controlled media/thumbnails. Private
thumbnails use SDK Blob downloads with revoked object URLs. Missing thumbnails
(404) do not block playback. There is no persistent offline cache.

Private playback requires MSE/MMS. Unsupported environments and a fallback ending
in native `src=` mode are rejected because native requests cannot carry per-request
Authorization. Public videos may use native playback. Safari/iOS remain unverified
in this checkout; private support depends on MSE/MMS and codecs. There is no
fallback that publishes private media.

Source changes and `Unload()` abort prior work and await destruction before
attaching a new player. `dispose()` stops I/O, removes handlers/filters/observers,
revokes Blob posters, and destroys overlay/player once. The overlay owns player
destruction. Transmuxing is bundled locally without an external hosted worker.

Existing `tests/video-player.browser.test.ts`, enabled with `WEBRAD_BROWSER_PATH`,
exercises compiled iframe Preview, HLS/MPEG-TS, audiovisual DASH, playback/seek/end,
quality, private JWT/refresh, transport restrictions, logout/revocation, disposal,
and reusable isolation. Its local protocol server and official Shaka fixtures do
not establish FFmpeg conversion on a real RestGo server or Safari/Linux execution.
