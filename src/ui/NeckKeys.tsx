import { useEffect, useRef, useState } from 'react';
import { type Position, samePosition } from '../game/notes';
import { inRegion } from '../game/stages';
import { usePalace } from '../store';
import { projectPosition, useNeckCursor } from '../three/view';
import { positionLabel, spokenNote } from './format';
import { step } from './neckStep';

const ARROWS: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Keyboard play for Find-all, octaves and melodies: a focusable stand-in for the neck. The arrow keys
 * move a brass frame over the neck between strings and frets, Enter or Space picks the place,
 * and a screen reader hears each place as the frame reaches it and what the pick found. The
 * keys also work with nothing focused, as long as no button has the focus.
 */
export function NeckKeys({ live }: { live: boolean }) {
  const neck = useRef<HTMLDivElement>(null);
  const [said, setSaid] = useState('');
  const itemId = usePalace((s) => s.question.itemId);

  // A new question: the frame starts on the lit note (octaves) or stays where it was if still in reach.
  useEffect(() => {
    const st = usePalace.getState();
    const cur = useNeckCursor.getState();
    const q = st.question;
    if (q.kind === 'octave') useNeckCursor.setState({ pos: q.position });
    else if (!cur.pos || !inRegion(st.stage(), cur.pos)) useNeckCursor.setState({ pos: { string: Math.min(...st.stage().strings), fret: 0 } });
  }, [itemId]);

  useEffect(() => {
    if (!live) {
      useNeckCursor.getState().hide();
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      const active = document.activeElement;
      // A focused button keeps its own keys.
      if (active && active !== document.body && active !== neck.current) return;
      const st = usePalace.getState();
      const q = st.question;
      if (q.kind === 'name' || st.screen !== 'play' || st.stagesOpen) return;
      const cursor = useNeckCursor.getState();
      const stage = st.stage();
      const ok = (p: Position) => inRegion(stage, p);
      const arrow = ARROWS[e.key];
      if (arrow) {
        e.preventDefault();
        const from = cursor.pos && ok(cursor.pos) ? cursor.pos : q.kind === 'octave' ? q.position : { string: Math.min(...stage.strings), fret: 0 };
        // The first key press shows the frame where it stands; later ones move it.
        const to = cursor.shown ? step(from, arrow[0], arrow[1], ok, projectPosition) : from;
        if (!to) return;
        cursor.move(to);
        const found = st.found.some((f) => samePosition(f, to));
        const lit = q.kind === 'octave' && samePosition(q.position, to);
        setSaid(`${capital(positionLabel(to))}${lit ? ', the lit note' : found ? ', found' : ''}`);
        return;
      }
      if ((e.key === 'Enter' || e.key === ' ') && cursor.shown && cursor.pos) {
        e.preventDefault();
        if (e.repeat) return;
        const p = cursor.pos;
        const before = st.found.length;
        const at = st.melody.at;
        st.tapPosition(p);
        const after = usePalace.getState();
        if (q.kind === 'melody') {
          if (after.melody.at > at) setSaid(after.melody.at === q.notes.length ? `${spokenNote(q.notes[at]!.midi)}. The tune is whole.` : `${spokenNote(q.notes[at]!.midi)}.`);
          else if (after.melody.misses > st.melody.misses) setSaid('Not that note.');
        } else if (q.kind === 'octave' && samePosition(q.position, p)) setSaid('That is the lit note. Find its octave.');
        else if (after.found.length > before) {
          const total = q.targets.length;
          setSaid(after.found.length === total ? `Found, all ${total}.` : `Found, ${after.found.length} of ${total}.`);
        } else if (after.feedback?.kind === 'miss' && after.feedback.position && samePosition(after.feedback.position, p)) setSaid('Not there.');
      }
    };
    // A pointer on the neck puts the frame away.
    const onPointer = () => useNeckCursor.getState().hide();
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onPointer);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onPointer);
    };
  }, [live]);

  return (
    <>
      <div
        ref={neck}
        className="neck-keys"
        tabIndex={live ? 0 : -1}
        role="application"
        aria-roledescription="guitar neck"
        aria-label="Guitar neck. Arrow keys move between strings and frets; Enter picks the place."
        data-testid="neck-keys"
        onFocus={() => {
          const c = useNeckCursor.getState();
          if (c.pos) c.move(c.pos);
        }}
      />
      <p className="sr-only" aria-live="polite" data-testid="neck-said">
        {said}
      </p>
    </>
  );
}
