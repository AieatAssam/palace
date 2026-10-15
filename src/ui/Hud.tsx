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
      const t = top.current?.getBoundingClientRect();
      const b = bottom.current?.getBoundingClientRect();
      setInsets(t ? t.bottom : 0, b ? Math.max(0, h - b.top) : 0);
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
    <div className="switch" role="tablist" aria-label="Drill">
      {(
        [
          ['name', 'Name it'],
          ['find', 'Find all'],
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
    let line = 'Name the glowing note';
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
        {found.length} of {q.targets.length} found
      </p>
    </div>
  );
}

function Progress() {
  const saved = usePalace((s) => s.saved);
  const session = usePalace((s) => s.session);
  const stage = usePalace((s) => s.stage)();
  const prog = stageProgress(stage, saved.deck);
  return (
    <div className="progress" data-testid="progress">
      <span className="progress-title">{stage.title}</span>
      <span className="hairline" aria-hidden>
        <span style={{ width: `${Math.round(prog.toward * 100)}%` }} />
      </span>
      <span className="streak" title="Correct in a row">
        {session.streak > 0 ? `${session.streak} in a row` : `${session.correct}/${session.answered}`}
      </span>
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

function FindBar() {
  const q = usePalace((s) => s.question);
  const next = usePalace((s) => s.nextQuestion);
  if (q.kind !== 'find') return null;
  return (
    <div className="findbar">
      <span>Tap each place it lives on the neck.</span>
      <button className="ghost" onClick={next}>
        Skip
      </button>
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

export function Hud({ onSettings }: { onSettings: () => void }) {
  const { top, bottom } = useInsetReporter();
  return (
    <>
      <header ref={top} className="hud-top" id="hud-top">
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
      <Notice />
      <footer ref={bottom} className="hud-bottom" id="hud-bottom">
        <NamePad />
        <FindBar />
        <Progress />
      </footer>
    </>
  );
}
