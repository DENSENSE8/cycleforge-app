import { test, expect, type Page } from '@playwright/test';
import { QA_FIXTURE_ORDERS } from '@/lib/tenancy/qa-org';

/**
 * Pending / To Ship — the docs-first record inspector.
 *
 * Pending is the pre-pack queue: the first question on a row is "does this order
 * have its shipping label and packing slip yet", because that is what decides
 * whether it can move to Pack at all. So the inspector opens on **Documents**
 * (`resolveOrderInspectorContext` in `@/lib/selection-context/order-inspector-context`),
 * read-only — buying / fetching / deleting stays on the Labels station.
 *
 * Runs on the QA org (`qa-desktop`): the dogfood tenant's row mix changes under
 * the test between runs. Seed with `pnpm provision:qa-org`.
 */

test.describe('Pending / To Ship — docs-first inspector', () => {
  test.skip(({ browserName }) => browserName === 'webkit', 'queue grid is a desktop layout');

  const inspectorFor = (page: Page) => page.locator('aside[role="region"]');

  /**
   * Open the QA fixture order when it is on the lane, else the first row — the
   * assertions are about the CONTRACT, not about which record answers.
   */
  async function openPendingRow(page: Page): Promise<void> {
    await page.goto('/dashboard?unshipped');
    const table = page.locator('[data-testid="pending-grid-body"]').first();
    await expect(table, 'Pending grid did not render — re-run `pnpm provision:qa-org`').toBeVisible({
      timeout: 20_000,
    });

    const rows = table.locator('[data-order-row-id]');
    await expect(rows.first()).toBeVisible({ timeout: 20_000 });

    const fixture = rows.filter({ hasText: QA_FIXTURE_ORDERS.pending });
    const target = (await fixture.count()) > 0 ? fixture.first() : rows.first();
    // Product is the identity anchor — the editable tracks (sla / qty /
    // condition) stopPropagation to open their own in-cell editor instead.
    await target.locator('[data-col="title"]').click();
    await expect(inspectorFor(page)).toBeVisible({ timeout: 20_000 });
  }

  const documentsTab = (page: Page) => page.getByRole('tab', { name: 'Documents' });

  test('opens on Documents with the label + slip tray', async ({ page }) => {
    await openPendingRow(page);
    const inspector = inspectorFor(page);

    // Non-modal region, not a blocking dialog (the lane's standing contract).
    await expect(inspector).toHaveAttribute('aria-label', /^Order .+ details$/);
    expect(await inspector.getAttribute('aria-modal')).toBeNull();

    await expect(documentsTab(page)).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('order-documents-section')).toBeVisible({ timeout: 20_000 });
    // Both document types are always listed — an EMPTY type is a fact the
    // operator needs ("no slip yet"), not a row to hide.
    await expect(page.getByTestId('order-doc-shipping-label')).toBeVisible();
    await expect(page.getByTestId('order-doc-packing-slip')).toBeVisible();

    // Read-only on Pending: no drop zone, no marketplace Fetch, no delete.
    const section = page.getByTestId('order-documents-section');
    await expect(section.getByRole('button', { name: /^Fetch$/ })).toHaveCount(0);
    await expect(section.getByRole('button', { name: /^Delete /i })).toHaveCount(0);

    // Selection is durable.
    expect(new URL(page.url()).searchParams.get('openOrderId')).toBeTruthy();

    await page.keyboard.press('Escape');
    await expect(inspector).toBeHidden({ timeout: 10_000 });
  });

  test('Preview opens the shared document slide-over', async ({ page }) => {
    await openPendingRow(page);
    await expect(documentsTab(page)).toHaveAttribute('aria-selected', 'true');

    const preview = page.getByTestId('order-documents-preview');
    await expect(preview).toBeVisible({ timeout: 20_000 });
    await preview.click();

    // Composes `DocumentSlideOver` — the same previewer the Labels station uses,
    // never a page-local lightbox.
    const slideOver = page.getByLabel('Order documents preview');
    await expect(slideOver).toBeVisible({ timeout: 20_000 });
    // Type switcher lists both types even when one has nothing attached.
    await expect(slideOver.getByRole('button', { name: /Shipping Label/ })).toBeVisible();
    await expect(slideOver.getByRole('button', { name: /Packing Slip/ })).toBeVisible();

    await slideOver.getByRole('button', { name: 'Close documents panel' }).click();
    await expect(slideOver).toBeHidden({ timeout: 10_000 });
  });

  test('the Shipping tab still carries the grid facts (plane redundancy)', async ({ page }) => {
    // Docs-first must not cost the operator the editable plane: the record
    // inspector still exposes the deadline / identity facts the grid shows, so
    // a surface that cannot mount the in-cell editor is never a dead end.
    await page.goto('/dashboard?unshipped');
    const grid = page.locator('[data-testid="pending-grid-body"]').first();
    await expect(grid).toBeVisible({ timeout: 20_000 });
    const row = grid.locator('[data-order-row-id]').first();
    await expect(row).toBeVisible({ timeout: 20_000 });
    const rowOrderId = await row.getAttribute('data-order-row-id');
    expect(rowOrderId).toBeTruthy();

    await row.locator('[data-col="title"]').click();
    const inspector = inspectorFor(page);
    await expect(inspector).toBeVisible({ timeout: 20_000 });

    await page.getByRole('tab', { name: 'Shipping' }).click();
    await expect(page.getByRole('tab', { name: 'Shipping' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(inspector).toContainText('Ship By Date', { timeout: 20_000 });
    await expect(inspector).toContainText('Tracking Number');
    await expect(inspector).toContainText('Order ID');
    // The marketplace order id from the panel's own accessible name — the row
    // attribute is the numeric record id, which is what `?openOrderId=` carries.
    const displayId = (await inspector.getAttribute('aria-label'))
      ?.replace(/^Order\s+/, '')
      .replace(/\s+details$/, '');
    expect(displayId).toBeTruthy();
    await expect(inspector).toContainText(String(displayId));

    // The tab is a view switch, not a navigation — selection is unchanged.
    expect(new URL(page.url()).searchParams.get('openOrderId')).toBe(rowOrderId);
  });

  test('Urgent from the record plane lands on the attention filter', async ({ page }) => {
    await openPendingRow(page);
    const openedId = new URL(page.url()).searchParams.get('openOrderId');
    expect(openedId).toBeTruthy();

    // The inline toggle on the Ship-By row (urgency is a deadline concern).
    // Located by the shared name so the assertion is state-agnostic — a run
    // that died before its cleanup must not poison the next one.
    const urgentToggle = () => inspectorFor(page).getByRole('button', { name: /urgent/i }).first();
    await page.getByRole('tab', { name: 'Shipping' }).click();
    await expect(urgentToggle()).toBeVisible({ timeout: 20_000 });
    const wasUrgent = (await urgentToggle().getAttribute('aria-pressed')) === 'true';

    const setUrgent = async (next: boolean) => {
      if (((await urgentToggle().getAttribute('aria-pressed')) === 'true') === next) return;
      const assign = page.waitForResponse(
        (r) => r.url().includes('/api/orders/assign') && r.request().method() === 'POST',
      );
      await urgentToggle().click();
      expect((await assign).ok(), 'urgent commit succeeded').toBe(true);
      await expect(urgentToggle()).toHaveAttribute('aria-pressed', String(next));
    };

    try {
      await setUrgent(true);
      // Urgent is one of the counts `OutboundKpiStrip` publishes, and
      // `?attention=1` is the filter that tile drills into.
      await page.goto('/dashboard?unshipped&attention=1');
      await expect(page.locator('[data-testid="pending-grid-body"]').first()).toBeVisible({
        timeout: 20_000,
      });
      await expect
        .poll(
          async () =>
            page.locator(`[data-order-row-id="${openedId}"]`).count(),
          { timeout: 20_000, message: 'the order just marked urgent should survive ?attention=1' },
        )
        .toBeGreaterThan(0);
    } finally {
      // Leave the fixture exactly as found.
      await page.goto(`/dashboard?unshipped&openOrderId=${openedId}`);
      await expect(inspectorFor(page)).toBeVisible({ timeout: 20_000 });
      await page.getByRole('tab', { name: 'Shipping' }).click();
      await expect(urgentToggle()).toBeVisible({ timeout: 20_000 });
      await setUrgent(wasUrgent);
    }
  });

  test('record→record keyboard swap re-seeds on Documents', async ({ page }) => {
    await page.goto('/dashboard?unshipped');
    const table = page.locator('[data-testid="pending-grid-body"]').first();
    await expect(table).toBeVisible({ timeout: 20_000 });
    const rows = table.locator('[data-order-row-id]');
    await expect(rows.first()).toBeVisible({ timeout: 20_000 });
    test.skip((await rows.count()) < 2, 'needs at least two pending rows');

    await rows.nth(0).locator('[data-col="title"]').click();
    const inspector = inspectorFor(page);
    await expect(inspector).toBeVisible({ timeout: 20_000 });

    // Move OFF the default so the re-seed is observable rather than vacuous.
    await page.getByRole('tab', { name: 'Shipping' }).click();
    await expect(page.getByRole('tab', { name: 'Shipping' })).toHaveAttribute(
      'aria-selected',
      'true',
    );

    const firstLabel = await inspector.getAttribute('aria-label');
    await page.keyboard.press('KeyJ');
    await expect(inspector).not.toHaveAttribute('aria-label', String(firstLabel));

    // The new record asks the same first question, so the tab resets to it.
    await expect(documentsTab(page)).toHaveAttribute('aria-selected', 'true', { timeout: 10_000 });
  });
});
