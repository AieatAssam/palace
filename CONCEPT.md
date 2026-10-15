# Palace — Concept & Design

**Status:** concept only. No code until the Day-3 prototype passes the kill criteria below.

**Working titles:** *Palace* (preferred) · *Atelier* (alt)

**Pitch:** A quiet, premium memory palace you walk through in 3D — each room trains a different kind of recall, and one of them is a guitar fretboard you can actually learn.

---

## 1. Unifying fantasy

CULL died because the core move never felt good and the game had no identity beyond "camera game." Palace starts from the opposite end: one fantasy, one feel, many drills.

You are the caretaker of a memory palace — a sunlit atelier of glass, wood and brushed brass. Each unlocked room is a mode. You enter, practise for a few minutes, leave with a streak of mastery chips on a wall of shelves. The palace is the hub; the rooms are the modes. Progress is shared (one brain, one profile, one daily session). The guitar room is the first and best-furnished room, not a bolted-on lesson app.

This framing does three jobs:
- Gives the product one face in the App Store / GitHub Pages header, not a pile of minigames.
- Lets modes share art direction, audio language and progression without feeling samey.
- Makes "come back tomorrow" mean "walk the corridor again," not "open the drill picker."

---

## 2. Learning science (shared across rooms)

Every mode uses the same mastery engine. Items (a fret position, a face, a n-back level, a digit sequence) are scheduled with an FSRS-style spaced-repetition card: interval, ease, stability. Wrong answers reset hard; correct-but-slow answers bump ease less than correct-and-fast. Active recall is mandatory — you produce the answer, you never just tap "I knew it." Modes interleave: a daily session mixes 60–90 seconds from 2–3 rooms so the brain cannot coast on one pattern. Desirable difficulty is tuned per room (recharge, fog, time pressure) so the right answer is just hard enough. Feedback is under 200 ms: stamp, tone, haptic, then next card. No long interstitial screens between trials.

Mastery chips (bronze / silver / gold / platinum per item cluster) live on the palace shelves. A Daily is a 4-minute guided walk through three rooms. Streaks exist but are quiet — a small brass counter on the hub mantel, never a guilt popup.

---

## 3. Fretboard room (hero mode)

**Tuning:** standard E₂ A₂ D₃ G₃ B₃ E₄. Frets 0–12 at launch; 13–24 unlock after the nut-side half is solid.

**Sub-drills (progressive):**
1. **Name it** — a fret glows; say or tap the note name (A–G ± ♯/♭).
2. **Find all** — "show every F♯" → tap all matching frets within a time window.
3. **Play it** — mic on; sing or pluck the note; pitch detection (YIN / `pitchy`) confirms within ±30 cents.
4. **Octave shapes** — highlight a note; find its octave on two other strings.
5. **Intervals** — "perfect 5th above this" → tap the landing fret.
6. **Chord tones** (stretch) — given a chord symbol, light the chord tones on a region; you tap them in any order.

**Unlock path:** string 6 open → frets 0–5 on low E/A → high strings → frets 5–12 → full 0–12 grid → upper frets. Left-handed flips the neck (nut on the right). Optional sampled nylon/steel guitar via Web Audio; muteable. Phone-first: the neck fills the tall frame vertically (nut at top, or landscape option with nut left/right). Touch targets ≥ 44 px; accidental string taps forgiven within a small radius until gold mastery.

**Why this can be fun (unlike CULL):** every trial is one clear question, one clear answer, one satisfying click. No simultaneous camera-chasing. The 3D neck is the toy — wood grain, inlays catching light, strings that shimmer on a correct pluck. The mic path turns the phone into an instrument, which is a hook Elevate and Lumosity do not have.

---

## 4. Other rooms — shortlist and launch set

Proposed set (six rooms, three at launch):

| Room | Pitch | Core mechanic |
|------|-------|---------------|
| **Fretboard** | Learn every note on a standard guitar | Active recall on a 3D neck + optional mic |
| **Echo** | Simon-style sequences of lit glass orbs | Watch → reproduce; length grows; tempo drifts |
| **Faces** | Meet people once, recall their names later | 3D busts rotate slowly; name under time pressure |
| **Blocks** | Spatial span (Corsi) | Tap blocks in reverse/forward order on a floating grid |
| **Ledger** | Number memory with the Major System | Encode digits → loci in a tiny side-palace → recall |
| **N-Back** | Classic dual n-back, dressed as a corridor walk | Position + tone; n climbs; visual fog as load |

**Launch set (v1): Fretboard + Echo + Faces.**

Why these three:
- **Variety of memory systems** — declarative (notes), sequential (Echo), associative (faces/names). Covers the three things people mean when they say "memory training."
- **Fretboard is the differentiator** and the reason to open the app; Echo is the instant-fun "one more round" loop; Faces is socially sticky and ships with a small baked-in cast so there's no user photo privacy mess at launch.
- **Deferred:** Blocks and Ledger are strong but need more UI chrome; N-Back is polarising and easy to get wrong on mobile. They land in v1.1 once the palace hub and mastery engine are proven.

Kill anything that can't deliver a satisfying 30-second round on a phone held in one hand.

---

## 5. Art direction — "very premium, 3D rendered"

**Material language.** PBR throughout. The palace is pale oak, frosted glass, brushed brass, linen-white plaster. Soft studio key light from a high window, gentle rim, almost no hard shadows. Depth of field on the hub (foreground shelf sharp, corridor soft). No neon, no skeuomorphic paper, no CRT. Think Monument Valley's stillness + Apple Arcade's material honesty + Alto's quiet sky.

**Hero fretboard.** A close, slightly elevated three-quarter view of a real-feeling neck: rosewood or maple board with visible grain (tiling PBR, not a flat photo), mother-of-pearl dot inlays that catch the key light, nickel frets with subtle specular, six strings that displace and ring on a correct answer (simple shader + short Web Audio pluck). Incorrect tap: string mutes with a dry thud, fret glows warm amber then fades. Nut and headstock cropped just into frame so it feels like an instrument on a table, not a diagram.

**Colour palette**

| Role | Hex | Notes |
|------|-----|-------|
| Plaster / bg | `#F4F0E8` | Warm off-white |
| Oak | `#C4A574` | Primary wood |
| Rosewood (board) | `#5C3A2E` | Fretboard body |
| Brass | `#B08D57` | Accents, chips, UI strokes |
| Ink | `#1C1916` | Type, icons |
| Correct | `#2F6F5E` | Deep teal-green |
| Miss | `#A65D3F` | Burnt clay, never alarm-red |
| Fog / secondary | `#8A8478` | Muted stone |
| Glass tint | `#E8EEF2` @ 40% | Frosted panels |

**Type.** One family: a refined grotesque (e.g. *Inter* or *Söhne*-like) for UI; a single display serif (*Fraunces* or *Newsreader*) for room titles only. Two sizes in-session. No all-caps stamps, no comic outlines.

**Motion & juice.** 200–300 ms easing (ease-out-cubic). Correct: soft brass chime + 10 ms haptic + chip spark. Miss: dry wood knock, no screen shake. Hub transitions: camera dollies into the room door (1.2 s), never a hard cut. Daily complete: one held chord from the sampled guitar, shelf chip lights up.

**References — what to borrow**

- **Monument Valley** — stillness, impossible calm, one object per shot.
- **Alto / Alto's Odyssey** — sky, soft lighting, "one more run" without shouting.
- **Townscaper** — tactile materials, joy in looking at the thing itself.
- **Apple Arcade (Sayonara Wild Hearts, Scrappers)** — premium feel at 60 fps on phone; restrained UI chrome.
- **Elevate / Lumosity** — session length, progress clarity; *do not* borrow the candy colours or guilt streaks.
- **Fretello / Yousician** — fretboard pedagogy and unlock order; *do not* borrow the cluttered lesson UI or aggressive upsell cadence.

---

## 6. Tech stack (one recommendation)

**Stack:** Vite + TypeScript + **react-three-fiber** + **drei** + **@react-three/postprocessing** · Zustand for state · Web Audio API + **pitchy** (YIN) for mic mode · **vite-plugin-pwa** for offline · `localStorage` (later `idb-keyval`) for progress.

**Why r3f over raw three.js:** the hub, rooms and fretboard are scene graphs with a lot of UI overlay; React keeps the shell and the 3D tree in one model. drei gives `ContactShadows`, `Environment`, `Html`, `useTexture` for free. Postprocessing (mild bloom, vignette, DoF on hub only) is the "premium" half — keep it off during high-frequency fretboard trials so mobile stays at 60 fps.

**Mobile performance budget:** ≤ 50k triangles on screen in the fretboard room; bake AO; no realtime shadows in drills (contact shadow plane only); cap DPR at 2; suspend postprocessing on low-power mode. Target mid-range Android and recent iPhone Safari.

**Deploy:** static build to GitHub Pages (same path as CULL). PWA installable. No backend at v1 — progress is local; optional export/import JSON later.

**Pitch detection:** `getUserMedia` → AudioWorklet → pitchy. Gracefully degrade: if mic permission denied, hide "Play it" and keep tap drills. Calibrate once with a reference A440 tone option.

---

## 7. UX shell

**Onboarding (< 30 s).** Title → "Enter the palace" → one sentence ("Train recall. One room at a time.") → drop into Fretboard Name-it on frets 0–3 of the low E, three trials, then hub. No account, no survey, no permission prompts until the user opens Play-it.

**Hub.** First-person-ish dollied view of a short corridor with three doorways (launch rooms). Brass plaque under each shows mastery %. Mantel: quiet day-streak and "Today's walk" button.

**Daily session.** 4 minutes. Auto-picks under-rehearsed items from 2–3 rooms via the FSRS scheduler. Ends on a results shelf: items moved, new chips, "Another walk" / "Browse rooms."

**Menus.** Pause is a frosted panel over the scene (not a new route). Settings: left-handed neck, sound, haptics, reduce motion, mic calibrate. No seed codes, no debug chrome in production.

**Streaks.** Brass numeral on the mantel. Miss a day → numeral cools to stone grey, does not reset to zero with a lecture. Recovery is one Daily.

---

## 8. Plan — prototype gate first

### Days 1–3: "Is the fretboard fun?"

Build **only** the Fretboard Name-it + Find-all drills on frets 0–5, two strings, in a bare r3f canvas with the PBR neck, correct/miss juice, and local accuracy tracking. No hub, no other rooms, no mic yet.

**Fun & feel tests (you play on phone + desktop):**
1. After five minutes, do you want another round without being asked?
2. Does a correct answer feel like plucking a real string (sound + shimmer + haptic)?
3. Can a complete beginner name open-string notes after one session and feel progress?
4. Is the neck readable in bright daylight on a phone, portrait?
5. Does any trial feel ambiguous (wrong string forgiven? accidental double-tap)?

**Kill criteria — stop and reshape if any are true:**
- You do not want a second session.
- Accuracy climbs but it feels like a spreadsheet with wood wallpaper.
- Touch targets cause >10% mis-taps on a mid-size phone.
- Frame time drops under 50 fps during a trial on a mid-range Android.

If it passes: keep the neck, open Days 4–10.

### Milestones (post-gate)

| Milestone | Scope | Exit |
|-----------|-------|------|
| **M0** | Days 1–3 prototype | Pass/kill |
| **M1** | Full 0–12 fretboard, all sub-drills except mic; left-handed; PWA shell | Playable on Pages |
| **M2** | Palace hub + Echo + Faces + shared FSRS engine + Daily | Three rooms live |
| **M3** | Mic "Play it" + haptics polish + mastery shelves + onboarding | v1 launch |
| **M4** | Blocks + Ledger; optional N-Back; upper frets 13–24 | v1.1 |

**Explicit non-goals until M3 ships:** accounts, leaderboards, social, paid tiers, lesson marketplace, AI-generated faces.

---

## Honest note from CULL

The last game failed because we polished around a core that was not fun. Palace inverts that: the Day-3 fretboard prototype is the whole bet. If naming notes on a beautiful neck is not inherently satisfying, no amount of palace corridors, streaks or postprocessing will save it. Ship the toy first. Prove the click. Then build the house around it.
