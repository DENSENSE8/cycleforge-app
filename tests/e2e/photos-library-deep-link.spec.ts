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
 * The settled header meta line — `Photos ${n} · ${subtitle}`
 * (`PhotoLibraryPage.tsx:280`).
 *
 * The trailing ` ·` is load-bearing, not decoration: the grid footer renders a
 * bare `Photos ${n}` with no separator, so a plain `/Photos \d+/` matches two
 * elements and fails Playwright strict mode whenever both are on screen.
 * The loading branch is `Loading…` — no digits — so this cannot pass vacuously.
 */
const META_LINE = /Photos \d+ ·/;

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
    await expect(page.getByText(META_LINE)).toBeVisible();

    // The QA org is seeded with a known number of photos; the stream must show
    // at least that many. Other specs may add more, so this is a floor.
    const tiles = page.getByTestId('photo-tile');
    expect(await tiles.count()).toBeGreaterThanOrEqual(QA_FIXTURE_PHOTO_COUNT);

    expect(errors, `Uncaught page errors: ${errors.join(' | ')}`).toHaveLength(0);
  });

  test('sourceScope + stage round-trip and label the header', async ({ page }) => {
    const errors = trackPageErrors(page);

    await page.goto('/ops/photos?sourceScope=unboxing&stage=unbox_item&view=grid-sm');
    await expect(page.getByText(META_LINE)).toBeVisible();

    // describePhotoLibraryContext → stage branch (label via photoStageLabel).
    await expect(page.getByText(/Unboxing evidence at this stage/i)).toBeVisible();

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
    await expect(page.getByText(META_LINE)).toBeVisible();
    await expect(page.getByTestId('photo-tile')).toHaveCount(0);

    expect(errors, `Uncaught page errors: ${errors.join(' | ')}`).toHaveLength(0);
  });

  test('sku deep link labels the header context', async ({ page }) => {
    const errors = trackPageErrors(page);

    await page.goto(`/ops/photos?sku=${encodeURIComponent(QA_FIXTURE_SKUS.speaker)}&view=grid-sm`);
    await expect(page.getByText(META_LINE)).toBeVisible();
    await expect(
      page.getByText(/Photos linked to this SKU across intake, testing, and packing/i),
    ).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`sku=${encodeURIComponent(QA_FIXTURE_SKUS.speaker)}`));

    expect(errors, `Uncaught page errors: ${errors.join(' | ')}`).toHaveLength(0);
  });

  test('tracking deep link round-trips into the filter popover', async ({ page }) => {
    const errors = trackPageErrors(page);

    await page.goto(`/ops/photos?tracking=${QA_FIXTURE_TRACKING}&view=grid-sm`);
    await expect(page.getByText(META_LINE)).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`tracking=${QA_FIXTURE_TRACKING}`));

    expect(errors, `Uncaught page errors: ${errors.join(' | ')}`).toHaveLength(0);
  });

  test('the view param round-trips and the default drops out of the URL', async ({ page }) => {
    const errors = trackPageErrors(page);

    // `list` is non-default, so it must be serialized.
    await page.goto('/ops/photos?view=list');
    await expect(page.getByText(META_LINE)).toBeVisible();
    await expect(page).toHaveURL(/view=list/);

    // `grid-sm` is DEFAULT_PHOTO_LIBRARY_VIEW — parsePhotoLibraryDisplayParams
    // omits it, so a bare landing must not carry it.
    await page.goto('/ops/photos');
    await expect(page.getByText(META_LINE)).toBeVisible();
    await expect(page).not.toHaveURL(/view=/);

    expect(errors, `Uncaught page errors: ${errors.join(' | ')}`).toHaveLength(0);
  });
});
