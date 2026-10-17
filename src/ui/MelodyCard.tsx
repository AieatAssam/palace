import type { MelodyQuestion } from '../game/drills';
import type { MelodyNote } from '../game/melodies';
import { letterOf } from '../game/melodies';
import { missTitle } from '../game/span';
import { type MelodyRun, melodyNotesInPlay, usePalace } from '../store';
import { pretty, spokenNote } from './format';

/** Staff geometry (SVG units): five lines `GAP` apart, the bottom line (E4 written) at y = BOTTOM. */
const GAP = 8;
const BOTTOM = 52;
const CLEF_W = 34;
const STEP_W = 30;
const LETTER_STEP: Record<string, number> = { C: 0, D: 1, E: 2, F: 3, G: 4, A: 5, B: 6 };

/** Diatonic step of a written pitch (C0 = 0). Guitar is written an octave above the sound. */
function writtenStep(midi: number): number {
  const written = midi + 12;
  const octave = Math.floor(written / 12) - 1;
  return LETTER_STEP[letterOf(written)[0]!]! + 7 * octave;
}

const E4_STEP = 2 + 7 * 4;
/** y of a step on the staff: E4 sits on the bottom line, each step half a gap up. */
const yOf = (step: number) => BOTTOM - ((step - E4_STEP) * GAP) / 2;

/** Which line of the tune the card shows, and where that line starts in the run of notes. */
function lineAt(q: MelodyQuestion, index: number): { line: MelodyNote[]; start: number; number: number } {
  let start = 0;
  for (let i = 0; i < q.lines.length; i++) {
    const line = q.lines[i]!;
    if (index < start + line.length || i === q.lines.length - 1) return { line, start, number: i };
    start += line.length;
  }
  return { line: q.lines[0]!, start: 0, number: 0 };
}

type NoteState = 'played' | 'now' | 'ahead' | 'hidden' | 'sounding';

/** A G clef drawn as one pen stroke round the G line, with a ball at the tail; the 8 below for guitar. */
function Clef() {
  const g = yOf(E4_STEP + 2);
  return (
    <g className="mc-clef" transform={`translate(4 ${g - 30})`}>
      <path d="M13,31 C7,31 7,23 13.5,23 C21,23 22,34.5 13,36.5 C3,38.5 -0.5,26 6,18 C12,10.5 20,5 19.5,-5 C19,-12 13.5,-12 12,-5 C10.5,3 12.5,30 14,44 C15,51.5 8.5,53.5 6.5,48" />
      <circle cx="8.2" cy="47.6" r="2.6" />
      <text x="10" y="62" className="mc-clef-8">
        8
      </text>
    </g>
  );
}

function Staff({ line, start, states }: { line: MelodyNote[]; start: number; states: NoteState[] }) {
  const width = CLEF_W + STEP_W * Math.max(line.length, 4) + 10;
  return (
    <svg className="mc-staff" viewBox={`0 0 ${width} 80`} preserveAspectRatio="xMidYMid meet" aria-hidden>
      {[0, 1, 2, 3, 4].map((i) => (
        <line key={i} x1={0} x2={width} y1={BOTTOM - i * GAP} y2={BOTTOM - i * GAP} className="mc-line" />
      ))}
      <Clef />
      {line.map((n, i) => {
        const state = states[start + i]!;
        if (state === 'hidden') return null;
        const step = writtenStep(n.midi);
        const x = CLEF_W + STEP_W * (i + 0.5);
        const y = yOf(step);
        const hollow = n.beats >= 2;
        const dotted = n.beats === 1.5 || n.beats === 3;
        const up = step < E4_STEP + 4;
        const ledgers: number[] = [];
        for (let s = E4_STEP - 2; s >= step; s -= 2) ledgers.push(yOf(s));
        for (let s = E4_STEP + 10; s <= step; s += 2) ledgers.push(yOf(s));
        const sharp = letterOf(n.midi + 12).length > 1;
        return (
          <g key={i} className={`mc-note ${state}`}>
            {ledgers.map((ly) => (
              <line key={ly} x1={x - 9} x2={x + 9} y1={ly} y2={ly} className="mc-line" />
            ))}
            {sharp && (
              <text x={x - 15} y={y + 4} className="mc-sharp">
                {'♯'}
              </text>
            )}
            <ellipse cx={x} cy={y} rx={5.4} ry={3.9} transform={`rotate(-22 ${x} ${y})`} className={hollow ? 'mc-head hollow' : 'mc-head'} />
            {n.beats < 3 && <line x1={up ? x + 5 : x - 5} x2={up ? x + 5 : x - 5} y1={y} y2={up ? y - 26 : y + 26} className="mc-stem" />}
            {n.beats <= 0.5 && <path d={up ? `M${x + 5},${y - 26} q6,8 5,16` : `M${x - 5},${y + 26} q6,-8 5,-16`} className="mc-flag" />}
            {dotted && <circle cx={x + 9} cy={step % 2 === E4_STEP % 2 ? y - GAP / 2 : y} r={1.5} className="mc-dot" />}
          </g>
        );
      })}
    </svg>
  );
}

function statesOf(q: MelodyQuestion, run: MelodyRun): NoteState[] {
  const hide = q.recall && (run.phase === 'play' || run.phase === 'missed');
  return q.notes.map((_, i) => {
    if (run.sounding === i) return 'sounding';
    if (run.phase === 'preview' || run.phase === 'playback' || run.phase === 'done') return 'ahead';
    // After a from-memory miss, the wanted note shows until the room plays the lines again.
    if (run.phase === 'missed') return i === run.slip?.wanted ? 'now' : i < run.at ? 'played' : 'hidden';
    if (i < run.at) return 'played';
    if (hide) return 'hidden';
    return i === run.at ? 'now' : 'ahead';
  });
}

const lines = (n: number) => `${n} ${n === 1 ? 'line' : 'lines'}`;

/** A from-memory preview: the lines the room plays, which the player then plays back. */
function listenTo(q: MelodyQuestion, run: MelodyRun): string {
  const n = run.span.length;
  if (q.lines.length === 1) return 'Listen, then play it from memory.';
  if (n === 1) return 'Listen to line 1, then play it from memory.';
  return `Listen to lines 1 to ${n}, then play them from memory.`;
}

function caption(q: MelodyQuestion, run: MelodyRun, missed: boolean, clean: boolean | null): string {
  const total = melodyNotesInPlay(q, run).length;
  switch (run.phase) {
    case 'preview':
      return q.recall ? listenTo(q, run) : 'Listen.';
    case 'missed': {
      const wanted = run.slip ? q.notes[run.slip.wanted] : undefined;
      const title = missTitle(run.slip?.outcome ?? 'retry', run.span.length, false, lines);
      return wanted ? `${title} The note was ${pretty(letterOf(wanted.midi))}.` : title;
    }
    case 'playback':
      return 'Played back.';
    case 'done':
      return clean ? 'Clean.' : `${run.misses} slips. It returns sooner.`;
    case 'play':
      if (missed) return 'Not that note. Try again.';
      return `Note ${run.at + 1} of ${total}${q.recall ? ' · from memory' : ''}`;
  }
}

/**
 * The melody card: a slip of music paper laid at the head of the desk. The tune's title in a fine
 * hand, one line of it on a small stave (written an octave up, as guitar music is), and the same
 * line as note names in copperplate. The note wanted next carries a brass rule; notes played fade.
 * A from-memory tune shows only what has been played.
 */
export function MelodyCard() {
  const q = usePalace((s) => s.question);
  const run = usePalace((s) => s.melody);
  const feedback = usePalace((s) => s.feedback);
  if (q.kind !== 'melody') return null;
  const states = statesOf(q, run);
  const focus = run.sounding >= 0 ? run.sounding : run.phase === 'missed' && run.slip ? run.slip.wanted : Math.min(run.at, q.notes.length - 1);
  const { line, start, number } = lineAt(q, focus);
  const missed = (run.phase === 'play' || run.phase === 'missed') && feedback?.kind === 'miss';
  const clean = run.phase === 'done' ? feedback?.kind === 'correct' : null;
  const want = run.phase === 'play' ? q.notes[run.at] : undefined;
  const said = want ? `Next: ${spokenNote(want.midi)}. Note ${run.at + 1} of ${melodyNotesInPlay(q, run).length}.` : caption(q, run, missed, clean);
  return (
    <section className="melody-card" role="group" aria-label={`Melody: ${q.title}`} data-testid="melody-card" data-phase={run.phase}>
      <header className="mc-head-row">
        <span className="mc-title" data-testid="melody-title">
          {q.title}
        </span>
        <span className="mc-source">{q.source}</span>
      </header>
      <Staff line={line} start={start} states={states} />
      <ol className="mc-names" aria-hidden data-testid="melody-names">
        {line.map((n, i) => {
          const state = states[start + i]!;
          return (
            <li key={i} className={`mc-name ${state}`}>
              {state === 'hidden' ? '·' : pretty(letterOf(n.midi))}
            </li>
          );
        })}
      </ol>
      <p className={`mc-caption ${missed ? 'miss' : clean === true ? 'correct' : ''}`} data-testid="melody-caption">
        {caption(q, run, missed, clean)}
        {q.lines.length > 1 && <span className="mc-line-no"> {`· line ${number + 1} of ${q.lines.length}`}</span>}
      </p>
      <p className="sr-only" aria-live="polite" data-testid="melody-said">
        {said}
      </p>
    </section>
  );
}
