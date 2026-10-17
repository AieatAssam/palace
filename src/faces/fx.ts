/**
 * Faces' per-frame state shared between the scene and the overlay, kept out of React: the
 * real buttons over the four portraits of a "which is…" question, and where they sit on
 * screen; and the portraits' painted canvases, painted once per sitter and kept.
 */
import * as THREE from 'three';
import { LITE } from '../three/quality';
import { paintPortrait } from './paint';
import type { Sitter } from './sitters';

/** The real buttons over the portraits, by slot (0–3, reading order). */
export const faceDom = new Map<number, HTMLElement>();

/** Page rectangles of the portrait buttons as last placed (for the test hooks). */
export const faceRects = new Map<number, { x: number; y: number; w: number; h: number }>();

/** Page rectangle of the large single portrait (for the test hooks and screenshots). */
export const singleRect: { current: { x: number; y: number; w: number; h: number } | null } = { current: null };

const textures = new Map<string, THREE.CanvasTexture>();

/** A sitter's portrait as a texture, painted on first use. */
export function portraitTexture(s: Sitter): THREE.CanvasTexture {
  let t = textures.get(s.id);
  if (t) return t;
  const c = document.createElement('canvas');
  c.width = LITE ? 240 : 480;
  c.height = LITE ? 300 : 600;
  paintPortrait(c, s.look, LITE);
  t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = LITE ? 1 : 4;
  textures.set(s.id, t);
  return t;
}
