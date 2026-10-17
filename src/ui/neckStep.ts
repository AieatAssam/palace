import type { Position } from '../game/notes';

/**
 * The place an arrow key leads to from `from`: of the four neighbours in the stage's region
 * (a string either side, a fret either way), the one that lies most nearly in the arrow's
 * direction on screen, so the keys follow the neck however it is turned (a phone, a
 * left-handed neck). Before the neck is drawn, right and left walk the frets, up and down the strings.
 */
export function step(from: Position, dx: number, dy: number, ok: (p: Position) => boolean, project: (p: Position) => { x: number; y: number } | null): Position | null {
  const near = [
    { string: from.string + 1, fret: from.fret },
    { string: from.string - 1, fret: from.fret },
    { string: from.string, fret: from.fret + 1 },
    { string: from.string, fret: from.fret - 1 },
  ].filter(ok);
  const a = project(from);
  if (!a) {
    const p = dx ? { string: from.string, fret: from.fret + dx } : { string: from.string - dy, fret: from.fret };
    return ok(p) ? p : null;
  }
  let best: Position | null = null;
  let score = 0.4;
  for (const p of near) {
    const b = project(p);
    if (!b) continue;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len < 1e-3) continue;
    const s = ((b.x - a.x) * dx + (b.y - a.y) * dy) / len;
    if (s > score) {
      score = s;
      best = p;
    }
  }
  return best;
}
