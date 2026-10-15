/**
 * Per-item spaced-repetition scheduler.
 *
 * An SM-2 variant tuned for short, rapid drills:
 *  - grade 0..5 (SM-2 convention); >= 3 counts as a pass.
 *  - Response time adjusts the grade: correct-and-fast = 5, correct-but-slow = 3.
 *  - A miss resets repetitions and drops ease ("wrong answers reset hard").
 *  - Intervals are in milliseconds so a single session can revisit an item
 *    (learning steps of seconds/minutes) before graduating to day-scale review.
 *
 * Everything here is pure: callers pass `now` explicitly.
 */

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

export const MIN_EASE = 1.3;
export const MAX_EASE = 3.0;
export const INITIAL_EASE = 2.5;

/** Short in-session learning steps before an item graduates to day intervals. */
export const LEARNING_STEPS: readonly number[] = [20_000, 2 * MINUTE, 10 * MINUTE];
export const RELEARN_STEP = 15_000;
export const GRADUATING_INTERVAL = DAY;
export const MAX_INTERVAL = 180 * DAY;

/** Response-time thresholds for grading a correct answer. */
export const FAST_MS = 2500;
export const SLOW_MS = 7000;

export type Grade = 0 | 1 | 2 | 3 | 4 | 5;

export interface Card {
  id: string;
  ease: number;
  /** Current interval in ms. */
  interval: number;
  /** Consecutive successful reviews (resets on a miss). */
  reps: number;
  /** Total misses ever. */
  lapses: number;
  /** Total reviews ever. */
  seen: number;
  /** Total correct ever. */
  correct: number;
  /** Epoch ms when the card is next due. */
  due: number;
  /** Epoch ms of last review (0 = never). */
  last: number;
  /** Exponentially weighted moving average of correct response time, ms (0 = none yet). */
  avgMs: number;
}

export function newCard(id: string, now: number): Card {
  return {
    id,
    ease: INITIAL_EASE,
    interval: 0,
    reps: 0,
    lapses: 0,
    seen: 0,
    correct: 0,
    due: now,
    last: 0,
    avgMs: 0,
  };
}

/** Map an outcome + response time to an SM-2 grade. */
export function gradeFromResponse(correct: boolean, ms: number): Grade {
  if (!correct) return ms < 1200 ? 1 : 0;
  if (ms <= FAST_MS) return 5;
  if (ms <= SLOW_MS) return 4;
  return 3;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** SM-2 ease update. */
export function nextEase(ease: number, grade: Grade): number {
  const q = grade;
  return clamp(ease + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)), MIN_EASE, MAX_EASE);
}

/** Apply one review to a card, returning a new card (input is not mutated). */
export function review(card: Card, grade: Grade, now: number, responseMs = 0): Card {
  const pass = grade >= 3;
  const ease = nextEase(card.ease, grade);
  let reps: number;
  let interval: number;
  let lapses = card.lapses;

  if (!pass) {
    reps = 0;
    lapses += 1;
    interval = RELEARN_STEP;
  } else {
    reps = card.reps + 1;
    if (reps <= LEARNING_STEPS.length) {
      interval = LEARNING_STEPS[reps - 1]!;
    } else if (reps === LEARNING_STEPS.length + 1) {
      interval = GRADUATING_INTERVAL;
    } else {
      // Grade 3 (slow) grows the interval less than grade 5 (fast).
      const bonus = grade === 5 ? 1.15 : grade === 3 ? 0.85 : 1;
      interval = Math.round(Math.max(card.interval, GRADUATING_INTERVAL) * ease * bonus);
    }
  }
  interval = Math.min(interval, MAX_INTERVAL);

  const avgMs =
    pass && responseMs > 0
      ? card.avgMs === 0
        ? responseMs
        : Math.round(card.avgMs * 0.7 + responseMs * 0.3)
      : card.avgMs;

  return {
    ...card,
    ease,
    interval,
    reps,
    lapses,
    seen: card.seen + 1,
    correct: card.correct + (pass ? 1 : 0),
    due: now + interval,
    last: now,
    avgMs,
  };
}

export type Deck = Record<string, Card>;

/** Ensure every id has a card; returns a new deck only if something was added. */
export function ensureCards(deck: Deck, ids: readonly string[], now: number): Deck {
  let out: Deck | null = null;
  for (const id of ids) {
    if (!deck[id]) {
      out ??= { ...deck };
      out[id] = newCard(id, now);
    }
  }
  return out ?? deck;
}

export function isDue(card: Card, now: number): boolean {
  return card.due <= now;
}

/**
 * Mastery in [0, 1] for one card. Combines how far it has progressed through
 * the schedule with its recent accuracy. Unseen cards are 0.
 */
export function mastery(card: Card | undefined): number {
  if (!card || card.seen === 0) return 0;
  const accuracy = card.correct / card.seen;
  const progress = Math.min(1, card.reps / (LEARNING_STEPS.length + 1));
  return clamp(progress * 0.75 + accuracy * 0.25, 0, 1) * (card.reps === 0 ? 0.5 : 1);
}

export type Rng = () => number;

/**
 * Pick the next item to drill from `ids`.
 *
 * Priority: overdue cards (most overdue first, weighted by low ease),
 * then unseen cards (in the given order — callers order by curriculum),
 * then the card due soonest. `avoid` excludes the item just asked so
 * the same question does not repeat back-to-back when alternatives exist.
 */
export function pickNext(
  deck: Deck,
  ids: readonly string[],
  now: number,
  rng: Rng = Math.random,
  avoid?: string,
): string | undefined {
  if (ids.length === 0) return undefined;
  const pool = ids.length > 1 && avoid !== undefined ? ids.filter((id) => id !== avoid) : ids;
  if (pool.length === 0) return ids[0];

  const due: Card[] = [];
  const unseen: string[] = [];
  for (const id of pool) {
    const c = deck[id];
    if (!c || c.seen === 0) unseen.push(id);
    else if (isDue(c, now)) due.push(c);
  }

  if (due.length > 0) {
    // Score: overdue amount relative to interval, boosted for hard (low-ease) cards.
    // A small random jitter interleaves items that are otherwise tied.
    let best: Card | undefined;
    let bestScore = -Infinity;
    for (const c of due) {
      const overdue = (now - c.due) / Math.max(c.interval, 1000);
      const score = overdue + (MAX_EASE - c.ease) + rng() * 0.25;
      if (score > bestScore) {
        bestScore = score;
        best = c;
      }
    }
    return best!.id;
  }

  if (unseen.length > 0) {
    // Introduce new items gently in curriculum order, with a little variety.
    const window = Math.min(unseen.length, 3);
    return unseen[Math.floor(rng() * window)];
  }

  // Nothing due: review whatever comes due soonest (keeps a session flowing).
  let soonest: Card | undefined;
  for (const id of pool) {
    const c = deck[id]!;
    if (!soonest || c.due < soonest.due) soonest = c;
  }
  return soonest!.id;
}

/** Summary statistics for a set of cards. */
export function deckStats(deck: Deck, ids: readonly string[], now: number) {
  let seen = 0;
  let due = 0;
  let masterySum = 0;
  for (const id of ids) {
    const c = deck[id];
    if (c && c.seen > 0) {
      seen++;
      if (isDue(c, now)) due++;
    }
    masterySum += mastery(c);
  }
  return {
    total: ids.length,
    seen,
    due,
    mastery: ids.length ? masterySum / ids.length : 0,
  };
}

/** Validate an unknown value as a Card (for localStorage hydration). */
export function isCard(v: unknown): v is Card {
  if (typeof v !== 'object' || v === null) return false;
  const c = v as Record<string, unknown>;
  return (
    typeof c.id === 'string' &&
    ['ease', 'interval', 'reps', 'lapses', 'seen', 'correct', 'due', 'last', 'avgMs'].every(
      (k) => typeof c[k] === 'number' && Number.isFinite(c[k] as number),
    )
  );
}
