import { ContactShadows, Environment, Lightformer, PerformanceMonitor } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Bloom, DepthOfField, EffectComposer, N8AO, Vignette } from '@react-three/postprocessing';
import type { DepthOfFieldEffect } from 'postprocessing';
import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { isCalm } from '../motion';
import { usePalace } from '../store';
import { useSheet } from '../ui/sheet';
import { DESK_Y, Desk, SHADOW_Y } from './Desk';
import { activeRoom } from '../modes/registry';
import { Rewards3D } from '../rewards/Rewards3D';
import { COLORS } from './palette';
import { BOARD_THICKNESS, followWindow, fretX, markerPoint, markerX, neckMatrix, stringPoint, neckToWorld, positionsSpan, regionBounds, regionSpan } from './layout';
import { COARSE, LITE, CAPTURE } from './quality';
import { Sheet } from './Sheet';
import { cameraState, focusPoint, renderInfo, setInspector, setProjector, setRewardAnchor, sheetPose, useNeckWindow, useView } from './view';

const FOV = 30;

/** Desk sheets: a steep but not top-down view, so the card stays legible and the desk reads in perspective. */
const SHEET_ELEVATION = 64;
/** Half-width of the leather mat (Desk.tsx) and the gap left before the card. */
const SHEET_MAT_HALF = 2.3;
const SHEET_GAP = 0.3;

/**
 * Reading-room HDRI (Poly Haven, CC0) for honest reflections on the lacquer,
 * nickel and pearl. Relative to the app's base, so it resolves under any
 * GitHub Pages sub-path. Full quality only: lite never fetches it.
 *
 * Path-traced stills (three-gpu-pathtracer) for an attract mode are deferred:
 * far too heavy for the realtime play path on phones.
 */
const HDRI = `${import.meta.env.BASE_URL}hdri/reading_room_1k.hdr`;
/** Swings the room's window (≈ az 210° in the file) round to the upper left of the screen. */
const HDRI_ROTATION: [number, number, number] = [0, 2.9, 0];
/**
 * Left-handed: the whole photograph mirrors, window included, so the hero
 * camera (which swings to the other side) never looks straight into it. The
 * window sits at world azimuth −135° (−X, −Z); reflecting it to +135° is a
 * further 270° turn of the map.
 */
const HDRI_ROTATION_MIRRORED: [number, number, number] = [0, 2.9 + (3 * Math.PI) / 2 - 2 * Math.PI, 0];

function isCoarsePointer() {
  return typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
}

export interface Quality {
  /** 0 = no post, 1 = specular-only bloom + vignette, 2 = adds ambient occlusion. */
  tier: 0 | 1 | 2;
  dpr: number;
}

function initialQuality(): Quality {
  if (LITE) return { tier: 0, dpr: 1 };
  const mobile = isCoarsePointer() || (typeof innerWidth !== 'undefined' && innerWidth < 700);
  const deviceDpr = typeof devicePixelRatio === 'undefined' ? 1 : devicePixelRatio;
  const dpr = Math.min(deviceDpr, 2);
  // Low-DPR or touch devices: skip ambient occlusion, keep the light bloom.
  const tier: Quality['tier'] = mobile || deviceDpr < 1 ? 1 : 2;
  return { tier, dpr };
}

/** Orientation of the neck on screen. */
function useLayout() {
  const size = useThree((s) => s.size);
  const portrait = size.height > size.width * 1.05;
  return { portrait, size };
}

/**
 * Hero camera: low and angled, a three-quarter view from the player's side
 * and a little towards the headstock, so the board's edge and the rounded
 * neck back read as a carved object. Portrait sits higher so the frets keep
 * their rhythm down the phone; landscape sits lower and swings further round.
 */
const HERO = {
  landscape: { elevation: 28, yaw: -22 },
  portrait: { elevation: 42, yaw: -11 },
  /**
   * A phone on a long reach: the camera climbs so the far end of the window keeps its
   * string spacing (at the hero angle the nut end recedes to half the width of the near end).
   */
  windowed: { elevation: 58, yaw: -6 },
} as const;

interface Framing {
  look: THREE.Vector3;
  pos: THREE.Vector3;
  /** Centre of the unlocked region on the board: what the lens focuses on. */
  focus: THREE.Vector3;
}

/** Screen box (NDC, y up) the region should fill. */
interface Box {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

const probe = new THREE.PerspectiveCamera(FOV, 1, 0.5, 120);

/**
 * On a touch screen, no string spacing or fret cell drawn smaller than this (CSS px):
 * the 44 px fingertip, with a margin for the window sliding to a part of the neck it was not measured at.
 */
const MIN_TARGET_PX = 48;
/** A window never shrinks below this much neck (a few frets). */
const MIN_WINDOW = 4;

/**
 * Fits the region's corner points (board top, board edge and neck back) into
 * `box` from a fixed viewing direction: scales the distance until the
 * projected extent fills the box, then slides the look point so it's centred.
 * Perspective makes this nonlinear; a handful of passes converge.
 */
function fitCamera(points: THREE.Vector3[], dir: THREE.Vector3, aspect: number, box: Box): Framing {
  const look = new THREE.Vector3();
  for (const p of points) look.add(p);
  look.divideScalar(points.length);
  const focus = look.clone().setY(0);
  probe.aspect = aspect;
  probe.updateProjectionMatrix();
  probe.up.set(0, 1, 0);
  let D = 20;
  const v = new THREE.Vector3();
  const right = new THREE.Vector3();
  const up = new THREE.Vector3();
  const tanV = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
  for (let i = 0; i < 8; i++) {
    probe.position.copy(look).addScaledVector(dir, D);
    probe.lookAt(look);
    probe.updateMatrixWorld();
    let x0 = Infinity;
    let x1 = -Infinity;
    let y0 = Infinity;
    let y1 = -Infinity;
    for (const p of points) {
      v.copy(p).project(probe);
      x0 = Math.min(x0, v.x);
      x1 = Math.max(x1, v.x);
      y0 = Math.min(y0, v.y);
      y1 = Math.max(y1, v.y);
    }
    const s = Math.max((x1 - x0) / (box.x1 - box.x0), (y1 - y0) / (box.y1 - box.y0));
    // Recentre at the current distance, then dolly.
    const dx = (box.x0 + box.x1) / 2 - (x0 + x1) / 2;
    const dy = (box.y0 + box.y1) / 2 - (y0 + y1) / 2;
    right.setFromMatrixColumn(probe.matrixWorld, 0);
    up.setFromMatrixColumn(probe.matrixWorld, 1);
    look.addScaledVector(right, -dx * D * tanV * aspect).addScaledVector(up, -dy * D * tanV);
    D *= s;
  }
  return { look, pos: look.clone().addScaledVector(dir, D), focus };
}

/**
 * Positions the neck (portrait: nut at top; landscape: nut at left, mirrored
 * for left-handed players) and dollies the camera to frame the unlocked region
 * inside the space left free by the HUD. On the title the neck steps aside
 * (right and down, or down on a phone) to leave the wordmark clear space.
 */
function NeckRig({ children }: { children: React.ReactNode }) {
  const { portrait, size } = useLayout();
  const leftHanded = usePalace((s) => s.saved.settings.leftHanded);
  const stageId = usePalace((s) => s.saved.stageId);
  const attract = usePalace((s) => s.screen === 'attract');
  const insets = useView((s) => s.insets);
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const gl = useThree((s) => s.gl);
  const group = useRef<THREE.Group>(null);

  const view = useMemo(() => ({ portrait, leftHanded }), [portrait, leftHanded]);

  /**
   * The framing for the stage: the whole reach where it fits; on a touch screen where
   * it would not fit at a fingertip's string spacing, a window of frets (`len` neck
   * units long) that the camera slides along the neck.
   */
  const rig = useMemo(() => {
    const stage = usePalace.getState().stage();
    // Portrait (narrow) frames the strings in play; landscape and the title show the whole neck.
    const strings = portrait && !attract ? stage.strings : undefined;
    const span = regionSpan(stage.maxFret);

    const heroDir = (hero: { elevation: number; yaw: number }) => {
      const el = THREE.MathUtils.degToRad(hero.elevation);
      // Yaw towards the headstock (and the low-E side in portrait): mirrored for left-handers.
      const yaw = THREE.MathUtils.degToRad(hero.yaw) * (leftHanded ? -1 : 1);
      return new THREE.Vector3(Math.sin(yaw) * Math.cos(el), Math.sin(el), Math.cos(yaw) * Math.cos(el));
    };
    let dir = heroDir(portrait ? HERO.portrait : HERO.landscape);

    const h = Math.max(1, size.height);
    const aspect = size.width / h;
    let box: Box;
    if (attract) {
      // Title: clear space for the wordmark. Landscape keeps a left column
      // (right for left-handers, so the title sits over the desk, not the
      // headstock); portrait keeps the upper part of the screen.
      box = portrait
        ? { x0: -0.96, x1: 0.96, y0: -0.98, y1: -0.12 }
        : leftHanded
          ? { x0: -0.98, x1: 0.05, y0: -0.92, y1: 0.3 }
          : { x0: -0.05, x1: 0.98, y0: -0.92, y1: 0.3 };
    } else {
      const top = 1 - (2 * insets.top) / h;
      const bottom = -1 + (2 * insets.bottom) / h;
      box = portrait
        ? { x0: -0.97, x1: 0.97, y0: bottom, y1: Math.max(bottom + 0.3, top) }
        : { x0: -0.92, x1: 0.92, y0: bottom * 0.96, y1: Math.max(bottom + 0.3, top) * 0.96 };
    }

    const frame = (x0: number, x1: number): Framing => {
      const b = regionBounds(stage.maxFret, strings, { x0, x1 });
      // Board top, the board's lower edge and the bottom of the neck back, so the
      // carved side is framed along with the strings.
      const points: THREE.Vector3[] = [];
      for (const x of [b.x0, b.x1])
        for (const z of [b.z0, b.z1]) {
          const [wx, wz] = neckToWorld(x, z, view);
          points.push(new THREE.Vector3(wx, 0.2, wz), new THREE.Vector3(wx, -BOARD_THICKNESS, wz));
        }
      for (const x of [b.x0, b.x1]) {
        const [wx, wz] = neckToWorld(x, 0, view);
        points.push(new THREE.Vector3(wx, -0.82, wz));
      }
      return fitCamera(points, dir, aspect, box);
    };

    const full = frame(span.x0, span.x1);
    const fixed = { full, windowed: false, len: span.x1 - span.x0, lo: span.x0, hi: span.x1, frame };
    if (attract || (!COARSE && !portrait)) return fixed;

    // The smallest target on screen for a window ending at `x1`: the string spacing
    // there (with more than one string) and the length of the last fret's cell.
    const pa = new THREE.Vector3();
    const pb = new THREE.Vector3();
    const px = (f: Framing, a: [number, number, number], b: [number, number, number]) => {
      probe.aspect = aspect;
      probe.updateProjectionMatrix();
      probe.position.copy(f.pos);
      probe.up.set(0, 1, 0);
      probe.lookAt(f.look);
      probe.updateMatrixWorld();
      const [ax, az] = neckToWorld(a[0], a[2], view);
      const [bx, bz] = neckToWorld(b[0], b[2], view);
      pa.set(ax, a[1], az).project(probe);
      pb.set(bx, b[1], bz).project(probe);
      return Math.hypot(((pa.x - pb.x) * size.width) / 2, ((pa.y - pb.y) * h) / 2);
    };
    /**
     * The smallest target a finger meets in a framing of [x0, x1], measured where the
     * fingers go: between the markers of neighbouring strings in play (open strings at
     * the nut included), and along each string from one fret wire to the next.
     */
    const smallest = (f: Framing, x0: number, x1: number) => {
      let m = Infinity;
      const strings = [...stage.strings].sort((a, b) => a - b);
      for (let fret = 0; fret <= stage.maxFret; fret++) {
        const x = markerX(fret);
        if (x < x0 || x > x1) continue;
        for (let i = 1; i < strings.length; i++) {
          m = Math.min(m, px(f, markerPoint({ string: strings[i - 1]!, fret }), markerPoint({ string: strings[i]!, fret })));
        }
        if (fret > 0)
          for (const s of [strings[0]!, strings[strings.length - 1]!]) {
            m = Math.min(m, px(f, stringPoint(s, fretX(fret - 1)), stringPoint(s, fretX(fret))));
          }
      }
      return m;
    };
    if (smallest(full, span.x0, span.x1) >= MIN_TARGET_PX) return fixed;
    dir = heroDir(HERO.windowed);
    // Longest window that keeps every target a fingertip wide, placed at the nut (where perspective and taper make the strings closest) and at the body end (the shortest frets).
    let lo = Math.min(MIN_WINDOW, span.x1 - span.x0);
    let hi = span.x1 - span.x0;
    for (let i = 0; i < 10; i++) {
      const mid = (lo + hi) / 2;
      const ok = smallest(frame(span.x0, span.x0 + mid), span.x0, span.x0 + mid) >= MIN_TARGET_PX && smallest(frame(span.x1 - mid, span.x1), span.x1 - mid, span.x1) >= MIN_TARGET_PX;
      if (ok) lo = mid;
      else hi = mid;
    }
    return { full, windowed: true, len: lo, lo: span.x0, hi: span.x1, frame };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, portrait, attract, size.width, size.height, insets.top, insets.bottom, stageId]);

  /** Where the window sits (its near end, neck-local x), and the framing last built for it. */
  const pan = useRef({ x0: rig.lo, built: NaN, framing: rig.full, question: '', dragging: false });
  useLayoutEffect(() => {
    // A new stage starts at the nut.
    pan.current.x0 = rig.lo;
    pan.current.built = NaN;
    pan.current.question = '';
  }, [rig]);
  const setWindow = useNeckWindow((s) => s.set);

  /** The framing to aim at this frame: the whole reach, or the window where it now sits. */
  const neckFraming = (): Framing => {
    const pn = pan.current;
    if (!rig.windowed) {
      if (pn.framing !== rig.full) publishWindow();
      pn.framing = rig.full;
      return rig.full;
    }
    const { question, screen } = usePalace.getState();
    if (screen === 'play' && question.kind !== 'find' && pn.question !== question.itemId) {
      // Follow the question: the lit place (and its octaves) slide into view.
      pn.question = question.itemId;
      const need = positionsSpan(question.kind === 'name' ? [question.position] : [question.position, ...question.targets]);
      pn.x0 = followWindow(pn.x0, rig.len, rig.lo, rig.hi, need.a, need.b);
    }
    pn.x0 = Math.max(rig.lo, Math.min(rig.hi - rig.len, pn.x0));
    if (!(Math.abs(pn.built - pn.x0) <= 1e-3)) {
      pn.built = pn.x0;
      pn.framing = rig.frame(pn.x0, pn.x0 + rig.len);
      publishWindow();
    }
    return pn.framing;
  };

  /** Publish the frets on screen (for the HUD and the test hooks). */
  const publishWindow = () => {
    const max = usePalace.getState().stage().maxFret;
    if (!rig.windowed) return setWindow({ windowed: false, from: 0, to: max });
    // A fret counts as on screen when its marker (where a finger goes) is inside the window.
    const x0 = pan.current.x0;
    let from = max;
    let to = 0;
    for (let f = 0; f <= max; f++) {
      const x = markerX(f);
      if (x >= x0 && x <= x0 + rig.len) {
        from = Math.min(from, f);
        to = Math.max(to, f);
      }
    }
    setWindow({ windowed: true, from, to: Math.max(from, to) });
  };

  // Drag (or scroll) along the neck to move the window.
  useEffect(() => {
    if (!rig.windowed) return;
    const el = gl.domElement;
    const axis = new THREE.Vector2();
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    /** Screen pixels per neck unit along the neck, as a vector (from the camera as it stands). */
    const measureAxis = () => {
      const g = group.current;
      if (!g) return false;
      const mid = pan.current.x0 + rig.len / 2;
      g.updateWorldMatrix(true, false);
      camera.updateMatrixWorld();
      a.set(mid, 0.15, 0).applyMatrix4(g.matrixWorld).project(camera);
      b.set(mid + 1, 0.15, 0).applyMatrix4(g.matrixWorld).project(camera);
      axis.set(((b.x - a.x) * el.clientWidth) / 2, (-(b.y - a.y) * el.clientHeight) / 2);
      return axis.lengthSq() > 1e-6;
    };
    let drag: { id: number; x: number; y: number; x0: number; moved: boolean } | null = null;
    const live = () => {
      const st = usePalace.getState();
      return st.screen === 'play' && !st.stagesOpen && !useSheet.getState().geom;
    };
    const down = (e: PointerEvent) => {
      if (!live() || !measureAxis()) return;
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY, x0: pan.current.x0, moved: false };
    };
    const move = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return;
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      if (!drag.moved && Math.hypot(dx, dy) < 10) return;
      drag.moved = true;
      pan.current.dragging = true;
      // The board follows the finger: moving it towards the body pulls higher frets into view.
      pan.current.x0 = drag.x0 - (dx * axis.x + dy * axis.y) / axis.lengthSq();
    };
    const up = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return;
      drag = null;
      pan.current.dragging = false;
    };
    const wheel = (e: WheelEvent) => {
      if (!live()) return;
      e.preventDefault();
      pan.current.x0 += (e.deltaY + e.deltaX) * 0.01;
    };
    el.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    el.addEventListener('wheel', wheel, { passive: false });
    return () => {
      el.removeEventListener('pointerdown', down);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      el.removeEventListener('wheel', wheel);
    };
  }, [rig, gl, camera]);

  // A desk sheet is open: the camera leaves the neck and looks down on the card,
  // which lies on the walnut beside the leather mat (below the player's edge of
  // it in landscape, to the right of it on a phone), clear of the neck either way.
  const sheet = useSheet((s) => s.geom);
  const sheetKey = sheet ? `${sheet.width}x${sheet.height}${sheet.solo ? 's' : ''}` : '';
  const sheetFrame = useMemo(() => {
    if (!sheet) return null;
    const half = SHEET_MAT_HALF + SHEET_GAP;
    const pose = portrait
      ? { x: half + sheet.width / 2, y: DESK_Y + 0.03, z: 3 }
      : { x: 0, y: DESK_Y + 0.03, z: half + sheet.height / 2 };
    const rim = 0.08;
    const hw = sheet.width / 2 + rim;
    const hh = sheet.height / 2 + rim;
    const points = [-1, 1].flatMap((sx) =>
      [-1, 1].flatMap((sy) => [
        new THREE.Vector3(pose.x + sx * hw, pose.y + 0.1, pose.z + sy * hh),
        new THREE.Vector3(pose.x + sx * hw, pose.y, pose.z + sy * hh),
      ]),
    );
    // Keep the neck and mat in shot beside the card: frame a strip of the mat
    // across the neck (above the card in landscape, to its left on a phone).
    const NECK_REACH = 0.9;
    if (!sheet.solo) for (const s of [-1, 1]) {
      if (portrait) points.push(new THREE.Vector3(0.2, DESK_Y + 0.3, pose.z + s * hh * 0.6));
      else points.push(new THREE.Vector3(pose.x + s * hw * 1.9, DESK_Y + 0.3, -SHEET_MAT_HALF * NECK_REACH));
    }
    const el = THREE.MathUtils.degToRad(SHEET_ELEVATION);
    const dir = new THREE.Vector3(0, Math.sin(el), Math.cos(el));
    const box: Box = portrait ? { x0: -0.95, x1: 0.95, y0: -0.93, y1: 0.93 } : { x0: -0.94, x1: 0.94, y0: -0.94, y1: 0.94 };
    return { pose, framing: fitCamera(points, dir, size.width / Math.max(1, size.height), box) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheetKey, portrait, size.width, size.height]);
  useLayoutEffect(() => {
    sheetPose.current = sheetFrame?.pose ?? null;
  }, [sheetFrame]);

  const lookNow = useRef(rig.full.look.clone());
  const first = useRef(true);
  /** Attract idle drift: 1 on the title, eases to 0 when play starts (camera settles, no whip-pan). */
  const idle = useRef(0);
  const drift = useMemo(() => new THREE.Vector3(), []);
  const goal = useMemo(() => new THREE.Vector3(), []);

  useFrame((state, dt) => {
    renderInfo.frames++;
    const wantIdle = usePalace.getState().screen === 'attract' && !isCalm() ? 1 : 0;
    idle.current += (wantIdle - idle.current) * (1 - Math.exp(-dt * 1.4));
    if (idle.current < 1e-3 && !wantIdle) idle.current = 0;
    // A slow figure-of-eight over the desk, a few percent of the viewing distance.
    const aim = sheetFrame?.framing ?? neckFraming();
    const reach = aim.pos.distanceTo(aim.look) * 0.035 * idle.current;
    const t = state.clock.elapsedTime;
    drift.set(Math.sin(t * 0.16) * reach, 0, Math.sin(t * 0.11) * Math.cos(t * 0.16) * reach * 0.6);
    goal.copy(aim.pos).add(drift);
    if (first.current) {
      camera.position.copy(goal);
      lookNow.current.copy(aim.look);
      first.current = false;
    } else {
      // ~1.2 s dolly; a finger dragging the neck gets it nearly at once.
      const k = 1 - Math.exp(-dt * (pan.current.dragging ? 18 : 3.2));
      camera.position.lerp(goal, k);
      lookNow.current.lerp(aim.look, k);
    }
    camera.up.set(0, 1, 0);
    camera.lookAt(lookNow.current);
    // At rest once both the eye and the look point are within a hair of their goals.
    const eps = Math.max(1, aim.pos.distanceTo(aim.look)) * 2e-4;
    cameraState.settled = camera.position.distanceTo(goal) < eps && lookNow.current.distanceTo(aim.look) < eps;
    focusPoint.copy(aim.focus);
  });

  // Register a projector (and scene stats) for the e2e test hooks.
  useEffect(() => {
    let meshes = 0;
    let triangles = 0;
    group.current?.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      meshes++;
      const g = mesh.geometry;
      triangles += (g.index ? g.index.count : g.attributes.position!.count) / 3;
    });
    renderInfo.meshes = meshes;
    renderInfo.triangles = Math.round(triangles);
    const v = new THREE.Vector3();
    setProjector((p) => {
      const g = group.current;
      if (!g) return null;
      g.updateWorldMatrix(true, false);
      camera.updateMatrixWorld();
      v.set(...markerPoint(p)).applyMatrix4(g.matrixWorld).project(camera);
      const rect = gl.domElement.getBoundingClientRect();
      return { x: rect.left + ((v.x + 1) / 2) * rect.width, y: rect.top + ((1 - v.y) / 2) * rect.height };
    });
    // Rewards rise from the place just plucked (or the question's place before any answer).
    setRewardAnchor((out) => {
      const g = group.current;
      if (!g) return false;
      const st = usePalace.getState();
      const q = st.question;
      const p = st.lastPluck && !st.lastPluck.quiet ? st.lastPluck.position : q.kind === 'find' ? q.targets[0] : q.position;
      if (!p) return false;
      g.updateWorldMatrix(true, false);
      out.set(...markerPoint(p)).applyMatrix4(g.matrixWorld);
      return true;
    });
    setInspector(() => {
      const g = group.current;
      if (!g) return null;
      g.updateWorldMatrix(true, true);
      camera.updateMatrixWorld();
      const rect = gl.domElement.getBoundingClientRect();
      const toPage = (w: THREE.Vector3) => {
        const n = w.clone().project(camera);
        return new THREE.Vector2(rect.left + ((n.x + 1) / 2) * rect.width, rect.top + ((1 - n.y) / 2) * rect.height);
      };
      let glow: THREE.Object3D | undefined;
      const strings: THREE.Mesh[] = [];
      const frets: { fret: number; x: number }[] = [];
      g.traverse((o) => {
        const d = o.userData as { role?: string; fret?: number };
        if (d.role === 'highlight' && o.userData.question) glow = o;
        else if (d.role === 'string') strings.push(o as THREE.Mesh);
        else if (d.role === 'fret') frets.push({ fret: d.fret!, x: g.worldToLocal(o.getWorldPosition(new THREE.Vector3())).x });
      });
      if (!glow) return null;
      const centre = glow.getWorldPosition(new THREE.Vector3());
      const at = toPage(centre);
      // Nearest string on screen: distance to each rendered string segment.
      let renderedString = -1;
      let best = Infinity;
      // A string can run past the camera (the low hero view sits over the far
      // strings), so clip each segment to the near plane before projecting it.
      const view = camera.matrixWorldInverse;
      const nearZ = -camera.near * 1.01;
      const clip = (p: THREE.Vector3, q: THREE.Vector3) => {
        const pc = p.clone().applyMatrix4(view);
        const qc = q.clone().applyMatrix4(view);
        if (pc.z <= nearZ) return p;
        return p.clone().lerp(q, (pc.z - nearZ) / (pc.z - qc.z));
      };
      for (const mesh of strings) {
        const h = (mesh.geometry as THREE.CylinderGeometry).parameters.height;
        const wa = new THREE.Vector3(0, -h / 2, 0).applyMatrix4(mesh.matrixWorld);
        const wb = new THREE.Vector3(0, h / 2, 0).applyMatrix4(mesh.matrixWorld);
        const a = toPage(clip(wa, wb));
        const b = toPage(clip(wb, wa));
        const ab = b.clone().sub(a);
        const t = THREE.MathUtils.clamp(at.clone().sub(a).dot(ab) / ab.lengthSq(), 0, 1);
        const dist = a.addScaledVector(ab, t).distanceTo(at);
        if (dist < best) {
          best = dist;
          renderedString = mesh.userData.string as number;
        }
      }
      // Fret space: count the nut/fret wires between the headstock and the highlight
      // (an open-string highlight sits on the nut itself, so the nut doesn't count).
      const lx = g.worldToLocal(centre.clone()).x;
      const renderedFret = frets.filter((f) => f.x < lx - 0.01).reduce((m, f) => Math.max(m, f.fret + 1), 0);
      const d = glow.userData as { string: number; fret: number; tone: string };
      return { string: d.string, fret: d.fret, tone: d.tone, screen: { x: at.x, y: at.y }, renderedString, renderedFret };
    });
    return () => {
      setProjector(null);
      setInspector(null);
      setRewardAnchor(null);
    };
  }, [camera, gl]);

  // Orientation and mirroring come from the same mapping the framing uses.
  useLayoutEffect(() => {
    const g = group.current;
    if (!g) return;
    g.matrix.set(...(neckMatrix(view) as Parameters<THREE.Matrix4['set']>));
    g.matrixWorldNeedsUpdate = true;
  }, [view]);

  return (
    <group ref={group} matrixAutoUpdate={false}>
      {/*
        A low bench lamp on the player's side, in neck space so it follows
        portrait and left-handed layouts: it rakes across the board's edge and
        the rounded neck back that the window key (behind) leaves dark.
      */}
      <directionalLight position={[-3, 1.4, 6]} intensity={LITE ? 0.5 : 0.55} color="#ffd9b0" />
      {children}
    </group>
  );
}

/**
 * Study light. Full: the reading-room HDRI for reflections, a soft window key
 * from the upper left and a weak cool fill opposite. Lite: the same key and
 * fill over a cheap Lightformer room (no file load).
 */
function Studio({ mirrored }: { mirrored: boolean }) {
  const sx = mirrored ? -1 : 1;
  return (
    <>
      <hemisphereLight args={['#f6ead8', '#2a2018', LITE ? 0.45 : 0.18]} />
      {/* World −X is screen left, −Z screen top (mirrored for left-handers). */}
      <directionalLight position={[-5 * sx, 9, -4]} intensity={LITE ? 1.5 : 1.7} color="#fff0dc" />
      <directionalLight position={[6 * sx, 3, 5]} intensity={0.22} color="#dfe6ee" />
      {LITE ? (
        <Environment resolution={64} frames={1}>
          <Lightformer form="rect" intensity={2} color="#fff0dc" position={[-4 * sx, 6, -3]} rotation={[Math.PI / 2, 0, 0]} scale={[8, 4, 1]} />
          <Lightformer form="rect" intensity={0.8} color="#e8eef2" position={[6 * sx, 2, 2]} rotation={[0, (-sx * Math.PI) / 2, 0]} scale={[6, 2, 1]} />
          <mesh scale={30}>
            <sphereGeometry args={[1, 16, 16]} />
            <meshBasicMaterial color="#3a2e24" side={THREE.BackSide} />
          </mesh>
        </Environment>
      ) : (
        <Suspense fallback={null}>
          <Environment files={HDRI} environmentIntensity={0.75} environmentRotation={mirrored ? HDRI_ROTATION_MIRRORED : HDRI_ROTATION} />
        </Suspense>
      )}
    </>
  );
}

/** Keeps the lens on the framed region and the in-focus band proportional to the viewing distance. */
function Focus({ dof }: { dof: React.RefObject<DepthOfFieldEffect | null> }) {
  const camera = useThree((s) => s.camera);
  useFrame(() => {
    const e = dof.current;
    if (!e) return;
    if (!e.target) e.target = new THREE.Vector3();
    e.target.copy(focusPoint);
    e.cocMaterial.focusRange = camera.position.distanceTo(focusPoint) * 0.55;
  });
  return null;
}

function Effects({ tier }: { tier: Quality['tier'] }) {
  const dof = useRef<DepthOfFieldEffect>(null);
  if (tier === 0) return null;
  // Bloom threshold sits above everything but the brightest specular ticks on
  // nickel and brass: it never blooms the cue, the pearl or the wood.
  const bloom = <Bloom mipmapBlur intensity={0.18} luminanceThreshold={1.05} luminanceSmoothing={0.05} resolutionScale={0.5} />;
  const vignette = <Vignette offset={0.32} darkness={0.42} />;
  if (tier === 1) {
    return (
      <EffectComposer multisampling={4}>
        {bloom}
        {vignette}
      </EffectComposer>
    );
  }
  // Desktop: soft contact occlusion under strings, frets and the neck, and a
  // shallow depth of field — the unlocked region stays sharp, the far desk
  // and headstock fall gently soft, as in a bench photograph.
  return (
    <>
      <Focus dof={dof} />
      <EffectComposer multisampling={4}>
        <N8AO halfRes quality="performance" aoRadius={0.5} distanceFalloff={0.6} intensity={1.6} color="#120c08" />
        <DepthOfField ref={dof} target={[0, 0, 0]} focusRange={10} bokehScale={2.2} resolutionScale={0.5} />
        {bloom}
        {vignette}
      </EffectComposer>
    </>
  );
}

export function Scene() {
  const [quality, setQuality] = useState<Quality>(initialQuality);
  const leftHanded = usePalace((s) => s.saved.settings.leftHanded);
  const RoomScene = activeRoom(usePalace((s) => s.saved.modeId)).Scene;
  const maxDpr = quality.dpr;

  return (
    <Canvas
      className="scene"
      data-testid="scene"
      dpr={LITE ? 1 : [1, maxDpr]}
      camera={{ fov: FOV, near: 0.5, far: 120, position: [0, 20, 6] }}
      gl={{ antialias: !LITE && quality.tier === 0, powerPreference: 'high-performance', preserveDrawingBuffer: false }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        // Low enough that the rosewood stays dark and rich; metals still find their highlights.
        gl.toneMappingExposure = LITE ? 0.95 : 0.85;
      }}
    >
      <color attach="background" args={[COLORS.study]} />
      {!LITE && !CAPTURE && (
        <PerformanceMonitor
          onDecline={() =>
            setQuality((q) => ({
              tier: q.tier > 0 ? ((q.tier - 1) as Quality['tier']) : 0,
              dpr: Math.max(1, q.dpr - 0.25),
            }))
          }
        />
      )}
      <Studio mirrored={leftHanded} />
      <Sheet />
      <NeckRig>
        <Desk />
        <RoomScene />
      </NeckRig>
      <Rewards3D />
      {/* A single soft contact shadow on the desk (no realtime shadow maps). */}
      <ContactShadowsForNeck key={String(leftHanded)} />
      <Effects tier={quality.tier} />
    </Canvas>
  );
}

function ContactShadowsForNeck() {
  const { portrait } = useLayout();
  return (
    <ContactShadows
      key={String(portrait)}
      position={[0, SHADOW_Y, 0]}
      scale={60}
      resolution={LITE ? 128 : 512}
      blur={2.4}
      far={1.4}
      opacity={0.55}
      color="#0d0806"
      frames={1}
    />
  );
}
