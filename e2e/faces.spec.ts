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

/** Walk straight into Faces play on a stage, from any screen (fast path for every test but the UI one). */
async function enterFaces(page: Page, stageId: string) {
  await page.goto('./');
  await page.waitForFunction(() => !!window.__palace);
  await page.evaluate((id) => window.__palace!.faces.enter(id), stageId);
  await expect.poll(() => page.evaluate(() => window.__palace!.screen()), { timeout: 15_000 }).toBe('play');
  await expect.poll(() => page.evaluate(() => window.__palace!.mode()), { timeout: 15_000 }).toBe('faces');
  await expect.poll(() => page.evaluate(() => window.__palace!.faces.state().stage.id), { timeout: 15_000 }).toBe(stageId);
}

const facesState = (page: Page) => page.evaluate(() => window.__palace!.faces.state());
const phaseOf = (page: Page) => page.evaluate(() => window.__palace!.faces.state().phase);

/** Turn the page through the cast until the questions begin (or the pause, on the asked-later stage). */
async function meetAll(page: Page) {
  for (let guard = 0; guard < 12; guard++) {
    const before = await facesState(page);
    if (before.phase !== 'meet') return;
    await page.getByTestId('faces-next').click();
    await expect
      .poll(async () => {
        const now = await facesState(page);
        return now.phase !== 'meet' || now.meeting !== before.meeting;
      })
      .toBe(true);
  }
  throw new Error('still meeting the cast');
}

/** Answer the current question right or wrong, by the control its kind shows. Returns once the phase has moved on from 'ask'. */
async function answerOne(page: Page, right: boolean) {
  await expect.poll(() => phaseOf(page)).toBe('ask');
  const q = (await facesState(page)).question!;
  const n = right ? q.answer : [1, 2, 3, 4].find((c) => c !== q.answer)!;
  if (q.kind === 'face') {
    const portrait = page.getByTestId(`faces-portrait-${n}`);
    await expect(portrait).toHaveClass(/placed/);
    await portrait.click();
  } else {
    await page.getByTestId(`faces-choice-${n}`).click();
  }
  await expect.poll(() => phaseOf(page)).not.toBe('ask');
}

test.describe('Faces', () => {
  test('from the title, through the hub and stage card, into a sitting on four', async ({ page }) => {
    test.setTimeout(45_000);
    await page.goto('./');
    await enterHub(page);

    const room = page.getByTestId('room-faces');
    await expect(room).toHaveClass(/placed/);
    await room.click();
    const cell = page.getByTestId('faces-stage-four');
    await expect(cell).toHaveClass(/placed/);
    await cell.click();

    await expect.poll(() => page.evaluate(() => window.__palace!.screen())).toBe('play');
    await expect.poll(() => page.evaluate(() => window.__palace!.mode())).toBe('faces');
    const s = await facesState(page);
    expect(s.phase).toBe('meet');
    expect(s.stage.id).toBe('four');
  });

  test('meeting walks the cast', async ({ page }) => {
    test.setTimeout(45_000);
    await enterFaces(page, 'four');

    expect((await facesState(page)).meeting).toBe(0);
    await expect(page.getByTestId('faces-back')).toBeDisabled();
    const portrait = page.getByTestId('faces-portrait');
    await expect(portrait).toBeAttached();
    await expect(portrait).toContainText('ground');

    await page.getByTestId('faces-next').click();
    await expect.poll(async () => (await facesState(page)).meeting).toBe(1);
    await expect(page.getByTestId('faces-back')).toBeEnabled();

    await page.getByTestId('faces-back').click();
    await expect.poll(async () => (await facesState(page)).meeting).toBe(0);

    await meetAll(page);
    await expect.poll(() => phaseOf(page)).toBe('ask');
  });

  test('a right answer scores; a wrong one is a slip and breaks the run', async ({ page }) => {
    test.setTimeout(45_000);
    await enterFaces(page, 'four');
    await meetAll(page);

    await answerOne(page, true);
    let s = await facesState(page);
    expect(s.phase).toBe('right');
    expect(s.sitting.right).toBe(1);
    expect((await page.evaluate(() => window.__palace!.rewards())).streak).toBe(1);
    await expect.poll(async () => (await facesState(page)).phase).toBe('ask');
    expect((await facesState(page)).sitting.asked).toBe(1);

    await answerOne(page, false);
    s = await facesState(page);
    expect(s.phase).toBe('wrong');
    expect(s.sitting.slips).toBe(1);
    expect((await page.evaluate(() => window.__palace!.rewards())).streak).toBe(0);
  });

  test('a full sitting on four ends in the session sheet, and Again starts over', async ({ page }) => {
    test.setTimeout(45_000);
    await enterFaces(page, 'four');
    await meetAll(page);

    for (let i = 0; i < 8; i++) await answerOne(page, true);

    await expect.poll(() => page.evaluate(() => window.__palace!.screen()), { timeout: 20_000 }).toBe('session');
    await expect(page.getByTestId('session-sheet')).toBeVisible();
    const four = (await page.evaluate(() => window.__palace!.faces.stages())).find((st) => st.id === 'four')!;
    expect(four.known).toBeGreaterThan(0);

    await expect(page.getByTestId('session-again')).toHaveClass(/placed/);
    await page.getByTestId('session-again').click();
    await expect.poll(() => phaseOf(page)).toBe('meet');
    expect((await facesState(page)).sitting.asked).toBe(0);
  });

  test('the trades stage asks a trade within its first three questions', async ({ page }) => {
    test.setTimeout(45_000);
    await enterFaces(page, 'trades');
    await meetAll(page);

    const kinds: string[] = [];
    for (let i = 0; i < 3; i++) {
      await expect.poll(() => phaseOf(page)).toBe('ask');
      kinds.push((await facesState(page)).question!.kind);
      await answerOne(page, true);
    }
    expect(kinds).toContain('trade');
  });

  test('the eight stage has eight unique sitters, and four unique choices', async ({ page }) => {
    test.setTimeout(45_000);
    await enterFaces(page, 'eight');

    const cast = (await facesState(page)).cast;
    expect(cast).toHaveLength(8);
    expect(new Set(cast.map((c) => c.name)).size).toBe(8);

    await meetAll(page);
    await expect.poll(() => phaseOf(page)).toBe('ask');
    const { choices } = (await facesState(page)).question!;
    expect(new Set(choices).size).toBe(4);
    for (const c of choices) {
      expect(c).toBeGreaterThanOrEqual(0);
      expect(c).toBeLessThanOrEqual(7);
    }
  });

  test('the asked-later stage pauses after the cast, then asks when the pause ends', async ({ page }) => {
    test.setTimeout(45_000);
    await enterFaces(page, 'delayed');
    await meetAll(page);

    await expect.poll(() => phaseOf(page)).toBe('pause');
    await page.evaluate(() => window.__palace!.faces.endPause());
    await expect.poll(() => phaseOf(page)).toBe('ask');
  });

  test('on a face question the four portrait buttons are large, on screen and barely overlapping', async ({ page }) => {
    test.setTimeout(45_000);
    await enterFaces(page, 'four');
    await meetAll(page);

    // Kinds alternate name, face on four: answer right until a face question comes round.
    for (let guard = 0; guard < 4; guard++) {
      await expect.poll(() => phaseOf(page)).toBe('ask');
      if ((await facesState(page)).question!.kind === 'face') break;
      await answerOne(page, true);
    }
    await expect.poll(() => phaseOf(page)).toBe('ask');
    expect((await facesState(page)).question!.kind).toBe('face');

    await expect.poll(() => page.evaluate(() => window.__palace!.cameraSettled()), { timeout: 15_000 }).toBe(true);
    await expect.poll(() => page.evaluate(() => window.__palace!.faces.rects().length), { timeout: 15_000 }).toBe(4);
    // The frames ease from the single portrait's place into the row: wait until they stand still.
    let last = '';
    const settled = async () => {
      const rects = await page.evaluate(() => window.__palace!.faces.rects());
      const now = JSON.stringify(rects.map((r) => [Math.round(r.x), Math.round(r.y), Math.round(r.w), Math.round(r.h)]));
      const still = now === last;
      last = now;
      return still;
    };
    await expect.poll(settled, { timeout: 15_000, intervals: [250] }).toBe(true);
    const viewport = page.viewportSize()!;
    const rects = await page.evaluate(() => window.__palace!.faces.rects());

    for (const r of rects) {
      expect.soft(r.w, `portrait ${r.slot} width`).toBeGreaterThanOrEqual(44);
      expect.soft(r.h, `portrait ${r.slot} height`).toBeGreaterThanOrEqual(44);
      expect.soft(r.x, `portrait ${r.slot} left edge`).toBeGreaterThanOrEqual(0);
      expect.soft(r.y, `portrait ${r.slot} top edge`).toBeGreaterThanOrEqual(0);
      expect.soft(r.x + r.w, `portrait ${r.slot} right edge`).toBeLessThanOrEqual(viewport.width);
      expect.soft(r.y + r.h, `portrait ${r.slot} bottom edge`).toBeLessThanOrEqual(viewport.height);
    }
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i]!;
        const b = rects[j]!;
        const ix = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
        const iy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
        const ratio = (ix * iy) / Math.min(a.w * a.h, b.w * b.h);
        expect.soft(ratio, `portraits ${a.slot} and ${b.slot} overlap`).toBeLessThanOrEqual(0.1);
      }
    }
  });

  test('keys: the arrows walk the cast, and a digit answers the question', async ({ page }) => {
    test.setTimeout(45_000);
    await enterFaces(page, 'four');

    await page.keyboard.press('ArrowRight');
    await expect.poll(async () => (await facesState(page)).meeting).toBe(1);

    for (let guard = 0; guard < 4 && (await phaseOf(page)) === 'meet'; guard++) {
      await page.keyboard.press('ArrowRight');
    }
    await expect.poll(() => phaseOf(page)).toBe('ask');

    const answer = (await page.evaluate(() => window.__palace!.faces.answer()))!;
    await page.keyboard.press(String(answer));
    await expect.poll(() => phaseOf(page)).toBe('right');
    expect((await facesState(page)).sitting.right).toBe(1);
  });

  test('casts are stable across reloads', async ({ page }) => {
    test.setTimeout(45_000);
    await enterFaces(page, 'four');
    const before = (await facesState(page)).cast.map((c) => c.name);
    expect(before).toHaveLength(4);

    await page.reload();
    await page.waitForFunction(() => !!window.__palace);
    await enterFaces(page, 'four');
    const after = (await facesState(page)).cast.map((c) => c.name);
    expect(after).toEqual(before);
  });
});
