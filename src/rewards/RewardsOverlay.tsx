import { useEffect, useState } from 'react';
import { usePalace } from '../store';
import { SEAL_LIFE, sealNdc, sealRadiusPx } from './placement';
import { type Flourish, type Seal, useRewards } from './store';

/** How long a flourish stays on the room (ms); the fade lives in the CSS. */
export const FLOURISH_MS = 1700;

/**
 * Words over the room: a flourish in a fine hand at each milestone of a run, and the caption
 * beside a freshly pressed wax seal. Both are also read out, once, through a polite live region.
 */
export function RewardsOverlay() {
  const screen = usePalace((s) => s.screen);
  const flourishEvent = useRewards((s) => s.flourish);
  const sealEvent = useRewards((s) => s.seal);
  const [flourish, setFlourish] = useState<Flourish | null>(null);
  const [seal, setSeal] = useState<Seal | null>(null);
  const [said, setSaid] = useState('');
  const live = screen === 'play' || screen === 'session';

  useEffect(() => {
    if (!flourishEvent) return;
    setFlourish(flourishEvent);
    setSaid(`${flourishEvent.word}. ${flourishEvent.streak} in a row.`);
    const id = setTimeout(() => setFlourish((f) => (f?.id === flourishEvent.id ? null : f)), FLOURISH_MS);
    return () => clearTimeout(id);
  }, [flourishEvent]);

  useEffect(() => {
    if (!sealEvent) return;
    setSeal(sealEvent);
    setSaid(`Mastered: ${sealEvent.title}.`);
    const id = setTimeout(() => setSeal((s) => (s?.id === sealEvent.id ? null : s)), SEAL_LIFE * 1000);
    return () => clearTimeout(id);
  }, [sealEvent]);

  return (
    <>
      {live && flourish && (
        <div className="flourish" key={flourish.id} data-testid="flourish" data-tier={flourish.tier} aria-hidden>
          <span className="flourish-word">{flourish.word}</span>
          <span className="flourish-rule" />
          <span className="flourish-run">{flourish.streak} in a row</span>
        </div>
      )}
      {live && seal && <SealCaption key={seal.id} title={seal.title} />}
      <p className="sr-only" aria-live="polite" data-testid="reward-announce">
        {said}
      </p>
    </>
  );
}

/** "Mastered" and the stage's name, set under the wax seal the scene presses at the same place. */
function SealCaption({ title }: { title: string }) {
  const [vw, vh] = [window.innerWidth, window.innerHeight];
  const ndc = sealNdc(vw, vh);
  const left = ((ndc.x + 1) / 2) * vw;
  const top = ((1 - ndc.y) / 2) * vh + sealRadiusPx(vw, vh) * 1.12;
  return (
    <div className="seal-caption" data-testid="seal-caption" style={{ left, top }} aria-hidden>
      <span className="seal-word">Mastered</span>
      <span className="seal-title">{title}</span>
    </div>
  );
}
