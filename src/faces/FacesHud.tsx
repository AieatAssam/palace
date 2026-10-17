import { useEffect, useState } from 'react';
import { ComboMeter } from '../rewards/ComboMeter';
import { useRewards } from '../rewards/store';
import { RoomsMark, StagesMark, useInsetReporter } from '../ui/Hud';
import { faceDom } from './fx';
import { answerIndex, castOf, facesProgress } from './logic';
import { describe } from './sitters';
import { useFaces } from './store';

function useCast() {
  const stage = useFaces((s) => s.stage)();
  return castOf(stage);
}

/** Seconds left in the pause, ticking. */
function useCountdown(ends: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!ends) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [ends]);
  return Math.max(0, Math.ceil((ends - now) / 1000));
}

function Prompt() {
  const stage = useFaces((s) => s.stage)();
  const phase = useFaces((s) => s.phase);
  const meeting = useFaces((s) => s.meeting);
  const q = useFaces((s) => s.question);
  const chosen = useFaces((s) => s.chosen);
  const asked = useFaces((s) => s.sitting.asked);
  const pauseEnds = useFaces((s) => s.pauseEnds);
  const left = useCountdown(phase === 'pause' ? pauseEnds : 0);
  const cast = useCast();
  const trades = stage.kinds.includes('trade');
  let title = '';
  let sub = '';
  let tone = '';
  let portrait: string | null = null;
  const count = `Question ${Math.min(stage.questions, asked + (phase === 'ask' ? 1 : 0))} of ${stage.questions}`;
  if (phase === 'meet') {
    const s = cast[meeting]!;
    title = s.name;
    sub = trades ? `${s.trade} · ${meeting + 1} of ${cast.length}` : `${meeting + 1} of ${cast.length}`;
    portrait = describe(s.look);
  } else if (phase === 'pause') {
    title = 'The drape stays down.';
    sub = `Questions in ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
  } else if (q) {
    const s = cast[q.sitter]!;
    if (q.kind !== 'face') portrait = describe(s.look);
    if (phase === 'ask') {
      title = q.kind === 'name' ? 'Who sat for this?' : q.kind === 'trade' ? 'What was their trade?' : `Which is ${s.name}?`;
      sub = count;
    } else if (phase === 'right') {
      title = q.kind === 'trade' ? s.trade : s.name;
      sub = count;
      tone = 'correct';
    } else {
      const picked = cast[q.choices[chosen] ?? q.sitter]!;
      title = q.kind === 'face' ? `That was ${picked.name}.` : q.kind === 'trade' ? `${s.name}, ${s.trade.toLowerCase()}.` : `This is ${s.name}.`;
      sub = q.kind === 'face' ? `${s.name} is lit green` : count;
      tone = 'miss';
    }
  }
  return (
    <div className="prompt scrimmed" aria-live="polite">
      <h1 className={`prompt-title ${tone}`} data-testid="prompt">
        {title}
      </h1>
      <p className="prompt-sub" data-testid="prompt-where">
        {sub}
      </p>
      {portrait && (
        <p className="sr-only" data-testid="faces-portrait">
          Portrait: {portrait}
        </p>
      )}
    </div>
  );
}

/** Names (or trades) to choose from, as ivory keys; 1–4 on the keyboard. */
function Choices() {
  const phase = useFaces((s) => s.phase);
  const q = useFaces((s) => s.question);
  const chosen = useFaces((s) => s.chosen);
  const answer = useFaces((s) => s.answer);
  const cast = useCast();
  if (!q || q.kind === 'face' || phase === 'meet' || phase === 'pause') return null;
  const right = answerIndex(q);
  const stateOf = (i: number) => {
    if (phase === 'ask') return '';
    if (i === right) return phase === 'right' ? 'correct' : 'reveal';
    if (i === chosen) return 'miss';
    return 'dim';
  };
  return (
    <div className="faces-choices" role="group" aria-label={q.kind === 'trade' ? 'Trades' : 'Names'}>
      {q.choices.map((c, i) => {
        const s = cast[c]!;
        const label = q.kind === 'trade' ? s.trade : s.name;
        return (
          <button key={`${c}-${i}`} className={`note face-choice ${stateOf(i)}`} data-testid={`faces-choice-${i + 1}`} aria-keyshortcuts={String(i + 1)} onClick={() => answer(i)}>
            {label}
          </button>
        );
      })}
    </div>
  );
}

/** Meeting the cast: back and on, by button or arrow key. */
function MeetControls() {
  const phase = useFaces((s) => s.phase);
  const meeting = useFaces((s) => s.meeting);
  const stage = useFaces((s) => s.stage)();
  const next = useFaces((s) => s.next);
  const back = useFaces((s) => s.back);
  const cast = useCast();
  if (phase !== 'meet') return null;
  const last = meeting + 1 >= cast.length;
  return (
    <div className="faces-meet" role="group" aria-label="Sitters">
      <button className="meta-action faces-step" data-testid="faces-back" onClick={back} disabled={meeting === 0}>
        Back
      </button>
      <button className="note face-choice faces-next" data-testid="faces-next" onClick={next} autoFocus>
        {last ? (stage.delay ? 'Cover the frame' : 'To the questions') : 'Next sitter'}
      </button>
    </div>
  );
}

/** The real buttons over the four portraits of a "which is…" question. */
function PortraitButtons() {
  const phase = useFaces((s) => s.phase);
  const q = useFaces((s) => s.question);
  const answer = useFaces((s) => s.answer);
  const cast = useCast();
  const live = q?.kind === 'face' && (phase === 'ask' || phase === 'right' || phase === 'wrong');
  useEffect(() => {
    if (!live) for (const el of faceDom.values()) el.classList.remove('placed');
  }, [live]);
  if (!live || !q) return null;
  return (
    <div className="faces-pad" role="group" aria-label="Portraits">
      {q.choices.map((c, i) => (
        <button
          key={i}
          ref={(el) => {
            if (el) faceDom.set(i, el);
            else if (faceDom.get(i)?.isConnected === false) faceDom.delete(i);
          }}
          className="face-hit"
          data-testid={`faces-portrait-${i + 1}`}
          aria-label={`Portrait ${i + 1}: ${describe(cast[c]!.look)}`}
          aria-keyshortcuts={String(i + 1)}
          aria-disabled={phase !== 'ask'}
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            e.preventDefault();
            answer(i);
          }}
          onClick={(e) => {
            if (e.detail === 0) answer(i);
          }}
        />
      ))}
    </div>
  );
}

/** Keys: 1–4 answer; the arrows walk through the cast while meeting it. */
function useKeys(live: boolean) {
  const answer = useFaces((s) => s.answer);
  const next = useFaces((s) => s.next);
  const back = useFaces((s) => s.back);
  useEffect(() => {
    if (!live) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.altKey || e.ctrlKey || e.metaKey) return;
      const phase = useFaces.getState().phase;
      if (phase === 'meet') {
        if (e.key === 'ArrowRight') {
          e.preventDefault();
          next();
        } else if (e.key === 'ArrowLeft') {
          e.preventDefault();
          back();
        }
        return;
      }
      const d = /^(?:Digit|Numpad)([1-4])$/.exec(e.code)?.[1] ?? (/^[1-4]$/.test(e.key) ? e.key : null);
      if (!d || phase !== 'ask') return;
      e.preventDefault();
      answer(Number(d) - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [live, answer, next, back]);
}

/** One hairline: the stage, faces known against the cast, the run, End. */
function Meta() {
  const stage = useFaces((s) => s.stage)();
  const deck = useFaces((s) => s.deck);
  const end = useFaces((s) => s.end);
  const prog = facesProgress(stage, deck);
  return (
    <div className="meta scrimmed echo-meta" data-testid="progress">
      <span className="meta-stage" data-testid="meta-stage" aria-label={`${stage.title}, ${prog.known} of ${prog.total} faces known`}>
        {stage.title}
        {prog.mastered && <span className="gilt-mark" role="img" aria-label="mastered" />}
      </span>
      <span className="hairline" aria-hidden>
        <span style={{ width: `${Math.round(prog.toward * 100)}%` }} />
      </span>
      <span className="meta-run" title="Right in a row">
        <span className="meta-label">Run</span>
        <RunNumeral />
        <ComboMeter />
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

/** Faces' play overlay: the bar, the prompt, the portraits' buttons, the choices and the meta line. */
export function FacesHud({ onSettings, hidden = false }: { onSettings: () => void; hidden?: boolean }) {
  const { top, bottom } = useInsetReporter();
  const setActive = useFaces((s) => s.setActive);
  useEffect(() => setActive(!hidden), [hidden, setActive]);
  useEffect(() => () => setActive(false), [setActive]);
  useKeys(!hidden);
  return (
    <>
      <div className={`echo-layer ${hidden ? 'hud-hidden' : ''}`} inert={hidden}>
        <PortraitButtons />
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
        <Choices />
        <MeetControls />
        <Meta />
      </footer>
    </>
  );
}
