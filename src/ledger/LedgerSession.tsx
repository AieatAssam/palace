import { useMemo } from 'react';
import { usePalace } from '../store';
import { SheetLayer } from '../ui/SheetLayer';
import { ledgerPage } from '../ui/ledgerPage';
import { ledgerProgress } from './logic';
import { useLedger } from './store';

/** End of a sitting in Ledger: the longest number keyed back (or the questions answered right), and the stage against its bar. */
export function LedgerSession() {
  const sitting = useLedger((s) => s.sitting);
  const record = useLedger((s) => s.record);
  const stage = useLedger((s) => s.stage)();
  const again = useLedger((s) => s.again);
  const leave = usePalace((s) => s.leave);
  const prog = ledgerProgress(stage, record);

  const today = useMemo(() => new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }), []);
  const span = stage.kind === 'span';
  const rows: [string, string][] = span
    ? [
        ['Clean numbers', `${sitting.clean} of ${sitting.lines}`],
        ['Best on this stage', String(prog.have)],
        ['Mistakes', String(sitting.slips)],
      ]
    : [
        ['Right', `${sitting.right} of ${sitting.asked}`],
        ['Learned so far', `${prog.have} of ${prog.need}`],
        ['New this time', String(Math.max(0, prog.have - sitting.knownBefore))],
      ];
  const figure = span ? (sitting.longest ? String(sitting.longest) : '–') : String(sitting.right);
  const caption = span
    ? sitting.longest
      ? sitting.newBest
        ? 'Longest number recalled, a new best'
        : 'Longest number recalled, in digits'
      : 'No number recalled in full yet'
    : `Right answers out of ${sitting.asked}`;
  const roomLabel = sitting.mastered ? 'Mastered' : prog.mastered ? 'Stage · mastered' : 'Stage';
  const toward = Math.round(prog.toward * 100) / 100;

  const geom = useMemo(
    () => ledgerPage({ key: 'ledger-session', room: 'Ledger', today, figure, caption, rows, stageLabel: roomLabel, stageName: stage.title, mastered: prog.mastered, toward }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [today, figure, caption, roomLabel, stage.title, toward, prog.mastered, JSON.stringify(rows)],
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
        {figure}. {caption}.
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
        {roomLabel}: {stage.title}
      </p>
    </SheetLayer>
  );
}
