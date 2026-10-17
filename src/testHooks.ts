import { blockRects } from './blocks/fx';
import { BLOCKS_STAGES, type BlocksProgress, bestSpan, blocksProgress, expectedOrder as blocksOrder } from './blocks/logic';
import { type BlocksPhase, type BlocksSitting, useBlocks } from './blocks/store';
import { bellRects } from './echo/fx';
import { type EchoProgress, expectedOrder, echoProgress, ECHO_STAGES, wantedNow } from './echo/logic';
import { type EchoPhase, type EchoSitting, useEcho } from './echo/store';
import { type Position, noteAt } from './game/notes';
import { STAGES, regionPositions, stageProgress } from './game/stages';
import { MODES } from './modes/catalog';
import { type Combo, type DailyRecord, comboOf } from './rewards/logic';
import { useRewards } from './rewards/store';
import { type Screen, type SessionStats, usePalace } from './store';
import { type HighlightReport, type NeckWindow, cameraState, inspectHighlight, projectPosition, renderInfo, useNeckCursor, useNeckWindow } from './three/view';

/**
 * `window.__palace`: read-only hooks for end-to-end tests (and curious
 * players in devtools). Nothing here mutates game state except via the same
 * actions the UI uses.
 */
export interface PalaceTestHooks {
  /** Snapshot for tooling: current drill mode and question. */
  state(): { mode: 'name' | 'find' | 'octave'; question: ReturnType<typeof usePalace.getState>['question'] };
  question(): ReturnType<typeof usePalace.getState>['question'];
  /** Correct note (Name-it) or the remaining target positions (Find-all, octaves). */
  answer(): string | Position[];
  drill(): 'name' | 'find' | 'octave';
  stage(): { index: number; id: string; title: string };
  /** Every stage, in syllabus order, with its mastery. */
  stages(): { id: string; title: string; book: string; chapter: string; maxFret: number; sure: number; total: number; mastered: boolean }[];
  /** The frets on screen: the whole reach, or a window of it on a phone. */
  neckWindow(): NeckWindow;
  /** Positions in the stage's region (its strings, frets 0..maxFret) with their note names. */
  positions(): (Position & { note: string })[];
  leftHanded(): boolean;
  session(): SessionStats;
  /** attract | primer | hub | play | session. */
  screen(): Screen;
  /** The room on the desk, and every room the hub lists (open or in the workshop). */
  mode(): string;
  modes(): { id: string; title: string; open: boolean }[];
  /** The hub's open card, if any: a room's stage card or a workshop room's card. */
  hubCard(): 'stages' | `workshop:${string}` | null;
  /** Shared rewards: the run, its combo, today's record, the last flourish, the last gilt burst (event id, 0 = none) and the last seal. */
  rewards(): { streak: number; combo: Combo; daily: DailyRecord; flourish: { word: string; streak: number; tier: number; id: number } | null; burstId: number; seal: { title: string; id: number } | null };
  /** Find-all positions found so far in the current question. */
  found(): Position[];
  /** The last position a tap on the neck resolved to (Name-it plucks it, ungraded). */
  lastTap(): Position | null;
  /** Page CSS-pixel coordinates of a position on the 3D neck (null before first frame). */
  project(p: Position): { x: number; y: number } | null;
  render(): { frames: number; meshes: number; triangles: number };
  /** True once the camera has finished its dolly (positions from project() are where they will stay). */
  cameraSettled(): boolean;
  /**
   * The current question's highlight as rendered: the position it was made for,
   * plus the string and fret space it actually sits on, measured from the
   * string, nut and fret meshes on screen (null before first frame / in Find-all).
   */
  highlight(): HighlightReport | null;
  /** Find-all and octaves: the keyboard's frame on the neck (null before any key), and whether it is drawn. */
  neckCursor(): { pos: Position | null; shown: boolean };
  /** Walk straight to the hub from any screen (the primer counts as skipped), through the actions the UI uses. */
  hub(): void;
  /** Fretboard: walk straight into play on a stage, from any screen (for fast tests). */
  fretboard: { enter(stageId: string): void };
  /** Echo: the bells, the line and the player's place in it. Bells are numbered from 1 here, as on the plinth. */
  echo: EchoHooks;
  /** Blocks: the board, the line and the player's place in it. Blocks are numbered from 1 here, in reading order. */
  blocks: BlocksHooks;
}

export interface BlocksHooks {
  state(): {
    phase: BlocksPhase;
    stage: { id: string; title: string; blocks: number; order: 'forward' | 'reverse'; shifting: boolean };
    /** The line as the board lights it, and as the player must tap it back. */
    line: number[];
    expected: number[];
    done: number;
    /** The step the board is lighting (0-based), or -1. */
    showing: number;
    seed: number;
    sitting: BlocksSitting;
    active: boolean;
  };
  /** The block the line wants next (null unless it is the player's turn). */
  next(): number | null;
  stages(): ({ id: string; title: string; blocks: number } & BlocksProgress)[];
  /** The room's best span, in order and last first. */
  bestSpan(): { forward: number; reverse: number };
  /** Page rectangles of the block buttons, by block number. */
  rects(): { block: number; x: number; y: number; w: number; h: number }[];
  /** Walk straight into Blocks on a stage, from any screen, through the actions the hub uses. */
  enter(stageId: string): void;
}

export interface EchoHooks {
  state(): {
    phase: EchoPhase;
    stage: { id: string; title: string; bells: number; order: 'forward' | 'reverse'; chords: boolean };
    /** The line as the room plays it, and as the player must ring it back. */
    line: number[][];
    expected: number[][];
    /** Steps rung back so far, and bells struck in the current pair. */
    done: number;
    partial: number[];
    /** The step the room is sounding as it plays the line (0-based), or -1. */
    sounding: number;
    sitting: EchoSitting;
    active: boolean;
  };
  /** The bells the current step still wants (empty unless it is the player's turn). */
  next(): number[];
  stages(): ({ id: string; title: string; bells: number } & EchoProgress)[];
  /** Page rectangles of the bell buttons, by bell number. */
  bells(): { bell: number; x: number; y: number; w: number; h: number }[];
  /** Walk straight into Echo on a stage, from any screen, through the actions the hub uses (for fast tests). */
  enter(stageId: string): void;
}

declare global {
  interface Window {
    __palace?: PalaceTestHooks;
  }
}

export function installTestHooks() {
  const s = () => usePalace.getState();
  /** Title or primer → hub, as Begin and Skip would; from play or a sheet, as Rooms would. */
  const toHub = () => {
    if (!s().saved.onboarded) s().completePrimer();
    else if (s().screen !== 'hub') s().toHub();
  };
  window.__palace = {
    state: () => ({ mode: s().stage().drill, question: s().question }),
    question: () => s().question,
    answer: () => {
      const q = s().question;
      if (q.kind === 'name') return q.answer;
      return q.targets.filter((t) => !s().found.some((f) => f.string === t.string && f.fret === t.fret));
    },
    drill: () => s().stage().drill,
    stage: () => ({ index: STAGES.indexOf(s().stage()), id: s().stage().id, title: s().stage().title }),
    stages: () =>
      STAGES.map((st) => {
        const p = stageProgress(st, s().saved.deck);
        return { id: st.id, title: st.title, book: st.book, chapter: st.chapter, maxFret: st.maxFret, sure: p.sure, total: p.total, mastered: p.mastered };
      }),
    neckWindow: () => {
      const { windowed, from, to } = useNeckWindow.getState();
      return { windowed, from, to };
    },
    positions: () => regionPositions(s().stage()).map((p) => ({ ...p, note: noteAt(p) })),
    leftHanded: () => s().saved.settings.leftHanded,
    session: () => s().session,
    screen: () => s().screen,
    mode: () => s().saved.modeId,
    modes: () => MODES.map((m) => ({ id: m.id, title: m.title, open: m.open })),
    hubCard: () => (s().screen !== 'hub' ? null : s().stagesOpen ? 'stages' : s().workshop ? (`workshop:${s().workshop}` as const) : null),
    rewards: () => {
      const r = useRewards.getState();
      const f = r.flourish;
      return {
        streak: r.streak,
        combo: comboOf(r.streak),
        daily: { ...r.daily },
        flourish: f && { word: f.word, streak: f.streak, tier: f.tier, id: f.id },
        burstId: r.burst?.id ?? 0,
        seal: r.seal && { title: r.seal.title, id: r.seal.id },
      };
    },
    found: () => s().found,
    lastTap: () => {
      const p = s().lastPluck;
      return p && !p.quiet ? p.position : null;
    },
    project: (p) => projectPosition(p),
    render: () => ({ ...renderInfo }),
    cameraSettled: () => cameraState.settled,
    highlight: () => inspectHighlight(),
    neckCursor: () => {
      const c = useNeckCursor.getState();
      return { pos: c.pos && { ...c.pos }, shown: c.shown };
    },
    hub: toHub,
    fretboard: {
      enter: (stageId) => {
        toHub();
        s().chooseStage(stageId);
      },
    },
    echo: {
      state: () => {
        const e = useEcho.getState();
        const st = e.stage();
        const one = (steps: readonly (readonly number[])[]) => steps.map((x) => x.map((b) => b + 1));
        return {
          phase: e.phase,
          stage: { id: st.id, title: st.title, bells: st.bells, order: st.order, chords: st.chords },
          line: one(e.line),
          expected: one(expectedOrder(e.line, st.order)),
          done: e.recall.done,
          partial: e.recall.partial.map((b) => b + 1),
          sounding: e.sounding,
          sitting: { ...e.sitting },
          active: e.active,
        };
      },
      next: () => {
        const e = useEcho.getState();
        if (e.phase !== 'repeat') return [];
        return wantedNow(expectedOrder(e.line, e.stage().order), e.recall).map((b) => b + 1);
      },
      stages: () => ECHO_STAGES.map((st) => ({ id: st.id, title: st.title, bells: st.bells, ...echoProgress(st, useEcho.getState().record) })),
      enter: (stageId) => {
        if (s().screen !== 'hub') s().toHub();
        useEcho.getState().chooseStage(stageId);
      },
      bells: () => [...bellRects.entries()].sort((a, b) => a[0] - b[0]).map(([i, r]) => ({ bell: i + 1, ...r })),
    },
    blocks: {
      state: () => {
        const b = useBlocks.getState();
        const st = b.stage();
        return {
          phase: b.phase,
          stage: { id: st.id, title: st.title, blocks: st.blocks, order: st.order, shifting: st.shifting },
          line: b.line.map((x) => x + 1),
          expected: blocksOrder(b.line, st.order).map((x) => x + 1),
          done: b.done,
          showing: b.showing,
          seed: b.seed,
          sitting: { ...b.sitting },
          active: b.active,
        };
      },
      next: () => {
        const b = useBlocks.getState();
        if (b.phase !== 'recall') return null;
        const want = blocksOrder(b.line, b.stage().order)[b.done];
        return want === undefined ? null : want + 1;
      },
      stages: () => BLOCKS_STAGES.map((st) => ({ id: st.id, title: st.title, blocks: st.blocks, ...blocksProgress(st, useBlocks.getState().record) })),
      bestSpan: () => ({ forward: bestSpan(useBlocks.getState().record, 'forward'), reverse: bestSpan(useBlocks.getState().record, 'reverse') }),
      rects: () => [...blockRects.entries()].sort((a, b) => a[0] - b[0]).map(([i, r]) => ({ block: i + 1, ...r })),
      enter: (stageId) => {
        toHub();
        useBlocks.getState().chooseStage(stageId);
      },
    },
  };
}
