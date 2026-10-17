import { type Page, expect, test } from '@playwright/test';

/** Title → (primer on a first visit, skipped) → hub. */
async function enterHub(page: Page) {
  await expect(page.getByTestId('attract')).toBeVisible();
  await page.getByTestId('attract-begin').click();
  if ((await page.evaluate(() => window.__palace!.screen())) === 'primer') await page.getByTestId('primer-skip').click();
  await expect(page.getByTestId('attract')).toBeHidden();
  await expect(page.getByTestId('hub')).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__palace!.screen())).toBe('hub');
}

/** Choose an Echo stage: from the hub (room-echo opens its card) or from play (stages-open). The card closes on choice. */
async function pickStage(page: Page, id: string) {
  const screen = await page.evaluate(() => window.__palace!.screen());
  const opener = screen === 'hub' ? page.getByTestId('room-echo') : page.getByTestId('stages-open');
  await expect(opener).toHaveClass(/placed/);
  await opener.click();
  await expect(page.getByTestId('stages')).toBeVisible();
  const cell = page.getByTestId(`echo-stage-${id}`);
  await expect(cell).toHaveClass(/placed/);
  await cell.click();
  await expect(page.getByTestId('stages')).toBeHidden();
  await expect.poll(() => page.evaluate(() => window.__palace!.echo.state().stage.id)).toBe(id);
  await expect.poll(() => page.evaluate(() => window.__palace!.screen())).toBe('play');
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

/** Bells that are rung in order by a Playwright keyboard press, for the same loop as ringBack. */
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

test.describe('Echo', () => {
  test('a clean line lengthens by one and the next line keeps the old prefix', async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto('./');
    await enterHub(page);
    await pickStage(page, 'six');
    await waitForRepeat(page);

    const first = await echoState(page);
    expect(first.line).toHaveLength(3);
    expect(first.stage.bells).toBe(6);

    expect(await ringBack(page)).toMatch(/^(clean|listen)$/);
    await expect.poll(() => page.evaluate(() => window.__palace!.echo.state().phase)).toMatch(/^(clean|listen)$/);
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

  test('bell buttons are at least 44px, on screen, and barely overlapping (four, six, eight)', async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto('./');
    await enterHub(page);
    const viewport = page.viewportSize()!;

    for (const id of ['four', 'six', 'eight']) {
      await pickStage(page, id);
      const n = (await echoState(page)).stage.bells;
      await expect.poll(() => page.evaluate(() => window.__palace!.echo.bells().length)).toBe(n);
      for (let i = 1; i <= n; i++) await expect(page.getByTestId(`echo-bell-${i}`)).toHaveClass(/placed/);

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
    }
  });

  test('keyboard: the number keys ring back a reversed line', async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto('./');
    await enterHub(page);
    await pickStage(page, 'reverse');
    await waitForRepeat(page);

    const s = await echoState(page);
    expect(s.stage.order).toBe('reverse');
    expect(s.expected.map((x) => x[0])).toEqual([...s.line.map((x) => x[0])].reverse());

    expect(await ringBackByKeys(page)).toMatch(/^(clean|listen)$/);
    await expect.poll(() => page.evaluate(() => window.__palace!.echo.state().sitting.clean)).toBe(1);
    expect((await page.evaluate(() => window.__palace!.rewards())).streak).toBe(1);
  });

  test('chord stage: both bells of a pair, in either order, count as one step', async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto('./');
    await enterHub(page);
    await pickStage(page, 'chord');

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
      await expect.poll(() => page.evaluate(() => window.__palace!.echo.state().phase)).toMatch(/^(clean|listen)$/);
    }
    // Each clean line rung back is counted once, however many bells a step had.
    const s = await echoState(page);
    expect(s.sitting.clean).toBe(cleanLines);
    expect(s.sitting.slips).toBe(0);
    expect(sawPair).toBe(true);
  });

  test('three slips end the sitting; Again starts over; End then Leave goes to the hub', async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto('./');
    await enterHub(page);
    await pickStage(page, 'six');
    const prompt = page.getByTestId('prompt');
    const slips = page.getByTestId('echo-slips');
    const sheet = page.getByTestId('session-sheet');

    for (let i = 1; i <= 3; i++) {
      await waitForRepeat(page);
      const wanted = await page.evaluate(() => window.__palace!.echo.next());
      const n = (await echoState(page)).stage.bells;
      const wrong = Array.from({ length: n }, (_, k) => k + 1).find((b) => !wanted.includes(b))!;
      await page.getByTestId(`echo-bell-${wrong}`).click();

      await expect(prompt).toHaveText('Not that bell.');
      await expect(slips).toHaveAttribute('aria-label', `${i} of 3 slips`);
      expect((await page.evaluate(() => window.__palace!.rewards())).streak).toBe(0);
    }

    await expect(sheet).toBeVisible();
    expect((await echoState(page)).sitting.slips).toBe(3);

    // Again: a fresh sitting, back on the bells.
    await expect(page.getByTestId('session-again')).toHaveClass(/placed/);
    await page.getByTestId('session-again').click();
    await expect(sheet).toBeHidden();
    await expect.poll(() => page.evaluate(() => window.__palace!.screen())).toBe('play');
    await waitForRepeat(page);
    expect((await echoState(page)).sitting.slips).toBe(0);

    // End, then Leave returns to the hub.
    await page.getByTestId('session-end').click();
    await expect(sheet).toBeVisible();
    await expect(page.getByTestId('session-leave')).toHaveClass(/placed/);
    await page.getByTestId('session-leave').click();
    await expect(page.getByTestId('hub')).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.__palace!.screen())).toBe('hub');
    await expect(page.getByTestId('room-echo')).toHaveAccessibleName(/of 6 mastered/);
  });

  test('a tap while the room is playing the line does nothing', async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto('./');
    await enterHub(page);
    await pickStage(page, 'six');
    await expect.poll(() => page.evaluate(() => window.__palace!.echo.state().phase)).toBe('listen');

    await page.getByTestId('echo-bell-1').click();
    const s = await echoState(page);
    expect(s.sitting.slips).toBe(0);
    expect(s.phase).not.toBe('slip');
    expect(s.done).toBe(0);
    expect(['listen', 'repeat']).toContain(s.phase);
  });

  test('progress persists across a reload', async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto('./');
    await enterHub(page);
    await pickStage(page, 'four');
    await waitForRepeat(page);
    expect(await ringBack(page)).toMatch(/^(clean|listen)$/);
    await expect.poll(() => page.evaluate(() => window.__palace!.echo.state().sitting.clean)).toBe(1);
    const before = await echoStage(page, 'four');
    expect(before.best).toBeGreaterThanOrEqual(3);

    await page.reload();
    await expect(page.getByTestId('attract')).toBeVisible();
    await page.getByTestId('attract-begin').click();
    await expect(page.getByTestId('hub')).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.__palace!.screen())).toBe('hub');

    const after = await echoStage(page, 'four');
    expect(after.best).toBe(before.best);
    expect(after.bells).toBe(before.bells);
  });
});
