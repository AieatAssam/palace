import { describe, expect, it } from 'vitest';
import {
  ECHO_STAGES,
  FIRST_ECHO_STAGE,
  FRESH_RECALL,
  emptyRecord,
  echoProgress,
  echoStageById,
  expectedOrder,
  extendLine,
  interval,
  makeLine,
  nextLength,
  nextStep,
  parseRecord,
  recordLine,
  schedule,
  strike,
  strokes,
  wantedNow,
  type EchoStage,
  type Line,
  type Recall,
} from './logic';

/** A small seeded random source (mulberry32), so every line in a test is repeatable. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const stageById = (id: string): EchoStage => {
  const s = ECHO_STAGES.find((x) => x.id === id);
  if (!s) throw new Error(`no stage ${id}`);
  return s;
};

const FOUR = stageById('four');
const SIX = stageById('six');
const REVERSE = stageById('reverse');
const CHORD = stageById('chord');

describe('ECHO_STAGES', () => {
  it('gives every stage a unique id', () => {
    const ids = ECHO_STAGES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('rings only four, six or eight bells', () => {
    for (const s of ECHO_STAGES) expect([4, 6, 8]).toContain(s.bells);
  });

  it('includes a reverse stage, a chord stage and a quicker-tempo stage', () => {
    expect(ECHO_STAGES.some((s) => s.order === 'reverse')).toBe(true);
    expect(ECHO_STAGES.some((s) => s.chords)).toBe(true);
    expect(ECHO_STAGES.some((s) => s.tempo < SIX.tempo)).toBe(true);
  });

  it('sets mastery above the opening length in every stage', () => {
    for (const s of ECHO_STAGES) expect(s.mastery).toBeGreaterThan(s.start);
  });

  it('keeps the tempo at or above its floor in every stage', () => {
    for (const s of ECHO_STAGES) expect(s.floor).toBeLessThanOrEqual(s.tempo);
  });

  it('falls back to the first stage for an unknown id', () => {
    expect(echoStageById('no-such-stage')).toBe(FIRST_ECHO_STAGE);
    expect(FIRST_ECHO_STAGE.id).toBe(ECHO_STAGES[0]!.id);
  });

  it('finds a known stage by id', () => {
    expect(echoStageById('reverse')).toBe(REVERSE);
  });
});

describe('nextStep', () => {
  it('returns a single bell in a plain stage', () => {
    const step = nextStep([], FOUR, mulberry32(7));
    expect(step).toHaveLength(1);
    expect(step[0]!).toBeGreaterThanOrEqual(0);
    expect(step[0]!).toBeLessThan(4);
  });

  it('will not strike a bell a third time running', () => {
    expect(nextStep([[2], [2]], FOUR, () => 0)).toEqual([0]);
    expect(nextStep([[2], [2]], FOUR, () => 0.999999)).toEqual([3]);
  });
});

describe('makeLine', () => {
  it('makes a line of the requested length', () => {
    expect(makeLine(12, SIX, mulberry32(3))).toHaveLength(12);
    expect(makeLine(0, SIX, mulberry32(3))).toHaveLength(0);
  });

  it('keeps every bell index within the stage', () => {
    for (const s of ECHO_STAGES) {
      for (let seed = 1; seed <= 20; seed++) {
        for (const step of makeLine(30, s, mulberry32(seed))) {
          for (const b of step) {
            expect(b).toBeGreaterThanOrEqual(0);
            expect(b).toBeLessThan(s.bells);
          }
        }
      }
    }
  });

  it('strikes single bells only in stages without chords', () => {
    for (const s of ECHO_STAGES.filter((x) => !x.chords)) {
      for (let seed = 1; seed <= 20; seed++) {
        for (const step of makeLine(30, s, mulberry32(seed))) expect(step).toHaveLength(1);
      }
    }
  });

  it('never strikes one bell three times running as single steps', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const line = makeLine(30, FOUR, mulberry32(seed));
      for (let i = 2; i < line.length; i++) {
        const [a, b, c] = [line[i - 2]!, line[i - 1]!, line[i]!];
        if (a.length === 1 && b.length === 1 && c.length === 1) {
          expect(a[0] === b[0] && b[0] === c[0]).toBe(false);
        }
      }
    }
  });

  it('in the chord stage, opens with a single bell and sometimes pairs later', () => {
    let pairs = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const line = makeLine(30, CHORD, mulberry32(seed));
      expect(line[0]!).toHaveLength(1);
      for (const step of line) {
        if (step.length === 2) {
          const [x, y] = step;
          expect(x).not.toBe(y);
          expect(x!).toBeLessThan(y!);
          pairs++;
        }
      }
    }
    expect(pairs).toBeGreaterThan(0);
  });

  it('stays in range at the edge values of the random source', () => {
    for (const s of ECHO_STAGES) {
      for (const value of [0, 0.999999]) {
        const line = makeLine(20, s, () => value);
        expect(line).toHaveLength(20);
        for (const step of line) {
          for (const b of step) {
            expect(b).toBeGreaterThanOrEqual(0);
            expect(b).toBeLessThan(s.bells);
          }
        }
      }
    }
  });
});

describe('extendLine', () => {
  it('keeps the existing strokes and adds exactly one step', () => {
    const line = makeLine(5, SIX, mulberry32(11));
    const snapshot = line.map((s) => [...s]);
    const longer = extendLine(line, SIX, mulberry32(12));
    expect(longer).toHaveLength(6);
    expect(longer.slice(0, 5)).toEqual(snapshot);
  });

  it('does not mutate the line it was given', () => {
    const line = makeLine(5, SIX, mulberry32(11));
    const snapshot = line.map((s) => [...s]);
    extendLine(line, SIX, mulberry32(13));
    expect(line).toHaveLength(5);
    expect(line).toEqual(snapshot);
  });
});

describe('expectedOrder', () => {
  const line: Line = [[1], [2, 4], [0]];

  it('returns a forward line as an identical copy', () => {
    const out = expectedOrder(line, 'forward');
    expect(out).toEqual(line);
    expect(out).not.toBe(line);
  });

  it('reverses the steps but not the bells inside a pair', () => {
    expect(expectedOrder(line, 'reverse')).toEqual([[0], [2, 4], [1]]);
  });

  it('does not mutate its input', () => {
    const copy = line.map((s) => [...s]);
    expectedOrder(line, 'reverse');
    expect(line).toEqual(copy);
  });
});

describe('strike', () => {
  const expected: Line = [[0], [2], [1]];

  it('rings a forward line correctly, ending on a line result', () => {
    let r: Recall = FRESH_RECALL;
    const first = strike(expected, r, 0);
    expect(first.kind).toBe('step');
    r = first.recall;
    const second = strike(expected, r, 2);
    expect(second.kind).toBe('step');
    r = second.recall;
    const last = strike(expected, r, 1);
    expect(last.kind).toBe('line');
    expect(last.recall.done).toBe(3);
  });

  it('answers a wrong bell with a miss that lists the bells still wanted', () => {
    const res = strike(expected, FRESH_RECALL, 3);
    expect(res.kind).toBe('miss');
    expect(res.kind === 'miss' && res.wanted).toEqual([0]);
    expect(res.recall).toEqual(FRESH_RECALL);
  });

  it('accepts both bells of a pair in either order', () => {
    const pair: Line = [[2, 4], [0]];
    const a = strike(pair, FRESH_RECALL, 4);
    expect(a.kind).toBe('held');
    const b = strike(pair, a.recall, 2);
    expect(b.kind).toBe('step');

    const c = strike(pair, FRESH_RECALL, 2);
    expect(c.kind).toBe('held');
    const d = strike(pair, c.recall, 4);
    expect(d.kind).toBe('step');
  });

  it('completes a pair as the line result when the pair is the last step', () => {
    const line: Line = [[0], [2, 4]];
    const r1 = strike(line, FRESH_RECALL, 0).recall;
    const held = strike(line, r1, 2);
    expect(held.kind).toBe('held');
    expect(strike(line, held.recall, 4).kind).toBe('line');
  });

  it('counts striking the same bell of a pair twice as a miss', () => {
    const pair: Line = [[2, 4]];
    const first = strike(pair, FRESH_RECALL, 4);
    const again = strike(pair, first.recall, 4);
    expect(again.kind).toBe('miss');
    expect(again.kind === 'miss' && again.wanted).toEqual([2]);
  });

  it('answers a stroke past the end of the line with a miss and no bells wanted', () => {
    const done: Recall = { done: 1, partial: [] };
    const res = strike([[0]], done, 0);
    expect(res.kind).toBe('miss');
    expect(res.kind === 'miss' && res.wanted).toEqual([]);
  });
});

describe('wantedNow', () => {
  it('lists the bells of the current step', () => {
    expect(wantedNow([[2, 4], [0]], FRESH_RECALL)).toEqual([2, 4]);
  });

  it('drops a bell already struck from a pair', () => {
    expect(wantedNow([[2, 4], [0]], { done: 0, partial: [4] })).toEqual([2]);
  });

  it('returns nothing once the line is finished', () => {
    expect(wantedNow([[0]], { done: 1, partial: [] })).toEqual([]);
  });
});

describe('strokes', () => {
  it('counts a pair as two strokes', () => {
    expect(strokes([[0], [1, 3], [2]])).toBe(4);
  });

  it('is zero for an empty line', () => {
    expect(strokes([])).toBe(0);
  });
});

describe('interval and schedule', () => {
  it('opens at the stage tempo for the starting length', () => {
    for (const s of ECHO_STAGES) expect(interval(s, s.start)).toBe(s.tempo);
  });

  it('never gets slower as the line grows', () => {
    for (const s of ECHO_STAGES) {
      for (let len = 1; len < 80; len++) {
        expect(interval(s, len + 1)).toBeLessThanOrEqual(interval(s, len));
      }
    }
  });

  it('never runs below the floor', () => {
    for (const s of ECHO_STAGES) {
      for (let len = 0; len < 200; len++) {
        expect(interval(s, len)).toBeGreaterThanOrEqual(s.floor);
      }
      expect(interval(s, 200)).toBe(s.floor);
    }
  });

  it('spaces a line evenly, starting at zero', () => {
    const times = schedule(FOUR, 6);
    expect(times).toHaveLength(6);
    expect(times[0]).toBe(0);
    const gap = interval(FOUR, 6);
    for (let i = 1; i < times.length; i++) {
      expect(times[i]! - times[i - 1]!).toBe(gap);
    }
  });

  it('gives an empty schedule for an empty line', () => {
    expect(schedule(FOUR, 0)).toEqual([]);
  });
});

describe('nextLength', () => {
  it('adds one step after a clean line', () => {
    expect(nextLength(FOUR, 5, true)).toBe(6);
  });

  it('drops one step after a slip', () => {
    expect(nextLength(FOUR, 5, false)).toBe(4);
  });

  it('never drops below the stage start after a slip', () => {
    expect(nextLength(FOUR, FOUR.start, false)).toBe(FOUR.start);
    expect(nextLength(CHORD, CHORD.start, false)).toBe(CHORD.start);
  });
});

describe('recordLine and echoProgress', () => {
  it('sets the best on a clean line', () => {
    const { record, newBest, crossed } = recordLine(emptyRecord(), FOUR, 5, true);
    expect(record.best[FOUR.id]).toBe(5);
    expect(newBest).toBe(true);
    expect(crossed).toBe(false);
  });

  it('keeps the best and still counts a round after a slip', () => {
    const r1 = recordLine(emptyRecord(), FOUR, 5, true).record;
    const { record, newBest } = recordLine(r1, FOUR, 9, false);
    expect(record.best[FOUR.id]).toBe(5);
    expect(record.rounds[FOUR.id]).toBe(2);
    expect(newBest).toBe(false);
  });

  it('marks crossed only on the line that first reaches mastery', () => {
    const base = recordLine(emptyRecord(), FOUR, FOUR.mastery - 1, true).record;
    const first = recordLine(base, FOUR, FOUR.mastery, true);
    expect(first.crossed).toBe(true);
    const after = recordLine(first.record, FOUR, FOUR.mastery + 1, true);
    expect(after.crossed).toBe(false);
    expect(after.newBest).toBe(true);
    const slipAfter = recordLine(after.record, FOUR, 3, false);
    expect(slipAfter.crossed).toBe(false);
  });

  it('reports progress toward mastery, capped at 1, and mastered when the bar is met', () => {
    const empty = echoProgress(FOUR, emptyRecord());
    expect(empty).toEqual({ best: 0, mastery: FOUR.mastery, toward: 0, mastered: false });

    const half = echoProgress(FOUR, { best: { [FOUR.id]: FOUR.mastery / 2 }, rounds: {} });
    expect(half.toward).toBeCloseTo(0.5, 6);
    expect(half.mastered).toBe(false);

    const over = echoProgress(FOUR, { best: { [FOUR.id]: FOUR.mastery + 10 }, rounds: {} });
    expect(over.toward).toBe(1);
    expect(over.mastered).toBe(true);
  });
});

describe('parseRecord', () => {
  it('returns an empty record for garbage', () => {
    for (const raw of [null, undefined, 'four', 42, [], [1, 2], true]) {
      expect(parseRecord(raw)).toEqual(emptyRecord());
    }
  });

  it('drops negative, NaN and infinite counts', () => {
    const rec = parseRecord({
      best: { four: -1, six: Number.NaN, swift: Number.POSITIVE_INFINITY },
      rounds: { four: -5 },
    });
    expect(rec).toEqual(emptyRecord());
  });

  it('drops unknown stage ids and non-object sections', () => {
    const rec = parseRecord({ best: { bogus: 5, '__proto__': 9 }, rounds: null });
    expect(rec).toEqual(emptyRecord());
    expect(parseRecord({ best: 'six', rounds: [3] })).toEqual(emptyRecord());
  });

  it('keeps valid values and floors fractions', () => {
    const rec = parseRecord({ best: { four: 5, six: 4.9 }, rounds: { reverse: 2 } });
    expect(rec.best).toEqual({ four: 5, six: 4 });
    expect(rec.rounds).toEqual({ reverse: 2 });
  });
});
