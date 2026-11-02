# Login

Drag **Authentication > Login** from the palette. Double-click the component or
choose **Login configuration > Configure Login** in the Inspector. Login is a
ready-to-use template built from the existing Panel, Label, Edit, Button and
CheckBox runtime classes. Its internal elements are configured through the modal.

Login includes email/password sign-in, account registration and password recovery.
Enable **RestGo integration** and configure **Connection** for Preview and generated
applications. Public registration must also be enabled on the RestGo server.
Activation, password policy and permission to sign in remain server decisions.

## Configuration

- **Behavior:** Panel or Popup, initial form, registration availability, full name,
  required name, password confirmation, password visibility, Remember me, optional
  login after registration, hiding after login and Popup opening/dismissal.
- **Fields:** labels and placeholders for email, password, full name and password
  confirmation. Email and password remain required by the RestGo API.
- **Texts:** English or Brazilian Portuguese presets and individually editable
  headings, subtitles, buttons, links, validation and success messages. Applying a
  language preset replaces the draft field labels and texts.
- **Styles:** assign compatible project Styles separately to Panel, Popup, title,
  subtitle, each field label/input, Remember me, submit button, password toggle,
  navigation/recovery links, close button and status/error messages. Each selector
  offers **None**, like the Inspector. Create/edit those Styles in the ordinary
  Styles workspace. Desktop/Mobile and Login/Registration/Recovery/New password
  previews use the same runtime projection without contacting RestGo.
- **Recovery:** enable the flow, automatically open email links, choose an optional
  return URL, and customize all request/reset headings, links, buttons and feedback.

New configurations use the compatible protected default Styles from the project,
including its Aurora/Prism/Flat/WebRAD palette, typography, borders, gradients,
shadows and interaction states. Text links/close actions initially use None;
assigning a Button style gives them that style's full appearance. Selected styles
own their paint and take precedence over the template's layout defaults, including
any explicit spacing or sizing utilities. There is no independent color/font
editor in the Login modal. Theme changes flow through the selected Styles.

Bindings use stable Style IDs, so renaming/editing a Style updates its usages.
Incompatible or missing IDs are rejected. Deleting a removable Style clears its
internal Login bindings to None, matching the normal Inspector behavior. Styles
can be shared across elements and Login placements without sharing form state.

Saved configurations without a `styles` map retain their earlier appearance until
the configuration modal is saved. Opening the editor previews the new Style
bindings; Save materializes the selected IDs and Cancel preserves the saved model.
The old `appearance` data remains readable for compatibility and compact layout.
The same style classes render in the Designer, configuration preview, compiled
Preview and exported applications; browser exports need no Tailwind compiler.

Panel uses the ordinary component layout and can be placed inside another Panel.
The primary action uses fit-content width and is horizontally centered as a whole
inside the panel, with its width capped at the available space. This placement
takes precedence over linked Style sizing and margins; its caption alignment
continues to follow the linked Button Style.
The compact defaults use 14 px type, 20 px panel padding on every side, 8 px field spacing and
36 px desktop fields before selected Style overrides. Remember me and the password visibility action share one
row. The card fits its content rather than stretching to the component height.
New placements use a 420 px fixed width and responsive fit-content height; the
initial saved bounds are 420 by 400 px before content measurement. Existing
placements retain their authored sizing. Long registration forms can scroll.
Narrow containers and touch devices retain 44 px controls and at least 16 px
input type. The original complete spacing preset is upgraded to these defaults;
independently customized spacing combinations are preserved.
Use stretch width or responsive anchors to fit the available page space; internal
fields fill the template width. Long registration forms scroll within its bounds.
Popup uses a native modal dialog with focus containment, Escape dismissal when
enabled, focus restoration, viewport width/height limits and mobile touch targets.
Its host reserves no page layout box at runtime. The Designer shows the editable
template representation for both presentations. Disable **Open Popup when the
component is shown** to open it explicitly from authored code.

Registration does not start a session by default: the component returns to the
login form, retains the email and displays its configured success message.
**Sign in after registration** explicitly requests a subsequent login; it may fail
if server activation or email confirmation is required. Account creation still
emits `OnRegister` before that login attempt. Email confirmation forms remain
separate from this component.

Remember me controls the RestGo session lifetime request. Browser persistence is
still determined by the project's Connection session-storage settings. Startup
awaits server-backed session restoration before treating the user as signed in.

## Account recovery

**Forgot your password?** opens an email-only form. The component calls
`RestGO.auth.resetPasswordForEmail(email, { url })` anonymously. The success message
does not disclose whether an account exists or promise delivery: SMTP and account
eligibility are controlled by the RestGo server. The compact form includes a link
back to sign-in and shares the existing Panel/Popup presentation and appearance.

By default, the email returns to the current application route and targets the
requesting component's stable ID. A configured return URL must be an absolute
HTTP(S) address without credentials or a reset token; it can target a different
application login page. The destination must host a Login with recovery enabled.
Configured destinations select the first eligible visible-page Login. Generated
applications must be served over HTTP(S), including when tested locally.

RestGo puts `reset_token` in the link fragment. The runtime captures and removes
the token from both fragment/query locations before authored page construction,
preserving unrelated query parameters. For Hash routing, the non-secret
`webrad_recovery_route` query marker retains the route while RestGo replaces the
fragment; the runtime restores it and removes the marker. The optional
`webrad_recovery_owner` marker selects one physical placement. A document-scoped
in-memory broker waits for that eligible placement rather than delivering the
secret to every Login instance. Conflicting or malformed tokens show the configured
invalid-link feedback. No token is written to the model, DOM, events or storage.

The **New password** form requires matching password/confirmation fields and uses
`RestGO.auth.confirmPasswordReset({ token, password })`. A successful response
clears credentials and returns to sign-in with confirmation feedback. It never
starts a session. Any existing identity is revalidated against the server.
Server password-policy, expired-link and reused-link errors appear inline;
network errors permit another explicit attempt. Closing/hiding the reset form,
changing its view/configuration, or disposing it discards its token. Open the email
link again or request another link to restart the reset.

With **Open recovery links automatically** disabled, call `openRecoveryLink()`
when ready to claim the pending link. It returns whether a link was handled and
keeps the token private. A separate authored integration can instead supply a
token directly to `showPasswordReset(token)`; do not save that token in project
properties. Recovery views can be previewed without a token or network activity
inside the configuration modal.

## Typed code and events

Each placement exposes a concrete `WebLogin` instance through both `Login1` and
`this.Login1`, including inside reusable components. Runtime mounting and generated
page code share that instance. State and DOM IDs are independent for every physical
placement; the authenticated RestGo session is shared across the application.

```ts
this.Login1.email = 'user@example.com';
this.Login1.showLogin();
this.Login1.showRegistration();
this.Login1.showRecovery();
this.Login1.close();

// Fully typed access to the template's real runtime controls.
this.Login1.controls.email.focus();
```

The public API includes `configuration`, `view`, `email`, `remember`, `busy`,
`open`, `controls`, `submit()`, `showLogin()`, `showRegistration()`, `show()`,
`hide()` and `close()`. Recovery adds `showRecovery()`, `showPasswordReset(token)`,
`openRecoveryLink()` and the readonly `hasRecoveryToken` flag. The runtime `view`
is `login`, `register`, `recovery` or `reset`; saved `initialView` accepts the first
three. Configuration replacement is validated and clears passwords and reset tokens.
`controls` references are transient: obtain them again after a view/configuration
change. Programmatic configuration changes affect the current runtime instance;
only the modal's Save action updates the Project Model through undo/redo.

`configuration.styles` is a typed `WebLoginStyleBindings` map. Its keys are listed
in `WEB_LOGIN_STYLE_SLOTS`; values are compatible Style IDs or null for None.
Omitted entries follow that slot's default Style policy. Generated runtime nodes
carry a resolved style catalogue, including compatible styles for authored
runtime configuration changes. A standalone `new WebLogin(element)` can receive
the same typed catalogue through `styleCatalog`; it contains compiled class names,
not editable project style definitions.

- `OnLogin`: `CustomEvent<WebLoginUserEvent>` with `user` and `restored`.
- `OnRegister`: `CustomEvent<WebLoginUserEvent>` after successful account creation.
- `OnRecoveryRequested`: `CustomEvent<WebLoginRecoveryEvent>` containing the
  submitted email after the server accepts the request.
- `OnPasswordReset`: emitted after successful reset, credential clearing and
  return to login. It contains no token or password and does not authenticate.
- `OnError`: `CustomEvent<WebLoginErrorEvent>` with operation, message, code and
  HTTP status. Operations include `recovery` and `reset`. RestGo server error
  messages are preserved with current passwords/tokens redacted if echoed.
- `OnViewChange`: `CustomEvent<WebLoginViewEvent>` with `view`.
- `OnClose`: explicit dismissal. Hiding after successful login does not emit it.

Use the Interact tab to create handlers and define post-login navigation:

```ts
public Login1Login(
  _sender: WebLogin,
  event: CustomEvent<WebLoginUserEvent>,
): void {
  if (event.detail.user.ativo) Navigate('/dashboard');
}
```

Import `WebLogin` and `WebLoginUserEvent` from `@webrad/runtime` when authoring a
handler manually. Events contain a readonly user projection, never credentials or
session tokens. Busy forms reject duplicate submissions, check confirmation before
registration, and clear passwords after requests, hiding and disposal. Designer
projections never authenticate or persist credentials.

## Persistence and verification

`WebLogin` stores a version-1 `props.configuration` object within project format v2.
The optional `styles` map stores internal element-to-project-Style references;
no CSS class names are persisted in these bindings. IDs/types are validated at the
project level, and style deletion clears matching references atomically across
pages and reusable definitions. The compiler retains compatible style CSS, fonts
and referenced assets and projects the catalogue into runtime-only node metadata.
The optional `recovery` block stores enablement, automatic-link behavior, the
return URL and localized texts. Older configurations receive these defaults
without changing configuration version 1 or project format v2.
The additional appearance end/heading/focus colors are optional for older saved
configurations and do not change the configuration or project format version.
Only behavior, field labels/placeholders, texts and appearance are saved. Unknown
settings and versions are rejected. Passwords, tokens, loaded users, busy state and
the currently selected runtime form are excluded. The runtime, Monaco declarations
and embedded compiler sources are synchronized through `npm run runtime:sources`.

The Electron smoke contract includes palette/configuration/save/F9, Panel and
native Popup behavior, mobile field geometry and an HTTP fixture exercising
registration, login, recovery requests, cleaned return links, password reset and
expired/reused links. Source implementation does not establish that these checks
passed, nor does the fixture establish compatibility with a particular live server.
