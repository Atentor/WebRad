# Component model

A component definition declares its type, palette metadata, icon identifier, visual/nonvisual role, child support, default event, bounds, property definitions, and event definitions. Palette, Inspector, naming, model creation, generation, and validation consume this registry. Browser and React adapters remain small type-keyed projections because they construct different host objects.

Each `ComponentNode` contains an immutable ID, registered type, unique TypeScript-safe name, parent ID, bounds, property bag, event bindings, and ordered child IDs. Component names also may not collide with inherited `WebForm` runtime members because generated fields live on that subclass. Visual ordering follows the parent's child list. Nonvisual definitions use the same persistent nodes and command/history path, but the Designer shows them in its dedicated tray and excludes them from canvas geometry.

Property definitions select inspector editors (`string`, `string-list`, `number`, `boolean`, `enum`, `color`, or `component`). Defaults are materialized when a component is created, which keeps saved projects predictable. Runtime instances expose convenient typed properties without making React instances the source of truth. `WebApiClient` is the first nonvisual definition; it exposes a real browser `fetch`-based client and a design-time `baseUrl` property.

Visual components share `@webrad/runtime/visual`: property readers, class names, common style projection, and component CSS. React only maps the registered component type to the appropriate DOM element; selection, hit testing, and keyboard behavior remain in the separate design overlay.

Containers own children and child coordinates are relative to the container. `WebPanel` is the first child-capable component. Future flex and grid layout metadata can coexist with absolute bounds without changing component identity.
