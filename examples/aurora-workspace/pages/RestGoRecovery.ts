import { RestGO, getRestGoClient } from '@webrad/runtime';
import type { WebPageLoginEventDetail, WebPageLogoutEventDetail } from '@webrad/runtime';
import { bindAuroraSidebar } from '../units/AuroraSidebar';
import { bindAuroraAccount, accountError } from '../units/AuroraAccount';
import { RestGoRecoveryGenerated } from './RestGoRecovery.generated';

export class RestGoRecovery extends RestGoRecoveryGenerated {
  private accountActive = false;
  private accountDisposed = false;
  private accountAvailable = false;
  private accountBusy = false;
  private accountRevision = 0;
  private stopSidebar: (() => void) | undefined;
  private stopAccount: (() => void) | undefined;

  private refreshAccountActions(): void {
    for (const button of [
      this.ConfirmEmailButton,
      this.RequestResetButton,
      this.ConfirmResetButton,
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

  public async ConfirmAccountEmail(): Promise<void> {
    await this.runAccount(
      async () => {
        const token = this.ConfirmationToken.value.trim();
        if (!token) throw new Error('Paste the email confirmation token received from RestGO.');
        const result = await RestGO.auth.confirmEmail(token);
        if (result.error) throw result.error;
        if (!result.data.success) throw new Error('The server did not confirm this email.');
        return 'Email confirmed. Return to sign in or reload your signed-in profile.';
      },
      () => {
        this.ConfirmationToken.value = '';
      },
    );
  }
  public async RequestPasswordRecovery(): Promise<void> {
    await this.runAccount(async () => {
      const email = this.RecoveryEmail.value.trim();
      if (!email) throw new Error('Enter the email of your account.');
      const url = this.RecoveryReturnUrl.value.trim();
      if (url && !['https:', 'http:'].includes(new URL(url).protocol))
        throw new Error('Use an HTTP or HTTPS return URL.');
      const result = await RestGO.auth.resetPasswordForEmail(email, url ? { url } : {});
      if (result.error) throw result.error;
      if (!result.data.success) throw new Error('The server did not accept this recovery request.');
      return 'Recovery request accepted. If the account is eligible, check its email for the reset token.';
    });
  }
  public async ConfirmPasswordRecovery(): Promise<void> {
    await this.runAccount(
      async () => {
        const token = this.ResetToken.value.trim();
        const password = this.ResetPassword.value;
        if (!token || !password) throw new Error('Enter the recovery token and new password.');
        if (password !== this.ResetConfirmation.value)
          throw new Error('The new passwords do not match.');
        const result = await RestGO.auth.confirmPasswordReset({ token, password });
        if (result.error) throw result.error;
        if (!result.data.success) throw new Error('The server did not confirm the password reset.');
        return 'Password reset confirmed. Return to sign in with the new password.';
      },
      () => {
        this.ResetToken.value = '';
        this.ResetPassword.value = '';
        this.ResetConfirmation.value = '';
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
    this.ConfirmationToken.value = '';
    this.ResetToken.value = '';
    this.ResetPassword.value = '';
    this.ResetConfirmation.value = '';

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
