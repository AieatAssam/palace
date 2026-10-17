import { describe, expect, it } from 'vitest';
import {
  DAY,
  FAST_MS,
  GRADUATING_INTERVAL,
  INITIAL_EASE,
  LEARNING_STEPS,
  MAX_EASE,
  MAX_INTERVAL,
  MIN_EASE,
  RELEARN_STEP,
  SLOW_MS,
  type Card,
  type Deck,
  deckStats,
  ensureCards,
  gradeFromResponse,
  isCard,
  isDue,
  mastery,
  newCard,
  nextEase,
  pickNext,
  review,
} from './srs';

const T0 = 1_700_000_000_000;

/** Deterministic RNG for scheduler tests. */
function seq(...values: number[]) {
  let i = 0;
  return () => values[i++ % values.length]!;
}

function passN(card: Card, n: number, grade: 3 | 4 | 5 = 5): Card {
  let c = card;
  for (let i = 0; i < n; i++) c = review(c, grade, c.due, 1000);
  return c;
}

describe('newCard', () => {
  it('starts unseen, due immediately, at initial ease', () => {
    const c = newCard('x', T0);
    expect(c).toMatchObject({ id: 'x', ease: INITIAL_EASE, reps: 0, seen: 0, due: T0, last: 0 });
    expect(isDue(c, T0)).toBe(true);
  });
});

describe('gradeFromResponse', () => {
  it('grades fast correct answers highest', () => {
    expect(gradeFromResponse(true, 500)).toBe(5);
    expect(gradeFromResponse(true, FAST_MS)).toBe(5);
  });
  it('grades slower correct answers lower but still passing', () => {
    expect(gradeFromResponse(true, FAST_MS + 1)).toBe(4);
    expect(gradeFromResponse(true, SLOW_MS)).toBe(4);
    expect(gradeFromResponse(true, SLOW_MS + 1)).toBe(3);
    expect(gradeFromResponse(true, 60_000)).toBe(3);
  });
  it('grades misses as failing', () => {
    expect(gradeFromResponse(false, 300)).toBe(1);
    expect(gradeFromResponse(false, 5000)).toBe(0);
  });
});

describe('nextEase', () => {
  it('raises ease on a perfect grade', () => {
    expect(nextEase(2.5, 5)).toBeCloseTo(2.6);
  });
  it('keeps ease on grade 4', () => {
    expect(nextEase(2.5, 4)).toBeCloseTo(2.5);
  });
  it('lowers ease on grade 3 and lower', () => {
    expect(nextEase(2.5, 3)).toBeCloseTo(2.36);
    expect(nextEase(2.5, 0)).toBeCloseTo(1.7);
  });
  it('clamps to [MIN_EASE, MAX_EASE]', () => {
    expect(nextEase(MIN_EASE, 0)).toBe(MIN_EASE);
    expect(nextEase(MAX_EASE, 5)).toBe(MAX_EASE);
  });
});

describe('review', () => {
  it('does not mutate the input card', () => {
    const c = newCard('x', T0);
    const snapshot = { ...c };
    review(c, 5, T0, 900);
    expect(c).toEqual(snapshot);
  });

  it('walks through learning steps then graduates', () => {
    let c = newCard('x', T0);
    for (let i = 0; i < LEARNING_STEPS.length; i++) {
      const now = c.due;
      c = review(c, 5, now, 1000);
      expect(c.reps).toBe(i + 1);
      expect(c.interval).toBe(LEARNING_STEPS[i]);
      expect(c.due).toBe(now + LEARNING_STEPS[i]!);
    }
    c = review(c, 5, c.due, 1000);
    expect(c.interval).toBe(GRADUATING_INTERVAL);
  });

  it('grows intervals multiplicatively after graduation', () => {
    const c = passN(newCard('x', T0), LEARNING_STEPS.length + 1);
    const next = review(c, 4, c.due, 3000);
    expect(next.interval).toBe(Math.round(c.interval * next.ease));
    expect(next.interval).toBeGreaterThan(c.interval);
  });

  it('rewards fast answers with longer intervals than slow ones', () => {
    const c = passN(newCard('x', T0), LEARNING_STEPS.length + 1);
    const fast = review(c, 5, c.due);
    const slow = review(c, 3, c.due);
    expect(fast.interval).toBeGreaterThan(slow.interval);
    expect(fast.ease).toBeGreaterThan(slow.ease);
  });

  it('resets hard on a miss', () => {
    const c = passN(newCard('x', T0), 6);
    const missed = review(c, 0, c.due);
    expect(missed.reps).toBe(0);
    expect(missed.interval).toBe(RELEARN_STEP);
    expect(missed.lapses).toBe(1);
    expect(missed.ease).toBeLessThan(c.ease);
    expect(missed.due).toBe(c.due + RELEARN_STEP);
  });

  it('tracks seen/correct counters', () => {
    let c = newCard('x', T0);
    c = review(c, 5, T0);
    c = review(c, 0, T0 + 1);
    c = review(c, 4, T0 + 2);
    expect(c.seen).toBe(3);
    expect(c.correct).toBe(2);
    expect(c.lapses).toBe(1);
    expect(c.last).toBe(T0 + 2);
  });

  it('caps the interval at MAX_INTERVAL', () => {
    let c = passN(newCard('x', T0), 40);
    c = review(c, 5, c.due);
    expect(c.interval).toBeLessThanOrEqual(MAX_INTERVAL);
    expect(c.interval).toBe(MAX_INTERVAL);
  });

  it('keeps an EWMA of correct response times and ignores misses', () => {
    let c = newCard('x', T0);
    c = review(c, 5, T0, 1000);
    expect(c.avgMs).toBe(1000);
    c = review(c, 5, T0, 2000);
    expect(c.avgMs).toBe(1300);
    c = review(c, 0, T0, 9000);
    expect(c.avgMs).toBe(1300);
  });

  it('ease never drops below the floor under repeated misses', () => {
    let c = newCard('x', T0);
    for (let i = 0; i < 20; i++) c = review(c, 0, T0 + i);
    expect(c.ease).toBe(MIN_EASE);
  });
});

describe('mastery', () => {
  it('is 0 for missing or unseen cards', () => {
    expect(mastery(undefined)).toBe(0);
    expect(mastery(newCard('x', T0))).toBe(0);
  });
  it('increases monotonically with consecutive correct reviews', () => {
    let c = newCard('x', T0);
    let prev = 0;
    for (let i = 0; i < 5; i++) {
      c = review(c, 5, c.due);
      const m = mastery(c);
      expect(m).toBeGreaterThanOrEqual(prev);
      prev = m;
    }
    expect(prev).toBeCloseTo(1);
  });
  it('drops after a miss', () => {
    const c = passN(newCard('x', T0), 3);
    expect(mastery(review(c, 0, c.due))).toBeLessThan(mastery(c));
  });
  it('stays in [0, 1]', () => {
    let c = newCard('x', T0);
    for (let i = 0; i < 30; i++) {
      c = review(c, (i % 3 === 0 ? 0 : 5) as 0 | 5, T0 + i);
      expect(mastery(c)).toBeGreaterThanOrEqual(0);
      expect(mastery(c)).toBeLessThanOrEqual(1);
    }
  });
});

describe('ensureCards', () => {
  it('adds missing cards and keeps existing ones', () => {
    const existing = review(newCard('a', T0), 5, T0);
    const deck = ensureCards({ a: existing }, ['a', 'b'], T0);
    expect(deck.a).toBe(existing);
    expect(deck.b).toMatchObject({ id: 'b', seen: 0 });
  });
  it('returns the same object when nothing is added', () => {
    const deck: Deck = { a: newCard('a', T0) };
    expect(ensureCards(deck, ['a'], T0)).toBe(deck);
  });
});

describe('pickNext', () => {
  it('returns undefined for an empty pool', () => {
    expect(pickNext({}, [], T0)).toBeUndefined();
  });

  it('introduces unseen items in curriculum order (within a small window)', () => {
    const ids = ['a', 'b', 'c', 'd', 'e'];
    expect(pickNext({}, ids, T0, () => 0)).toBe('a');
    expect(pickNext({}, ids, T0, () => 0.99)).toBe('c');
  });

  it('prefers due cards over unseen ones', () => {
    const a = review(newCard('a', T0), 0, T0); // due at T0 + RELEARN_STEP
    const now = T0 + RELEARN_STEP + 1;
    expect(pickNext({ a }, ['b', 'a', 'c'], now, () => 0)).toBe('a');
  });

  it('introduces unseen items in a window of 3 in curriculum order, and an overdue card still comes first', () => {
    const ids = ['a', 'b', 'c', 'd', 'e'];
    expect(pickNext({}, ids, T0, () => 0)).toBe('a');
    const seenA = review(newCard('a', T0), 5, T0, 1000); // due T0 + 20s
    expect(pickNext({ a: seenA }, ids, T0, () => 0)).toBe('b');
    const seenB = review(newCard('b', T0), 5, T0, 1000);
    expect(pickNext({ a: seenA, b: seenB }, ids, T0, () => 0)).toBe('c');
    // Overdue beats unseen.
    expect(pickNext({ a: seenA }, ids, T0 + 5 * 60_000, () => 0)).toBe('a');
  });

  it('prefers the most overdue / hardest due card', () => {
    const easy = passN(newCard('easy', T0), 5);
    let hard = newCard('hard', T0);
    hard = review(hard, 0, T0);
    hard = review(hard, 0, hard.due);
    const now = Math.max(easy.due, hard.due) + DAY;
    expect(pickNext({ easy, hard }, ['easy', 'hard'], now, () => 0)).toBe('hard');
  });

  it('avoids repeating the previous item when alternatives exist', () => {
    const ids = ['a', 'b'];
    for (let i = 0; i < 10; i++) {
      expect(pickNext({}, ids, T0, Math.random, 'a')).toBe('b');
    }
  });

  it('still returns the only item even if it should be avoided', () => {
    expect(pickNext({}, ['a'], T0, Math.random, 'a')).toBe('a');
  });

  it('falls back to the soonest-due card when nothing is due', () => {
    const a = review(newCard('a', T0), 5, T0); // due T0 + 20s
    const b = passN(newCard('b', T0), 4); // due much later
    expect(pickNext({ a, b }, ['a', 'b'], T0 + 1, seq(0.5))).toBe('a');
  });

  it('interleaves: over a simulated session every item gets practised', () => {
    const ids = Array.from({ length: 12 }, (_, i) => `i${i}`);
    let deck: Deck = {};
    let now = T0;
    let prev: string | undefined;
    const counts = new Map<string, number>();
    for (let t = 0; t < 120; t++) {
      const id = pickNext(deck, ids, now, Math.random, prev)!;
      expect(id).not.toBe(prev);
      counts.set(id, (counts.get(id) ?? 0) + 1);
      const card = deck[id] ?? newCard(id, now);
      deck = { ...deck, [id]: review(card, 5, now, 1500) };
      prev = id;
      now += 4000;
    }
    for (const id of ids) expect(counts.get(id) ?? 0).toBeGreaterThan(0);
  });

  it('a missed item comes back sooner than mastered ones', () => {
    const ids = ['a', 'b', 'c'];
    let deck: Deck = {};
    for (const id of ids) deck[id] = passN(newCard(id, T0), 4); // all graduated
    const missAt = deck.b!.last;
    deck = { ...deck, b: review(deck.b!, 0, missAt) };
    const now = missAt + RELEARN_STEP + 1;
    expect(deck.a!.due).toBeGreaterThan(now);
    expect(pickNext(deck, ids, now, () => 0)).toBe('b');
  });
});

describe('deckStats', () => {
  it('summarises seen, due and mean mastery', () => {
    const a = passN(newCard('a', T0), 4);
    const b = review(newCard('b', T0), 0, T0);
    const s = deckStats({ a, b }, ['a', 'b', 'c'], T0 + RELEARN_STEP);
    expect(s.total).toBe(3);
    expect(s.seen).toBe(2);
    expect(s.due).toBe(1);
    expect(s.mastery).toBeCloseTo((mastery(a) + mastery(b)) / 3);
  });
  it('handles empty id lists', () => {
    expect(deckStats({}, [], T0)).toEqual({ total: 0, seen: 0, due: 0, mastery: 0 });
  });
});

describe('isCard', () => {
  it('accepts a real card', () => {
    expect(isCard(newCard('a', T0))).toBe(true);
  });
  it('rejects junk', () => {
    expect(isCard(null)).toBe(false);
    expect(isCard({ id: 'a' })).toBe(false);
    expect(isCard({ ...newCard('a', T0), ease: 'x' })).toBe(false);
    expect(isCard({ ...newCard('a', T0), due: Number.NaN })).toBe(false);
  });
});
