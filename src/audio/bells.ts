/**
 * Echo's hand bells, voiced in pure numbers so they can be tested. The bells are tuned to
 * a major pentatonic, so any two struck together (the chord stage) sound well. A hand bell
 * rings its fundamental with a strong twelfth (three times the frequency) above it, as
 * English hand bells are tuned; a few weaker inharmonic partials give the brass its edge.
 * `engine.ts` plays the voices.
 */

export interface BellNote {
  /** Letter name with octave, e.g. "C5". */
  name: string;
  freq: number;
}

const A4 = 440;
/** Semitones above A4 → hertz. */
const hz = (semitones: number) => A4 * Math.pow(2, semitones / 12);

/** Semitones from A4 and names of the bells in the eight-bell set, lowest first. */
const EIGHT: readonly [string, number][] = [
  ['G4', -2],
  ['A4', 0],
  ['C5', 3],
  ['D5', 5],
  ['E5', 7],
  ['G5', 10],
  ['A5', 12],
  ['C6', 15],
];
const SIX: readonly [string, number][] = [
  ['C5', 3],
  ['D5', 5],
  ['E5', 7],
  ['G5', 10],
  ['A5', 12],
  ['C6', 15],
];
/** Four bells: the major triad and its octave, as far apart as the ear likes. */
const FOUR: readonly [string, number][] = [
  ['C5', 3],
  ['E5', 7],
  ['G5', 10],
  ['C6', 15],
];

/** The set of `n` bells (4, 6 or 8), lowest first. */
export function bellScale(n: number): BellNote[] {
  const set = n <= 4 ? FOUR : n <= 6 ? SIX : EIGHT;
  return set.map(([name, st]) => ({ name, freq: hz(st) }));
}

/** Partial ratio to the struck note, relative level, and ring time (seconds to -60 dB). */
export const HANDBELL_PARTIALS: readonly { ratio: number; gain: number; ring: number }[] = [
  { ratio: 1, gain: 1, ring: 2.6 },
  { ratio: 2.02, gain: 0.12, ring: 1.2 },
  { ratio: 3, gain: 0.46, ring: 1.6 },
  { ratio: 4.18, gain: 0.09, ring: 0.6 },
  { ratio: 5.43, gain: 0.07, ring: 0.42 },
];

/** Hertz between the two oscillators of a partial: a slow shimmer as the bell rings. */
export const HANDBELL_BEAT = 0.9;

/** Level of each bell in a pair, so two at once ring no louder than one. */
export function pairGain(count: number): number {
  return count > 1 ? 1 / Math.sqrt(count) : 1;
}
