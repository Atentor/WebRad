# Icons (Lucide)

## IDE interface

The IDE's shared `Icon` renderer uses the installed upstream Lucide SVG nodes,
with a 24 by 24 viewBox, 2-unit strokes and `currentColor`. Registry metadata and
existing action identifiers resolve through the typed `ide-icons.ts` aliases.
Modals, toolbar/sidebar controls, diagnostics, report outline and debugger controls
share this renderer. Monaco completions, find/navigation controls and debugger
markers use local Lucide SVG masks from `monaco-icons.ts`.

Application artwork previews use `ProjectIconGraphic` for the saved WebRAD
Button/Data Grid catalogue and `LucideGraphic` for Icons. These previews retain
Designer/Preview/export parity; choosing interface artwork does not change saved
project icon IDs. The WebRAD brand/application logo remains a brand asset.

## Application icons

The Standard palette's **Icons** component (`WebIcon`, generated names `Icon1`,
`Icon2`, etc.) renders SVGs from the pinned `lucide` dependency. The searchable
Inspector gallery displays actual upstream icons. Its selection is saved in the
Project Model; the Designer, compiled F9 Preview and exported browser application
use the same catalogue, without a CDN or network request.

Each gallery tile displays the exact icon identifier, including hyphens (for
example, `arrow-right`). Long names wrap and the tooltip repeats the identifier.
Use that identifier with the typed `icon` property in Monaco:

```typescript
Button1.icon = 'save';
this.Button1.icon = 'check';
Icon1.icon = 'camera';
this.Icon1.icon = 'arrow-right';
```

Both properties update their SVG immediately in Preview and exported applications,
with completion and diagnostics for their respective catalogues. Button uses the
WebRAD catalogue (`WebButtonIcon`); Icons uses Lucide (`LucideIconName`). A Button's
style must display icons (`Text and icon` or `Icon only` in Button content).

The initial size is 32 × 32 pixels. SVGs retain their 24 × 24 viewBox and aspect
ratio in rectangular, responsive or reusable layouts. Color comes from the
selected project style's Text color (`currentColor`); the protected Default Icons
style uses the Aurora blue palette color. Backgrounds, borders, radius, shadows,
focus rings and disabled opacity can be customized through Styles. Existing
custom styles and bindings are preserved when missing defaults are restored.
Enabled icons keep the same appearance on hover, press and focus, including in
button mode. The default adds no focus ring or outline. Custom interaction
effects remain available through Styles. Loading an older project removes only
the original seeded 2px blue ring from its protected Default Icons style.

## Inspector and public API

| Inspector            | Typed runtime member          | Default  | Behavior                                                                             |
| -------------------- | ----------------------------- | -------- | ------------------------------------------------------------------------------------ |
| Icon                 | `icon: LucideIconName`        | `'star'` | Canonical kebab-case Lucide name, chosen from the visual gallery.                    |
| Mode                 | `mode: WebIconMode`           | `'icon'` | `'icon'` displays a graphic; `'button'` enables click/keyboard activation.           |
| Accessible label     | `accessibleLabel: string`     | `''`     | Screen reader name; falls back to the component name. Never renders visible text.    |
| Stroke width         | `strokeWidth: number`         | `2`      | SVG viewBox units, finite and greater than 0, up to 24.                              |
| Enabled              | `enabled: boolean`            | `true`   | Native disabled state, suppressing activation.                                       |
| Visible              | `visible: boolean`            | `true`   | Shared visibility contract.                                                          |
| Collapse when hidden | `collapseWhenHidden: boolean` | `true`   | Shared layout removal contract.                                                      |
| TabIndex             | `tabIndex: number`            | `0`      | Configured tab order used in button mode; icon mode is excluded from tab navigation. |

`WebIconMode` is `'icon' | 'button'`. `LucideIconName` is the literal union of
the installed catalogue's canonical filenames. Invalid icon names, modes or
stroke widths passed at runtime throw `RangeError`; compilation also rejects
invalid saved Inspector values. The inherited component geometry, style, focus,
visibility and event APIs are available as on other visual components.

`click(): void` activates only when the mode is button and the component is
enabled. `onClick: WebComponentEventHandler<this> | null` binds a typed handler.
There is no caption property or visible text node in either mode.

Both modes keep one stable native `<button type="button">` DOM element, avoiding
form submission and preserving event bindings when mode changes. Icon mode has
`role="img"`, no tab stop and suppresses click/double-click handlers. Button mode
has `role="button"`, an accessible name and native Enter/Space activation.
SVG descendants are hidden from assistive
technology to avoid duplicate announcements. Designer controls remain inert
for editing; application interaction runs in Preview/browser runtime.

## Events and page/reusable code

The Interaction tab exposes `OnClick` (default), `OnDblClick`, `OnFocus`, `OnBlur`,
`OnKeyDown`, `OnKeyUp`, `OnMouseEnter` and `OnMouseLeave`. Handlers receive the
concrete `WebIcon` sender and the corresponding native mouse, focus or keyboard
event. These events add no custom `event.detail` payload. `OnClick` and
`OnDblClick` run only in button mode; disabled components suppress handlers.

```typescript
import type { WebIcon } from '@webrad/runtime';

// Inside an authored page/reusable class; Icon1 is its generated typed instance.
configureIcons(): void {
  Icon1.icon = 'save';
  this.Icon1.mode = 'button';
  Icon1.accessibleLabel = 'Save changes';
  Icon1.strokeWidth = 2;
}

Icon1Click(sender: WebIcon, event: MouseEvent): void {
  event.preventDefault();
  sender.icon = 'check';
  sender.accessibleLabel = 'Changes saved';
}
```

Bare and `this.` access share native Monaco completion, hover, signatures and
diagnostics. Local variables retain lexical precedence. Separate placements
of a reusable own independent icon instances and handlers. User-authored
TypeScript files are never rewritten by catalogue generation.

## Catalogue updates and redistribution

`scripts/lucide-sources.mjs` reads the installed upstream icon modules and emits
the checked `lucide-icons.generated.ts` catalogue. `npm run runtime:sources`
also embeds it, the runtime class and the complete upstream license in the
compiler snapshot. `npm run runtime:sources:check` checks installed dependency
parity, including the license. No designer, React, Electron or Node dependency
is required by the generated browser runtime.

Preserve `assets/licenses/Lucide.txt` in generated applications. It contains
Lucide's ISC license and the upstream Feather attribution. Existing WebButton
and Data Grid icon catalogues retain their saved identifiers and behavior.

Regression coverage: `tests/icon.test.tsx`, `tests/icon.browser.test.tsx`, the
ObjectInspector suite and `apps/ide/main/icon-smoke.ts`. The Electron development
and packaged runners require evidence of palette insertion, gallery selection,
Inspector/model persistence and native keyboard operation in compiled F9.
