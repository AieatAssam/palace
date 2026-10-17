# Copy pass

Every user-facing string was read against the stop-slop rules (`docs/ux/stop-slop/`, MIT, hardikpandya/stop-slop@8da1f03): no filler, no passive voice, no adverbs, no em-dash, no hand-holding. Strings not listed were already terse and stay as they were (Begin, Continue on the title, Settings, Done, Keep, Today, Again, Leave, Run, Skip and End in play, the note names, position labels, session row labels).

| Where | Before | After | Why |
|---|---|---|---|
| Primer I title | A light rests on the neck. | A brass light marks a place. | Names the object and the action. |
| Primer I body | Each question is one place on the fretboard, marked in brass. Name the note it sounds. | Name its note. | Title already said brass; cut the restatement. |
| Primer II title | Answer on the keys, or the neck. | Name it, or find it. | Matches the two drills' names. |
| Primer II body | In Name, choose from the twelve keys. In Find, touch every place a note lives. | Name: pick one of twelve keys. Find: touch every place the note lives. | Shorter, parallel. |
| Primer III title | The room remembers. | Slow answers come back. | Inanimate subject doing a human verb; say what happens. |
| Primer III body | Sure answers settle; slow ones return sooner. New strings and frets open as you learn. | Sure answers rest. Slow ones return sooner. Strings and frets open as you advance. | Active, no "as you learn" hand-holding. |
| Primer skip button (drawn, aria) | Skip primer | Skip | Context is the card. |
| Primer next button (drawn, aria) | Continue | Next | One syllable. |
| Title tagline | A room for recall | Learn the neck. | Says what the app does. |
| Title footer | Progress is kept on this device. | Saved on this device. | Passive and wordy. |
| Settings, destructive confirm (drawn, aria) | Clear everything | Clear all | Drops the dramatic intensifier. |
| Play prompt (name drill) | What note is this? | Name this note. | Drops the rhetorical question. |
| Meta description | Palace — learn every note on the guitar fretboard, one quiet room at a time. | Palace. Learn every note on the guitar fretboard. | Em dash and flourish. |

## Stages pass (night/fretboard-depth)

Unlock gating is gone. Every stage is open from the Stages card, so the primer and card copy now say so. Strings not listed were already clean and stay as they were (One string, Two strings, Naturals, Sharps & flats, Low E string, Full neck, Find all, Done, Stages, Mastered, Stage, the cell labels, nowLine, tally, Find its octave, Find both octaves, Name this note, C♯ or D♭, frets 0–4 · drag for more).

| Where | Before | After | Why |
|---|---|---|---|
| Primer II title | Name it, or find it. | Name it, find it, reach its octave. | Adds the Octave drill to the three drills named. |
| Primer II body | Name: pick one of twelve keys. Find: touch every place the note lives. | Name it from twelve keys, find every place it lives, or tap its octave two strings over. | One sentence covers the octave drill; states the rule. |
| Primer III body | Sure answers rest. Slow ones return sooner. Strings and frets open as you advance. | Sure answers rest. Every stage is open on the Stages card; gilt marks the ones you know. | Nothing unlocks now. Says where stages open and what the gilt mark means. |
| Stages row 4 title | Across the neck | Whole neck | Both stages in the row (Octaves, Find all) range over the whole neck; the cells already name them. |

## Hub pass (night/hub-rewards)

Scope: the new hub and rewards strings only (title kicker and line, room pitches and trains, hub and workshop labels, flourish words, the overlay and combo meter). Each string was read against the stop-slop rules, and the two changes below also make the pitches fit their card: one sentence, under 70 characters, and the trains label under 24.

| Where | Before | After | Why |
|---|---|---|---|
| Title line (Attract) | Rooms for recall. | Each room trains a different kind of memory. | A noun fragment that reads as a tagline; the new line says what a room does. |
| Room I trains (catalog) | Facts you recall on sight | Facts on sight | Five words and 25 characters, over the 24-character limit for the trains label. |
| Room IV pitch (catalog) | Meet a bust once. Give its name a minute later. | Meet a bust, then name it a minute later. | Two sentences; one sentence now, and "once" was filler. |
| Room VI pitch (catalog) | Walk a corridor. Say when a place or tone repeats from n steps back. | Walk a corridor and call out each repeat n steps back. | Two sentences, 68 characters; one sentence now, and the repeat is named as the action. |

Reviewed and kept: the title kicker "Six rooms / One open" (short, and "open" matches the catalog's built flag), the other pitches and trains labels, the hub drawn labels (Palace, in the workshop, the mastered count, Answered, Best run, Days, Settings) and the hub record sentence with its `${n} answered` pattern, the dialog label and room aria labels, the workshop kicker, label, Back, aria and hidden text, the flourish words (Bravo, Splendid, Superb, Bravissimo: none carries casino or gamer tone), the overlay captions and live-region lines (in a row, Mastered), the combo meter aria label and value text, and the Rooms button in the HUD.

## Echo pass (night/echo)

Scope: the Echo room's strings only (prompt titles and subs, bell and slip labels, meta labels, the stage card, the session sheet, the stage and room catalog entries, the Attract kicker). Each string was read against the stop-slop rules. The three changes below are the ones that failed; the rest were already terse.

| Where | Before | After | Why |
|---|---|---|---|
| Stage card subtitle (EchoStages, drawn and hidden text) | Watch, listen, ring the line back. | Listen, then ring the line back. | Three-item list; the bells are heard, not watched. Two items, and the second clause matches the prompt "Ring it back." |
| Room II pitch (catalog) | Brass bells ring a line; ring it back. | Hear a line of brass bells, then ring it back. | Semicolon-joined pair that repeats the prompt verb; "Hear ... then" matches the Faces pitch form. Still one sentence, 46 characters. |
| Session figure when no line was rung (EchoSession) | — (em dash) | – (en dash) | Em dash removed. The en dash is the house glyph for ranges ("frets 0–4"); it stands in for an empty figure. |

Reviewed and kept: the prompt titles (Listen., Ring it back., Ring it back, last first. at 25 characters, Rung true., Not that bell.) and their subs (Line of N, N of N, It ran ...), the bell and slip aria labels, the meta labels (Run, End, Clean lines in a row), the stage card kicker, Stages, nowLine and tally, the session rows and captions (Lines rung, Best on this stage, Slips, Longest line, Longest line, a new best, No line rung back, Mastered, Stage, Stage · mastered), the stage `short` and `note` fields (all `short` values 12 characters or fewer; notes read as plain description), the Echo trains label (Order and sequence, 18 characters), and the Attract kicker "Six rooms / Two open" (matches the open flag, as the hub pass kept it).

## Blocks pass (night/blocks)

Scope: the Blocks room's strings only (the catalog pitch, stage titles, short labels and notes, prompts, caller, block aria labels, meta, the stage card, the session sheet, and the keyboard neck messages). Each string was read against the stop-slop rules and the Echo voice. Three strings changed; the rest were already terse.

| Where | Before | After | Why |
|---|---|---|---|
| Room III pitch (catalog) | Watch blocks light up on the blotter, then tap them back in order. | Watch a line of blocks light on the blotter, then tap it back. | Names the unit the room plays, a line, and matches the Echo pitch form. "In order" is carried by "back" and the stage names. |
| Stage note, long lines (logic) | Nine blocks, from five | Lines start at five | "From five" was unclear; the note now says what the stage changes. |
| Stage note, moving board (logic) | Nine blocks, laid out afresh | Nine blocks, a new layout | "Afresh" is an adverb. |

Final strings, for review:

- Pitch: Watch a line of blocks light on the blotter, then tap it back.
- Trains: Where things were (17 characters, under the 24-character label limit).
- Stage notes (each under 28 characters): Tap them back in order, Lines start at five, Nine blocks, back to front, A fuller board, A crowded board, Nine blocks, a new layout, Twelve blocks, back to front.
- Stage shorts (each under 18 characters): Nine blocks, Long lines, Last first, Twelve blocks, Sixteen blocks, Moving board, Moving, last first.
- Prompts: Watch. / Line of N / Tap them back. / Tap them back, last first. / Every one. / Not that block. / The green block was next. Kept, as the Echo prompts are.
- Caller and block labels: Block N, Block N, back left (placeWords: back, front, left, right, middle).
- Stages sheet: Watch the line, then tap it back. / Best span N in order, M last first / N of 7 mastered. Kept.
- Session sheet: Clean lines, Best on this stage, Slips, Longest line, Longest line, a new best, No clean line yet. Kept.
- Keyboard neck (NeckKeys): aria-label "Guitar neck. Arrow keys move between strings and frets; Enter picks the place." Live text: That is the lit note. Find its octave. / Found, all N. / Found, n of N. / Not there. / , the lit note / , found. Kept. Every successful pick starts with "Found".

## Faces pass (night/faces)

Scope: the Faces room's strings only (the catalog pitch, stage titles, short labels and notes, prompts, portrait labels, the stage card, the session sheet). Each string was read against the stop-slop rules and the Blocks and Echo voice. Four strings changed. Sitters keep their names and trades; the sitter description (`describe`) reads cleanly and stays as it was.

| Where | Before | After | Why |
|---|---|---|---|
| Ask by name prompt (FacesHud) | Who sat for this? | Name the sitter. | A Wh- question; the imperative matches "Name this note." |
| Ask by trade prompt (FacesHud) | What was their trade? | Name their trade. | Same fix. "Their" is the they/them form for sitters. |
| Ask by face prompt (FacesHud) | Which is NAME? | Find NAME. | A question with the answer in the portraits; the instruction says what to do. |
| Stage note, eight sitters (logic) | A fuller gallery | Eight portraits, eight names | Vague. The new note says what is counted, and matches the four-sitter note. |
| Stage note, trades (logic) | Four sitters, each with a trade | Four sitters, their trades | Shorter, 26 characters, under the 28-character note limit. |
| Room IV pitch (catalog) | Meet sitters in oils, then name them from their portraits. | Meet the sitters in their frames, then name them. | "Their portraits" repeats the sitter. "Each ... its portrait" names the unit. |

Final strings, for review:

- Pitch: Meet the sitters in their frames, then name them. (56 characters)
- Trains: Names to faces (unchanged).
- Stage titles: Four sitters / Eight sitters / Sitters and trades / Sitters, asked later.
- Stage shorts (under 18 characters): Four sitters / Eight sitters / Names and trades / Asked later.
- Stage notes (under 28 characters): Four portraits, four names / Eight portraits, eight names / Four sitters, their trades / Six sitters, then a pause.
- Prompts: Name the sitter. / Name their trade. / Find NAME. (27 characters for the longest sitter name). Kept: Question N of M / Questions in M:SS / The drape stays down. / That was NAME. / This is NAME. / NAME, trade.
- Meet and session buttons: Back / Next sitter / To the questions / Cover the frame / Again / Leave. Kept.
- Stages sheet: Meet the sitters, then name them. Kept.
- Session sheet: Today, Named right, No questions yet, Stage · mastered, Mastered. Kept.
- Portrait buttons: Portrait N: followed by the `describe` sentence (for example, "A woman with pinned-up auburn hair, fair skin, in a plum gown with pearls, on an umber ground."). Kept.
