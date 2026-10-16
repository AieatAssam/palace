import { useEffect, useLayoutEffect, useRef } from 'react';
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
      const insetTop = topRect ? topRect.bottom * 0.55 : 0;
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
    <div className="modes" role="tablist" aria-label="Drill">
      {(
        [
          ['name', 'Name'],
          ['find', 'Find'],
        ] as const
      ).map(([kind, label]) => (
        <button
          key={kind}
          role="tab"
          aria-selected={drill === kind}
          className={drill === kind ? 'active' : ''}
          onClick={() => setDrill(kind)}
          data-testid={`drill-${kind}`}
        >
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
    const where = positionLabel(q.position);
    let line = 'What note is this?';
    if (feedback?.kind === 'correct') line = pretty(q.answer);
    if (feedback?.kind === 'miss') line = `It's ${pretty(q.answer)}`;
    return (
      <div className="prompt" aria-live="polite">
        <h1 className={`prompt-title ${feedback?.kind ?? ''}`} data-testid="prompt">
          {line}
        </h1>
        <p className="prompt-sub" data-testid="prompt-where">
          {where}
        </p>
      </div>
    );
  }
  const done = found.length === q.targets.length;
  return (
    <div className="prompt" aria-live="polite">
      <h1 className={`prompt-title ${done ? feedback?.kind ?? '' : ''}`} data-testid="prompt">
        Find every <em>{pretty(q.note)}</em>
      </h1>
      <p className="prompt-sub">
        Tap each place it lives · {found.length} of {q.targets.length} found
      </p>
    </div>
  );
}

function Progress() {
  const saved = usePalace((s) => s.saved);
  const session = usePalace((s) => s.session);
  const stage = usePalace((s) => s.stage)();
  const finding = usePalace((s) => s.question.kind === 'find');
  const next = usePalace((s) => s.nextQuestion);
  const prog = stageProgress(stage, saved.deck);
  return (
    <div className="progress" data-testid="progress">
      <span className="progress-title">{stage.title}</span>
      <span className="hairline" aria-hidden>
        <span style={{ width: `${Math.round(prog.toward * 100)}%` }} />
      </span>
      {finding ? (
        <button className="skip" onClick={next}>
          Skip
        </button>
      ) : (
        <span className="streak" title="Correct in a row">
          {session.streak > 0 ? `${session.streak} in a row` : `${session.correct}/${session.answered}`}
        </span>
      )}
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

function Notice() {
  const notice = usePalace((s) => s.unlockedNotice);
  const dismiss = usePalace((s) => s.dismissNotice);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(dismiss, 4000);
    return () => clearTimeout(t);
  }, [notice, dismiss]);
  if (!notice) return null;
  return (
    <div className="notice" role="status" onClick={dismiss}>
      <span className="notice-kicker">New room in the neck</span>
      {notice}
    </div>
  );
}

/** `hidden`: kept laid out (so the camera framing doesn't jump) but invisible and inert, e.g. under the intro. */
export function Hud({ onSettings, hidden = false }: { onSettings: () => void; hidden?: boolean }) {
  const { top, bottom } = useInsetReporter();
  return (
    <>
      <header ref={top} className={`hud-top ${hidden ? 'hud-hidden' : ''}`} id="hud-top" inert={hidden}>
        <div className="bar">
          <div className="brand">
            <span className="wordmark">Palace</span>
            <span className="room">Fretboard</span>
          </div>
          <DrillSwitch />
          <button className="icon" aria-label="Settings" data-testid="settings-open" onClick={onSettings}>
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
              <path d="M4 7h10M18 7h2M4 17h4M12 17h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              <circle cx="16" cy="7" r="2" fill="none" stroke="currentColor" strokeWidth="1.5" />
              <circle cx="10" cy="17" r="2" fill="none" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          </button>
        </div>
        <Prompt />
      </header>
      {!hidden && <Notice />}
      <footer ref={bottom} className={`hud-bottom ${hidden ? 'hud-hidden' : ''}`} id="hud-bottom" inert={hidden}>
        <NamePad />
        <Progress />
      </footer>
    </>
  );
}
