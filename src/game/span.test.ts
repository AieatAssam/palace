import { describe, expect, it, vi } from 'vitest';
import { DROPS_PER_SITTING, DROP_STEPS, line, missTitle, spanClean, spanMiss, startSpan, type Span, type SpanRule } from './span';

/** A draw that hands out a new, never-seen item each time, and counts its calls. */
function counting() {
  let next = 0;
  const draw = vi.fn((_before: readonly number[]) => next++);
  return { draw, reset: () => draw.mockClear() };
}

const RULE: SpanRule = { start: 4 };

/** Run a clean line `n` times from `span`, returning the final span. */
function cleanN(span: Span<number>, rule: SpanRule, draw: (b: readonly number[]) => number, n: number): Span<number> {
  let s = span;
  for (let i = 0; i < n; i++) s = spanClean(s, rule, draw).span;
  return s;
}

describe('startSpan', () => {
  it('starts at the rule start with that many items, no misses', () => {
    const { draw } = counting();
    const s = startSpan(RULE, draw);
    expect(s.length).toBe(4);
    expect(s.items).toHaveLength(4);
    expect(s.misses).toBe(0);
    expect(draw).toHaveBeenCalledTimes(4);
  });

  it('starts at the rule start even when most equals it', () => {
    const { draw } = counting();
    const s = startSpan({ start: 3, most: 3 }, draw);
    expect(s.length).toBe(3);
    expect(s.items).toHaveLength(3);
  });

  it('draws each item from the items before it', () => {
    const seen: number[][] = [];
    startSpan<number>({ start: 3 }, (before) => {
      seen.push([...before]);
      return before.length * 10;
    });
    expect(seen).toEqual([[], [0], [0, 10]]);
  });
});

describe('line', () => {
  it('is the first length items of the sequence', () => {
    const s: Span<string> = { items: ['a', 'b', 'c', 'd'], length: 2, misses: 0 };
    expect(line(s)).toEqual(['a', 'b']);
  });

  it('is a copy, not the items array', () => {
    const s: Span<number> = { items: [1, 2, 3], length: 3, misses: 0 };
    const l = line(s);
    l.push(99);
    expect(s.items).toEqual([1, 2, 3]);
  });
});

describe('spanClean', () => {
  it('appends exactly one item at the end and keeps the prefix', () => {
    const { draw } = counting();
    const before = startSpan(RULE, draw);
    draw.mockClear();
    const seenBefore: number[][] = [];
    const spy = (b: readonly number[]) => {
      seenBefore.push([...b]);
      return draw(b);
    };
    const { span, outcome } = spanClean(before, RULE, spy);
    expect(outcome).toBe('grow');
    expect(span.length).toBe(5);
    expect(span.items).toHaveLength(5);
    expect(span.items.slice(0, 4)).toEqual(before.items);
    expect(draw).toHaveBeenCalledTimes(1);
    expect(seenBefore).toEqual([before.items]);
  });

  it('resets misses to zero', () => {
    const { draw } = counting();
    const s = { ...startSpan(RULE, draw), misses: 1 };
    expect(spanClean(s, RULE, draw).span.misses).toBe(0);
  });

  it('uses the rule step, so a step of two adds two items', () => {
    const { draw } = counting();
    const rule: SpanRule = { start: 8, step: 2 };
    const s = startSpan(rule, draw);
    draw.mockClear();
    const { span } = spanClean(s, rule, draw);
    expect(span.length).toBe(10);
    expect(draw).toHaveBeenCalledTimes(2);
    expect(span.items.slice(0, 8)).toEqual(s.items);
  });

  it('caps at most and reports hold, drawing nothing', () => {
    const { draw } = counting();
    const rule: SpanRule = { start: 3, most: 5 };
    const full = cleanN(startSpan(rule, draw), rule, draw, 2);
    expect(full.length).toBe(5);
    draw.mockClear();
    const { span, outcome } = spanClean(full, rule, draw);
    expect(outcome).toBe('hold');
    expect(span.length).toBe(5);
    expect(span.items).toEqual(full.items);
    expect(draw).not.toHaveBeenCalled();
  });

  it('holds at most even when the step would overshoot it', () => {
    const { draw } = counting();
    const rule: SpanRule = { start: 4, step: 2, most: 5 };
    const s = startSpan(rule, draw);
    const { span, outcome } = spanClean(s, rule, draw);
    expect(outcome).toBe('grow');
    expect(span.length).toBe(5);
    expect(span.items).toHaveLength(5);
  });

  it('does not change the span it was given', () => {
    const { draw } = counting();
    const s = startSpan(RULE, draw);
    const snapshot = { items: [...s.items], length: s.length, misses: s.misses };
    spanClean(s, RULE, draw);
    expect(s).toEqual(snapshot);
  });
});

describe('spanMiss', () => {
  it('first miss retries: same items, same length, misses 1', () => {
    const { draw } = counting();
    const s = startSpan(RULE, draw);
    const { span, outcome } = spanMiss(s, RULE);
    expect(outcome).toBe('retry');
    expect(span.items).toEqual(s.items);
    expect(span.length).toBe(s.length);
    expect(span.misses).toBe(1);
  });

  it('second miss in a row drops two steps, keeps items, misses 0', () => {
    const { draw } = counting();
    const grown = cleanN(startSpan(RULE, draw), RULE, draw, 3); // length 7
    expect(grown.length).toBe(7);
    const once = spanMiss(grown, RULE).span;
    const { span, outcome } = spanMiss(once, RULE);
    expect(outcome).toBe('drop');
    expect(span.length).toBe(7 - DROP_STEPS);
    expect(span.items).toEqual(grown.items);
    expect(span.misses).toBe(0);
  });

  it('drop is two steps, not one', () => {
    expect(DROP_STEPS).toBe(2);
    const { draw } = counting();
    const grown = cleanN(startSpan(RULE, draw), RULE, draw, 2); // length 6
    const once = spanMiss(grown, RULE).span;
    expect(spanMiss(once, RULE).span.length).toBe(4);
  });

  it('floors the drop at the start: start+1 drops to start', () => {
    const { draw } = counting();
    const s = { ...cleanN(startSpan(RULE, draw), RULE, draw, 1), misses: 1 }; // length 5 = start + 1
    expect(s.length).toBe(RULE.start + 1);
    const { span, outcome } = spanMiss(s, RULE);
    expect(outcome).toBe('drop');
    expect(span.length).toBe(RULE.start);
  });

  it('keeps a length already at the start at the start', () => {
    const { draw } = counting();
    const s = { ...startSpan(RULE, draw), misses: 1 };
    const { span, outcome } = spanMiss(s, RULE);
    expect(outcome).toBe('drop');
    expect(span.length).toBe(RULE.start);
    expect(span.items).toEqual(s.items);
  });

  it('a step of two (Ledger long) drops four', () => {
    const { draw } = counting();
    const rule: SpanRule = { start: 8, step: 2, most: 30 };
    const grown = cleanN(startSpan(rule, draw), rule, draw, 4); // length 16
    expect(grown.length).toBe(16);
    const once = spanMiss(grown, rule).span;
    const { span, outcome } = spanMiss(once, rule);
    expect(outcome).toBe('drop');
    expect(span.length).toBe(12);
    expect(span.items).toEqual(grown.items);
  });

  it('a step of two floors at the start too', () => {
    const { draw } = counting();
    const rule: SpanRule = { start: 8, step: 2 };
    const grown = cleanN(startSpan(rule, draw), rule, draw, 1); // length 10
    const once = spanMiss(grown, rule).span;
    expect(spanMiss(once, rule).span.length).toBe(8);
  });
});

describe('miss then clean', () => {
  it('a clean line resets misses, so miss, clean, miss is a retry, not a drop', () => {
    const { draw } = counting();
    let s = startSpan(RULE, draw);
    const m1 = spanMiss(s, RULE);
    expect(m1.outcome).toBe('retry');
    s = spanClean(m1.span, RULE, draw).span;
    expect(s.misses).toBe(0);
    const m2 = spanMiss(s, RULE);
    expect(m2.outcome).toBe('retry');
    expect(m2.span.length).toBe(5);
  });
});

describe('drop-back and rebuild', () => {
  it('building up after a drop replays the same items without drawing', () => {
    const { draw, reset } = counting();
    // Build up to length 7 (draws 3 more beyond the start of 4).
    let s = cleanN(startSpan(RULE, draw), RULE, draw, 3);
    const before = [...s.items];
    // Two misses: drop from 7 to 5.
    s = spanMiss(s, RULE).span;
    s = spanMiss(s, RULE).span;
    expect(s.length).toBe(5);
    expect(s.items).toEqual(before);
    reset();
    // Clean to 6 and 7: both come from items already drawn.
    s = spanClean(s, RULE, draw).span;
    expect(s.length).toBe(6);
    s = spanClean(s, RULE, draw).span;
    expect(s.length).toBe(7);
    expect(draw).toHaveBeenCalledTimes(0);
    expect(s.items).toEqual(before);
    // Only the clean past the end draws.
    s = spanClean(s, RULE, draw).span;
    expect(s.length).toBe(8);
    expect(draw).toHaveBeenCalledTimes(1);
    expect(s.items.slice(0, 7)).toEqual(before);
  });
});

describe('no regeneration over a long run', () => {
  it('the items array is always a prefix-extension of the previous one', () => {
    // A deterministic pseudo-random outcome stream (clean or miss) from a fixed seed.
    let seed = 7;
    const coin = () => {
      seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
      return (seed >>> 16) % 2 === 0;
    };
    for (const rule of [RULE, { start: 3, step: 2, most: 12 } as SpanRule]) {
      const { draw } = counting();
      let s = startSpan(rule, draw);
      for (let i = 0; i < 500; i++) {
        const prev = [...s.items];
        const next = coin() ? spanClean(s, rule, draw) : spanMiss(s, rule);
        s = next.span;
        // The old items are never changed or reordered; new ones only go on the end.
        expect(s.items.slice(0, prev.length)).toEqual(prev);
        expect(s.length).toBeGreaterThanOrEqual(rule.start);
        expect(s.length).toBeLessThanOrEqual(rule.most ?? Infinity);
        expect(s.length).toBeLessThanOrEqual(s.items.length);
        expect(s.misses).toBeGreaterThanOrEqual(0);
        expect(s.misses).toBeLessThanOrEqual(1);
      }
      // Every item in the sequence is distinct, so reuse is observable.
      expect(new Set(s.items).size).toBe(s.items.length);
    }
  });
});

describe('missTitle', () => {
  it('retry says it is here again', () => {
    expect(missTitle('retry', 5)).toBe('Not quite. Here it is again.');
  });

  it('drop names the length it goes back to', () => {
    expect(missTitle('drop', 6)).toBe('Two misses. Back to 6 and building up again.');
  });

  it('the drop that ends the sitting says so', () => {
    expect(missTitle('drop', 6, true)).toBe('Two misses. That ends the sitting.');
  });

  it('uses the custom count function for the length', () => {
    expect(missTitle('drop', 1, false, (n) => `${n} line${n === 1 ? '' : 's'}`)).toBe('Two misses. Back to 1 line and building up again.');
    expect(missTitle('drop', 3, false, (n) => `${n} lines`)).toBe('Two misses. Back to 3 lines and building up again.');
  });

  it('a grow or hold outcome gets the retry wording', () => {
    expect(missTitle('grow', 5)).toBe('Not quite. Here it is again.');
  });
});

describe('DROPS_PER_SITTING', () => {
  it('ends the sitting after three drop-backs', () => {
    expect(DROPS_PER_SITTING).toBe(3);
  });
});
