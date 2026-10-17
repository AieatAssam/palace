import { useEffect } from 'react';
import { bellScale } from '../audio/bells';
import { ComboMeter } from '../rewards/ComboMeter';
import { useRewards } from '../rewards/store';
import { RoomsMark, StagesMark, useInsetReporter } from '../ui/Hud';
import { bellDom, bellRects } from './fx';
import { SLIPS_PER_SITTING, echoProgress, stepLabel } from './logic';
import { useEcho } from './store';

function Prompt() {
  const phase = useEcho((s) => s.phase);
  const length = useEcho((s) => s.line.length);
  const done = useEcho((s) => s.recall.done);
  const slip = useEcho((s) => s.slip);
  const reverse = useEcho((s) => s.stage().order === 'reverse');
  let title = 'Listen.';
  let sub = `Line of ${length}`;
  let tone = '';
  if (phase === 'repeat') {
    title = reverse ? 'Ring it back, last first.' : 'Ring it back.';
    sub = `${done} of ${length}`;
  } else if (phase === 'clean') {
    title = 'Rung true.';
    sub = `Line of ${length - 1}`;
    tone = 'correct';
  } else if (phase === 'slip' && slip) {
    title = 'Not that bell.';
    sub = `It ran ${slip.expected.map(stepLabel).join(' · ')}`;
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

/** One hairline: the stage, its best line against the mastery bar, the run, the slips, End. */
function Meta() {
  const stage = useEcho((s) => s.stage)();
  const record = useEcho((s) => s.record);
  const slips = useEcho((s) => s.sitting.slips);
  const end = useEcho((s) => s.end);
  const prog = echoProgress(stage, record);
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
      <span className="echo-slips" role="img" aria-label={`${slips} of ${SLIPS_PER_SITTING} slips`} data-testid="echo-slips">
        {Array.from({ length: SLIPS_PER_SITTING }, (_, i) => (
          <span key={i} className={`echo-slip ${i < slips ? 'spent' : ''}`} />
        ))}
      </span>
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

/**
 * The real buttons over the bells. The scene keeps each one over its bell (never under
 * 48 px); keys 1 to n strike the same bells.
 */
function BellButtons({ live }: { live: boolean }) {
  const n = useEcho((s) => s.stage().bells);
  const repeat = useEcho((s) => s.phase === 'repeat');
  const press = useEcho((s) => s.press);
  const scale = bellScale(n);

  useEffect(() => {
    if (!live) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.altKey || e.ctrlKey || e.metaKey) return;
      const d = /^(?:Digit|Numpad)([1-9])$/.exec(e.code)?.[1] ?? (/^[1-9]$/.test(e.key) ? e.key : null);
      if (!d) return;
      const bell = Number(d) - 1;
      if (bell >= n) return;
      e.preventDefault();
      press(bell);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [live, n, press]);

  useEffect(() => {
    for (const i of [...bellDom.keys()]) if (i >= n) bellDom.delete(i);
    for (const i of [...bellRects.keys()]) if (i >= n) bellRects.delete(i);
  }, [n]);

  return (
    <div className="echo-bells" role="group" aria-label="Bells">
      {scale.map((note, i) => (
        <button
          key={`${n}-${i}`}
          ref={(el) => {
            // A re-render hands the same button back: keep its place on screen (as Blocks does).
            // Bells beyond the current count are dropped by the effect above when the count changes.
            if (el) bellDom.set(i, el);
            else if (bellDom.get(i)?.isConnected === false) {
              bellDom.delete(i);
              bellRects.delete(i);
            }
          }}
          className="bell-hit"
          data-testid={`echo-bell-${i + 1}`}
          aria-label={`Bell ${i + 1}, ${note.name.replace(/\d/, '')}`}
          aria-disabled={!repeat}
          onPointerDown={(e) => {
            // Strike on touch-down: a bell sounds the instant the finger lands.
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

/** Echo's play overlay: the bar, the prompt, the bells' buttons and the meta line. */
export function EchoHud({ onSettings, hidden = false }: { onSettings: () => void; hidden?: boolean }) {
  const { top, bottom } = useInsetReporter();
  const setActive = useEcho((s) => s.setActive);
  useEffect(() => setActive(!hidden), [hidden, setActive]);
  useEffect(() => () => setActive(false), [setActive]);
  return (
    <>
      <div className={`echo-layer ${hidden ? 'hud-hidden' : ''}`} inert={hidden}>
        <BellButtons live={!hidden} />
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
      </header>
      <footer ref={bottom} className={`hud-bottom ${hidden ? 'hud-hidden' : ''}`} id="hud-bottom" inert={hidden}>
        <Meta />
      </footer>
    </>
  );
}
