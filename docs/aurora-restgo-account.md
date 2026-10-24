# Aurora Workspace: RestGO account flow

The **RestGO** menu is separate from the visual and Nonvisual demonstrations.
Its four pages use the browser SDK and the application's shared RestGO session.
The template includes no account credentials or sample authentication responses.

## Configure the connection

In the IDE, enable **RestGo integration > Connection** and enter your server's
base URL. Public registration must be enabled on that server for the signup
example; confirmation and recovery emails use its email configuration. The
account examples do not need an application API token or administrator secret.
Save the project and open Preview with **F9**.

Session persistence, storage and automatic renewal follow the existing
Connection settings. **Remember this session** passes the user's choice to the
SDK. Reloading Preview can restore credentials according to those settings;
closing Preview is separate from explicit logout.

## Follow the account flow

1. Open **RestGO > Registration / Sign in** (`RestGoAccount`). Enter the full
   name, email and matching passwords, then choose **Create account**. The
   server creates the account; signup does not create an authenticated session.
2. If email confirmation is required, use the email delivered by RestGO. Open
   **Email / Password recovery** (`RestGoRecovery`), paste its confirmation token
   and choose **Confirm email**. Return to sign in.
3. Enter the account email and password, choose whether to remember the session,
   and select **Sign in**. Open **Profile / Avatar** (`RestGoProfile`). The menu
   now shows the authenticated name, email and avatar. Clicking its user area
   opens the account section from any page.
4. **Reload profile** calls `getUser()` and shows server-confirmed account data.
   Select an image, then explicitly choose **Upload avatar**. **Remove avatar**
   removes it through the account endpoint. `USER_UPDATED` refreshes the visible
   profile and menu. Full name and email are read-only: this SDK does not expose
   general self-profile updates or self-account deletion.
5. Open **Session / Logout** (`RestGoSession`). **Validate session** calls
   `getSession()`, **Read CurrentUser** shows the last confirmed identity without
   a network request, and **Refresh session** demonstrates explicit credential
   renewal. Status shows expiration metadata and refresh availability, without
   JWT or refresh-token values.
6. Choose **Sign out**. After confirmed logout the menu shows Guest, the session
   becomes anonymous, and opening the protected profile returns to sign in.
   Temporary network or server failures are displayed and do not themselves
   represent a confirmed logout.

The shared session also authenticates the existing File/Video Upload example.
All pages place the shared **AuroraMenu** reusable; its authored class binds the
menu's user-click behavior and session identity separately for each placement.
The account section subscribes to `INITIAL_SESSION`, `SIGNED_IN`, `SIGNED_OUT`,
`SESSION_VALIDATED`, `TOKEN_REFRESHED` and `USER_UPDATED`. Page feedback also
demonstrates the page contract through `OnLogin`, `OnLogout` and
`OnUnauthenticated`; only the latter redirects the protected profile after a
confirmed anonymous state. Account-panel subscriptions are released when the
page is hidden; each reusable Menu subscription ends with its instance's disposal.

## Recover a password

Open **Email / Password recovery**, enter the email and choose **Send recovery
email**. The optional return URL is sent to RestGO; leaving it blank uses the
server default. Copy the reset token from the email, enter matching new
passwords and choose **Reset password**. Return to sign in with the new password.
This flow works without a current authenticated session.

Password and confirmation/reset-token fields start empty, are cleared after
their action and when leaving the page, and remain runtime values. They are not
saved into the Project Model, event log or template sources. These examples
call the configured server only when you invoke their actions, apart from the
SDK's session restoration/validation and renewal lifecycle.

The saved model, authored code and generated sources remain ordinary editable
project files. Implementation changes were made without running tests, smokes,
typecheck, builds or live account operations; those checks remain pending.
