import { Text } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { preloadFont } from 'troika-three-text';
import * as THREE from 'three';
import figuresFont from '../assets/fonts/ledger-figures.ttf?url';
import italicFont from '../assets/fonts/ledger-italic.ttf?url';
import romanFont from '../assets/fonts/ledger-roman.ttf?url';
import smcpFont from '../assets/fonts/ledger-smcp.ttf?url';
import { isCalm } from '../motion';
import { type SheetFont, type SheetInk, type SheetItem, useSheet } from '../ui/sheet';
import { DESK_Y } from './Desk';
import { LITE } from './quality';
import { makeCardShadow, makeLeather, makePaper } from './textures';
import { sheetDom, sheetPose } from './view';

/**
 * A card laid on the desk: tooled leather, a ledger page set into it and a brass edge.
 * It slides in from the player's side while the camera eases over to frame it.
 * The words are SDF text in the self-hosted EB Garamond (troika reads TTF, not WOFF2;
 * the files in assets/fonts have the old-style figures and small caps baked into the cmap).
 */
const FONTS: Record<SheetFont, string> = { roman: romanFont, smcp: smcpFont, italic: italicFont, figures: figuresFont };
/** On cream paper: all four clear 4.5:1. */
const INK: Record<SheetInk, string> = { ink: '#1c1916', soft: '#4a443c', quiet: '#5f594f', danger: '#8a4527' };
const BRASS = '#b08d57';
const GILT = '#8a6a37';

const EDGE = 0.07; // brass rim width beyond the leather
const LEATHER_T = 0.06;
const PAGE_INSET = 0.17;
const PAPER_Z = LEATHER_T + 0.006;
const TEXT_Z = PAPER_Z + 0.006;
const SLIDE_IN = 0.8; // seconds
const SLIDE_OUT = 0.35;
/** Where the card starts: lifted, towards the player. */
const FROM = { lift: 0.9, slide: 4.2, tilt: 0.28 };

function roundedRect<T extends THREE.Path>(shape: T, w: number, h: number, r: number) {
  const x = -w / 2;
  const y = -h / 2;
  shape.moveTo(x + r, y);
  shape.lineTo(x + w - r, y);
  shape.quadraticCurveTo(x + w, y, x + w, y + r);
  shape.lineTo(x + w, y + h - r);
  shape.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  shape.lineTo(x + r, y + h);
  shape.quadraticCurveTo(x, y + h, x, y + h - r);
  shape.lineTo(x, y + r);
  shape.quadraticCurveTo(x, y, x + r, y);
  return shape;
}

function useCardMaterials() {
  return useMemo(() => {
    if (LITE) {
      return {
        leather: new THREE.MeshStandardMaterial({ color: '#4a2218', roughness: 0.7 }),
        brass: new THREE.MeshStandardMaterial({ color: BRASS, roughness: 0.4, metalness: 0.6 }),
        paper: new THREE.MeshStandardMaterial({ color: '#f4ecda', roughness: 0.9, emissive: '#3e372b' }),
      };
    }
    const hide = makeLeather(512, 77);
    for (const t of [hide.roughnessMap, hide.normalMap]) t.repeat.set(2, 3);
    const sheet = makePaper();
    return {
      leather: new THREE.MeshPhysicalMaterial({
        color: '#4a2218',
        roughnessMap: hide.roughnessMap,
        normalMap: hide.normalMap,
        normalScale: new THREE.Vector2(0.6, 0.6),
        roughness: 1,
        sheen: 0.4,
        sheenRoughness: 0.5,
        sheenColor: new THREE.Color('#8a5a45'),
        clearcoat: 0.12,
        clearcoatRoughness: 0.5,
        envMapIntensity: 0.5,
      }),
      brass: new THREE.MeshStandardMaterial({ color: BRASS, metalness: 1, roughness: 0.3 }),
      paper: new THREE.MeshStandardMaterial({
        map: sheet.map,
        color: '#fffaf0',
        bumpMap: sheet.bumpMap,
        bumpScale: 0.2,
        roughness: 0.92,
        emissive: '#4a4234',
        envMapIntensity: 0.35,
      }),
    };
  }, []);
}

const unit = new THREE.PlaneGeometry(1, 1);
const gold = new THREE.MeshBasicMaterial({ color: GILT });
const track = new THREE.MeshBasicMaterial({ color: '#b3a78e' });
const hair = new THREE.MeshBasicMaterial({ color: '#8a8272' });

function Flat({ x, y, w, h, material, z = TEXT_Z - 0.003, rot = 0 }: { x: number; y: number; w: number; h: number; material: THREE.Material; z?: number; rot?: number }) {
  return <mesh geometry={unit} material={material} position={[x, y, z]} scale={[w, h, 1]} rotation={[0, 0, rot]} />;
}

function Item({ item }: { item: SheetItem }) {
  switch (item.kind) {
    case 'text': {
      const align = item.align ?? 'left';
      const font = item.font ?? 'roman';
      return (
        <Text
          font={FONTS[font]}
          fontSize={item.size}
          color={INK[item.ink ?? 'ink']}
          position={[item.x, item.y, TEXT_Z]}
          anchorX={align}
          anchorY={item.maxWidth ? 'top' : 'bottom-baseline'}
          textAlign={align}
          maxWidth={item.maxWidth}
          lineHeight={item.lineHeight ?? 1.2}
          letterSpacing={font === 'smcp' ? 0.045 : 0}
          sdfGlyphSize={64}
        >
          {item.text}
        </Text>
      );
    }
    case 'rule': {
      const w = item.x1 - item.x0;
      const cx = (item.x0 + item.x1) / 2;
      return item.weight === 'double' ? (
        <>
          <Flat x={cx} y={item.y} w={w} h={0.022} material={gold} />
          <Flat x={cx} y={item.y - 0.05} w={w} h={0.007} material={gold} />
        </>
      ) : (
        <Flat x={cx} y={item.y} w={w} h={0.006} material={hair} />
      );
    }
    case 'bar': {
      const w = item.x1 - item.x0;
      const fill = Math.max(0, Math.min(1, item.fill)) * w;
      return (
        <>
          <Flat x={(item.x0 + item.x1) / 2} y={item.y} w={w} h={0.006} material={track} />
          {fill > 0 && <Flat x={item.x0 + fill / 2} y={item.y} w={fill} h={0.018} material={gold} />}
        </>
      );
    }
    case 'lozenge':
      return <Flat x={item.x} y={item.y} w={0.06} h={0.06} material={gold} rot={Math.PI / 4} />;
  }
}

const ease = (t: number) => 1 - Math.pow(1 - t, 3);
const corner = new THREE.Vector3();

export function Sheet() {
  const geom = useSheet((s) => s.geom);
  const last = useSheet((s) => s.last);
  const m = useCardMaterials();
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  const outer = useRef<THREE.Group>(null);
  const card = useRef<THREE.Group>(null);
  const shadow = useRef<THREE.Mesh>(null);
  const progress = useRef(0);
  const keyShown = useRef<string | null>(null);
  const pose = useRef({ x: 0, y: DESK_Y, z: 0 });
  const shadowMat = useMemo(
    () => new THREE.MeshBasicMaterial({ map: makeCardShadow(), transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 }),
    [],
  );

  // Warm the glyph atlas a moment after start, off the first frames.
  // Not on the LITE path: SDF generation on a CPU rasteriser stalls the game for seconds.
  useEffect(() => {
    if (LITE) return;
    const id = setTimeout(() => {
      const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789%.,;:\u2019\u00b7\u2014 ';
      for (const font of Object.values(FONTS)) preloadFont({ font, characters }, () => {});
    }, 2500);
    return () => clearTimeout(id);
  }, []);

  const W = last?.width ?? 3.2;
  const H = last?.height ?? 5;
  const geometries = useMemo(() => {
    const leather = new THREE.ExtrudeGeometry(roundedRect(new THREE.Shape(), W, H, 0.08), { depth: LEATHER_T, bevelEnabled: false, curveSegments: 4 });
    const rim = roundedRect(new THREE.Shape(), W + 2 * EDGE, H + 2 * EDGE, 0.1);
    rim.holes.push(roundedRect(new THREE.Path(), W, H, 0.08));
    const brass = new THREE.ExtrudeGeometry(rim, {
      depth: LEATHER_T + 0.03,
      bevelEnabled: true,
      bevelThickness: 0.012,
      bevelSize: 0.012,
      bevelSegments: 2,
      curveSegments: 4,
    });
    return { leather, brass };
  }, [W, H]);

  useFrame((_, dt) => {
    const o = outer.current;
    const c = card.current;
    const s = shadow.current;
    if (!o || !c || !s || !last) return;
    const active = geom !== null;
    if (active && keyShown.current !== geom.key) {
      keyShown.current = geom.key;
      progress.current = 0;
    }
    if (!active) keyShown.current = null;
    const calm = isCalm();
    const step = dt / (active ? SLIDE_IN : SLIDE_OUT);
    progress.current = calm ? (active ? 1 : 0) : Math.max(0, Math.min(1, progress.current + (active ? step : -step)));
    const p = progress.current;
    if (sheetPose.current) pose.current = sheetPose.current;
    const e = ease(p);
    const lift = (1 - e) * FROM.lift;
    o.visible = p > 0.001;
    c.position.set(pose.current.x, pose.current.y + lift, pose.current.z + (1 - e) * FROM.slide);
    // Lying flat (rotation about X) with the leading edge tipped up while it travels.
    c.rotation.x = -Math.PI / 2 + (1 - e) * FROM.tilt;
    // Contact shadow: tight and dark when down, wide and faint while it is lifted.
    s.position.set(c.position.x + 0.05, DESK_Y + 0.004, c.position.z + 0.07);
    const spread = 1 + lift * 0.9;
    s.scale.set((W + 1.4) * spread, (H + 1.4) * spread, 1);
    shadowMat.opacity = 0.8 * e * (1 - lift * 0.5);

    // Keep each real button over its drawn label.
    if (p < 0.02) return;
    c.updateMatrixWorld(true);
    const box = gl.domElement.getBoundingClientRect();
    for (const r of last.rects) {
      const el = sheetDom.get(r.id);
      if (!el) continue;
      let x0 = Infinity;
      let x1 = -Infinity;
      let y0 = Infinity;
      let y1 = -Infinity;
      for (const sx of [-1, 1])
        for (const sy of [-1, 1]) {
          corner.set(r.x + (sx * r.w) / 2, r.y + (sy * r.h) / 2, TEXT_Z).applyMatrix4(c.matrixWorld).project(camera);
          const px = box.left + ((corner.x + 1) / 2) * box.width;
          const py = box.top + ((1 - corner.y) / 2) * box.height;
          x0 = Math.min(x0, px);
          x1 = Math.max(x1, px);
          y0 = Math.min(y0, py);
          y1 = Math.max(y1, py);
        }
      const w = Math.max(44, x1 - x0);
      const h = Math.max(44, y1 - y0);
      el.style.left = `${(x0 + x1) / 2 - w / 2}px`;
      el.style.top = `${(y0 + y1) / 2 - h / 2}px`;
      el.style.width = `${w}px`;
      el.style.height = `${h}px`;
      // Only an arrived sheet takes touches: a button chasing a moving label would miss.
      el.classList.toggle('placed', active && p > 0.985);
    }
  });

  if (!last) return null;
  return (
    <group ref={outer} visible={false}>
      <mesh ref={shadow} rotation={[-Math.PI / 2, 0, 0]} material={shadowMat} renderOrder={2}>
        <planeGeometry args={[1, 1]} />
      </mesh>
      <group ref={card}>
        <mesh geometry={geometries.leather} material={m.leather} />
        <mesh geometry={geometries.brass} material={m.brass} position={[0, 0, -0.012]} />
        <mesh material={m.paper} position={[0, 0, PAPER_Z]} scale={[W - 2 * PAGE_INSET, H - 2 * PAGE_INSET, 1]} geometry={unit} />
        {/* Gilt rule tooled into the leather, round the page. */}
        <GiltFrame w={W - 2 * PAGE_INSET + 0.1} h={H - 2 * PAGE_INSET + 0.1} />
        {last.items.map((item, i) => (
          <Item key={`${last.key}-${i}`} item={item} />
        ))}
      </group>
    </group>
  );
}

function GiltFrame({ w, h }: { w: number; h: number }) {
  const t = 0.01;
  const z = LEATHER_T + 0.003;
  return (
    <>
      <Flat x={0} y={h / 2} w={w + t} h={t} material={gold} z={z} />
      <Flat x={0} y={-h / 2} w={w + t} h={t} material={gold} z={z} />
      <Flat x={-w / 2} y={0} w={t} h={h} material={gold} z={z} />
      <Flat x={w / 2} y={0} w={t} h={h} material={gold} z={z} />
    </>
  );
}
