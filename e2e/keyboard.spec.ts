import { type Page, expect, test } from '@playwright/test';

type Pos = { string: number; fret: number };
type Key = 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown';

/** Straight into Fretboard play on a stage from a fresh load: skips the title, primer, hub and stage card. */
async function enterFretboard(page: Page, stageId: string) {
  await page.goto('./');
  await page.waitForFunction(() => !!window.__palace);
  await page.evaluate((id) => window.__palace!.fretboard.enter(id), stageId);
  await expect.poll(() => page.evaluate(() => window.__palace!.screen()), { timeout: 15_000 }).toBe('play');
  await expect.poll(() => page.evaluate(() => window.__palace!.stage().id), { timeout: 15_000 }).toBe(stageId);
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

const ARROW_KEYS: Key[] = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'];
const DIRECTION: Record<Key, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
const key = (p: Pos) => `${p.string}/${p.fret}`;

/**
 * Walk the cursor to `target` with the arrow keys. An arrow moves the frame to the neighbour
 * most nearly in its direction on screen, so before each press this predicts where each arrow
 * lands and presses the one that lands on the neighbour nearest the target (a plain dominant-axis
 * press can bounce between two cells). Projections are read again each step, so a phone's
 * window can pan; after each press the real cursor is checked against the prediction in the next step.
 */
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
    // The arrow's landing place, as the app's rule has it: the neighbour best aligned with the arrow, if any.
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
    // Nothing predicted: press the dominant screen axis toward the target.
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

test('Find-all by keyboard: walk to each target, pick it, grade the question', async ({ page }) => {
  test.setTimeout(60_000);
  await enterFretboard(page, 'nat-find');
  expect(await page.evaluate(() => window.__palace!.drill())).toBe('find');
  await focusNeck(page);
  const said = page.getByTestId('neck-said');

  // The first arrow press shows the frame moving and names the place.
  const start = await cursorPos(page);
  await page.keyboard.press('ArrowRight');
  expect(await cursorPos(page)).not.toEqual(start);
  await expect(said).toHaveText(/string/);

  const skipped: Pos[] = [];
  const unreached: string[] = [];
  for (let n = 0; n < 60; n++) {
    if ((await page.evaluate(() => window.__palace!.session().answered)) >= 1) break;
    const remaining = (await page.evaluate(() => window.__palace!.answer())) as Pos[];
    const target = remaining.find((t) => !skipped.some((s) => same(s, t)));
    if (!target) break;
    try {
      await walkTo(page, target);
    } catch (e) {
      skipped.push(target);
      unreached.push(`${JSON.stringify(target)}: ${(e as Error).message}`);
      continue;
    }
    const before = (await page.evaluate(() => window.__palace!.found())).length;
    // Enter and Space both pick; alternate them.
    await page.keyboard.press(n % 2 ? ' ' : 'Enter');
    await expect
      .poll(() =>
        page.evaluate((b) => window.__palace!.found().length > b || window.__palace!.session().answered === 1, before),
      )
      .toBe(true);
    await expect(said).toHaveText(/Found/);
  }
  expect(unreached, 'targets the cursor could not reach').toEqual([]);
  await expect.poll(() => page.evaluate(() => window.__palace!.session())).toMatchObject({ answered: 1, correct: 1 });
});

test('Find-all by keyboard: a non-target is not there, and the question stays open', async ({ page }) => {
  test.setTimeout(60_000);
  await enterFretboard(page, 'nat-find');
  await focusNeck(page);
  const said = page.getByTestId('neck-said');

  const { positions, targets } = await page.evaluate(() => ({
    positions: window.__palace!.positions().map((p) => ({ string: p.string, fret: p.fret })),
    targets: window.__palace!.answer() as Pos[],
  }));
  const miss = positions.find((p) => !targets.some((t) => same(t, p)));
  expect(miss, 'a position in the region that is not a target').toBeDefined();
  await walkTo(page, miss!);
  await page.keyboard.press('Enter');
  await expect(said).toHaveText('Not there.');
  expect(await page.evaluate(() => window.__palace!.session())).toMatchObject({ answered: 0, correct: 0 });
  expect(await page.evaluate(() => window.__palace!.question().kind)).toBe('find');
  expect(await page.evaluate(() => window.__palace!.answer())).toHaveLength(targets.length);
});

test('octaves by keyboard: the frame starts on the lit note, then each octave is picked', async ({ page }) => {
  test.setTimeout(60_000);
  await enterFretboard(page, 'nat-oct');
  await expect.poll(() => page.evaluate(() => window.__palace!.question().kind)).toBe('octave');
  const lit = (await page.evaluate(() => window.__palace!.question())) as { kind: 'octave'; position: Pos };
  await focusNeck(page);
  expect(await cursorPos(page)).toEqual({ string: lit.position.string, fret: lit.position.fret });

  const said = page.getByTestId('neck-said');
  await page.keyboard.press('Enter');
  await expect(said).toHaveText(/lit note/);

  for (let n = 0; n < 20; n++) {
    if ((await page.evaluate(() => window.__palace!.session().correct)) >= 1) break;
    const remaining = (await page.evaluate(() => window.__palace!.answer())) as Pos[];
    const target = remaining[0];
    if (!target) break;
    await walkTo(page, target);
    const before = (await page.evaluate(() => window.__palace!.found())).length;
    await page.keyboard.press(n % 2 ? ' ' : 'Enter');
    await expect
      .poll(() =>
        page.evaluate((b) => window.__palace!.found().length > b || window.__palace!.session().correct === 1, before),
      )
      .toBe(true);
  }
  await expect.poll(() => page.evaluate(() => window.__palace!.session().correct)).toBe(1);
});

test('the neck is reached with Tab, is named, and a tap on the canvas puts its frame away', async ({ page }) => {
  test.setTimeout(60_000);
  await enterFretboard(page, 'nat-find');
  await waitForSettledCamera(page);

  const focusedTestId = () => page.evaluate(() => document.activeElement?.getAttribute('data-testid') ?? null);
  let reached = false;
  for (let i = 0; i < 15 && !reached; i++) {
    if ((await focusedTestId()) === 'neck-keys') reached = true;
    else await page.keyboard.press('Tab');
  }
  if (!reached) reached = (await focusedTestId()) === 'neck-keys';
  expect(reached, 'neck-keys reached with Tab within 15 presses').toBe(true);

  const neck = page.getByTestId('neck-keys');
  await expect(neck).toBeFocused();
  await expect(neck).toHaveAccessibleName(/Guitar neck/);
  await expect.poll(() => page.evaluate(() => window.__palace!.neckCursor().shown)).toBe(true);

  const box = (await page.locator('canvas').boundingBox())!;
  await tapAt(page, box.x + box.width / 2, box.y + box.height / 2);
  await expect.poll(() => page.evaluate(() => window.__palace!.neckCursor().shown)).toBe(false);
});

test('a focused HUD button keeps its keys: ArrowRight does not move the neck cursor', async ({ page }) => {
  test.setTimeout(60_000);
  await enterFretboard(page, 'nat-find');
  await focusNeck(page);
  const before = await cursorPos(page);
  expect(before).not.toBeNull();

  const skip = page.getByTestId('find-skip');
  await skip.focus();
  await expect(skip).toBeFocused();
  await page.keyboard.press('ArrowRight');
  expect(await cursorPos(page)).toEqual(before);
});
