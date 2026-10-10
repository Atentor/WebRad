# Integrated code debugger

WebRAD debugs the compiled browser application in a dedicated Preview window. The IDE remains responsive when application execution pauses. The generated application remains an ordinary browser application.

Open a page, reusable component, Model, or Unit in Code. Click the Monaco gutter beside a line number, or press **Ctrl+F9**, to toggle a breakpoint. Choose **Run > Start / Continue Debugging**, click **Debug** in the toolbar, or press **F5** to save, compile, and start the debug Preview. Interact with the Preview to reach event handlers.

When execution pauses at a breakpoint, step, or exception, WebRAD restores the IDE if minimized, brings it in front of Debug Preview, and focuses Monaco at the paused source line. Editing debugger preferences during the same pause preserves your current focus.

| Action                    | Shortcut                              |
| ------------------------- | ------------------------------------- |
| Start or continue         | F5                                    |
| Step over                 | F10                                   |
| Step into                 | F11                                   |
| Step out                  | Shift+F11                             |
| Stop                      | Shift+F5                              |
| Restart                   | Ctrl+Shift+F5 (Cmd+Shift+F5 on macOS) |
| Toggle breakpoint in Code | Ctrl+F9                               |
| Normal Preview            | F9                                    |

**View > Debugger** opens the Debug tab. It contains execution controls, the call stack, expandable scopes and `this`, watch expressions, the debug console, conditional breakpoints, and the exception pause policy. Selecting a stack frame navigates to its authored source and evaluates expressions in that frame. Use `this.ComponentName.member` to inspect page and reusable component properties: bare component references are a compiler authoring contract and do not become global variables in the running application. Expressions use the JavaScript names and values available in the selected frame; evaluating an expression can call functions and change the application.

Breakpoints may move to the next executable statement when placed on a blank line or comment. The panel displays their resolved line and verification status. Variables become available while paused. Reading object properties does not automatically execute getters. A debug session uses a saved source snapshot; Code is read-only during execution, and changes to the project or authored sources stop that session. Restart reuses the compiled snapshot and current breakpoints. Stop before editing, then F5 builds the updated project.

While paused, hover over a variable or property reference in the selected frame's source to see its current value alongside the normal TypeScript information (for example, `aaa = 123`). Hover evaluation uses the selected call frame, extracts references through the TypeScript AST, and requests CDP evaluation with side-effect rejection. Calls, assignments, comments, strings, and type annotations are not evaluated automatically. Unavailable references retain the normal TypeScript hover. Changing the selected frame, stepping, resuming, or stopping clears the previous value and invalidates pending hover results.

Debugger preferences are optional, versioned project metadata in the `.wrproj` manifest: `debugger.version` is `1`, with project-relative breakpoints, watch expressions, and `pauseOnExceptions` (`none`, `uncaught`, or `all`). They follow normal project saving and reopening. Paused frames, variable handles, console results, and debug Preview URLs are transient. Existing project format version 2 remains supported.

The main process validates every debugger IPC request and owns the target window and Chrome DevTools Protocol connection. The renderer receives a narrow typed preload API, never arbitrary CDP transport or target selection. Session-scoped frame/object capabilities expire on resume, stop, restart, and project changes. Debug Preview windows have Node integration disabled, context isolation and sandboxing enabled, no IDE preload, and token-scoped loopback HTTP publications revoked on teardown.

Debug compilation forces source maps and an unminified bundle. Source maps compose the compiler's AST-selected instance-reference edits with the bundler mappings so lines and columns point to the original authored TypeScript, including CRLF and Unicode. Only debug Preview scripts receive the fixed source URL used by the debugger; exported browser applications do not depend on Electron or this integration.

Run `npm run smoke:debugger` for the real Electron workflow, and the root typecheck, lint, tests, and build scripts for repository validation.
