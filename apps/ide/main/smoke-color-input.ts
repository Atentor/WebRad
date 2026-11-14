/** Compare against the browser's serialization of the same color input value. */
export function colorInputValueMatches(selector: string, value: string): string {
  return `(() => {
    const input = document.querySelector(${JSON.stringify(selector)});
    if (!(input instanceof HTMLInputElement) || input.type !== 'color') return false;
    const expected = document.createElement('input');
    expected.type = 'color';
    if (input.hasAttribute('alpha')) expected.setAttribute('alpha', '');
    expected.value = ${JSON.stringify(value)};
    return input.value === expected.value;
  })()`;
}
