import { describe, expect, it } from 'vitest';
import {
  BLOCKS_STAGES,
  FIRST_BLOCKS_STAGE,
  blocksMastered,
  blocksProgress,
  blocksStageById,
  bestSpan,
  emptyRecord,
  expectedOrder,
  makeSequence,
  nextLength,
  parseRecord,
  recordLine,
  schedule,
  tap,
  type BlocksRecord,
  type BlocksStage,
} from './logic';
import { parseBlocksSave } from './store';

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

const stageById = (id: string): BlocksStage => {
  const s = BLOCKS_STAGES.find((x) => x.id === id);
  if (!s) throw new Error(`no stage ${id}`);
  return s;
};

const SPAN = stageById('span');
const LONG = stageById('long');
const REVERSE = stageById('reverse');

describe('BLOCKS_STAGES', () => {
  it('gives every stage a unique id', () => {
    const ids = BLOCKS_STAGES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('uses only nine, twelve or sixteen blocks', () => {
    for (const s of BLOCKS_STAGES) expect([9, 12, 16]).toContain(s.blocks);
  });

  it('starts every forward stage at three blocks or more, and the first stage at three', () => {
    for (const s of BLOCKS_STAGES) {
      if (s.order === 'forward') expect(s.start).toBeGreaterThanOrEqual(3);
    }
    expect(BLOCKS_STAGES[0]!.start).toBe(3);
    expect(FIRST_BLOCKS_STAGE.id).toBe(BLOCKS_STAGES[0]!.id);
  });

  it('sets mastery above the starting line and no higher than the board', () => {
    for (const s of BLOCKS_STAGES) {
      expect(s.mastery).toBeGreaterThan(s.start);
      expect(s.mastery).toBeLessThanOrEqual(s.blocks);
    }
  });

  it('includes a reverse stage, a long-line stage, a twelve and a sixteen block stage, and a shifting stage', () => {
    expect(BLOCKS_STAGES.some((s) => s.order === 'reverse')).toBe(true);
    expect(BLOCKS_STAGES.some((s) => s.start >= 5)).toBe(true);
    expect(BLOCKS_STAGES.some((s) => s.blocks === 12)).toBe(true);
    expect(BLOCKS_STAGES.some((s) => s.blocks === 16)).toBe(true);
    expect(BLOCKS_STAGES.some((s) => s.shifting)).toBe(true);
  });
});

describe('blocksStageById', () => {
  it('finds a stage by id', () => {
    expect(blocksStageById('reverse').id).toBe('reverse');
    expect(blocksStageById('shifting').shifting).toBe(true);
  });

  it('falls back to the first stage for an unknown id', () => {
    expect(blocksStageById('no-such-stage').id).toBe(BLOCKS_STAGES[0]!.id);
    expect(blocksStageById('').id).toBe(BLOCKS_STAGES[0]!.id);
  });
});

describe('makeSequence', () => {
  it('returns a line of the requested length', () => {
    expect(makeSequence(5, SPAN, mulberry32(1))).toHaveLength(5);
  });

  it('gives a line of distinct blocks, each inside the board', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const line = makeSequence(SPAN.blocks, SPAN, mulberry32(seed));
      expect(new Set(line).size).toBe(line.length);
      for (const b of line) {
        expect(b).toBeGreaterThanOrEqual(0);
        expect(b).toBeLessThan(SPAN.blocks);
      }
    }
  });

  it('caps the length at the number of blocks', () => {
    const line = makeSequence(20, { blocks: 9 }, mulberry32(3));
    expect(line).toHaveLength(9);
    expect(new Set(line).size).toBe(9);
  });

  it('gives the same line from the same seed', () => {
    expect(makeSequence(7, LONG, mulberry32(42))).toEqual(makeSequence(7, LONG, mulberry32(42)));
  });

  it('gives an empty line for length zero', () => {
    expect(makeSequence(0, SPAN, mulberry32(9))).toEqual([]);
  });
});

describe('expectedOrder', () => {
  it('keeps a forward line as it lit', () => {
    expect(expectedOrder([4, 0, 7], 'forward')).toEqual([4, 0, 7]);
  });

  it('reverses a line for the last-first stage', () => {
    expect(expectedOrder([4, 0, 7], 'reverse')).toEqual([7, 0, 4]);
  });

  it('does not change the line it was given', () => {
    const line = [4, 0, 7];
    expectedOrder(line, 'reverse');
    expectedOrder(line, 'forward');
    expect(line).toEqual([4, 0, 7]);
  });
});

describe('tap', () => {
  it('reports a right block that leaves the line going on as a step', () => {
    expect(tap([1, 2, 3], 0, 1)).toEqual({ kind: 'step', done: 1 });
    expect(tap([1, 2, 3], 1, 2)).toEqual({ kind: 'step', done: 2 });
  });

  it('reports the last right block as the whole line', () => {
    expect(tap([1, 2], 1, 2)).toEqual({ kind: 'line', done: 2 });
  });

  it('reports a wrong block as a miss and names the block that was due', () => {
    expect(tap([1, 2, 3], 0, 5)).toEqual({ kind: 'miss', done: 0, wanted: 1 });
    expect(tap([1, 2, 3], 1, 1)).toEqual({ kind: 'miss', done: 1, wanted: 2 });
  });

  it('treats a tap past the end of the line as a miss with nothing wanted', () => {
    expect(tap([1, 2], 2, 1)).toEqual({ kind: 'miss', done: 2, wanted: -1 });
  });

  it('scores a full forward line when tapped in order', () => {
    const line = [4, 0, 7];
    const expected = expectedOrder(line, 'forward');
    let res = tap(expected, 0, 4);
    res = tap(expected, res.done, 0);
    res = tap(expected, res.done, 7);
    expect(res.kind).toBe('line');
  });

  it('scores a full reversed line when tapped last first, and marks forward taps wrong', () => {
    const line = [4, 0, 7];
    const expected = expectedOrder(line, 'reverse');
    expect(tap(expected, 0, 4)).toEqual({ kind: 'miss', done: 0, wanted: 7 });
    let res = tap(expected, 0, 7);
    res = tap(expected, res.done, 0);
    res = tap(expected, res.done, 4);
    expect(res.kind).toBe('line');
  });
});

describe('schedule', () => {
  it('spaces each block by the stage tempo', () => {
    expect(schedule({ tempo: 900 }, 4)).toEqual([0, 900, 1800, 2700]);
    expect(schedule(LONG, 3)).toEqual([0, LONG.tempo, 2 * LONG.tempo]);
  });

  it('gives an empty schedule for an empty line', () => {
    expect(schedule(SPAN, 0)).toEqual([]);
  });
});

describe('nextLength', () => {
  const stage = { start: 3, blocks: 9 } as const;

  it('adds one block after a clean line, never past the board', () => {
    expect(nextLength(stage, 5, true)).toBe(6);
    expect(nextLength(stage, 9, true)).toBe(9);
  });

  it('takes one block off after a slip, never under the start', () => {
    expect(nextLength(stage, 5, false)).toBe(4);
    expect(nextLength(stage, 3, false)).toBe(3);
  });
});

describe('recordLine', () => {
  it('sets the best and reports a new best on a clean line', () => {
    const { record, newBest } = recordLine(emptyRecord(), SPAN, 5, true);
    expect(record.best[SPAN.id]).toBe(5);
    expect(newBest).toBe(true);
  });

  it('does not lower the best on a slip, but counts the round', () => {
    const start: BlocksRecord = { best: { [SPAN.id]: 6 }, rounds: { [SPAN.id]: 2 } };
    const { record, newBest } = recordLine(start, SPAN, 8, false);
    expect(record.best[SPAN.id]).toBe(6);
    expect(record.rounds[SPAN.id]).toBe(3);
    expect(newBest).toBe(false);
  });

  it('does not lower the best on a shorter clean line', () => {
    const start: BlocksRecord = { best: { [SPAN.id]: 6 }, rounds: {} };
    const { record, newBest } = recordLine(start, SPAN, 4, true);
    expect(record.best[SPAN.id]).toBe(6);
    expect(newBest).toBe(false);
  });

  it('counts every line as a round, clean or not', () => {
    let rec = emptyRecord();
    rec = recordLine(rec, REVERSE, 4, true).record;
    rec = recordLine(rec, REVERSE, 4, false).record;
    rec = recordLine(rec, REVERSE, 3, false).record;
    expect(rec.rounds[REVERSE.id]).toBe(3);
  });

  it('reports crossed exactly once, on the line that first reaches mastery', () => {
    let rec = emptyRecord();
    const first = recordLine(rec, SPAN, SPAN.mastery - 1, true);
    expect(first.crossed).toBe(false);
    rec = first.record;
    const second = recordLine(rec, SPAN, SPAN.mastery, true);
    expect(second.crossed).toBe(true);
    rec = second.record;
    const third = recordLine(rec, SPAN, SPAN.mastery + 1, true);
    expect(third.crossed).toBe(false);
    expect(third.newBest).toBe(true);
  });

  it('never reports crossed on a slip', () => {
    const { crossed } = recordLine(emptyRecord(), SPAN, SPAN.mastery + 2, false);
    expect(crossed).toBe(false);
  });
});

describe('blocksProgress', () => {
  it('shows the fraction of the mastery bar reached', () => {
    const p = blocksProgress(SPAN, { best: { [SPAN.id]: 3 }, rounds: {} });
    expect(p.best).toBe(3);
    expect(p.mastery).toBe(SPAN.mastery);
    expect(p.toward).toBeCloseTo(3 / SPAN.mastery);
    expect(p.mastered).toBe(false);
  });

  it('caps the fraction at one and marks the stage mastered', () => {
    const p = blocksProgress(SPAN, { best: { [SPAN.id]: 40 }, rounds: {} });
    expect(p.toward).toBe(1);
    expect(p.mastered).toBe(true);
  });

  it('starts at zero for a stage never tapped', () => {
    const p = blocksProgress(LONG, emptyRecord());
    expect(p.best).toBe(0);
    expect(p.toward).toBe(0);
    expect(p.mastered).toBe(false);
  });
});

describe('bestSpan', () => {
  const rec: BlocksRecord = {
    best: { long: 8, reverse: 5, 'shifting-reverse': 7 },
    rounds: {},
  };

  it('takes the largest span over the forward stages only', () => {
    expect(bestSpan(rec, 'forward')).toBe(8);
  });

  it('takes the largest span over the last-first stages only', () => {
    expect(bestSpan(rec, 'reverse')).toBe(7);
  });

  it('gives zero when no stage of that order has been tapped', () => {
    expect(bestSpan({ best: { reverse: 9 }, rounds: {} }, 'forward')).toBe(0);
    expect(bestSpan(emptyRecord(), 'reverse')).toBe(0);
  });
});

describe('parseRecord', () => {
  it('rejects anything that is not an object', () => {
    for (const junk of [null, undefined, 5, 'best', true]) {
      expect(parseRecord(junk)).toEqual(emptyRecord());
    }
  });

  it('drops unknown stage ids', () => {
    expect(parseRecord({ best: { nope: 5 }, rounds: { nope: 2 } })).toEqual(emptyRecord());
  });

  it('drops negative, NaN, infinite and non-number values', () => {
    const rec = parseRecord({
      best: { span: -1, long: Number.NaN, reverse: Number.POSITIVE_INFINITY, twelve: '6' },
      rounds: { span: null, long: [3] },
    });
    expect(rec).toEqual(emptyRecord());
  });

  it('keeps valid values and floors floats', () => {
    const rec = parseRecord({ best: { span: 5.9, long: 8 }, rounds: { reverse: 2.5 } });
    expect(rec.best).toEqual({ span: 5, long: 8 });
    expect(rec.rounds).toEqual({ reverse: 2 });
  });
});

describe('blocksMastered', () => {
  it('counts the stages over their mastery bar', () => {
    const rec: BlocksRecord = {
      best: {
        span: SPAN.mastery,
        long: LONG.mastery - 1,
        reverse: REVERSE.mastery,
      },
      rounds: {},
    };
    expect(blocksMastered(rec)).toBe(2);
  });

  it('is zero for an empty record', () => {
    expect(blocksMastered(emptyRecord())).toBe(0);
  });
});

describe('parseBlocksSave', () => {
  it('gives the first stage and an empty record when nothing is saved', () => {
    expect(parseBlocksSave(null)).toEqual({ stageId: FIRST_BLOCKS_STAGE.id, record: emptyRecord() });
  });

  it('gives defaults for bad JSON', () => {
    expect(parseBlocksSave('{not json')).toEqual({ stageId: FIRST_BLOCKS_STAGE.id, record: emptyRecord() });
  });

  it('falls back to the first stage for an unknown stage id, keeping a valid record', () => {
    const raw = JSON.stringify({ stageId: 'gone', record: { best: { span: 4 }, rounds: {} } });
    const save = parseBlocksSave(raw);
    expect(save.stageId).toBe(FIRST_BLOCKS_STAGE.id);
    expect(save.record.best).toEqual({ span: 4 });
  });

  it('keeps a known stage id', () => {
    expect(parseBlocksSave(JSON.stringify({ stageId: 'twelve', record: {} })).stageId).toBe('twelve');
  });
});
