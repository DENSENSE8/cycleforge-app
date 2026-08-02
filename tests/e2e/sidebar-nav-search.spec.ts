import { test, expect, type Page } from '@playwright/test';

/**
 * Spine search — type-to-jump.
 *
 * The defect this covers: the footer filter matched pages and modes but the
 * root only ever RENDERED section drill buttons, so typing a destination's
 * exact name handed back a category that did not contain the word. The unit
 * tests (`src/lib/nav/nav-destinations.test.ts`) pin the matcher against the
 * live registry; this pins the half that was actually broken — what reaches the
 * screen, and whether it can be operated.
 *
 * Model: **tree at rest, flat while searching.** A query replaces the section
 * map with a ranked list of destinations (pages AND modes), each carrying its
 * parent as metadata. Clearing restores the map.
 */

const NAV_COLUMN = '[data-sidebar-nav-column]';
const SIDEBAR_TOGGLE = 'header button';
const SECTION_MAP = `${NAV_COLUMN} [role="group"][aria-label="Sections"]`;
const RESULTS = `${NAV_COLUMN} [role="listbox"][aria-label="Matching destinations"]`;
const FILTER = `${NAV_COLUMN} input`;

/** `TechRailSearchBar` debounces at 250ms before it lifts the value. */
const FILTER_DEBOUNCE_MS = 250;

async function openSpine(page: Page) {
  await page.goto('/reports', { waitUntil: 'domcontentloaded' });
  await page.locator('main').first().waitFor({ state: 'visible', timeout: 45_000 });
  await page.waitForTimeout(3_000);
  await page.locator(SIDEBAR_TOGGLE).first().click();
  await expect(page.locator(`${NAV_COLUMN}[data-open="true"]`)).toBeVisible();
  await expect(page.locator(SECTION_MAP)).toBeVisible();
}

/**
 * Type, then wait for the BODY to settle rather than for a duration.
 *
 * `TechRailSearchBar` debounces, so the results the operator (and the Enter
 * handler) act on lag the keystrokes. Sleeping past the debounce is a race —
 * it failed on Enter while passing on the slower assertions in the same file.
 * Waiting on the rendered outcome is the deterministic form.
 */
async function type(page: Page, query: string) {
  await page.locator(FILTER).fill(query);
  if (query.trim()) {
    await expect(page.locator(RESULTS)).toBeVisible({ timeout: 5_000 });
  } else {
    await expect(page.locator(SECTION_MAP)).toBeVisible({ timeout: 5_000 });
  }
  // The listbox mounts with the query; the debounce still owns which rows are
  // in it, so settle once more before acting on a specific row.
  await page.waitForTimeout(FILTER_DEBOUNCE_MS + 250);
}

test.describe('spine search — the query returns destinations, not categories', () => {
  test.skip(({ isMobile }) => Boolean(isMobile));

  test('at rest the body is the section map', async ({ page }) => {
    await openSpine(page);
    await expect(page.locator(SECTION_MAP)).toBeVisible();
    await expect(page.locator(RESULTS)).toHaveCount(0);
  });

  test('the screenshot case: "incoming" returns Incoming, not the Inbound category', async ({
    page,
  }) => {
    await openSpine(page);
    await type(page, 'incoming');

    // The hierarchy is gone — this is the flatten.
    await expect(page.locator(SECTION_MAP)).toHaveCount(0);
    await expect(page.locator(RESULTS)).toBeVisible();

    // The FIRST row is the destination the operator named. Previously the only
    // row was a category button reading "Inbound", which does not contain the
    // typed word at all.
    const first = page.locator(`${RESULTS} [role="option"]`).first();
    await expect(first).toContainText('Incoming');
    // …carrying its parent as metadata, so flattening does not lose the map.
    await expect(first).toContainText(/Inbound/i);
  });

  test('the matched characters are marked', async ({ page }) => {
    await openSpine(page);
    await type(page, 'incom');

    // Highlight offsets come from the shared matcher, so the marked span is the
    // reason the row matched — not a client-side re-search.
    const hit = page.locator(`${RESULTS} [role="option"] span.underline`).first();
    await expect(hit).toHaveText(/incom/i);
  });

  test('clicking a result navigates to that destination', async ({ page }) => {
    await openSpine(page);
    await type(page, 'incoming');

    await page.locator(`${RESULTS} [role="option"]`).first().click();
    await expect.poll(() => new URL(page.url()).pathname).toBe('/incoming');
  });

  test('Enter opens the top result without touching the mouse', async ({ page }) => {
    await openSpine(page);
    await type(page, 'incoming');
    // Act on a row that is actually on screen, not on a timer.
    await expect(page.locator(`${RESULTS} [role="option"]`).first()).toBeVisible();

    await page.locator(FILTER).press('Enter');
    await expect.poll(() => new URL(page.url()).pathname).toBe('/incoming');
  });

  test('ArrowDown moves the cursor through the results', async ({ page }) => {
    await openSpine(page);
    await type(page, 'in');

    const options = page.locator(`${RESULTS} [role="option"]`);
    await expect(options.first()).toHaveAttribute('aria-selected', 'true');

    await page.locator(FILTER).press('ArrowDown');
    await expect(options.first()).toHaveAttribute('aria-selected', 'false');
    await expect(options.nth(1)).toHaveAttribute('aria-selected', 'true');
  });

  test('a no-match names the query back instead of going blank', async ({ page }) => {
    await openSpine(page);
    await type(page, 'zzzzqqq');

    await expect(page.locator(RESULTS)).toContainText('No destination matches');
    await expect(page.locator(RESULTS)).toContainText('zzzzqqq');
  });

  test('clearing the query restores the section map', async ({ page }) => {
    await openSpine(page);
    await type(page, 'incoming');
    await expect(page.locator(RESULTS)).toBeVisible();

    await type(page, '');
    await expect(page.locator(SECTION_MAP)).toBeVisible();
    await expect(page.locator(RESULTS)).toHaveCount(0);
  });

  test('every result is an addressable destination, never a drill button', async ({ page }) => {
    await openSpine(page);
    await type(page, 'in');

    // A drill button carries the "Open {section}" accessible name. None may
    // appear in the result list — that is the whole defect.
    await expect(page.locator(`${RESULTS} [aria-label^="Open "]`)).toHaveCount(0);
    await expect(page.locator(`${RESULTS} [role="option"]`).first()).toBeVisible();
  });
});
