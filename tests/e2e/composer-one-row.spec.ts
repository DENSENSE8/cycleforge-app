import { test, expect, type Page } from '@playwright/test';

/**
 * THE COMPOSER IS ONE ROW.
 *
 * Regression coverage for the 2026-08-25 ruling: the leading `+`, the one
 * field, and send sit on a single row inside the composer well, and the
 * composer itself is pinned to the BOTTOM of its pane.
 *
 * Two real defects this pins, both of which shipped and both of which were
 * invisible to a classname assertion:
 *
 *  1. MISALIGNMENT. `.occ-editor` carried `min-height: 44px` with 8px of
 *     vertical padding, so a single 20.3px line (14px x 1.45) sat at the TOP
 *     of a 44px box with ~16px of dead space beneath it. `.feed-entry`
 *     bottom-aligns its children, so `+` and send landed in that gap —
 *     measured 8px below the text's own centre line. The fix was to make the
 *     box hug one line (28px), so the three items share a centre because
 *     they are the same height, not because three alignment rules agree.
 *
 *  2. COMPOSER PINNED TO THE TOP. `.feed-composer` lost `margin-top: auto`
 *     on the reasoning that `.feed-scroll` is `flex: 1` and always absorbs
 *     the slack. It does — but `AssistantFeed` renders the scroller
 *     CONDITIONALLY (`feed.length === 0 ? null : …`), so on an empty feed
 *     nothing took the slack and the composer sat at the top of the pane.
 *     That is the first thing every operator sees, which is exactly why the
 *     empty state is asserted here first.
 *
 * Measures live geometry, never classnames — the bug was a computed-layout
 * bug and a class assertion would have passed throughout.
 */

test.skip(({ isMobile }) => !!isMobile, 'desktop shell only');

const ENTRY = '.feed-entry';
const COMPOSER = '.feed-composer';
const PANE = '.pane-composer';
const EDITOR = '.feed-entry [contenteditable="true"], .feed-entry textarea';

/** Centre-Y and height of a locator, in viewport px. */
async function metrics(page: Page, selector: string) {
  const box = await page.locator(selector).first().boundingBox();
  if (!box) throw new Error(`no box for ${selector}`);
  return { centerY: box.y + box.height / 2, height: box.height, x: box.x, right: box.x + box.width };
}

test.beforeEach(async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.locator(ENTRY).waitFor({ state: 'visible' });
});

test('the composer sits at the bottom of its pane on an EMPTY feed', async ({ page }) => {
  // The scroller must genuinely be absent — otherwise this asserts nothing.
  await expect(page.locator('.feed-scroll')).toHaveCount(0);

  const pane = await page.locator(PANE).boundingBox();
  const composer = await page.locator(COMPOSER).boundingBox();
  if (!pane || !composer) throw new Error('missing pane/composer');

  const gapBelow = pane.y + pane.height - (composer.y + composer.height);
  const gapAbove = composer.y - pane.y;

  expect(gapBelow).toBeLessThan(24);
  // Proves it is pinned rather than merely short: most of the pane is above it.
  expect(gapAbove).toBeGreaterThan(gapBelow * 4);
});

test('the composer stays at the bottom once the feed has turns', async ({ page }) => {
  const editor = page.locator(EDITOR).first();
  await editor.click();
  await editor.fill('regression turn');
  await editor.press('Enter');

  await expect(page.locator('.feed-scroll')).toHaveCount(1);

  const pane = await page.locator(PANE).boundingBox();
  const composer = await page.locator(COMPOSER).boundingBox();
  if (!pane || !composer) throw new Error('missing pane/composer');

  expect(pane.y + pane.height - (composer.y + composer.height)).toBeLessThan(24);
  // With the scroller mounted, flexbox resolves flexible lengths before auto
  // margins, so the margin must compute to zero rather than double-pushing.
  await expect(page.locator(COMPOSER)).toHaveCSS('margin-top', '0px');
});

test('plus, field and send share one row inside the well', async ({ page }) => {
  const buttons = page.locator(`${ENTRY} [data-slot="button"]`);
  await expect(buttons).toHaveCount(2);

  const plus = await metrics(page, `${ENTRY} [data-slot="button"] >> nth=0`);
  const send = await metrics(page, `${ENTRY} [data-slot="button"] >> nth=1`);
  const field = await metrics(page, EDITOR);

  // The defect was 8px. One row means sub-pixel agreement, not "close".
  expect(Math.abs(plus.centerY - field.centerY)).toBeLessThanOrEqual(1);
  expect(Math.abs(plus.centerY - send.centerY)).toBeLessThanOrEqual(1);

  // Order: plus is leading, send is trailing, field between them.
  expect(plus.right).toBeLessThanOrEqual(field.x + 1);
  expect(field.right).toBeLessThanOrEqual(send.x + 1);

  // And the row is genuinely one line tall — not two stacked.
  const entry = await metrics(page, ENTRY);
  expect(entry.height).toBeLessThan(field.height + 12);
});

test('the two buttons are the message controls; tools and ring live outside', async ({ page }) => {
  await expect(page.locator(`${ENTRY} [aria-label="Send"]`)).toHaveCount(1);
  await expect(page.locator(`${ENTRY} .context-ring`)).toHaveCount(0);
  await expect(page.locator('.composer-row .context-ring')).toHaveCount(1);
});

test('the context ring is a hollow ring, not a filled dot', async ({ page }) => {
  const dot = page.locator('.context-ring-dot');
  await expect(dot).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(dot).toHaveCSS('border-radius', '50%');
  const width = await dot.evaluate((el) => parseFloat(getComputedStyle(el).borderTopWidth));
  expect(width).toBeGreaterThanOrEqual(2);
});
