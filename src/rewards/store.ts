import { create } from 'zustand';
import { chime } from '../audio/engine';
import { type DailyRecord, type Milestone, dayKey, parseDaily, recordAnswer, rollover } from './logic';

/**
 * The shared rewards every room reports to. A room calls `answer(correct)` once per graded
 * answer and `mastered(title)` when an answer carries a stage over its mastery bar; the
 * store keeps the run and the daily record, rings the chime and publishes the transient
 * events the scene and the overlay draw (flourish word, gilt burst, wax seal).
 */
export const DAILY_KEY = 'palace.daily.v1';

export interface Flourish extends Milestone {
  id: number;
  at: number;
}
export interface Burst {
  id: number;
  tier: number;
  at: number;
}
export interface Seal {
  id: number;
  /** The stage that was mastered, e.g. "Low E string · naturals". */
  title: string;
  at: number;
}

interface RewardsState {
  /** Correct answers in a row in the current sitting. */
  streak: number;
  daily: DailyRecord;
  flourish: Flourish | null;
  burst: Burst | null;
  seal: Seal | null;
  /** Grade one answer, in any room. */
  answer(correct: boolean): Milestone | null;
  /** A stage crossed its mastery bar. */
  mastered(title: string): void;
  /** A sitting begins: the run starts from nothing (today's record stands). */
  startRun(): void;
  /** Re-read the day (the hub calls this so a record left open overnight rolls over). */
  refreshDay(): void;
}

interface KV {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function store(): KV | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

/** Clock for the day key; tests may move it. */
export const rewardClock = { now: () => Date.now() };
const today = () => dayKey(rewardClock.now());

export function loadDaily(kv: KV | undefined = store()): DailyRecord {
  try {
    return parseDaily(kv?.getItem(DAILY_KEY) ?? null, today());
  } catch {
    return parseDaily(null, today());
  }
}

function saveDaily(rec: DailyRecord, kv: KV | undefined = store()) {
  try {
    kv?.setItem(DAILY_KEY, JSON.stringify(rec));
  } catch {
    // Quota or privacy mode: the record lives for this visit only.
  }
}

let eventId = 0;

export const useRewards = create<RewardsState>()((set, get) => ({
  streak: 0,
  daily: loadDaily(),
  flourish: null,
  burst: null,
  seal: null,

  answer(correct) {
    const r = recordAnswer(get().streak, get().daily, correct, today());
    saveDaily(r.daily);
    const at = performance.now();
    if (r.milestone) {
      chime('milestone', r.milestone.tier);
      set({
        streak: r.streak,
        daily: r.daily,
        flourish: { ...r.milestone, id: ++eventId, at },
        burst: { id: ++eventId, tier: r.milestone.tier, at },
      });
    } else set({ streak: r.streak, daily: r.daily });
    return r.milestone;
  },

  mastered(title) {
    chime('mastered');
    set({ seal: { id: ++eventId, title, at: performance.now() } });
  },

  startRun() {
    set({ streak: 0 });
  },

  refreshDay() {
    const d = rollover(get().daily, today());
    if (d !== get().daily) set({ daily: d });
  },
}));
