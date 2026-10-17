import { describe, expect, it } from 'vitest';
import {
  MATCH_RATE,
  NBACK_STAGES,
  FIRST_NBACK_STAGE,
  TILES,
  TONES,
  addCall,
  emptyRecord,
  emptyTally,
  grade,
  isMatch,
  makeRun,
  nbackMastered,
  nbackProgress,
  nbackStageById,
  parseRecord,
  recordRun,
  score,
  type NBackRecord,
  type NBackStage,
  type Tally,
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

const stageById = (id: string): NBackStage => {
  const s = NBACK_STAGES.find((x) => x.id === id);
  if (!s) throw new Error(`no stage ${id}`);
  return s;
};

const ONE = stageById('one');
const TWO = stageById('two');
const THREE = stageById('three');
const DUAL = stageById('dual');

const SEEDS = 200;

describe('NBACK_STAGES', () => {
  it('gives every stage a unique id', () => {
    const ids = NBACK_STAGES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('finds every stage by id', () => {
    for (const s of NBACK_STAGES) expect(nbackStageById(s.id).id).toBe(s.id);
  });

  it('falls back to the first stage for an unknown id', () => {
    expect(nbackStageById('no-such-stage').id).toBe(NBACK_STAGES[0]!.id);
    expect(nbackStageById('').id).toBe(FIRST_NBACK_STAGE.id);
    expect(FIRST_NBACK_STAGE.id).toBe(NBACK_STAGES[0]!.id);
  });
});

describe('makeRun', () => {
  it('returns n plus trials trials', () => {
    for (const s of NBACK_STAGES) {
      expect(makeRun(s, mulberry32(3))).toHaveLength(s.n + s.trials);
    }
  });

  it('keeps tiles on the board and tones on the bell range', () => {
    for (const s of NBACK_STAGES) {
      for (let seed = 1; seed <= 50; seed++) {
        for (const t of makeRun(s, mulberry32(seed))) {
          expect(t.place).toBeGreaterThanOrEqual(0);
          expect(t.place).toBeLessThan(TILES);
          expect(t.tone).toBeGreaterThanOrEqual(0);
          expect(t.tone).toBeLessThan(TONES);
        }
      }
    }
  });

  it('gives every trial a tone of 0 on single-channel stages', () => {
    for (const s of NBACK_STAGES.filter((x) => !x.channels.includes('tone'))) {
      for (let seed = 1; seed <= 20; seed++) {
        for (const t of makeRun(s, mulberry32(seed))) expect(t.tone).toBe(0);
      }
    }
  });

  it('plants exactly round(trials × MATCH_RATE) matches per active channel, across many seeds and all stages', () => {
    for (const s of NBACK_STAGES) {
      const want = Math.round(s.trials * MATCH_RATE);
      for (let seed = 1; seed <= SEEDS; seed++) {
        const run = makeRun(s, mulberry32(seed));
        for (const ch of s.channels) {
          let count = 0;
          for (let i = 0; i < run.length; i++) if (isMatch(run, s.n, i, ch)) count++;
          expect(count).toBe(want);
        }
      }
    }
  });

  it('never gives a match in the first n trials', () => {
    for (const s of NBACK_STAGES) {
      for (let seed = 1; seed <= 50; seed++) {
        const run = makeRun(s, mulberry32(seed));
        for (let i = 0; i < s.n; i++) {
          for (const ch of s.channels) expect(isMatch(run, s.n, i, ch)).toBe(false);
        }
      }
    }
  });

  it('gives the same run from the same seed', () => {
    expect(makeRun(DUAL, mulberry32(42))).toEqual(makeRun(DUAL, mulberry32(42)));
  });
});

describe('isMatch', () => {
  const run = [
    { place: 1, tone: 2 },
    { place: 4, tone: 2 },
    { place: 1, tone: 5 },
    { place: 1, tone: 5 },
  ];

  it('is a match when the trial equals the one n back on that channel', () => {
    expect(isMatch(run, 2, 2, 'place')).toBe(true);
    expect(isMatch(run, 2, 3, 'place')).toBe(false);
    expect(isMatch(run, 1, 3, 'tone')).toBe(true);
    expect(isMatch(run, 1, 1, 'tone')).toBe(true);
  });

  it('is false for the first n trials and for indices past the run', () => {
    expect(isMatch(run, 2, 0, 'place')).toBe(false);
    expect(isMatch(run, 2, 1, 'place')).toBe(false);
    expect(isMatch(run, 2, 4, 'place')).toBe(false);
    expect(isMatch(run, 2, 99, 'place')).toBe(false);
  });

  it('is false for a negative index', () => {
    expect(isMatch(run, 1, -1, 'place')).toBe(false);
  });
});

describe('grade', () => {
  it('gives a hit for a match that was called', () => {
    expect(grade(true, true)).toBe('hit');
  });

  it('gives a miss for a match that was not called', () => {
    expect(grade(true, false)).toBe('miss');
  });

  it('gives a false call for a non-match that was called', () => {
    expect(grade(false, true)).toBe('false');
  });

  it('gives a pass for a non-match that was let by', () => {
    expect(grade(false, false)).toBe('pass');
  });
});

describe('addCall', () => {
  it('adds one to the tally for each kind of call, leaving the rest alone', () => {
    let t: Tally = emptyTally();
    t = addCall(t, 'hit');
    t = addCall(t, 'hit');
    t = addCall(t, 'miss');
    t = addCall(t, 'false');
    t = addCall(t, 'pass');
    expect(t).toEqual({ hits: 2, misses: 1, false: 1, passes: 1 });
  });

  it('does not mutate the tally it was given', () => {
    const before = emptyTally();
    addCall(before, 'hit');
    expect(before).toEqual(emptyTally());
  });
});

describe('score', () => {
  it('is 100 when every match is caught and none is called wrongly', () => {
    expect(score([{ hits: 5, misses: 0, false: 0, passes: 9 }])).toBe(100);
  });

  it('is 0 when no match is called and some were missed', () => {
    expect(score([{ hits: 0, misses: 4, false: 0, passes: 9 }])).toBe(0);
  });

  it('is 0 for a run with no matches and no calls', () => {
    expect(score([{ hits: 0, misses: 0, false: 0, passes: 12 }])).toBe(0);
  });

  it('is 0 for an empty list of tallies', () => {
    expect(score([])).toBe(0);
  });

  it('is 0 when every trial is called, so calling everything cannot score well', () => {
    expect(score([{ hits: 0, misses: 0, false: 14, passes: 0 }])).toBe(0);
    expect(score([{ hits: 4, misses: 0, false: 14, passes: 0 }])).toBe(Math.round((100 * 4) / 18));
  });

  it('rounds a mixed run to the nearest percent', () => {
    // 2 of 3 matches caught, none called wrongly: 66.67 rounds to 67.
    expect(score([{ hits: 2, misses: 1, false: 0, passes: 0 }])).toBe(67);
    // 3 of 4 caught, one false call: 3 / 5 = 60.
    expect(score([{ hits: 3, misses: 1, false: 1, passes: 0 }])).toBe(60);
  });

  it('pools the two channels of a dual run', () => {
    const tallies = [
      { hits: 2, misses: 0, false: 0, passes: 10 },
      { hits: 1, misses: 1, false: 2, passes: 6 },
    ];
    // 3 caught out of 3 + 1 + 2 = 6 scored.
    expect(score(tallies)).toBe(50);
  });
});

describe('recordRun', () => {
  it('stores a first score as the best and counts the round', () => {
    const r = recordRun(emptyRecord(), ONE, 70);
    expect(r.record.best[ONE.id]).toBe(70);
    expect(r.record.rounds[ONE.id]).toBe(1);
    expect(r.newBest).toBe(true);
    expect(r.crossed).toBe(false);
  });

  it('keeps the higher of the old best and the new score', () => {
    const start: NBackRecord = { best: { [ONE.id]: 70 }, rounds: { [ONE.id]: 1 } };
    const lower = recordRun(start, ONE, 40);
    expect(lower.record.best[ONE.id]).toBe(70);
    expect(lower.record.rounds[ONE.id]).toBe(2);
    expect(lower.newBest).toBe(false);
    const higher = recordRun(start, ONE, 90);
    expect(higher.record.best[ONE.id]).toBe(90);
    expect(higher.newBest).toBe(true);
  });

  it('reports crossed only when the best first reaches the mastery score', () => {
    const below: NBackRecord = { best: { [TWO.id]: TWO.mastery - 1 }, rounds: {} };
    const up = recordRun(below, TWO, TWO.mastery);
    expect(up.crossed).toBe(true);
    const again = recordRun(up.record, TWO, 100);
    expect(again.crossed).toBe(false);
    expect(again.newBest).toBe(true);
  });

  it('does not touch the record it was given', () => {
    const start: NBackRecord = { best: {}, rounds: {} };
    recordRun(start, THREE, 80);
    expect(start).toEqual({ best: {}, rounds: {} });
  });
});

describe('nbackProgress and nbackMastered', () => {
  it('shows the best against the stage mastery score', () => {
    const p = nbackProgress(THREE, { best: { [THREE.id]: 60 }, rounds: {} });
    expect(p.best).toBe(60);
    expect(p.mastery).toBe(THREE.mastery);
    expect(p.toward).toBeCloseTo(60 / THREE.mastery);
    expect(p.mastered).toBe(false);
  });

  it('is mastered at the mastery score, with toward capped at one', () => {
    const at = nbackProgress(THREE, { best: { [THREE.id]: THREE.mastery }, rounds: {} });
    expect(at.mastered).toBe(true);
    expect(at.toward).toBe(1);
    const over = nbackProgress(THREE, { best: { [THREE.id]: 100 }, rounds: {} });
    expect(over.toward).toBe(1);
  });

  it('starts a stage at nothing', () => {
    const p = nbackProgress(ONE, emptyRecord());
    expect(p.best).toBe(0);
    expect(p.toward).toBe(0);
    expect(p.mastered).toBe(false);
  });

  it('counts the stages mastered', () => {
    expect(nbackMastered(emptyRecord())).toBe(0);
    const rec: NBackRecord = {
      best: { [ONE.id]: ONE.mastery, [TWO.id]: TWO.mastery - 1, [DUAL.id]: DUAL.mastery },
      rounds: {},
    };
    expect(nbackMastered(rec)).toBe(2);
  });
});

describe('parseRecord', () => {
  it('returns an empty record for non-objects', () => {
    for (const raw of [null, undefined, 4, 'x', false]) {
      expect(parseRecord(raw)).toEqual(emptyRecord());
    }
  });

  it('drops unknown stage ids and negative, non-finite or non-numeric values', () => {
    const rec = parseRecord({
      best: { 'no-such': 50, [ONE.id]: -5, [TWO.id]: Number.POSITIVE_INFINITY, [THREE.id]: 'high' },
      rounds: { 'no-such': 2, [ONE.id]: -1, [TWO.id]: 3 },
    });
    expect(rec.best).toEqual({});
    expect(rec.rounds).toEqual({ [TWO.id]: 3 });
  });

  it('caps a best score at 100', () => {
    expect(parseRecord({ best: { [ONE.id]: 250 } }).best).toEqual({ [ONE.id]: 100 });
  });

  it('floors fractional scores', () => {
    expect(parseRecord({ best: { [ONE.id]: 81.9 } }).best).toEqual({ [ONE.id]: 81 });
  });

  it('keeps a valid record through a JSON round trip', () => {
    const rec: NBackRecord = {
      best: { [ONE.id]: 88, [DUAL.id]: 75 },
      rounds: { [ONE.id]: 3, [DUAL.id]: 1 },
    };
    expect(parseRecord(JSON.parse(JSON.stringify(rec)))).toEqual(rec);
  });
});
