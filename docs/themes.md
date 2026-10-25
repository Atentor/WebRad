# Application themes

When creating a project, **Application theme** offers four built-in presets,
independently of **Blank project** or **Examples & Tutorial**:

- **Aurora**: soft blue and violet gradients, the existing default.
- **Prism**: violet and coral gradients, rounded surfaces and adaptive mint,
  coral and sunshine custom colors.
- **Flat**: solid neutral surfaces, teal accents, compact corners and no
  Default style shadows or hover scaling.
- **WebRAD**: the IDE's Light/Dark palette, solid
  surfaces and square corners. Default styles, nested Menu controls, Data Grid
  buttons and scrollbar corners use radius zero. Button surfaces and hover colors match the IDE.

All four presets use Roboto by default and preserve the same text sizes and
weights in Light and Dark. Presets do not replace style typography. The project
surface also uses bundled Roboto for text without an explicit font family.
Explicit font choices and authored per-theme typography overrides remain supported.

Every preset includes Light and Dark palettes, with both shown in the chooser.
The selected preset is materialized as ordinary project theme settings and
editable Default styles. It adds no template dependency or persisted preset ID;
save/reopen, Designer, Styles, Preview/F9 and exported applications use the same
saved values. Aurora remains selected initially. Existing projects are unchanged.
Use `Theme.mode` or `Theme.toggle()` at runtime for all four presets.

Projects have Light and Dark themes, independent of the IDE appearance. Open
**Styles > Themes** to edit the colors side by side, select the initial
application theme (**Light**, **Dark** or **System**), and choose whether the
application remembers the user's selection. **Save themes** commits the draft;
**Cancel** discards it. Restore Aurora changes only the built-in draft colors,
preserving custom colors. Themes is the single project color manager.

In a component property, style, gradient endpoint or scrollbar color, open the
predefined-color picker and choose a **Theme color**. Roles include background,
surface, input, text, muted text, heading, border, primary/accent and their
interaction states, disabled colors, focus, status colors, overlay, scrollbars
and media surfaces. Each role has an independent value in each theme. Role
values may be six-digit hexadecimal colors or links to custom theme colors.
**Add color** creates a named custom color with stable identity and separate
Light/Dark values. **Same** uses one fixed value for both themes; clear it to
edit Dark independently. The shared picker lists roles and custom colors
together. Entering a fixed color in an individual property removes its link.

Old `settings.colorPalette` entries are migrated to `settings.themes.customColors`
with identical Light and Dark values. Existing `var(--wr-palette-<id>)` links
remain aliases of the migrated colors; saving writes only Themes. New links
use `var(--wr-theme-custom-<id>)`. Names and order can change without breaking
links. Removing a fixed custom color preserves its last value in linked fields.
An adaptive color still used by a shared field must be unlinked before removal;
the save is rejected without changing the project, preserving both appearances.
Theme-specific fields can detach to their respective Light/Dark values.

**Preview theme** in Styles and **Responsive > Application theme** in the
Designer share a design-time selection. This selection changes neither the
IDE theme nor the application's saved initial mode. Preview/F9 and generated
applications use the project's initial mode or the remembered user choice.

## Styles and existing projects

New projects receive theme-linked Default styles and scrollbars. Loading an
existing format-v2 project adds deterministic theme settings with Light as the
initial mode, preserving its saved styles, component overrides, IDs and
authored TypeScript. To adopt the themes, enable **Link Default styles and
scrollbars when saving** in Styles > Themes. This explicit conversion replaces
color values in protected Default styles and scrollbar colors; it preserves
custom styles, component color overrides and scrollbar geometry. Themes and
the conversion are committed atomically. Default colors without a supported
role mapping retain their saved value.

New Menu configurations follow application themes. In an existing Menu's
configuration, **Appearance > Follow application theme** links its colors to
the project, retaining its dimensions. Fixed Light and Dark presets are also
available. Theme changes update open drawers, flyouts and Popups through CSS
inheritance, retaining their component instances and state.

Each style keeps its existing identity and the states Base, Hover, Focus,
Active and Disabled. **Edit values > Shared** edits the common values.
**Light overrides** and **Dark overrides** store only theme-specific changes,
such as a different shadow. Clearing an override restores the Shared value.
The compiler merges each theme before generating its state utilities; a
theme-specific solid background replaces an inherited gradient. Duplicating a
style includes its theme overrides and creates an independent identity.

## Runtime API

The compiler configures the browser-only `Theme` service in a generated bootstrap
module evaluated before authored page, reusable, Model and Unit modules.
`Theme` is available by default in page, reusable, Model and Unit code, without
an import. Monaco provides native typed completion, hover and invalid-use
diagnostics. Explicit imports remain supported.

```ts
import { themeColorReference } from '@webrad/runtime';

Theme.mode = 'dark';
Theme.mode = 'light';
Theme.mode = 'system';
Theme.toggle();

const current = Theme.resolvedMode; // 'light' | 'dark'
const surfaceColor = themeColorReference('surface');
```

`mode` accepts only `light`, `dark` and `system`. `resolvedMode` is read-only.
System follows `prefers-color-scheme` and reacts to changes while the
application is open. `toggle()` selects the opposite resolved theme explicitly.
Assigning `mode` does not reload pages, recreate components, change navigation
or clear form values. Components may use `themeColorReference()` with their
typed color properties.
`customThemeColorReference(id)` produces a reference to a custom color defined
in Themes; use its stable saved ID.

`Theme.onChange` is a single typed handler; `Theme.subscribe(handler)` supports
multiple listeners and returns an unsubscribe function. Both receive
`(sender: WebTheme, event: CustomEvent<ThemeChangeDetail>)`; detail contains
`mode`, `resolvedMode`, `previousMode` and `previousResolvedMode`. Unsubscribe
page/reusable listeners when disposing their owner. A DOM
`webrad-theme-change` event with the same detail is dispatched on the document
element. Assigning the same mode without a resolved-theme change does not emit
duplicate notifications.

When remembering is enabled, choices use browser local storage under
`webrad:<project-id>:theme`, isolated per project and origin. Other open tabs of
the application follow storage changes. Blocked storage falls back to an
in-memory choice. `Theme.reset()` forgets the saved choice and returns to the
project's initial mode. The project definitions themselves remain in `.wrproj`.

Preview and exported HTML execute the same self-contained initializer in the
head, before styles and application code, to select the remembered/system
theme before first paint. Both theme palettes and style overrides are compiled
to static CSS. Applications require no designer, Electron or Node.js to switch
themes.

## Verification status

Existing model expectations and development/packaged Electron smoke workflows
have been updated for the contract. The smoke requires the absence of Color
palette, unified semantic/custom picking, fixed/adaptive custom editing and
persistence, actual Light/Dark rendered colors, saving System mode, runtime change events,
retained page/Popup state, remembered initialization and reset. It retains a
dark-theme screenshot when a screenshot destination is supplied. These checks
were not run as part of implementation; validation requires an explicit request.
