# Palace · Fretboard

A quiet, premium memory palace. This repository holds the **Day 1–3 prototype gate** from
[`CONCEPT.md`](./CONCEPT.md): the Fretboard room alone, two drills on a PBR guitar neck,
spaced repetition underneath. If naming notes on this neck isn't satisfying, nothing
else gets built.

## What's here

- **Fretboard room**, standard tuning E A D G B E.
  - **Name it** — a position glows; pick its name from 12 note buttons (sharps).
  - **Find all** — tap every unlocked position of a given note on the neck.
- **Unlock path** (`src/game/unlocks.ts`, data-driven): low E & A frets 0–5 → add D & G →
  all six strings → frets 0–7 → 0–9 → 0–12. A stage opens once every position in the
  current region has been seen and its mean mastery clears the bar.
- **Spaced repetition** (`src/game/srs.ts`): SM-2 variant with in-session learning steps
  (20 s, 2 min, 10 min) before day-scale intervals. Fast correct answers grow intervals
  more than slow ones; misses reset hard. Each position (Name-it) and each note (Find-all)
  is its own card. Progress lives in `localStorage` (`palace.fretboard.v1`).
- **3D neck** (react-three-fiber): procedural rosewood board (canvas-generated albedo,
  roughness and normal maps), mother-of-pearl inlays at 3/5/7/9/12 (iridescent, with a
  procedural shell pattern, set into the board), brass frets, a bone nut,
  wound strings with a normal-mapped winding, and a headstock where each string runs straight
  back to its own inline tuner post. Locked strings and frets are dimmed and desaturated in
  the shader (no overlay). On phones strings render thicker than true gauge. The lighting
  is drei `Environment` lightformers plus a soft contact shadow. Post-processing is
  bloom and vignette, plus depth of field on desktop only.
- **Feedback**: on a correct answer the string vibrates (vertex shader, from the fretted
  point to the bridge), shimmers, and plays a Karplus–Strong pluck at the right pitch
  (`src/audio/karplus.ts`). A miss gets a soft clay-coloured pulse, a muted string and a
  dry wood knock. There's no red and no screen shake.
- **Phone portrait** (nut at top, neck filling the frame) and **desktop landscape**.
  The camera frames the unlocked region inside the space the HUD leaves free. Edge
  strings get wider tap zones, and Find-all forgives near-misses toward a target on the
  adjacent string.
- **Left-handed** toggle mirrors the neck. Onboarding is three short, skippable cards.
- **Performance**: DPR is clamped (1.75 on touch devices), there are no shadow maps, and
  drei's `PerformanceMonitor` steps down post-processing and DPR when frames drop.
- **Lite render path** (`src/three/quality.ts`): DPR 1, no post-processing, standard
  instead of physical materials, smaller procedural textures and environment map. It is
  used automatically under automation (`navigator.webdriver`) or with `?lite`. Add
  `?quality=full` to force the full path (for example, for screenshots).

## Scripts

| Script              | What it does                                          |
| ------------------- | ----------------------------------------------------- |
| `npm run dev`       | Vite dev server                                       |
| `npm run typecheck` | `tsc --noEmit`                                        |
| `npm run lint`      | ESLint (flat config)                                  |
| `npm test`          | Vitest unit tests (SRS, unlocks, notes, audio, layout) |
| `npm run build`     | Type-check + production build to `dist/` (base `./`)  |
| `npm run e2e`       | Playwright smoke tests (desktop 960×600, phone 412×915) |

### End-to-end tests

Playwright builds the app and serves it with `vite preview`. In CI it uses the bundled
Chromium (`npx playwright install chromium`). Locally you can point it at a system Chrome
instead:

```sh
CHROME_PATH=/usr/bin/google-chrome npm run e2e
```

Headless WebGL runs on SwiftShader (CPU). The full render path manages only ~2 fps there,
which starved the page and made CI time out. Under automation the app therefore uses its
lite path, and CI runs one worker. The suite takes about a minute, including the build.

### Test hooks

`window.__palace` exposes read-only hooks for e2e tests and devtools: `state()` (`{ mode, question }`),
`question()`,
`answer()`, `drill()`, `stage()`, `positions()`, `found()`, `session()`, `leftHanded()`,
`render()`, `project({ string, fret })`, which gives the page coordinates of a
position on the 3D neck, and `highlight()`, which reports the question's highlight as
rendered: the string mesh and fret space it actually sits on, measured on screen.

## Layout

```
src/
  game/        pure logic: notes, srs, unlocks, drills, storage (+ tests)
  audio/       Karplus–Strong synth (pure, tested) + Web Audio engine
  three/       neck layout maths, procedural textures, Fretboard, Scene
  ui/          HUD, settings, onboarding
  store.ts     Zustand game store
  testHooks.ts window.__palace
e2e/           Playwright smoke tests
```

## Deploy

`.github/workflows/deploy.yml` builds on every push to `main` and publishes `dist/` with
`actions/deploy-pages`. Enable **Settings → Pages → Source: GitHub Actions** once.
`.github/workflows/ci.yml` runs typecheck, lint, unit tests, build and e2e on pushes and PRs.
