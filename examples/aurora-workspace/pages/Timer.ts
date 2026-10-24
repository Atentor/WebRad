import { bindAuroraSidebar } from '../units/AuroraSidebar';
import { TimerGenerated } from './Timer.generated';
import type { WebTimer, WebTimerEventDetail } from '@webrad/runtime';

export class Timer extends TimerGenerated {
  public ApplyTimer(): void {
    try {
      this.DemoTimer.time = Number(this.TimerInterval.value);
      this.DemoTimer.loop = this.TimerLoop.checked;
      this.TimerStatus.value =
        'Settings applied: ' +
        this.DemoTimer.time +
        ' ms, Loop ' +
        (this.DemoTimer.loop ? 'on' : 'off') +
        '.';
    } catch (error) {
      this.TimerStatus.value = error instanceof Error ? error.message : String(error);
    }
  }
  public StartTimer(): void {
    this.DemoTimer.Start();
  }
  public StopTimer(): void {
    this.DemoTimer.Stop();
  }
  public RestartTimer(): void {
    this.DemoTimer.Restart();
  }
  public TimerStarted(): void {
    this.TimerProgress.value = 0;
    this.TimerStatus.value = 'OnStart: timer running.';
  }
  public TimerTick(_sender: WebTimer, event: CustomEvent<WebTimerEventDetail>): void {
    this.TimerProgress.value = (event.detail.tick % 10) * 10;
    this.TimerStatus.value =
      'OnTimer: tick ' + event.detail.tick + ', interval ' + this.DemoTimer.time + ' ms.';
  }
  public TimerStopped(): void {
    this.TimerStatus.value = 'OnStop: stopped after ' + this.DemoTimer.tickCount + ' tick(s).';
  }

  private stopAuroraSidebar: (() => void) | undefined;
  public InitializeSidebar(): void {
    this.ReleaseSidebar();
    this.stopAuroraSidebar = bindAuroraSidebar(this.Navigation, this.PageContent);
  }
  public ReleaseSidebar(): void {
    this.DemoTimer.Stop();
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
