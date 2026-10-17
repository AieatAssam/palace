import { useMemo } from 'react';
import { usePalace } from '../store';
import { SheetLayer } from '../ui/SheetLayer';
import { ledgerPage } from '../ui/ledgerPage';
import { blocksProgress } from './logic';
import { useBlocks } from './store';

/** End of a sitting in Blocks: the longest line, the lines tapped back, the stage's best against its bar. */
export function BlocksSession() {
  const sitting = useBlocks((s) => s.sitting);
  const record = useBlocks((s) => s.record);
  const stage = useBlocks((s) => s.stage)();
  const again = useBlocks((s) => s.again);
  const leave = usePalace((s) => s.leave);
  const prog = blocksProgress(stage, record);

  const today = useMemo(() => new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }), []);
  const rows: [string, string][] = [
    ['Clean lines', `${sitting.clean} of ${sitting.lines}`],
    ['Best on this stage', String(prog.best)],
    ['Slips', String(sitting.slips)],
  ];
  const figure = sitting.longest ? String(sitting.longest) : '–';
  const caption = sitting.longest ? (sitting.newBest ? 'Longest line, a new best' : 'Longest line') : 'No clean line yet';
  const roomLabel = sitting.mastered ? 'Mastered' : prog.mastered ? 'Stage · mastered' : 'Stage';
  const toward = Math.round(prog.toward * 100) / 100;

  const geom = useMemo(
    () => ledgerPage({ key: 'blocks-session', room: 'Blocks', today, figure, caption, rows, stageLabel: roomLabel, stageName: stage.title, mastered: prog.mastered, toward }),
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
