/** Music-theory primitives for a six-string guitar in standard tuning. */

export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;
export type NoteName = (typeof NOTE_NAMES)[number];

/**
 * String index 0 = low E (6th string) … 5 = high E (1st string).
 * Values are MIDI note numbers of the open strings: E2 A2 D3 G3 B3 E4.
 */
export const STANDARD_TUNING = [40, 45, 50, 55, 59, 64] as const;
export const STRING_COUNT = STANDARD_TUNING.length;
export const STRING_LABELS = ['E', 'A', 'D', 'G', 'B', 'e'] as const;

/** Highest fret the model knows about (the 3D neck renders 0..MAX_FRET). */
export const MAX_FRET = 12;

export interface Position {
  string: number;
  fret: number;
}

export function positionKey(p: Position): string {
  return `s${p.string}f${p.fret}`;
}

export function parsePositionKey(key: string): Position {
  const m = /^s(\d+)f(\d+)$/.exec(key);
  if (!m) throw new Error(`Bad position key: ${key}`);
  return { string: Number(m[1]), fret: Number(m[2]) };
}

export function midiAt(p: Position): number {
  const open = STANDARD_TUNING[p.string];
  if (open === undefined) throw new RangeError(`No string ${p.string}`);
  if (p.fret < 0 || p.fret > 24) throw new RangeError(`Fret out of range: ${p.fret}`);
  return open + p.fret;
}

export function noteNameOfMidi(midi: number): NoteName {
  return NOTE_NAMES[((midi % 12) + 12) % 12]!;
}

export function noteAt(p: Position): NoteName {
  return noteNameOfMidi(midiAt(p));
}

/** Octave in scientific pitch notation (MIDI 60 = C4). */
export function octaveAt(p: Position): number {
  return Math.floor(midiAt(p) / 12) - 1;
}

export function frequencyOfMidi(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export function frequencyAt(p: Position): number {
  return frequencyOfMidi(midiAt(p));
}

/** All positions among `pool` that sound the given pitch class. */
export function positionsOfNote(note: NoteName, pool: readonly Position[]): Position[] {
  return pool.filter((p) => noteAt(p) === note);
}

export function samePosition(a: Position, b: Position): boolean {
  return a.string === b.string && a.fret === b.fret;
}
