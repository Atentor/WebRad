/** Convert Chromium's alpha-enabled sRGB value to the project's hex format. */
export function nativeColorToHex(value: string): string | null {
  const text = value.trim().toLowerCase();
  const hex = /^#([\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/u.exec(text)?.[1];
  if (hex !== undefined) {
    const expanded = hex.length <= 4 ? [...hex].map((digit) => digit + digit).join('') : hex;
    return `#${expanded.length === 8 && expanded.endsWith('ff') ? expanded.slice(0, 6) : expanded}`;
  }

  const srgb = /^color\(\s*srgb\s+(.+?)\s*\)$/u.exec(text)?.[1];
  if (srgb === undefined) return null;
  const parts = srgb.split('/');
  if (parts.length > 2) return null;
  const channels = parts[0]!.trim().split(/\s+/u);
  if (channels.length !== 3) return null;
  const component = (part: string): number => {
    const number = Number(part.endsWith('%') ? part.slice(0, -1) : part);
    return part.endsWith('%') ? number / 100 : number;
  };
  const values = [...channels.map(component), component(parts[1]?.trim() ?? '1')];
  if (values.some((entry) => !Number.isFinite(entry))) return null;
  const bytes = values.map((entry) =>
    Math.round(Math.max(0, Math.min(1, entry)) * 255)
      .toString(16)
      .padStart(2, '0'),
  );
  return `#${bytes.slice(0, 3).join('')}${bytes[3] === 'ff' ? '' : bytes[3]}`;
}
