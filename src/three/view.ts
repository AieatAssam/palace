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

/** Whether the camera has arrived where it is heading (written every frame by the rig). */
export const cameraState = { settled: false };

/** World-space point the camera frames (centre of the unlocked board): depth-of-field focus. */
export const focusPoint = new Vector3();

/**
 * Real buttons that sit over a desk sheet's 3D labels, by control id. The scene
 * writes each one's projected rectangle every frame (see `three/Sheet.tsx`).
 */
export const sheetDom = new Map<string, HTMLElement>();

/**
 * Where the desk sheet lies and how it is framed (world space), written by the camera
 * rig and read by the sheet so the two agree. `null` when no sheet is open.
 */
export interface SheetPose {
  /** Card centre on the desk. */
  x: number;
  y: number;
  z: number;
}
export const sheetPose: { current: SheetPose | null } = { current: null };

/**
 * Which sheet control the player is touching, hovering or has keyboard focus on, written by
 * `SheetLayer` from the real buttons and read by the scene, which draws the impression and
 * the focus rule on the card itself.
 */
export const sheetUi: { press: string | null; focus: string | null; hover: string | null } = { press: null, focus: null, hover: null };

/**
 * The stretch of neck on screen. On a phone a long reach does not fit at a fingertip's
 * string spacing, so the camera frames a window of frets that follows the question
 * (and can be dragged along the neck). `windowed` is false when the whole reach fits.
 */
export interface NeckWindow {
  windowed: boolean;
  /** Frets fully or partly on screen. */
  from: number;
  to: number;
}
export const useNeckWindow = create<NeckWindow & { set(w: NeckWindow): void }>()((set, get) => ({
  windowed: false,
  from: 0,
  to: 12,
  set(w) {
    const cur = get();
    if (cur.windowed !== w.windowed || cur.from !== w.from || cur.to !== w.to) set(w);
  },
}));

/**
 * Where a reward lands in the room (world space): the active room registers a resolver
 * (the Fretboard answers with the place just plucked). Gilt bursts rise from here.
 */
let rewardAnchor: ((out: Vector3) => boolean) | null = null;
export function setRewardAnchor(fn: ((out: Vector3) => boolean) | null) {
  rewardAnchor = fn;
}
/** Writes the anchor into `out`; false when no room has registered one. */
export function rewardAnchorPoint(out: Vector3): boolean {
  return rewardAnchor ? rewardAnchor(out) : false;
}
