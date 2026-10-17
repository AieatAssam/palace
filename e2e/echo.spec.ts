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

/** Walk straight into Echo play on a stage, from any screen (fast path for every test but the UI one). */
const CHORD_SEED = 1;

async function enterEcho(page: Page, stageId: string, seed?: number) {
  await page.goto('./');
  await page.waitForFunction(() => !!window.__palace);
  if (seed !== undefined) await page.evaluate((n) => window.__palace!.echo.seed(n), seed);
  await page.evaluate((id) => window.__palace!.echo.enter(id), stageId);
  await expect.poll(() => page.evaluate(() => window.__palace!.screen()), { timeout: 15_000 }).toBe('play');
  await expect.poll(() => page.evaluate(() => window.__palace!.echo.state().stage.id), { timeout: 15_000 }).toBe(stageId);
  await expect.poll(() => page.evaluate(() => window.__palace!.mode()), { timeout: 15_000 }).toBe('echo');
}

/** Wait until the room has played the line and handed it to the player. */
async function waitForRepeat(page: Page) {
  await expect.poll(() => page.evaluate(() => window.__palace!.echo.state().phase), { timeout: 15_000 }).toBe('repeat');
}

/** Ring back the line by clicking the bell the current step still wants, one stroke at a time. Returns the phase it stopped in. */
async function ringBack(page: Page) {
  for (let guard = 0; guard < 300; guard++) {
    const phase = await page.evaluate(() => window.__palace!.echo.state().phase);
    if (phase !== 'repeat') return phase;
    const want = await page.evaluate(() => window.__palace!.echo.next());
    if (want.length === 0) {
      await page.waitForTimeout(50);
      continue;
    }
    await page.getByTestId(`echo-bell-${want[0]}`).click();
  }
  throw new Error('the line never finished');
}

/** Same loop as ringBack, but strikes with the number keys. */
async function ringBackByKeys(page: Page) {
  for (let guard = 0; guard < 300; guard++) {
    const phase = await page.evaluate(() => window.__palace!.echo.state().phase);
    if (phase !== 'repeat') return phase;
    const want = await page.evaluate(() => window.__palace!.echo.next());
    if (want.length === 0) {
      await page.waitForTimeout(50);
      continue;
    }
    await page.keyboard.press(String(want[0]));
  }
  throw new Error('the line never finished');
}

const echoState = (page: Page) => page.evaluate(() => window.__palace!.echo.state());
const echoStage = (page: Page, id: string) => page.evaluate((s) => window.__palace!.echo.stages().find((x) => x.id === s)!, id);
const phaseOf = (page: Page) => page.evaluate(() => window.__palace!.echo.state().phase);

test.describe('Echo', () => {
  test('from the title, through the hub and stage card, into a six-bell line', async ({ page }) => {
    test.setTimeout(45_000);
    await page.goto('./');
    await enterHub(page);

    const room = page.getByTestId('room-echo');
    await expect(room).toHaveClass(/placed/);
    await room.click();
    const cell = page.getByTestId('echo-stage-six');
    await expect(cell).toHaveClass(/placed/);
    await cell.click();
    await expect(page.getByTestId('stages')).toBeHidden();

    await expect.poll(() => page.evaluate(() => window.__palace!.screen())).toBe('play');
    await expect.poll(() => page.evaluate(() => window.__palace!.echo.state().stage.id)).toBe('six');
    await expect.poll(() => page.evaluate(() => window.__palace!.mode())).toBe('echo');
    await waitForRepeat(page);
    expect((await echoState(page)).line).toHaveLength(3);
  });

  test('a clean line lengthens by one and the next line keeps the old prefix', async ({ page }) => {
    test.setTimeout(45_000);
    await enterEcho(page, 'six');
    await waitForRepeat(page);

    const first = await echoState(page);
    expect(first.line).toHaveLength(3);
    expect(first.stage.bells).toBe(6);

    expect(await ringBack(page)).toMatch(/^(clean|listen)$/);
    await expect.poll(() => phaseOf(page)).toMatch(/^(clean|listen)$/);
    const after = await echoState(page);
    expect(after.sitting.clean).toBe(1);
    expect(after.sitting.lines).toBe(1);

    expect((await echoStage(page, 'six')).best).toBeGreaterThanOrEqual(3);
    const r = await page.evaluate(() => window.__palace!.rewards());
    expect(r.streak).toBe(1);
    expect(r.daily.items).toBeGreaterThanOrEqual(1);

    await waitForRepeat(page);
    const next = await echoState(page);
    expect(next.line).toHaveLength(4);
    expect(next.line.slice(0, 3)).toEqual(first.line);
  });

  for (const id of ['four', 'six', 'eight']) {
    test(`bell buttons are at least 44px, on screen, and barely overlapping (${id})`, async ({ page }) => {
      test.setTimeout(45_000);
      await enterEcho(page, id);
      const viewport = page.viewportSize()!;
      const n = (await echoState(page)).stage.bells;
      await expect.poll(() => page.evaluate(() => window.__palace!.echo.bells().length)).toBe(n);
      for (let i = 1; i <= n; i++) await expect(page.getByTestId(`echo-bell-${i}`)).toHaveClass(/placed/);

      // Measure only once the camera has finished its dolly; mid-move rects are not where the bells will stay.
      await expect.poll(() => page.evaluate(() => window.__palace!.cameraSettled()), { timeout: 15_000 }).toBe(true);
      const rects = await page.evaluate(() => window.__palace!.echo.bells());
      expect(rects).toHaveLength(n);
      for (const r of rects) {
        expect.soft(r.w, `${id} bell ${r.bell} width`).toBeGreaterThanOrEqual(44);
        expect.soft(r.h, `${id} bell ${r.bell} height`).toBeGreaterThanOrEqual(44);
        expect.soft(r.x, `${id} bell ${r.bell} left edge`).toBeGreaterThanOrEqual(0);
        expect.soft(r.y, `${id} bell ${r.bell} top edge`).toBeGreaterThanOrEqual(0);
        expect.soft(r.x + r.w, `${id} bell ${r.bell} right edge`).toBeLessThanOrEqual(viewport.width);
        expect.soft(r.y + r.h, `${id} bell ${r.bell} bottom edge`).toBeLessThanOrEqual(viewport.height);
      }
      for (let i = 0; i < rects.length; i++) {
        for (let j = i + 1; j < rects.length; j++) {
          const a = rects[i]!;
          const b = rects[j]!;
          const ix = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
          const iy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
          const ratio = (ix * iy) / Math.min(a.w * a.h, b.w * b.h);
          expect.soft(ratio, `${id}: bells ${a.bell} and ${b.bell} overlap`).toBeLessThanOrEqual(0.1);
        }
      }
    });
  }

  test('keyboard: the number keys ring back a reversed line', async ({ page }) => {
    test.setTimeout(45_000);
    await enterEcho(page, 'reverse');
    await waitForRepeat(page);

    const s = await echoState(page);
    expect(s.stage.order).toBe('reverse');
    expect(s.expected.map((x) => x[0])).toEqual([...s.line.map((x) => x[0])].reverse());

    expect(await ringBackByKeys(page)).toMatch(/^(clean|listen)$/);
    await expect.poll(() => page.evaluate(() => window.__palace!.echo.state().sitting.clean)).toBe(1);
    expect((await page.evaluate(() => window.__palace!.rewards())).streak).toBe(1);
  });

  test('chord stage: both bells of a pair, in either order, count as one step', async ({ page }) => {
    test.setTimeout(45_000);
    // Seeded so the lines are known to contain a pair (unseeded, ~13% of runs saw none in four lines).
    await enterEcho(page, 'chord', CHORD_SEED);

    let sawPair = false;
    let cleanLines = 0;
    for (let line = 1; line <= 4 && !sawPair; line++) {
      await waitForRepeat(page);
      const s = await echoState(page);
      expect(s.stage.chords).toBe(true);
      sawPair ||= s.line.some((step) => step.length === 2);
      await ringBack(page);
      cleanLines++;
      await expect.poll(() => page.evaluate(() => window.__palace!.echo.state().sitting.clean)).toBe(cleanLines);
      await expect.poll(() => phaseOf(page)).toMatch(/^(clean|listen)$/);
    }
    // Each clean line rung back is counted once, however many bells a step had.
    const s = await echoState(page);
    expect(s.sitting.clean).toBe(cleanLines);
    expect(s.sitting.slips).toBe(0);
    expect(sawPair).toBe(true);
  });

  /** Strike a bell the line does not want now. Returns the slip's outcome, read while the slip is still shown. */
  async function strikeWrong(page: Page): Promise<string> {
    await waitForRepeat(page);
    const wanted = await page.evaluate(() => window.__palace!.echo.next());
    const n = (await echoState(page)).stage.bells;
    const wrong = Array.from({ length: n }, (_, k) => k + 1).find((b) => !wanted.includes(b))!;
    await page.getByTestId(`echo-bell-${wrong}`).click();
    let outcome: string | null = null;
    // The slip clears after its pause, so read the outcome as soon as it shows.
    await expect
      .poll(async () => {
        outcome = await page.evaluate(() => {
          const e = window.__palace!.echo.state();
          return e.phase === 'slip' ? (e.slip?.outcome ?? null) : null;
        });
        return outcome;
      })
      .not.toBeNull();
    return outcome!;
  }

  test('a first miss replays the same line at the same length', async ({ page }) => {
    test.setTimeout(45_000);
    await enterEcho(page, 'six', 7);
    await waitForRepeat(page);
    const before = await echoState(page);
    expect(before.line).toHaveLength(3);

    expect(await strikeWrong(page)).toBe('retry');
    const slip = await echoState(page);
    expect(slip.sitting.slips).toBe(1);
    expect(slip.sitting.drops).toBe(0);

    await waitForRepeat(page);
    const again = await echoState(page);
    expect(again.line).toEqual(before.line);
    expect(again.tune).toEqual(before.tune);
    expect(again.line).toHaveLength(3);
    expect(again.missesInRow).toBe(1);
    await expect(page.getByTestId('echo-slips')).toHaveAttribute('aria-label', '0 of 3 drop-backs');
  });

  test('a clean line keeps the streak; a first miss keeps it too; a second miss drops two bells back', async ({ page }) => {
    test.setTimeout(90_000);
    await enterEcho(page, 'six', 7);
    await waitForRepeat(page);
    expect(await ringBack(page)).toMatch(/^(clean|listen)$/);
    await waitForRepeat(page);
    const grown = await echoState(page);
    expect(grown.line).toHaveLength(4);
    expect((await page.evaluate(() => window.__palace!.rewards())).streak).toBe(1);

    expect(await strikeWrong(page)).toBe('retry');
    expect((await page.evaluate(() => window.__palace!.rewards())).streak).toBe(1);
    await waitForRepeat(page);
    expect((await echoState(page)).line).toEqual(grown.line);

    expect(await strikeWrong(page)).toBe('drop');
    await expect.poll(() => page.evaluate(() => window.__palace!.echo.state().sitting.drops)).toBe(1);
    expect((await page.evaluate(() => window.__palace!.rewards())).streak).toBe(0);
    await waitForRepeat(page);
    const dropped = await echoState(page);
    expect(dropped.line).toHaveLength(3);
    expect(dropped.line).toEqual(grown.line.slice(0, 3));
    expect(dropped.tune.slice(0, 4)).toEqual(grown.tune.slice(0, 4));
    await expect(page.getByTestId('echo-slips')).toHaveAttribute('aria-label', '1 of 3 drop-backs');
  });

  test('three drop-backs end the sitting; Again starts over; End then Leave goes to the hub', async ({ page }) => {
    test.setTimeout(120_000);
    await enterEcho(page, 'six', 7);
    const sheet = page.getByTestId('session-sheet');

    // Each drop-back costs two misses in a row: the first replays the line, the second drops it.
    for (let drop = 1; drop <= 3; drop++) {
      expect(await strikeWrong(page)).toBe('retry');
      await waitForRepeat(page);
      expect(await strikeWrong(page)).toBe('drop');
      await expect.poll(() => page.evaluate(() => window.__palace!.echo.state().sitting.drops)).toBe(drop);
      await expect(page.getByTestId('echo-slips')).toHaveAttribute('aria-label', `${drop} of 3 drop-backs`);
    }

    await expect(sheet).toBeVisible();
    expect((await echoState(page)).sitting.slips).toBe(6);
    expect((await echoState(page)).sitting.drops).toBe(3);

    // Again: a fresh sitting, back on the bells.
    await expect(page.getByTestId('session-again')).toHaveClass(/placed/);
    await page.getByTestId('session-again').click();
    await expect(sheet).toBeHidden();
    await expect.poll(() => page.evaluate(() => window.__palace!.screen())).toBe('play');
    await waitForRepeat(page);
    expect((await echoState(page)).sitting.slips).toBe(0);
    expect((await echoState(page)).sitting.drops).toBe(0);

    // End, then Leave returns to the hub.
    await page.getByTestId('session-end').click();
    await expect(sheet).toBeVisible();
    await expect(page.getByTestId('session-leave')).toHaveClass(/placed/);
    await page.getByTestId('session-leave').click();
    await expect(page.getByTestId('hub')).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.__palace!.screen())).toBe('hub');
  });

  test('New tune draws a fresh tune at the start length and keeps the sitting', async ({ page }) => {
    test.setTimeout(45_000);
    await enterEcho(page, 'six', 7);
    await waitForRepeat(page);
    expect(await ringBack(page)).toMatch(/^(clean|listen)$/);
    await waitForRepeat(page);
    expect((await echoState(page)).line).toHaveLength(4);

    await expect(page.getByTestId('echo-new')).toBeVisible();
    await page.getByTestId('echo-new').click();
    await expect.poll(() => echoState(page).then((s) => s.line.length)).toBe(3);
    const fresh = await echoState(page);
    expect(fresh.missesInRow).toBe(0);
    expect(fresh.sitting.clean).toBe(1);
    await waitForRepeat(page);
    expect((await echoState(page)).line).toEqual(fresh.tune.slice(0, 3));
  });

  test('a tap while the room is playing the line does nothing', async ({ page }) => {
    test.setTimeout(45_000);
    await enterEcho(page, 'six');
    // Strike in the same task that reads the phase, so the room cannot move on to 'repeat' between the check and the tap.
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            if (window.__palace!.echo.state().phase !== 'listen') return false;
            const el = document.querySelector<HTMLElement>('[data-testid="echo-bell-1"]')!;
            el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0, pointerType: 'touch' }));
            return true;
          }),
        { timeout: 15_000 },
      )
      .toBe(true);
    const s = await echoState(page);
    expect(s.sitting.slips).toBe(0);
    expect(s.phase).not.toBe('slip');
    expect(s.done).toBe(0);
    expect(['listen', 'repeat']).toContain(s.phase);
  });

  test('progress persists across a reload', async ({ page }) => {
    test.setTimeout(45_000);
    await enterEcho(page, 'four');
    await waitForRepeat(page);
    expect(await ringBack(page)).toMatch(/^(clean|listen)$/);
    await expect.poll(() => page.evaluate(() => window.__palace!.echo.state().sitting.clean)).toBe(1);
    const before = await echoStage(page, 'four');
    expect(before.best).toBeGreaterThanOrEqual(3);
    expect(await page.evaluate(() => window.localStorage.getItem('palace.echo.v1'))).not.toBeNull();

    await page.reload();
    await page.waitForFunction(() => !!window.__palace);
    await expect(page.getByTestId('attract')).toBeVisible();
    await page.getByTestId('attract-begin').click();
    if ((await page.evaluate(() => window.__palace!.screen())) === 'primer') await page.getByTestId('primer-skip').click();
    await expect(page.getByTestId('hub')).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.__palace!.screen())).toBe('hub');

    const after = await echoStage(page, 'four');
    expect(after.best).toBe(before.best);
    expect(after.bells).toBe(before.bells);
  });
});
