import { useLayoutEffect, useRef } from 'react';
import { NOTE_NAMES, type NoteName } from '../game/notes';
import { stageProgress } from '../game/unlocks';
import { usePalace } from '../store';
import { useView } from '../three/view';
import { positionLabel, pretty } from './format';

function useInsetReporter() {
  const top = useRef<HTMLElement>(null);
  const bottom = useRef<HTMLElement>(null);
  const setInsets = useView((s) => s.setInsets);
  useLayoutEffect(() => {
    const measure = () => {
      const h = window.innerHeight;
      const topRect = top.current?.getBoundingClientRect();
      const bottomRect = bottom.current?.getBoundingClientRect();
      // Soft insets: UI overlays the scene; leave a little margin so the neck
      // is not buried under the pad, but do not letterbox the 3D.
      // Portrait: the headstock sits above the nut, so keep the nut clear of the question.
      const portrait = h > window.innerWidth * 1.05;
      const insetTop = topRect ? topRect.bottom * (portrait ? 0.9 : 0.55) : 0;
      const insetBottom = bottomRect ? Math.max(0, h - bottomRect.top) * 0.7 : 0;
      setInsets(insetTop, insetBottom);
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (top.current) ro.observe(top.current);
    if (bottom.current) ro.observe(bottom.current);
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [setInsets]);
  return { top, bottom };
}

function DrillSwitch() {
  const drill = usePalace((s) => s.drill);
  const setDrill = usePalace((s) => s.setDrill);
  return (
    <div className="modes scrimmed" role="tablist" aria-label="Drill">
      {(
        [
          ['name', 'Name', 'I'],
          ['find', 'Find', 'II'],
        ] as const
      ).map(([kind, label, numeral]) => (
        <button
          key={kind}
          role="tab"
          aria-selected={drill === kind}
          className={drill === kind ? 'active' : ''}
          onClick={() => setDrill(kind)}
          data-testid={`drill-${kind}`}
        >
          <span className="rn" aria-hidden>
            {numeral}
          </span>
          {label}
        </button>
      ))}
    </div>
  );
}

function Prompt() {
  const q = usePalace((s) => s.question);
  const found = usePalace((s) => s.found);
  const feedback = usePalace((s) => s.feedback);
  if (q.kind === 'name') {
    let line = 'Name this note.';
    if (feedback?.kind === 'correct') line = pretty(q.answer);
    if (feedback?.kind === 'miss') line = `It\u2019s ${pretty(q.answer)}`;
    return (
      <div className="prompt scrimmed" aria-live="polite">
        <h1 className={`prompt-title ${feedback?.kind ?? ''}`} data-testid="prompt">
          {line}
        </h1>
        <p className="prompt-sub" data-testid="prompt-where">
          {positionLabel(q.position)}
        </p>
      </div>
    );
  }
  const done = found.length === q.targets.length;
  return (
    <div className="prompt scrimmed" aria-live="polite">
      <h1 className={`prompt-title ${done ? (feedback?.kind ?? '') : ''}`} data-testid="prompt">
        Find every <em>{pretty(q.note)}</em>
      </h1>
      <p className="prompt-sub" data-testid="prompt-where">
        {found.length} of {q.targets.length}
      </p>
    </div>
  );
}

/** One hairline, the room, the run. Skip (Find) and End as plain words. */
function Meta() {
  const deck = usePalace((s) => s.saved.deck);
  const streak = usePalace((s) => s.session.streak);
  const stage = usePalace((s) => s.stage)();
  const finding = usePalace((s) => s.question.kind === 'find');
  const next = usePalace((s) => s.nextQuestion);
  const end = usePalace((s) => s.endSession);
  const prog = stageProgress(stage, deck);
  return (
    <div className="meta scrimmed" data-testid="progress">
      <span className="meta-stage">{stage.title}</span>
      <span className="hairline" aria-hidden>
        <span style={{ width: `${Math.round(prog.toward * 100)}%` }} />
      </span>
      <span className="meta-run" title="Correct in a row">
        <span className="meta-label">Run</span>
        <span className="numeral-run" data-testid="streak">
          {streak}
        </span>
      </span>
      {finding && (
        <button className="meta-action" onClick={next} data-testid="find-skip">
          Skip
        </button>
      )}
      <button className="meta-action" onClick={end} data-testid="session-end">
        End
      </button>
    </div>
  );
}

function NamePad() {
  const q = usePalace((s) => s.question);
  const feedback = usePalace((s) => s.feedback);
  const answer = usePalace((s) => s.answerName);
  if (q.kind !== 'name') return null;
  const stateOf = (n: NoteName) => {
    if (!feedback) return '';
    if (n === q.answer) return feedback.kind === 'correct' ? 'correct' : 'reveal';
    if (feedback.chosen === n) return 'miss';
    return 'dim';
  };
  return (
    <div className="pad" role="group" aria-label="Note names">
      {NOTE_NAMES.map((n) => (
        <button
          key={n}
          className={`note ${n.includes('#') ? 'sharp' : ''} ${stateOf(n)}`}
          data-note={n}
          aria-label={n.includes('#') ? `${n[0]} sharp` : n}
          onClick={() => answer(n)}
        >
          {pretty(n)}
        </button>
      ))}
    </div>
  );
}

/**
 * Play overlay: question at the top, pad and meta at the bottom, no wordmark.
 * `hidden`: kept laid out (so the camera framing doesn't jump between screens)
 * but invisible and inert.
 */
export function Hud({ onSettings, hidden = false }: { onSettings: () => void; hidden?: boolean }) {
  const { top, bottom } = useInsetReporter();
  return (
    <>
      <header ref={top} className={`hud-top ${hidden ? 'hud-hidden' : ''}`} id="hud-top" inert={hidden}>
        <div className="bar">
          <DrillSwitch />
          <button className="settings-mark scrimmed" data-testid="settings-open" onClick={onSettings}>
            Settings
          </button>
        </div>
        <Prompt />
      </header>
      <footer ref={bottom} className={`hud-bottom ${hidden ? 'hud-hidden' : ''}`} id="hud-bottom" inert={hidden}>
        <NamePad />
        <Meta />
      </footer>
    </>
  );
}
