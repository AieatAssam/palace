import { type ReactNode, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { sheetDom, sheetUi } from '../three/view';
import { type SheetGeom, useSheet } from './sheet';

export interface SheetControl {
  /** Matches a rect in the geometry. */
  id: string;
  testId: string;
  /** What assistive tech reads; the drawn label is in 3D. */
  label: string;
  onActivate(): void;
  /** Radio semantics for a choice, grouped by `group`. */
  checked?: boolean;
  group?: string;
  groupLabel?: string;
  autoFocus?: boolean;
}

/**
 * The accessible twin of a desk sheet. The sheet is drawn in the scene; this is a dialog
 * with the same words as hidden text and real, focusable buttons that the scene keeps
 * positioned over their 3D labels. It covers the screen so a tap beside the sheet is a tap
 * on the dialog, never on the neck underneath.
 */
export function SheetLayer({
  geom,
  controls,
  testId,
  label,
  onEscape,
  onBackdrop,
  children,
}: {
  geom: SheetGeom;
  controls: SheetControl[];
  testId: string;
  label: string;
  onEscape?: () => void;
  onBackdrop?: () => void;
  /** Hidden text, in reading order. */
  children: ReactNode;
}) {
  const show = useSheet((s) => s.show);
  const root = useRef<HTMLElement>(null);
  const signature = JSON.stringify(geom);
  // The scene redraws only when the sheet's drawing changes.
  const stable = useMemo(() => JSON.parse(signature) as SheetGeom, [signature]);
  useEffect(() => show(stable), [show, stable]);
  useEffect(
    () => () => {
      show(null);
      sheetUi.press = sheetUi.focus = sheetUi.hover = null;
    },
    [show],
  );

  // Put focus on the sheet and give it back to whatever had it. The opener is read while
  // rendering, before the page behind goes inert, and refocused once it is live again.
  const [opener] = useState(() => document.activeElement as HTMLElement | null);
  useLayoutEffect(() => {
    root.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus({ preventScroll: true });
    return () => {
      requestAnimationFrame(() => {
        if (opener?.isConnected) opener.focus({ preventScroll: true });
      });
    };
  }, [opener]);

  useEffect(() => {
    if (!onEscape) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onEscape();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onEscape]);

  const button = (c: SheetControl) => (
    <button
      key={c.id}
      ref={(el) => {
        if (el) sheetDom.set(c.id, el);
        else sheetDom.delete(c.id);
      }}
      className="sheet-control"
      role={c.checked === undefined ? undefined : 'radio'}
      aria-checked={c.checked}
      data-testid={c.testId}
      data-autofocus={c.autoFocus ? '' : undefined}
      onPointerDown={() => (sheetUi.press = c.id)}
      onPointerUp={() => sheetUi.press === c.id && (sheetUi.press = null)}
      onPointerCancel={() => (sheetUi.press = null)}
      onPointerEnter={(e) => e.pointerType === 'mouse' && (sheetUi.hover = c.id)}
      onPointerLeave={() => {
        if (sheetUi.hover === c.id) sheetUi.hover = null;
        if (sheetUi.press === c.id) sheetUi.press = null;
      }}
      onKeyDown={(e) => (e.key === ' ' || e.key === 'Enter') && (sheetUi.press = c.id)}
      onKeyUp={() => sheetUi.press === c.id && (sheetUi.press = null)}
      onFocus={(e) => e.currentTarget.matches(':focus-visible') && (sheetUi.focus = c.id)}
      onBlur={() => {
        if (sheetUi.focus === c.id) sheetUi.focus = null;
        if (sheetUi.press === c.id) sheetUi.press = null;
      }}
      onClick={(e) => {
        e.stopPropagation();
        c.onActivate();
      }}
    >
      {c.label}
    </button>
  );

  // Consecutive controls of one group share a radiogroup.
  const out: ReactNode[] = [];
  for (let i = 0; i < controls.length; ) {
    const c = controls[i]!;
    if (!c.group) {
      out.push(button(c));
      i++;
      continue;
    }
    const run = controls.filter((o, j) => j >= i && o.group === c.group);
    out.push(
      <div key={`g-${c.group}`} role="radiogroup" aria-label={c.groupLabel ?? c.group} style={{ display: 'contents' }}>
        {run.map(button)}
      </div>,
    );
    i += run.length;
  }

  return (
    <section
      ref={root}
      className="sheet-layer"
      role="dialog"
      aria-modal="true"
      aria-label={label}
      data-testid={testId}
      onClick={onBackdrop}
    >
      <div className="sheet-text">{children}</div>
      {out}
    </section>
  );
}
