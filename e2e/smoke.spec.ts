import { type Page, expect, test } from '@playwright/test';

type Pos = { string: number; fret: number };

/** Attract → (primer on a first visit, skipped) → play. */
async function enterPlay(page: Page) {
  await expect(page.getByTestId('attract')).toBeVisible();
  await page.getByTestId('attract-begin').click();
  if ((await page.evaluate(() => window.__palace!.screen())) === 'primer') await page.getByTestId('primer-skip').click();
  await expect(page.getByTestId('attract')).toBeHidden();
  await expect.poll(() => page.evaluate(() => window.__palace!.screen())).toBe('play');
}

async function waitForFrames(page: Page, n = 10) {
  await expect.poll(() => page.evaluate(() => window.__palace!.render().frames), { timeout: 15_000 }).toBeGreaterThan(n);
}

/** Wait until the camera dolly has settled (projected point stops moving). */
async function settledProjection(page: Page, p: Pos) {
  let last = { x: -1, y: -1 };
  await expect
    .poll(
      async () => {
        await page.waitForTimeout(250);
        const cur = (await page.evaluate((q) => window.__palace!.project(q), p))!;
        const moved = Math.hypot(cur.x - last.x, cur.y - last.y);
        last = cur;
        return moved;
      },
      { timeout: 10_000 },
    )
    .toBeLessThan(0.5);
  return last;
}

async function tapAt(page: Page, x: number, y: number) {
  if (test.info().project.name === 'phone') await page.touchscreen.tap(x, y);
  else await page.mouse.click(x, y);
}

test.beforeEach(async ({ page }) => {
  await page.goto('./');
});

test('loads and renders the fretboard canvas', async ({ page }) => {
  await expect(page).toHaveTitle(/Palace/);
  await enterPlay(page);
  const canvas = page.locator('canvas');
  await expect(canvas).toBeVisible();
  const box = await canvas.boundingBox();
  expect(box!.width).toBeGreaterThan(300);
  await waitForFrames(page);
  const info = await page.evaluate(() => window.__palace!.render());
  expect(info.meshes).toBeGreaterThan(40);
  expect(info.triangles).toBeGreaterThan(1000);
  // Something non-trivial was drawn (a blank canvas compresses to almost nothing).
  const shot = await canvas.screenshot();
  expect(shot.byteLength).toBeGreaterThan(20_000);
  // Starting region: low E and A strings, frets 0–5.
  const positions = await page.evaluate(() => window.__palace!.positions());
  expect(positions).toHaveLength(12);
  expect(new Set(positions.map((p) => p.string))).toEqual(new Set([0, 1]));
});

test('answers a Name-it question through the UI', async ({ page }) => {
  await enterPlay(page);
  await waitForFrames(page);
  expect(await page.evaluate(() => window.__palace!.drill())).toBe('name');
  const first = await page.evaluate(() => window.__palace!.question());
  expect(await page.evaluate(() => window.__palace!.state())).toEqual({ mode: 'name', question: first });
  const answer = (await page.evaluate(() => window.__palace!.answer())) as string;
  await page.locator(`button[data-note="${answer}"]`).click();
  await expect(page.getByTestId('prompt')).toHaveClass(/correct/);
  await expect(page.locator(`button[data-note="${answer}"]`)).toHaveClass(/correct/);
  expect(await page.evaluate(() => window.__palace!.session())).toMatchObject({ answered: 1, correct: 1 });
  // The next question arrives on its own and is a different item.
  await expect.poll(() => page.evaluate(() => window.__palace!.question().itemId)).not.toBe(first.itemId);

  // A wrong answer is gently corrected.
  const right = (await page.evaluate(() => window.__palace!.answer())) as string;
  const wrong = right === 'C' ? 'D' : 'C';
  await page.locator(`button[data-note="${wrong}"]`).click();
  await expect(page.locator(`button[data-note="${wrong}"]`)).toHaveClass(/miss/);
  await expect(page.locator(`button[data-note="${right}"]`)).toHaveClass(/reveal/);
  expect(await page.evaluate(() => window.__palace!.session())).toMatchObject({ answered: 2, correct: 1 });
});

test('Find-all: tapping the neck finds a target', async ({ page }) => {
  await enterPlay(page);
  await waitForFrames(page);
  await page.getByTestId('drill-find').click();
  expect(await page.evaluate(() => window.__palace!.drill())).toBe('find');
  expect(await page.evaluate(() => window.__palace!.state().mode)).toBe('find');
  const targets = (await page.evaluate(() => window.__palace!.answer())) as Pos[];
  expect(targets.length).toBeGreaterThan(0);
  const pt = await settledProjection(page, targets[0]!);
  await tapAt(page, pt.x, pt.y);
  // Either the target is marked found, or (single-target notes) the question was graded.
  await expect
    .poll(() => page.evaluate(() => window.__palace!.found().length + window.__palace!.session().correct))
    .toBeGreaterThan(0);
  expect(await page.evaluate(() => window.__palace!.session().answered - window.__palace!.session().correct)).toBe(0);
});

test('every unlocked cell is tappable where it is drawn, with phone-sized string spacing', async ({ page }) => {
  await enterPlay(page);
  await waitForFrames(page);
  const positions = (await page.evaluate(() => window.__palace!.positions())).map(({ string, fret }) => ({ string, fret }));
  await settledProjection(page, positions[0]!);
  const phone = test.info().project.name === 'phone';
  for (const p of positions) {
    const pt = (await page.evaluate((q) => window.__palace!.project(q), p))!;
    // Nothing in the HUD sits over a playable cell.
    expect(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.tagName, pt)).toBe('CANVAS');
    await tapAt(page, pt.x, pt.y);
    await expect.poll(() => page.evaluate(() => window.__palace!.lastTap())).toEqual(p);
    // Wait out the pluck so the next tap is a fresh event.
    await page.waitForTimeout(50);
  }
  if (phone) {
    // Adjacent strings at least a fingertip apart (≥ 44 CSS px) right at the nut.
    for (const fret of [0, 1, 5]) {
      const [a, b] = await page.evaluate((f) => [window.__palace!.project({ string: 0, fret: f }), window.__palace!.project({ string: 1, fret: f })], fret);
      expect(Math.hypot(a!.x - b!.x, a!.y - b!.y)).toBeGreaterThanOrEqual(44);
    }
  }
});

test('toggles left-handed mode (mirrors the neck, persists)', async ({ page }) => {
  await enterPlay(page);
  await waitForFrames(page);
  const probe = { string: 0, fret: 3 };
  const before = await settledProjection(page, probe);
  const width = page.viewportSize()!.width;

  await page.getByTestId('settings-open').click();
  await expect(page.getByTestId('settings')).toBeVisible();
  await expect(page.getByTestId('hand-false')).toHaveAttribute('aria-checked', 'true');
  await page.getByTestId('hand-true').click();
  await expect(page.getByTestId('hand-true')).toHaveAttribute('aria-checked', 'true');
  await page.getByTestId('settings-close').click();
  await expect(page.getByTestId('settings')).toBeHidden();
  expect(await page.evaluate(() => window.__palace!.leftHanded())).toBe(true);

  // The neck is mirrored horizontally: the probe moves to the other side of centre.
  await expect
    .poll(async () => {
      const after = await page.evaluate((p) => window.__palace!.project(p), probe);
      return Math.sign(after!.x - width / 2);
    })
    .toBe(-Math.sign(before.x - width / 2));

  const stored = await page.evaluate(() => localStorage.getItem('palace.fretboard.v1'));
  expect(JSON.parse(stored!).settings.leftHanded).toBe(true);
  await page.reload();
  expect(await page.evaluate(() => window.__palace!.leftHanded())).toBe(true);
  // A returning player goes straight from the title to play: no primer.
  await page.getByTestId('attract-begin').click();
  await expect(page.getByTestId('primer')).toBeHidden();
  expect(await page.evaluate(() => window.__palace!.screen())).toBe('play');
});

test('the settings sheet is a real dialog: focus, Escape, and no slide under reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await enterPlay(page);
  await waitForFrames(page);
  await page.getByTestId('settings-open').click();
  const close = page.getByTestId('settings-close');
  await expect(page.getByTestId('settings')).toBeVisible();
  await expect(close).toBeFocused();
  // Reduced motion: the card is on the desk at once, its buttons live without waiting for a slide.
  await expect(close).toHaveClass(/placed/);
  const box = (await close.boundingBox())!;
  expect(box.width).toBeGreaterThanOrEqual(44);
  expect(box.height).toBeGreaterThanOrEqual(44);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('settings')).toBeHidden();
  await expect(page.getByTestId('settings-open')).toBeFocused();
});

test('first visit: title, three-beat primer, then play without the wordmark', async ({ page }) => {
  await expect(page.getByTestId('attract')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Palace' })).toBeVisible();
  await expect(page.getByTestId('attract-begin')).toHaveText('Begin');
  await page.getByTestId('attract-begin').click();
  const primer = page.getByTestId('primer');
  await expect(primer).toBeVisible();
  await expect(primer.locator('.numeral')).toHaveText('I');
  await page.getByTestId('primer-next').click();
  await expect(primer.locator('.numeral')).toHaveText('II');
  // Tapping anywhere turns the page too.
  await primer.click({ position: { x: 20, y: 200 } });
  await expect(primer.locator('.numeral')).toHaveText('III');
  await page.getByTestId('primer-next').click();
  await expect(primer).toBeHidden();
  expect(await page.evaluate(() => window.__palace!.screen())).toBe('play');
  await expect(page.getByTestId('prompt')).toBeVisible();
  await expect(page.getByText('Palace', { exact: true })).toHaveCount(0);
  const stored = await page.evaluate(() => localStorage.getItem('palace.fretboard.v1'));
  expect(JSON.parse(stored!).onboarded).toBe(true);
});

test('a full sitting closes on the session sheet; Again and Leave', async ({ page }) => {
  test.setTimeout(60_000);
  await enterPlay(page);
  await waitForFrames(page);
  for (let i = 0; i < 10; i++) {
    const q = await page.evaluate(() => window.__palace!.question());
    const answer = (await page.evaluate(() => window.__palace!.answer())) as string;
    await page.locator(`button[data-note="${answer}"]`).click();
    if (i < 9) await expect.poll(() => page.evaluate(() => window.__palace!.question().itemId)).not.toBe(q.itemId);
  }
  const sheet = page.getByTestId('session-sheet');
  await expect(sheet).toBeVisible();
  await expect(sheet).toContainText('Today');
  await expect(sheet).toContainText('10 of 10');
  await page.getByTestId('session-again').click();
  await expect(sheet).toBeHidden();
  expect(await page.evaluate(() => window.__palace!.session())).toMatchObject({ answered: 0, correct: 0 });

  // A deliberate End, then Leave returns to the title.
  await page.getByTestId('session-end').click();
  await expect(sheet).toBeVisible();
  await page.getByTestId('session-leave').click();
  await expect(page.getByTestId('attract')).toBeVisible();
  await expect(page.getByTestId('attract-begin')).toHaveText('Continue');
});

/**
 * A saved deck that makes the next Name-it questions exactly `ask`, in order:
 * those items are overdue (the first most of all), everything else in the
 * stage was seen and isn't due until tomorrow. Answered items go back into
 * learning (due in seconds), so they don't come round again within a test.
 */
function seededSave(stage: number, positions: Pos[], ask: Pos[], leftHanded: boolean) {
  const now = Date.now();
  const deck: Record<string, unknown> = {};
  for (const p of positions) {
    const id = `name:s${p.string}f${p.fret}`;
    const order = ask.findIndex((q) => q.string === p.string && q.fret === p.fret);
    const due = order < 0 ? now + 86_400_000 : now - (ask.length - order) * 3_600_000;
    deck[id] = { id, ease: 2.5, interval: 60_000, reps: 0, lapses: 0, seen: 1, correct: 0, due, last: now - 86_400_000, avgMs: 0 };
  }
  return JSON.stringify({ deck, stage, settings: { leftHanded, sound: false }, onboarded: true });
}

const STAGE_ALL_STRINGS = 2; // all six strings, frets 0–5
const ALL_0_5: Pos[] = Array.from({ length: 36 }, (_, i) => ({ string: Math.floor(i / 6), fret: i % 6 }));
// Open A (the reported case), its neighbour open low E, open high E, and two fretted positions.
const PROBES: Pos[] = [
  { string: 1, fret: 0 },
  { string: 0, fret: 0 },
  { string: 5, fret: 0 },
  { string: 2, fret: 3 },
  { string: 4, fret: 5 },
];

for (const leftHanded of [false, true]) {
  test(`the highlighted position matches the prompt (${leftHanded ? 'left' : 'right'}-handed)`, async ({ page }) => {
    await page.addInitScript((save) => localStorage.setItem('palace.fretboard.v1', save), seededSave(STAGE_ALL_STRINGS, ALL_0_5, PROBES, leftHanded));
    await page.goto('./');
    await enterPlay(page);
    await waitForFrames(page);
    expect(await page.evaluate(() => window.__palace!.leftHanded())).toBe(leftHanded);
    const names = ['low E', 'A', 'D', 'G', 'B', 'high E'];
    const ordinal = (n: number) => `${n}${n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'}`;

    for (const probe of PROBES) {
      const q = await page.evaluate(() => window.__palace!.question());
      expect(q.kind).toBe('name');
      if (q.kind !== 'name') return;
      expect(q.position).toEqual(probe);
      const { string, fret } = q.position;
      // The words…
      const label = fret === 0 ? `open ${names[string]} string` : `${names[string]} string, ${ordinal(fret)} fret`;
      await expect(page.getByTestId('prompt-where')).toHaveText(label);
      // …and the light: the highlight was made for this position, and on screen it
      // sits on that string's mesh and in that fret space.
      await expect
        .poll(() => page.evaluate(() => window.__palace!.highlight()))
        .toMatchObject({ string, fret, tone: 'ask', renderedString: string, renderedFret: fret });
      // Read both in the same task so camera settling between calls can't skew them.
      const { h, projected } = (await page.evaluate((p) => ({ h: window.__palace!.highlight()!, projected: window.__palace!.project(p)! }), q.position));
      expect(Math.hypot(h.screen.x - projected.x, h.screen.y - projected.y)).toBeLessThan(8);

      await page.locator(`button[data-note="${q.answer}"]`).click();
      await expect.poll(() => page.evaluate(() => window.__palace!.question().itemId)).not.toBe(q.itemId);
    }
  });
}
