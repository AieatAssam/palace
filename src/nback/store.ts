import { create } from 'zustand';
import { haptic, knock, ringBell, tapBlock, unlockAudio } from '../audio/engine';
import { useRewards } from '../rewards/store';
import { onResetProgress, usePalace } from '../store';
import { CAPTURE } from '../three/quality';
import {
  type Call,
  type Channel,
  type NBackRecord,
  type NBackStage,
  type Said,
  type Tally,
  type Trial,
  FIRST_NBACK_STAGE,
  NBACK_STAGES,
  addCall,
  emptyRecord,
  emptyTally,
  grade,
  isMatch,
  isWarmup,
  makeRun,
  nbackStageById,
  parseRecord,
  recordRun,
  score,
} from './logic';

/**
 * N-Back's state: the run of trials, the trial showing now, what the player has called on
 * it, the tallies, and the saved record (the best score per stage).
 *
 * rest → run (a tile turns, and in the dual stage a bell rings, every `tempo` ms; the player
 * calls Tile or Bell when it matches n back) → done (the score is entered) → the page closes.
 */
export const NBACK_KEY = 'palace.nback.v1';

export type NBackPhase = 'rest' | 'run' | 'done';

/** The flash on a call button: a caught match, a wrong call, or a match let slip. */
export interface Flash {
  kind: Exclude<Call, 'pass'>;
  id: number;
}

export interface NBackSitting {
  score: number;
  tallies: Record<Channel, Tally>;
  newBest: boolean;
  mastered: boolean;
  finished: boolean;
}

interface NBackSave {
  stageId: string;
  record: NBackRecord;
}

interface NBackState extends NBackSave {
  phase: NBackPhase;
  run: Trial[];
  /** The trial under way (0-based), or -1 before the first. */
  at: number;
  /** The tile is face up (the first part of a trial). */
  showing: boolean;
  called: Record<Channel, boolean>;
  tallies: Record<Channel, Tally>;
  flash: Record<Channel, Flash | null>;
  /** The latest graded call per channel, for the feedback line: cleared as each trial starts, unless it is a miss on the trial just ended. */
  said: Record<Channel, Said | null>;
  sitting: NBackSitting;
  active: boolean;
  stage(): NBackStage;
  chooseStage(id: string): void;
  setActive(on: boolean): void;
  /** The player calls a match on a channel (the Tile or Bell key). */
  call(channel: Channel): void;
  /** End the trial under way now (test hook: the run moves on without waiting). */
  step(): void;
  again(): void;
  end(): void;
}

/** Eight bells, a major scale from C5. */
export const TONE_FREQS = [523.25, 587.33, 659.25, 698.46, 783.99, 880, 987.77, 1046.5];
const LEAD_IN = 900;
const DONE_PAUSE = 1400;

const emptyTallies = (): Record<Channel, Tally> => ({ place: emptyTally(), tone: emptyTally() });
const emptySitting = (): NBackSitting => ({ score: 0, tallies: emptyTallies(), newBest: false, mastered: false, finished: false });

function kv(): Storage | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

export function parseNBackSave(raw: string | null): NBackSave {
  try {
    const d = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    const stageId = typeof d.stageId === 'string' && NBACK_STAGES.some((s) => s.id === d.stageId) ? d.stageId : FIRST_NBACK_STAGE.id;
    return { stageId, record: parseRecord(d.record) };
  } catch {
    return { stageId: FIRST_NBACK_STAGE.id, record: emptyRecord() };
  }
}

function loadSave(): NBackSave {
  try {
    return parseNBackSave(kv()?.getItem(NBACK_KEY) ?? null);
  } catch {
    return parseNBackSave(null);
  }
}

function persist(save: NBackSave) {
  try {
    kv()?.setItem(NBACK_KEY, JSON.stringify(save));
  } catch {
    // Quota or privacy mode: the record lives for this visit only.
  }
}

const PACE = CAPTURE ? 24 : 1;
let timers: ReturnType<typeof setTimeout>[] = [];
function clearTimers() {
  for (const t of timers) clearTimeout(t);
  timers = [];
}
function later(ms: number, fn: () => void) {
  timers.push(setTimeout(fn, ms * PACE));
}

let flashId = 0;

/** When the tile under way turned face up, for the scene's flip (kept out of React). */
export const nbackFx = { shownAt: -Infinity, hideAt: Infinity, place: -1 };

export const useNBack = create<NBackState>()((set, get) => {
  const initial = loadSave();
  const stage = () => nbackStageById(get().stageId);
  const buzz = (ms: number) => {
    if (usePalace.getState().saved.settings.haptics) haptic(ms);
  };
  const flash = (ch: Channel, kind: Flash['kind']) => set({ flash: { ...get().flash, [ch]: { kind, id: ++flashId } }, said: { ...get().said, [ch]: { kind, at: get().at } } });

  /** Turn trial `i` face up, and set its end. */
  const show = (i: number) => {
    clearTimers();
    const st = stage();
    const t = get().run[i]!;
    const now = performance.now();
    nbackFx.shownAt = now;
    nbackFx.hideAt = now + st.show * PACE;
    nbackFx.place = t.place;
    // A miss on the trial just ended stays on the feedback line; anything older goes.
    const keep = (x: Said | null) => (x && x.kind === 'miss' && x.at === i - 1 ? x : null);
    const said = get().said;
    set({ at: i, showing: true, called: { place: false, tone: false }, said: { place: keep(said.place), tone: keep(said.tone) } });
    if (st.channels.includes('tone')) ringBell(TONE_FREQS[t.tone]!, 0.8);
    else tapBlock(0, 0.45);
    later(st.show, () => set({ showing: false }));
    later(st.tempo, finishTrial);
  };

  /** Grade the trial under way on every channel the stage uses, then turn the next. */
  const finishTrial = () => {
    clearTimers();
    const st = stage();
    const { run, at, called } = get();
    if (at < 0 || get().phase !== 'run') return;
    nbackFx.hideAt = Math.min(nbackFx.hideAt, performance.now());
    if (!isWarmup(st.n, at)) {
      let tallies = get().tallies;
      for (const ch of st.channels) {
        const c = grade(isMatch(run, st.n, at, ch), called[ch]);
        tallies = { ...tallies, [ch]: addCall(tallies[ch], c) };
        // A match let slip is told now; hits and wrong calls were told when called.
        if (c === 'miss') {
          flash(ch, 'miss');
          useRewards.getState().answer(false);
        }
      }
      set({ tallies });
    }
    if (at + 1 < run.length) return show(at + 1);
    // The run is over: the score goes in the record.
    const tallies = get().tallies;
    const pct = score(st.channels.map((ch) => tallies[ch]));
    const { record, crossed, newBest } = recordRun(get().record, st, pct);
    persist({ stageId: st.id, record });
    if (crossed) useRewards.getState().mastered(st.title);
    set({ record, phase: 'done', showing: false, sitting: { score: pct, tallies, newBest, mastered: crossed, finished: true } });
    later(DONE_PAUSE, () => usePalace.getState().endSession());
  };

  const resetSitting = () => {
    clearTimers();
    nbackFx.shownAt = -Infinity;
    nbackFx.place = -1;
    set({ phase: 'rest', run: makeRun(stage(), Math.random), at: -1, showing: false, called: { place: false, tone: false }, tallies: emptyTallies(), flash: { place: null, tone: null }, said: { place: null, tone: null }, sitting: emptySitting() });
  };

  return {
    ...initial,
    phase: 'rest',
    run: makeRun(nbackStageById(initial.stageId), Math.random),
    at: -1,
    showing: false,
    called: { place: false, tone: false },
    tallies: emptyTallies(),
    flash: { place: null, tone: null },
    said: { place: null, tone: null },
    sitting: emptySitting(),
    active: false,

    stage,

    chooseStage(id) {
      const st = nbackStageById(id);
      const save = { stageId: st.id, record: get().record };
      persist(save);
      set(save);
      resetSitting();
      const palace = usePalace.getState();
      if (palace.screen === 'hub') {
        useNBack.setState({ active: false });
        palace.enterRoom('nback');
      } else palace.closeStages();
    },

    setActive(on) {
      if (on === get().active) return;
      set({ active: on });
      if (!on) {
        // A run broken off starts afresh on return: a half-run would score nothing fair.
        if (get().phase === 'run') resetSitting();
        else clearTimers();
        return;
      }
      if (get().sitting.finished) return usePalace.getState().endSession();
      set({ phase: 'run', at: -1 });
      later(LEAD_IN, () => show(0));
    },

    call(ch) {
      unlockAudio();
      const st = stage();
      const { phase, at, called, run, active } = get();
      // The first n trials have nothing n back to match: a call there is ignored.
      if (!active || phase !== 'run' || at < 0 || isWarmup(st.n, at) || !st.channels.includes(ch) || called[ch]) return;
      set({ called: { ...called, [ch]: true } });
      const rewards = useRewards.getState();
      if (isMatch(run, st.n, at, ch)) {
        flash(ch, 'hit');
        if (rewards.answer(true)) buzz(24);
        else buzz(8);
      } else {
        flash(ch, 'false');
        rewards.answer(false);
        knock();
        buzz(30);
      }
    },

    step() {
      if (get().phase === 'run' && get().at >= 0) finishTrial();
    },

    again() {
      resetSitting();
      set({ active: false });
      usePalace.getState().enterRoom('nback');
    },

    end() {
      clearTimers();
      usePalace.getState().endSession();
    },
  };
});

onResetProgress(() => {
  const save = { stageId: useNBack.getState().stageId, record: emptyRecord() };
  persist(save);
  useNBack.setState(save);
});
