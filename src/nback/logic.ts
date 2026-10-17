/**
 * N-Back, the pure part: the stages, the run of trials (a tile and, in the dual stage, a
 * tone), which trials are matches, how the player's calls are graded, and the saved record
 * (the best score per stage). Nothing here touches the DOM, audio, timers or storage.
 *
 * Tiles are numbered from 0 here, in reading order on the tray (back row first, left to
 * right); the player hears them numbered from 1. Tones are numbered 0–7, low to high.
 */

export type Rng = () => number;
export type Channel = 'place' | 'tone';

export interface NBackStage {
  id: string;
  /** Full name, e.g. "Two back". */
  title: string;
  short: string;
  /** How to play, for the stage card: two or three short lines, the last a worked example. */
  how: readonly string[];
  n: 1 | 2 | 3;
  channels: readonly Channel[];
  /** Milliseconds from one trial to the next, and how long the tile shows its face. */
  tempo: number;
  show: number;
  /** Scored trials in a run (the first n cannot match and are not scored). */
  trials: number;
  /** Score (percent) that masters the stage. */
  mastery: number;
}

export const NBACK_STAGES: readonly NBackStage[] = [
  {
    id: 'one', title: 'One back', short: 'One back', n: 1, channels: ['place'], tempo: 2400, show: 900, trials: 16, mastery: 85,
    how: ['Press Tile if this square lit up last turn.', 'Turns: centre, centre.', 'Press on the second: it matches turn one.'],
  },
  {
    id: 'two', title: 'Two back', short: 'Two back', n: 2, channels: ['place'], tempo: 2500, show: 900, trials: 18, mastery: 80,
    how: ['Press Tile if this square lit up 2 turns ago.', 'Turns: top-left, centre, top-left.', 'Press on the third: it matches turn one.'],
  },
  {
    id: 'three', title: 'Three back', short: 'Three back', n: 3, channels: ['place'], tempo: 2600, show: 900, trials: 20, mastery: 75,
    how: ['Press Tile if this square lit up 3 turns ago.', 'Turns: top-left, centre, top-right, top-left.', 'Press on the fourth: it matches turn one.'],
  },
  {
    id: 'dual', title: 'Dual two back, square and bell', short: 'Dual two back', n: 2, channels: ['place', 'tone'], tempo: 2800, show: 900, trials: 20, mastery: 75,
    how: ['Press Tile if this square lit up 2 turns ago,', 'and Bell if this note rang 2 turns ago.', 'Notes: low, high, low. Press Bell on the third.'],
  },
];

export const FIRST_NBACK_STAGE = NBACK_STAGES[0]!;

export function nbackStageById(id: string): NBackStage {
  return NBACK_STAGES.find((s) => s.id === id) ?? FIRST_NBACK_STAGE;
}

export const TILES = 9;
export const TONES = 8;
/** Share of scored trials that match, per channel. */
export const MATCH_RATE = 0.3;

export interface Trial {
  place: number;
  tone: number;
}

/**
 * A run of `n + trials` trials. Each channel gets exactly round(trials × MATCH_RATE) matches
 * at random scored places; every other trial is drawn to differ from the one n back, so the
 * only matches are the ones planted.
 */
export function makeRun(stage: Pick<NBackStage, 'n' | 'trials' | 'channels'>, rng: Rng): Trial[] {
  const total = stage.n + stage.trials;
  const want = Math.round(stage.trials * MATCH_RATE);
  const plant = () => {
    const slots = Array.from({ length: stage.trials }, (_, i) => i + stage.n);
    for (let i = slots.length - 1; i > 0; i--) {
      const j = Math.min(i, Math.floor(rng() * (i + 1)));
      [slots[i], slots[j]] = [slots[j]!, slots[i]!];
    }
    return new Set(slots.slice(0, want));
  };
  const fill = (size: number, matches: Set<number>) => {
    const out: number[] = [];
    for (let i = 0; i < total; i++) {
      if (matches.has(i)) out.push(out[i - stage.n]!);
      else {
        const avoid = i >= stage.n ? out[i - stage.n]! : -1;
        let v = Math.min(size - 1, Math.floor(rng() * size));
        if (v === avoid) v = (v + 1 + Math.min(size - 2, Math.floor(rng() * (size - 1)))) % size;
        out.push(v);
      }
    }
    return out;
  };
  const places = fill(TILES, plant());
  const tones = stage.channels.includes('tone') ? fill(TONES, plant()) : Array.from({ length: total }, () => 0);
  return places.map((place, i) => ({ place, tone: tones[i]! }));
}

/** The first n trials have nothing n turns back to match: the player only remembers them. */
export function isWarmup(n: number, i: number): boolean {
  return i >= 0 && i < n;
}

/** Is trial `i` a match on `channel`? */
export function isMatch(run: readonly Trial[], n: number, i: number, channel: Channel): boolean {
  if (i < n || i >= run.length) return false;
  return run[i]![channel] === run[i - n]![channel];
}

/** One channel's tally over a run. */
export interface Tally {
  hits: number;
  misses: number;
  /** Called a match that was not one. */
  false: number;
  /** Rightly let a non-match pass. */
  passes: number;
}

export const emptyTally = (): Tally => ({ hits: 0, misses: 0, false: 0, passes: 0 });

export type Call = 'hit' | 'miss' | 'false' | 'pass';

/** Grade one trial on one channel from whether the player called it. */
export function grade(match: boolean, called: boolean): Call {
  if (match) return called ? 'hit' : 'miss';
  return called ? 'false' : 'pass';
}

export function addCall(t: Tally, c: Call): Tally {
  if (c === 'hit') return { ...t, hits: t.hits + 1 };
  if (c === 'miss') return { ...t, misses: t.misses + 1 };
  if (c === 'false') return { ...t, false: t.false + 1 };
  return { ...t, passes: t.passes + 1 };
}

/**
 * A run's score, in percent: matches caught over matches caught, missed and wrongly called,
 * over every channel. Letting a non-match pass earns nothing and costs nothing, so calling
 * every trial cannot score well and calling none scores nothing.
 */
export function score(tallies: readonly Tally[]): number {
  let good = 0;
  let all = 0;
  for (const t of tallies) {
    good += t.hits;
    all += t.hits + t.misses + t.false;
  }
  return all === 0 ? 0 : Math.round((100 * good) / all);
}

/** Saved progress: the best score per stage, and runs played. */
export interface NBackRecord {
  best: Record<string, number>;
  rounds: Record<string, number>;
}

export const emptyRecord = (): NBackRecord => ({ best: {}, rounds: {} });

export interface NBackProgress {
  best: number;
  mastery: number;
  toward: number;
  mastered: boolean;
}

export function nbackProgress(stage: NBackStage, rec: NBackRecord): NBackProgress {
  const best = rec.best[stage.id] ?? 0;
  return { best, mastery: stage.mastery, toward: Math.min(1, best / stage.mastery), mastered: best >= stage.mastery };
}

/** Record a finished run's score. */
export function recordRun(rec: NBackRecord, stage: NBackStage, pct: number): { record: NBackRecord; crossed: boolean; newBest: boolean } {
  const before = rec.best[stage.id] ?? 0;
  const best = Math.max(before, pct);
  return {
    record: { best: { ...rec.best, [stage.id]: best }, rounds: { ...rec.rounds, [stage.id]: (rec.rounds[stage.id] ?? 0) + 1 } },
    crossed: before < stage.mastery && best >= stage.mastery,
    newBest: best > before,
  };
}

export function nbackMastered(rec: NBackRecord): number {
  return NBACK_STAGES.filter((s) => nbackProgress(s, rec).mastered).length;
}

export function parseRecord(raw: unknown): NBackRecord {
  const rec = emptyRecord();
  if (typeof raw !== 'object' || raw === null) return rec;
  const r = raw as Record<string, unknown>;
  for (const k of ['best', 'rounds'] as const) {
    const m = r[k];
    if (typeof m !== 'object' || m === null) continue;
    for (const [id, v] of Object.entries(m as Record<string, unknown>)) {
      if (NBACK_STAGES.some((s) => s.id === id) && typeof v === 'number' && Number.isFinite(v) && v >= 0) rec[k][id] = Math.min(k === 'best' ? 100 : Infinity, Math.floor(v));
    }
  }
  return rec;
}

// ---------------------------------------------------------------- the words on screen

/** The nine squares by name, in the order they are numbered. */
export const SQUARE_NAMES: readonly string[] = ['top-left', 'top-middle', 'top-right', 'middle-left', 'centre', 'middle-right', 'bottom-left', 'bottom-middle', 'bottom-right'];

/** "the turn before" for one back, "2 turns ago" otherwise. */
export const turnsAgo = (n: number) => (n === 1 ? 'the turn before' : `${n} turns ago`);

/** The question on a channel, for the trial showing now. */
export function promptFor(n: number, ch: Channel): string {
  return ch === 'place' ? `Press Tile if this square also lit up ${turnsAgo(n)}.` : `Press Bell if this note also rang ${turnsAgo(n)}.`;
}

/** The line under the question: the turn, and during the warm-up when matching starts. */
export function turnLine(n: number, at: number, total: number): string {
  if (at < 0) return 'The first square lights up in a moment.';
  const turn = `Turn ${at + 1} of ${total}.`;
  return isWarmup(n, at) ? `${turn} Nothing can match yet: matching starts on turn ${n + 1}.` : turn;
}

/** What the player's call (or a match let slip) was, on which trial. */
export interface Said {
  kind: Exclude<Call, 'pass'>;
  at: number;
}

/**
 * The feedback line for a call, naming what matched or what was there instead. Hits and wrong
 * presses are told on the trial they were made; a miss is told as the next trial starts, so it
 * speaks of the previous square or note.
 */
export function feedbackFor(run: readonly Trial[], n: number, ch: Channel, said: Said): string {
  const thing = ch === 'place' ? 'square' : 'note';
  if (said.kind === 'hit') return `Right: the ${thing} matched ${turnsAgo(n)}.`;
  if (said.kind === 'miss') return `Missed: the previous ${thing} matched the one ${n === 1 ? 'before it' : `${n} turns before it`}.`;
  const now = run[said.at];
  const back = run[said.at - n];
  if (!now || !back) return '';
  const which = n === 1 ? `the last ${thing}` : `the ${thing} ${n} turns ago`;
  if (ch === 'place') return `No match: ${which} was the ${SQUARE_NAMES[back.place]}.`;
  return `No match: ${which} was ${back.tone < now.tone ? 'lower' : 'higher'}.`;
}
