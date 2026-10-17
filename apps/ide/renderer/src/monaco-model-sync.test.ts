import { describe, expect, it } from 'vitest';
import { sourceChange } from './monaco-model-sync';

describe('authoritative Monaco source reconciliation', () => {
  it.each([
    ['export class Page {}', 'export class Page { answer = 42; }', ' answer = 42; '],
    ['const answer = 42;', 'const answer = 43;', '3'],
    ['abc', 'ac', ''],
    ['', 'class Page {}', 'class Page {}'],
    ['class Page {}', '', ''],
    ['// 😀\nclass Page {}', '// 😃\nclass Page {}', '😃'],
    ['// 😀', '// 😀!', '!'],
    ['first\r\nsecond', 'first\nsecond', '\n'],
    ['first\nsecond', 'first\r\nsecond', '\r\n'],
    ['first\r\nsecond', 'first\r\nnext\r\nsecond', 'next\r\n'],
  ])('updates only the changed span of %j', (previous, next, text) => {
    const change = sourceChange(previous, next);
    expect(change).not.toBeNull();
    if (change === null) throw new Error('Expected an edit.');
    expect(change.text).toBe(text);
    expect(previous.slice(0, change.start) + change.text + previous.slice(change.end)).toBe(next);
    if (previous.includes('😀')) expect(change.start).not.toBe(1 + previous.indexOf('😀'));
  });

  it('leaves an unchanged authored document alone', () => {
    expect(sourceChange('class Page {}', 'class Page {}')).toBeNull();
  });
});
