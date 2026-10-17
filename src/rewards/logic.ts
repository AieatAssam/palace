/**
 * Shared rewards, the pure part: the run (correct answers in a row), its milestones,
 * the combo meter that fills between them, and the daily record kept on the hub.
 * Every room reports answers here; nothing in this file touches the DOM, audio or storage.
 */

/** A flourish every this many correct answers in a row. */
export const MILESTONE_EVERY = 5;

/** The word written over the room at each milestone; past the last, the last repeats. */
export const FLOURISHES = ['Bravo', 'Splendid', 'Superb', 'Bravissimo'] as const;

export interface Milestone {
  /** The run that reached it (5, 10, 15 …). */
  streak: number;
  /** 1 at the first milestone of a run, 2 at the second … */
  tier: number;
  word: string;
}

export function flourishFor(tier: number): string {
  return FLOURISHES[Math.min(FLOURISHES.length, Math.max(1, tier)) - 1]!;
}

/** The milestone a run has just reached, or null between milestones. */
export function milestoneAt(streak: number): Milestone | null {
  if (streak <= 0 || streak % MILESTONE_EVERY !== 0) return null;
  const tier = streak / MILESTONE_EVERY;
  return { streak, tier, word: flourishFor(tier) };
}

export interface Combo {
  /** 0–1: how far the run is towards its next milestone. */
  fill: number;
  /** Milestones already passed in this run. */
  tier: number;
  /** Correct answers since the last milestone, and how many it takes. */
  step: number;
  of: number;
}

export function comboOf(streak: number): Combo {
  const s = Math.max(0, Math.floor(streak));
  const step = s % MILESTONE_EVERY;
  return { fill: step / MILESTONE_EVERY, tier: Math.floor(s / MILESTONE_EVERY), step, of: MILESTONE_EVERY };
}

/** One local calendar day's practice, plus the two figures that outlive the day. */
export interface DailyRecord {
  /** Local calendar day, `YYYY-MM-DD`. */
  date: string;
  /** Answers given today, in any room. */
  items: number;
  correct: number;
  /** Longest run today. */
  bestStreak: number;
  /** Days with at least one answer. A missed day never takes one away; it only cools the numeral. */
  days: number;
  /** Longest run on any day. */
  bestEver: number;
  /** The last day anything was answered. */
  lastActive: string | null;
}

/** Local calendar day of a timestamp, `YYYY-MM-DD`. */
export function dayKey(t: number | Date): string {
  const d = typeof t === 'number' ? new Date(t) : t;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function emptyDaily(today: string): DailyRecord {
  return { date: today, items: 0, correct: 0, bestStreak: 0, days: 0, bestEver: 0, lastActive: null };
}

/** A new day: today's figures start again; the day count and the best ever carry over. */
export function rollover(rec: DailyRecord, today: string): DailyRecord {
  if (rec.date === today) return rec;
  return { ...rec, date: today, items: 0, correct: 0, bestStreak: 0 };
}

export interface AnswerResult {
  streak: number;
  daily: DailyRecord;
  milestone: Milestone | null;
  /** This answer set a new longest run for today (only once the run passes 1). */
  dayBest: boolean;
}

/** Record one graded answer: the run grows or breaks, today's figures tick, a milestone may land. */
export function recordAnswer(streak: number, daily: DailyRecord, correct: boolean, today: string): AnswerResult {
  const rec = rollover(daily, today);
  const next = correct ? streak + 1 : 0;
  const firstToday = rec.lastActive !== today;
  const dayBest = correct && next > rec.bestStreak && next > 1;
  return {
    streak: next,
    milestone: correct ? milestoneAt(next) : null,
    dayBest,
    daily: {
      ...rec,
      items: rec.items + 1,
      correct: rec.correct + (correct ? 1 : 0),
      bestStreak: Math.max(rec.bestStreak, next),
      bestEver: Math.max(rec.bestEver, next),
      days: rec.days + (firstToday ? 1 : 0),
      lastActive: today,
    },
  };
}

/** Whether the day count is warm (practised today) or cooled to stone (not yet today). */
export function daysWarm(rec: DailyRecord, today: string): boolean {
  return rec.lastActive === today;
}

const isDay = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
const count = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);

/** Parse a stored record; anything corrupt or missing falls back to an empty day. Rolls over to `today`. */
export function parseDaily(raw: string | null, today: string): DailyRecord {
  if (!raw) return emptyDaily(today);
  let d: unknown;
  try {
    d = JSON.parse(raw);
  } catch {
    return emptyDaily(today);
  }
  if (typeof d !== 'object' || d === null) return emptyDaily(today);
  const r = d as Record<string, unknown>;
  const rec: DailyRecord = {
    date: isDay(r.date) ? r.date : today,
    items: count(r.items),
    correct: count(r.correct),
    bestStreak: count(r.bestStreak),
    days: count(r.days),
    bestEver: count(r.bestEver),
    lastActive: isDay(r.lastActive) ? r.lastActive : null,
  };
  rec.correct = Math.min(rec.correct, rec.items);
  rec.bestEver = Math.max(rec.bestEver, rec.bestStreak);
  return rollover(rec, today);
}
