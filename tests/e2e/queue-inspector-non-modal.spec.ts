import { test, expect } from '@playwright/test';

/**
 * Queue / workbench record inspectors = NON-MODAL right-rail regions.
 *
 * Same modality metric already proven for `detail:order`
 * (`dashboard-inspector-non-modal.spec.ts`) and the intake planes
 * (`import-add-order-non-modal.spec.ts`): `DetailStackRailRegistrar` +
 * `modal={false}` → `role="region"` with a name, no scrim, no body scroll lock,
 * and the collection map underneath stays hit-testable.
 *
 * Covers the Wave A flips:
 *   (1) Incoming PO / shipment details (`detail:incoming`)
 *   (2) Repair details (`detail:repair`)
 *
 * Run against the QA org (`.claude/rules/verify.md`):
 *   pnpm provision:qa-org && npx playwright test tests/e2e/queue-inspector-non-modal.spec.ts --project=qa-desktop
 *
 * Both cases skip cleanly when the tenant has no rows on that lane — the
 * assertion is about the OVERLAY contract, not about seeded row counts.
 *
 * The Incoming cases below used to skip on a live tenant: `/incoming` is an
 * `isTableOnlyMode` surface, so `useReceivingLineBulkSelection` pinned
 * `selectMode` ON and `handleSelectRow` always took the bulk-toggle early
 * return — no `dispatchSelectLine`, no `incomingDetails`, no panel. Fixed
 * 2026-08-01 by splitting the planes (`rowClickOpens`): the row body opens the
 * record and the gutter checkbox owns bulk membership. Joined Unbox click-select
 * golden 2026-08-04: single click toggles bulk; double-click / Enter opens the
 * inspector (no row checkbox faces).
 *
 * NOT covered here, and WHY (a pre-existing reachability gap, not a modality
 * gap — measured 2026-07-31):
 *
 *   • `detail:inventory-sync` — its only trigger (`ShippedActionsButton`) has
 *     zero mounts in the app; both files sit in `knip-baseline.json` as unused.
 *     There is no page that can open it. The port matches `OrderSyncDialog`
 *     exactly; coverage lands when the button is remounted.
 */

/** Both backdrop variants carry their z-band token in the class string. */
const BACKDROP_SELECTOR = '[class*="z-panelBackdrop"], [class*="z-detailStackBackdrop"]';

/** The shared non-modal asserts: named region, no dialog, no scrim, no lock. */
async function expectNonModalRegion(
  page: import('@playwright/test').Page,
  aside: import('@playwright/test').Locator,
  namePattern: RegExp,
) {
  await expect(aside).toHaveAttribute('aria-label', namePattern);
  expect(await aside.getAttribute('aria-modal')).toBeNull();
  await expect(page.locator('aside[role="dialog"]')).toHaveCount(0);
  await expect(page.locator(BACKDROP_SELECTOR)).toHaveCount(0);
  await expect
    .poll(() => page.evaluate(() => document.body.style.overflow))
    .not.toBe('hidden');
}

/**
 * The first Incoming row that carries a PO / source-order identity.
 *
 * A row with none of those toasts ("No linked PO for this row yet") instead of
 * opening — a deliberate no-op path, not a failure — so picking blind would
 * make the panel assertions flaky on a live tenant.
 */
async function poLinkedRowIndex(
  page: import('@playwright/test').Page,
  rows: import('@playwright/test').Locator,
  from = 0,
): Promise<number | null> {
  const total = await rows.count();
  for (let i = from; i < total; i += 1) {
    const order = await rows.nth(i).locator('[data-col="order"]').first().innerText().catch(() => '');
    if (order.trim().replace(/[—-]/g, '')) return i;
  }
  return null;
}

test.describe('Queue inspectors — non-modal right rail', () => {
  test.skip(({ browserName }) => browserName === 'webkit', 'queue grids are a desktop layout');

  test('Incoming details opens as a named region and leaves the grid live', async ({ page }) => {
    await page.goto('/incoming');
    await expect(page.getByTestId('incoming-grid-body')).toBeVisible({ timeout: 30_000 });

    const rows = page.locator('[data-line-row-id]');
    // Wait for the first row to RENDER before counting — `count()` does not
    // auto-wait, so counting straight after the fetch skips on a live tenant.
    const hasRows = await rows
      .first()
      .waitFor({ state: 'visible', timeout: 20_000 })
      .then(() => true)
      .catch(() => false);
    if (!hasRows) test.skip(true, 'no Incoming rows on this tenant');

    const target = await poLinkedRowIndex(page, rows);
    if (target == null) test.skip(true, 'no PO-linked Incoming rows on this tenant');

    // Unbox click-select golden: double-click opens the inspector.
    await rows.nth(target!).dblclick();

    const inspector = page.locator('aside[role="region"]');
    await expect(inspector).toBeVisible({ timeout: 10_000 });

    await expectNonModalRegion(page, inspector, /^Incoming .*details$/);

    // The grid stays clickable under the float. Probe via elementFromPoint so
    // the assertion is about the OVERLAY, not about what a given row click does.
    const rowBox = await rows.first().boundingBox();
    expect(rowBox).not.toBeNull();
    const hit = await page.evaluate(
      ({ x, y }) => {
        const el = document.elementFromPoint(x, y);
        return { inRow: !!el?.closest('[data-line-row-id]'), inAside: !!el?.closest('aside') };
      },
      {
        x: rowBox!.x + Math.min(40, rowBox!.width / 4),
        y: rowBox!.y + rowBox!.height / 2,
      },
    );
    expect(hit).toEqual({ inRow: true, inAside: false });

    // The header close is the explicit dismiss now that there is no scrim.
    await page.getByRole('button', { name: 'Close' }).first().click();
    await expect(inspector).toBeHidden({ timeout: 10_000 });
  });

  test('Incoming row→row keeps ONE occupant mounted (stable detail:incoming)', async ({ page }) => {
    await page.goto('/incoming');
    await expect(page.getByTestId('incoming-grid-body')).toBeVisible({ timeout: 30_000 });

    const rows = page.locator('[data-line-row-id]');
    const hasRows = await rows
      .nth(1)
      .waitFor({ state: 'visible', timeout: 20_000 })
      .then(() => true)
      .catch(() => false);
    if (!hasRows) test.skip(true, 'needs at least two Incoming rows');

    const firstTarget = await poLinkedRowIndex(page, rows);
    const secondTarget =
      firstTarget == null ? null : await poLinkedRowIndex(page, rows, firstTarget + 1);
    if (secondTarget == null) test.skip(true, 'needs two PO-linked Incoming rows');

    await rows.nth(firstTarget!).dblclick();
    const inspector = page.locator('aside[role="region"]');
    await expect(inspector).toBeVisible({ timeout: 10_000 });

    // Watch for the occupant being torn out of the DOM. Under the old per-record
    // occupant ids (`detail:incoming:<poId>`) this fired on every row step:
    // exit → empty slot → enter.
    await page.evaluate(() => {
      (window as unknown as { __asideRemoved?: boolean }).__asideRemoved = false;
      const obs = new MutationObserver((records) => {
        for (const r of records) {
          for (const node of Array.from(r.removedNodes)) {
            if (!(node instanceof HTMLElement)) continue;
            if (node.matches('aside[role="region"]') || node.querySelector('aside[role="region"]')) {
              (window as unknown as { __asideRemoved?: boolean }).__asideRemoved = true;
            }
          }
        }
      });
      obs.observe(document.body, { childList: true, subtree: true });
    });

    await rows.nth(secondTarget!).dblclick();
    await expect(inspector).toBeVisible();
    // Still exactly one right-edge region — store single-slot exclusivity.
    await expect(page.locator('aside[role="region"]')).toHaveCount(1);
    expect(
      await page.evaluate(() => (window as unknown as { __asideRemoved?: boolean }).__asideRemoved),
    ).toBe(false);
  });

  test('Incoming click-select: single click toggles bulk WITHOUT opening; dblclick opens', async ({
    page,
  }) => {
    // Unbox Sheets click-select golden on Incoming Pipeline: no checkbox gutter
    // faces — the row is role=checkbox; click toggles membership; dblclick opens.
    await page.goto('/incoming');
    await expect(page.getByTestId('incoming-grid-body')).toBeVisible({ timeout: 30_000 });

    const rows = page.locator('[data-line-row-id]');
    const hasRows = await rows
      .first()
      .waitFor({ state: 'visible', timeout: 20_000 })
      .then(() => true)
      .catch(() => false);
    if (!hasRows) test.skip(true, 'no Incoming rows on this tenant');

    const row = rows.first();
    await expect(row).toHaveAttribute('aria-checked', 'false');

    await row.click();
    await expect(row).toHaveAttribute('aria-checked', 'true');
    // No record opened — single click is bulk only.
    await expect(page.locator('aside[role="region"]')).toHaveCount(0);

    await row.click();
    await expect(row).toHaveAttribute('aria-checked', 'false');

    const target = await poLinkedRowIndex(page, rows);
    if (target == null) test.skip(true, 'no PO-linked Incoming rows on this tenant');

    await rows.nth(target!).dblclick();
    const inspector = page.locator('aside[role="region"]');
    await expect(inspector).toBeVisible({ timeout: 10_000 });
    await expectNonModalRegion(page, inspector, /^Incoming .*details$/);
  });

  test('Repair details opens as a named region without scrim or scroll lock', async ({ page }) => {
    await page.goto('/repair');

    const rows = page.locator('[data-repair-row-id]');
    const hasRows = await rows
      .first()
      .waitFor({ state: 'visible', timeout: 20_000 })
      .then(() => true)
      .catch(() => false);
    if (!hasRows) test.skip(true, 'no Repair rows on this tenant');

    await rows.first().locator('[data-col="title"]').click();

    const inspector = page.locator('aside[role="region"]');
    await expect(inspector).toBeVisible({ timeout: 20_000 });

    await expectNonModalRegion(page, inspector, /^Repair .+ details$/);

    await page.keyboard.press('Escape');
    await expect(inspector).toBeHidden({ timeout: 10_000 });
  });
});
