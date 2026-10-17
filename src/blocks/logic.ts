/**
 * Blocks, the pure part: a Corsi block-tapping span. The stages, the sequence the board
 * lights, how a player's taps are checked against it, and the span kept per stage. Nothing
 * here touches the DOM, audio, timers or storage; callers pass their own random source.
 *
 * Blocks are numbered from 0 here, in reading order on the board (back row first, left to
 * right); the player hears them numbered from 1.
 */

export interface BlocksStage {
  id: string;
  /** Full name, e.g. "Nine blocks, last first". */
  title: string;
  /** The stage card's label, e.g. "Last first". */
  short: string;
  /** A few words for the stage card's second line. */
  note: string;
  blocks: 9 | 12 | 16;
  /** Tap the blocks back as they lit, or last first. */
  order: 'forward' | 'reverse';
  /** The board is laid out afresh before every line. */
  shifting: boolean;
  /** Blocks in the first line of a sitting. */
  start: number;
  /** Span (blocks tapped back in one clean line) that masters the stage. */
  mastery: number;
  /** Milliseconds from one block lighting to the next. */
  tempo: number;
}

export const BLOCKS_STAGES: readonly BlocksStage[] = [
  { id: 'span', title: 'Nine blocks', short: 'Nine blocks', note: 'Tap them back in order', blocks: 9, order: 'forward', shifting: false, start: 3, mastery: 6, tempo: 900 },
  { id: 'long', title: 'Nine blocks, long lines', short: 'Long lines', note: 'Lines start at five', blocks: 9, order: 'forward', shifting: false, start: 5, mastery: 8, tempo: 850 },
  { id: 'reverse', title: 'Nine blocks, last first', short: 'Last first', note: 'Nine blocks, back to front', blocks: 9, order: 'reverse', shifting: false, start: 3, mastery: 5, tempo: 950 },
  { id: 'twelve', title: 'Twelve blocks', short: 'Twelve blocks', note: 'A fuller board', blocks: 12, order: 'forward', shifting: false, start: 3, mastery: 7, tempo: 900 },
  { id: 'sixteen', title: 'Sixteen blocks', short: 'Sixteen blocks', note: 'A crowded board', blocks: 16, order: 'forward', shifting: false, start: 3, mastery: 7, tempo: 900 },
  { id: 'shifting', title: 'Nine blocks, moved each line', short: 'Moving board', note: 'Nine blocks, a new layout', blocks: 9, order: 'forward', shifting: true, start: 3, mastery: 6, tempo: 900 },
  { id: 'shifting-reverse', title: 'Twelve blocks, moved, last first', short: 'Moving, last first', note: 'Twelve blocks, back to front', blocks: 12, order: 'reverse', shifting: true, start: 3, mastery: 5, tempo: 950 },
];

export const FIRST_BLOCKS_STAGE = BLOCKS_STAGES[0]!;

export function blocksStageById(id: string): BlocksStage {
  return BLOCKS_STAGES.find((s) => s.id === id) ?? FIRST_BLOCKS_STAGE;
}

/** A stroke of the room's random source, in [0, 1). */
export type Rng = () => number;

/** The longest line a board can light: every block once. */
export function maxLength(stage: Pick<BlocksStage, 'blocks'>): number {
  return stage.blocks;
}

/**
 * A fresh line of `length` different blocks (a block never lights twice in one line, as on
 * Corsi's board). The length is held to the number of blocks.
 */
export function makeSequence(length: number, stage: Pick<BlocksStage, 'blocks'>, rng: Rng): number[] {
  const pool = Array.from({ length: stage.blocks }, (_, i) => i);
  const n = Math.max(0, Math.min(length, pool.length));
  // A partial Fisher–Yates shuffle: the first n of the pool, drawn without replacement.
  for (let i = 0; i < n; i++) {
    const j = i + Math.min(pool.length - 1 - i, Math.floor(rng() * (pool.length - i)));
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }
  return pool.slice(0, n);
}

/** The blocks in the order the player taps them back. */
export function expectedOrder(line: readonly number[], order: BlocksStage['order']): number[] {
  return order === 'reverse' ? [...line].reverse() : [...line];
}

export type TapResult =
  /** Right block; the line goes on. */
  | { kind: 'step'; done: number }
  /** The whole line, tapped back. */
  | { kind: 'line'; done: number }
  /** Wrong block. `wanted` is the block that was due. */
  | { kind: 'miss'; done: number; wanted: number };

/** Check one tap against the expected blocks, `done` of them already tapped. */
export function tap(expected: readonly number[], done: number, block: number): TapResult {
  const want = expected[done];
  if (want === undefined) return { kind: 'miss', done, wanted: -1 };
  if (block !== want) return { kind: 'miss', done, wanted: want };
  const next = done + 1;
  return { kind: next >= expected.length ? 'line' : 'step', done: next };
}

/** When each block of a line lights, in ms from the first. */
export function schedule(stage: Pick<BlocksStage, 'tempo'>, length: number): number[] {
  return Array.from({ length }, (_, i) => i * stage.tempo);
}

/** Missed lines in a sitting before the page closes. */
export const SLIPS_PER_SITTING = 3;

/**
 * The length of the next line: one longer after a clean line (never past the board), one
 * shorter after a slip (never under the stage's start).
 */
export function nextLength(stage: Pick<BlocksStage, 'start' | 'blocks'>, length: number, clean: boolean): number {
  return clean ? Math.min(maxLength(stage), length + 1) : Math.max(stage.start, length - 1);
}

/** Saved progress: the longest clean line per stage, and lines attempted. */
export interface BlocksRecord {
  best: Record<string, number>;
  rounds: Record<string, number>;
}

export function emptyRecord(): BlocksRecord {
  return { best: {}, rounds: {} };
}

export interface BlocksProgress {
  best: number;
  mastery: number;
  /** 0–1: best span over the mastery bar. */
  toward: number;
  mastered: boolean;
}

export function blocksProgress(stage: BlocksStage, rec: BlocksRecord): BlocksProgress {
  const best = rec.best[stage.id] ?? 0;
  return { best, mastery: stage.mastery, toward: Math.min(1, best / stage.mastery), mastered: best >= stage.mastery };
}

/** The room's best span over every stage tapped in one order (forward or last first). */
export function bestSpan(rec: BlocksRecord, order: BlocksStage['order']): number {
  return BLOCKS_STAGES.filter((s) => s.order === order).reduce((m, s) => Math.max(m, rec.best[s.id] ?? 0), 0);
}

/**
 * Record a line. A clean line of `length` blocks may set the stage's best; `crossed` says
 * this line carried the stage over its mastery bar.
 */
export function recordLine(rec: BlocksRecord, stage: BlocksStage, length: number, clean: boolean): { record: BlocksRecord; crossed: boolean; newBest: boolean } {
  const before = rec.best[stage.id] ?? 0;
  const best = clean ? Math.max(before, length) : before;
  const record: BlocksRecord = {
    best: { ...rec.best, [stage.id]: best },
    rounds: { ...rec.rounds, [stage.id]: (rec.rounds[stage.id] ?? 0) + 1 },
  };
  return { record, crossed: before < stage.mastery && best >= stage.mastery, newBest: best > before };
}

/** Parse a saved record; anything malformed falls back to nothing recorded. */
export function parseRecord(raw: unknown): BlocksRecord {
  const rec = emptyRecord();
  if (typeof raw !== 'object' || raw === null) return rec;
  const r = raw as Record<string, unknown>;
  for (const key of ['best', 'rounds'] as const) {
    const m = r[key];
    if (typeof m !== 'object' || m === null) continue;
    for (const [id, v] of Object.entries(m as Record<string, unknown>)) {
      if (BLOCKS_STAGES.some((s) => s.id === id) && typeof v === 'number' && Number.isFinite(v) && v >= 0) rec[key][id] = Math.floor(v);
    }
  }
  return rec;
}

/** Stages over the mastery bar, of all of Blocks' stages. */
export function blocksMastered(rec: BlocksRecord): number {
  return BLOCKS_STAGES.filter((s) => blocksProgress(s, rec).mastered).length;
}
