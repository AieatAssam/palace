# Palace UX redesign — editorial ledger

**Status:** spec for `ux/redesign` (PR #2). Builds on the old-money bench photograph scene.

**Problem:** Play HUD still reads as a generic app chrome over a nice 3D toy — mode tabs, padded key grid, wordmark fighting the question, onboarding as a card. The user called the overall game UX “horrible and AI sloppy.”

**North star:** A Patek Philippe catalogue page / leather-bound ledger. One object, one question, quiet type. Motion is a page turn, not a bounce.

---

## Principles

1. **One focus.** At any moment the eye has one job: read the question, or look at the neck, or pick a note — never all three competing.
2. **Typography does hierarchy.** One family (EB Garamond); size, italic and true small caps do the work. No pill labels, no tracked-all-caps shouting. See the type spec below.
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
- **Mode:** engraved words `I Name` / `II Find` top-left, the chosen one lit with a brass lozenge. No underline tabs.
- **Settings:** the word *Settings* in small caps, top-right.
- **Answer pad:** piano rhythm (naturals tall/cream, accidentals short/rosewood). No container panel. Anchored bottom with generous side margin.
- **Meta:** one hairline + stage title + streak numeral. Find-all: “n of m” in the where-line; Skip as text on the meta row.
- Correct/miss: colour the question line and the chosen key; string sheen does the rest. No toast cards mid-trial.

### 4. Session sheet (results)

- A ledger card slides onto the desk in 3D while the camera eases over to it (no DOM modal, no dim). Content like a ledger page:
  - *Today*
  - accuracy, streak, items moved (SRS)
  - **Again** / **Leave** as text pair
- No charts, badges, or trophy art.

### 5. Settings

- A card on the desk like the session sheet (not glass, not DOM). Sections: Handedness, Sound, Haptics, Reduce motion, Replay primer, Clear progress (quiet danger).
- Close: *Done* text.

---

## Type spec

**One family: EB Garamond.** Self-hosted (`src/assets/fonts`, built by `scripts/build-fonts.py`,
checked by `scripts/verify-fonts.py`). No CDN, no system fallback, no companion sans.

| Face | File | Use |
|------|------|-----|
| Roman 500 | `garamond-500.woff2` | The question, wordmark, primer title, note keys |
| Roman 400 | `garamond-400.woff2` | Body, sub-lines, everything not named elsewhere |
| Italic 400 | `garamond-400-italic.woff2` | Attract line, captions, hints, colophon, session title |
| Sharp ♯ | `sharp.woff2` | U+266D–266F only, from Gentium Book Plus (OFL). EB Garamond has no ♯. Declared as a second `@font-face` of the *same* family with `unicode-range`, scaled 92 %, so the fallback is explicit and self-hosted |
| 3D text | `ledger-{roman,smcp,italic,figures}.ttf` | The desk sheets (troika reads TTF, not WOFF2, and has no feature switches, so old-style figures / small caps / tabular figures are baked into each file's cmap) |

Shipped subsets keep `smcp c2sc onum lnum tnum pnum liga kern case`; verified with fonttools.

**Scale** (`--fs-*`): label 16 · body 18 · action 21 · key 24 · title 34 · question 32–42 (fluid) · display 72–140 (fluid).
Nothing sets below 16 px; small caps need the size because their glyphs are x-height tall.
On sheets the same ladder is in card units (body ≈ 0.2, labels ≈ 0.18 ≈ 16–20 px on a phone).

**Features**
- Small caps (`font-variant-caps: small-caps`, true `smcp`, tracking `0.05em`): labels, actions (Begin, Again, Leave, Done), drill switch, Settings, meta line, ledger row labels. Never synthesized, never `text-transform: uppercase`.
- Old-style figures (`onum`) everywhere by default: dates, "3 of 12", captions, fret ordinals.
- Lining + tabular (`lnum tnum`) only where figures must align or tick in place: the run counter in the HUD meta line; the ledger's percentage and its right-aligned column.
- Ligatures and kerning on. No letter-spaced caps beyond the small-caps tracking above.

**Colour of type:** ink `#1C1916` / soft `#4A443C` / quiet `#5F594F` on the cream page (all ≥ 5:1); plaster `#EDE6D9` and stone-lit `#B3AB9C` on the dark desk; danger `#8A4527` on paper (5.6:1). Brass is for rules, lozenges and markers, never body text.

**Banned:** a second typeface (any sans, mono or display), tiny tracked grey uppercase labels, underline tabs, icon-only controls (hamburgers, glyph buttons), faux bold/italic/small caps, system font fallback for any glyph, text below 16 px (13 px for the italic colophon excepted: it is decorative).

**Navigation words:** the Name / Find switch is two engraved words led by roman numerals I and II; the chosen one is lit with its numeral in brass and a small brass lozenge set before it. Settings is the word *Settings* in small caps.

### Desk sheets (session, settings, primer)

Overlays are objects on the desk, not DOM cards. A leather card with a ledger page set in, a gilt rule
and a brass rim lies on the walnut beside the leather mat; the camera eases to look down on it
(`three/Sheet.tsx`, `NeckRig` in `three/Scene.tsx`). Words are SDF text. Its accessible twin
(`ui/SheetLayer.tsx`) is a real `role="dialog"` that carries the same words as visually hidden text
and real buttons that the scene keeps projected over their drawn labels (≥ 44 px; focus ring and hover
rule in brass-dark). Test ids are unchanged. Reduce motion: the card simply appears. Lite: standard
materials, no textures.

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
