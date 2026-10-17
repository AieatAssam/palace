import type { NoteName, Position } from '../game/notes';

/** Display a note with a proper sharp glyph. */
export function pretty(n: NoteName | string): string {
  return n.replace('#', '♯');
}

const FLATS: Record<string, string> = { 'C#': 'D\u266d', 'D#': 'E\u266d', 'F#': 'G\u266d', 'G#': 'A\u266d', 'A#': 'B\u266d' };

/** The flat name of a sharp, e.g. C# → D♭. Naturals are returned as they are. */
export function flatOf(n: NoteName | string): string {
  return FLATS[n] ?? pretty(n);
}

/** A note in the asked spelling. */
export function spelled(n: NoteName | string, spelling: 'sharp' | 'flat'): string {
  return spelling === 'flat' ? flatOf(n) : pretty(n);
}

/** Indexed like the data model: 0 = low E … 5 = high E (see `STANDARD_TUNING`). */
export const STRING_NAMES = ['low E', 'A', 'D', 'G', 'B', 'high E'] as const;

/** The prompt's description of a position, e.g. "open A string" or "D string, 3rd fret". */
export function positionLabel(p: Position): string {
  const name = STRING_NAMES[p.string];
  if (name === undefined) throw new RangeError(`No string ${p.string}`);
  return p.fret === 0 ? `open ${name} string` : `${name} string, ${ordinal(p.fret)} fret`;
}

export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]!);
}
