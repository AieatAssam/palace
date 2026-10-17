import { useEffect } from 'react';
import { ComboMeter } from '../rewards/ComboMeter';
import { useRewards } from '../rewards/store';
import { RoomsMark, StagesMark, useInsetReporter } from '../ui/Hud';
import { DRILL_QUESTIONS, SLIPS_PER_SITTING, SOUND_HINTS, figuresFor, ledgerProgress, pair, pegsFor, wordFor } from './logic';
import { useLedger } from './store';

/** The figures of a drill item as the page shows them: "7", or "07" for a peg. */
function itemFigures(kind: 'sounds' | 'pegs', item: number) {
  return kind === 'sounds' ? String(item) : pair(item);
}

function Prompt() {
  const st = useLedger((s) => s.stage)();
  const phase = useLedger((s) => s.phase);
  const n = useLedger((s) => s.digits.length);
  const done = useLedger((s) => s.done);
  const q = useLedger((s) => s.question);
  const asked = useLedger((s) => s.sitting.asked);
  let title = '';
  let sub = '';
  let tone = '';
  if (st.kind === 'span') {
    if (phase === 'write') {
      title = st.tempo ? 'Watch the figures.' : 'The clerk is writing.';
      sub = `${n} figures`;
    } else if (phase === 'study') {
      title = 'Hold the number.';
      sub = st.glosses ? `${n} figures, pegs pencilled under` : `${n} figures. Press Ready when you have them.`;
    } else if (phase === 'recall') {
      title = 'Key it back.';
      sub = `${done} of ${n}`;
    } else if (phase === 'clean') {
      title = 'Every figure.';
      sub = `${n} figures`;
      tone = 'correct';
    } else if (phase === 'slip') {
      title = 'Not that figure.';
      sub = 'The green figure was next';
      tone = 'miss';
    }
  } else if (q) {
    const kind = st.kind;
    const count = `Question ${Math.min(DRILL_QUESTIONS, asked + (phase === 'ask' ? 1 : 0))} of ${DRILL_QUESTIONS}`;
    const fig = itemFigures(kind, q.item);
    const word = wordFor(st, q.item);
    sub = count;
    if (phase === 'ask') {
      if (q.kind === 'pick') title = kind === 'sounds' ? 'Pick the sound.' : 'Pick the word.';
      else title = kind === 'sounds' ? 'Key the figure.' : 'Key the figures.';
    } else if (phase === 'right') {
      title = kind === 'sounds' ? `${fig} is ${word}.` : `${fig}, ${word}.`;
      tone = 'correct';
    } else if (phase === 'wrong') {
      title = `${fig} is ${word}.`;
      sub = kind === 'sounds' ? SOUND_HINTS[q.item]! : `${word}: ${figuresFor(st, q.item).join(' then ')}`;
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
    </div>
  );
}

/** For a screen reader: what the page shows, said as it is written. */
function Caller() {
  const st = useLedger((s) => s.stage)();
  const phase = useLedger((s) => s.phase);
  const digits = useLedger((s) => s.digits);
  const written = useLedger((s) => s.written);
  const q = useLedger((s) => s.question);
  let said = '';
  if (st.kind === 'span') {
    if (phase === 'write' && st.tempo && written > 0) said = String(digits[written - 1]);
    else if (phase === 'study') said = `The number: ${digits.join(' ')}.${st.glosses ? ` Pegs: ${pegsFor(digits).join(', ')}.` : ''}`;
  } else if (q && phase === 'ask') {
    said = q.kind === 'pick' ? `Figures ${itemFigures(st.kind as 'sounds' | 'pegs', q.item).split('').join(' ')}` : `${st.kind === 'sounds' ? 'Sound' : 'Word'}: ${wordFor(st, q.item)}`;
  }
  return (
    <p className="sr-only" aria-live="assertive" data-testid="ledger-caller">
      {said}
    </p>
  );
}

const KEYS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 0];

/** Brass-rimmed ivory keys, as on a counting-house adding machine; the number keys work too. */
function Keypad() {
  const st = useLedger((s) => s.stage)();
  const phase = useLedger((s) => s.phase);
  const q = useLedger((s) => s.question);
  const press = useLedger((s) => s.press);
  const ready = useLedger((s) => s.ready);
  if (st.kind !== 'span' && q?.kind !== 'key') return null;
  const open = st.kind === 'span' ? phase === 'recall' : phase === 'ask';
  return (
    <div className="ledger-keys" role="group" aria-label="Figures">
      {st.kind === 'span' && !st.tempo && (
        <button className="note ledger-ready" data-testid="ledger-ready" aria-disabled={phase !== 'study'} aria-keyshortcuts="Enter" onClick={ready}>
          Ready
        </button>
      )}
      {KEYS.map((d) => (
        <button key={d} className="note ledger-key" data-testid={`ledger-key-${d}`} aria-disabled={!open} aria-keyshortcuts={String(d)} onClick={() => press(d)}>
          {d}
        </button>
      ))}
    </div>
  );
}

/** A drill's four choices: the words (or the sounds), on ivory keys. */
function Choices() {
  const st = useLedger((s) => s.stage)();
  const phase = useLedger((s) => s.phase);
  const q = useLedger((s) => s.question);
  const chosen = useLedger((s) => s.chosen);
  const pick = useLedger((s) => s.pick);
  if (st.kind === 'span' || !q || q.kind !== 'pick' || (phase !== 'ask' && phase !== 'right' && phase !== 'wrong')) return null;
  const stateOf = (i: number) => {
    if (phase === 'ask') return '';
    if (q.choices[i] === q.item) return phase === 'right' ? 'correct' : 'reveal';
    if (i === chosen) return 'miss';
    return 'dim';
  };
  return (
    <div className="faces-choices" role="group" aria-label={st.kind === 'sounds' ? 'Sounds' : 'Words'}>
      {q.choices.map((c, i) => (
        <button key={`${c}-${i}`} className={`note face-choice ${stateOf(i)}`} data-testid={`ledger-choice-${i + 1}`} aria-keyshortcuts={String(i + 1)} onClick={() => pick(i)}>
          {wordFor(st, c)}
        </button>
      ))}
    </div>
  );
}

/** Number keys key figures (or pick a choice, 1 to 4); Enter is Ready. */
function useKeys(live: boolean) {
  useEffect(() => {
    if (!live) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.altKey || e.ctrlKey || e.metaKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      const s = useLedger.getState();
      if (e.key === 'Enter' && s.phase === 'study') {
        e.preventDefault();
        s.ready();
        return;
      }
      const d = /^(?:Digit|Numpad)([0-9])$/.exec(e.code)?.[1] ?? (/^[0-9]$/.test(e.key) ? e.key : null);
      if (d === null) return;
      e.preventDefault();
      if (s.question?.kind === 'pick' && s.stage().kind !== 'span') s.pick(Number(d) - 1);
      else s.press(Number(d));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [live]);
}

function Meta() {
  const st = useLedger((s) => s.stage)();
  const record = useLedger((s) => s.record);
  const slips = useLedger((s) => s.sitting.slips);
  const end = useLedger((s) => s.end);
  const prog = ledgerProgress(st, record);
  const span = st.kind === 'span';
  return (
    <div className="meta scrimmed echo-meta" data-testid="progress">
      <span className="meta-stage" data-testid="meta-stage" aria-label={`${st.title}, ${span ? `best ${prog.have} of ${prog.need} figures` : `${prog.have} of ${prog.need} known`}`}>
        {st.title}
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
      {span ? (
        <span className="echo-slips" role="img" aria-label={`${slips} of ${SLIPS_PER_SITTING} slips`} data-testid="ledger-slips">
          {Array.from({ length: SLIPS_PER_SITTING }, (_, i) => (
            <span key={i} className={`echo-slip ${i < slips ? 'spent' : ''}`} />
          ))}
        </span>
      ) : (
        <span />
      )}
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

/** Ledger's play overlay: the bar, the prompt, the keys or the choices, and the meta line. */
export function LedgerHud({ onSettings, hidden = false }: { onSettings: () => void; hidden?: boolean }) {
  const { top, bottom } = useInsetReporter();
  const setActive = useLedger((s) => s.setActive);
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
        <Choices />
        <Keypad />
        <Meta />
      </footer>
    </>
  );
}
