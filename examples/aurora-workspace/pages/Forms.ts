import { bindAuroraSidebar } from '../units/AuroraSidebar';
import { FormsGenerated } from './Forms.generated';

export class Forms extends FormsGenerated {
  public ReviewProfile(): void {
    const name = this.NameEdit.value.trim();
    const email = this.EmailEdit.value.trim();
    if (!name || !email.includes('@') || !email.includes('.')) {
      this.FormStatus.value = 'Enter a name and a valid email to review your profile.';
      return;
    }
    this.SummaryName.caption = 'Name: ' + name;
    this.SummaryEmail.caption = 'Email: ' + email;
    this.SummaryTeam.caption = 'Team: ' + this.TeamCombo.value;
    this.SummaryPreferences.value =
      'Email updates: ' +
      (this.UpdatesCheck.checked ? 'yes' : 'no') +
      ' / Available: ' +
      (this.AvailableToggle.checked ? 'yes' : 'no');
    this.SummaryInterest.caption = 'Favorite feature: ' + this.InterestList.value;
    this.SummaryNotes.value = 'Notes: ' + this.NotesEdit.value;
    this.ProfilePopup.show();
    this.FormStatus.value =
      'Summary prepared from your current values. Nothing was sent to a server.';
  }

  public CloseSummary(): void {
    this.ProfilePopup.close();
  }

  public ResetProfile(): void {
    this.NameEdit.value = 'Alex Morgan';
    this.EmailEdit.value = 'alex@example.com';
    this.TeamCombo.selectedIndex = 1;
    this.UpdatesCheck.checked = true;
    this.AvailableToggle.checked = true;
    this.InterestList.selectedIndex = 0;
    this.NotesEdit.value = 'A workspace built with the Default component styles.';
    this.FormStatus.value = 'Example values restored.';
  }

  public PreferenceChanged(): void {
    this.FormStatus.value = 'Preferences changed. Review your profile to see the current values.';
  }

  private stopAuroraSidebar: (() => void) | undefined;

  public InitializeSidebar(): void {
    this.ReleaseSidebar();
    this.stopAuroraSidebar = bindAuroraSidebar(this.Navigation, this.PageContent);
  }

  public ReleaseSidebar(): void {
    this.stopAuroraSidebar?.();
    this.stopAuroraSidebar = undefined;
  }

  public override dispose(): void {
    this.ReleaseSidebar();
    super.dispose();
  }

  public OpenRestGoAccount(): void {
    Navigate('RestGoAccount');
  }
}
