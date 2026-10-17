/**
 * Where the wax seal is pressed on screen (NDC, y up), shared by the 3D stamp and its
 * DOM caption so the two agree: clear of the question and the answer pad, to the
 * right of centre on a wide screen, high and central on a phone.
 */
export function sealNdc(width: number, height: number): { x: number; y: number } {
  const portrait = height > width * 1.05;
  return portrait ? { x: 0.38, y: 0.3 } : { x: 0.62, y: 0.22 };
}

/** The seal's radius on screen, CSS pixels. */
export function sealRadiusPx(width: number, height: number): number {
  return Math.max(36, Math.min(width, height) * 0.075);
}

/** Durations (seconds). The press lands within 200 ms of the answer. */
export const SEAL_TIMING = { drop: 0.18, settle: 0.14, hold: 2.6, fade: 0.55 } as const;
export const SEAL_LIFE = SEAL_TIMING.drop + SEAL_TIMING.settle + SEAL_TIMING.hold + SEAL_TIMING.fade;

/**
 * Where the stamp actually came down, in page CSS pixels: the scene picks a clear patch of
 * desk near `sealNdc` (the seal lies on the desk, so it may land a little off that point)
 * and publishes it here for the caption. `null` until a seal is pressed.
 */
export const sealSpot: { current: { x: number; y: number; r: number; id: number } | null } = { current: null };

/**
 * Places on screen (NDC) to try for the seal, the preferred one first: the stamp goes down on
 * the first that shows bare desk, clear of the room's furniture.
 */
export function sealCandidates(width: number, height: number): { x: number; y: number }[] {
  const portrait = height > width * 1.05;
  const first = sealNdc(width, height);
  const rest = portrait
    ? [
        { x: 0.55, y: 0.08 },
        { x: -0.55, y: 0.08 },
        { x: 0.6, y: 0.4 },
        { x: -0.6, y: 0.4 },
        { x: 0.55, y: -0.3 },
        { x: -0.55, y: -0.3 },
      ]
    : [
        { x: 0.78, y: 0.05 },
        { x: -0.7, y: 0.22 },
        { x: 0.8, y: 0.38 },
        { x: -0.8, y: 0.0 },
        { x: 0.45, y: 0.4 },
        { x: -0.45, y: -0.3 },
      ];
  return [first, ...rest];
}
