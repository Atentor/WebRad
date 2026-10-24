import { RestGO, getRestGoClient } from '@webrad/runtime';
import type { WebPageLoginEventDetail, WebPageLogoutEventDetail } from '@webrad/runtime';
import type { RestGoUser } from '@webrad/restgo-sdk';
import { bindAuroraSidebar } from '../units/AuroraSidebar';
import { bindAuroraAccount, accountError } from '../units/AuroraAccount';
import { RestGoProfileGenerated } from './RestGoProfile.generated';

export class RestGoProfile extends RestGoProfileGenerated {
  private accountActive = false;
  private accountDisposed = false;
  private accountAvailable = false;
  private accountBusy = false;
  private accountRevision = 0;
  private stopSidebar: (() => void) | undefined;
  private stopAccount: (() => void) | undefined;

  private refreshAccountActions(): void {
    for (const button of [
      this.ReadProfileButton,
      this.ChooseAvatarButton,
      this.UploadAvatarButton,
      this.RemoveAvatarButton,
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
    Navigate('RestGoAccount');
  }

  private avatarRequest: AbortController | undefined;

  private renderAccountProfile(user: RestGoUser | null): void {
    this.ProfileAvatar.visible = Boolean(user?.avatarUrl);
    if (!user) {
      this.ProfileAvatar.src = '';
      this.ProfileDetails.value = 'No signed-in user.';
      return;
    }
    if (user.avatarUrl)
      this.ProfileAvatar.src = new URL(user.avatarUrl, getRestGoClient().baseUrl + '/').href;
    this.ProfileDetails.value =
      'Name: ' +
      user.fullName +
      '\nEmail: ' +
      user.email +
      '\nID: ' +
      user.id +
      '\nActive: ' +
      user.active +
      ' / Email confirmed: ' +
      user.emailConfirmed;
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
      if (this.accountActive && !this.accountDisposed)
        this.AvatarSelection.value =
          selection.name +
          ' / ' +
          selection.size +
          ' bytes. Selected locally; choose Upload avatar to send it.';
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
        const result = await RestGO.auth.uploadAvatar(file, {
          name: file.name,
          signal: controller.signal,
        });
        if (result.error) throw result.error;
        return 'Avatar updated on RestGO. USER_UPDATED refreshes the profile and menu.';
      } finally {
        if (this.avatarRequest === controller) this.avatarRequest = undefined;
      }
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
      } finally {
        if (this.avatarRequest === controller) this.avatarRequest = undefined;
      }
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
      this.stopAccount = bindAuroraAccount(this.AccountSummary, this.AccountEvents, (user) =>
        this.renderAccountProfile(user),
      );
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

    this.avatarRequest?.abort();
    this.AvatarPicker.Clear();
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
