import { useLayoutEffect, useRef } from 'react';
import { NOTE_NAMES, type NoteName } from '../game/notes';
import { stageLabel, stageProgress } from '../game/stages';
import { ComboMeter } from '../rewards/ComboMeter';
import { usePalace } from '../store';
import { useNeckWindow, useView } from '../three/view';
import { flatOf, positionLabel, pretty, spelled } from './format';
import { NeckKeys } from './NeckKeys';

export function useInsetReporter() {
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

/** The stage card's door: the word itself, a brass lozenge before it. */
export function StagesMark() {
  const open = usePalace((s) => s.openStages);
  return (
    <button className="stages-mark scrimmed" onClick={open} data-testid="stages-open" aria-haspopup="dialog">
      Stages
    </button>
  );
}

/** Back to the hub: the word, in small caps. */
export function RoomsMark() {
  const toHub = usePalace((s) => s.toHub);
  return (
    <button className="rooms-mark scrimmed" onClick={toHub} data-testid="hub-open">
      Rooms
    </button>
  );
}

/** A note name in the question: the letter in italic, its accidental upright (the sign has no italic). */
function Note({ name }: { name: string }) {
  return (
    <em className="q-note">
      {name[0]}
      {name.length > 1 && <span className="q-acc">{name.slice(1)}</span>}
    </em>
  );
}

/** Phone, long reach: the frets on screen, and a word that the rest is a drag away. */
function windowNote(from: number, to: number) {
  return `frets ${from}\u2013${to} \u00b7 drag for more`;
}

function Prompt() {
  const q = usePalace((s) => s.question);
  const found = usePalace((s) => s.found);
  const feedback = usePalace((s) => s.feedback);
  const accidentals = usePalace((s) => s.stage().book === 'accidentals');
  const win = useNeckWindow();
  if (q.kind === 'name') {
    let line = 'Name this note.';
    // Sharps and flats: the answer in both spellings.
    const answer = accidentals && q.answer.includes('#') ? `${pretty(q.answer)} or ${flatOf(q.answer)}` : pretty(q.answer);
    if (feedback?.kind === 'correct') line = answer;
    if (feedback?.kind === 'miss') line = `It\u2019s ${answer}`;
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
  const tally = `${found.length} of ${q.targets.length}`;
  const where = q.kind === 'octave' ? `${positionLabel(q.position)} \u00b7 ${tally}` : tally;
  return (
    <div className="prompt scrimmed" aria-live="polite">
      <h1 className={`prompt-title ${done ? (feedback?.kind ?? '') : ''}`} data-testid="prompt">
        {q.kind === 'find' ? (
          <>
            Find every <Note name={spelled(q.note, q.spelling)} />
          </>
        ) : q.targets.length > 1 ? (
          'Find both octaves.'
        ) : (
          'Find its octave.'
        )}
      </h1>
      <p className="prompt-sub" data-testid="prompt-where">
        {where}
      </p>
      {win.windowed && q.kind === 'find' && (
        <p className="prompt-sub prompt-window" data-testid="prompt-window">
          {windowNote(win.from, win.to)}
        </p>
      )}
    </div>
  );
}

/** One hairline, the room, the run. Skip (Find) and End as plain words. */
function Meta() {
  const deck = usePalace((s) => s.saved.deck);
  const streak = usePalace((s) => s.session.streak);
  const stage = usePalace((s) => s.stage)();
  const finding = usePalace((s) => s.question.kind !== 'name');
  const next = usePalace((s) => s.nextQuestion);
  const end = usePalace((s) => s.endSession);
  const prog = stageProgress(stage, deck);
  return (
    <div className="meta scrimmed" data-testid="progress">
      <span className="meta-stage" data-testid="meta-stage" aria-label={stageLabel(stage)}>
        {stage.title}
        <span className="meta-book" aria-hidden>
          {stage.book === 'naturals' ? '\u266e' : '\u266f\u266d'}
        </span>
        {prog.mastered && <span className="gilt-mark" role="img" aria-label="mastered" />}
      </span>
      <span className="hairline" aria-hidden>
        <span style={{ width: `${Math.round(prog.toward * 100)}%` }} />
      </span>
      <span className="meta-run" title="Correct in a row">
        <span className="meta-label">Run</span>
        <span className="numeral-run" data-testid="streak">
          {streak}
        </span>
        <ComboMeter />
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
  // Sharps and flats: the ebony keys carry both names.
  const both = usePalace((s) => s.stage().book === 'accidentals');
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
          aria-label={n.includes('#') ? (both ? `${n[0]} sharp, ${flatOf(n)[0]} flat` : `${n[0]} sharp`) : n}
          onClick={() => answer(n)}
        >
          {both && n.includes('#') ? (
            <span className="note-pair" aria-hidden>
              <span>{pretty(n)}</span>
              <span className="note-flat">{flatOf(n)}</span>
            </span>
          ) : (
            pretty(n)
          )}
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
  const onNeck = usePalace((s) => s.question.kind !== 'name');
  return (
    <>
      {onNeck && <NeckKeys live={!hidden} />}
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
        <NamePad />
        <Meta />
      </footer>
    </>
  );
}
