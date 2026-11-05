# Toast

`WebToast` is a viewport notification component authored from the nonvisual tray.
Insert a Toast, choose its duration, position and one icon per state in the
Inspector, and select a Toast style. The default style is added to existing
projects as well as new projects. A single style contains the background, text
and border colors for all four states, plus shared typography and shape.

```ts
Toast1.Success('Saved successfully');
this.Toast1.Alert('Please check the form');
Toast1.Danger('Unable to save');
Toast1.Notifier('A new message arrived');
Toast1.Clear();
```

The methods are available on both page and reusable component instances.
`Success()` uses the existing `Sucess` state identifier. The other state
identifiers are `Alert`, `Danger` and `Notifier`.

`duration` is in milliseconds and defaults to 4000; zero leaves notifications
open until the close button or `Clear()`. Positions cover the left, center and
right of the top, middle and bottom of the viewport. Notifications at the same
position stack across Toast instances. They can be closed individually and are
removed with their owning page or reusable placement. Text is rendered as text,
not HTML.

`OnShow` and `OnClose` receive `CustomEvent<WebToastEventDetail>` with `message`
and `state` in `event.detail`. The Inspector permits clearing an icon. Toasts
use status or alert semantics, a keyboard-accessible close button and reduced
motion when requested by the operating system. The viewport stack and Styles
preview reserve space around each notification for its shadow.
