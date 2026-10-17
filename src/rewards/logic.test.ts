import { describe, expect, it } from 'vitest';
import {
  type DailyRecord,
  comboOf,
  dayKey,
  daysWarm,
  emptyDaily,
  flourishFor,
  milestoneAt,
  parseDaily,
  recordAnswer,
  rollover,
} from './logic';

const DAY = '2026-01-05';

function rec(over: Partial<DailyRecord> = {}): DailyRecord {
  return { ...emptyDaily(DAY), ...over };
}

describe('milestoneAt', () => {
  it('is null between milestones and at zero', () => {
    for (const s of [0, 1, 2, 3, 4, 6, 7, 8, 9]) expect(milestoneAt(s)).toBeNull();
  });

  it('names each tier', () => {
    expect(milestoneAt(5)).toEqual({ streak: 5, tier: 1, word: 'Bravo' });
    expect(milestoneAt(10)).toEqual({ streak: 10, tier: 2, word: 'Splendid' });
    expect(milestoneAt(15)).toEqual({ streak: 15, tier: 3, word: 'Superb' });
    expect(milestoneAt(20)).toEqual({ streak: 20, tier: 4, word: 'Bravissimo' });
  });

  it('repeats the last word past the end of the list', () => {
    expect(milestoneAt(25)?.word).toBe('Bravissimo');
    expect(milestoneAt(50)?.word).toBe('Bravissimo');
  });
});

describe('flourishFor', () => {
  it('clamps below the first tier to the first word', () => {
    expect(flourishFor(0)).toBe('Bravo');
    expect(flourishFor(-3)).toBe('Bravo');
  });
});

describe('comboOf', () => {
  it('starts empty', () => {
    expect(comboOf(0)).toEqual({ fill: 0, tier: 0, step: 0, of: 5 });
  });

  it('fills towards the next milestone', () => {
    const c = comboOf(3);
    expect(c.fill).toBeCloseTo(0.6, 10);
    expect(c.step).toBe(3);
    expect(c.tier).toBe(0);
  });

  it('empties again at a milestone and counts the tier', () => {
    expect(comboOf(5)).toEqual({ fill: 0, tier: 1, step: 0, of: 5 });
  });

  it('carries the fill past the first milestone', () => {
    const c = comboOf(7);
    expect(c.fill).toBeCloseTo(0.4, 10);
    expect(c.tier).toBe(1);
    expect(c.step).toBe(2);
  });

  it('reports the second tier at twelve', () => {
    const c = comboOf(12);
    expect(c.tier).toBe(2);
    expect(c.step).toBe(2);
  });

  it('floors fractional input and clamps negatives to zero', () => {
    expect(comboOf(3.9)).toEqual(comboOf(3));
    expect(comboOf(-4)).toEqual(comboOf(0));
  });
});

describe('recordAnswer', () => {
  it('grows the run on a correct answer and resets it on a miss', () => {
    const a = recordAnswer(0, emptyDaily(DAY), true, DAY);
    expect(a.streak).toBe(1);
    const b = recordAnswer(a.streak, a.daily, false, DAY);
    expect(b.streak).toBe(0);
  });

  it('ticks items and correct counts', () => {
    const a = recordAnswer(0, emptyDaily(DAY), true, DAY);
    const b = recordAnswer(a.streak, a.daily, false, DAY);
    expect(b.daily.items).toBe(2);
    expect(b.daily.correct).toBe(1);
  });

  it('keeps the best run today and ever with the max', () => {
    let streak = 0;
    let daily = emptyDaily(DAY);
    for (let i = 0; i < 3; i++) {
      const r = recordAnswer(streak, daily, true, DAY);
      streak = r.streak;
      daily = r.daily;
    }
    const miss = recordAnswer(streak, daily, false, DAY);
    expect(miss.daily.bestStreak).toBe(3);
    expect(miss.daily.bestEver).toBe(3);
  });

  it('returns a milestone exactly at 5 and 10 consecutive corrects, and null on a miss', () => {
    let streak = 0;
    let daily = emptyDaily(DAY);
    const found: (number | null)[] = [];
    for (let i = 0; i < 10; i++) {
      const r = recordAnswer(streak, daily, true, DAY);
      found.push(r.milestone?.streak ?? null);
      streak = r.streak;
      daily = r.daily;
    }
    expect(found).toEqual([null, null, null, null, 5, null, null, null, null, 10]);
    expect(recordAnswer(streak, daily, false, DAY).milestone).toBeNull();
  });

  it('marks dayBest only when a correct answer beats today, and not on the first correct of the day', () => {
    const first = recordAnswer(0, emptyDaily(DAY), true, DAY);
    expect(first.dayBest).toBe(false);
    const second = recordAnswer(first.streak, first.daily, true, DAY);
    expect(second.dayBest).toBe(true);
    const miss = recordAnswer(second.streak, second.daily, false, DAY);
    expect(miss.dayBest).toBe(false);
  });

  it('does not mark dayBest when the run does not pass today\'s best', () => {
    const daily = rec({ lastActive: DAY, bestStreak: 8, bestEver: 8, items: 8, correct: 8 });
    const r = recordAnswer(2, daily, true, DAY);
    expect(r.streak).toBe(3);
    expect(r.dayBest).toBe(false);
  });

  it('runs a sequence of five corrects, a miss, then six corrects', () => {
    const answers = [true, true, true, true, true, false, true, true, true, true, true, true];
    let streak = 0;
    let daily = emptyDaily(DAY);
    const milestones: number[] = [];
    for (const correct of answers) {
      const r = recordAnswer(streak, daily, correct, DAY);
      if (r.milestone) milestones.push(r.milestone.streak);
      streak = r.streak;
      daily = r.daily;
    }
    expect(streak).toBe(6);
    expect(comboOf(streak)).toEqual({ fill: 0.2, tier: 1, step: 1, of: 5 });
    expect(milestones).toEqual([5, 5]);
    expect(daily).toMatchObject({ items: 12, correct: 11, bestStreak: 6, bestEver: 6, lastActive: DAY });
  });
});

describe('days', () => {
  it('counts a new day once, not per answer', () => {
    const a = recordAnswer(0, emptyDaily('2026-01-05'), true, '2026-01-05');
    expect(a.daily.days).toBe(1);
    const b = recordAnswer(a.streak, a.daily, true, '2026-01-05');
    expect(b.daily.days).toBe(1);
  });

  it('counts consecutive days 1, 2, 3', () => {
    const d1 = recordAnswer(0, emptyDaily('2026-01-05'), true, '2026-01-05');
    const d2 = recordAnswer(0, d1.daily, true, '2026-01-06');
    const d3 = recordAnswer(0, d2.daily, true, '2026-01-07');
    expect([d1.daily.days, d2.daily.days, d3.daily.days]).toEqual([1, 2, 3]);
  });

  it('keeps the day count through a gap of several days', () => {
    const d1 = recordAnswer(0, emptyDaily('2026-01-05'), true, '2026-01-05');
    const d2 = recordAnswer(0, d1.daily, true, '2026-01-06');
    const later = recordAnswer(0, d2.daily, true, '2026-01-12');
    expect(later.daily.days).toBe(3);
  });

  it('is warm on the day practised and cools the next day', () => {
    const r = recordAnswer(0, emptyDaily('2026-01-05'), true, '2026-01-05');
    expect(daysWarm(r.daily, '2026-01-05')).toBe(true);
    expect(daysWarm(r.daily, '2026-01-06')).toBe(false);
  });
});

describe('daily rollover', () => {
  it('returns the same object for the same day', () => {
    const r = rec({ items: 4 });
    expect(rollover(r, DAY)).toBe(r);
  });

  it('zeroes today\'s figures on a new day and keeps the rest', () => {
    const r = rec({ items: 7, correct: 5, bestStreak: 4, days: 3, bestEver: 9, lastActive: DAY });
    const next = rollover(r, '2026-01-06');
    expect(next).toMatchObject({
      date: '2026-01-06',
      items: 0,
      correct: 0,
      bestStreak: 0,
      days: 3,
      bestEver: 9,
      lastActive: DAY,
    });
  });

  it('starts a yesterday record afresh when answering today', () => {
    const yesterday = rec({
      date: '2026-01-04',
      items: 7,
      correct: 5,
      bestStreak: 3,
      days: 2,
      bestEver: 3,
      lastActive: '2026-01-04',
    });
    const r = recordAnswer(0, yesterday, true, DAY);
    expect(r.daily.date).toBe(DAY);
    expect(r.daily.items).toBe(1);
    expect(r.daily.correct).toBe(1);
    expect(r.daily.bestEver).toBe(3);
    expect(r.daily.days).toBe(3);
  });
});

describe('dayKey', () => {
  it('uses the local calendar date, zero-padded', () => {
    expect(dayKey(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
    expect(dayKey(new Date(2026, 11, 31, 0, 1))).toBe('2026-12-31');
  });

  it('accepts a timestamp', () => {
    expect(dayKey(new Date(2026, 2, 9, 12).getTime())).toBe('2026-03-09');
  });
});

describe('parseDaily', () => {
  it('falls back to an empty day for missing, invalid or non-object input', () => {
    const empty = emptyDaily(DAY);
    expect(parseDaily(null, DAY)).toEqual(empty);
    expect(parseDaily('', DAY)).toEqual(empty);
    expect(parseDaily('{nope', DAY)).toEqual(empty);
    expect(parseDaily('null', DAY)).toEqual(empty);
    expect(parseDaily('[1,2,3]', DAY)).toEqual(empty);
  });

  it('turns negative or non-number counts into zero', () => {
    const r = parseDaily(
      JSON.stringify({ date: DAY, items: -4, correct: 'many', bestStreak: null, days: -1, bestEver: NaN }),
      DAY,
    );
    expect(r).toMatchObject({ items: 0, correct: 0, bestStreak: 0, days: 0, bestEver: 0 });
  });

  it('floors fractional counts', () => {
    const r = parseDaily(JSON.stringify({ date: DAY, items: 3.7, correct: 1.9, bestStreak: 2.2 }), DAY);
    expect(r).toMatchObject({ items: 3, correct: 1, bestStreak: 2 });
  });

  it('caps correct at items', () => {
    const r = parseDaily(JSON.stringify({ date: DAY, items: 2, correct: 9 }), DAY);
    expect(r.correct).toBe(2);
  });

  it('raises bestEver to at least bestStreak', () => {
    const r = parseDaily(JSON.stringify({ date: DAY, bestStreak: 4, bestEver: 1 }), DAY);
    expect(r.bestEver).toBe(4);
  });

  it('falls back on invalid date strings', () => {
    const r = parseDaily(JSON.stringify({ date: 'someday', lastActive: 'yesterday' }), DAY);
    expect(r.date).toBe(DAY);
    expect(r.lastActive).toBeNull();
  });

  it('rolls a record from an earlier day over to today, keeping days', () => {
    const raw = JSON.stringify({
      date: '2026-01-03',
      items: 4,
      correct: 2,
      bestStreak: 2,
      days: 5,
      bestEver: 6,
      lastActive: '2026-01-03',
    });
    expect(parseDaily(raw, DAY)).toEqual({
      date: DAY,
      items: 0,
      correct: 0,
      bestStreak: 0,
      days: 5,
      bestEver: 6,
      lastActive: '2026-01-03',
    });
  });
});
