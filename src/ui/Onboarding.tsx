import { useState } from 'react';

const STEPS = [
  {
    kicker: 'Welcome to',
    title: 'Palace',
    body: 'Train recall. One room at a time. This is the Fretboard room.',
  },
  {
    kicker: 'Name',
    title: 'One fret, framed in brass.',
    body: 'Tap the note it sounds. Quick, sure answers grow strongest.',
  },
  {
    kicker: 'Find',
    title: 'One note, many homes.',
    body: 'Tap every place a note lives on the neck. Mastery opens new strings and frets.',
  },
];

export function Onboarding({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0);
  const s = STEPS[step]!;
  const last = step === STEPS.length - 1;
  return (
    <div className="intro" data-testid="onboarding">
      <div className="intro-body" role="dialog" aria-modal="true" aria-label="Introduction">
        <p className="kicker">{s.kicker}</p>
        <h2 className="display">{s.title}</h2>
        <p className="body">{s.body}</p>
        <div className="dots" aria-hidden>
          {STEPS.map((_, i) => (
            <span key={i} className={i === step ? 'on' : ''} />
          ))}
        </div>
        <div className="panel-actions">
          <button className="ghost" onClick={onDone} data-testid="onboarding-skip">
            Skip
          </button>
          <button className="primary" onClick={() => (last ? onDone() : setStep(step + 1))} data-testid="onboarding-next">
            {last ? 'Begin' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
}
