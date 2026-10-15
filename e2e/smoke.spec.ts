import { type Page, expect, test } from '@playwright/test';

type Pos = { string: number; fret: number };

async function skipIntro(page: Page) {
  await expect(page.getByTestId('onboarding')).toBeVisible();
  await page.getByTestId('onboarding-skip').click();
  await expect(page.getByTestId('onboarding')).toBeHidden();
}

async function waitForFrames(page: Page, n = 10) {
  await expect.poll(() => page.evaluate(() => window.__palace!.render().frames), { timeout: 30_000 }).toBeGreaterThan(n);
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
      { timeout: 20_000 },
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
  await skipIntro(page);
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
  await skipIntro(page);
  await waitForFrames(page);
  expect(await page.evaluate(() => window.__palace!.drill())).toBe('name');
  const first = await page.evaluate(() => window.__palace!.question());
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
  await skipIntro(page);
  await waitForFrames(page);
  await page.getByTestId('drill-find').click();
  expect(await page.evaluate(() => window.__palace!.drill())).toBe('find');
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

test('toggles left-handed mode (mirrors the neck, persists)', async ({ page }) => {
  await skipIntro(page);
  await waitForFrames(page);
  const probe = { string: 0, fret: 3 };
  const before = await settledProjection(page, probe);
  const width = page.viewportSize()!.width;

  await page.getByTestId('settings-open').click();
  const toggle = page.getByTestId('toggle-left-handed');
  await expect(toggle).not.toBeChecked();
  await page.getByText('Left-handed').click();
  await expect(toggle).toBeChecked();
  await page.getByTestId('settings-close').click();
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
  await expect(page.getByTestId('onboarding')).toBeHidden();
});
