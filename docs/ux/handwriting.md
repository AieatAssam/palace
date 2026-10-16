# Handwritten accent

A restrained copperplate hand on the 3D cards only. Everything functional (buttons, figures, labels, body) stays EB Garamond.

**Face:** Pinyon Script 1.008, © 2022 The PinyonScript Project Authors (https://github.com/SorkinType/Pinyon), SIL Open Font License 1.1 (https://openfontlicense.org). Obtained from google/fonts `ofl/pinyonscript`.
**File:** `src/assets/fonts/pinyon-script.ttf`, Basic Latin plus ’ – —, subset with `scripts/build-fonts.py` (keeps kern, liga, calt). The licence and copyright strings stay in the font's name table (IDs 0 and 13–14). Loaded by troika, not by CSS.

| Where | What | Ink |
|---|---|---|
| Session card | The date (large, under "Today"); a "Palace" signature at the foot, tilted 3° | iron-gall |
| Primer, last beat | "Take your time." (the one personal line; also in the accessible text) | iron-gall |
| Every primer and session card | "P" cypher in a double gilt ring at the head | gold foil |
| Session card | Oxblood wax seal with a raised lip and uneven rim, "P" pressed in | wax |

**Ink.** Iron-gall blue-black `#121828` (≥ 15:1 before the halo on the page). Each glyph takes one of six nearby tones (troika `colorRanges`, hashed from the text so redraws do not shimmer), at 96 % fill, with a 85 % iron halo (`outlineWidth` 2.5 %, `outlineBlur` 4 %: it thickens the hairlines and softens the edge as ink spreads in the fibres) that bleeds into the paper. SDF glyph size is a power of two (troika's atlas needs it). Script sizes are 0.34 card units.

**Gilt edging.** The page's deckle edge is burnished gold leaf, a hair wider than the paper.

**LITE path.** No per-glyph tones, no halo, 32 px SDF glyphs, a plain standard material for the gilt and wax.

The accessible DOM is the drawn text; the monogram, seal and signature are decoration and have none.
