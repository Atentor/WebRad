# Line

`WebLine` is a visual separator in the Standard palette. Set **Orientation** to
`horizontal` or `vertical`, then resize it in the Designer or use the regular
responsive layout controls. Changing orientation does not replace the saved
width and height. For a vertical line, make the component tall enough for its
line and any centered content.

The optional **Label** and **Icon** appear independently or together in the
middle. Choose an icon from the built-in icon picker; clear it to remove the
icon. Text remains horizontal for a vertical separator. The label and icon are
centered between equal flexible segments. Long labels can be truncated when a
horizontal component is too narrow. The component exposes a separator role and
orientation to assistive technology. **Accessible label**, when set, overrides
the visible label as the separator's accessible name.

The protected **Default Line** style is shared like other component styles.
The Styles editor provides line color, thickness, solid/dashed/dotted/double or
hidden stroke, space around the center, icon size and color, spacing between
icon and label, typography, and the usual visual properties. Double borders
need a thickness of at least 3 px to show both strokes. Line color and text
color in the default style follow the project theme. Custom styles can be
created, assigned, and shared among Line components.

In page or reusable-component code, each Line is a typed `WebLine` instance.
For example, a component named `Line1` can be configured with:

```ts
Line1.orientation = 'vertical';
Line1.caption = 'Details';
Line1.icon = 'info';
Line1.accessibleLabel = 'Details section';
```

Use `this.Line1` in the same way. Runtime assignments affect the mounted
instance; they do not rewrite the saved project. `OnClick` and `onClick` use the
normal visual-component event contract. An empty caption and icon produce an
uninterrupted separator.
