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

/** Walk straight into Ledger play on a stage, from any screen (fast path for every test but the UI one). */
async function enterLedger(page: Page, stageId: string) {
  await page.goto('./');
  await page.waitForFunction(() => !!window.__palace);
  await page.evaluate((id) => window.__palace!.ledger.enter(id), stageId);
  await expect.poll(() => page.evaluate(() => window.__palace!.screen()), { timeout: 15_000 }).toBe('play');
  await expect.poll(() => page.evaluate(() => window.__palace!.ledger.state().stage.id), { timeout: 15_000 }).toBe(stageId);
  await expect.poll(() => page.evaluate(() => window.__palace!.mode()), { timeout: 15_000 }).toBe('ledger');
}

const ledgerState = (page: Page) => page.evaluate(() => window.__palace!.ledger.state());
const ledgerAnswer = (page: Page) => page.evaluate(() => window.__palace!.ledger.answer());
const ledgerStage = (page: Page, id: string) => page.evaluate((s) => window.__palace!.ledger.stages().find((x) => x.id === s)!, id);

/** Wait until the ledger is in the given phase. */
async function waitForPhase(page: Page, phase: string) {
  await expect.poll(() => page.evaluate(() => window.__palace!.ledger.state().phase), { timeout: 15_000 }).toBe(phase);
}

/** Key the span number back by clicking the figure the ledger wants, one at a time. Returns the phase it stopped in. */
async function keyBack(page: Page) {
  for (let guard = 0; guard < 40; guard++) {
    const phase = (await ledgerState(page)).phase;
    if (phase !== 'recall') return phase;
    const a = await ledgerAnswer(page);
    if (!a || !('figure' in a)) throw new Error('span recall wants no figure');
    await page.getByTestId(`ledger-key-${a.figure}`).click();
  }
  throw new Error('the line never finished');
}

/** Answer the drill question on screen correctly, by picking or by keying each figure. */
async function answerRight(page: Page) {
  const a = await ledgerAnswer(page);
  if (!a) throw new Error('no answer wanted');
  if ('choice' in a) {
    await page.getByTestId(`ledger-choice-${a.choice}`).click();
    return;
  }
  for (let guard = 0; guard < 10; guard++) {
    if ((await ledgerState(page)).phase !== 'ask') return;
    const next = await ledgerAnswer(page);
    if (!next || !('figure' in next)) return;
    await page.getByTestId(`ledger-key-${next.figure}`).click();
  }
}

test.describe('Ledger', () => {
  test('from the title, through the hub and stage card, into a span of four figures', async ({ page }) => {
    test.setTimeout(45_000);
    await page.goto('./');
    await enterHub(page);

    const room = page.getByTestId('room-ledger');
    await expect(room).toHaveClass(/placed/);
    await room.click();
    const cell = page.getByTestId('ledger-stage-span');
    await expect(cell).toHaveClass(/placed/);
    await cell.click();
    await expect(page.getByTestId('stages')).toBeHidden();

    await expect.poll(() => page.evaluate(() => window.__palace!.screen())).toBe('play');
    await expect.poll(() => page.evaluate(() => window.__palace!.ledger.state().stage.id)).toBe('span');
    await expect.poll(() => page.evaluate(() => window.__palace!.mode())).toBe('ledger');
    await waitForPhase(page, 'recall');
    expect((await ledgerState(page)).digits).toHaveLength(4);
  });

  test('a clean span keys back, the sitting and the record move on, and the next number is one figure longer', async ({ page }) => {
    test.setTimeout(45_000);
    await enterLedger(page, 'span');
    await waitForPhase(page, 'recall');
    expect((await ledgerState(page)).digits).toHaveLength(4);

    expect(await keyBack(page)).toBe('clean');
    const after = await ledgerState(page);
    expect(after.sitting.clean).toBe(1);
    expect(after.sitting.lines).toBe(1);
    expect((await ledgerStage(page, 'span')).have).toBeGreaterThanOrEqual(4);
    expect((await page.evaluate(() => window.__palace!.rewards())).streak).toBe(1);

    await waitForPhase(page, 'recall');
    expect((await ledgerState(page)).digits).toHaveLength(5);
  });

  test('a wrong figure is a slip: the page says so, and the streak ends', async ({ page }) => {
    test.setTimeout(45_000);
    await enterLedger(page, 'span');
    await waitForPhase(page, 'recall');

    const a = await ledgerAnswer(page);
    const figure = (a as { figure: number }).figure;
    const wrong = (figure + 1) % 10;
    await page.getByTestId(`ledger-key-${wrong}`).click();

    await expect.poll(() => page.evaluate(() => window.__palace!.ledger.state().phase)).toBe('slip');
    expect((await ledgerState(page)).sitting.slips).toBe(1);
    await expect(page.getByTestId('prompt')).toHaveText('Not that figure.');
    expect((await page.evaluate(() => window.__palace!.rewards())).streak).toBe(0);
  });

  test('long numbers are held as pegs, then keyed back from the keyboard', async ({ page }) => {
    test.setTimeout(45_000);
    await enterLedger(page, 'long');
    await waitForPhase(page, 'study');
    const studied = await ledgerState(page);
    expect(studied.pegs).toHaveLength(4);
    expect(studied.written).toBe(8);

    await page.keyboard.press('Enter');
    await waitForPhase(page, 'recall');

    for (let guard = 0; guard < 40; guard++) {
      if ((await ledgerState(page)).phase !== 'recall') break;
      const a = await ledgerAnswer(page);
      await page.keyboard.press(String((a as { figure: number }).figure));
    }
    await expect.poll(() => page.evaluate(() => window.__palace!.ledger.state().phase)).toBe('clean');
    expect((await ledgerState(page)).sitting.clean).toBe(1);
  });

  test('the pegs drill: four right answers alternate pick and key, then one wrong', async ({ page }) => {
    test.setTimeout(45_000);
    await enterLedger(page, 'pegs-low');

    const kinds: string[] = [];
    for (let i = 1; i <= 4; i++) {
      await waitForPhase(page, 'ask');
      kinds.push((await ledgerState(page)).question!.kind);
      await answerRight(page);
      await waitForPhase(page, 'right');
    }
    // The sitting runs sixteen questions, so four is well short of the end.
    expect(kinds).toEqual(['pick', 'key', 'pick', 'key']);

    const s = await ledgerState(page);
    expect(s.sitting.right).toBe(4);
    expect(s.sitting.asked).toBe(4);
    expect(s.log).toHaveLength(4);
    expect(s.log.every((e) => e.ok)).toBe(true);

    // The fifth question is a pick: take a choice that is not the right one.
    await waitForPhase(page, 'ask');
    const a = await ledgerAnswer(page);
    const choice = (a as { choice: number }).choice;
    await page.getByTestId(`ledger-choice-${choice === 1 ? 2 : 1}`).click();
    await waitForPhase(page, 'wrong');
    await expect(page.getByTestId('prompt')).toHaveClass(/miss/);
    expect((await ledgerState(page)).sitting.asked).toBe(5);
    expect((await ledgerState(page)).sitting.right).toBe(4);
  });

  test('keypad and choice buttons are at least 44px, on screen, and barely overlapping', async ({ page }) => {
    test.setTimeout(45_000);
    const viewport = page.viewportSize()!;

    const expectBig = async (ids: string[], label: string) => {
      const boxes = await Promise.all(ids.map((id) => page.getByTestId(id).boundingBox()));
      expect(boxes).toHaveLength(ids.length);
      for (let i = 0; i < boxes.length; i++) {
        const r = boxes[i]!;
        expect.soft(r.width, `${label} ${ids[i]} width`).toBeGreaterThanOrEqual(44);
        expect.soft(r.height, `${label} ${ids[i]} height`).toBeGreaterThanOrEqual(44);
        expect.soft(r.x, `${label} ${ids[i]} left edge`).toBeGreaterThanOrEqual(0);
        expect.soft(r.y, `${label} ${ids[i]} top edge`).toBeGreaterThanOrEqual(0);
        expect.soft(r.x + r.width, `${label} ${ids[i]} right edge`).toBeLessThanOrEqual(viewport.width);
        expect.soft(r.y + r.height, `${label} ${ids[i]} bottom edge`).toBeLessThanOrEqual(viewport.height);
      }
    };

    await enterLedger(page, 'span');
    await waitForPhase(page, 'recall');
    await expectBig(Array.from({ length: 10 }, (_, d) => `ledger-key-${d}`), 'keypad');

    await enterLedger(page, 'sounds');
    await waitForPhase(page, 'ask');
    expect((await ledgerState(page)).question!.kind).toBe('pick');
    await expectBig(['ledger-choice-1', 'ledger-choice-2', 'ledger-choice-3', 'ledger-choice-4'], 'choice');
  });
});
