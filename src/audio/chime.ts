/**
 * A small brass chime, voiced in pure numbers so it can be tested: each struck note
 * is a handful of inharmonic partials (a hand bell's hum, prime, tierce and nominal),
 * each partial a pair of sine oscillators a fraction of a hertz apart so the brass beats
 * as it rings. `engine.ts` plays the voices.
 */

/** Partial ratio to the struck note, relative level, and ring time (seconds to -60 dB). */
export const BELL_PARTIALS: readonly { ratio: number; gain: number; ring: number }[] = [
  { ratio: 0.5, gain: 0.22, ring: 2.4 },
  { ratio: 1, gain: 1, ring: 1.9 },
  { ratio: 2.0, gain: 0.42, ring: 1.3 },
  { ratio: 2.76, gain: 0.3, ring: 0.85 },
  { ratio: 4.07, gain: 0.14, ring: 0.5 },
];

/** Hertz between the two oscillators of a partial: the slow beat of real brass. */
export const BEAT_HZ = 0.7;

export interface ChimeNote {
  freq: number;
  /** Seconds after the strike. */
  delay: number;
  gain: number;
}

const A4 = 440;
const hz = (semitones: number) => A4 * Math.pow(2, semitones / 12);

/** The struck note of each milestone tier climbs a major pentatonic from G5. */
const PENTA = [0, 2, 4, 7, 9];
const G5 = 10; // semitones above A4

export type ChimeKind = 'milestone' | 'mastered';

/**
 * A milestone strikes the tier's note and the fifth above, a breath apart.
 * A mastered stage rolls a major triad up to the octave, slower and fuller.
 */
export function chimeNotes(kind: ChimeKind, tier = 1): ChimeNote[] {
  if (kind === 'mastered') {
    const root = G5 - 12;
    return [0, 4, 7, 12].map((st, i) => ({ freq: hz(root + st), delay: i * 0.11, gain: i === 3 ? 0.8 : 0.62 }));
  }
  const t = Math.max(1, Math.floor(tier)) - 1;
  const step = PENTA[t % PENTA.length]! + 12 * Math.floor(t / PENTA.length);
  const root = G5 + Math.min(step, 14);
  return [
    { freq: hz(root), delay: 0, gain: 0.7 },
    { freq: hz(root + 7), delay: 0.085, gain: 0.45 },
  ];
}
