import { type Page, expect, test } from '@playwright/test';

/** Title → (primer on a first visit, skipped) → hub. Only the one test that walks the real UI uses this. */
async function enterHub(page: Page) {
  await expect(page.getByTestId('attract')).toBeVisible();
  await page.getByTestId('attract-begin').click();
  if ((await page.evaluate(() => window.__palace!.screen())) === 'primer') await page.getByTestId('primer-skip').click();
  await expect(page.getByTestId('attract')).toBeHidden();
  await expect(page.getByTestId('hub')).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__palace!.screen())).toBe('hub');
}

/** Walk straight into N-Back play on a stage, from any screen (fast path for every test but the UI one). */
async function enterNBack(page: Page, stageId: string) {
  await page.goto('./');
  await page.waitForFunction(() => !!window.__palace);
  await page.evaluate((id) => window.__palace!.nback.enter(id), stageId);
  await expect.poll(() => page.evaluate(() => window.__palace!.screen()), { timeout: 15_000 }).toBe('play');
  await expect.poll(() => page.evaluate(() => window.__palace!.nback.state().stage.id), { timeout: 15_000 }).toBe(stageId);
  await expect.poll(() => page.evaluate(() => window.__palace!.mode()), { timeout: 15_000 }).toBe('nback');
}

const nbackState = (page: Page) => page.evaluate(() => window.__palace!.nback.state());
const nbackMatches = (page: Page) => page.evaluate(() => window.__palace!.nback.matches());
const nbackStage = (page: Page, id: string) => page.evaluate((s) => window.__palace!.nback.stages().find((x) => x.id === s)!, id);
const nbackAt = (page: Page) => page.evaluate(() => window.__palace!.nback.state().at);

/** Wait for the run to be under way: the first tile has turned (trial index 0 or later). */
async function waitForRun(page: Page) {
  await expect.poll(() => page.evaluate(() => window.__palace!.nback.state().phase), { timeout: 15_000 }).toBe('run');
  await expect.poll(() => nbackAt(page), { timeout: 15_000 }).toBeGreaterThanOrEqual(0);
}

test.describe('N-Back', () => {
  test('from the title, through the hub and stage card, into a run of one back', async ({ page }) => {
    test.setTimeout(45_000);
    await page.goto('./');
    await enterHub(page);

    const room = page.getByTestId('room-nback');
    await expect(room).toHaveClass(/placed/);
    await room.click();
    const cell = page.getByTestId('nback-stage-one');
    await expect(cell).toHaveClass(/placed/);
    await cell.click();
    await expect(page.getByTestId('stages')).toBeHidden();

    await expect.poll(() => page.evaluate(() => window.__palace!.screen())).toBe('play');
    await expect.poll(() => page.evaluate(() => window.__palace!.nback.state().stage.id)).toBe('one');
    await expect.poll(() => page.evaluate(() => window.__palace!.mode())).toBe('nback');
    await waitForRun(page);
  });

  test('a perfect run on one back scores a hundred, masters the stage and presses its seal', async ({ page }) => {
    test.setTimeout(45_000);
    await enterNBack(page, 'one');
    await waitForRun(page);

    // Each trial: call the tile if it matches one back, then end the trial. Stepping is synchronous, so the next trial is up at once.
    const total = (await nbackState(page)).run.length;
    for (let guard = 0; guard < total + 5; guard++) {
      if ((await nbackState(page)).phase === 'done') break;
      const at = await nbackAt(page);
      expect(at).toBeGreaterThanOrEqual(0);
      const matches = await nbackMatches(page);
      if (matches.includes('place')) await page.getByTestId('nback-call-place').click();
      await page.evaluate(() => window.__palace!.nback.step());
      await expect.poll(async () => {
        const now = await nbackState(page);
        return now.phase === 'done' || now.at !== at;
      }).toBe(true);
    }
    await expect.poll(() => page.evaluate(() => window.__palace!.nback.state().phase), { timeout: 15_000 }).toBe('done');

    const s = await nbackState(page);
    expect(s.sitting.score).toBe(100);
    expect(s.sitting.finished).toBe(true);
    const stage = await nbackStage(page, 'one');
    expect(stage.best).toBe(100);
    expect(stage.mastered).toBe(true);

    await expect.poll(() => page.evaluate(() => window.__palace!.rewards().seal?.title ?? null), { timeout: 15_000 }).toBe('One back');
    await expect.poll(() => page.evaluate(() => window.__palace!.screen()), { timeout: 15_000 }).toBe('session');
    await expect(page.getByTestId('session-sheet')).toBeVisible();
  });

  test('dual: keyboard calls on the matches, one wrong call, and the matches let past are misses', async ({ page }) => {
    test.setTimeout(45_000);
    await enterNBack(page, 'dual');
    await waitForRun(page);

    const n = (await nbackState(page)).stage.n;
    const total = (await nbackState(page)).run.length;
    let calls = 0;
    let hits = 0;
    let falseCalled = false;
    let expectedMisses = 0;

    for (let t = 0; t < total; t++) {
      await expect.poll(() => nbackAt(page)).toBe(t);
      const matches = await nbackMatches(page);
      if (t < n) {
        // Nothing to match yet: nothing to call.
        await page.evaluate(() => window.__palace!.nback.step());
        continue;
      }
      if (calls < 4) {
        // A few matches caught, from the keyboard.
        for (const ch of matches) {
          await page.keyboard.press(ch === 'place' ? 'a' : 'l');
          calls++;
          hits += 1;
        }
      } else if (!falseCalled && !matches.includes('place')) {
        // A wrong call: the tile calls a match that is not one.
        await page.keyboard.press('a');
        falseCalled = true;
        expectedMisses += matches.length;
      } else {
        // Let the rest go by without a call: every match among them is a miss.
        expectedMisses += matches.length;
      }
      await page.evaluate(() => window.__palace!.nback.step());
    }

    await expect.poll(() => page.evaluate(() => window.__palace!.nback.state().phase)).toBe('done');
    const s = await nbackState(page);
    expect(s.tallies.place.false).toBe(1);
    expect(s.tallies.place.hits + s.tallies.tone.hits).toBe(hits);
    expect(s.tallies.place.misses + s.tallies.tone.misses).toBe(expectedMisses);
    expect(s.tallies.tone.false).toBe(0);
    expect(falseCalled).toBe(true);
  });

  test('call buttons are at least 44px and on screen', async ({ page }) => {
    test.setTimeout(45_000);
    await enterNBack(page, 'dual');
    await waitForRun(page);
    const viewport = page.viewportSize()!;

    for (const ch of ['place', 'tone']) {
      const r = (await page.getByTestId(`nback-call-${ch}`).boundingBox())!;
      expect.soft(r.width, `${ch} call width`).toBeGreaterThanOrEqual(44);
      expect.soft(r.height, `${ch} call height`).toBeGreaterThanOrEqual(44);
      expect.soft(r.x, `${ch} call left edge`).toBeGreaterThanOrEqual(0);
      expect.soft(r.y, `${ch} call top edge`).toBeGreaterThanOrEqual(0);
      expect.soft(r.x + r.width, `${ch} call right edge`).toBeLessThanOrEqual(viewport.width);
      expect.soft(r.y + r.height, `${ch} call bottom edge`).toBeLessThanOrEqual(viewport.height);
    }
  });

  test('calls during the first n trials are ignored: no tally moves', async ({ page }) => {
    test.setTimeout(45_000);
    await enterNBack(page, 'two');
    await waitForRun(page);
    const n = (await nbackState(page)).stage.n;
    expect(n).toBe(2);

    const before = (await nbackState(page)).tallies;
    for (let t = 0; t < n; t++) {
      await expect.poll(() => nbackAt(page)).toBe(t);
      await page.getByTestId('nback-call-place').click();
      await page.evaluate(() => window.__palace!.nback.step());
    }
    await expect.poll(() => nbackAt(page)).toBe(n);
    const after = await nbackState(page);
    expect(after.tallies).toEqual(before);
    expect(after.sitting.score).toBe(0);
  });
});
