/** Serializable character rules shared by the Inspector and browser runtime. */
export type WebEditMaskCase = 'none' | 'upper' | 'lower';

export interface WebEditMaskToken {
  /** A JavaScript Unicode regular expression matching one complete character. */
  readonly pattern: string;
  readonly transform?: WebEditMaskCase;
}

export type WebEditMaskTokens = Readonly<Record<string, string | WebEditMaskToken>>;

export const DEFAULT_EDIT_MASK_TOKENS: WebEditMaskTokens = Object.freeze({
  '0': '[0-9]',
  a: '\\p{L}',
  '*': '[\\p{L}\\p{N}]',
  '#': '[\\s\\S]',
});

interface MaskPosition {
  readonly literal?: string;
  readonly expression?: RegExp;
  readonly transform?: WebEditMaskCase;
}

export interface EditMaskResult {
  readonly text: string;
  readonly raw: string;
  readonly complete: boolean;
  /** UTF-16 offsets of editable characters in the formatted value. */
  readonly positions: readonly { readonly start: number; readonly end: number }[];
  /** Formatted caret offsets indexed by source UTF-16 offset. */
  readonly carets: readonly number[];
}

export interface CompiledEditMask {
  format(value: string, letterCase?: WebEditMaskCase, raw?: boolean): EditMaskResult;
}

export function parseWebEditMaskTokens(value: unknown): WebEditMaskTokens {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    throw new TypeError('Mask tokens must be a JSON object.');
  const result: Record<string, string | WebEditMaskToken> = Object.create(null) as Record<
    string,
    string | WebEditMaskToken
  >;
  if (Object.keys(value).length > 64) throw new RangeError('Use at most 64 mask tokens.');
  for (const [key, rule] of Object.entries(value)) {
    if (Array.from(key).length !== 1 || '[]{}|\\'.includes(key))
      throw new TypeError('Each mask token must be one character other than []{}| or backslash.');
    let pattern: string;
    let transform: WebEditMaskCase | undefined;
    if (typeof rule === 'string') pattern = rule;
    else {
      if (rule === null || typeof rule !== 'object' || Array.isArray(rule))
        throw new TypeError(`Invalid mask token ${key}.`);
      const object = rule as Record<string, unknown>;
      if (
        typeof object.pattern !== 'string' ||
        Object.keys(object).some((name) => name !== 'pattern' && name !== 'transform') ||
        (object.transform !== undefined &&
          !['none', 'upper', 'lower'].includes(String(object.transform)))
      )
        throw new TypeError(`Invalid pattern or transform for mask token ${key}.`);
      pattern = object.pattern;
      transform = object.transform as WebEditMaskCase | undefined;
    }
    if (pattern.length === 0 || pattern.length > 128)
      throw new RangeError(`Mask token ${key} requires a pattern of 1 to 128 characters.`);
    new RegExp(`^(?:${pattern})$`, 'u');
    result[key] =
      typeof rule === 'string'
        ? pattern
        : { pattern, ...(transform === undefined ? {} : { transform }) };
  }
  return result;
}

function changeCase(value: string, transform: WebEditMaskCase): string {
  const changed =
    transform === 'upper'
      ? value.toUpperCase()
      : transform === 'lower'
        ? value.toLowerCase()
        : value;
  // A character rule always occupies one Unicode character, even for case expansions.
  return Array.from(changed).length === 1 ? changed : value;
}

/** Bounded pattern grammar: literals, escapes, [optional groups], {min,max} and | alternatives. */
export function compileEditMask(pattern: string, tokens: WebEditMaskTokens = {}): CompiledEditMask {
  if (pattern.length > 1024) throw new RangeError('Mask patterns are limited to 1024 characters.');
  const definitions = { ...DEFAULT_EDIT_MASK_TOKENS, ...parseWebEditMaskTokens(tokens) };
  const characters = Array.from(pattern);
  let cursor = 0;
  type Variant = readonly MaskPosition[];
  const bounded = (variants: readonly Variant[]): readonly Variant[] => {
    if (variants.length > 128 || variants.some((variant) => variant.length > 512))
      throw new RangeError('Mask expands beyond 128 alternatives or 512 positions.');
    return variants;
  };
  const combine = (left: readonly Variant[], right: readonly Variant[]): readonly Variant[] =>
    bounded(left.flatMap((prefix) => right.map((suffix) => [...prefix, ...suffix])));
  const expression = (nested: boolean, depth: number): readonly Variant[] => {
    if (depth > 16) throw new RangeError('Mask groups are nested too deeply.');
    let sequence: readonly Variant[] = [[]];
    let alternatives: readonly Variant[] = [];
    while (cursor < characters.length) {
      const character = characters[cursor++];
      if (character === undefined) break;
      if (character === ']') {
        if (!nested) throw new SyntaxError('Unexpected ] in mask.');
        return bounded([...alternatives, ...sequence]);
      }
      if (character === '|') {
        alternatives = bounded([...alternatives, ...sequence]);
        sequence = [[]];
        continue;
      }
      let atom: readonly Variant[];
      if (character === '[') atom = [[], ...expression(true, depth + 1)];
      else {
        if (character === '{' || character === '}')
          throw new SyntaxError('Escape literal braces with a backslash.');
        if (character === '\\') {
          const literal = characters[cursor++];
          if (literal === undefined) throw new SyntaxError('A mask escape requires a character.');
          atom = [[{ literal }]];
        } else {
          const rule = definitions[character];
          atom = [
            [
              rule === undefined
                ? { literal: character }
                : {
                    expression: new RegExp(
                      `^(?:${typeof rule === 'string' ? rule : rule.pattern})$`,
                      'u',
                    ),
                    transform: typeof rule === 'string' ? undefined : rule.transform,
                  },
            ],
          ];
        }
      }
      if (characters[cursor] === '{') {
        cursor++;
        let range = '';
        while (cursor < characters.length && characters[cursor] !== '}')
          range += characters[cursor++];
        if (characters[cursor++] !== '}' || !/^\d+(,\d+)?$/.test(range))
          throw new SyntaxError('Use {count} or {min,max} after a mask character or group.');
        const [minimumText, maximumText = minimumText] = range.split(',');
        const minimum = Number(minimumText),
          maximum = Number(maximumText);
        if (minimum > maximum || maximum > 512 || maximum - minimum > 127)
          throw new RangeError('Invalid or excessive mask repetition.');
        let repeated: readonly Variant[] = [[]];
        let choices: readonly Variant[] = minimum === 0 ? [[]] : [];
        for (let count = 1; count <= maximum; count++) {
          repeated = combine(repeated, atom);
          if (count >= minimum) choices = bounded([...choices, ...repeated]);
        }
        atom = choices;
      }
      sequence = combine(sequence, atom);
    }
    if (nested) throw new SyntaxError('Unclosed optional mask group.');
    return bounded([...alternatives, ...sequence]);
  };
  const variants = expression(false, 0);
  return {
    format(value, letterCase = 'none', rawInput = false) {
      let best:
        | (EditMaskResult & {
            readonly matched: number;
            readonly missing: number;
            readonly skipped: number;
          })
        | undefined;
      for (const variant of variants) {
        let source = 0,
          text = '',
          raw = '',
          pending = '',
          matched = 0,
          skipped = 0;
        const carets: number[] = Array.from({ length: value.length + 1 }, () => 0);
        const positions: { start: number; end: number }[] = [];
        const consume = (length: number, caret = text.length): void => {
          for (let offset = 0; offset < length; offset++) carets[++source] = caret;
        };
        const slots = variant.filter((position) => position.expression !== undefined).length;
        for (const position of variant) {
          if (position.literal !== undefined) {
            pending += position.literal;
            if (!rawInput && value.startsWith(position.literal, source))
              consume(position.literal.length, text.length + pending.length);
            continue;
          }
          let accepted = false;
          while (source < value.length) {
            const character = String.fromCodePoint(value.codePointAt(source) ?? 0);
            const transform = position.transform ?? letterCase;
            const transformed = changeCase(character, transform);
            if (
              position.expression?.test(character) ||
              position.expression?.test(transformed) ||
              (transform !== 'none' &&
                position.expression?.test(
                  changeCase(character, transform === 'upper' ? 'lower' : 'upper'),
                ))
            ) {
              text += pending;
              pending = '';
              const start = text.length;
              text += transformed;
              raw += transformed;
              positions.push({ start, end: text.length });
              consume(character.length);
              matched++;
              accepted = true;
              break;
            }
            skipped++;
            consume(character.length, text.length + pending.length);
          }
          if (!accepted) break;
        }
        if (matched > 0 && matched === slots) text += pending;
        while (source < value.length) {
          skipped++;
          consume(1);
        }
        carets[value.length] = text.length;
        for (let index = 0; index < carets.length; index++)
          carets[index] = Math.min(carets[index] ?? 0, text.length);
        const candidate = {
          text,
          raw,
          complete: matched > 0 && matched === slots,
          positions,
          carets,
          matched,
          missing: slots - matched,
          skipped,
        };
        if (
          best === undefined ||
          candidate.matched > best.matched ||
          (candidate.matched === best.matched &&
            (candidate.skipped < best.skipped ||
              (candidate.skipped === best.skipped && candidate.missing < best.missing)))
        )
          best = candidate;
      }
      return best ?? { text: '', raw: '', complete: false, positions: [], carets: [0] };
    },
  };
}

export function isWebEditMaskPattern(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    compileEditMask(value);
    return true;
  } catch {
    return false;
  }
}

export function isWebEditMaskTokens(value: unknown): value is WebEditMaskTokens {
  try {
    parseWebEditMaskTokens(value);
    return true;
  } catch {
    return false;
  }
}
