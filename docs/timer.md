# Timer

`Timer` is a nonvisual component in the Nonvisual palette. It appears in the
Designer tray and has no DOM element or visual style in generated applications.

The Inspector saves `Time (ms)` (`time`, default 1000), `Loop` (`loop`, default
true), and `Enabled` (`enabled`, default false). Time must be an integer from 1
to 2147483647 milliseconds. Browser scheduling may delay callbacks, especially in
background tabs; this is not a precision clock.

Interact exposes `OnTimer`, `OnStart`, and `OnStop`. `OnTimer` receives a
`WebTimer` sender and `CustomEvent<WebTimerEventDetail>` whose `detail.tick` is
the count for the current run, starting at one. With Loop disabled, the timer
disables itself before OnTimer and then emits OnStop. Stopping or disposing
inside a handler cancels the next callback.

Authored page and reusable code supports both `Timer1.Start()` and
`this.Timer1.Start()`, with concrete Monaco completion and diagnostics:

```ts
Timer1.time = 500;
Timer1.loop = true;
Timer1.Start();
```

`Start()` starts a new run and resets `tickCount`; it does nothing when already
running. `Stop()` disables the timer. `Restart()` stops and starts a fresh run.
Assigning `enabled` calls Start/Stop. Changing `time` while running schedules a
new full interval without resetting the tick count. `loop` affects the next tick.
An initially enabled Timer emits OnStart after generated handlers are bound.
Page/reusable disposal clears scheduled callbacks and event bindings without
emitting OnStop. A disposed timer cannot be restarted.

The public runtime exports `WebTimer`, `WebTimerConfiguration`, and
`WebTimerEventDetail`. Generated runtime sources and Monaco declarations are
derived from the runtime implementation. Each reusable placement owns its timer
state and lifecycle.
