import { useMemo } from 'react';
import { stageLabel, stageProgress } from '../game/stages';
import { usePalace } from '../store';
import { SheetLayer } from './SheetLayer';
import { ledgerPage } from './ledgerPage';

/** End of a sitting: a ledger page laid on the desk, today's figures entered by hand. */
export function SessionSheet() {
  const session = usePalace((s) => s.session);
  const deck = usePalace((s) => s.saved.deck);
  const stage = usePalace((s) => s.stage)();
  const again = usePalace((s) => s.again);
  const leave = usePalace((s) => s.leave);
  const prog = stageProgress(stage, deck);
  const pct = session.answered ? Math.round((session.correct / session.answered) * 100) : 0;

  const today = useMemo(() => new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }), []);
  const rows: [string, string][] = [
    ['Longest run', String(session.best)],
    ['Strengthened', String(session.strengthened.length)],
    ['To revisit', String(session.slipped.length)],
  ];
  const figure = session.answered ? `${pct}%` : '—';
  const verb = stage.drill === 'melody' ? 'played clean' : 'named';
  const caption = session.answered ? `${session.correct} of ${session.answered} ${verb}` : 'Nothing answered';
  // The stage in play; if this sitting carried it over the bar, it says so, with its gilt mark.
  const masteredNow = session.mastered.includes(stage.id);
  const roomLabel = masteredNow ? 'Mastered' : prog.mastered ? 'Stage \u00b7 mastered' : 'Stage';
  const roomName = stageLabel(stage);
  const toward = Math.round(prog.toward * 100) / 100;

  const geom = useMemo(
    () => ledgerPage({ key: 'session', room: 'Fretboard', today, figure, caption, rows, stageLabel: roomLabel, stageName: roomName, mastered: prog.mastered, toward }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [today, figure, caption, roomLabel, roomName, toward, prog.mastered, JSON.stringify(rows)],
  );

  return (
    <SheetLayer
      geom={geom}
      testId="session-sheet"
      label="Today"
      controls={[
        { id: 'again', testId: 'session-again', label: 'Again', onActivate: again, autoFocus: true },
        { id: 'leave', testId: 'session-leave', label: 'Leave', onActivate: leave },
      ]}
    >
      <h2>Today</h2>
      <p>{today}</p>
      <p>
        {figure} {caption}
      </p>
      <dl>
        {rows.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      <p>
        {roomLabel} {roomName}
      </p>
    </SheetLayer>
  );
}
