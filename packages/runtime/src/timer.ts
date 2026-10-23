import {
  WebNonvisualComponent,
  type WebNonvisualComponentOptions,
  type WebComponentEventHandler,
} from './component.js';

export interface WebTimerConfiguration extends WebNonvisualComponentOptions {
  readonly time?: number;
  readonly loop?: boolean;
  readonly enabled?: boolean;
}

export interface WebTimerEventDetail {
  readonly tick: number;
}

/** Browser timer owned by one page or reusable placement. Time is in milliseconds. */
export class WebTimer extends WebNonvisualComponent {
  #time = 1000;
  #loop = true;
  #enabled = false;
  #disposed = false;
  #tick = 0;
  #run = 0;
  #handle: ReturnType<typeof setTimeout> | undefined;

  public constructor(configuration: WebTimerConfiguration = {}) {
    super(configuration);
    this.time = configuration.time ?? 1000;
    this.loop = configuration.loop ?? true;
    if (configuration.enabled === true) {
      this.#enabled = true;
      this.#schedule();
      const run = this.#run;
      // Generated scopes bind Interact handlers after constructing their services.
      queueMicrotask(() => {
        if (!this.#disposed && this.#enabled && this.#run === run) this.emit('OnStart');
      });
    }
  }

  public get time(): number {
    return this.#time;
  }
  /** Changing the interval while running schedules a fresh full interval. */
  public set time(value: number) {
    if (!Number.isInteger(value) || value < 1 || value > 2147483647)
      throw new RangeError('Timer time must be an integer between 1 and 2147483647 milliseconds.');
    this.#time = value;
    if (this.#enabled) this.#schedule();
  }
  public get loop(): boolean {
    return this.#loop;
  }
  public set loop(value: boolean) {
    this.#loop = value;
  }
  public get enabled(): boolean {
    return this.#enabled;
  }
  public set enabled(value: boolean) {
    if (value) this.Start();
    else this.Stop();
  }
  public get tickCount(): number {
    return this.#tick;
  }

  /** Starts a new run; calling Start while running has no effect. */
  public Start(): void {
    if (this.#disposed || this.#enabled) return;
    this.#run++;
    this.#tick = 0;
    this.#enabled = true;
    this.#schedule();
    this.emit('OnStart');
  }
  public Stop(): void {
    if (!this.#enabled) return;
    this.#run++;
    this.#enabled = false;
    clearTimeout(this.#handle);
    this.#handle = undefined;
    this.emit('OnStop');
  }
  public Restart(): void {
    this.Stop();
    this.Start();
  }
  public set onTimer(handler: WebComponentEventHandler<this> | null) {
    this.bindEvent('OnTimer', handler);
  }
  public set onStart(handler: WebComponentEventHandler<this> | null) {
    this.bindEvent('OnStart', handler);
  }
  public set onStop(handler: WebComponentEventHandler<this> | null) {
    this.bindEvent('OnStop', handler);
  }

  public override dispose(): void {
    this.#disposed = true;
    this.#enabled = false;
    clearTimeout(this.#handle);
    this.#handle = undefined;
    super.dispose();
  }

  #schedule(): void {
    clearTimeout(this.#handle);
    this.#handle = setTimeout(() => {
      this.#handle = undefined;
      if (!this.#enabled || this.#disposed) return;
      const once = !this.#loop;
      const run = this.#run;
      // Schedule before dispatch: handler Stop/Restart/time changes own the next deadline.
      if (once) this.#enabled = false;
      else this.#schedule();
      this.emit('OnTimer', { tick: ++this.#tick } satisfies WebTimerEventDetail);
      if (once && !this.#enabled && !this.#disposed && this.#run === run) this.emit('OnStop');
    }, this.#time);
  }
}
