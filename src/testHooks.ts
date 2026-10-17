import { type Position, noteAt } from './game/notes';
import { STAGES, regionPositions, stageProgress } from './game/stages';
import { type Screen, type SessionStats, usePalace } from './store';
import { type HighlightReport, type NeckWindow, cameraState, inspectHighlight, projectPosition, renderInfo, useNeckWindow } from './three/view';

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
  /** attract | primer | play | session. */
  screen(): Screen;
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
}

declare global {
  interface Window {
    __palace?: PalaceTestHooks;
  }
}

export function installTestHooks() {
  const s = () => usePalace.getState();
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
    found: () => s().found,
    lastTap: () => {
      const p = s().lastPluck;
      return p && !p.quiet ? p.position : null;
    },
    project: (p) => projectPosition(p),
    render: () => ({ ...renderInfo }),
    cameraSettled: () => cameraState.settled,
    highlight: () => inspectHighlight(),
  };
}
