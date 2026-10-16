import { useMemo, useState } from 'react';
import type { Settings as SettingsShape } from '../game/storage';
import { usePalace } from '../store';
import { SheetLayer, type SheetControl } from './SheetLayer';
import { type SheetItem, type SheetRect, SHEET_WIDTH, measure } from './sheet';

const HEIGHT = 5.7;
const X = 1.2;
const BAND = 0.6;
const TOP_RULE = 1.62;
/** Each choice is two slots on the right of its row. */
const SLOT_W = 0.6;
const SLOTS = [X - SLOT_W * 1.5, X - SLOT_W / 2] as const;

interface Row<T extends string | boolean = string | boolean> {
  id: string;
  label: string;
  hint?: string;
  value: T;
  options: readonly [readonly [T, string], readonly [T, string]];
  onChange(v: T): void;
}

export function Settings({ onClose, onReplayPrimer }: { onClose: () => void; onReplayPrimer: () => void }) {
  const settings = usePalace((s) => s.saved.settings);
  const update = usePalace((s) => s.updateSettings);
  const reset = usePalace((s) => s.resetProgress);
  const [confirming, setConfirming] = useState(false);
  const set =
    <K extends keyof SettingsShape>(k: K) =>
    (v: SettingsShape[K]) =>
      update({ [k]: v });

  const onOff = [
    [true, 'On'],
    [false, 'Off'],
  ] as const;
  const rows: Row[] = [
    {
      id: 'hand',
      label: 'Handedness',
      hint: 'Left mirrors the neck',
      value: settings.leftHanded,
      options: [
        [false, 'Right'],
        [true, 'Left'],
      ],
      onChange: set('leftHanded') as (v: string | boolean) => void,
    },
    { id: 'sound', label: 'Sound', value: settings.sound, options: onOff, onChange: set('sound') as (v: string | boolean) => void },
    { id: 'haptics', label: 'Haptics', value: settings.haptics, options: onOff, onChange: set('haptics') as (v: string | boolean) => void },
    {
      id: 'motion',
      label: 'Reduce motion',
      value: settings.reduceMotion,
      options: onOff,
      onChange: set('reduceMotion') as (v: string | boolean) => void,
    },
  ];

  const linkY = TOP_RULE - BAND * rows.length - 0.42;
  const geom = useMemo(() => {
    const items: SheetItem[] = [
      { kind: 'text', text: 'Settings', x: 0, y: 2.0, size: 0.5, font: 'italic', align: 'center' },
      { kind: 'rule', y: TOP_RULE + 0.22, x0: -X, x1: X, weight: 'double' },
    ];
    const rects: SheetRect[] = [];
    rows.forEach((r, i) => {
      const top = TOP_RULE - BAND * i;
      const base = r.hint ? top - 0.26 : top - 0.37;
      items.push({ kind: 'text', text: r.label, x: -X, y: base, size: 0.2 });
      if (r.hint) items.push({ kind: 'text', text: r.hint, x: -X, y: base - 0.19, size: 0.15, font: 'italic', ink: 'soft' });
      r.options.forEach(([v, text], j) => {
        const cx = SLOTS[j]!;
        const chosen = v === r.value;
        items.push({ kind: 'text', text, x: cx, y: base, size: 0.2, ink: chosen ? 'ink' : 'quiet', align: 'center' });
        if (chosen) items.push({ kind: 'lozenge', x: cx - measure(text, 0.2) / 2 - 0.1, y: base + 0.065 });
        rects.push({ id: `${r.id}-${String(v)}`, x: cx, y: base + 0.06, w: SLOT_W, h: BAND - 0.1 });
      });
      items.push({ kind: 'rule', y: top - BAND, x0: -X, x1: X });
    });
    items.push({ kind: 'rule', y: TOP_RULE, x0: -X, x1: X });
    items.push({ kind: 'text', text: 'Replay primer', x: 0, y: linkY, size: 0.23, font: 'smcp', ink: 'soft', align: 'center' });
    rects.push({ id: 'replay', x: 0, y: linkY + 0.07, w: 1.8, h: 0.5 });
    if (confirming) {
      items.push(
        { kind: 'text', text: 'Keep', x: -0.7, y: linkY - 0.5, size: 0.23, font: 'smcp', ink: 'soft', align: 'center' },
        { kind: 'text', text: 'Clear everything', x: 0.5, y: linkY - 0.5, size: 0.23, font: 'smcp', ink: 'danger', align: 'center' },
      );
      rects.push({ id: 'keep', x: -0.7, y: linkY - 0.43, w: 0.9, h: 0.5 }, { id: 'clear-confirm', x: 0.5, y: linkY - 0.43, w: 1.7, h: 0.5 });
    } else {
      items.push({ kind: 'text', text: 'Clear progress', x: 0, y: linkY - 0.5, size: 0.23, font: 'smcp', ink: 'soft', align: 'center' });
      rects.push({ id: 'clear', x: 0, y: linkY - 0.43, w: 1.8, h: 0.5 });
    }
    items.push({ kind: 'text', text: 'Done', x: 0, y: linkY - 1.15, size: 0.32, font: 'smcp', align: 'center' });
    rects.push({ id: 'done', x: 0, y: linkY - 1.06, w: 1.2, h: 0.56 });
    return { key: 'settings', width: SHEET_WIDTH, height: HEIGHT, items, rects };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.leftHanded, settings.sound, settings.haptics, settings.reduceMotion, confirming, linkY]);

  const controls: SheetControl[] = [
    ...rows.flatMap((r) =>
      r.options.map(([v, text]) => ({
        id: `${r.id}-${String(v)}`,
        testId: `${r.id}-${String(v)}`,
        label: text,
        group: r.id,
        groupLabel: r.label,
        checked: v === r.value,
        onActivate: () => r.onChange(v),
      })),
    ),
    { id: 'replay', testId: 'replay-primer', label: 'Replay primer', onActivate: onReplayPrimer },
    ...(confirming
      ? [
          {
            id: 'clear-confirm',
            testId: 'clear-confirm',
            label: 'Clear everything',
            onActivate: () => {
              reset();
              setConfirming(false);
              onClose();
            },
          },
          { id: 'keep', testId: 'clear-keep', label: 'Keep', onActivate: () => setConfirming(false) },
        ]
      : [{ id: 'clear', testId: 'clear-progress', label: 'Clear progress', onActivate: () => setConfirming(true) }]),
    { id: 'done', testId: 'settings-close', label: 'Done', onActivate: onClose, autoFocus: true },
  ];

  return (
    <SheetLayer geom={geom} controls={controls} testId="settings" label="Settings" onEscape={onClose} onBackdrop={onClose}>
      <h2>Settings</h2>
    </SheetLayer>
  );
}
