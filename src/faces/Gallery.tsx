import { useFrame, useThree } from '@react-three/fiber';
import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { isCalm } from '../motion';
import { usePalace } from '../store';
import { DESK_Y, MAT } from '../three/Desk';
import { neckMatrix } from '../three/layout';
import { COLORS } from '../three/palette';
import { LITE } from '../three/quality';
import { setRoomAnchor, useRoomFrame } from '../three/view';
import { faceDom, faceRects, portraitTexture, singleRect } from './fx';
import { CANVAS_H, CANVAS_W, FRAME_H, FRAME_W, MOULDING, type Slot, elevation, footOf, fourSlots, singleSlot } from './layout';
import { answerIndex, castOf } from './logic';
import { useFaces } from './store';

/**
 * Faces on the desk: oil portraits in gilt frames, each propped on a brass stand and leaning
 * back to meet the player's eye. Meeting a sitter, or naming one, puts a single portrait large
 * in the middle; "which is…" sets out four. The right portrait warms with brass light; a
 * wrong pick dims, and the right one shows green. During the asked-later pause a velvet
 * drape hangs over the frame.
 *
 * Built in world space, like the blocks: this group undoes the rig's turn for a phone.
 */

const GLOW = { right: new THREE.Color('#ffc978'), wrong: new THREE.Color(COLORS.miss), reveal: new THREE.Color('#5fb79b') };

function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,0.9)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0.35)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Velvet hanging in folds, for the drape over a frame during the pause. */
function drapeTexture() {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 16;
  const g = c.getContext('2d')!;
  for (let x = 0; x < 128; x++) {
    const fold = 0.5 + 0.5 * Math.sin(x * 0.29) * Math.sin(x * 0.071 + 1);
    const l = 24 + fold * 34;
    g.fillStyle = `rgb(${l + 22},${l * 0.38},${l * 0.36})`;
    g.fillRect(x, 0, 1, 16);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const gold = () =>
  LITE
    ? new THREE.MeshStandardMaterial({ color: '#c9a35e', metalness: 0.6, roughness: 0.32, emissive: '#000000' })
    : new THREE.MeshPhysicalMaterial({ color: '#d8b46a', metalness: 1, roughness: 0.26, clearcoat: 0.3, envMapIntensity: 1.25, emissive: '#000000' });

const SLOTS = 4;
/** Where the stand's strut meets the frame's back, up from its foot. */
const STRUT = FRAME_H * 0.55;

export function Gallery() {
  const stage = useFaces((s) => s.stage)();
  const phase = useFaces((s) => s.phase);
  const meeting = useFaces((s) => s.meeting);
  const question = useFaces((s) => s.question);
  const chosen = useFaces((s) => s.chosen);
  const cast = castOf(stage);
  const size = useThree((s) => s.size);
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  const portrait = size.height > size.width * 1.05;
  const leftHanded = usePalace((s) => s.saved.settings.leftHanded);
  const view = useMemo(() => ({ portrait, leftHanded }), [portrait, leftHanded]);
  const el = (elevation(portrait) * Math.PI) / 180;

  /** What stands on the desk: one large portrait, or four. Each frame shows a sitter (or the drape). */
  const four = phase !== 'meet' && phase !== 'pause' && question?.kind === 'face';
  const shown: { sitter: number; slot: Slot }[] = useMemo(() => {
    if (four && question) return fourSlots(portrait).map((slot, i) => ({ sitter: question.choices[i]!, slot }));
    const one = phase === 'meet' ? meeting : phase === 'pause' ? -1 : (question?.sitter ?? 0);
    return [{ sitter: one, slot: singleSlot(portrait) }];
  }, [four, question, portrait, phase, meeting]);

  const m = useMemo(() => {
    const frames = Array.from({ length: SLOTS }, gold);
    const lip = LITE
      ? new THREE.MeshStandardMaterial({ color: '#8a6a37', metalness: 0.5, roughness: 0.4 })
      : new THREE.MeshPhysicalMaterial({ color: '#9c7a40', metalness: 1, roughness: 0.38, envMapIntensity: 1 });
    const brass = LITE
      ? new THREE.MeshStandardMaterial({ color: COLORS.brass, metalness: 0.7, roughness: 0.35 })
      : new THREE.MeshPhysicalMaterial({ color: COLORS.brass, metalness: 1, roughness: 0.3, envMapIntensity: 1.1 });
    const canvases = Array.from({ length: SLOTS }, () =>
      LITE ? new THREE.MeshBasicMaterial({ color: '#ffffff' }) : new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.42, metalness: 0, envMapIntensity: 0.35 }),
    );
    const drape = new THREE.MeshStandardMaterial({ map: drapeTexture(), roughness: 0.9, color: '#ffffff' });
    const halo = Array.from(
      { length: SLOTS },
      () => new THREE.MeshBasicMaterial({ map: glowTexture(), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }),
    );
    return { frames, lip, brass, canvases, drape, halo };
  }, []);

  // Each slot's painting: the sitter's portrait, or nothing under the drape.
  useLayoutEffect(() => {
    shown.forEach(({ sitter }, i) => {
      const mat = m.canvases[i]!;
      const s = cast[sitter];
      const map = s ? portraitTexture(s) : null;
      if (mat.map !== map) {
        mat.map = map;
        mat.needsUpdate = true;
      }
    });
  }, [shown, cast, m]);

  /** Undo the rig's turn (its matrix is orthogonal, so the inverse is the transpose). */
  const unturn = useMemo(() => new THREE.Matrix4().set(...(neckMatrix(view) as Parameters<THREE.Matrix4['set']>)).transpose(), [view]);
  const centre = useMemo(() => new THREE.Vector3(0, DESK_Y + MAT.thickness, 0), []);
  const turn = useRef<THREE.Group>(null);
  useLayoutEffect(() => {
    const g = turn.current;
    if (!g) return;
    g.matrix.copy(unturn);
    g.matrixWorldNeedsUpdate = true;
  }, [unturn]);

  // One framing for both arrangements, so the camera holds still between questions.
  const setFrame = useRoomFrame((s) => s.set);
  useLayoutEffect(() => {
    const pts: THREE.Vector3[] = [];
    const up = new THREE.Vector3(0, Math.cos(el), -Math.sin(el));
    for (const slot of [singleSlot(portrait), ...fourSlots(portrait)]) {
      const foot = footOf(slot, portrait);
      const w = (FRAME_W * slot.scale) / 2;
      const h = FRAME_H * slot.scale;
      for (const sx of [-1, 1])
        for (const t of [0, 1]) pts.push(new THREE.Vector3(centre.x + foot.x + sx * w, centre.y, centre.z + foot.z).addScaledVector(up, t * h));
    }
    setFrame({ key: `faces-${portrait ? 'p' : 'l'}-${leftHanded ? 'm' : 'r'}`, points: pts, elevation: elevation(portrait) });
  }, [centre, el, portrait, leftHanded, setFrame]);
  useLayoutEffect(() => () => setFrame(null), [setFrame]);

  const groups = useRef<(THREE.Group | null)[]>([]);
  // Gilt rises from the top of the portrait just answered.
  useLayoutEffect(() => {
    setRoomAnchor((out) => {
      const st = useFaces.getState();
      const q = st.question;
      const slot = q?.kind === 'face' && st.chosen >= 0 ? answerIndex(q) : 0;
      const g = groups.current[slot];
      if (!g || !g.visible) return false;
      g.getWorldPosition(out);
      out.y += FRAME_H * g.scale.y * Math.cos(el);
      return true;
    });
    return () => setRoomAnchor(null);
  }, [el]);

  /** Where each slot is drawn now: frames glide to their places (at once under calm). */
  const placed = useRef<{ x: number; z: number; s: number; on: boolean }[]>(Array.from({ length: SLOTS }, () => ({ x: 0, z: 0, s: 0, on: false })));
  const corner = useMemo(() => new THREE.Vector3(), []);
  const col = useMemo(() => new THREE.Color(), []);
  const changedAt = useRef(0);
  useLayoutEffect(() => {
    changedAt.current = performance.now();
  }, [phase, chosen]);

  const outer = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    const calm = isCalm();
    const k = calm ? 1 : 1 - Math.exp(-dt * 9);
    const q = useFaces.getState().question;
    const right = q ? answerIndex(q) : -1;
    const since = performance.now() - changedAt.current;
    const pulse = Math.min(1, since / 120) * (calm ? 1 : 0.85 + 0.15 * Math.cos(since / 260));
    for (let i = 0; i < SLOTS; i++) {
      const g = groups.current[i];
      if (!g) continue;
      const item = shown[i];
      const p = placed.current[i]!;
      if (!item) {
        p.on = false;
        g.visible = false;
        continue;
      }
      const foot = footOf(item.slot, portrait);
      if (!p.on) {
        // A frame newly set out appears in its place, a little small, and grows to size.
        p.x = foot.x;
        p.z = foot.z;
        p.s = calm ? item.slot.scale : item.slot.scale * 0.94;
        p.on = true;
      }
      p.x += (foot.x - p.x) * k;
      p.z += (foot.z - p.z) * k;
      p.s += (item.slot.scale - p.s) * k;
      g.visible = true;
      g.position.set(p.x, 0, p.z);
      g.scale.setScalar(p.s);

      // Light: brass on the right answer, clay on a wrong pick, green on the one that was right.
      let glow: THREE.Color | null = null;
      if (phase === 'right' && (four ? i === chosen : i === 0)) glow = GLOW.right;
      if (phase === 'wrong') {
        if (four && i === chosen) glow = GLOW.wrong;
        else if (four ? i === right : true) glow = GLOW.reveal;
      }
      const halo = m.halo[i]!;
      halo.opacity = glow ? 0.55 * pulse : 0;
      if (glow) halo.color.copy(glow);
      m.frames[i]!.emissive.copy(glow ? col.copy(glow).multiplyScalar(0.22 * pulse) : col.setRGB(0, 0, 0));
      const dim = phase === 'wrong' && four && i === chosen;
      const canvas = m.canvases[i]!;
      canvas.color.setScalar(dim ? 0.55 : 1);
    }

    // Keep the portraits' real buttons over their frames on screen.
    const o = outer.current;
    if (!o) return;
    o.updateMatrixWorld(true);
    camera.updateMatrixWorld();
    const rect = gl.domElement.getBoundingClientRect();
    const project = (i: number) => {
      const g = groups.current[i]!;
      let x0 = Infinity;
      let x1 = -Infinity;
      let y0 = Infinity;
      let y1 = -Infinity;
      for (const sx of [-1, 1])
        for (const y of [0, FRAME_H]) {
          corner.set((sx * FRAME_W) / 2, y, 0).applyMatrix4(g.children[0]!.matrixWorld).project(camera);
          const px = rect.left + ((corner.x + 1) / 2) * rect.width;
          const py = rect.top + ((1 - corner.y) / 2) * rect.height;
          x0 = Math.min(x0, px);
          x1 = Math.max(x1, px);
          y0 = Math.min(y0, py);
          y1 = Math.max(y1, py);
        }
      return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    };
    if (four) {
      singleRect.current = null;
      for (let i = 0; i < SLOTS; i++) {
        const el = faceDom.get(i);
        if (!el) continue;
        const r = project(i);
        const w = Math.max(48, r.w);
        const h = Math.max(48, r.h);
        const left = r.x + r.w / 2 - w / 2;
        const top = r.y + r.h / 2 - h / 2;
        el.style.left = `${left}px`;
        el.style.top = `${top}px`;
        el.style.width = `${w}px`;
        el.style.height = `${h}px`;
        el.classList.add('placed');
        faceRects.set(i, { x: left, y: top, w, h });
      }
    } else {
      faceRects.clear();
      for (const el of faceDom.values()) el.classList.remove('placed');
      singleRect.current = project(0);
    }
  });

  const veiled = phase === 'pause';
  const d = 0.07;
  return (
    <group ref={turn} matrixAutoUpdate={false}>
      <group ref={outer} position={centre}>
        {Array.from({ length: SLOTS }, (_, i) => (
          <group
            key={i}
            ref={(g) => {
              groups.current[i] = g;
            }}
            visible={false}
          >
            {/* The frame leans back at the camera's angle about its foot. */}
            <group rotation={[-el, 0, 0]}>
              <mesh material={m.halo[i]} position={[0, FRAME_H / 2, -0.02]} scale={[FRAME_W * 1.9, FRAME_H * 1.6, 1]} renderOrder={3}>
                <planeGeometry args={[1, 1]} />
              </mesh>
              <mesh material={veiled && i === 0 ? m.drape : m.canvases[i]} position={[0, FRAME_H / 2, 0]}>
                <planeGeometry args={[CANVAS_W, CANVAS_H]} />
              </mesh>
              {/* Moulding: the wide gilt rails, a raised outer bead and a darker sight edge. */}
              {[
                [0, FRAME_H - MOULDING / 2, FRAME_W, MOULDING],
                [0, MOULDING / 2, FRAME_W, MOULDING],
                [-FRAME_W / 2 + MOULDING / 2, FRAME_H / 2, MOULDING, FRAME_H - 2 * MOULDING],
                [FRAME_W / 2 - MOULDING / 2, FRAME_H / 2, MOULDING, FRAME_H - 2 * MOULDING],
              ].map(([x, y, w, h], j) => (
                <mesh key={j} material={m.frames[i]} position={[x!, y!, d / 2]}>
                  <boxGeometry args={[w!, h!, d]} />
                </mesh>
              ))}
              {[
                [0, FRAME_H - 0.03, FRAME_W + 0.02, 0.06],
                [0, 0.03, FRAME_W + 0.02, 0.06],
                [-FRAME_W / 2 + 0.03, FRAME_H / 2, 0.06, FRAME_H],
                [FRAME_W / 2 - 0.03, FRAME_H / 2, 0.06, FRAME_H],
              ].map(([x, y, w, h], j) => (
                <mesh key={`b${j}`} material={m.frames[i]} position={[x!, y!, d + 0.02]}>
                  <boxGeometry args={[w!, h!, 0.04]} />
                </mesh>
              ))}
              {[
                [0, FRAME_H - MOULDING - 0.015, CANVAS_W + 0.03, 0.03],
                [0, MOULDING + 0.015, CANVAS_W + 0.03, 0.03],
                [-CANVAS_W / 2 - 0.015, FRAME_H / 2, 0.03, CANVAS_H],
                [CANVAS_W / 2 + 0.015, FRAME_H / 2, 0.03, CANVAS_H],
              ].map(([x, y, w, h], j) => (
                <mesh key={`l${j}`} material={m.lip} position={[x!, y!, 0.02]}>
                  <boxGeometry args={[w!, h!, 0.04]} />
                </mesh>
              ))}
              {/* A brass plate on the bottom rail. */}
              <mesh material={m.brass} position={[0, MOULDING / 2, d + 0.012]}>
                <boxGeometry args={[0.5, 0.1, 0.02]} />
              </mesh>
            </group>
            {/* The stand: a brass strut from the frame's back to the desk behind it, and a ledge at its foot. */}
            <mesh material={m.brass} position={[0, (STRUT * Math.cos(el)) / 2, -STRUT * Math.sin(el) - 0.25]} rotation={[Math.atan2(0.5, STRUT * Math.cos(el)), 0, 0]}>
              <cylinderGeometry args={[0.025, 0.025, Math.hypot(STRUT * Math.cos(el), 0.5), 8]} />
            </mesh>
            <mesh material={m.brass} position={[0, 0.03, 0.08]}>
              <boxGeometry args={[FRAME_W * 0.9, 0.06, 0.14]} />
            </mesh>
          </group>
        ))}
      </group>
    </group>
  );
}
