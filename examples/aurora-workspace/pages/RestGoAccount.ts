import { RestGO, getRestGoClient } from '@webrad/runtime';
import type { WebPageLoginEventDetail, WebPageLogoutEventDetail } from '@webrad/runtime';
import { bindAuroraSidebar } from '../units/AuroraSidebar';
import { bindAuroraAccount, accountError } from '../units/AuroraAccount';
import { RestGoAccountGenerated } from './RestGoAccount.generated';

export class RestGoAccount extends RestGoAccountGenerated {
  private accountActive = false;
  private accountDisposed = false;
  private accountAvailable = false;
  private accountBusy = false;
  private accountRevision = 0;
  private stopSidebar: (() => void) | undefined;
  private stopAccount: (() => void) | undefined;

  private refreshAccountActions(): void {
    for (const button of [this.RegisterButton, this.LoginButton])
      button.enabled = this.accountAvailable && !this.accountBusy;
  }

  private async runAccount(action: () => Promise<string>, clear?: () => void): Promise<void> {
    if (!this.accountActive || this.accountDisposed || !this.accountAvailable || this.accountBusy)
      return;
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

  public OpenRestGoAccount(): void {
    Navigate('RestGoAccount');
  }
  public OpenRecovery(): void {
    Navigate('RestGoRecovery');
  }
  public OpenProfile(): void {
    Navigate('RestGoProfile');
  }
  public OpenSession(): void {
    Navigate('RestGoSession');
  }

  public RestGoPageLogin(_sender: this, event: CustomEvent<WebPageLoginEventDetail>): void {
    this.AccountStatus.value =
      'OnLogin: ' +
      event.detail.user.email +
      (event.detail.restored ? ' (restored session).' : ' (new sign in).');
  }
  public RestGoPageLogout(_sender: this, event: CustomEvent<WebPageLogoutEventDetail>): void {
    this.AccountStatus.value = 'OnLogout: ' + event.detail.user.email + '.';
  }
  public RestGoPageUnauthenticated(): void {
    this.AccountStatus.value =
      'OnUnauthenticated: the server confirmed that there is no signed-in session.';
  }

  public async RegisterAccount(): Promise<void> {
    await this.runAccount(
      async () => {
        const email = this.RegisterEmail.value.trim();
        const password = this.RegisterPassword.value;
        if (!email || !password) throw new Error('Enter an email and password.');
        if (password !== this.RegisterConfirmation.value)
          throw new Error('The passwords do not match.');
        const result = await RestGO.auth.signUp({
          email,
          password,
          fullName: this.RegisterName.value.trim(),
        });
        if (result.error) throw result.error;
        if (this.accountActive && !this.accountDisposed) this.LoginEmail.value = email;
        return (
          'Created account ' +
          result.data.email +
          '. Follow your server email confirmation instructions, then sign in. Registration did not start a session.'
        );
      },
      () => {
        this.RegisterPassword.value = '';
        this.RegisterConfirmation.value = '';
      },
    );
  }
  public async LoginAccount(): Promise<void> {
    await this.runAccount(
      async () => {
        if (!this.LoginEmail.value.trim() || !this.LoginPassword.value)
          throw new Error('Enter your email and password.');
        const result = await RestGO.login(
          this.LoginEmail.value.trim(),
          this.LoginPassword.value,
          this.RememberAccount.checked,
        );
        if (!result.sucess) throw result.error;
        return (
          'Signed in as ' +
          result.data.user.email +
          '. Open the protected profile or session page to continue.'
        );
      },
      () => {
        this.LoginPassword.value = '';
      },
    );
  }

  public InitializeSidebar(): void {
    this.ReleaseSidebar();
    this.accountActive = true;
    this.stopSidebar = bindAuroraSidebar(this.Navigation, this.PageContent);
    try {
      const client = getRestGoClient();
      this.accountAvailable = true;
      this.AccountStatus.value = 'RestGO Connection: ' + client.baseUrl;
      this.stopAccount = bindAuroraAccount(this.AccountSummary, this.AccountEvents);
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
    this.RegisterPassword.value = '';
    this.RegisterConfirmation.value = '';
    this.LoginPassword.value = '';

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
