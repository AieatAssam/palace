import { create } from 'zustand';
import { Vector3 } from 'three';
import type { Position } from '../game/notes';

/** Shared view state between the DOM overlay and the 3D scene. */
interface ViewState {
  /** Pixels covered by the HUD at the top / bottom of the screen. */
  insets: { top: number; bottom: number };
  setInsets(top: number, bottom: number): void;
}

export const useView = create<ViewState>()((set, get) => ({
  insets: { top: 0, bottom: 0 },
  setInsets(top, bottom) {
    const cur = get().insets;
    if (Math.abs(cur.top - top) > 0.5 || Math.abs(cur.bottom - bottom) > 0.5) set({ insets: { top, bottom } });
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

/**
 * What the scene actually shows for the question's highlight, measured from
 * the rendered meshes rather than from the data that placed them.
 */
export interface HighlightReport {
  /** Position the highlight was created for. */
  string: number;
  fret: number;
  tone: string;
  /** Page CSS-pixel centre of the highlight. */
  screen: { x: number; y: number };
  /** String mesh nearest the highlight on screen. */
  renderedString: number;
  /** Fret space the highlight sits in, from the nut and fret meshes (0 = open). */
  renderedFret: number;
}
let inspector: (() => HighlightReport | null) | null = null;
export function setInspector(fn: (() => HighlightReport | null) | null) {
  inspector = fn;
}
export function inspectHighlight() {
  return inspector ? inspector() : null;
}

/** Render statistics for tests: frames drawn, meshes and triangles in the scene. */
export const renderInfo = { frames: 0, meshes: 0, triangles: 0 };

/** World-space point the camera frames (centre of the unlocked board): depth-of-field focus. */
export const focusPoint = new Vector3();
