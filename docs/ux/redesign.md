# Palace UX redesign — editorial ledger

**Status:** spec for `ux/redesign` (PR #2). Builds on the old-money bench photograph scene.

**Problem:** Play HUD still reads as a generic app chrome over a nice 3D toy — mode tabs, padded key grid, wordmark fighting the question, onboarding as a card. The user called the overall game UX “horrible and AI sloppy.”

**North star:** A Patek Philippe catalogue page / leather-bound ledger. One object, one question, quiet type. Motion is a page turn, not a bounce.

---

## Principles

1. **One focus.** At any moment the eye has one job: read the question, or look at the neck, or pick a note — never all three competing.
2. **Typography does hierarchy.** Serif for titles and the live question only. Grotesque (Inter) for everything else. No pill labels, no tracked-all-caps shouting except tiny meta.
3. **No kit UI.** No glass, gradients, emoji, stock icons, segmented controls, drop-shadow cards, or “Next” stadium buttons.
4. **Scene is the room.** Attract and play share the same 3D desk; screens are ink on air over it, not separate flat routes with cream voids.
5. **Fewer screens, longer breath.** Attract → Enter → short primer (optional after first visit) → Play. Results are a quiet end-of-session sheet, not a confetti modal.

---

## Screen flow

```
[Attract] ──Enter──► [Play: Name]
              │            │
              │            ├── switch Find (text)
              │            ├── pause / Settings (sheet)
              │            └── end session → [Session sheet]
              │
              └── first visit only: [Primer] (3 beats) → Play
```

Unlock / progress lives on the Session sheet and a thin mantel line in Play — not a separate “levels” map in v1.

### 1. Attract (title)

- Full-bleed desk + neck, idle camera, soft string shimmer once every few seconds.
- Centre: **Palace** (serif, large) / one line under: *Fretboard* or *A room for recall.*
- Bottom: single text action **Begin** (or **Continue** if progress exists). No Skip/Next pair.
- Tiny footer: version or “local progress” — optional, one line.

### 2. Primer (first visit only)

- Three full-bleed beats, no dots carousel chrome — page index as `I` `II` `III` in stone.
- Copy short: what you do / how you answer / that progress remembers.
- Advance: tap anywhere or **Continue**. **Skip primer** as plain text.
- HUD chrome hidden; scene visible and dimmed ~20%.

### 3. Play

- Scene full viewport. UI is overlay ink.
- **Top:** question only (serif). Where-line in stone grotesque under it. No wordmark during a trial (wordmark returns on Attract / Session).
- **Mode:** small text `Name` / `Find` top-left or under question — underline active. Not a control that looks like iOS.
- **Settings:** hairline mark top-right (two rules), not a sliders glyph cluster if we can avoid it — or the word *Settings*.
- **Answer pad:** piano rhythm (naturals tall/cream, accidentals short/rosewood). No container panel. Anchored bottom with generous side margin.
- **Meta:** one hairline + stage title + streak numeral. Find-all: “n of m” in the where-line; Skip as text on the meta row.
- Correct/miss: colour the question line and the chosen key; string sheen does the rest. No toast cards mid-trial.

### 4. Session sheet (results)

- Soft dim over scene. Centre column like a ledger page:
  - *Today*
  - accuracy, streak, items moved (SRS)
  - **Again** / **Leave** as text pair
- No charts, badges, or trophy art.

### 5. Settings

- Solid plaster sheet (not glass). Sections: Handedness, Sound, Haptics, Reduce motion, Replay primer, Clear progress (quiet danger).
- Close: *Done* text.

---

## Type & colour (align with art palette)

| Role | Spec |
|------|------|
| Display | Cormorant / Instrument Serif — Attract title, Play question, Session heading |
| UI | Inter 400/500 — meta, keys, actions |
| Plaster | `#EDE6D9` |
| Ink | `#1C1916` |
| Stone | `#8A8478` |
| Brass | `#B08D57` hairlines / active underline only |
| Rosewood (keys) | `#3F261C` |

---

## Motion

- 200–280 ms ease-out for fades and sheet enter.
- Attract → Play: camera settles; no whip-pan.
- No spring bounce on keys (scale ≤ 0.98 on press).
- Respect `prefers-reduced-motion`.

---

## Out of scope for this PR

- Palace hub / other rooms
- Mic / Play-it mode
- Accounts, cloud sync
- Path-traced attract stills

## Acceptance

- No cream letterbox; no glass/pills/emoji.
- Attract, primer, play, session sheet, settings each feel intentional in desktop and phone screenshots.
- Tap picking and CI lite path still green.
