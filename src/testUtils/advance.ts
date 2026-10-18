import { vi } from 'vitest';

/**
 * Step fake timers until `done` holds (checked before each step), so a store's pauses and
 * playback can be driven to a phase without knowing their exact lengths. Throws past `limit`.
 */
export function advanceUntil(done: () => boolean, step = 25, limit = 60_000) {
  for (let t = 0; t <= limit; t += step) {
    if (done()) return;
    vi.advanceTimersByTime(step);
  }
  if (!done()) throw new Error(`advanceUntil: condition not met within ${limit} ms`);
}
