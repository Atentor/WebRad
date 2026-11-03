import { createWebRadIconElement } from './icons.js';
import { parseDateValue, serializeDateValue, type WebDateMode } from './date-value.js';

interface DateCalendarConfiguration {
  readonly mode: WebDateMode;
  readonly showSeconds: boolean;
  readonly value: string;
  readonly min: string;
  readonly max: string;
  readonly editable: boolean;
}

interface DateCalendarOptions {
  readonly host: HTMLElement;
  readonly anchor: HTMLButtonElement;
  readonly read: () => DateCalendarConfiguration;
  readonly commit: (value: string) => void;
}

let nextCalendarId = 0;
const MIN_CALENDAR_WIDTH = 260;
const pad = (value: number): string => String(value).padStart(2, '0');

function calendarDay(year: number, month: number, day: number): Date {
  const date = new Date(0);
  date.setHours(12, 0, 0, 0);
  date.setFullYear(year, month, day);
  return date;
}

/** Component-owned top-layer calendar matching the date field's measured bounds. */
export class DateCalendar {
  readonly #options: DateCalendarOptions;
  readonly #popup: HTMLDivElement;
  readonly #disposers: (() => void)[] = [];
  readonly #locale: string;
  readonly #weekStart: number;
  #open = false;
  #nativePopover = false;
  #sourceKey = '';
  #year = 1;
  #month = 0;
  #day = '';
  #time = '00:00';

  public constructor(options: DateCalendarOptions) {
    this.#options = options;
    const document = options.host.ownerDocument;
    try {
      this.#locale = new Intl.DateTimeFormat(
        document.documentElement.lang || document.defaultView?.navigator.language,
      ).resolvedOptions().locale;
    } catch {
      this.#locale = 'en';
    }
    const locale = new Intl.Locale(this.#locale) as Intl.Locale & {
      readonly weekInfo?: { readonly firstDay: number };
      readonly getWeekInfo?: () => { readonly firstDay: number };
    };
    this.#weekStart = (locale.getWeekInfo?.().firstDay ?? locale.weekInfo?.firstDay ?? 7) % 7;
    this.#popup = document.createElement('div');
    this.#popup.id = `wr-date-calendar-${String(++nextCalendarId)}`;
    this.#popup.className = 'wr-date-calendar';
    this.#popup.hidden = true;
    this.#popup.setAttribute('role', 'dialog');
    this.#popup.setAttribute('aria-label', this.#text('Calendar', 'Calendário'));
    this.#popup.setAttribute('popover', 'manual');
    options.host.append(this.#popup);
    options.anchor.setAttribute('aria-haspopup', 'dialog');
    options.anchor.setAttribute('aria-controls', this.#popup.id);
    options.anchor.setAttribute('aria-expanded', 'false');
    this.#listen(
      document,
      'pointerdown',
      (event) => {
        if (
          this.#open &&
          event.target instanceof Node &&
          !this.#popup.contains(event.target) &&
          !options.anchor.contains(event.target)
        )
          this.close(false);
      },
      true,
    );
    this.#listen(document, 'focusin', (event) => {
      if (
        this.#open &&
        event.target instanceof Node &&
        !this.#popup.contains(event.target) &&
        !options.anchor.contains(event.target)
      )
        this.close(false);
    });
    this.#listen(
      document,
      'keydown',
      (event) => {
        if (this.#open && event instanceof KeyboardEvent && event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          this.close();
        }
      },
      true,
    );
    this.#listen(
      document,
      'scroll',
      () => {
        if (this.#open) this.#position();
      },
      true,
    );
    if (document.defaultView !== null) {
      this.#listen(document.defaultView, 'resize', () => {
        if (this.#open) this.#position();
      });
    }
    this.#listen(this.#popup, 'keydown', (event) => this.#navigate(event));
    // Draft controls belong to the calendar. Only a committed value emits the
    // component's public Input/Change pair.
    this.#listen(this.#popup, 'input', (event) => event.stopPropagation());
    this.#listen(this.#popup, 'change', (event) => event.stopPropagation());
    const viewport = document.defaultView?.visualViewport;
    if (viewport !== null && viewport !== undefined) {
      this.#listen(viewport, 'resize', () => {
        if (this.#open) this.#position();
      });
      this.#listen(viewport, 'scroll', () => {
        if (this.#open) this.#position();
      });
    }
  }

  #text(english: string, portuguese: string): string {
    return this.#locale.startsWith('pt') ? portuguese : english;
  }

  #listen(target: EventTarget, name: string, callback: EventListener, capture = false): void {
    target.addEventListener(name, callback, capture);
    this.#disposers.push(() => target.removeEventListener(name, callback, capture));
  }

  public get open(): boolean {
    return this.#open;
  }

  public show(): boolean {
    const { host, anchor } = this.#options;
    if (
      !this.#options.read().editable ||
      !host.isConnected ||
      host.closest('[inert], [hidden]') !== null
    )
      return false;
    if (this.#open) return true;
    this.#reset();
    this.#render();
    this.#popup.hidden = false;
    this.#nativePopover = typeof this.#popup.showPopover === 'function';
    if (this.#nativePopover) {
      try {
        this.#popup.showPopover();
      } catch {
        this.#nativePopover = false;
      }
    }
    if (!this.#nativePopover) {
      this.#popup.removeAttribute('popover');
      host.ownerDocument.body.append(this.#popup);
    }
    this.#open = true;
    anchor.setAttribute('aria-expanded', 'true');
    this.#position();
    this.#focusDay(this.#day);
    return true;
  }

  public close(restoreFocus = true): void {
    if (!this.#open) return;
    this.#open = false;
    if (this.#nativePopover && this.#popup.matches(':popover-open')) this.#popup.hidePopover();
    this.#popup.hidden = true;
    this.#options.anchor.setAttribute('aria-expanded', 'false');
    if (restoreFocus) {
      if (!this.#options.anchor.hidden) this.#options.anchor.focus();
      else this.#options.host.querySelector<HTMLInputElement>('.wr-date-input')?.focus();
    }
  }

  public refresh(): void {
    if (!this.#open) return;
    if (!this.#options.read().editable) {
      this.close(false);
      return;
    }
    const key = JSON.stringify(this.#options.read());
    if (key !== this.#sourceKey) {
      this.#reset();
      this.#render();
    }
    this.#position();
  }

  #reset(): void {
    const configuration = this.#options.read();
    this.#sourceKey = JSON.stringify(configuration);
    const selected = parseDateValue(configuration.value);
    const current = selected ?? new Date();
    this.#year = current.getFullYear();
    this.#month = current.getMonth();
    this.#day = serializeDateValue(current, 'date', false);
    this.#time =
      selected === null ? '00:00' : `${pad(current.getHours())}:${pad(current.getMinutes())}`;
    if (configuration.showSeconds) this.#time += `:${pad(selected?.getSeconds() ?? 0)}`;
  }

  #position(): void {
    const { host } = this.#options;
    const view = host.ownerDocument.defaultView;
    if (view === null) return;
    const bounds = host.getBoundingClientRect();
    const viewport = view.visualViewport;
    const leftEdge = (viewport?.offsetLeft ?? 0) + 8;
    const topEdge = (viewport?.offsetTop ?? 0) + 8;
    const rightEdge = (viewport?.offsetLeft ?? 0) + (viewport?.width ?? view.innerWidth) - 8;
    const bottomEdge = (viewport?.offsetTop ?? 0) + (viewport?.height ?? view.innerHeight) - 8;
    this.#popup.style.maxWidth = `${String(Math.max(0, rightEdge - leftEdge))}px`;
    this.#popup.style.width = `${String(Math.max(MIN_CALENDAR_WIDTH, bounds.width))}px`;
    this.#popup.style.maxHeight = `${String(Math.max(0, bottomEdge - topEdge))}px`;
    const popup = this.#popup.getBoundingClientRect();
    const left = Math.max(leftEdge, Math.min(bounds.left, rightEdge - popup.width));
    const below = bounds.bottom + 4;
    const top =
      below + popup.height <= bottomEdge ? below : Math.max(topEdge, bounds.top - popup.height - 4);
    this.#popup.style.left = `${String(left)}px`;
    this.#popup.style.top = `${String(top)}px`;
    this.#popup.style.maxHeight = `${String(Math.max(0, bottomEdge - top))}px`;
  }

  #limit(value: string): string {
    const date = parseDateValue(value);
    const configuration = this.#options.read();
    return date === null
      ? ''
      : serializeDateValue(date, configuration.mode, configuration.showSeconds);
  }

  #dayAllowed(day: string): boolean {
    const configuration = this.#options.read();
    const min = this.#limit(configuration.min).slice(0, 10);
    const max = this.#limit(configuration.max).slice(0, 10);
    return (min === '' || day >= min) && (max === '' || day <= max);
  }

  #value(): string | null {
    const configuration = this.#options.read();
    const value = configuration.mode === 'date' ? this.#day : `${this.#day}T${this.#time}`;
    const date = parseDateValue(value);
    if (date === null) return null;
    const canonical = serializeDateValue(date, configuration.mode, configuration.showSeconds);
    const min = this.#limit(configuration.min);
    const max = this.#limit(configuration.max);
    return (min !== '' && canonical < min) || (max !== '' && canonical > max) ? null : canonical;
  }

  #commit(value: string): void {
    this.close();
    this.#options.commit(value);
  }

  #button(
    label: string,
    action: () => void,
    icon?: 'chevron-left' | 'chevron-right',
  ): HTMLButtonElement {
    const button = this.#popup.ownerDocument.createElement('button');
    button.type = 'button';
    button.setAttribute('aria-label', label);
    if (icon === undefined) button.textContent = label;
    else button.append(createWebRadIconElement(this.#popup.ownerDocument, icon));
    button.onclick = (event) => {
      event.stopPropagation();
      action();
    };
    return button;
  }

  #moveMonth(offset: number): void {
    const month = calendarDay(this.#year, this.#month + offset, 1);
    if (month.getFullYear() < 1 || month.getFullYear() > 9999) return;
    this.#year = month.getFullYear();
    this.#month = month.getMonth();
    this.#render();
    this.#position();
    this.#popup
      .querySelector<HTMLButtonElement>(
        offset < 0
          ? '.wr-date-calendar-header button:first-child'
          : '.wr-date-calendar-header button:last-child',
      )
      ?.focus({ preventScroll: true });
  }

  #render(): void {
    const document = this.#popup.ownerDocument;
    const configuration = this.#options.read();
    const header = document.createElement('div');
    header.className = 'wr-date-calendar-header';
    const previous = this.#button(
      this.#text('Previous month', 'Mês anterior'),
      () => this.#moveMonth(-1),
      'chevron-left',
    );
    previous.disabled = this.#year === 1 && this.#month === 0;
    const next = this.#button(
      this.#text('Next month', 'Próximo mês'),
      () => this.#moveMonth(1),
      'chevron-right',
    );
    next.disabled = this.#year === 9999 && this.#month === 11;
    const month = document.createElement('select');
    month.setAttribute('aria-label', this.#text('Month', 'Mês'));
    for (let index = 0; index < 12; index++) {
      const option = document.createElement('option');
      option.value = String(index);
      option.textContent = new Intl.DateTimeFormat(this.#locale, { month: 'long' }).format(
        calendarDay(2020, index, 1),
      );
      month.append(option);
    }
    month.value = String(this.#month);
    month.onchange = () => {
      this.#month = Number(month.value);
      this.#render();
      this.#position();
      this.#popup.querySelector('select')?.focus();
    };
    const year = document.createElement('input');
    year.type = 'number';
    year.min = '1';
    year.max = '9999';
    year.step = '1';
    year.value = String(this.#year);
    year.setAttribute('aria-label', this.#text('Year', 'Ano'));
    year.onchange = () => {
      const value = Number(year.value);
      if (!Number.isInteger(value) || value < 1 || value > 9999) {
        year.value = String(this.#year);
        return;
      }
      this.#year = value;
      this.#render();
      this.#position();
      this.#popup.querySelector<HTMLInputElement>('.wr-date-calendar-header input')?.focus();
    };
    header.append(previous, month, year, next);
    const grid = document.createElement('div');
    grid.className = 'wr-date-calendar-grid';
    grid.setAttribute('role', 'grid');
    grid.setAttribute(
      'aria-label',
      new Intl.DateTimeFormat(this.#locale, { month: 'long', year: 'numeric' }).format(
        calendarDay(this.#year, this.#month, 1),
      ),
    );
    const weekdays = document.createElement('div');
    weekdays.className = 'wr-date-calendar-week';
    weekdays.setAttribute('role', 'row');
    for (let index = 0; index < 7; index++) {
      const heading = document.createElement('span');
      heading.setAttribute('role', 'columnheader');
      const date = calendarDay(2023, 0, 1 + ((index + this.#weekStart) % 7));
      heading.textContent = new Intl.DateTimeFormat(this.#locale, { weekday: 'narrow' }).format(
        date,
      );
      heading.setAttribute(
        'aria-label',
        new Intl.DateTimeFormat(this.#locale, { weekday: 'long' }).format(date),
      );
      weekdays.append(heading);
    }
    grid.append(weekdays);
    const first = calendarDay(this.#year, this.#month, 1);
    const offset = (first.getDay() - this.#weekStart + 7) % 7;
    const today = serializeDateValue(new Date(), 'date', false);
    let focusable = false;
    for (let week = 0; week < 6; week++) {
      const row = document.createElement('div');
      row.className = 'wr-date-calendar-week';
      row.setAttribute('role', 'row');
      for (let index = 0; index < 7; index++) {
        const date = calendarDay(this.#year, this.#month, week * 7 + index - offset + 1);
        const cell = document.createElement('span');
        cell.setAttribute('role', 'gridcell');
        if (date.getFullYear() < 1 || date.getFullYear() > 9999) {
          row.append(cell);
          continue;
        }
        const day = serializeDateValue(date, 'date', false);
        const button = this.#button(
          new Intl.DateTimeFormat(this.#locale, { dateStyle: 'full' }).format(date),
          () => {
            this.#day = day;
            if (configuration.mode === 'date') {
              const value = this.#value();
              if (value !== null) this.#commit(value);
            } else {
              this.#year = date.getFullYear();
              this.#month = date.getMonth();
              this.#render();
              this.#position();
              this.#focusDay(day);
            }
          },
        );
        button.textContent = String(date.getDate());
        button.dataset.dateDay = day;
        button.dataset.outsideMonth = String(date.getMonth() !== this.#month);
        button.disabled = !this.#dayAllowed(day);
        button.tabIndex = -1;
        if (day === today) button.setAttribute('aria-current', 'date');
        cell.setAttribute('aria-selected', String(day === this.#day));
        if (day === this.#day && !button.disabled) {
          button.tabIndex = 0;
          focusable = true;
        }
        cell.append(button);
        row.append(cell);
      }
      grid.append(row);
    }
    if (!focusable) {
      const firstEnabled = grid.querySelector<HTMLButtonElement>('button:not(:disabled)');
      if (firstEnabled !== null) firstEnabled.tabIndex = 0;
    }
    this.#popup.replaceChildren(header, grid);
    if (configuration.mode === 'datetime') this.#renderTime();
    const footer = document.createElement('div');
    footer.className = 'wr-date-calendar-footer';
    const clear = this.#button(this.#text('Clear', 'Limpar'), () => this.#commit(''));
    const todayButton = this.#button(this.#text('Today', 'Hoje'), () => {
      this.#day = today;
      if (configuration.mode === 'date') {
        const value = this.#value();
        if (value !== null) this.#commit(value);
      } else {
        const now = new Date();
        this.#year = now.getFullYear();
        this.#month = now.getMonth();
        this.#render();
        this.#position();
        this.#focusDay(today);
      }
    });
    todayButton.disabled = !this.#dayAllowed(today);
    footer.append(clear, todayButton);
    if (configuration.mode === 'datetime') {
      const apply = this.#button(this.#text('Apply', 'Aplicar'), () => {
        const value = this.#value();
        if (value !== null) this.#commit(value);
      });
      apply.dataset.dateApply = '';
      apply.disabled = this.#value() === null;
      footer.append(apply);
    }
    this.#popup.append(footer);
  }

  #renderTime(): void {
    const document = this.#popup.ownerDocument;
    const row = document.createElement('div');
    row.className = 'wr-date-calendar-time';
    const values = this.#time.split(':');
    const labels = [
      this.#text('Hour', 'Hora'),
      this.#text('Minute', 'Minuto'),
      this.#text('Second', 'Segundo'),
    ];
    const fields: HTMLInputElement[] = [];
    for (let index = 0; index < (this.#options.read().showSeconds ? 3 : 2); index++) {
      const label = document.createElement('label');
      label.textContent = labels[index] ?? '';
      const input = document.createElement('input');
      input.type = 'number';
      input.min = '0';
      input.max = index === 0 ? '23' : '59';
      input.step = '1';
      input.value = values[index] ?? '00';
      input.setAttribute('aria-label', labels[index] ?? '');
      input.oninput = () => {
        this.#time = fields
          .map((field) =>
            field.value === '' || !field.validity.valid ? '--' : pad(Number(field.value)),
          )
          .join(':');
        const apply = this.#popup.querySelector<HTMLButtonElement>('[data-date-apply]');
        if (apply !== null) apply.disabled = this.#value() === null;
      };
      fields.push(input);
      label.append(input);
      row.append(label);
    }
    this.#popup.append(row);
  }

  #focusDay(day: string): void {
    const selected = this.#popup.querySelector<HTMLButtonElement>(
      `[data-date-day="${day}"]:not(:disabled)`,
    );
    (
      selected ??
      this.#popup.querySelector<HTMLButtonElement>('.wr-date-calendar-grid button[tabindex="0"]') ??
      this.#popup.querySelector('select')
    )?.focus({ preventScroll: true });
  }

  #navigate(event: Event): void {
    if (
      !(event instanceof KeyboardEvent) ||
      !(event.target instanceof HTMLButtonElement) ||
      event.target.dataset.dateDay === undefined
    )
      return;
    const date = parseDateValue(event.target.dataset.dateDay);
    if (date === null) return;
    const originalYear = date.getFullYear();
    const weekday = (date.getDay() - this.#weekStart + 7) % 7;
    switch (event.key) {
      case 'ArrowLeft':
        date.setDate(date.getDate() - 1);
        break;
      case 'ArrowRight':
        date.setDate(date.getDate() + 1);
        break;
      case 'ArrowUp':
        date.setDate(date.getDate() - 7);
        break;
      case 'ArrowDown':
        date.setDate(date.getDate() + 7);
        break;
      case 'Home':
        date.setDate(date.getDate() - weekday);
        break;
      case 'End':
        date.setDate(date.getDate() + 6 - weekday);
        break;
      case 'PageUp':
      case 'PageDown': {
        const amount = (event.key === 'PageUp' ? -1 : 1) * (event.ctrlKey ? 12 : 1);
        const target = calendarDay(originalYear, date.getMonth() + amount, 1);
        const last = calendarDay(target.getFullYear(), target.getMonth() + 1, 0).getDate();
        date.setFullYear(target.getFullYear(), target.getMonth(), Math.min(date.getDate(), last));
        break;
      }
      default:
        return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (date.getFullYear() < 1 || date.getFullYear() > 9999) return;
    const day = serializeDateValue(date, 'date', false);
    if (!this.#dayAllowed(day)) return;
    this.#year = date.getFullYear();
    this.#month = date.getMonth();
    this.#render();
    this.#position();
    for (const button of this.#popup.querySelectorAll<HTMLButtonElement>('[data-date-day]'))
      button.tabIndex = button.dataset.dateDay === day ? 0 : -1;
    this.#focusDay(day);
  }

  public dispose(): void {
    this.close(false);
    for (const dispose of this.#disposers) dispose();
    this.#disposers.length = 0;
    this.#popup.remove();
  }
}
