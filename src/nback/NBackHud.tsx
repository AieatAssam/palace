import { useEffect } from 'react';
import { ComboMeter } from '../rewards/ComboMeter';
import { useRewards } from '../rewards/store';
import { RoomsMark, StagesMark, useInsetReporter } from '../ui/Hud';
import { type Channel, nbackProgress } from './logic';
import { useNBack } from './store';

const BACK = ['', 'the last turn', 'two turns back', 'three turns back'];

function Prompt() {
  const st = useNBack((s) => s.stage)();
  const phase = useNBack((s) => s.phase);
  const at = useNBack((s) => s.at);
  const total = useNBack((s) => s.run.length);
  const pct = useNBack((s) => s.sitting.score);
  const dual = st.channels.includes('tone');
  let title = dual ? `Same tile or bell, ${BACK[st.n]}?` : `Same tile as ${BACK[st.n]}?`;
  let sub = at < 0 ? 'The first tile turns in a moment' : `Turn ${at + 1} of ${total}`;
  let tone = '';
  if (phase === 'run' && at >= 0 && at < st.n) sub = `Turn ${at + 1} of ${total}, nothing to match yet`;
  if (phase === 'done') {
    title = `${pct} in a hundred.`;
    sub = 'Right calls, of those that counted';
    tone = pct >= st.mastery ? 'correct' : '';
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

/** For a screen reader: the tile turned (by number and place) and, in the dual stage, the bell. */
function Caller() {
  const st = useNBack((s) => s.stage)();
  const at = useNBack((s) => s.at);
  const run = useNBack((s) => s.run);
  const t = at >= 0 ? run[at] : undefined;
  const said = t ? `Tile ${t.place + 1}${st.channels.includes('tone') ? `, bell ${t.tone + 1}` : ''}` : '';
  return (
    <p className="sr-only" aria-live="assertive" data-testid="nback-caller">
      {said}
    </p>
  );
}

const LABEL: Record<Channel, { word: string; key: string; hint: string }> = {
  place: { word: 'Tile', key: 'A', hint: 'Same tile' },
  tone: { word: 'Bell', key: 'L', hint: 'Same bell' },
};

/** The call keys: Tile (A) and, in the dual stage, Bell (L). Each flashes as it is graded. */
function Calls() {
  const st = useNBack((s) => s.stage)();
  const phase = useNBack((s) => s.phase);
  const called = useNBack((s) => s.called);
  const flash = useNBack((s) => s.flash);
  const call = useNBack((s) => s.call);
  return (
    <div className="nback-calls" role="group" aria-label="Call a match">
      {st.channels.map((ch) => {
        const f = flash[ch];
        const cls = f ? (f.kind === 'hit' ? 'correct' : 'miss') : '';
        return (
          <button
            key={`${ch}-${f?.id ?? 0}`}
            className={`note nback-call ${cls} ${called[ch] ? 'called' : ''}`}
            data-testid={`nback-call-${ch}`}
            aria-keyshortcuts={LABEL[ch].key}
            aria-disabled={phase !== 'run'}
            aria-label={`${LABEL[ch].hint}, key ${LABEL[ch].key}`}
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
