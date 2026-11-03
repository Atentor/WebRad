export type WebDateMode = 'date' | 'datetime';
export type WebDateFormat = 'dd/MM/yyyy' | 'MM/dd/yyyy' | 'yyyy-MM-dd';

const pad = (value: number, length = 2): string => String(value).padStart(length, '0');

/** Local calendar fields, with explicit rollover and DST-gap rejection. */
function calendarDate(parts: readonly number[], withTime: boolean): Date | null {
  const [year = 0, month = 0, day = 0, hour = 0, minute = 0, second = 0] = parts;
  if (year < 1 || year > 9999) return null;
  const date = new Date(0);
  date.setHours(12, 0, 0, 0);
  date.setFullYear(year, month - 1, day);
  date.setHours(hour, minute, second, 0);
  return date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day &&
    (!withTime ||
      (date.getHours() === hour && date.getMinutes() === minute && date.getSeconds() === second))
    ? date
    : null;
}

export function parseDateValue(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(value);
  return match === null
    ? null
    : calendarDate(
        match.slice(1).map((part) => Number(part ?? 0)),
        match[4] !== undefined,
      );
}

export function serializeDateValue(date: Date, mode: WebDateMode, seconds: boolean): string {
  if (!Number.isFinite(date.getTime()) || date.getFullYear() < 1 || date.getFullYear() > 9999) {
    throw new RangeError('Date must be a valid local date in years 0001 through 9999.');
  }
  const day = `${pad(date.getFullYear(), 4)}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  return mode === 'date'
    ? day
    : `${day}T${pad(date.getHours())}:${pad(date.getMinutes())}${seconds ? `:${pad(date.getSeconds())}` : ''}`;
}

export function dateMask(mode: WebDateMode, format: WebDateFormat, seconds: boolean): string {
  return format + (mode === 'datetime' ? (seconds ? ' HH:mm:ss' : ' HH:mm') : '');
}

export function formatDateText(
  date: Date,
  mode: WebDateMode,
  format: WebDateFormat,
  seconds: boolean,
): string {
  const values: Readonly<Record<string, string>> = {
    yyyy: pad(date.getFullYear(), 4),
    MM: pad(date.getMonth() + 1),
    dd: pad(date.getDate()),
    HH: pad(date.getHours()),
    mm: pad(date.getMinutes()),
    ss: pad(date.getSeconds()),
  };
  return dateMask(mode, format, seconds).replace(
    /yyyy|MM|dd|HH|mm|ss/g,
    (token) => values[token] ?? token,
  );
}

export function parseDateText(
  text: string,
  mode: WebDateMode,
  format: WebDateFormat,
  seconds: boolean,
): Date | null {
  const mask = dateMask(mode, format, seconds);
  if (text.length !== mask.length) return null;
  for (let index = 0; index < mask.length; index++) {
    const token = mask[index] ?? '';
    if (/[yMdHms]/.test(token) ? !/\d/.test(text[index] ?? '') : text[index] !== token) return null;
  }
  const field = (token: string): number => {
    const index = mask.indexOf(token);
    return index < 0 ? 0 : Number(text.slice(index, index + token.length));
  };
  return calendarDate(
    [field('yyyy'), field('MM'), field('dd'), field('HH'), field('mm'), field('ss')],
    mode === 'datetime',
  );
}

/** Insert only mask literals. Semantic validation never repairs impossible dates. */
export function maskDateText(text: string, mask: string): string {
  const digits = text.replace(/\D/g, '');
  let output = '';
  let digit = 0;
  for (const token of mask) {
    if (digit >= digits.length) break;
    output += /[yMdHms]/.test(token) ? digits[digit++] : token;
  }
  return output;
}
