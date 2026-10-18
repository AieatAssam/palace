import { create } from 'zustand';
import { blockChimeFreq } from '../audio/blocks';
import { haptic, knock, tapBlock, unlockAudio } from '../audio/engine';
import { DROPS_PER_SITTING, type Span, type SpanOutcome, line as inPlay, spanClean, spanMiss, startSpan } from '../game/span';
import { useRewards } from '../rewards/store';
import { onResetProgress, usePalace } from '../store';
import { CAPTURE } from '../three/quality';
import { clearLights, markLight as mark } from './fx';
import { seedOf } from './layout';
import {
  type BlocksRecord,
  type BlocksStage,
  BLOCKS_STAGES,
  FIRST_BLOCKS_STAGE,
  blocksStageById,
  emptyRecord,
  expectedOrder,
  maxLength,
  nextBlock,
  parseRecord,
  recordLine,
  schedule,
  tap,
} from './logic';

/**
 * Blocks' state: the line the board lights, the player's place in tapping it back, the
 * board's layout, the sitting and the saved record (the longest clean line per stage). The
 * palace store owns the screen; this store follows it through `setActive`, which the
 * overlay drives from its `hidden` flag (play, with no card or settings over it).
 *
 * rest → show (the board lights the line) → recall (the player taps it back)
 *      → clean | slip → show … until three drop-backs close the page.
 *
 * The line lasts the whole sitting (`game/span.ts`): a clean line adds a block to it, a first
 * miss shows the same line again, a second miss in a row goes back two blocks. Only New line
 * or a new sitting draws a fresh one.
 */
export const BLOCKS_KEY = 'palace.blocks.v1';

export type BlocksPhase = 'rest' | 'show' | 'recall' | 'clean' | 'slip';

export interface BlocksSitting {
  /** Lines attempted and lines tapped back clean. */
  lines: number;
  clean: number;
  /** Blocks in the longest clean line this sitting. */
  longest: number;
  /** Lines missed, and drop-backs (two misses in a row). */
  slips: number;
  drops: number;
  /** The stage crossed its mastery bar this sitting. */
  mastered: boolean;
  /** The sitting beat the stage's best. */
  newBest: boolean;
}

export interface BlocksSlip {
  /** The block tapped, and the block that was due. */
  tapped: number;
  wanted: number;
  /** The line in the order it should have been tapped back. */
  expected: number[];
  /** 'retry': the same line again; 'drop': back two steps. */
  outcome: SpanOutcome;
  /** Blocks in the line shown next. */
  next: number;
}

interface BlocksSave {
  stageId: string;
  record: BlocksRecord;
}

interface BlocksState extends BlocksSave {
  phase: BlocksPhase;
  /** The sitting's line of blocks; `line` is the part in play. */
  span: Span<number>;
  line: number[];
  /** Blocks tapped back so far in this line. */
  done: number;
  /** The step the board is lighting as it shows the line (0-based), or -1. */
  showing: number;
  /** The board's layout seed (a fixed stage keeps one; a moving board draws a new one per line). */
  seed: number;
  slip: BlocksSlip | null;
  sitting: BlocksSitting;
  active: boolean;
  stage(): BlocksStage;
  /** Put a stage on the blotter; from the hub this walks into the room. */
  chooseStage(id: string): void;
  /** The overlay is live (play, nothing over it) or not. */
  setActive(on: boolean): void;
  /** A tap on block `block` (0-based), from a touch, a click or the keyboard. */
  press(block: number): void;
  /** A fresh line at the stage's opening length (the sitting goes on). */
  newLine(): void;
  /** Session sheet → a fresh sitting. */
  again(): void;
  end(): void;
}

/** Pauses (ms): before the board shows a line, after a clean line, after a slip (long enough to see the green block), and for a moving board to slide. */
const LEAD_IN = 700;
const CLEAN_PAUSE = 800;
const SLIP_PAUSE = 1700;
export const SHIFT_MS = 650;

function emptySitting(): BlocksSitting {
  return { lines: 0, clean: 0, longest: 0, slips: 0, drops: 0, mastered: false, newBest: false };
}

function kv(): Storage | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

export function parseBlocksSave(raw: string | null): BlocksSave {
  try {
    const d = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    const stageId = typeof d.stageId === 'string' && BLOCKS_STAGES.some((s) => s.id === d.stageId) ? d.stageId : FIRST_BLOCKS_STAGE.id;
    return { stageId, record: parseRecord(d.record) };
  } catch {
    return { stageId: FIRST_BLOCKS_STAGE.id, record: emptyRecord() };
  }
}

function loadSave(): BlocksSave {
  try {
    return parseBlocksSave(kv()?.getItem(BLOCKS_KEY) ?? null);
  } catch {
    return parseBlocksSave(null);
  }
}

function persist(save: BlocksSave) {
  try {
    kv()?.setItem(BLOCKS_KEY, JSON.stringify(save));
  } catch {
    // Quota or privacy mode: the record lives for this visit only.
  }
}

/** `?capture` (stills on a slow software renderer): the room's timeline runs this many times slower. */
const PACE = CAPTURE ? 24 : 1;
const markLight = (block: number, kind: Parameters<typeof mark>[1], hold: number) => mark(block, kind, hold * PACE);

let timers: ReturnType<typeof setTimeout>[] = [];
function clearTimers() {
  for (const t of timers) clearTimeout(t);
  timers = [];
}
function later(ms: number, fn: () => void) {
  timers.push(setTimeout(fn, ms * PACE));
}

/** A fixed stage's board, the same every visit. */
const fixedSeed = (st: BlocksStage) => seedOf(`blocks:${st.id}`);
const freshSeed = () => Math.floor(Math.random() * 0xffffffff);

export const useBlocks = create<BlocksState>()((set, get) => {
  const initial = loadSave();
  const stage = () => blocksStageById(get().stageId);
  const buzz = (ms: number) => {
    if (usePalace.getState().saved.settings.haptics) haptic(ms);
  };
  /** A moving board lays itself out afresh before the next line is shown. */
  let shiftDue = false;

  /** The board lights the line, then hands it to the player. */
  const playLine = (delay: number) => {
    clearTimers();
    const st = stage();
    let wait = delay;
    if (st.shifting && shiftDue) {
      shiftDue = false;
      set({ seed: freshSeed() });
      wait += SHIFT_MS;
    }
    const line = get().line;
    set({ phase: 'show', done: 0, showing: -1, slip: null });
    schedule(st, line.length).forEach((t, i) => {
      later(wait + t, () => {
        set({ showing: i });
        markLight(line[i]!, 'cue', st.tempo * 0.6);
        tapBlock(blockChimeFreq(i), 0.8);
      });
    });
    later(wait + (line.length - 1) * st.tempo + Math.max(420, st.tempo * 0.75), () => set({ phase: 'recall', showing: -1 }));
  };

  const rule = (st: BlocksStage) => ({ start: st.start, most: maxLength(st) });
  const draw = (st: BlocksStage) => (before: readonly number[]) => nextBlock(before, st, Math.random);
  /** A fresh line at the stage's opening length. */
  const freshSpan = (st: BlocksStage) => startSpan(rule(st), draw(st));
  const withSpan = (span: Span<number>) => ({ span, line: inPlay(span) });

  const resetSitting = () => {
    clearTimers();
    clearLights();
    const st = stage();
    shiftDue = false;
    set({ ...withSpan(freshSpan(st)), done: 0, phase: 'rest', showing: -1, slip: null, sitting: emptySitting(), seed: st.shifting ? freshSeed() : fixedSeed(st) });
  };

  const first = blocksStageById(initial.stageId);
  return {
    ...initial,
    phase: 'rest',
    ...withSpan(freshSpan(first)),
    done: 0,
    showing: -1,
    seed: first.shifting ? freshSeed() : fixedSeed(first),
    slip: null,
    sitting: emptySitting(),
    active: false,

    stage,

    chooseStage(id) {
      const st = blocksStageById(id);
      const save = { stageId: st.id, record: get().record };
      persist(save);
      set(save);
      resetSitting();
      const palace = usePalace.getState();
      if (palace.screen === 'hub') {
        useBlocks.setState({ active: false });
        palace.enterRoom('blocks');
      } else palace.closeStages();
    },

    setActive(on) {
      if (on === get().active) return;
      set({ active: on });
      if (!on) {
        clearTimers();
        // Whatever was under way stops; the line is shown again from the start on return.
        set({ phase: 'rest', done: 0, showing: -1 });
        return;
      }
      if (get().sitting.drops >= DROPS_PER_SITTING) return usePalace.getState().endSession();
      playLine(LEAD_IN);
    },

    press(block) {
      unlockAudio();
      const st = stage();
      const { phase, line, span, done, active } = get();
      if (!active || block < 0 || block >= st.blocks) return;
      if (phase !== 'recall') return;
      const expected = expectedOrder(line, st.order);
      const res = tap(expected, done, block);
      if (res.kind === 'miss') {
        clearTimers();
        markLight(block, 'slip', 260);
        markLight(res.wanted, 'show', SLIP_PAUSE - 400);
        knock();
        buzz(30);
        const { record } = recordLine(get().record, st, line.length, false);
        persist({ stageId: st.id, record });
        const missed = spanMiss(span, rule(st));
        // A first miss only pauses the run; a drop-back breaks it.
        if (missed.outcome === 'drop') useRewards.getState().answer(false);
        const s = get().sitting;
        const sitting = { ...s, lines: s.lines + 1, slips: s.slips + 1, drops: s.drops + (missed.outcome === 'drop' ? 1 : 0) };
        // The board stays put for the retry, so the same line is shown in the same places.
        set({
          record,
          sitting,
          phase: 'slip',
          slip: { tapped: block, wanted: res.wanted, expected, outcome: missed.outcome, next: missed.span.length },
          ...withSpan(missed.span),
        });
        if (sitting.drops >= DROPS_PER_SITTING) later(SLIP_PAUSE, () => usePalace.getState().endSession());
        else later(SLIP_PAUSE, () => playLine(250));
        return;
      }
      markLight(block, 'tap', 200);
      tapBlock(0, 0.7);
      buzz(8);
      if (res.kind !== 'line') return set({ done: res.done });
      // The whole line tapped back clean.
      const { record, crossed, newBest } = recordLine(get().record, st, line.length, true);
      persist({ stageId: st.id, record });
      const rewards = useRewards.getState();
      if (rewards.answer(true)) buzz(24);
      if (crossed) rewards.mastered(st.title);
      const s = get().sitting;
      shiftDue = true;
      set({
        record,
        done: res.done,
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
        ...withSpan(spanClean(span, rule(st), draw(st)).span),
      });
      later(CLEAN_PAUSE, () => playLine(150));
    },

    newLine() {
      if (!get().active) return;
      unlockAudio();
      clearTimers();
      clearLights();
      shiftDue = true;
      set({ ...withSpan(freshSpan(stage())), slip: null });
      playLine(LEAD_IN);
    },

    again() {
      resetSitting();
      set({ active: false });
      usePalace.getState().enterRoom('blocks');
    },

    end() {
      clearTimers();
      usePalace.getState().endSession();
    },
  };
});

onResetProgress(() => {
  const save = { stageId: useBlocks.getState().stageId, record: emptyRecord() };
  persist(save);
  useBlocks.setState(save);
});

