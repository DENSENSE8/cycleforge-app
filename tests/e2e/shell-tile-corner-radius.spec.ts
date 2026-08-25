import { test, expect, type Page } from '@playwright/test';

/**
 * THE TILE'S CORNER SURVIVES EVERY STATE (HANDOFF-session-composer-ux §6,
 * pinned the X1 way — a mounted DOM test on computed style, never a regex
 * over source text).
 *
 * The suspects the handoff named are dead: the legacy `.tile` block was a
 * dead selector and is deleted; the universal `border-radius: var(--r-none)`
 * reset lives in `layer(shell)`, which Tailwind's `utilities` layer beats,
 * so `Tile.tsx`'s `rounded-lg` wins. MEASURED on :3051 (2026-08-25):
 * 8px idle AND 8px focused, with the 2px accent ring (`outline` at -2px
 * offset) following the curve — outline hugs the curved border box in
 * Chromium. This spec keeps that true: a re-ordered layer, a resurrected
 * reset, or a ring drawn with something that squares the corner fails here.
 *
 * The Help tile is the vehicle because it opens from one rail click with no
 * data dependency; the assertion is about the SHELL's tile frame, which is
 * the same component under every tile body.
 */

test.skip(({ isMobile }) => !!isMobile, 'desktop shell only');

const TILE = '[data-id][data-type]';

function radiusPx(v: string): number {
  // "8px" or "8px 8px 8px 8px" — take the first corner.
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

async function readTile(page: Page) {
  return page.locator(TILE).first().evaluate((el) => {
    const cs = getComputedStyle(el);
    return {
      borderRadius: cs.borderRadius,
      outlineStyle: cs.outlineStyle,
      outlineWidth: cs.outlineWidth,
      outlineOffset: cs.outlineOffset,
    };
  });
}

test.beforeEach(async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.locator('.feed-entry').waitFor({ state: 'visible' });
  await page.getByRole('button', { name: /^Help/ }).click();
  await page.locator(TILE).first().waitFor({ state: 'visible' });
});

test('a tile keeps a non-zero corner radius at idle', async ({ page }) => {
  const idle = await readTile(page);
  expect(radiusPx(idle.borderRadius)).toBeGreaterThan(0);
});

test('the focused ring follows the curve — radius survives, ring is 2px inset', async ({
  page,
}) => {
  // Sloppy focus: entering the tile focuses it (Tile.tsx onMouseEnter).
  await page.locator(TILE).first().hover();

  const focused = await readTile(page);
  // The corner must not square when the state changes — this is the §6 bug.
  expect(radiusPx(focused.borderRadius)).toBeGreaterThan(0);
  // And the state must actually be the focused one, or the assertion above
  // proved nothing: 2px solid ring, inset so it never nudges layout (M3).
  expect(focused.outlineStyle).toBe('solid');
  expect(focused.outlineWidth).toBe('2px');
  expect(focused.outlineOffset).toBe('-2px');
});
