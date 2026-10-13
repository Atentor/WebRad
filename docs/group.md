# Group

`WebGroup` (palette label **Group**, in **Containers**) groups child components
using the same sizing, positioning, responsive container layout and mouse events
as Panel. Its runtime class extends `WebPanel` and is exported from
`@webrad/runtime`; generated page/reusable instances and Monaco use `WebGroup`.

Group has no background or border properties, default visual style, or style
selector. It does not appear in the Styles component catalog. Its DOM host keeps
only the shared structural sizing, layout and interaction behavior. Designer
selection outlines remain editing feedback.

The registered `supportsStyles: false` metadata controls this exclusion in the
Inspector and Styles workspace. Existing components retain their style behavior.
