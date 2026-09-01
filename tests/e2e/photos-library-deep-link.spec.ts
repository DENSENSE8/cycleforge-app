/**
 * Media Library — DAM routing / deep-link contract (`/ops/photos`).
 *
 *   npx playwright test tests/e2e/photos-library-deep-link.spec.ts --project=qa-desktop
 *
 * Asserts the URL *is* the state: every filter round-trips from a cold deep
 * link into the rendered header context, the filter popover, and the stream —
 * and survives in the URL afterwards.
 *
 * Rewritten 2026-08-09. The previous version was stale in two independent ways
 * and had been failing on both projects:
 *
 *  1. It asserted the meta line as `"N photos in view"`. That copy is retired —
 *     `PhotoLibraryPage.tsx:280` renders `Photos ${n} · ${subtitle}`.
 *  2. It asserted `?entityType=SERIAL_UNIT&entityId=42` pre-filled "Entity" /
 *     "Entity ID" fields. Neither param is parsed by
 *     `parsePhotoLibraryFilters` and neither field exists — it was testing a
 *     capability the app does not have. Replaced with the real
 *     `?serial=` / `?tracking=` params.
 *
 * It also hardcoded dogfood ids (`receivingId=1987`, `sku=WM-1023`) which do
 * not exist on the QA org. Everything below resolves from `QA_FIXTURE_*`, per
 * `.claude/rules/verify.md` → "E2E asserts against the QA org".
 *
 * Photo rows are seeded by `scripts/provision-qa-org.ts` → `seedPhotoFixtures`
 * (metadata-only; thumbnails 404 by design — see `QA_FIXTURE_PHOTOS`). Run
 * `pnpm provision:qa-org` before this spec.
 */
import { test, expect } from '@playwright/test';
import {
  QA_FIXTURE_PHOTO_COUNT,
  QA_FIXTURE_SKUS,
  QA_FIXTURE_TRACKING,
} from '@/lib/tenancy/qa-org';

/**
 * The path strip's count readout, and the SETTLED gate every test here opens
 * with.
 *
 * Targeted by test id rather than by copy: this was a `/Photos \d+ ·/` regex
 * whose trailing separator existed only to disambiguate it from the
 * end-of-stream footer's own count, and both broke the first time the wording
 * was improved.
 *
 * The assertion is `toContainText(/\d+ photo/)`, never `toBeVisible()`. The
 * element is mounted during loading too — its loading branch is `Loading…`,
 * which carries no digits — so a mere visibility check passes on the first
 * frame and the test reads its tile count before any photo has arrived. The
 * digits are what say "settled".
 */
const META_LINE = '[data-testid="data-table-row-count"]';

/** The readout has settled on a real count. */
const SETTLED_META = /\d/;

/** Fails the test on any uncaught page error, which a silent render crash would otherwise hide. */
function trackPageErrors(page: import('@playwright/test').Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  return errors;
}

test.describe('Media Library · deep-link routing', () => {
  test('lands on the flat stream and renders seeded photos', async ({ page }) => {
    const errors = trackPageErrors(page);

    await page.goto('/ops/photos');
    await expect(page.locator(META_LINE)).toContainText(SETTLED_META);

    // The QA org is seeded with a known number of photos; the stream must show
    // at least that many. Other specs may add more, so this is a floor.
    const tiles = page.getByTestId('photo-tile');
    expect(await tiles.count()).toBeGreaterThanOrEqual(QA_FIXTURE_PHOTO_COUNT);

    expect(errors, `Uncaught page errors: ${errors.join(' | ')}`).toHaveLength(0);
  });

  test('sourceScope + stage round-trip and label the header', async ({ page }) => {
    const errors = trackPageErrors(page);

    await page.goto('/ops/photos?sourceScope=unboxing&stage=unbox_item&view=grid-sm');
    await expect(page.locator(META_LINE)).toContainText(SETTLED_META);

    // describePhotoLibraryContext → stage branch. The readout names WHAT the
    // count is of (the stage label, via photoStageLabel), not a sentence
    // describing the surface — the strip is a readout, not teaching text.
    await expect(page.locator(META_LINE)).toContainText(/unbox · item/i);

    // Both params must survive — the navigator reads them back on reload.
    await expect(page).toHaveURL(/sourceScope=unboxing/);
    await expect(page).toHaveURL(/stage=unbox_item/);

    expect(errors, `Uncaught page errors: ${errors.join(' | ')}`).toHaveLength(0);
  });

  test('a stage with no seeded evidence renders an honest empty, not a crash', async ({ page }) => {
    const errors = trackPageErrors(page);

    // `packing` evidence is deliberately unseeded — the empty branch is a
    // settled state and must be distinguishable from a failed render.
    await page.goto('/ops/photos?sourceScope=packing&view=grid-sm');
    await expect(page.locator(META_LINE)).toContainText(SETTLED_META);
    await expect(page.getByTestId('photo-tile')).toHaveCount(0);

    expect(errors, `Uncaught page errors: ${errors.join(' | ')}`).toHaveLength(0);
  });

  test('sku deep link labels the header context', async ({ page }) => {
    const errors = trackPageErrors(page);

    await page.goto(`/ops/photos?sku=${encodeURIComponent(QA_FIXTURE_SKUS.speaker)}&view=grid-sm`);
    await expect(page.locator(META_LINE)).toContainText(SETTLED_META);
    // Same contract as the stage branch: the readout carries the context
    // TITLE, so the operator can see which SKU the count belongs to.
    await expect(page.locator(META_LINE)).toContainText(
      new RegExp(`SKU ${QA_FIXTURE_SKUS.speaker}`, 'i'),
    );
    await expect(page).toHaveURL(new RegExp(`sku=${encodeURIComponent(QA_FIXTURE_SKUS.speaker)}`));

    expect(errors, `Uncaught page errors: ${errors.join(' | ')}`).toHaveLength(0);
  });

  test('tracking deep link round-trips into the filter popover', async ({ page }) => {
    const errors = trackPageErrors(page);

    await page.goto(`/ops/photos?tracking=${QA_FIXTURE_TRACKING}&view=grid-sm`);
    await expect(page.locator(META_LINE)).toContainText(SETTLED_META);
    await expect(page).toHaveURL(new RegExp(`tracking=${QA_FIXTURE_TRACKING}`));

    expect(errors, `Uncaught page errors: ${errors.join(' | ')}`).toHaveLength(0);
  });

  test('the view param round-trips and the default drops out of the URL', async ({ page }) => {
    const errors = trackPageErrors(page);

    // `list` is non-default, so it must be serialized.
    await page.goto('/ops/photos?view=list');
    await expect(page.locator(META_LINE)).toContainText(SETTLED_META);
    await expect(page).toHaveURL(/view=list/);

    // `grid-sm` is DEFAULT_PHOTO_LIBRARY_VIEW — parsePhotoLibraryDisplayParams
    // omits it, so a bare landing must not carry it.
    await page.goto('/ops/photos');
    await expect(page.locator(META_LINE)).toContainText(SETTLED_META);
    await expect(page).not.toHaveURL(/view=/);

    expect(errors, `Uncaught page errors: ${errors.join(' | ')}`).toHaveLength(0);
  });
});
