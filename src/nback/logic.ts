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
  note: string;
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
  { id: 'one', title: 'One back', short: 'One back', note: 'Same tile as the last turn?', n: 1, channels: ['place'], tempo: 2400, show: 900, trials: 16, mastery: 85 },
  { id: 'two', title: 'Two back', short: 'Two back', note: 'Same tile as two back?', n: 2, channels: ['place'], tempo: 2500, show: 900, trials: 18, mastery: 80 },
  { id: 'three', title: 'Three back', short: 'Three back', note: 'Same tile as three back?', n: 3, channels: ['place'], tempo: 2600, show: 900, trials: 20, mastery: 75 },
  { id: 'dual', title: 'Dual two back, tile and tone', short: 'Dual two back', note: 'Watch the tile, hear the bell', n: 2, channels: ['place', 'tone'], tempo: 2800, show: 900, trials: 20, mastery: 75 },
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
