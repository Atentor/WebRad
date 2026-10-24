function accountPage(
  name: string,
  actions: readonly string[],
  body: string,
  secrets: readonly string[] = [],
  profile = false,
): string {
  return `import { RestGO, getRestGoClient } from '@webrad/runtime';
import type { WebPageLoginEventDetail, WebPageLogoutEventDetail } from '@webrad/runtime';
${profile ? "import type { RestGoUser } from '@webrad/restgo-sdk';\n" : ''}import { bindAuroraSidebar } from '../units/AuroraSidebar';
import { bindAuroraAccount, accountError } from '../units/AuroraAccount';
import { ${name}Generated } from './${name}.generated';

export class ${name} extends ${name}Generated {
  private accountActive = false;
  private accountDisposed = false;
  private accountAvailable = false;
  private accountBusy = false;
  private accountRevision = 0;
  private stopSidebar: (() => void) | undefined;
  private stopAccount: (() => void) | undefined;

  private refreshAccountActions(): void {
    for (const button of [${actions.map((action) => `this.${action}`).join(', ')}])
      button.enabled = this.accountAvailable && !this.accountBusy;
  }

  private async runAccount(action: () => Promise<string>, clear?: () => void): Promise<void> {
    if (!this.accountActive || this.accountDisposed || !this.accountAvailable || this.accountBusy) return;
    const revision = this.accountRevision;
    this.accountBusy = true;
    this.refreshAccountActions();
    this.AccountStatus.value = 'Working...';
    try {
      const message = await action();
      if (this.accountActive && !this.accountDisposed && revision === this.accountRevision)
        this.AccountStatus.value = message;
    } catch (error) {
      if (this.accountActive && !this.accountDisposed && revision === this.accountRevision)
        this.AccountStatus.value = accountError(error);
    } finally {
      this.accountBusy = false;
      if (!this.accountDisposed) {
        clear?.();
        if (this.accountActive) this.refreshAccountActions();
      }
    }
  }

  public OpenRestGoAccount(): void { Navigate('RestGoAccount'); }
  public OpenRecovery(): void { Navigate('RestGoRecovery'); }
  public OpenProfile(): void { Navigate('RestGoProfile'); }
  public OpenSession(): void { Navigate('RestGoSession'); }

  public RestGoPageLogin(_sender: this, event: CustomEvent<WebPageLoginEventDetail>): void {
    this.AccountStatus.value = 'OnLogin: ' + event.detail.user.email + (event.detail.restored ? ' (restored session).' : ' (new sign in).');
  }
  public RestGoPageLogout(_sender: this, event: CustomEvent<WebPageLogoutEventDetail>): void {
    this.AccountStatus.value = 'OnLogout: ' + event.detail.user.email + '.';
  }
  public RestGoPageUnauthenticated(): void {
    ${profile ? "Navigate('RestGoAccount');" : "this.AccountStatus.value = 'OnUnauthenticated: the server confirmed that there is no signed-in session.';"}
  }
${body}
  public InitializeSidebar(): void {
    this.ReleaseSidebar();
    this.accountActive = true;
    this.stopSidebar = bindAuroraSidebar(this.Navigation, this.PageContent);
    try {
      const client = getRestGoClient();
      this.accountAvailable = true;
      this.AccountStatus.value = 'RestGO Connection: ' + client.baseUrl;
      this.stopAccount = bindAuroraAccount(this.AccountSummary, this.AccountEvents${profile ? ', (user) => this.renderAccountProfile(user)' : ''});
    } catch (error) {
      this.accountAvailable = false;
      this.AccountStatus.value = accountError(error);
      this.AccountSummary.value = 'Configure RestGo integration > Connection to load an account.';
    }
    this.refreshAccountActions();
  }
  public ReleaseSidebar(): void {
    this.accountActive = false;
    this.accountRevision++;
    ${secrets.map((secret) => `this.${secret}.value = '';`).join('\n    ')}
    ${profile ? 'this.avatarRequest?.abort(); this.AvatarPicker.Clear();' : ''}
    this.stopAccount?.();
    this.stopAccount = undefined;
    this.stopSidebar?.();
    this.stopSidebar = undefined;
  }
  public override dispose(): void {
    this.accountDisposed = true;
    this.ReleaseSidebar();
    super.dispose();
  }
}
`;
}

export const AURORA_RESTGO_SOURCES: Readonly<Record<string, string>> = {
  'pages/RestGoAccount.ts': accountPage(
    'RestGoAccount',
    ['RegisterButton', 'LoginButton'],
    `
  public async RegisterAccount(): Promise<void> {
    await this.runAccount(async () => {
      const email = this.RegisterEmail.value.trim();
      const password = this.RegisterPassword.value;
      if (!email || !password) throw new Error('Enter an email and password.');
      if (password !== this.RegisterConfirmation.value) throw new Error('The passwords do not match.');
      const result = await RestGO.auth.signUp({ email, password, fullName: this.RegisterName.value.trim() });
      if (result.error) throw result.error;
      if (this.accountActive && !this.accountDisposed) this.LoginEmail.value = email;
      return 'Created account ' + result.data.email + '. Follow your server email confirmation instructions, then sign in. Registration did not start a session.';
    }, () => { this.RegisterPassword.value = ''; this.RegisterConfirmation.value = ''; });
  }
  public async LoginAccount(): Promise<void> {
    await this.runAccount(async () => {
      if (!this.LoginEmail.value.trim() || !this.LoginPassword.value) throw new Error('Enter your email and password.');
      const result = await RestGO.login(this.LoginEmail.value.trim(), this.LoginPassword.value, this.RememberAccount.checked);
      if (!result.sucess) throw result.error;
      return 'Signed in as ' + result.data.user.email + '. Open the protected profile or session page to continue.';
    }, () => { this.LoginPassword.value = ''; });
  }
`,
    ['RegisterPassword', 'RegisterConfirmation', 'LoginPassword'],
  ),

  'pages/RestGoRecovery.ts': accountPage(
    'RestGoRecovery',
    ['ConfirmEmailButton', 'RequestResetButton', 'ConfirmResetButton'],
    `
  public async ConfirmAccountEmail(): Promise<void> {
    await this.runAccount(async () => {
      const token = this.ConfirmationToken.value.trim();
      if (!token) throw new Error('Paste the email confirmation token received from RestGO.');
      const result = await RestGO.auth.confirmEmail(token);
      if (result.error) throw result.error;
      if (!result.data.success) throw new Error('The server did not confirm this email.');
      return 'Email confirmed. Return to sign in or reload your signed-in profile.';
    }, () => { this.ConfirmationToken.value = ''; });
  }
  public async RequestPasswordRecovery(): Promise<void> {
    await this.runAccount(async () => {
      const email = this.RecoveryEmail.value.trim();
      if (!email) throw new Error('Enter the email of your account.');
      const url = this.RecoveryReturnUrl.value.trim();
      if (url && !['https:', 'http:'].includes(new URL(url).protocol)) throw new Error('Use an HTTP or HTTPS return URL.');
      const result = await RestGO.auth.resetPasswordForEmail(email, url ? { url } : {});
      if (result.error) throw result.error;
      if (!result.data.success) throw new Error('The server did not accept this recovery request.');
      return 'Recovery request accepted. If the account is eligible, check its email for the reset token.';
    });
  }
  public async ConfirmPasswordRecovery(): Promise<void> {
    await this.runAccount(async () => {
      const token = this.ResetToken.value.trim();
      const password = this.ResetPassword.value;
      if (!token || !password) throw new Error('Enter the recovery token and new password.');
      if (password !== this.ResetConfirmation.value) throw new Error('The new passwords do not match.');
      const result = await RestGO.auth.confirmPasswordReset({ token, password });
      if (result.error) throw result.error;
      if (!result.data.success) throw new Error('The server did not confirm the password reset.');
      return 'Password reset confirmed. Return to sign in with the new password.';
    }, () => { this.ResetToken.value = ''; this.ResetPassword.value = ''; this.ResetConfirmation.value = ''; });
  }
`,
    ['ConfirmationToken', 'ResetToken', 'ResetPassword', 'ResetConfirmation'],
  ),

  'pages/RestGoProfile.ts': accountPage(
    'RestGoProfile',
    ['ReadProfileButton', 'ChooseAvatarButton', 'UploadAvatarButton', 'RemoveAvatarButton'],
    `
  private avatarRequest: AbortController | undefined;

  private renderAccountProfile(user: RestGoUser | null): void {
    this.ProfileAvatar.visible = Boolean(user?.avatarUrl);
    if (!user) {
      this.ProfileAvatar.src = '';
      this.ProfileDetails.value = 'No signed-in user.';
      return;
    }
    if (user.avatarUrl) this.ProfileAvatar.src = new URL(user.avatarUrl, getRestGoClient().baseUrl + '/').href;
    this.ProfileDetails.value = 'Name: ' + user.fullName + '\\nEmail: ' + user.email + '\\nID: ' + user.id + '\\nActive: ' + user.active + ' / Email confirmed: ' + user.emailConfirmed;
  }
  public async ReadAccountProfile(): Promise<void> {
    await this.runAccount(async () => {
      const result = await RestGO.getUser();
      if (result.error) throw result.error;
      if (!result.data) throw new Error('Sign in to read your profile.');
      if (this.accountActive && !this.accountDisposed) this.renderAccountProfile(result.data);
      return 'Profile loaded from the server.';
    });
  }
  public async ChooseAccountAvatar(): Promise<void> {
    await this.runAccount(async () => {
      const selection = await this.AvatarPicker.OpenFile();
      if (!selection) return 'Image selection cancelled.';
      if (this.accountActive && !this.accountDisposed) this.AvatarSelection.value = selection.name + ' / ' + selection.size + ' bytes. Selected locally; choose Upload avatar to send it.';
      return 'Avatar image selected locally.';
    });
  }
  public async UploadAccountAvatar(): Promise<void> {
    await this.runAccount(async () => {
      const file = this.AvatarPicker.selectedFile;
      if (!file) throw new Error('Select an avatar image first.');
      const controller = new AbortController();
      this.avatarRequest = controller;
      try {
        const result = await RestGO.auth.uploadAvatar(file, { name: file.name, signal: controller.signal });
        if (result.error) throw result.error;
        return 'Avatar updated on RestGO. USER_UPDATED refreshes the profile and menu.';
      } finally { if (this.avatarRequest === controller) this.avatarRequest = undefined; }
    });
  }
  public async RemoveAccountAvatar(): Promise<void> {
    await this.runAccount(async () => {
      const controller = new AbortController();
      this.avatarRequest = controller;
      try {
        const result = await RestGO.auth.deleteAvatar({ signal: controller.signal });
        if (result.error) throw result.error;
        return 'Avatar removed from the account.';
      } finally { if (this.avatarRequest === controller) this.avatarRequest = undefined; }
    });
  }
`,
    [],
    true,
  ),

  'pages/RestGoSession.ts': accountPage(
    'RestGoSession',
    ['ValidateSessionButton', 'CurrentUserButton', 'RefreshSessionButton', 'LogoutAccountButton'],
    `
  public async ValidateAccountSession(): Promise<void> {
    await this.runAccount(async () => {
      const result = await RestGO.getSession();
      if (result.error) throw result.error;
      return result.data ? 'Session confirmed for ' + result.data.user.email + '. Expires at ' + result.data.expiresAt + '.' : 'No signed-in session.';
    });
  }
  public async ReadCurrentAccount(): Promise<void> {
    await this.runAccount(async () => {
      const user = RestGO.CurrentUser;
      return user ? 'CurrentUser (last confirmed snapshot): ' + JSON.stringify(user, null, 2) : 'CurrentUser is null. Use Validate session to ask the server.';
    });
  }
  public async RefreshAccountSession(): Promise<void> {
    await this.runAccount(async () => {
      const result = await RestGO.refreshSession();
      if (result.error) throw result.error;
      return 'Session renewed. New expiration: ' + result.data.expiresAt + '. Credential values remain managed by the SDK.';
    });
  }
  public async LogoutAccount(): Promise<void> {
    await this.runAccount(async () => {
      const result = await RestGO.logout();
      if (result.error) throw result.error;
      if (!result.data.success) throw new Error('The server did not confirm logout.');
      return 'Signed out. The account menu and session events now reflect the anonymous state.';
    });
  }
`,
  ),

  'units/AuroraAccount.ts': `import { getRestGoClient, RestGoNotConfiguredError } from '@webrad/runtime';
import type { WebMenu, WebTextArea } from '@webrad/runtime';
import type { RestGoSession, RestGoUser } from '@webrad/restgo-sdk';

export function accountError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function avatarUrl(value: string | null, baseUrl: string): string {
  return value ? new URL(value, baseUrl + '/').href : '';
}

/** Reflect only server-confirmed identity; never render credential values. */
export function bindRestGoMenu(menu: WebMenu): () => void {
  try {
    const client = getRestGoClient();
    let active = true;
    const subscription = client.onAuthStateChange((_event, session) => {
      if (!active) return;
      const user = session?.user;
      menu.user = {
        ...menu.user, visible: true, name: user ? (user.fullName || user.email) : 'Guest',
        description: user?.email ?? 'Sign in to RestGO', avatar: avatarUrl(user?.avatarUrl ?? null, client.baseUrl), status: 'none',
      };
    });
    return () => { active = false; subscription.unsubscribe(); };
  } catch (error) {
    if (!(error instanceof RestGoNotConfiguredError)) throw error;
    return () => {};
  }
}

/** The subscription is owned by the visible page, independently of the SDK session. */
export function bindAuroraAccount(summary: WebTextArea, events: WebTextArea, onUser?: (user: RestGoUser | null) => void): () => void {
  const client = getRestGoClient();
  let active = true;
  let revision = 0;
  const history: string[] = [];
  const render = (event: string, session: RestGoSession | null): void => {
    if (!active) return;
    history.push(new Date().toLocaleTimeString() + ' ' + event);
    events.value = history.slice(-12).join('\\n');
    const user = session?.user;
    summary.value = session && user
      ? 'Name: ' + user.fullName + '\\nEmail: ' + user.email + '\\nID: ' + user.id + '\\nActive: ' + user.active + ' / Email confirmed: ' + user.emailConfirmed + '\\nSession expires: ' + session.expiresAt + '\\nRefresh available: ' + Boolean(session.refreshToken)
      : 'No signed-in session. Register or sign in to continue.';
    onUser?.(user ?? null);
  };
  const subscription = client.onAuthStateChange((event, session) => {
    if (event !== 'INITIAL_SESSION') revision++;
    render(event, session);
  });
  const requestedRevision = revision;
  void client.getSession().then((result) => {
    if (!active || revision !== requestedRevision) return;
    if (result.error) summary.value = 'Session verification failed: ' + accountError(result.error);
    else render('SESSION_CHECK', result.data);
  }).catch((error: unknown) => {
    if (active) summary.value = 'Session verification failed: ' + accountError(error);
  });
  return () => { active = false; subscription.unsubscribe(); };
}
`,
};
