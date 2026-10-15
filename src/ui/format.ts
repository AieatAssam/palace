import type { NoteName } from '../game/notes';

/** Display a note with a proper sharp glyph. */
export function pretty(n: NoteName | string): string {
  return n.replace('#', '♯');
}

export const STRING_NAMES = ['low E', 'A', 'D', 'G', 'B', 'high E'] as const;

export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]!);
}
