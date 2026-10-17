import { useMemo } from 'react';
import { usePalace } from '../store';
import { SheetLayer } from '../ui/SheetLayer';
import { ledgerPage } from '../ui/ledgerPage';
import { nbackProgress } from './logic';
import { useNBack } from './store';

/** End of a run in N-Back: the score, matches caught, wrong presses, and the stage's best against its bar. */
export function NBackSession() {
  const sitting = useNBack((s) => s.sitting);
  const record = useNBack((s) => s.record);
  const stage = useNBack((s) => s.stage)();
  const again = useNBack((s) => s.again);
  const leave = usePalace((s) => s.leave);
  const prog = nbackProgress(stage, record);

  const today = useMemo(() => new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }), []);
  const sum = (k: 'hits' | 'misses' | 'false') => stage.channels.reduce((n, ch) => n + sitting.tallies[ch][k], 0);
  const rows: [string, string][] = [
    ['Matches caught', `${sum('hits')} of ${sum('hits') + sum('misses')}`],
    ['Wrong presses', String(sum('false'))],
    ['Best on this stage', String(prog.best)],
  ];
  const figure = sitting.finished ? String(sitting.score) : '–';
  const caption = sitting.finished ? (sitting.newBest ? 'Score out of 100, a new best' : 'Score out of 100') : 'Run ended early';
  const roomLabel = sitting.mastered ? 'Mastered' : prog.mastered ? 'Stage · mastered' : 'Stage';
  const toward = Math.round(prog.toward * 100) / 100;

  const geom = useMemo(
    () => ledgerPage({ key: 'nback-session', room: 'N-Back', today, figure, caption, rows, stageLabel: roomLabel, stageName: stage.title, mastered: prog.mastered, toward }),
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
