# HTML

Drag **HTML** from **Builder > Standard** onto a page or reusable component.
Edit **Content > HTML** in the Visual Inspector to paste an HTML fragment or a
complete document. The multiline editor preserves line breaks, indentation,
quotes and markup as one string. **Accessibility > Title** names the embedded
document for assistive technology.

The saved node type is `WebHtml`. Its `props.html` and `props.title` are strings;
the default content is `<p>HTML content</p>` and the default title is
`HTML content`. No project-format version change is required. Position, size,
responsive layout, visibility, enabled state and outer styles use the ordinary
component contracts. HTML elements inside it are authored in the HTML string,
rather than as Designer child components.

**Size & position > Aspect ratio** chooses `none` for free dimensions or a
fixed `1:1`, `4:3`, `3:4`, `16:9` or `9:16` frame. Height then follows width,
including for an external embed. Use `Html1.aspectRatio` in page/reusable code.
See [Aspect ratios](aspect-ratio.md).

## Runtime API

Each placement is a concrete `WebHtml` instance exported by `@webrad/runtime`.
Page and reusable code support both `Html1.html` and `this.Html1.html`, with
typed Monaco completion, hover and diagnostics:

```ts
Html1.html = `
  <style>
    body { margin: 0; font-family: sans-serif; }
    article { padding: 16px; color: #1e3a8a; }
  </style>
  <article><h2>Welcome</h2><p>HTML content with its own CSS.</p></article>
`;
Html1.title = 'Welcome information';
```

- `html: string` reads or replaces the authored markup. Assigning the same
  value keeps the current document; changing it loads a new document.
- `title: string` reads or changes the frame's accessible name.
- `clear(): void` replaces the document with empty HTML.
- **OnLoad** runs when the embedded document finishes loading. Its handler
  receives `(sender: WebHtml, event: Event)`. The equivalent code API is
  `onLoad`, or `bindEvent('OnLoad', handler)`.
- `enabled = false` makes the embedded frame inert, preventing interaction.

Runtime assignments are transient and do not rewrite the saved Project Model.
Treat `html` as markup: escape text values before interpolating them when they
must be displayed literally.

## Document isolation

HTML fragments and complete documents render in Designer, Styles previews,
compiled Preview and exported applications through an iframe's `srcdoc`, with
`sandbox=""` and `referrerpolicy="no-referrer"`. HTML and inline CSS work within
this document.
Scripts, inline JavaScript handlers, form submission, popups and top-level
navigation are disabled. The frame has an opaque origin and cannot access the
host DOM, application component instances or IDE preload APIs.

Outer component styles affect the frame itself. Fonts, application theme
variables, Tailwind utilities and other host styles do not cascade into the
embedded document; declare the content's styling in its HTML. A full document
can include its own viewport metadata. Fragments use the browser's normal
document defaults, including body margins, unless overridden by authored CSS.

The iframe inherits the host's Content Security Policy. Remote resources and
nested embeds remain subject to that policy; HTML does not grant extra network
permissions. Use inline CSS for consistent results in the IDE and Preview.
Relative URLs resolve against the current host URL; use absolute URLs or
embedded data URLs for portable content. Project asset paths inside HTML are
not rewritten or added to the export dependency graph automatically.

In the Designer the iframe is additionally inert and ignores pointer input so
selection, dragging and resizing remain owned by the Designer. In running
applications, mouse and keyboard events inside the embedded document stay
inside that document; **OnLoad** is the component's supported event.

## External iframe embeds

Paste a standalone cross-origin HTTPS iframe, such as the YouTube embed below,
directly into **Content > HTML**:

```html
<iframe
  width="560"
  height="315"
  src="https://www.youtube.com/embed/KyRLjVjPEGo?si=CxPh5GCMooyR4QLk"
  title="YouTube video player"
  frameborder="0"
  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
  referrerpolicy="strict-origin-when-cross-origin"
  allowfullscreen
></iframe>
```

When the HTML contains only this iframe, apart from whitespace and comments,
WebHtml projects it directly as the component's browser frame. The original
string remains the `html` value and saved Project Model value. This avoids an
extra inline document imposing script, opaque-origin and referrer restrictions
on the external player. HTTPS documents keep their own origin and run their own
scripts, separately from authored inline markup and the IDE.

The remote frame sandbox permits scripts, its own origin and presentation.
An explicit sandbox on the pasted iframe can further restrict those tokens;
popups, form submission and top navigation remain unavailable. `allow`,
`allowfullscreen`, `loading` and `referrerpolicy` are forwarded. If omitted,
referrer policy defaults to `strict-origin-when-cross-origin`, as
[recommended by YouTube](https://developers.google.com/youtube/terms/required-minimum-functionality#embedded-player-api-client-identity).
The accessible Title property and component layout still own the outer frame.
For the example above, set the component's Width and Height to **560 × 315** in
the Inspector; authored iframe dimensions do not replace Project Model bounds.

Both IDE and Preview CSP permit HTTPS external frames. The Preview iframe also
delegates media playback, picture-in-picture and fullscreen. Designer frames
remain inert; interact with the player in **F9 Preview** or the exported app.
Playback still depends on connectivity, provider embedding permissions and
browser/Electron media support. Serve exported applications over HTTP/HTTPS to
provide the referrer required by players such as YouTube.

Mixed markup containing nested iframes continues to use the restrictive inline
document sandbox. Use one HTML component per external embed. Same-origin,
non-HTTPS and `srcdoc` embeds do not enter the direct external-frame mode.

See the [HTML iframe specification](https://html.spec.whatwg.org/multipage/iframe-embed-object.html#the-iframe-element)
and [CSP inheritance](https://www.w3.org/TR/CSP/#security-inherit-csp) for the
browser isolation rules.
