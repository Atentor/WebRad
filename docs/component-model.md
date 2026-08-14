# Component model

A component definition declares its type, palette metadata, icon identifier, visual/nonvisual role, child support, default event, bounds, property definitions, and event definitions. Palette, Inspector, naming, model creation, generation, and validation consume this registry. Browser and React adapters remain small type-keyed projections because they construct different host objects.

Each `ComponentNode` contains an immutable ID, registered type, unique TypeScript-safe name, parent ID, bounds, property bag, event bindings, and ordered child IDs. Component names also may not collide with inherited `WebForm` runtime members because generated fields live on that subclass. Visual ordering follows the parent's child list. Nonvisual definitions use the same persistent nodes and command/history path, but the Designer shows them in its dedicated tray and excludes them from canvas geometry. Their runtime constructors receive the node's stable `id` and current `name`, so nonvisual services preserve identity without requiring a DOM element.

Property definitions select inspector editors (`string`, `string-list`, `number`, `boolean`, `enum`, `color`, or `component`). Defaults are materialized when a component is created, which keeps saved projects predictable. Properties registered for the MVP components have corresponding typed runtime accessors, making the Inspector contract available through TypeScript without making React instances the source of truth. `WebApiClient` is the first nonvisual definition; it exposes a real browser `fetch`-based client and a mutable, typed `baseUrl` property in addition to its readonly `id` and `name`.

Every non-root node, whether visual or nonvisual, is generated as `public readonly Name: Type` in both the implementation base class and its editor declaration. The form root is represented by `this`, including root event bindings, and is not emitted as another field. In authored code the canonical expression is `this.Name`. The editor offers Delphi-like completion entries using the shorter `Name` label and inserts `this.Name`, after which native TypeScript completion provides the registered runtime properties.

Changing a component's `Name` updates the Project Model and regenerates its field and typings. It does not perform an implicit rewrite of user-authored TypeScript; references to the previous name remain in the source and are reported by TypeScript until explicitly changed.

Visual components share `@webrad/runtime/visual`: property readers, class names, common style projection, and component CSS. React only maps the registered component type to the appropriate DOM element; selection, hit testing, and keyboard behavior remain in the separate design overlay.

Containers own children and child coordinates are relative to the container. `WebPanel` is the first child-capable component. Future flex and grid layout metadata can coexist with absolute bounds without changing component identity.
