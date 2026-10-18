import { useEffect, useMemo, useState } from 'react';
import { ComboMeter } from '../rewards/ComboMeter';
import { useRewards } from '../rewards/store';
import { RoomsMark, StagesMark, useInsetReporter } from '../ui/Hud';
import { blockDom, blockRects } from './fx';
import { blockLayout } from './layout';
import { DROPS_PER_SITTING, missTitle } from '../game/span';
import { blocksProgress } from './logic';
import { useBlocks } from './store';

function Prompt() {
  const phase = useBlocks((s) => s.phase);
  const length = useBlocks((s) => s.line.length);
  const done = useBlocks((s) => s.done);
  const reverse = useBlocks((s) => s.stage().order === 'reverse');
  const slip = useBlocks((s) => s.slip);
  const ends = useBlocks((s) => s.sitting.drops >= DROPS_PER_SITTING);
  let title = 'Watch.';
  let sub = `Line of ${length}`;
  let tone = '';
  if (phase === 'recall') {
    title = reverse ? 'Tap them back, last first.' : 'Tap them back.';
    sub = `${done} of ${length}`;
  } else if (phase === 'clean') {
    title = 'Every one.';
    sub = `Line of ${done}`;
    tone = 'correct';
  } else if (phase === 'slip' && slip) {
    title = missTitle(slip.outcome, slip.next, ends);
    sub = 'The green block was next.';
    tone = 'miss';
  }
  return (
    <div className="prompt scrimmed" aria-live="polite">
      <h1 className={`prompt-title ${tone}`} data-testid="prompt">
        {title}
      </h1>
      <p className="prompt-sub" data-testid="prompt-where">
        {sub}
      </p>
    </div>
  );
}

/** For a screen reader: each block the board lights, by number, as it lights. */
function Caller() {
  const showing = useBlocks((s) => s.showing);
  const line = useBlocks((s) => s.line);
  const phase = useBlocks((s) => s.phase);
  const said = phase === 'show' && showing >= 0 ? `Block ${line[showing]! + 1}` : '';
  return (
    <p className="sr-only" aria-live="assertive" data-testid="blocks-caller">
      {said}
    </p>
  );
}

/** One hairline: the stage, its best line against the mastery bar, the run, the drop-backs, New line, End. */
function Meta() {
  const stage = useBlocks((s) => s.stage)();
  const record = useBlocks((s) => s.record);
  const drops = useBlocks((s) => s.sitting.drops);
  const newLine = useBlocks((s) => s.newLine);
  const end = useBlocks((s) => s.end);
  const prog = blocksProgress(stage, record);
  return (
    <div className="meta scrimmed echo-meta" data-testid="progress">
      <span className="meta-stage" data-testid="meta-stage" aria-label={`${stage.title}, best line ${prog.best} of ${prog.mastery}`}>
        {stage.title}
        {prog.mastered && <span className="gilt-mark" role="img" aria-label="mastered" />}
      </span>
      <span className="hairline" aria-hidden>
        <span style={{ width: `${Math.round(prog.toward * 100)}%` }} />
      </span>
      <span className="meta-run" title="Clean lines in a row">
        <span className="meta-label">Run</span>
        <RunNumeral />
        <ComboMeter />
      </span>
      <span className="echo-slips" role="img" aria-label={`${drops} of ${DROPS_PER_SITTING} drop-backs`} title="Two misses in a row drop you back. Three drop-backs end the sitting." data-testid="blocks-slips">
        {Array.from({ length: DROPS_PER_SITTING }, (_, i) => (
          <span key={i} className={`echo-slip ${i < drops ? 'spent' : ''}`} />
        ))}
      </span>
      <button className="meta-action" onClick={newLine} data-testid="blocks-new">
        New line
      </button>
      <button className="meta-action" onClick={end} data-testid="session-end">
        End
      </button>
    </div>
  );
}

function RunNumeral() {
  const run = useRewards((s) => s.streak);
  return (
    <span className="numeral-run" data-testid="streak">
      {run}
    </span>
  );
}

function usePortrait() {
  const read = () => window.innerHeight > window.innerWidth * 1.05;
  const [portrait, setPortrait] = useState(read);
  useEffect(() => {
    const on = () => setPortrait(read());
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return portrait;
}

/** Where a block lies on the board, in words: "back left", "middle", "front right". */
function placeWords(x: number, z: number, w: number, d: number) {
  const col = x < -w / 6 ? 'left' : x > w / 6 ? 'right' : '';
  const row = z < -d / 6 ? 'back' : z > d / 6 ? 'front' : '';
  return [row, col].filter(Boolean).join(' ') || 'middle';
}

/** The nearest block from `from` in an arrow's direction, by the buttons' places on screen. */
function nearest(from: number, dx: number, dy: number): number | null {
  const a = blockRects.get(from);
  if (!a) return null;
  const ax = a.x + a.w / 2;
  const ay = a.y + a.h / 2;
  let best: number | null = null;
  let score = Infinity;
  for (const [i, r] of blockRects) {
    if (i === from) continue;
    const vx = r.x + r.w / 2 - ax;
    const vy = r.y + r.h / 2 - ay;
    const along = vx * dx + vy * dy;
    if (along <= 1) continue;
    const across = Math.abs(vx * dy - vy * dx);
    // Straight ahead counts most; a block well off the line of the arrow costs twice its offset.
    const s = along + 2 * across;
    if (s < score) {
      score = s;
      best = i;
    }
  }
  return best;
}

const ARROWS: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };

/**
 * The real buttons over the blocks. The scene keeps each over its block (never under 48 px).
 * Tab or the arrow keys move between blocks, Enter or Space taps one; on a board of nine, the
 * number keys tap a block straight off.
 */
function BlockButtons({ live }: { live: boolean }) {
  const stage = useBlocks((s) => s.stage)();
  const seed = useBlocks((s) => s.seed);
  const recall = useBlocks((s) => s.phase === 'recall');
  const press = useBlocks((s) => s.press);
  const portrait = usePortrait();
  const n = stage.blocks;
  const board = useMemo(() => blockLayout(n, portrait, seed), [n, portrait, seed]);
  // A different board: the old places on screen no longer hold until the scene places the new one.
  useEffect(() => {
    for (const i of [...blockRects.keys()]) if (i >= n) blockRects.delete(i);
    return () => {
      for (const i of [...blockRects.keys()]) if (i >= n) blockRects.delete(i);
    };
  }, [n]);

  useEffect(() => {
    if (!live) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.altKey || e.ctrlKey || e.metaKey) return;
      const arrow = ARROWS[e.key];
      if (arrow) {
        const el = document.activeElement as HTMLElement | null;
        const from = el?.dataset.block !== undefined ? Number(el.dataset.block) : null;
        if (from === null) {
          e.preventDefault();
          blockDom.get(0)?.focus();
          return;
        }
        const to = nearest(from, arrow[0], arrow[1]);
        e.preventDefault();
        if (to !== null) blockDom.get(to)?.focus();
        return;
      }
      if (n > 9) return;
      const d = /^(?:Digit|Numpad)([1-9])$/.exec(e.code)?.[1] ?? (/^[1-9]$/.test(e.key) ? e.key : null);
      if (!d) return;
      const block = Number(d) - 1;
      if (block >= n) return;
      e.preventDefault();
      press(block);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [live, n, press]);

  return (
    <div className="blocks-pad" role="group" aria-label="Blocks">
      {board.blocks.map((b, i) => (
        <button
          key={`${n}-${i}`}
          ref={(el) => {
            // A re-render hands the same button back: keep its place on screen (dropped only when the board changes, below).
            if (el) blockDom.set(i, el);
            else if (blockDom.get(i)?.isConnected === false) blockDom.delete(i);
          }}
          className="block-hit"
          data-block={i}
          data-testid={`block-${i + 1}`}
          aria-label={`Block ${i + 1}, ${placeWords(b.x, b.z, board.w, board.d)}`}
          aria-disabled={!recall}
          onPointerDown={(e) => {
            // Tap on touch-down: the block answers the instant the finger lands.
            if (e.button !== 0) return;
            e.preventDefault();
            press(i);
          }}
          onClick={(e) => {
            // Keyboard (Enter / Space) arrives as a click with no pointer before it.
            if (e.detail === 0) press(i);
          }}
        />
      ))}
    </div>
  );
}

/** Blocks' play overlay: the bar, the prompt, the blocks' buttons and the meta line. */
export function BlocksHud({ onSettings, hidden = false }: { onSettings: () => void; hidden?: boolean }) {
  const { top, bottom } = useInsetReporter();
  const setActive = useBlocks((s) => s.setActive);
  useEffect(() => setActive(!hidden), [hidden, setActive]);
  useEffect(() => () => setActive(false), [setActive]);
  return (
    <>
      <div className={`echo-layer ${hidden ? 'hud-hidden' : ''}`} inert={hidden}>
        <BlockButtons live={!hidden} />
      </div>
      <header ref={top} className={`hud-top ${hidden ? 'hud-hidden' : ''}`} id="hud-top" inert={hidden}>
        <div className="bar">
          <span className="bar-left">
            <RoomsMark />
            <StagesMark />
          </span>
          <button className="settings-mark scrimmed" data-testid="settings-open" onClick={onSettings}>
            Settings
          </button>
        </div>
        <Prompt />
        <Caller />
      </header>
      <footer ref={bottom} className={`hud-bottom ${hidden ? 'hud-hidden' : ''}`} id="hud-bottom" inert={hidden}>
        <Meta />
      </footer>
    </>
  );
}
