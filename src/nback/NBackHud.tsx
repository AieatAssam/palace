import { useEffect } from 'react';
import { ComboMeter } from '../rewards/ComboMeter';
import { useRewards } from '../rewards/store';
import { RoomsMark, StagesMark, useInsetReporter } from '../ui/Hud';
import { type Channel, SQUARE_NAMES, feedbackFor, isWarmup, nbackProgress, promptFor, turnLine, turnsAgo } from './logic';
import { useNBack } from './store';

/**
 * The question and the turn, in plain words: "Remember this one." for the first n turns (nothing
 * can match yet), then what each key is for. Under it, the feedback on the latest call.
 */
function Prompt() {
  const st = useNBack((s) => s.stage)();
  const phase = useNBack((s) => s.phase);
  const at = useNBack((s) => s.at);
  const total = useNBack((s) => s.run.length);
  const sitting = useNBack((s) => s.sitting);
  let lines = st.channels.map((ch) => promptFor(st.n, ch));
  let sub = turnLine(st.n, at, total);
  let tone = '';
  if (phase === 'run' && isWarmup(st.n, at)) lines = ['Remember this one.'];
  if (phase === 'done') {
    const sum = (k: 'hits' | 'misses' | 'false') => st.channels.reduce((n, ch) => n + sitting.tallies[ch][k], 0);
    lines = [`Score: ${sitting.score} out of 100.`];
    sub = `You caught ${sum('hits')} of ${sum('hits') + sum('misses')} matches and pressed ${sum('false')} wrong.`;
    tone = sitting.score >= st.mastery ? 'correct' : '';
  }
  return (
    <div className="prompt scrimmed" aria-live="polite">
      <h1 className={`prompt-title nback-question ${tone}`} data-testid="prompt">
        {lines.map((l, i) => (
          <span key={i} className="nback-line">
            {l}
          </span>
        ))}
      </h1>
      <p className="prompt-sub" data-testid="prompt-where">
        {sub}
      </p>
      {phase === 'run' && <Feedback />}
    </div>
  );
}

/** What the latest call got right or wrong, per channel, naming the square or note. */
function Feedback() {
  const st = useNBack((s) => s.stage)();
  const run = useNBack((s) => s.run);
  const said = useNBack((s) => s.said);
  const told = st.channels.flatMap((ch) => {
    const x = said[ch];
    return x ? [{ ch, kind: x.kind, text: feedbackFor(run, st.n, ch, x) }] : [];
  });
  const tone = told.length === 0 ? '' : told.every((t) => t.kind === 'hit') ? 'correct' : 'miss';
  return (
    <p className={`prompt-sub nback-feedback ${tone}`} data-testid="nback-feedback">
      {told.map((t) => (
        <span key={t.ch} className="nback-line" data-testid={`nback-feedback-${t.ch}`}>
          {t.text}
        </span>
      ))}
    </p>
  );
}

/** For a screen reader: the square that lit up and, in the dual stage, the note (1 lowest, 8 highest). */
function Caller() {
  const st = useNBack((s) => s.stage)();
  const at = useNBack((s) => s.at);
  const run = useNBack((s) => s.run);
  const t = at >= 0 ? run[at] : undefined;
  const said = t ? `Square: ${SQUARE_NAMES[t.place]}${st.channels.includes('tone') ? `, note ${t.tone + 1} of 8` : ''}` : '';
  return (
    <p className="sr-only" aria-live="assertive" data-testid="nback-caller">
      {said}
    </p>
  );
}

const LABEL: Record<Channel, { word: string; key: string; thing: string }> = {
  place: { word: 'Tile', key: 'A', thing: 'square' },
  tone: { word: 'Bell', key: 'L', thing: 'note' },
};

/** The call keys: Tile (A) and, in the dual stage, Bell (L). Each flashes as it is graded; both are off for the first n turns. */
function Calls() {
  const st = useNBack((s) => s.stage)();
  const phase = useNBack((s) => s.phase);
  const at = useNBack((s) => s.at);
  const called = useNBack((s) => s.called);
  const flash = useNBack((s) => s.flash);
  const call = useNBack((s) => s.call);
  const open = phase === 'run' && at >= 0 && !isWarmup(st.n, at);
  return (
    <div className="nback-calls" role="group" aria-label="Press on a match">
      {st.channels.map((ch) => {
        const f = flash[ch];
        const cls = f ? (f.kind === 'hit' ? 'correct' : 'miss') : '';
        return (
          <button
            key={`${ch}-${f?.id ?? 0}`}
            className={`note nback-call ${cls} ${called[ch] ? 'called' : ''}`}
            data-testid={`nback-call-${ch}`}
            aria-keyshortcuts={LABEL[ch].key}
            aria-disabled={!open}
            aria-label={`${LABEL[ch].word}: press if this ${LABEL[ch].thing} matches ${turnsAgo(st.n)}, key ${LABEL[ch].key}`}
            onPointerDown={(e) => {
              if (e.button !== 0) return;
              e.preventDefault();
              call(ch);
            }}
            onClick={(e) => {
              if (e.detail === 0) call(ch);
            }}
          >
            <span className="nback-word">{LABEL[ch].word}</span>
            <span className="nback-key" aria-hidden>
              {LABEL[ch].key}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function useKeys(live: boolean) {
  useEffect(() => {
    if (!live) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.altKey || e.ctrlKey || e.metaKey) return;
      const k = e.key.toLowerCase();
      const ch: Channel | null = k === 'a' || k === 'f' ? 'place' : k === 'l' || k === 'j' ? 'tone' : null;
      if (!ch) return;
      e.preventDefault();
      useNBack.getState().call(ch);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [live]);
}

function Meta() {
  const st = useNBack((s) => s.stage)();
  const record = useNBack((s) => s.record);
  const end = useNBack((s) => s.end);
  const prog = nbackProgress(st, record);
  return (
    <div className="meta scrimmed echo-meta" data-testid="progress">
      <span className="meta-stage" data-testid="meta-stage" aria-label={`${st.title}, best ${prog.best} of ${prog.mastery}`}>
        {st.title}
        {prog.mastered && <span className="gilt-mark" role="img" aria-label="mastered" />}
      </span>
      <span className="hairline" aria-hidden>
        <span style={{ width: `${Math.round(prog.toward * 100)}%` }} />
      </span>
      <span className="meta-run" title="Matches caught in a row">
        <span className="meta-label">Run</span>
        <RunNumeral />
        <ComboMeter />
      </span>
      <span />
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

/** N-Back's play overlay: the bar, the prompt, the call keys and the meta line. */
export function NBackHud({ onSettings, hidden = false }: { onSettings: () => void; hidden?: boolean }) {
  const { top, bottom } = useInsetReporter();
  const setActive = useNBack((s) => s.setActive);
  useEffect(() => setActive(!hidden), [hidden, setActive]);
  useEffect(() => () => setActive(false), [setActive]);
  useKeys(!hidden);
  return (
    <>
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
        <Calls />
        <Meta />
      </footer>
    </>
  );
}
