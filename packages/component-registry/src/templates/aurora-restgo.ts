import { button, panel, paragraph, row, status, text, type DemoNode } from './demo-layout.js';

export const AURORA_RESTGO_PAGES = [
  'RestGoAccount',
  'RestGoRecovery',
  'RestGoProfile',
  'RestGoSession',
] as const;

function input(name: string, inputType = 'text', placeholder = ''): DemoNode {
  return { type: 'WebEdit', name, height: 40, props: { value: '', inputType, placeholder } };
}

function accountShell(
  heading: string,
  introduction: string,
  children: readonly DemoNode[],
): readonly DemoNode[] {
  return [
    text('AccountHeading', heading, 32),
    paragraph('AccountIntroduction', introduction),
    paragraph(
      'AccountConnectionHint',
      'Use your own RestGO server. Enable RestGo integration and configure Connection in the IDE. Public registration and account emails follow your server configuration.',
    ),
    status(
      'AccountStatus',
      'Open Preview with a configured RestGO Connection to use this example.',
      100,
    ),
    ...children,
    panel('AccountSessionPanel', [
      text('AccountSummaryHeading', 'CURRENT ACCOUNT / SESSION', 28),
      status('AccountSummary', 'No session loaded yet.', 144),
      text('AccountEventsHeading', 'AUTHENTICATION EVENTS', 28),
      status('AccountEvents', 'Authentication events appear here while this page is visible.', 144),
    ]),
  ];
}

export function restGoAccountControls(): readonly DemoNode[] {
  return accountShell(
    'RESTGO / ACCOUNT ACCESS',
    'Create a user, confirm its email when required by your server, then sign in. Registration does not sign you in automatically. The same session is shared with uploads and all other RestGO pages.',
    [
      panel('RegisterPanel', [
        text('RegisterHeading', 'CREATE AN ACCOUNT', 28),
        text('RegisterNameLabel', 'Full name', 26),
        input('RegisterName'),
        text('RegisterEmailLabel', 'Email', 26),
        input('RegisterEmail', 'email'),
        text('RegisterPasswordLabel', 'Password', 26),
        input('RegisterPassword', 'password'),
        text('RegisterConfirmationLabel', 'Confirm password', 26),
        input('RegisterConfirmation', 'password'),
        button('RegisterButton', 'Create account', 'RegisterAccount', 'add'),
      ]),
      panel('LoginPanel', [
        text('LoginHeading', 'SIGN IN', 28),
        text('LoginEmailLabel', 'Email', 26),
        input('LoginEmail', 'email'),
        text('LoginPasswordLabel', 'Password', 26),
        input('LoginPassword', 'password'),
        {
          type: 'WebCheckBox',
          name: 'RememberAccount',
          height: 36,
          props: { caption: 'Remember this session', checked: false },
        },
        paragraph(
          'RememberAccountHint',
          'Remember follows the session persistence and storage settings of your RestGO Connection.',
        ),
        button('LoginButton', 'Sign in', 'LoginAccount', 'user'),
      ]),
      row('AccountNavigation', [
        button('AccountRecoveryButton', 'Confirm email / recover', 'OpenRecovery', 'mail'),
        button('AccountProfileButton', 'Open protected profile', 'OpenProfile', 'user'),
        button('AccountSessionButton', 'Session and logout', 'OpenSession', 'refresh'),
      ]),
    ],
  );
}

export function restGoRecoveryControls(): readonly DemoNode[] {
  return accountShell(
    'RESTGO / EMAIL AND PASSWORD',
    'Use the token received in your account email to confirm your address or finish password recovery. These actions work without a signed-in session. Account email delivery depends on your RestGO server.',
    [
      panel('ConfirmEmailPanel', [
        text('ConfirmEmailHeading', 'CONFIRM EMAIL', 28),
        text('ConfirmationTokenLabel', 'Email confirmation token', 26),
        input('ConfirmationToken', 'password'),
        button('ConfirmEmailButton', 'Confirm email', 'ConfirmAccountEmail', 'check'),
      ]),
      panel('RequestResetPanel', [
        text('RequestResetHeading', 'REQUEST PASSWORD RECOVERY', 28),
        text('RecoveryEmailLabel', 'Account email', 26),
        input('RecoveryEmail', 'email'),
        text('RecoveryUrlLabel', 'Return URL (optional)', 26),
        input('RecoveryReturnUrl', 'url'),
        paragraph(
          'RecoveryUrlHint',
          'Leave the return URL empty to use the server default. Copy the reset token from the received email into the form below.',
        ),
        button('RequestResetButton', 'Send recovery email', 'RequestPasswordRecovery', 'mail'),
      ]),
      panel('ConfirmResetPanel', [
        text('ConfirmResetHeading', 'SET A NEW PASSWORD', 28),
        text('ResetTokenLabel', 'Password recovery token', 26),
        input('ResetToken', 'password'),
        text('ResetPasswordLabel', 'New password', 26),
        input('ResetPassword', 'password'),
        text('ResetConfirmationLabel', 'Confirm new password', 26),
        input('ResetConfirmation', 'password'),
        button('ConfirmResetButton', 'Reset password', 'ConfirmPasswordRecovery', 'check'),
      ]),
      button('RecoveryLoginButton', 'Return to sign in', 'OpenRestGoAccount', 'user'),
    ],
  );
}

export function restGoProfileControls(): readonly DemoNode[] {
  return accountShell(
    'RESTGO / PROFILE AND AVATAR',
    'This page uses OnUnauthenticated to return to sign in when the server confirms there is no valid session. Read the current profile and update or remove its avatar through the public account SDK.',
    [
      panel('ProfilePanel', [
        text('ProfileDetailsHeading', 'ACCOUNT PROFILE', 28),
        status('ProfileDetails', 'Sign in to read your profile.', 160),
        {
          type: 'WebImage',
          name: 'ProfileAvatar',
          width: 96,
          height: 96,
          item: { width: 'fixed', alignSelf: 'center' },
          props: { src: '', alt: 'Current account avatar', visible: false },
        },
        button('ReadProfileButton', 'Reload profile', 'ReadAccountProfile', 'refresh'),
      ]),
      panel('AvatarPanel', [
        text('AvatarHeading', 'CHANGE YOUR AVATAR', 28),
        paragraph(
          'AvatarHint',
          'Select an image locally, then choose Upload avatar to send it to your account. RestGO processes the image. Account name and email are shown as read-only by this SDK.',
        ),
        status('AvatarSelection', 'No image selected.'),
        row('AvatarActions', [
          button('ChooseAvatarButton', 'Select avatar image', 'ChooseAccountAvatar', 'image'),
          button('UploadAvatarButton', 'Upload avatar', 'UploadAccountAvatar', 'upload'),
          button('RemoveAvatarButton', 'Remove avatar', 'RemoveAccountAvatar', 'close'),
        ]),
      ]),
      row('ProfileNavigation', [
        button('ProfileSessionButton', 'Session and logout', 'OpenSession', 'refresh'),
        button('ProfileRecoveryButton', 'Email / password recovery', 'OpenRecovery', 'mail'),
      ]),
      {
        type: 'WebFileUpload',
        name: 'AvatarPicker',
        props: { accept: 'image/png,image/jpeg,image/webp', isPublic: false },
      },
    ],
  );
}

export function restGoSessionControls(): readonly DemoNode[] {
  return accountShell(
    'RESTGO / SESSION AND LOGOUT',
    'Validate the session with the server, inspect the last confirmed CurrentUser, renew credentials or sign out. Tokens are managed by the SDK and are never displayed by this example. Network errors do not represent a confirmed logout.',
    [
      panel('SessionActionsPanel', [
        text('SessionActionsHeading', 'SESSION LIFECYCLE', 28),
        row('SessionActions', [
          button('ValidateSessionButton', 'Validate session', 'ValidateAccountSession', 'check'),
          button('CurrentUserButton', 'Read CurrentUser', 'ReadCurrentAccount', 'user'),
          button('RefreshSessionButton', 'Refresh session', 'RefreshAccountSession', 'refresh'),
          button('LogoutAccountButton', 'Sign out', 'LogoutAccount', 'close'),
        ]),
        paragraph(
          'SessionLifecycleHint',
          'RestGO restores persisted credentials and refreshes expiring sessions automatically according to your Connection settings. These buttons demonstrate explicit validation and renewal. Closing Preview is separate from signing out.',
        ),
      ]),
      row('SessionNavigation', [
        button('SessionLoginButton', 'Registration / sign in', 'OpenRestGoAccount', 'user'),
        button('SessionProfileButton', 'Open protected profile', 'OpenProfile', 'user'),
      ]),
    ],
  );
}
