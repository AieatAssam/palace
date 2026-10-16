import { Text } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { preloadFont } from 'troika-three-text';
import * as THREE from 'three';
import figuresFont from '../assets/fonts/ledger-figures.ttf?url';
import italicFont from '../assets/fonts/ledger-italic.ttf?url';
import romanFont from '../assets/fonts/ledger-roman.ttf?url';
import smcpFont from '../assets/fonts/ledger-smcp.ttf?url';
import scriptFont from '../assets/fonts/pinyon-script.ttf?url';
import { isCalm } from '../motion';
import { type SheetFont, type SheetInk, type SheetItem, type SheetRect, type SheetText, useSheet } from '../ui/sheet';
import { DESK_Y } from './Desk';
import { LITE } from './quality';
import { makeCapsule, makeCardShadow, makeImpression, makeLeather, makePaper } from './textures';
import { sheetDom, sheetPose, sheetUi } from './view';

/**
 * A card laid on the desk: tooled leather, a ledger page set into it and a brass edge.
 * It slides in from the player's side while the camera eases over to frame it.
 * A restrained hand (Pinyon Script, iron-gall ink) is kept for a few accents; everything functional is Garamond.
 * The words are SDF text in the self-hosted EB Garamond (troika reads TTF, not WOFF2;
 * the files in assets/fonts have the old-style figures and small caps baked into the cmap).
 */
const FONTS: Record<SheetFont, string> = { roman: romanFont, smcp: smcpFont, italic: italicFont, figures: figuresFont, script: scriptFont };
/** On cream paper: all four clear 4.5:1. */
const INK: Record<SheetInk, string> = { ink: '#1c1916', soft: '#4a443c', quiet: '#5a544a', danger: '#843f22', gilt: '#70542a', iron: '#2f2117' };
/** Iron-gall ink dries a warm brown-black and never to one tone: each glyph takes one of these (7:1 or better on the page at 0.88 opacity). */
const IRON_TONES = ['#2a1d14', '#2f2117', '#33241a', '#2c1f15', '#3d2a1c', '#36261a'];
const OXBLOOD = '#5b1017';
const BRASS = '#b08d57';
const GILT = '#8a6a37';
/** Focus rule under a label: 6:1 on the page. */
const RULE = '#6b4f22';

const EDGE = 0.07; // brass rim width beyond the leather
const LEATHER_T = 0.06;
const PAGE_INSET = 0.17;
const PAPER_Z = LEATHER_T + 0.006;
const TEXT_Z = PAPER_Z + 0.006;
/** Wax seal radius, card units. */
const SEAL_R = 0.34;
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
        paper: new THREE.MeshStandardMaterial({ color: '#e9dcc0', roughness: 0.86, emissive: '#2e281e' }),
        deckle: new THREE.MeshStandardMaterial({ color: '#c9a45a', roughness: 0.5, metalness: 0.4 }),
        wax: new THREE.MeshStandardMaterial({ color: OXBLOOD, roughness: 0.5 }),
        emboss: new THREE.MeshStandardMaterial({ color: '#b48f45', roughness: 0.45, metalness: 0.5 }),
        foil: null,
      };
    }
    // Full-grain hide: fine pebble grain, a soft sheen at grazing angles and a trace of wax.
    const hide = makeLeather(1024, 77);
    for (const t of [hide.roughnessMap, hide.normalMap]) t.repeat.set(3, 4.5);
    const sheet = makePaper();
    for (const t of [sheet.normalMap, sheet.roughnessMap]) t.repeat.set(3, 4.5);
    return {
      leather: new THREE.MeshPhysicalMaterial({
        color: '#4a2218',
        roughnessMap: hide.roughnessMap,
        normalMap: hide.normalMap,
        normalScale: new THREE.Vector2(0.85, 0.85),
        roughness: 1,
        sheen: 0.9,
        sheenRoughness: 0.42,
        sheenColor: new THREE.Color('#a9694c'),
        clearcoat: 0.22,
        clearcoatRoughness: 0.38,
        envMapIntensity: 0.55,
      }),
      // Polished brass rim under a clear lacquer.
      brass: new THREE.MeshPhysicalMaterial({
        color: BRASS,
        metalness: 1,
        roughness: 0.26,
        clearcoat: 1,
        clearcoatRoughness: 0.06,
        envMapIntensity: 1.1,
      }),
      // Laid cotton paper: warm cream, edges toned, ribs and fibre in the relief to catch the light.
      paper: new THREE.MeshStandardMaterial({
        map: sheet.map,
        normalMap: sheet.normalMap,
        normalScale: new THREE.Vector2(0.32, 0.32),
        roughnessMap: sheet.roughnessMap,
        roughness: 1,
        emissive: '#2a2419',
        envMapIntensity: 0.35,
      }),
      // Gilt page edges: burnished gold leaf along the deckle.
      deckle: new THREE.MeshPhysicalMaterial({ color: '#d2ab5c', metalness: 1, roughness: 0.3, clearcoat: 0.4, clearcoatRoughness: 0.2, envMapIntensity: 1 }),
      // Sealing wax: dense, slightly glossy, a deep oxblood.
      wax: new THREE.MeshPhysicalMaterial({ color: OXBLOOD, roughness: 0.38, clearcoat: 0.55, clearcoatRoughness: 0.28, sheen: 0.4, sheenColor: new THREE.Color('#a8323a'), envMapIntensity: 0.6 }),
      // Blind-tooled gilt: raised metal ridge pressed into the hide.
      emboss: new THREE.MeshPhysicalMaterial({ color: '#c39a4a', metalness: 1, roughness: 0.34, clearcoat: 0.3, clearcoatRoughness: 0.3, envMapIntensity: 0.9 }),
      // Gold-foil headings: darkened so they hold 4.5:1 on the page.
      foil: new THREE.MeshStandardMaterial({ color: INK.gilt, metalness: 0.55, roughness: 0.4, envMapIntensity: 0.5 }),
    };
  }, []);
}

const unit = new THREE.PlaneGeometry(1, 1);
const gold = new THREE.MeshBasicMaterial({ color: GILT });
const track = new THREE.MeshBasicMaterial({ color: '#b3a78e' });
const hair = new THREE.MeshBasicMaterial({ color: '#8a8272' });

const rings = { outer: new THREE.RingGeometry(0.255, 0.265, 48), inner: new THREE.RingGeometry(0.225, 0.2295, 48) };
const capsule = new THREE.MeshBasicMaterial({ color: RULE, map: makeCapsule(), transparent: true, depthWrite: false, opacity: 0 });
const impression = new THREE.MeshBasicMaterial({ color: '#2e2414', map: makeImpression(), transparent: true, depthWrite: false, opacity: 0 });

/** A page whose edge wanders a fraction of a millimetre, like a mould-made sheet. UVs are 0–1 across the page (maps tile by their own repeat). */
function deckledPage(w: number, h: number, amp: number, seed: number) {
  let a = seed;
  const rnd = () => {
    a = (a * 1664525 + 1013904223) >>> 0;
    return a / 4294967296;
  };
  const pts: THREE.Vector2[] = [];
  const step = 0.045;
  const side = (x0: number, y0: number, x1: number, y1: number, nx: number, ny: number) => {
    const n = Math.max(2, Math.round(Math.hypot(x1 - x0, y1 - y0) / step));
    for (let i = 0; i < n; i++) {
      const t = i / n;
      const d = (rnd() - 0.5) * 2 * amp;
      pts.push(new THREE.Vector2(x0 + (x1 - x0) * t + nx * d, y0 + (y1 - y0) * t + ny * d));
    }
  };
  side(-w / 2, -h / 2, w / 2, -h / 2, 0, 1);
  side(w / 2, -h / 2, w / 2, h / 2, 1, 0);
  side(w / 2, h / 2, -w / 2, h / 2, 0, 1);
  side(-w / 2, h / 2, -w / 2, -h / 2, 1, 0);
  const g = new THREE.ShapeGeometry(new THREE.Shape(pts));
  const uv = g.attributes.uv as THREE.BufferAttribute;
  const pos = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) / w + 0.5, pos.getY(i) / h + 0.5);
  return g;
}

/** A seal of wax: a round blob with an uneven rim and a thin flash of squeezed-out wax, pressed to a flat disc with a raised lip. */
function waxSeal(r: number, seed: number) {
  let a = seed;
  const rnd = () => {
    a = (a * 1664525 + 1013904223) >>> 0;
    return a / 4294967296;
  };
  const n = 36;
  const wob = Array.from({ length: n }, () => rnd());
  const pts = Array.from({ length: n }, (_, i) => {
    const t = (i / n) * Math.PI * 2;
    // Two slow lobes plus per-point jitter; one flat side where the wax ran.
    const rad = r * (1 + 0.05 * Math.sin(2 * t + 1) + 0.04 * Math.sin(3 * t + 2) + (wob[i]! - 0.5) * 0.06);
    return new THREE.Vector2(Math.cos(t) * rad, Math.sin(t) * rad);
  });
  const outer = new THREE.ExtrudeGeometry(new THREE.Shape(pts), { depth: 0.02, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.014, bevelSegments: 3, curveSegments: 6 });
  const lip = new THREE.Shape();
  lip.absarc(0, 0, r * 0.74, 0, Math.PI * 2, false);
  const hole = new THREE.Path();
  hole.absarc(0, 0, r * 0.66, 0, Math.PI * 2, true);
  lip.holes.push(hole);
  const ring = new THREE.ExtrudeGeometry(lip, { depth: 0.012, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.006, bevelSegments: 2, curveSegments: 24 });
  return { outer, ring };
}

/** A raised ridge: the outline of a rounded rectangle, `t` wide, as an extruded ring with a soft bevel. */
function ridge(w: number, h: number, r: number, t: number, height: number) {
  const outer = roundedRect(new THREE.Shape(), w + t, h + t, r + t / 2);
  outer.holes.push(roundedRect(new THREE.Path(), w - t, h - t, Math.max(0.005, r - t / 2)));
  return new THREE.ExtrudeGeometry(outer, { depth: height, bevelEnabled: true, bevelThickness: height * 0.6, bevelSize: t * 0.3, bevelSegments: 2, curveSegments: 6 });
}

function Flat({ x, y, w, h, material, z = TEXT_Z - 0.003, rot = 0 }: { x: number; y: number; w: number; h: number; material: THREE.Material; z?: number; rot?: number }) {
  return <mesh geometry={unit} material={material} position={[x, y, z]} scale={[w, h, 1]} rotation={[0, 0, rot]} />;
}

type Bounds = [number, number, number, number];

function Item({ item, foil, onBounds }: { item: SheetItem; foil: THREE.Material | null; onBounds(item: SheetItem, b: Bounds): void }) {
  switch (item.kind) {
    case 'text': {
      if (item.font === 'script') return <Script item={item} onBounds={onBounds} />;
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
          material={item.ink === 'gilt' && foil ? foil : undefined}
          // Letterpress: a faint shadow just up-left of the stroke, as ink sits in the sheet.
          {...(LITE ? {} : { outlineColor: '#6e6249', outlineOpacity: 0.2, outlineBlur: '5%', outlineOffsetX: '-1.5%', outlineOffsetY: '2%', outlineWidth: 0 })}
          onSync={(t: { textRenderInfo?: { blockBounds: Bounds } }) => t.textRenderInfo && onBounds(item, t.textRenderInfo.blockBounds)}
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

/** Deterministic per-glyph ink tone, so a redraw never shimmers. */
function inkTones(text: string) {
  const ranges: Record<number, number> = {};
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h = Math.imul(h ^ text.charCodeAt(i), 16777619) ^ (i * 40503);
    ranges[i] = new THREE.Color(IRON_TONES[(h >>> 0) % IRON_TONES.length]!).getHex();
  }
  return ranges;
}

/**
 * Copperplate accent: a fine pen hand in warm iron-gall. Each glyph takes a slightly different
 * tone (the nib's flow varies); the ink sits a touch translucent with only a whisper of bleed, so the hairlines stay thin.
 */
function Script({ item, onBounds }: { item: SheetText; onBounds(item: SheetItem, b: Bounds): void }) {
  const align = item.align ?? 'left';
  const colorRanges = useMemo(() => (LITE ? undefined : inkTones(item.text)), [item.text]);
  return (
    <Text
      font={scriptFont}
      fontSize={item.size}
      color={INK[item.ink ?? 'iron']}
      position={[item.x, item.y, TEXT_Z]}
      rotation={[0, 0, THREE.MathUtils.degToRad(item.tilt ?? 0)]}
      anchorX={align}
      anchorY="bottom-baseline"
      textAlign={align}
      sdfGlyphSize={LITE ? 32 : 128}
      {...(colorRanges ? { colorRanges } : {})}
      fillOpacity={LITE ? 1 : 0.88}
      {...(LITE ? {} : { outlineColor: '#3a2818', outlineOpacity: 0.18, outlineBlur: '3%', outlineWidth: 0 })}
      onSync={(t: { textRenderInfo?: { blockBounds: Bounds } }) => t.textRenderInfo && onBounds(item, t.textRenderInfo.blockBounds)}
    >
      {item.text}
    </Text>
  );
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
  const markRef = useRef<THREE.Mesh>(null);
  const ruleRef = useRef<THREE.Mesh>(null);
  /** Troika's measured box for each text, in card units, by the control whose rect holds it. */
  const labels = useRef(new Map<string, Bounds>());
  const touch = useRef({ press: 0, rule: 0 });
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

  useEffect(() => labels.current.clear(), [last]);
  const onBounds = (item: SheetItem, b: Bounds) => {
    if (item.kind !== 'text' || !last) return;
    const r = last.rects.find((q) => within(item, q));
    if (r) labels.current.set(r.id, [item.x + b[0], item.y + b[1], item.x + b[2], item.y + b[3]]);
  };

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
    const frame = [ridge(W - 2 * PAGE_INSET + 0.1, H - 2 * PAGE_INSET + 0.1, 0.03, 0.026, 0.012), ridge(W - 2 * PAGE_INSET + 0.2, H - 2 * PAGE_INSET + 0.2, 0.05, 0.01, 0.007)];
    const page = deckledPage(W - 2 * PAGE_INSET, H - 2 * PAGE_INSET, 0.007, 91);
    const edge = deckledPage(W - 2 * PAGE_INSET + 0.03, H - 2 * PAGE_INSET + 0.03, 0.011, 17);
    return { leather, brass, frame, page, edge, seal: waxSeal(SEAL_R, 5) };
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

    // Touch state, drawn on the card: an impression under the pressed label, a brass rule under
    // the focused one (hover shows it faintly). Boxes come from troika's measured text bounds.
    const box = (id: string | null): Bounds | null => {
      if (!id) return null;
      const m = labels.current.get(id);
      if (m) return m;
      const r = last.rects.find((q) => q.id === id);
      return r ? [r.x - r.w / 2, r.y - r.h / 2, r.x + r.w / 2, r.y + r.h / 2] : null;
    };
    const k = 1 - Math.exp(-dt * (calm ? 60 : 22));
    const pressBox = box(sheetUi.press);
    const ruleId = sheetUi.focus ?? sheetUi.hover;
    const ruleBox = box(ruleId);
    touch.current.press += ((pressBox ? 1 : 0) - touch.current.press) * k;
    touch.current.rule += ((ruleBox ? (sheetUi.focus ? 1 : 0.45) : 0) - touch.current.rule) * k;
    const mark = markRef.current;
    const rule = ruleRef.current;
    if (mark && pressBox) {
      mark.position.set((pressBox[0] + pressBox[2]) / 2, (pressBox[1] + pressBox[3]) / 2, PAPER_Z + 0.002);
      mark.scale.set(pressBox[2] - pressBox[0] + 0.3, pressBox[3] - pressBox[1] + 0.22, 1);
    }
    if (rule && ruleBox) {
      rule.position.set((ruleBox[0] + ruleBox[2]) / 2, ruleBox[1] - 0.045, TEXT_Z - 0.002);
      rule.scale.set(ruleBox[2] - ruleBox[0] + 0.12, 0.022, 1);
    }
    impression.opacity = 0.34 * touch.current.press;
    capsule.opacity = touch.current.rule;
    if (mark) mark.visible = touch.current.press > 0.01;
    if (rule) rule.visible = touch.current.rule > 0.01;

    // Keep each real button over its drawn label.
    if (p < 0.02) return;
    c.updateMatrixWorld(true);
    const view = gl.domElement.getBoundingClientRect();
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
          const px = view.left + ((corner.x + 1) / 2) * view.width;
          const py = view.top + ((1 - corner.y) / 2) * view.height;
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
        {/* Gilt ridges tooled into the leather, round the page. */}
        {geometries.frame.map((g, i) => (
          <mesh key={i} geometry={g} material={m.emboss} position={[0, 0, LEATHER_T - 0.002]} />
        ))}
        <Corners w={W - 2 * PAGE_INSET + 0.1} h={H - 2 * PAGE_INSET + 0.1} material={m.emboss} />
        <mesh geometry={geometries.edge} material={m.deckle} position={[0, 0, PAPER_Z - 0.002]} />
        <mesh geometry={geometries.page} material={m.paper} position={[0, 0, PAPER_Z]} />
        <mesh ref={markRef} geometry={unit} material={impression} visible={false} renderOrder={3} />
        <mesh ref={ruleRef} geometry={unit} material={capsule} visible={false} renderOrder={4} />
        {last.monogram && <Monogram y={H / 2 - PAGE_INSET - 0.36} material={m.foil} />}
        {last.seal && (
          <group position={[last.seal.x, last.seal.y, PAPER_Z + 0.002]} rotation={[0, 0, 0.35]}>
            <mesh geometry={geometries.seal.outer} material={m.wax} />
            <mesh geometry={geometries.seal.ring} material={m.wax} position={[0, 0, 0.03]} />
            <Text font={scriptFont} fontSize={SEAL_R * 1.12} color="#3c0a0f" position={[0, -SEAL_R * 0.38, 0.034]} rotation={[0, 0, -0.35]} anchorX="center" anchorY="bottom-baseline" sdfGlyphSize={LITE ? 32 : 64} fillOpacity={0.9}>
              P
            </Text>
          </group>
        )}
        {last.items.map((item, i) => (
          <Item key={`${last.key}-${i}`} item={item} foil={m.foil} onBounds={onBounds} />
        ))}
      </group>
    </group>
  );
}

/** A gilt "P" cypher inside a double ring, engraved at the head of the page. */
function Monogram({ y, material }: { y: number; material: THREE.Material | null }) {
  return (
    <group position={[0, y, TEXT_Z - 0.002]}>
      <mesh geometry={rings.outer} material={gold} />
      <mesh geometry={rings.inner} material={gold} />
      <Text
        font={scriptFont}
        fontSize={0.42}
        color={GILT}
        position={[0.01, -0.16, 0.002]}
        anchorX="center"
        anchorY="bottom-baseline"
        sdfGlyphSize={LITE ? 32 : 128}
        material={material ?? undefined}
        {...(LITE ? {} : { outlineColor: '#4a3a1c', outlineOpacity: 0.25, outlineBlur: '6%', outlineOffsetX: '-1.5%', outlineOffsetY: '2%', outlineWidth: 0 })}
      >
        P
      </Text>
    </group>
  );
}

/** A small lozenge set at each corner of the tooled frame. */
function Corners({ w, h, material }: { w: number; h: number; material: THREE.Material }) {
  return (
    <>
      {[-1, 1].flatMap((sx) =>
        [-1, 1].map((sy) => (
          <mesh key={`${sx}${sy}`} geometry={unit} material={material} position={[(sx * w) / 2, (sy * h) / 2, LEATHER_T + 0.01]} rotation={[0, 0, Math.PI / 4]} scale={[0.08, 0.08, 1]} />
        )),
      )}
    </>
  );
}

/** Whether a drawn label sits inside a control's rect. */
function within(item: SheetItem, r: SheetRect) {
  return item.kind === 'text' && Math.abs(item.x - r.x) <= r.w / 2 && Math.abs(item.y - r.y) <= r.h / 2;
}
