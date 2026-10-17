import { Text } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import italicFont from '../assets/fonts/ledger-italic.ttf?url';
import smcpFont from '../assets/fonts/ledger-smcp.ttf?url';
import scriptFont from '../assets/fonts/pinyon-script.ttf?url';
import { isCalm } from '../motion';
import { usePalace } from '../store';
import { DESK_Y, MAT } from '../three/Desk';
import { neckMatrix } from '../three/layout';
import { COLORS } from '../three/palette';
import { LITE } from '../three/quality';
import { makeLeather, makePaper } from '../three/textures';
import { setRoomAnchor, useRoomFrame } from '../three/view';
import { figuresFor, pair, pegsFor, wordFor } from './logic';
import { useLedger } from './store';

/**
 * Ledger on the desk: an account book bound in oxblood leather, lying open. The left page
 * (the top one on a phone, where the book lies bound along its head) keeps the sitting's
 * account by hand; the right page is where the clerk writes the number in copperplate ink,
 * a figure at a time, and where the player's figures appear as they key them back. The
 * page is ruled like a real ledger: faint blue lines and a double red margin.
 *
 * Built in world space with the rig's turn undone, so the pages always read across the screen.
 */

const INK = '#2a1d14';
const PENCIL = '#6a6258';
const GILT = '#70542a';
const RED_RULE = '#a2463c';
const BLUE_RULE = '#7d8fa3';

const PAGE_T = 0.05;
const COVER_T = 0.035;
const COVER_RIM = 0.16;
const GUTTER = 0.08;

interface Ink {
  key: string;
  text: string;
  x: number;
  /** Down the page from its head, page units. */
  y: number;
  size: number;
  font: 'script' | 'italic' | 'smcp';
  color: string;
  align?: 'left' | 'center' | 'right';
  /** Struck through (a wrong figure). */
  struck?: boolean;
  /** Written with a pen stroke when it first appears. */
  pen?: boolean;
}

const FONTS = { script: scriptFont, italic: italicFont, smcp: smcpFont };

/** One run of ink. A pen-written figure is revealed left to right as it first appears. */
function InkText({ item, born }: { item: Ink; born: number }) {
  const ref = useRef<THREE.Mesh & { clipRect: number[] | null }>(null);
  useFrame(() => {
    const t = ref.current;
    if (!t || !item.pen) return;
    const k = isCalm() ? 1 : Math.min(1, (performance.now() - born) / 260);
    t.clipRect = k >= 1 ? null : [-item.size, -item.size * 2, -item.size * 0.6 + item.size * 1.4 * k, item.size * 2];
  });
  return (
    <group position={[item.x, 0, item.y]}>
      <Text
        ref={ref}
        font={FONTS[item.font]}
        fontSize={item.size}
        color={item.color}
        anchorX={item.align ?? 'center'}
        anchorY="bottom-baseline"
        rotation={[-Math.PI / 2, 0, 0]}
        letterSpacing={item.font === 'smcp' ? 0.05 : 0}
        sdfGlyphSize={LITE ? 32 : 64}
        fillOpacity={0.92}
      >
        {item.text}
      </Text>
      {item.struck && (
        <mesh position={[0, 0.002, -item.size * 0.28]} rotation={[-Math.PI / 2, 0, -0.18]}>
          <planeGeometry args={[item.size * 0.9, item.size * 0.06]} />
          <meshBasicMaterial color={COLORS.miss} />
        </mesh>
      )}
    </group>
  );
}

/** The layout of a number on the page: rows of up to ten figures, a gap between pairs. */
function figureSlots(n: number, width: number, glosses: boolean) {
  const per = 10;
  const adv = Math.min(0.3, (width - 0.5) / (per + 2));
  const gap = adv * 0.45;
  const rowH = glosses ? 0.86 : 0.64;
  const rows = Math.ceil(n / per);
  return Array.from({ length: n }, (_, i) => {
    const row = Math.floor(i / per);
    const col = i % per;
    const inRow = Math.min(per, n - row * per);
    const rowW = inRow * adv + Math.floor((inRow - 1) / 2) * gap;
    const x = -rowW / 2 + adv / 2 + col * adv + Math.floor(col / 2) * gap;
    return { x, y: (row - (rows - 1) / 2) * rowH, adv };
  });
}

/** What the right-hand page shows now. */
function useEntry(PAGE: PageSize): Ink[] {
  const st = useLedger((s) => s.stage)();
  const phase = useLedger((s) => s.phase);
  const digits = useLedger((s) => s.digits);
  const written = useLedger((s) => s.written);
  const done = useLedger((s) => s.done);
  const slip = useLedger((s) => s.slip);
  const q = useLedger((s) => s.question);
  const chosen = useLedger((s) => s.chosen);
  return useMemo(() => {
    const out: Ink[] = [];
    const size = 0.46;
    if (st.kind === 'span') {
      const glosses = st.glosses && phase === 'study';
      const slots = figureSlots(digits.length, PAGE.w, st.glosses);
      const pegs = pegsFor(digits);
      digits.forEach((d, i) => {
        const s = slots[i]!;
        let text = '';
        let color = INK;
        let pen = true;
        if (phase === 'write' || phase === 'study') text = i < written ? String(d) : '';
        else if (phase === 'recall' || phase === 'clean') text = i < done ? String(d) : '';
        else if (phase === 'slip') {
          if (i < done) text = String(d);
          else if (i === done) {
            text = String(d);
            color = COLORS.correct;
            pen = false;
            out.push({ key: `w${i}`, text: String(slip?.keyed ?? ''), x: s.x, y: s.y - size * 0.9, size: size * 0.6, font: 'script', color: COLORS.miss, struck: true });
          } else {
            text = String(d);
            color = PENCIL;
            pen = false;
          }
        }
        if (text) out.push({ key: `d${i}-${phase === 'slip' ? 's' : ''}`, text, x: s.x, y: s.y, size, font: 'script', color, pen });
        // A blank slot: a short ruled stroke where the figure goes.
        if (!text && (phase === 'recall' || phase === 'clean')) out.push({ key: `u${i}`, text: '_', x: s.x, y: s.y, size: size * 0.6, font: 'italic', color: PENCIL });
        if (glosses && i % 2 === 0 && i < written) out.push({ key: `g${i}`, text: pegs[i / 2]!, x: s.x + (i + 1 < digits.length ? s.adv / 2 : 0), y: s.y + 0.32, size: 0.15, font: 'italic', color: PENCIL });
      });
      return out;
    }
    if (!q) return out;
    const figs = figuresFor(st, q.item);
    const fig = st.kind === 'sounds' ? String(q.item) : pair(q.item);
    const word = wordFor(st, q.item);
    const settled = phase === 'right' || phase === 'wrong';
    if (q.kind === 'pick') {
      out.push({ key: `q${q.item}`, text: fig, x: 0, y: -0.25, size: 1.1, font: 'script', color: INK, pen: true });
      if (settled) {
        out.push({ key: `a${q.item}`, text: word, x: 0, y: 0.75, size: 0.46, font: 'script', color: phase === 'right' ? INK : COLORS.correct, pen: true });
        if (phase === 'wrong') out.push({ key: `c${q.item}`, text: wordFor(st, q.choices[chosen] ?? q.item), x: 0, y: 1.25, size: 0.3, font: 'script', color: COLORS.miss, struck: true });
      }
    } else {
      out.push({ key: `q${q.item}`, text: word, x: 0, y: -0.35, size: st.kind === 'sounds' ? 0.62 : 0.78, font: 'script', color: INK, pen: true });
      const adv = 0.5;
      figs.forEach((f, i) => {
        const x = (i - (figs.length - 1) / 2) * adv;
        const shown = i < done || phase === 'wrong';
        const color = phase === 'wrong' && i >= done ? COLORS.correct : INK;
        if (shown) out.push({ key: `k${q.item}-${i}-${phase}`, text: String(f), x, y: 0.75, size: 0.6, font: 'script', color, pen: color === INK });
        else out.push({ key: `u${i}`, text: '_', x, y: 0.75, size: 0.4, font: 'italic', color: PENCIL });
      });
      if (phase === 'wrong' && chosen >= 0) out.push({ key: `x${q.item}`, text: String(chosen), x: (done - (figs.length - 1) / 2) * adv, y: 1.3, size: 0.32, font: 'script', color: COLORS.miss, struck: true });
    }
    return out;
  }, [st, phase, digits, written, done, slip, q, chosen, PAGE]);
}

/** What the left-hand page keeps: the room, the stage, and the sitting's account. */
function useAccount(PAGE: PageSize): Ink[] {
  const st = useLedger((s) => s.stage)();
  const log = useLedger((s) => s.log);
  return useMemo(() => {
    const top = -PAGE.d / 2;
    const left = -PAGE.w / 2 + 0.55;
    const out: Ink[] = [
      { key: 'h', text: 'Palace · Ledger', x: 0, y: top + 0.42, size: 0.15, font: 'smcp', color: PENCIL },
      { key: 't', text: st.title, x: 0, y: top + 0.86, size: 0.27, font: 'italic', color: GILT },
    ];
    log.forEach((e, i) => {
      const y = top + 1.42 + i * RULE_GAP;
      out.push(
        { key: `l${i}a-${e.figures}-${log.length}`, text: e.figures, x: left, y, size: 0.27, font: 'script', color: INK, align: 'left' },
        { key: `l${i}b-${e.words}-${log.length}`, text: e.words, x: left + 0.95, y, size: 0.24, font: 'script', color: INK, align: 'left' },
        { key: `l${i}c-${e.ok}-${log.length}`, text: e.ok ? '✓' : '✗', x: PAGE.w / 2 - 0.3, y, size: 0.22, font: 'italic', color: e.ok ? COLORS.correct : COLORS.miss, align: 'right' },
      );
    });
    return out;
  }, [st, log, PAGE]);
}

const RULE_GAP = 0.4;
/** Page size: a tall page side by side on a wide screen; on a phone the book lies bound along its head, pages one above the other. */
type PageSize = { w: number; d: number };
const PORTRAIT_PAGE: PageSize = { w: 3.9, d: 3.0 };
const LANDSCAPE_PAGE: PageSize = { w: 3.4, d: 4.4 };

function useMaterials() {
  return useMemo(() => {
    if (LITE) {
      return {
        cover: new THREE.MeshStandardMaterial({ color: '#4a1916', roughness: 0.7 }),
        paper: new THREE.MeshStandardMaterial({ color: '#e9dcc0', roughness: 0.95, emissive: '#2a2722' }),
        edge: new THREE.MeshStandardMaterial({ color: '#c9a35e', metalness: 0.5, roughness: 0.35 }),
        blue: new THREE.MeshBasicMaterial({ color: BLUE_RULE, transparent: true, opacity: 0.5 }),
        red: new THREE.MeshBasicMaterial({ color: RED_RULE, transparent: true, opacity: 0.75 }),
        brass: new THREE.MeshStandardMaterial({ color: COLORS.brass, metalness: 0.85, roughness: 0.22 }),
      };
    }
    const hide = makeLeather(512, 91);
    for (const t of [hide.roughnessMap, hide.normalMap]) t.repeat.set(3, 3);
    const sheet = makePaper(512, 53);
    for (const t of [sheet.normalMap, sheet.roughnessMap]) t.repeat.set(3, 4);
    return {
      cover: new THREE.MeshPhysicalMaterial({
        color: '#3d1210',
        roughnessMap: hide.roughnessMap,
        normalMap: hide.normalMap,
        normalScale: new THREE.Vector2(0.6, 0.6),
        roughness: 1,
        sheen: 0.6,
        sheenRoughness: 0.45,
        sheenColor: new THREE.Color('#8a3a30'),
        clearcoat: 0.25,
        clearcoatRoughness: 0.35,
        envMapIntensity: 0.5,
      }),
      paper: new THREE.MeshStandardMaterial({
        map: sheet.map,
        normalMap: sheet.normalMap,
        normalScale: new THREE.Vector2(0.22, 0.22),
        roughnessMap: sheet.roughnessMap,
        roughness: 1,
        color: '#e9eaee',
        emissive: '#2a2722',
        envMapIntensity: 0.35,
      }),
      edge: new THREE.MeshPhysicalMaterial({ color: '#d2ab5c', metalness: 1, roughness: 0.3, clearcoat: 0.4, envMapIntensity: 1 }),
      blue: new THREE.MeshBasicMaterial({ color: BLUE_RULE, transparent: true, opacity: 0.45 }),
      red: new THREE.MeshBasicMaterial({ color: RED_RULE, transparent: true, opacity: 0.7 }),
      brass: new THREE.MeshPhysicalMaterial({ color: COLORS.brass, metalness: 1, roughness: 0.24, clearcoat: 1, clearcoatRoughness: 0.08, envMapIntensity: 1.2 }),
    };
  }, []);
}

/** One page: the paper block, its gilt edge, the blue rules and the double red margin, and its ink. */
function Page({ PAGE, at, m, items, margin, first }: { PAGE: PageSize; at: [number, number]; m: ReturnType<typeof useMaterials>; items: Ink[]; margin: boolean; first: number }) {
  const born = useRef(new Map<string, number>());
  const now = performance.now();
  for (const it of items) if (!born.current.has(it.key)) born.current.set(it.key, now);
  const rules = useMemo(() => {
    const ys: number[] = [];
    for (let y = -PAGE.d / 2 + first; y < PAGE.d / 2 - 0.2; y += RULE_GAP) ys.push(y + 0.08);
    return ys;
  }, [first, PAGE.d]);
  return (
    <group position={[at[0], 0, at[1]]}>
      <mesh material={m.paper} position={[0, PAGE_T / 2 + COVER_T, 0]}>
        <boxGeometry args={[PAGE.w, PAGE_T, PAGE.d]} />
      </mesh>
      <group position={[0, COVER_T + PAGE_T + 0.004, 0]}>
        {rules.map((y) => (
          <mesh key={y} material={m.blue} position={[0, 0, y]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[PAGE.w - 0.24, 0.008]} />
          </mesh>
        ))}
        {margin &&
          [0.36, 0.41].map((x) => (
            <mesh key={x} material={m.red} position={[-PAGE.w / 2 + x, 0.0015, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <planeGeometry args={[0.01, PAGE.d - 0.2]} />
            </mesh>
          ))}
        <group position={[0, 0.003, 0]}>
          {items.map((it) => (
            <InkText key={it.key} item={it} born={born.current.get(it.key) ?? now} />
          ))}
        </group>
      </group>
    </group>
  );
}

export function LedgerBook() {
  const size = useThree((s) => s.size);
  const portrait = size.height > size.width * 1.05;
  const leftHanded = usePalace((s) => s.saved.settings.leftHanded);
  const view = useMemo(() => ({ portrait, leftHanded }), [portrait, leftHanded]);
  const PAGE = portrait ? PORTRAIT_PAGE : LANDSCAPE_PAGE;
  const m = useMaterials();
  const entry = useEntry(PAGE);
  const account = useAccount(PAGE);

  const unturn = useMemo(() => new THREE.Matrix4().set(...(neckMatrix(view) as Parameters<THREE.Matrix4['set']>)).transpose(), [view]);
  const centre = useMemo(() => new THREE.Vector3(0, DESK_Y + MAT.thickness, 0), []);
  const turn = useRef<THREE.Group>(null);
  useLayoutEffect(() => {
    const g = turn.current;
    if (!g) return;
    g.matrix.copy(unturn);
    g.matrixWorldNeedsUpdate = true;
  }, [unturn]);

  // The pages: side by side, or one above the other on a phone.
  const off = PAGE.w / 2 + GUTTER / 2;
  const offD = PAGE.d / 2 + GUTTER / 2;
  const leftAt: [number, number] = portrait ? [0, -offD] : [-off, 0];
  const rightAt: [number, number] = portrait ? [0, offD] : [off, 0];
  const bw = portrait ? PAGE.w + 2 * COVER_RIM : 2 * PAGE.w + GUTTER + 2 * COVER_RIM;
  const bd = portrait ? 2 * PAGE.d + GUTTER + 2 * COVER_RIM : PAGE.d + 2 * COVER_RIM;

  const setFrame = useRoomFrame((s) => s.set);
  useLayoutEffect(() => {
    const pts: THREE.Vector3[] = [];
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) pts.push(new THREE.Vector3(centre.x + (sx * bw) / 2, centre.y, centre.z + (sz * bd) / 2));
    setFrame({ key: `ledger-${portrait ? 'p' : 'l'}-${leftHanded ? 'm' : 'r'}`, points: pts, elevation: portrait ? 72 : 70 });
  }, [centre, bw, bd, portrait, leftHanded, setFrame]);
  useLayoutEffect(() => () => setFrame(null), [setFrame]);

  const anchor = useRef<THREE.Group>(null);
  useLayoutEffect(() => {
    setRoomAnchor((out) => {
      const g = anchor.current;
      if (!g) return false;
      g.getWorldPosition(out);
      return true;
    });
    return () => setRoomAnchor(null);
  }, []);

  return (
    <group ref={turn} matrixAutoUpdate={false}>
      <group position={centre}>
        {/* The cover, open flat, and a brass clasp plate at its foot. */}
        <mesh material={m.cover} position={[0, COVER_T / 2, 0]}>
          <boxGeometry args={[bw, COVER_T, bd]} />
        </mesh>
        <mesh material={m.edge} position={[0, COVER_T + 0.002, 0]} rotation={[-Math.PI / 2, 0, portrait ? 0 : Math.PI / 2]}>
          <planeGeometry args={[portrait ? PAGE.w : PAGE.d, GUTTER]} />
        </mesh>
        {[-1, 1].map((s) => (
          <mesh key={s} material={m.brass} position={portrait ? [(s * bw) / 2 - s * 0.05, COVER_T + 0.004, 0] : [0, COVER_T + 0.004, (s * bd) / 2 - s * 0.05]}>
            <boxGeometry args={portrait ? [0.1, 0.012, 0.5] : [0.5, 0.012, 0.1]} />
          </mesh>
        ))}
        <Page PAGE={PAGE} at={leftAt} m={m} items={account} margin first={1.12} />
        <Page PAGE={PAGE} at={rightAt} m={m} items={entry} margin={false} first={0.5} />
        <group ref={anchor} position={[rightAt[0], 0.2, rightAt[1]]} />
      </group>
    </group>
  );
}
