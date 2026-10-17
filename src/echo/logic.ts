/**
 * Echo, the pure part: the stages, the line of bells the room plays, how a player's
 * strokes are checked against it, and the span kept per stage. Nothing here touches the
 * DOM, audio, timers or storage; callers pass their own random source.
 *
 * A line is a list of steps. A step is the bells struck together: one bell, or two in the
 * chord stage. Bells are numbered from 0 here (the player sees 1..n), lowest pitch first.
 */

export type Step = readonly number[];
export type Line = readonly Step[];

export interface EchoStage {
  id: string;
  /** Full name, e.g. "Six bells, last first". */
  title: string;
  /** The stage card's label, e.g. "Last first". */
  short: string;
  /** A few words for the stage card's second line. */
  note: string;
  bells: 4 | 6 | 8;
  /** Ring the line back as heard, or last stroke first. */
  order: 'forward' | 'reverse';
  /** Some steps strike two bells at once. */
  chords: boolean;
  /** Milliseconds from one stroke to the next at the opening length. */
  tempo: number;
  /** The quickest the line may run as it grows. */
  floor: number;
  /** Strokes in the first line of a sitting. */
  start: number;
  /** Span (strokes rung back in one clean line) that masters the stage. */
  mastery: number;
}

export const ECHO_STAGES: readonly EchoStage[] = [
  { id: 'four', title: 'Four bells', short: 'Four bells', note: 'Ring back as heard', bells: 4, order: 'forward', chords: false, tempo: 680, floor: 480, start: 3, mastery: 8 },
  { id: 'six', title: 'Six bells', short: 'Six bells', note: 'Ring back as heard', bells: 6, order: 'forward', chords: false, tempo: 680, floor: 480, start: 3, mastery: 7 },
  { id: 'eight', title: 'Eight bells', short: 'Eight bells', note: 'Ring back as heard', bells: 8, order: 'forward', chords: false, tempo: 680, floor: 480, start: 3, mastery: 7 },
  { id: 'reverse', title: 'Six bells, last first', short: 'Last first', note: 'Six bells, back to front', bells: 6, order: 'reverse', chords: false, tempo: 720, floor: 520, start: 3, mastery: 6 },
  { id: 'swift', title: 'Six bells, quick time', short: 'Quick time', note: 'Six bells, a faster beat', bells: 6, order: 'forward', chords: false, tempo: 430, floor: 300, start: 3, mastery: 7 },
  { id: 'chord', title: 'Six bells, in pairs', short: 'In pairs', note: 'Six bells, two at once', bells: 6, order: 'forward', chords: true, tempo: 820, floor: 620, start: 2, mastery: 5 },
];

export const FIRST_ECHO_STAGE = ECHO_STAGES[0]!;

export function echoStageById(id: string): EchoStage {
  return ECHO_STAGES.find((s) => s.id === id) ?? FIRST_ECHO_STAGE;
}

/** A stroke of the room's random source, in [0, 1). */
export type Rng = () => number;

/** Chance that a step in the chord stage is a pair (the first step is always one bell). */
export const CHORD_CHANCE = 0.4;

/**
 * The next step for a line: one bell (or, in the chord stage, sometimes two). A bell never
 * sounds three times running; that would be a held note, not a line to remember.
 */
export function nextStep(line: Line, stage: Pick<EchoStage, 'bells' | 'chords'>, rng: Rng): Step {
  const n = stage.bells;
  const pick = (avoid: number[]) => {
    const pool = Array.from({ length: n }, (_, i) => i).filter((b) => !avoid.includes(b));
    return pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))]!;
  };
  const a = line[line.length - 1];
  const b = line[line.length - 2];
  const held = a && b && a.length === 1 && b.length === 1 && a[0] === b[0] ? [a[0]!] : [];
  if (stage.chords && line.length > 0 && rng() < CHORD_CHANCE) {
    const first = pick([]);
    const second = pick([first]);
    return [first, second].sort((x, y) => x - y);
  }
  return [pick(held)];
}

/** A fresh line of `length` steps. */
export function makeLine(length: number, stage: Pick<EchoStage, 'bells' | 'chords'>, rng: Rng): Step[] {
  const line: Step[] = [];
  while (line.length < length) line.push(nextStep(line, stage, rng));
  return line;
}

/** The line one step longer: the same strokes, and one more at the end. */
export function extendLine(line: Line, stage: Pick<EchoStage, 'bells' | 'chords'>, rng: Rng): Step[] {
  return [...line, nextStep(line, stage, rng)];
}

/** The steps in the order the player rings them back. */
export function expectedOrder(line: Line, order: EchoStage['order']): Step[] {
  return order === 'reverse' ? [...line].reverse() : [...line];
}

/** Where the player is in ringing a line back. */
export interface Recall {
  /** Steps rung back in full. */
  done: number;
  /** Bells already struck in the current step (a pair takes two strokes, in either order). */
  partial: readonly number[];
}

export const FRESH_RECALL: Recall = { done: 0, partial: [] };

export type StrokeResult =
  /** Right bell; the step still wants its other bell. */
  | { kind: 'held'; recall: Recall }
  /** Right bell; the step is complete, the line is not. */
  | { kind: 'step'; recall: Recall }
  /** The whole line, rung back. */
  | { kind: 'line'; recall: Recall }
  /** Wrong bell (or one already struck in this pair). `wanted` is what the step still needed. */
  | { kind: 'miss'; recall: Recall; wanted: number[] };

/** Check one stroke against the expected steps. */
export function strike(expected: Line, recall: Recall, bell: number): StrokeResult {
  const step = expected[recall.done];
  if (!step) return { kind: 'miss', recall, wanted: [] };
  const wanted = step.filter((b) => !recall.partial.includes(b));
  if (!wanted.includes(bell)) return { kind: 'miss', recall, wanted };
  const partial = [...recall.partial, bell];
  if (partial.length < step.length) return { kind: 'held', recall: { done: recall.done, partial } };
  const done = recall.done + 1;
  return { kind: done >= expected.length ? 'line' : 'step', recall: { done, partial: [] } };
}

/** The bells still wanted for the current step (what a perfect player strikes next). */
export function wantedNow(expected: Line, recall: Recall): number[] {
  const step = expected[recall.done];
  return step ? step.filter((b) => !recall.partial.includes(b)) : [];
}

/** Strokes (bells struck) in a line: a pair counts twice. */
export function strokes(line: Line): number {
  return line.reduce((n, s) => n + s.length, 0);
}

/**
 * Milliseconds between strokes for a line of `length` steps: the stage's tempo at the
 * opening length, drifting three percent quicker with each step added, never past its floor.
 */
export function interval(stage: Pick<EchoStage, 'tempo' | 'floor' | 'start'>, length: number): number {
  const grown = Math.max(0, length - stage.start);
  return Math.max(stage.floor, Math.round(stage.tempo * Math.pow(0.97, grown)));
}

/** When each step of a line sounds, in ms from the first stroke. */
export function schedule(stage: Pick<EchoStage, 'tempo' | 'floor' | 'start'>, length: number): number[] {
  const gap = interval(stage, length);
  return Array.from({ length }, (_, i) => i * gap);
}

/** Missed lines in a sitting before the page closes. */
export const SLIPS_PER_SITTING = 3;

/** The length of the next line: one longer after a clean line; one shorter (never under the start) after a slip. */
export function nextLength(stage: Pick<EchoStage, 'start'>, length: number, clean: boolean): number {
  return clean ? length + 1 : Math.max(stage.start, length - 1);
}

/** Saved progress: the longest clean line per stage, and lines rung. */
export interface EchoRecord {
  /** Steps in the longest line rung back clean, by stage id. */
  best: Record<string, number>;
  /** Lines attempted, by stage id. */
  rounds: Record<string, number>;
}

export function emptyRecord(): EchoRecord {
  return { best: {}, rounds: {} };
}

export interface EchoProgress {
  best: number;
  mastery: number;
  /** 0–1: best span over the mastery bar. */
  toward: number;
  mastered: boolean;
}

export function echoProgress(stage: EchoStage, rec: EchoRecord): EchoProgress {
  const best = rec.best[stage.id] ?? 0;
  return { best, mastery: stage.mastery, toward: Math.min(1, best / stage.mastery), mastered: best >= stage.mastery };
}

/**
 * Record a line. A clean line of `length` steps may set the stage's best; `crossed` says
 * this line carried the stage over its mastery bar.
 */
export function recordLine(rec: EchoRecord, stage: EchoStage, length: number, clean: boolean): { record: EchoRecord; crossed: boolean; newBest: boolean } {
  const before = rec.best[stage.id] ?? 0;
  const best = clean ? Math.max(before, length) : before;
  const record: EchoRecord = {
    best: { ...rec.best, [stage.id]: best },
    rounds: { ...rec.rounds, [stage.id]: (rec.rounds[stage.id] ?? 0) + 1 },
  };
  return { record, crossed: before < stage.mastery && best >= stage.mastery, newBest: best > before };
}

/** Parse a saved record; anything malformed falls back to nothing recorded. */
export function parseRecord(raw: unknown): EchoRecord {
  const rec = emptyRecord();
  if (typeof raw !== 'object' || raw === null) return rec;
  const r = raw as Record<string, unknown>;
  for (const key of ['best', 'rounds'] as const) {
    const m = r[key];
    if (typeof m !== 'object' || m === null) continue;
    for (const [id, v] of Object.entries(m as Record<string, unknown>)) {
      if (ECHO_STAGES.some((s) => s.id === id) && typeof v === 'number' && Number.isFinite(v) && v >= 0) rec[key][id] = Math.floor(v);
    }
  }
  return rec;
}

/** A step as the player reads it: "4", or "2 and 5" for a pair (numbers from 1). */
export function stepLabel(step: Step): string {
  return step.map((b) => String(b + 1)).join(' and ');
}
