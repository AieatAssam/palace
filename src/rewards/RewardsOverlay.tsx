import { useCallback, useEffect, useState } from 'react';
import { usePalace } from '../store';
import { CAPTURE } from '../three/quality';
import { SEAL_LIFE, sealNdc, sealRadiusPx, sealSpot } from './placement';
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
    // Like the seal caption, the word's life starts when it is first drawn (FlourishWord), not at the event.
    setFlourish(flourishEvent);
    setSaid(`${flourishEvent.word}. ${flourishEvent.streak} in a row.`);
  }, [flourishEvent]);
  const flourishDone = useCallback((id: number) => setFlourish((f) => (f?.id === id ? null : f)), []);

  useEffect(() => {
    if (!sealEvent) return;
    // The caption's life starts when it is first drawn (see SealCaption), not when the event fires:
    // on a slow device the frame that presses the seal can outlast the whole life.
    setSeal(sealEvent);
    setSaid(`Mastered: ${sealEvent.title}.`);
  }, [sealEvent]);
  const sealDone = useCallback((id: number) => setSeal((s) => (s?.id === id ? null : s)), []);

  return (
    <>
      {live && flourish && <FlourishWord key={flourish.id} flourish={flourish} onDone={flourishDone} />}
      {live && seal && <SealCaption key={seal.id} id={seal.id} title={seal.title} onDone={sealDone} />}
      <p className="sr-only" aria-live="polite" data-testid="reward-announce">
        {said}
      </p>
    </>
  );
}

/** The script word for a run; leaves FLOURISH_MS after it is first drawn. */
function FlourishWord({ flourish, onDone }: { flourish: Flourish; onDone: (id: number) => void }) {
  useEffect(() => {
    const t = setTimeout(() => onDone(flourish.id), FLOURISH_MS);
    return () => clearTimeout(t);
  }, [flourish.id, onDone]);
  return (
    <div className="flourish" data-testid="flourish" data-tier={flourish.tier} aria-hidden>
      <span className="flourish-word">{flourish.word}</span>
      <span className="flourish-rule" />
      <span className="flourish-run">{flourish.streak} in a row</span>
    </div>
  );
}

/** "Mastered" and the stage's name, set under the wax seal where the scene pressed it on the desk. */
function SealCaption({ id, title, onDone }: { id: number; title: string; onDone: (id: number) => void }) {
  useEffect(() => {
    const t = setTimeout(() => onDone(id), SEAL_LIFE * 1000 * (CAPTURE ? 24 : 1));
    return () => clearTimeout(t);
  }, [id, onDone]);
  const [vw, vh] = [window.innerWidth, window.innerHeight];
  const fallback = () => {
    const ndc = sealNdc(vw, vh);
    return { x: ((ndc.x + 1) / 2) * vw, y: ((1 - ndc.y) / 2) * vh, r: sealRadiusPx(vw, vh) };
  };
  const [at, setAt] = useState(fallback);
  useEffect(() => {
    // The stamp finds its patch of desk on its first frame; follow it there.
    let raf = 0;
    let tries = 0;
    const look = () => {
      const s = sealSpot.current;
      if (s && s.id === id) setAt({ x: s.x, y: s.y, r: s.r });
      else if (tries++ < 30) raf = requestAnimationFrame(look);
    };
    raf = requestAnimationFrame(look);
    return () => cancelAnimationFrame(raf);
  }, [id]);
  // Keep the words on screen whatever patch of desk the seal found.
  const left = Math.max(110, Math.min(vw - 110, at.x));
  const top = Math.min(vh - 90, at.y + at.r * 1.12);
  return (
    <div className="seal-caption" data-testid="seal-caption" style={{ left, top }} aria-hidden>
      <span className="seal-word">Mastered</span>
      <span className="seal-title">{title}</span>
    </div>
  );
}
