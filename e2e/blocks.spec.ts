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

/** Walk straight into Blocks play on a stage, from any screen (fast path for every test but the UI one). */
async function enterBlocks(page: Page, stageId: string) {
  await page.goto('./');
  await page.waitForFunction(() => !!window.__palace);
  await page.evaluate((id) => window.__palace!.blocks.enter(id), stageId);
  await expect.poll(() => page.evaluate(() => window.__palace!.screen()), { timeout: 15_000 }).toBe('play');
  await expect.poll(() => page.evaluate(() => window.__palace!.blocks.state().stage.id), { timeout: 15_000 }).toBe(stageId);
  await expect.poll(() => page.evaluate(() => window.__palace!.mode()), { timeout: 15_000 }).toBe('blocks');
}

/** Wait until the board has lit the line and handed it to the player. */
async function waitForRecall(page: Page) {
  await expect.poll(() => page.evaluate(() => window.__palace!.blocks.state().phase), { timeout: 15_000 }).toBe('recall');
}

/** Tap the line back by clicking the block the line still wants, one block at a time. Returns the phase it stopped in. */
async function tapBack(page: Page) {
  for (let guard = 0; guard < 300; guard++) {
    const phase = await page.evaluate(() => window.__palace!.blocks.state().phase);
    if (phase !== 'recall') return phase;
    const want = await page.evaluate(() => window.__palace!.blocks.next());
    if (want === null) {
      await page.waitForTimeout(50);
      continue;
    }
    await page.getByTestId(`block-${want}`).click();
  }
  throw new Error('the line never finished');
}

const blocksState = (page: Page) => page.evaluate(() => window.__palace!.blocks.state());
const blocksStage = (page: Page, id: string) => page.evaluate((s) => window.__palace!.blocks.stages().find((x) => x.id === s)!, id);
const rectsOf = (page: Page) => page.evaluate(() => window.__palace!.blocks.rects());

test.describe('Blocks', () => {
  test('from the title, through the hub and stage card, into a three-block line', async ({ page }) => {
    test.setTimeout(45_000);
    await page.goto('./');
    await enterHub(page);

    const room = page.getByTestId('room-blocks');
    await expect(room).toHaveClass(/placed/);
    await room.click();
    const cell = page.getByTestId('blocks-stage-span');
    await expect(cell).toHaveClass(/placed/);
    await cell.click();
    await expect(page.getByTestId('stages')).toBeHidden();

    await expect.poll(() => page.evaluate(() => window.__palace!.screen())).toBe('play');
    await expect.poll(() => page.evaluate(() => window.__palace!.blocks.state().stage.id)).toBe('span');
    await expect.poll(() => page.evaluate(() => window.__palace!.mode())).toBe('blocks');
    await waitForRecall(page);
    const s = await blocksState(page);
    expect(s.line).toHaveLength(3);
    expect(new Set(s.line).size).toBe(3);
  });

  test('a clean line lengthens by one and the next line is longer', async ({ page }) => {
    test.setTimeout(45_000);
    await enterBlocks(page, 'span');
    await waitForRecall(page);
    const first = await blocksState(page);
    expect(first.line).toHaveLength(3);

    expect(await tapBack(page)).toBe('clean');
    const after = await blocksState(page);
    expect(after.sitting.clean).toBe(1);
    expect(after.sitting.lines).toBe(1);

    expect((await blocksStage(page, 'span')).best).toBeGreaterThanOrEqual(3);
    const r = await page.evaluate(() => window.__palace!.rewards());
    expect(r.streak).toBe(1);
    expect(r.daily.items).toBeGreaterThanOrEqual(1);

    await waitForRecall(page);
    const next = await blocksState(page);
    expect(next.line).toHaveLength(4);
    expect(new Set(next.line).size).toBe(4);
  });

  for (const id of ['span', 'twelve', 'sixteen']) {
    test(`block buttons are at least 44px, on screen, and barely overlapping (${id})`, async ({ page }) => {
      test.setTimeout(45_000);
      await enterBlocks(page, id);
      const viewport = page.viewportSize()!;
      const n = (await blocksState(page)).stage.blocks;
      await expect.poll(() => rectsOf(page).then((r) => r.length), { timeout: 15_000 }).toBe(n);

      // Measure only once the camera has finished its dolly; mid-move rects are not where the blocks will stay.
      await expect.poll(() => page.evaluate(() => window.__palace!.cameraSettled()), { timeout: 15_000 }).toBe(true);
      const rects = await rectsOf(page);
      expect(rects).toHaveLength(n);
      for (const r of rects) {
        expect.soft(r.w, `${id} block ${r.block} width`).toBeGreaterThanOrEqual(44);
        expect.soft(r.h, `${id} block ${r.block} height`).toBeGreaterThanOrEqual(44);
        expect.soft(r.x, `${id} block ${r.block} left edge`).toBeGreaterThanOrEqual(0);
        expect.soft(r.y, `${id} block ${r.block} top edge`).toBeGreaterThanOrEqual(0);
        expect.soft(r.x + r.w, `${id} block ${r.block} right edge`).toBeLessThanOrEqual(viewport.width);
        expect.soft(r.y + r.h, `${id} block ${r.block} bottom edge`).toBeLessThanOrEqual(viewport.height);
      }
      for (let i = 0; i < rects.length; i++) {
        for (let j = i + 1; j < rects.length; j++) {
          const a = rects[i]!;
          const b = rects[j]!;
          const ix = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
          const iy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
          const ratio = (ix * iy) / Math.min(a.w * a.h, b.w * b.h);
          expect.soft(ratio, `${id}: blocks ${a.block} and ${b.block} overlap`).toBeLessThanOrEqual(0.1);
        }
      }
    });
  }

  test('backward recall: the line is tapped back last first, and a clean line counts', async ({ page }) => {
    test.setTimeout(45_000);
    await enterBlocks(page, 'reverse');
    await waitForRecall(page);

    const s = await blocksState(page);
    expect(s.stage.order).toBe('reverse');
    expect(s.expected).toEqual([...s.line].reverse());
    await expect(page.getByTestId('prompt')).toHaveText('Tap them back, last first.');

    expect(await tapBack(page)).toBe('clean');
    await expect.poll(() => page.evaluate(() => window.__palace!.blocks.state().sitting.clean)).toBe(1);
    expect((await page.evaluate(() => window.__palace!.rewards())).streak).toBe(1);
  });

  test('keyboard: arrows move focus between blocks; Enter, Space and the number keys tap them back', async ({ page }) => {
    test.setTimeout(45_000);
    await enterBlocks(page, 'span');
    await waitForRecall(page);
    expect((await blocksState(page)).stage.blocks).toBe(9);

    // Arrow keys move focus to a different block (by screen position).
    const first = page.getByTestId('block-1');
    await first.focus();
    await expect(first).toBeFocused();
    const moved = new Set<string | undefined>();
    for (const key of ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp']) {
      await page.keyboard.press(key);
      const block = await page.evaluate(() => (document.activeElement as HTMLElement | null)?.dataset.block);
      if (block !== undefined) moved.add(block);
    }
    expect([...moved].some((b) => b !== '0')).toBe(true);

    // Line 1 (three blocks): focus each wanted block and press Enter, then Space.
    let press: 'Enter' | 'Space' = 'Enter';
    for (let step = 0; step < 3; step++) {
      await waitForRecall(page);
      const want = await page.evaluate(() => window.__palace!.blocks.next());
      expect(want).not.toBeNull();
      await page.getByTestId(`block-${want}`).focus();
      await page.keyboard.press(press);
      press = press === 'Enter' ? 'Space' : 'Enter';
    }
    await expect.poll(() => page.evaluate(() => window.__palace!.blocks.state().sitting.clean)).toBe(1);

    // Line 2 (four blocks): tapped back with the number keys.
    await waitForRecall(page);
    expect((await blocksState(page)).line).toHaveLength(4);
    for (let step = 0; step < 4; step++) {
      await expect.poll(() => page.evaluate(() => window.__palace!.blocks.next())).not.toBeNull();
      const want = await page.evaluate(() => window.__palace!.blocks.next());
      await page.keyboard.press(String(want));
    }
    await expect.poll(() => page.evaluate(() => window.__palace!.blocks.state().sitting.clean)).toBe(2);
    expect((await blocksState(page)).sitting.slips).toBe(0);
  });

  test('a wrong block is a slip; three slips end the sitting; Again starts over; End then Leave goes to the hub', async ({ page }) => {
    // Three lines shown and missed, a slip pause each, and two card slides: the longest test here.
    test.setTimeout(75_000);
    await enterBlocks(page, 'span');
    const sheet = page.getByTestId('session-sheet');

    for (let i = 1; i <= 3; i++) {
      await waitForRecall(page);
      const wanted = await page.evaluate(() => window.__palace!.blocks.next());
      const n = (await blocksState(page)).stage.blocks;
      const wrong = Array.from({ length: n }, (_, k) => k + 1).find((b) => b !== wanted)!;
      await page.getByTestId(`block-${wrong}`).click();

      await expect.poll(() => page.evaluate(() => window.__palace!.blocks.state().sitting.slips)).toBe(i);
      await expect(page.getByTestId('prompt')).toHaveText('Not that block.');
      await expect(page.getByTestId('blocks-slips')).toHaveAttribute('aria-label', /\d of 3 slips/);
      expect((await page.evaluate(() => window.__palace!.rewards())).streak).toBe(0);
    }

    await expect(sheet).toBeVisible();
    expect((await blocksState(page)).sitting.slips).toBe(3);

    // Again: a fresh sitting, back on the blocks.
    await expect(page.getByTestId('session-again')).toHaveClass(/placed/);
    await page.getByTestId('session-again').click();
    await expect(sheet).toBeHidden();
    await expect.poll(() => page.evaluate(() => window.__palace!.screen())).toBe('play');
    await waitForRecall(page);
    expect((await blocksState(page)).sitting.slips).toBe(0);

    // End, then Leave returns to the hub.
    await page.getByTestId('session-end').click();
    await expect(sheet).toBeVisible();
    await expect(page.getByTestId('session-leave')).toHaveClass(/placed/);
    await page.getByTestId('session-leave').click();
    await expect(page.getByTestId('hub')).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.__palace!.screen())).toBe('hub');
  });

  test('a moving board is laid out afresh for each line and its blocks stay tappable', async ({ page }) => {
    test.setTimeout(45_000);
    await enterBlocks(page, 'shifting');
    await waitForRecall(page);
    const seedBefore = (await blocksState(page)).seed;

    expect(await tapBack(page)).toBe('clean');
    await waitForRecall(page);
    const after = await blocksState(page);
    expect(after.seed).not.toBe(seedBefore);

    // The rects refill on the next frame after each re-render, so poll for them before reading.
    await expect.poll(() => rectsOf(page).then((r) => r.length), { timeout: 15_000 }).toBe(9);
    await expect.poll(() => page.evaluate(() => window.__palace!.cameraSettled()), { timeout: 15_000 }).toBe(true);
    const viewport = page.viewportSize()!;
    const rects = await rectsOf(page);
    expect(rects).toHaveLength(9);
    for (const r of rects) {
      expect.soft(r.w, `block ${r.block} width`).toBeGreaterThanOrEqual(44);
      expect.soft(r.h, `block ${r.block} height`).toBeGreaterThanOrEqual(44);
      expect.soft(r.x, `block ${r.block} left edge`).toBeGreaterThanOrEqual(0);
      expect.soft(r.y, `block ${r.block} top edge`).toBeGreaterThanOrEqual(0);
      expect.soft(r.x + r.w, `block ${r.block} right edge`).toBeLessThanOrEqual(viewport.width);
      expect.soft(r.y + r.h, `block ${r.block} bottom edge`).toBeLessThanOrEqual(viewport.height);
    }
  });

  test('a tap while the board is lighting the line does nothing', async ({ page }) => {
    test.setTimeout(45_000);
    await enterBlocks(page, 'span');
    // Strike in the same task that reads the phase, so the board cannot move on to 'recall' between the check and the tap.
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            if (window.__palace!.blocks.state().phase !== 'show') return false;
            const el = document.querySelector<HTMLElement>('[data-testid="block-1"]')!;
            el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0, pointerType: 'touch' }));
            return true;
          }),
        { timeout: 15_000 },
      )
      .toBe(true);
    const s = await blocksState(page);
    expect(s.sitting.slips).toBe(0);
    expect(s.sitting.lines).toBe(0);
    expect(s.phase).not.toBe('slip');
    expect(s.done).toBe(0);
    expect(['show', 'recall']).toContain(s.phase);
  });

  test('progress persists across a reload', async ({ page }) => {
    test.setTimeout(45_000);
    await enterBlocks(page, 'span');
    await waitForRecall(page);
    expect(await tapBack(page)).toBe('clean');
    await expect.poll(() => page.evaluate(() => window.__palace!.blocks.state().sitting.clean)).toBe(1);
    const before = await blocksStage(page, 'span');
    expect(before.best).toBeGreaterThanOrEqual(3);
    expect(await page.evaluate(() => window.localStorage.getItem('palace.blocks.v1'))).not.toBeNull();

    await page.reload();
    await page.waitForFunction(() => !!window.__palace);
    await expect(page.getByTestId('attract')).toBeVisible();
    await page.getByTestId('attract-begin').click();
    if ((await page.evaluate(() => window.__palace!.screen())) === 'primer') await page.getByTestId('primer-skip').click();
    await expect(page.getByTestId('hub')).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.__palace!.screen())).toBe('hub');

    const after = await blocksStage(page, 'span');
    expect(after.best).toBe(before.best);
    expect(after.mastery).toBe(before.mastery);
    expect((await page.evaluate(() => window.__palace!.blocks.bestSpan())).forward).toBeGreaterThanOrEqual(3);
  });

  test('the stage card opens from play and switches the board to sixteen blocks', async ({ page }) => {
    test.setTimeout(45_000);
    await enterBlocks(page, 'span');
    await waitForRecall(page);

    await page.getByTestId('stages-open').click();
    const card = page.getByTestId('stages');
    await expect(card).toBeVisible();
    await expect(page.getByTestId('blocks-stage-sixteen')).toHaveClass(/placed/);
    await page.getByTestId('blocks-stage-sixteen').click();
    await expect(card).toBeHidden();

    await expect.poll(() => page.evaluate(() => window.__palace!.blocks.state().stage.id)).toBe('sixteen');
    await expect.poll(() => rectsOf(page).then((r) => r.length), { timeout: 15_000 }).toBe(16);
  });
});
