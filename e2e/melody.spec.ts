import { type Page, type Locator, expect, test } from '@playwright/test';

type Pos = { string: number; fret: number };
type Key = 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown';
type Phase = 'preview' | 'play' | 'missed' | 'playback' | 'done';
type MelodyState = {
  phase: Phase;
  stage: { id: string; title: string; strings: number[]; maxFret: number; recall: boolean };
  tune: { id: string; title: string };
  notes: string[];
  lines: number[];
  at: number;
  misses: number;
  /** Lines in play (from memory, a tune builds up a line at a time) and notes in play. */
  span: number;
  inPlay: number;
  missesInRow: number;
  slip: { outcome: string; wanted: number } | null;
  played: Pos[];
  sounding: number;
  shown: boolean;
};
type Wanted = { note: string; midi: number; places: Pos[] };
type Placed = { pos: Pos; x: number; y: number };

const DIRECTION: Record<Key, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};
const ARROW_KEYS: Key[] = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'];

/** Straight into a melody stage from a fresh load: skips the title, primer, hub and stage card. */
async function enterMelody(page: Page, stageId: string) {
  await page.goto('./');
  await page.waitForFunction(() => !!window.__palace);
  await page.evaluate((id) => window.__palace!.melody.enter(id), stageId);
  await expect.poll(() => page.evaluate(() => window.__palace!.screen()), { timeout: 15_000 }).toBe('play');
  await expect.poll(() => page.evaluate(() => window.__palace!.stage().id), { timeout: 15_000 }).toBe(stageId);
  await expect.poll(() => page.evaluate(() => window.__palace!.melody.state() !== null), { timeout: 15_000 }).toBe(true);
}

async function waitForFrames(page: Page, n = 10) {
  await expect.poll(() => page.evaluate(() => window.__palace!.render().frames), { timeout: 15_000 }).toBeGreaterThan(n);
}

/** Frames are drawn and the camera has finished its dolly, so projections are where they will stay. */
async function waitForSettledCamera(page: Page) {
  await waitForFrames(page);
  await expect.poll(() => page.evaluate(() => window.__palace!.cameraSettled()), { timeout: 20_000 }).toBe(true);
}

/** Settle the camera, focus the neck stand-in, and check the frame is drawn on it. */
async function focusNeck(page: Page) {
  await waitForSettledCamera(page);
  const neck = page.getByTestId('neck-keys');
  await neck.focus();
  await expect(neck).toBeFocused();
  await expect.poll(() => page.evaluate(() => window.__palace!.neckCursor().shown)).toBe(true);
  return neck;
}

async function cursorPos(page: Page): Promise<Pos | null> {
  return page.evaluate(() => {
    const p = window.__palace!.neckCursor().pos;
    return p ? { string: p.string, fret: p.fret } : null;
  });
}

function same(a: Pos | null, b: Pos | null) {
  return !!a && !!b && a.string === b.string && a.fret === b.fret;
}

function key(p: Pos) {
  return `${p.string}:${p.fret}`;
}

/** The note name without its octave, sharps written as '#': "F#4" and "F♯" both give "F#". */
function pitchClass(note: string) {
  return note.replace(/\d+$/, '').replace('♯', '#').replace('♭', 'b');
}

async function melodyState(page: Page): Promise<MelodyState> {
  const s = await page.evaluate(() => window.__palace!.melody.state());
  if (!s) throw new Error('not a melody question');
  return s as MelodyState;
}

async function wanted(page: Page): Promise<Wanted | null> {
  return page.evaluate(() => window.__palace!.melody.wanted()) as Promise<Wanted | null>;
}

/** Walk the cursor to `target` with the arrow keys (see keyboard.spec.ts for the reasoning). */
async function walkTo(page: Page, target: Pos) {
  const valid = new Set((await page.evaluate(() => window.__palace!.positions())).map(key));
  for (let i = 0; i < 40; i++) {
    const cur = await cursorPos(page);
    if (!cur) throw new Error('the neck cursor has no position');
    if (same(cur, target)) return;
    const around = [
      { string: cur.string + 1, fret: cur.fret },
      { string: cur.string - 1, fret: cur.fret },
      { string: cur.string, fret: cur.fret + 1 },
      { string: cur.string, fret: cur.fret - 1 },
    ].filter((p) => valid.has(key(p)));
    const shot = await page.evaluate(
      ({ c, t, ns }) => ({ a: window.__palace!.project(c), b: window.__palace!.project(t), ns: ns.map((n) => window.__palace!.project(n)) }),
      { c: cur, t: target, ns: around },
    );
    const { a, b } = shot;
    if (!a || !b) throw new Error(`neck not projected yet (cursor ${JSON.stringify(cur)}, target ${JSON.stringify(target)})`);
    const dist = (p: { x: number; y: number }) => Math.hypot(p.x - b.x, p.y - b.y);
    const here = dist(a);
    const options = around.map((n, j) => ({ n, p: shot.ns[j] })).filter((o): o is { n: Pos; p: { x: number; y: number } } => !!o.p);
    options.sort((x, y) => dist(x.p) - dist(y.p));
    const lands = (k: Key) => {
      const [dx, dy] = DIRECTION[k];
      let best: { n: Pos; score: number } | null = null;
      for (const o of options) {
        const len = Math.hypot(o.p.x - a.x, o.p.y - a.y);
        if (len < 1e-3) continue;
        const score = ((o.p.x - a.x) * dx + (o.p.y - a.y) * dy) / len;
        if (score > 0.4 && (!best || score > best.score)) best = { n: o.n, score };
      }
      return best?.n ?? null;
    };
    const nearer = options.filter((o) => dist(o.p) < here).map((o) => o.n);
    const ranked = [...nearer, ...options.map((o) => o.n).filter((n) => !nearer.some((m) => same(m, n)))];
    let press: Key | undefined;
    for (const n of ranked) {
      press = ARROW_KEYS.find((k) => same(lands(k), n));
      if (press) break;
    }
    if (!press) {
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      press = Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? 'ArrowRight' : 'ArrowLeft') : dy >= 0 ? 'ArrowDown' : 'ArrowUp';
    }
    await page.keyboard.press(press);
    if (same(await cursorPos(page), cur)) throw new Error(`cursor stuck at ${JSON.stringify(cur)} walking to ${JSON.stringify(target)} (pressed ${press})`);
  }
  throw new Error(`did not reach ${JSON.stringify(target)} in 40 steps (cursor at ${JSON.stringify(await cursorPos(page))})`);
}

async function tapAt(page: Page, x: number, y: number) {
  if (test.info().project.name === 'phone') await page.touchscreen.tap(x, y);
  else await page.mouse.click(x, y);
}

/**
 * The places from `places` that a finger can reach right now: projected inside the viewport, and
 * clear of the melody card (above) and the HUD footer (below). Lowest fret first, then nearest the
 * middle of the screen, so a phone's windowed neck still yields a usable place.
 */
async function onScreen(page: Page, places: Pos[]): Promise<Placed[]> {
  return page.evaluate((ps) => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const card = document.querySelector('[data-testid="melody-card"]')?.getBoundingClientRect();
    const foot = document.getElementById('hud-bottom')?.getBoundingClientRect();
    const top = card ? card.bottom : 0;
    const bottom = foot ? foot.top : vh;
    const out: { pos: Pos; x: number; y: number }[] = [];
    for (const p of ps) {
      const q = window.__palace!.project(p);
      if (!q) continue;
      if (q.x <= 4 || q.x >= vw - 4 || q.y <= top + 4 || q.y >= bottom - 4) continue;
      out.push({ pos: { string: p.string, fret: p.fret }, x: q.x, y: q.y });
    }
    const cx = vw / 2;
    const cy = (top + bottom) / 2;
    out.sort((a, b) => a.pos.fret - b.pos.fret || Math.hypot(a.x - cx, a.y - cy) - Math.hypot(b.x - cx, b.y - cy));
    return out;
  }, places);
}

/** Tap a place (pointer on either project). Falls back to the keyboard path when no place is on screen. */
async function playPlace(page: Page, places: Pos[]) {
  const reachable = await onScreen(page, places);
  if (reachable.length) {
    const p = reachable[0]!;
    await tapAt(page, p.x, p.y);
    return;
  }
  // Fallback: the neck window has panned away from every such place; walk there from the cursor.
  await focusNeck(page);
  const cur = (await cursorPos(page)) ?? { string: 0, fret: 0 };
  const nearest = [...places].sort((a, b) => Math.abs(a.string - cur.string) + Math.abs(a.fret - cur.fret) - (Math.abs(b.string - cur.string) + Math.abs(b.fret - cur.fret)))[0]!;
  await walkTo(page, nearest);
  await page.keyboard.press('Enter');
}

/** Play the note wanted next on a place that sounds it; the run moves on (or the tune ends). */
/** Every place on the neck that does not sound the wanted note's pitch class (the wanted note name carries an octave). */
async function wrongPlaces(page: Page, w: Wanted): Promise<Pos[]> {
  const wantedClass = w.note.replace(/\d+$/, '');
  const all = await page.evaluate(() => window.__palace!.positions());
  return all.filter((p) => p.note !== wantedClass).map((p) => ({ string: p.string, fret: p.fret }));
}

async function playWanted(page: Page) {
  const w = await wanted(page);
  if (!w) throw new Error('not the player’s turn');
  const before = (await melodyState(page)).at;
  await playPlace(page, w.places);
  await expect.poll(async () => (await melodyState(page)).at, { timeout: 15_000 }).toBeGreaterThan(before);
}

test.describe('Fretboard melody', () => {
  test('Melody phrase: tap the tune through, misses retry, playback then grade', async ({ page }) => {
    test.setTimeout(90_000);
    await enterMelody(page, 'mel-phrase');
    await waitForSettledCamera(page);

    const card = page.getByTestId('melody-card');
    await expect(card).toBeVisible();
    const start = await melodyState(page);
    expect(start.phase).toBe('play');
    expect(start.shown).toBe(true);
    expect(start.at).toBe(0);
    await expect(card).toHaveAttribute('data-phase', 'play');
    await expect(page.getByTestId('melody-title')).toHaveText(start.tune.title);

    // A wrong place: a soft miss, the same note still wanted, the caption says so.
    const w0 = (await wanted(page))!;
    const positions = (await page.evaluate(() => window.__palace!.positions())) as (Pos & { note: string })[];
    const wrong = positions.filter((p) => pitchClass(p.note) !== pitchClass(w0.note));
    const wrongHere = await onScreen(page, wrong);
    expect(wrongHere.length).toBeGreaterThan(0);
    await tapAt(page, wrongHere[0]!.x, wrongHere[0]!.y);
    await expect.poll(async () => (await melodyState(page)).misses, { timeout: 15_000 }).toBe(1);
    const afterMiss = await melodyState(page);
    expect(afterMiss.at).toBe(0);
    expect(afterMiss.phase).toBe('play');
    await expect(page.getByTestId('melody-caption')).toContainText('Not that note');

    // The right notes, in turn, until the tune is whole.
    const total = start.notes.length;
    for (let i = 0; i < total; i++) {
      await playWanted(page);
      await page.waitForTimeout(100);
    }
    await expect.poll(async () => (await melodyState(page)).phase, { timeout: 20_000 }).toBe('playback');
    await expect(card).toHaveAttribute('data-phase', 'playback');
    expect(await page.evaluate(() => window.__palace!.melody.wanted())).toBeNull();

    // Cut the playback short: the tune is graded at once.
    await page.evaluate(() => window.__palace!.melody.endPlayback());
    await expect.poll(() => page.evaluate(() => window.__palace!.session().answered), { timeout: 15_000 }).toBe(1);
    // Then the card moves on: this tune is done, or the next one has started.
    await expect
      .poll(async () => {
        const s = await melodyState(page).catch(() => null);
        return s === null ? 'none' : s.phase === 'done' || (s.phase === 'play' && s.at === 0) ? 'ok' : s.phase;
      }, { timeout: 20_000 })
      .toBe('ok');
  });

  test('Melody by keyboard: arrows walk to a note, Enter plays it, the neck names it', async ({ page }) => {
    test.setTimeout(90_000);
    await enterMelody(page, 'mel-phrase');
    await focusNeck(page);
    const said = page.getByTestId('neck-said');

    for (let i = 0; i < 3; i++) {
      const w = (await wanted(page))!;
      expect(w).not.toBeNull();
      const cur = (await cursorPos(page))!;
      // The nearest place that sounds the wanted note, by fret and string distance from the cursor.
      const nearest = [...w.places].sort(
        (a, b) => Math.abs(a.string - cur.string) + Math.abs(a.fret - cur.fret) - (Math.abs(b.string - cur.string) + Math.abs(b.fret - cur.fret)),
      )[0]!;
      await walkTo(page, nearest);
      const before = (await melodyState(page)).at;
      await page.keyboard.press('Enter');
      await expect.poll(async () => (await melodyState(page)).at, { timeout: 15_000 }).toBe(before + 1);

      // The neck names the note as it was sounded: "E." or "F sharp.".
      const name = pitchClass(w.note);
      const spoken = name.endsWith('#') ? `${name[0]} sharp.` : `${name}.`;
      await expect(said).toHaveText(new RegExp(`^${spoken.replace('.', '\\.')}`));
    }
    expect((await melodyState(page)).at).toBe(3);
  });

  test('Melody from memory: preview then hidden, the first note played', async ({ page }) => {
    test.setTimeout(90_000);
    // The preview runs on its own timers from the moment the tune is set, so check it before the
    // camera settles (on a slow CI renderer the settle alone can outlast a short tune).
    await enterMelody(page, 'mel-recall');

    const card = page.getByTestId('melody-card');
    await expect(card).toBeVisible();
    await expect.poll(async () => (await melodyState(page)).phase, { timeout: 15_000 }).toBe('preview');
    const preview = await melodyState(page);
    expect(preview.shown).toBe(true);
    expect(preview.stage.recall).toBe(true);
    await expect(card).toHaveAttribute('data-phase', 'preview');

    await page.evaluate(() => window.__palace!.melody.endPreview());
    await expect.poll(async () => (await melodyState(page)).phase, { timeout: 15_000 }).toBe('play');
    await expect(card).toHaveAttribute('data-phase', 'play');
    const hidden = await melodyState(page);
    expect(hidden.shown).toBe(false);
    expect(hidden.at).toBe(0);
    await waitForSettledCamera(page);

    // Unplayed notes show as placeholders only.
    const names = page.getByTestId('melody-names').locator('li');
    await expect(names.first()).toBeVisible();
    const texts = await names.allTextContents();
    expect(texts.length).toBeGreaterThan(0);
    for (const t of texts) expect(t.trim()).toBe('·');

    await playWanted(page);
    expect((await melodyState(page)).at).toBe(1);
    // The first note has now been revealed in the names list.
    await expect(names.first()).not.toHaveText('·');
  });

  test('Melody from memory: the tune builds up a line at a time', async ({ page }) => {
    test.setTimeout(120_000);
    await enterMelody(page, 'mel-recall');
    await expect.poll(async () => (await melodyState(page)).phase, { timeout: 15_000 }).toBe('preview');
    await page.evaluate(() => window.__palace!.melody.endPreview());
    await expect.poll(async () => (await melodyState(page)).phase, { timeout: 15_000 }).toBe('play');
    await waitForSettledCamera(page);

    // The first pass is a single line, from the first note.
    const first = await melodyState(page);
    expect(first.span).toBe(1);
    expect(first.inPlay).toBe(first.lines[0]);
    expect(first.lines.length).toBeGreaterThanOrEqual(2);
    for (let i = 0; i < first.inPlay; i++) await playWanted(page);

    // A finished line with more to come: one more line, and the room plays both again.
    await expect.poll(async () => (await melodyState(page)).span, { timeout: 15_000 }).toBe(2);
    await expect(page.getByTestId('melody-card')).toHaveAttribute('data-phase', 'preview', { timeout: 15_000 });
    await expect.poll(async () => (await melodyState(page)).phase, { timeout: 30_000 }).toBe('play');
    const built = await melodyState(page);
    expect(built.span).toBe(2);
    expect(built.inPlay).toBe(built.lines[0]! + built.lines[1]!);
    expect(built.at).toBe(0);
  });

  test('Melody from memory: a wrong note shows the note and replays the same lines; two misses drop back', async ({ page }) => {
    test.setTimeout(150_000);
    await enterMelody(page, 'mel-recall');
    await expect.poll(async () => (await melodyState(page)).phase, { timeout: 15_000 }).toBe('preview');
    await page.evaluate(() => window.__palace!.melody.endPreview());
    await expect.poll(async () => (await melodyState(page)).phase, { timeout: 15_000 }).toBe('play');
    await waitForSettledCamera(page);

    // Build to two lines first.
    const first = await melodyState(page);
    for (let i = 0; i < first.inPlay; i++) await playWanted(page);
    await expect.poll(async () => (await melodyState(page)).span, { timeout: 15_000 }).toBe(2);
    await expect.poll(async () => (await melodyState(page)).phase, { timeout: 30_000 }).toBe('play');

    // First miss: the wanted note is shown, the same two lines are played again.
    const w = await wanted(page);
    if (!w) throw new Error('not the player’s turn');
    await playPlace(page, await wrongPlaces(page, w));
    await expect.poll(async () => (await melodyState(page)).phase, { timeout: 15_000 }).toBe('missed');
    const missed = await melodyState(page);
    expect(missed.shown).toBe(false);
    expect(missed.span).toBe(2);
    expect(missed.missesInRow).toBe(1);
    expect(missed.slip?.outcome).toBe('retry');
    await expect(page.getByTestId('melody-caption')).toContainText('Not quite. Here it is again.');
    await expect(page.getByTestId('melody-caption')).toContainText('The note was');
    await expect.poll(async () => (await melodyState(page)).phase, { timeout: 15_000 }).toBe('preview');
    expect((await melodyState(page)).span).toBe(2);
    await expect.poll(async () => (await melodyState(page)).phase, { timeout: 30_000 }).toBe('play');
    expect((await melodyState(page)).at).toBe(0);

    // Second miss in a row: back to one line (never under one), and the tune builds up again from there.
    const w2 = await wanted(page);
    if (!w2) throw new Error('not the player’s turn');
    await playPlace(page, await wrongPlaces(page, w2));
    await expect.poll(async () => (await melodyState(page)).phase, { timeout: 15_000 }).toBe('missed');
    const dropped = await melodyState(page);
    expect(dropped.slip?.outcome).toBe('drop');
    expect(dropped.span).toBe(1);
    expect(dropped.missesInRow).toBe(0);
    await expect(page.getByTestId('melody-caption')).toContainText('Back to 1 line and building up again.');
    await expect.poll(async () => (await melodyState(page)).phase, { timeout: 15_000 }).toBe('preview');
    expect((await melodyState(page)).inPlay).toBe(first.inPlay);
  });

  test('Melody stages on the Stages card: picking a stage moves the tune there', async ({ page }) => {
    test.setTimeout(90_000);
    await enterMelody(page, 'mel-phrase');
    await waitForSettledCamera(page);
    expect((await melodyState(page)).phase).toBe('play');

    await page.getByTestId('stages-open').click();
    const sheet = page.getByTestId('stages');
    await expect(sheet).toBeVisible();
    for (const id of ['mel-phrase', 'mel-tune', 'mel-neck', 'mel-recall']) {
      await expect(page.getByTestId(`stage-${id}`)).toBeAttached();
    }

    await page.getByTestId('stage-mel-tune').click();
    await expect(sheet).toBeHidden();
    await expect.poll(() => page.evaluate(() => window.__palace!.stage().id), { timeout: 15_000 }).toBe('mel-tune');
    await expect.poll(async () => (await melodyState(page)).stage.id, { timeout: 15_000 }).toBe('mel-tune');
  });

  test('Melody tap targets: Listen is a real button and hears the tune, then play resumes', async ({ page }, info) => {
    test.setTimeout(90_000);
    await enterMelody(page, 'mel-phrase');
    await waitForSettledCamera(page);

    const listen: Locator = page.getByTestId('melody-listen');
    await expect(listen).toBeVisible();
    const box = await listen.boundingBox();
    expect(box).not.toBeNull();
    if (info.project.name === 'phone') expect(box!.height).toBeGreaterThanOrEqual(44);
    await expect(listen).toBeEnabled();

    await tapAt(page, box!.x + box!.width / 2, box!.y + box!.height / 2);
    await expect.poll(async () => (await melodyState(page)).phase, { timeout: 15_000 }).toBe('preview');
    await expect(page.getByTestId('melody-card')).toHaveAttribute('data-phase', 'preview');

    await page.evaluate(() => window.__palace!.melody.endPreview());
    await expect.poll(async () => (await melodyState(page)).phase, { timeout: 15_000 }).toBe('play');
    await expect(page.getByTestId('melody-card')).toHaveAttribute('data-phase', 'play');
    expect((await melodyState(page)).at).toBe(0);
  });
});
