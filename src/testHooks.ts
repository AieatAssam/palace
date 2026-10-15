import { type Position, noteAt } from './game/notes';
import { stagePositions } from './game/unlocks';
import { usePalace } from './store';
import { projectPosition, renderInfo } from './three/view';

/**
 * `window.__palace`: read-only hooks for end-to-end tests (and curious
 * players in devtools). Nothing here mutates game state except via the same
 * actions the UI uses.
 */
export interface PalaceTestHooks {
  question(): ReturnType<typeof usePalace.getState>['question'];
  /** Correct note (Name-it) or the remaining target positions (Find-all). */
  answer(): string | Position[];
  drill(): 'name' | 'find';
  stage(): { index: number; title: string };
  /** Unlocked positions with their note names. */
  positions(): (Position & { note: string })[];
  leftHanded(): boolean;
  session(): { answered: number; correct: number; streak: number };
  /** Find-all positions found so far in the current question. */
  found(): Position[];
  /** Page CSS-pixel coordinates of a position on the 3D neck (null before first frame). */
  project(p: Position): { x: number; y: number } | null;
  render(): { frames: number; meshes: number; triangles: number };
}

declare global {
  interface Window {
    __palace?: PalaceTestHooks;
  }
}

export function installTestHooks() {
  const s = () => usePalace.getState();
  window.__palace = {
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
    found: () => s().found,
    project: (p) => projectPosition(p),
    render: () => ({ ...renderInfo }),
  };
}
