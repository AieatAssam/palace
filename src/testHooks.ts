import { type Position, noteAt } from './game/notes';
import { stagePositions } from './game/unlocks';
import { type Screen, type SessionStats, usePalace } from './store';
import { type HighlightReport, inspectHighlight, projectPosition, renderInfo } from './three/view';

/**
 * `window.__palace`: read-only hooks for end-to-end tests (and curious
 * players in devtools). Nothing here mutates game state except via the same
 * actions the UI uses.
 */
export interface PalaceTestHooks {
  /** Snapshot for tooling: current drill mode and question. */
  state(): { mode: 'name' | 'find'; question: ReturnType<typeof usePalace.getState>['question'] };
  question(): ReturnType<typeof usePalace.getState>['question'];
  /** Correct note (Name-it) or the remaining target positions (Find-all). */
  answer(): string | Position[];
  drill(): 'name' | 'find';
  stage(): { index: number; title: string };
  /** Unlocked positions with their note names. */
  positions(): (Position & { note: string })[];
  leftHanded(): boolean;
  session(): SessionStats;
  /** attract | primer | play | session. */
  screen(): Screen;
  /** Find-all positions found so far in the current question. */
  found(): Position[];
  /** Page CSS-pixel coordinates of a position on the 3D neck (null before first frame). */
  project(p: Position): { x: number; y: number } | null;
  render(): { frames: number; meshes: number; triangles: number };
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
    state: () => ({ mode: s().drill, question: s().question }),
    question: () => s().question,
    answer: () => {
      const q = s().question;
      if (q.kind === 'name') return q.answer;
      return q.targets.filter((t) => !s().found.some((f) => f.string === t.string && f.fret === t.fret));
    },
    drill: () => s().drill,
    stage: () => ({ index: s().saved.stage, title: s().stage().title }),
    positions: () => stagePositions(s().stage()).map((p) => ({ ...p, note: noteAt(p) })),
    leftHanded: () => s().saved.settings.leftHanded,
    session: () => s().session,
    screen: () => s().screen,
    found: () => s().found,
    project: (p) => projectPosition(p),
    render: () => ({ ...renderInfo }),
    highlight: () => inspectHighlight(),
  };
}
