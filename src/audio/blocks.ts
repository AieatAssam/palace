/**
 * Blocks' sound, in pure numbers so it can be tested: a lacquered block lights with a soft
 * wooden click and a small brass chime above it. The chime climbs a major pentatonic with
 * each step of the line, never with the block, so the ear learns the count and the eye
 * still has to learn the place. `engine.ts` plays the voices.
 */

const A4 = 440;
const hz = (semitones: number) => A4 * Math.pow(2, semitones / 12);

/** Major pentatonic from D5, in semitones above A4. */
const STEPS = [5, 7, 9, 12, 14, 17, 19, 21, 24, 26, 29, 31, 33, 36, 38, 41];

/** The chime's pitch for the `step`th block of a line (0-based); past the table it holds the top note. */
export function blockChimeFreq(step: number): number {
  const i = Math.max(0, Math.min(STEPS.length - 1, Math.floor(step)));
  return hz(STEPS[i]!);
}

/** The click: a band-passed tick of noise, centred here (Hz), decaying at this rate (1/s). */
export const CLICK = { centre: 2300, q: 2.2, decay: 420, gain: 0.22 } as const;

/** The chime's partials: ratio to the struck note, level and ring (s); lighter than Echo's bells. */
export const BLOCK_PARTIALS: readonly { ratio: number; gain: number; ring: number }[] = [
  { ratio: 1, gain: 1, ring: 0.9 },
  { ratio: 2.0, gain: 0.32, ring: 0.6 },
  { ratio: 3.0, gain: 0.12, ring: 0.35 },
];
