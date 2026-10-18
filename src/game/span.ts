/**
 * The build-up rule every sequence room shares (Echo's bells, Blocks, Ledger's digit span,
 * the Melody recall stage). A run keeps one sequence from start to finish:
 *
 * - a clean line adds one step to the same sequence;
 * - a first miss replays the same line at the same length;
 * - a second miss in a row drops back two steps (never under the stage's start) and keeps
 *   the sequence, so building up again plays the same items as before.
 *
 * Nothing here draws a fresh sequence. Only the player's New action or a new run does that,
 * through `startSpan`. Pure: callers pass their own `draw`.
 */

export interface Span<T> {
  /** Every item the run has drawn, in order. The line in play is the first `length` of them. */
  items: readonly T[];
  /** Items in the line in play. */
  length: number;
  /** Misses in a row at this length: 0, or 1 after a first miss. */
  misses: number;
}

export interface SpanRule {
  /** Items in the first line of a run, and the floor a drop-back stops at. */
  start: number;
  /** Items a clean line adds (default 1). A drop-back is two of these. */
  step?: number;
  /** The longest line the room allows (default: no limit). */
  most?: number;
}

/** The next item of a sequence, given the items before it. */
export type Draw<T> = (before: readonly T[]) => T;

/** Steps a second miss in a row drops back. */
export const DROP_STEPS = 2;

/** What a line's result did to the run. */
export type SpanOutcome =
  /** Clean: the line grew. */
  | 'grow'
  /** Clean at the room's longest line: the same line again. */
  | 'hold'
  /** First miss: the same line again. */
  | 'retry'
  /** Second miss in a row: back two steps. */
  | 'drop';

const stepOf = (rule: SpanRule) => Math.max(1, rule.step ?? 1);
const mostOf = (rule: SpanRule) => Math.max(rule.start, rule.most ?? Infinity);

/** Draw items onto `items` until it holds `length` of them. */
function fill<T>(items: readonly T[], length: number, draw: Draw<T>): T[] {
  const out = [...items];
  while (out.length < length) out.push(draw(out));
  return out;
}

/** A new run: a fresh sequence at the stage's start length. */
export function startSpan<T>(rule: SpanRule, draw: Draw<T>): Span<T> {
  const length = Math.min(rule.start, mostOf(rule));
  return { items: fill([], length, draw), length, misses: 0 };
}

/** The line in play: the sequence's first `length` items. */
export function line<T>(span: Span<T>): T[] {
  return span.items.slice(0, span.length);
}

/**
 * A clean line: one step longer (never past `most`). Items already drawn are reused, so a run
 * that dropped back builds up through the same sequence; only past the end is a new item drawn.
 */
export function spanClean<T>(span: Span<T>, rule: SpanRule, draw: Draw<T>): { span: Span<T>; outcome: SpanOutcome } {
  const length = Math.min(mostOf(rule), span.length + stepOf(rule));
  const outcome: SpanOutcome = length > span.length ? 'grow' : 'hold';
  return { span: { items: fill(span.items, length, draw), length, misses: 0 }, outcome };
}

/** A missed line: the first miss retries the same line; a second in a row drops back two steps. */
export function spanMiss<T>(span: Span<T>, rule: SpanRule): { span: Span<T>; outcome: SpanOutcome } {
  if (span.misses < 1) return { span: { ...span, misses: span.misses + 1 }, outcome: 'retry' };
  const length = Math.max(Math.min(rule.start, span.length), span.length - DROP_STEPS * stepOf(rule));
  return { span: { items: span.items, length, misses: 0 }, outcome: 'drop' };
}

/** Drop-backs in a sitting before the page closes. */
export const DROPS_PER_SITTING = 3;

/**
 * The words a room shows after a miss, the same in every room. `next` is the length of the
 * line that plays next, `ends` says this drop-back closes the sitting, and `count` words the
 * length where a bare number would not do ("1 line").
 */
export function missTitle(outcome: SpanOutcome, next: number, ends = false, count: (n: number) => string = String): string {
  if (outcome !== 'drop') return 'Not quite. Here it is again.';
  return ends ? 'Two misses. That ends the sitting.' : `Two misses. Back to ${count(next)} and building up again.`;
}
