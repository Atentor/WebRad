import { RestGO, getRestGoClient } from '@webrad/runtime';
import type { WebPageLoginEventDetail, WebPageLogoutEventDetail } from '@webrad/runtime';
import { bindAuroraSidebar } from '../units/AuroraSidebar';
import { bindAuroraAccount, accountError } from '../units/AuroraAccount';
import { RestGoSessionGenerated } from './RestGoSession.generated';

export class RestGoSession extends RestGoSessionGenerated {
  private accountActive = false;
  private accountDisposed = false;
  private accountAvailable = false;
  private accountBusy = false;
  private accountRevision = 0;
  private stopSidebar: (() => void) | undefined;
  private stopAccount: (() => void) | undefined;

  private refreshAccountActions(): void {
    for (const button of [
      this.ValidateSessionButton,
      this.CurrentUserButton,
      this.RefreshSessionButton,
      this.LogoutAccountButton,
    ])
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

  public async ValidateAccountSession(): Promise<void> {
    await this.runAccount(async () => {
      const result = await RestGO.getSession();
      if (result.error) throw result.error;
      return result.data
        ? 'Session confirmed for ' +
            result.data.user.email +
            '. Expires at ' +
            result.data.expiresAt +
            '.'
        : 'No signed-in session.';
    });
  }
  public async ReadCurrentAccount(): Promise<void> {
    await this.runAccount(async () => {
      const user = RestGO.CurrentUser;
      return user
        ? 'CurrentUser (last confirmed snapshot): ' + JSON.stringify(user, null, 2)
        : 'CurrentUser is null. Use Validate session to ask the server.';
    });
  }
  public async RefreshAccountSession(): Promise<void> {
    await this.runAccount(async () => {
      const result = await RestGO.refreshSession();
      if (result.error) throw result.error;
      return (
        'Session renewed. New expiration: ' +
        result.data.expiresAt +
        '. Credential values remain managed by the SDK.'
      );
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
