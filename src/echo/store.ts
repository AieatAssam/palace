import { create } from 'zustand';
import { haptic, knock, ringBell, unlockAudio } from '../audio/engine';
import { bellScale, pairGain } from '../audio/bells';
import { useRewards } from '../rewards/store';
import { onResetProgress, usePalace } from '../store';
import { CAPTURE } from '../three/quality';

/** Source of randomness for new lines. Tests can swap in a seeded one via the test hooks. */
export const lineRng: { current: () => number } = { current: Math.random };

import { DROPS_PER_SITTING, type Span, type SpanOutcome, line as inPlay, spanClean, spanMiss, startSpan } from '../game/span';
import { clearStrikes, markStrike as mark } from './fx';
import {
  type EchoRecord,
  type EchoStage,
  FIRST_ECHO_STAGE,
  FRESH_RECALL,
  type Recall,
  type Step,
  ECHO_STAGES,
  echoProgress,
  echoStageById,
  emptyRecord,
  expectedOrder,
  interval,
  nextStep,
  parseRecord,
  recordLine,
  schedule,
  strike,
} from './logic';

/**
 * Echo's state: the line on the bells, the player's place in ringing it back, the sitting
 * and the saved record (the longest clean line per stage). The palace store owns the
 * screen; this store follows it through `setActive`, which the overlay drives from its
 * `hidden` flag (play, with no card or settings over it).
 *
 * rest → listen (the room plays the line) → repeat (the player rings it back)
 *      → clean | slip → listen … until three drop-backs close the page.
 *
 * The tune lasts the whole sitting (`game/span.ts`): a clean line adds a bell to it, a first
 * miss plays the same line again, a second miss in a row goes back two bells. Only New tune
 * or a new sitting draws a fresh one.
 */
export const ECHO_KEY = 'palace.echo.v1';

export type EchoPhase = 'rest' | 'listen' | 'repeat' | 'clean' | 'slip';

export interface EchoSitting {
  /** Lines attempted and lines rung back clean. */
  lines: number;
  clean: number;
  /** Steps in the longest clean line this sitting. */
  longest: number;
  /** Lines missed, and drop-backs (two misses in a row). */
  slips: number;
  drops: number;
  /** The stage crossed its mastery bar this sitting. */
  mastered: boolean;
  /** The sitting beat the stage's best. */
  newBest: boolean;
}

export interface EchoSlip {
  /** The bell struck, and the bells the step wanted. */
  struck: number;
  wanted: number[];
  /** The line as it should have been rung back. */
  expected: Step[];
  /** 'retry': the same line again; 'drop': back two steps. */
  outcome: SpanOutcome;
  /** Steps in the line that plays next. */
  next: number;
}

interface EchoSave {
  stageId: string;
  record: EchoRecord;
}

interface EchoState extends EchoSave {
  phase: EchoPhase;
  /** The sitting's tune; `line` is the part in play. */
  span: Span<Step>;
  line: Step[];
  recall: Recall;
  /** The step sounding while the room plays the line, or -1. */
  sounding: number;
  slip: EchoSlip | null;
  sitting: EchoSitting;
  active: boolean;
  stage(): EchoStage;
  /** Put a stage on the bells; from the hub this walks into the room. */
  chooseStage(id: string): void;
  /** The overlay is live (play, nothing over it) or not. */
  setActive(on: boolean): void;
  /** A stroke on bell `bell` (0-based), from a tap, a click or a number key. */
  press(bell: number): void;
  /** A fresh tune at the stage's opening length (the sitting goes on). */
  newTune(): void;
  /** Session sheet → a fresh sitting. */
  again(): void;
  end(): void;
}

/** Pauses (ms): before the room plays, after a clean line, after a slip (long enough to see the green bell). */
const LEAD_IN = 650;
const CLEAN_PAUSE = 850;
const SLIP_PAUSE = 1700;

function emptySitting(): EchoSitting {
  return { lines: 0, clean: 0, longest: 0, slips: 0, drops: 0, mastered: false, newBest: false };
}

function kv(): Storage | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

export function parseEchoSave(raw: string | null): EchoSave {
  try {
    const d = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    const stageId = typeof d.stageId === 'string' && ECHO_STAGES.some((s) => s.id === d.stageId) ? d.stageId : FIRST_ECHO_STAGE.id;
    return { stageId, record: parseRecord(d.record) };
  } catch {
    return { stageId: FIRST_ECHO_STAGE.id, record: emptyRecord() };
  }
}

function loadSave(): EchoSave {
  try {
    return parseEchoSave(kv()?.getItem(ECHO_KEY) ?? null);
  } catch {
    return parseEchoSave(null);
  }
}

function persist(save: EchoSave) {
  try {
    kv()?.setItem(ECHO_KEY, JSON.stringify(save));
  } catch {
    // Quota or privacy mode: the record lives for this visit only.
  }
}

/**
 * `?capture` (stills on a slow software renderer, a frame every few seconds): the room's
 * timeline runs this many times slower, so a still can catch a bell while it is lit.
 */
const PACE = CAPTURE ? 24 : 1;
const markStrike = (bell: number, kind: Parameters<typeof mark>[1], hold: number) => mark(bell, kind, hold * PACE);

let timers: ReturnType<typeof setTimeout>[] = [];
function clearTimers() {
  for (const t of timers) clearTimeout(t);
  timers = [];
}
function later(ms: number, fn: () => void) {
  timers.push(setTimeout(fn, ms * PACE));
}

function ring(stage: EchoStage, bells: readonly number[], velocity: number, damp = 1) {
  const scale = bellScale(stage.bells);
  const g = pairGain(bells.length);
  for (const b of bells) ringBell(scale[b]!.freq, velocity * g, damp);
}

export const useEcho = create<EchoState>()((set, get) => {
  const initial = loadSave();
  const stage = () => echoStageById(get().stageId);
  const buzz = (ms: number) => {
    if (usePalace.getState().saved.settings.haptics) haptic(ms);
  };

  /** The room plays the line, then hands the bells to the player. */
  const playLine = (delay: number) => {
    clearTimers();
    const st = stage();
    const line = get().line;
    const gap = interval(st, line.length);
    set({ phase: 'listen', recall: FRESH_RECALL, sounding: -1, slip: null });
    schedule(st, line.length).forEach((t, i) => {
      later(delay + t, () => {
        const step = line[i]!;
        set({ sounding: i });
        for (const b of step) markStrike(b, 'cue', gap * 0.55);
        ring(st, step, 0.9);
      });
    });
    later(delay + (line.length - 1) * gap + Math.max(380, gap * 0.8), () => set({ phase: 'repeat', sounding: -1 }));
  };

  const draw = (st: EchoStage) => (before: readonly Step[]) => nextStep(before, st, lineRng.current);
  /** A fresh tune at the stage's opening length. */
  const freshSpan = (st: EchoStage) => startSpan(st, draw(st));
  const withSpan = (span: Span<Step>) => ({ span, line: inPlay(span) });

  const resetSitting = () => {
    clearTimers();
    clearStrikes();
    set({ ...withSpan(freshSpan(stage())), recall: FRESH_RECALL, phase: 'rest', sounding: -1, slip: null, sitting: emptySitting() });
  };

  return {
    ...initial,
    phase: 'rest',
    ...withSpan(freshSpan(echoStageById(initial.stageId))),
    recall: FRESH_RECALL,
    sounding: -1,
    slip: null,
    sitting: emptySitting(),
    active: false,

    stage,

    chooseStage(id) {
      const st = echoStageById(id);
      const save = { stageId: st.id, record: get().record };
      persist(save);
      set(save);
      resetSitting();
      const palace = usePalace.getState();
      if (palace.screen === 'hub') {
        useEcho.setState({ active: false });
        palace.enterRoom('echo');
      } else palace.closeStages();
    },

    setActive(on) {
      if (on === get().active) return;
      set({ active: on });
      if (!on) {
        clearTimers();
        // Whatever was under way stops; the line plays again from the start on return.
        set({ phase: 'rest', recall: FRESH_RECALL, sounding: -1 });
        return;
      }
      if (get().sitting.drops >= DROPS_PER_SITTING) return usePalace.getState().endSession();
      playLine(LEAD_IN);
    },

    press(bell) {
      unlockAudio();
      const st = stage();
      const { phase, line, span, recall, active } = get();
      if (!active || bell < 0 || bell >= st.bells) return;
      if (phase !== 'repeat') return;
      const expected = expectedOrder(line, st.order);
      const res = strike(expected, recall, bell);
      if (res.kind === 'miss') {
        clearTimers();
        markStrike(bell, 'slip', 260);
        for (const b of res.wanted) markStrike(b, 'show', SLIP_PAUSE - 400);
        ring(st, [bell], 0.5, 0.35);
        knock();
        buzz(30);
        const { record } = recordLine(get().record, st, line.length, false);
        persist({ stageId: st.id, record });
        const missed = spanMiss(span, st);
        // A first miss only pauses the run; a drop-back breaks it.
        if (missed.outcome === 'drop') useRewards.getState().answer(false);
        const s = get().sitting;
        const sitting = { ...s, lines: s.lines + 1, slips: s.slips + 1, drops: s.drops + (missed.outcome === 'drop' ? 1 : 0) };
        set({
          record,
          sitting,
          phase: 'slip',
          slip: { struck: bell, wanted: res.wanted, expected, outcome: missed.outcome, next: missed.span.length },
          recall: res.recall,
          ...withSpan(missed.span),
        });
        if (sitting.drops >= DROPS_PER_SITTING) later(SLIP_PAUSE, () => usePalace.getState().endSession());
        else later(SLIP_PAUSE, () => playLine(250));
        return;
      }
      markStrike(bell, 'tap', 180);
      ring(st, [bell], 0.75, 0.6);
      buzz(8);
      if (res.kind !== 'line') return set({ recall: res.recall });
      // The whole line rung back clean.
      const { record, crossed, newBest } = recordLine(get().record, st, line.length, true);
      persist({ stageId: st.id, record });
      const rewards = useRewards.getState();
      if (rewards.answer(true)) buzz(24);
      if (crossed) rewards.mastered(st.title);
      const s = get().sitting;
      set({
        record,
        recall: res.recall,
        phase: 'clean',
        sitting: {
          lines: s.lines + 1,
          clean: s.clean + 1,
          longest: Math.max(s.longest, line.length),
          slips: s.slips,
          drops: s.drops,
          mastered: s.mastered || crossed,
          newBest: s.newBest || newBest,
        },
        ...withSpan(spanClean(span, st, draw(st)).span),
      });
      later(CLEAN_PAUSE, () => playLine(150));
    },

    newTune() {
      if (!get().active) return;
      unlockAudio();
      clearTimers();
      clearStrikes();
      set({ ...withSpan(freshSpan(stage())), slip: null });
      playLine(LEAD_IN);
    },

    again() {
      resetSitting();
      set({ active: false });
      usePalace.getState().enterRoom('echo');
    },

    end() {
      clearTimers();
      usePalace.getState().endSession();
    },
  };
});

onResetProgress(() => {
  const save = { stageId: useEcho.getState().stageId, record: emptyRecord() };
  persist(save);
  useEcho.setState(save);
});

/** Stages over the mastery bar, of all of Echo's stages. */
export function echoMastered(record: EchoRecord): number {
  return ECHO_STAGES.filter((s) => echoProgress(s, record).mastered).length;
}
