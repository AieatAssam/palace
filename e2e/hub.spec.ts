import { type Page, expect, test } from '@playwright/test';

const ROOMS = ['fretboard', 'echo', 'blocks', 'faces', 'ledger', 'nback'] as const;
const WORKSHOP_ROOMS = ['blocks', 'faces', 'ledger', 'nback'] as const;
const DAY = 86_400_000;

/** Seed the fretboard save before the app loads, once per tab (a reload keeps the player's own data). */
async function seed(page: Page, save: string) {
  await page.addInitScript((s) => {
    if (sessionStorage.getItem('palace.seeded')) return;
    sessionStorage.setItem('palace.seeded', '1');
    localStorage.setItem('palace.fretboard.v1', s);
  }, save);
}

/** Title → (primer on a first visit, skipped) → hub. */
async function enterHub(page: Page) {
  await expect(page.getByTestId('attract')).toBeVisible();
  await page.getByTestId('attract-begin').click();
  if ((await page.evaluate(() => window.__palace!.screen())) === 'primer') await page.getByTestId('primer-skip').click();
  await expect(page.getByTestId('attract')).toBeHidden();
  await expect(page.getByTestId('hub')).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__palace!.screen())).toBe('hub');
}

/** Hub → Fretboard's stage card (the card is open until a cell is chosen). */
async function openStages(page: Page) {
  const room = page.getByTestId('room-fretboard');
  await expect(room).toHaveClass(/placed/);
  await room.click();
  await expect(page.getByTestId('stages')).toBeVisible();
}

/** Switch book if needed, then choose a stage cell (the card closes). */
async function chooseCell(page: Page, id: string) {
  const book = id.startsWith('acc-') ? 'book-accidentals' : 'book-naturals';
  const bookBtn = page.getByTestId(book);
  await expect(bookBtn).toHaveClass(/placed/);
  if ((await bookBtn.getAttribute('aria-checked')) !== 'true') await bookBtn.click();
  await expect(bookBtn).toHaveAttribute('aria-checked', 'true');
  const cell = page.getByTestId(`stage-${id}`);
  await expect(cell).toHaveClass(/placed/);
  await cell.click();
  await expect(page.getByTestId('stages')).toBeHidden();
  await expect.poll(() => page.evaluate(() => window.__palace!.stage().id)).toBe(id);
}

/** Title → hub → the stage card → a stage → play. */
async function enterPlay(page: Page, stageId = 'nat-s0') {
  await enterHub(page);
  await openStages(page);
  await chooseCell(page, stageId);
  await expect.poll(() => page.evaluate(() => window.__palace!.screen())).toBe('play');
}

/** Click the correct note. With `settle`, wait until the next question has arrived (~700ms later). */
async function answerCorrect(page: Page, settle = true) {
  const q = await page.evaluate(() => window.__palace!.question());
  const answer = (await page.evaluate(() => window.__palace!.answer())) as string;
  await page.locator(`button[data-note="${answer}"]`).click();
  if (settle) await expect.poll(() => page.evaluate(() => window.__palace!.question().itemId)).not.toBe(q.itemId);
}

/** Click a note that is not the answer. */
async function answerWrong(page: Page) {
  const answer = (await page.evaluate(() => window.__palace!.answer())) as string;
  const wrong = answer === 'C' ? 'D' : 'C';
  await page.locator(`button[data-note="${wrong}"]`).click();
}

test('the hub loads with every room', async ({ page }) => {
  await page.goto('./');
  await enterHub(page);
  await expect(page.getByTestId('hub')).toBeVisible();
  await expect(page.locator('[data-testid^="room-"]')).toHaveCount(6);

  for (const id of ROOMS) {
    const room = page.getByTestId(`room-${id}`);
    await expect(room).toHaveClass(/placed/);
    const box = (await room.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
  }
  await expect(page.getByTestId('room-fretboard')).toHaveAccessibleName(/Fretboard/);
  await expect(page.getByTestId('room-echo')).toHaveAccessibleName(/Echo/);
  await expect(page.getByTestId('room-blocks')).toHaveAccessibleName(/workshop/);

  const modes = await page.evaluate(() => window.__palace!.modes());
  expect(modes).toHaveLength(6);
  expect(modes.filter((m) => m.open).map((m) => m.id)).toEqual(['fretboard', 'echo']);
});

test('workshop rooms open a placeholder and come back', async ({ page }) => {
  await page.goto('./');
  await enterHub(page);

  await expect(page.getByTestId('room-blocks')).toHaveClass(/placed/);
  await page.getByTestId('room-blocks').click();
  await expect(page.getByTestId('workshop')).toBeVisible();
  expect(await page.evaluate(() => window.__palace!.hubCard())).toBe('workshop:blocks');
  await expect(page.getByTestId('workshop-back')).toHaveClass(/placed/);
  await page.getByTestId('workshop-back').click();
  await expect(page.getByTestId('workshop')).toBeHidden();
  await expect(page.getByTestId('hub')).toBeVisible();

  await expect(page.getByTestId('room-nback')).toHaveClass(/placed/);
  await page.getByTestId('room-nback').click();
  await expect(page.getByTestId('workshop')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('workshop')).toBeHidden();
  await expect(page.getByTestId('hub')).toBeVisible();
});

test('no room is gated: every workshop placeholder and the stage cards open', async ({ page }) => {
  // Six cards slide in and out, each on a CPU rasteriser: more than the default budget.
  test.setTimeout(120_000);
  await page.goto('./');
  await enterHub(page);

  for (const id of WORKSHOP_ROOMS) {
    await expect(page.getByTestId(`room-${id}`)).toHaveClass(/placed/);
    await page.getByTestId(`room-${id}`).click();
    await expect(page.getByTestId('workshop')).toBeVisible();
    expect(await page.evaluate(() => window.__palace!.hubCard())).toBe(`workshop:${id}`);
    await expect(page.getByTestId('workshop-back')).toHaveClass(/placed/);
    await page.getByTestId('workshop-back').click();
    await expect(page.getByTestId('workshop')).toBeHidden();
    await expect(page.getByTestId('hub')).toBeVisible();
  }

  await openStages(page);
  await expect(page.getByTestId('stages-close')).toBeVisible();
  await page.getByTestId('stages-close').click();
  await expect(page.getByTestId('stages')).toBeHidden();
  await expect(page.getByTestId('hub')).toBeVisible();
});

test('pick Fretboard and a stage from the hub', async ({ page }) => {
  await page.goto('./');
  await enterHub(page);

  await openStages(page);
  await expect(page.getByTestId('stage-nat-s1')).toHaveClass(/placed/);
  await page.getByTestId('stage-nat-s1').click();
  await expect(page.getByTestId('stages')).toBeHidden();
  await expect.poll(() => page.evaluate(() => window.__palace!.screen())).toBe('play');
  expect(await page.evaluate(() => window.__palace!.stage().id)).toBe('nat-s1');
  expect(await page.evaluate(() => window.__palace!.mode())).toBe('fretboard');

  await expect(page.getByTestId('hub-open')).toBeVisible();
  await page.getByTestId('hub-open').click();
  await expect(page.getByTestId('hub')).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__palace!.screen())).toBe('hub');

  await openStages(page);
  await page.getByTestId('book-accidentals').click();
  await expect(page.getByTestId('book-accidentals')).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('stage-acc-s0')).toHaveClass(/placed/);
  await page.getByTestId('stage-acc-s0').click();
  await expect(page.getByTestId('stages')).toBeHidden();
  await expect.poll(() => page.evaluate(() => window.__palace!.screen())).toBe('play');
  await expect.poll(() => page.evaluate(() => window.__palace!.stage().id)).toBe('acc-s0');
});

test('rewards update after correct answers', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('./');
  await enterPlay(page, 'nat-s0');
  await expect(page.getByTestId('combo')).toHaveAttribute('role', 'meter');
  const baseline = (await page.evaluate(() => window.__palace!.rewards())).daily.items;

  let fifthItem = '';
  for (let i = 1; i <= 5; i++) {
    fifthItem = await page.evaluate(() => window.__palace!.question().itemId);
    // The fifth answer is checked before the next question arrives, while the flourish is still up.
    await answerCorrect(page, i < 5);
    await expect.poll(() => page.evaluate(() => window.__palace!.rewards().streak)).toBe(i);
    await expect(page.getByTestId('combo')).toHaveAttribute('aria-valuenow', String(i % 5));
  }

  const r = await page.evaluate(() => window.__palace!.rewards());
  expect(r.flourish).not.toBeNull();
  expect(r.flourish!.word).toBe('Bravo');
  expect(r.flourish!.streak).toBe(5);
  expect(r.burstId).toBeGreaterThan(0);
  await expect(page.getByTestId('flourish')).toBeVisible();
  await expect(page.getByTestId('flourish')).toContainText('Bravo');
  await expect.poll(() => page.evaluate(() => window.__palace!.rewards().daily.items)).toBe(baseline + 5);
  expect((await page.evaluate(() => window.__palace!.rewards())).daily.bestStreak).toBeGreaterThanOrEqual(5);

  // Let the fifth question come round before answering again.
  await expect.poll(() => page.evaluate(() => window.__palace!.question().itemId)).not.toBe(fifthItem);
  const before = await page.evaluate(() => window.__palace!.rewards());
  await answerWrong(page);
  await expect.poll(() => page.evaluate(() => window.__palace!.rewards().streak)).toBe(0);
  await expect(page.getByTestId('combo')).toHaveAttribute('aria-valuenow', '0');
  const after = await page.evaluate(() => window.__palace!.rewards());
  expect(after.daily.items).toBe(before.daily.items + 1);
  expect(after.daily.bestStreak).toBe(before.daily.bestStreak);
  const items = after.daily.items;

  // The record persists: after a reload and Continue, the hub shows the same count.
  await page.reload();
  await expect(page.getByTestId('attract')).toBeVisible();
  await page.getByTestId('attract-begin').click();
  await expect(page.getByTestId('hub')).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__palace!.rewards().daily.items)).toBe(items);
  await expect(page.getByTestId('hub-record')).toContainText(`${items} answered`);
});

test('a mastered stage presses a wax seal', async ({ page }) => {
  test.setTimeout(90_000);
  const now = Date.now();
  // The low E string, frets 0–12: seven items perfect and well learned, and f5 weak and due.
  const deck: Record<string, unknown> = {};
  for (const f of [0, 1, 3, 5, 7, 8, 10, 12]) {
    const id = `name:s0f${f}`;
    deck[id] =
      f === 5
        ? { id, ease: 2.5, interval: 60_000, reps: 2, lapses: 0, seen: 3, correct: 3, due: now - 1000, last: now - 70_000, avgMs: 1500 }
        : { id, ease: 2.5, interval: 4 * DAY, reps: 4, lapses: 0, seen: 4, correct: 4, due: now + 4 * DAY, last: now - 70_000, avgMs: 1500 };
  }
  const save = JSON.stringify({
    deck,
    stageId: 'nat-s0',
    modeId: 'fretboard',
    settings: { leftHanded: false, sound: false, haptics: false, reduceMotion: false },
    onboarded: true,
  });
  await seed(page, save);
  await page.goto('./');
  await enterPlay(page, 'nat-s0');

  for (let i = 0; i < 4; i++) {
    if (await page.evaluate(() => window.__palace!.rewards().seal)) break;
    await answerCorrect(page);
  }
  await expect.poll(() => page.evaluate(() => window.__palace!.rewards().seal)).not.toBeNull();
  const seal = (await page.evaluate(() => window.__palace!.rewards().seal))!;
  expect(seal.title).toContain('Low E string');
  await expect(page.getByTestId('seal-caption')).toBeVisible();
  await expect(page.getByTestId('seal-caption')).toContainText('Mastered');
  expect(await page.evaluate(() => window.__palace!.stages().find((s) => s.id === 'nat-s0')!.mastered)).toBe(true);
});

test('reduced motion: the flourish still shows, without travel', async ({ page }) => {
  test.setTimeout(90_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('./');
  await enterPlay(page, 'nat-s0');

  for (let i = 1; i <= 5; i++) await answerCorrect(page, i < 5);
  const flourish = page.getByTestId('flourish');
  await expect(flourish).toBeVisible();
  await expect(flourish).toContainText('Bravo');
  const animationName = await flourish.evaluate((el) => getComputedStyle(el).animationName);
  expect(animationName).toBe('none');
});
