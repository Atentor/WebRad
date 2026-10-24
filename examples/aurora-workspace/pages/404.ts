import { bindAuroraSidebar } from '../units/AuroraSidebar';
import { Page404Generated } from './404.generated';

export class Page404 extends Page404Generated {
  public ReturnHome(): void {
    Navigate('index');
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
