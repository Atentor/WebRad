import { bindAuroraSidebar } from '../units/AuroraSidebar';
import { indexGenerated } from './index.generated';

export class index extends indexGenerated {
  public OpenForm(): void {
    Navigate('Forms');
  }
  public OpenData(): void {
    Navigate('Data');
  }
  public OpenMedia(): void {
    Navigate('Media');
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
