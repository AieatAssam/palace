import { create } from 'zustand';
import type { Position } from '../game/notes';

/** Shared view state between the DOM overlay and the 3D scene. */
interface ViewState {
  /** Pixels covered by the HUD at the top / bottom of the screen. */
  insets: { top: number; bottom: number };
  /** Camera → focus distance (for depth of field). */
  focusDistance: number;
  setInsets(top: number, bottom: number): void;
  setFocusDistance(d: number): void;
}

export const useView = create<ViewState>()((set, get) => ({
  insets: { top: 0, bottom: 0 },
  focusDistance: 10,
  setInsets(top, bottom) {
    const cur = get().insets;
    if (Math.abs(cur.top - top) > 0.5 || Math.abs(cur.bottom - bottom) > 0.5) set({ insets: { top, bottom } });
  },
  setFocusDistance(d) {
    if (Math.abs(get().focusDistance - d) > 0.05) set({ focusDistance: d });
  },
}));

/** Projects a fretboard position to page CSS pixels; registered by the scene. */
export type Projector = (p: Position) => { x: number; y: number } | null;
let projector: Projector | null = null;
export function setProjector(fn: Projector | null) {
  projector = fn;
}
export function projectPosition(p: Position) {
  return projector ? projector(p) : null;
}

/** Render statistics for tests: frames drawn, meshes and triangles in the scene. */
export const renderInfo = { frames: 0, meshes: 0, triangles: 0 };
