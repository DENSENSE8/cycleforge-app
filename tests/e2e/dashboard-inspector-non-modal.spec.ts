import { test, expect } from '@playwright/test';
// Imported, never re-typed: the cap is derived, so a spec that hardcoded the
// number would keep passing after the derivation changed underneath it.
import {
  contextRailCostPx,
  MIN_WORK_SURFACE_PX,
  RIGHT_RAIL_GUTTER_PX,
} from '@/lib/right-rail/frame';
import { DETAIL_STACK_RESIZE } from '@/design-system/shells/detail-stack';

/**
 * Dashboard order inspector = a NON-MODAL region (execution plan Phase 1).
 *
 * `RightRailHost` renders one occupant, and modality is now a per-occupant
 * contract (`RightRailPanel.modal`, default true). The dashboard order panel
 * opts out, so opening a row must NOT dim the app, must NOT lock page scroll,
 * and must leave the queue underneath clickable — the operator's context
 * (sibling rows, KPI strip, lifecycle tabs) is exactly what a scrim would hide.
 *
 * Asserts:
 *   (1) the aside is `role="region"` with an accessible name, not a modal dialog;
 *   (2) neither backdrop variant is mounted;
 *   (3) `document.body` scroll is not locked;
 *   (4) a second row can still be clicked THROUGH to (no scrim intercept) and
 *       swaps the inspector to that order.
 */

test.describe('Dashboard order inspector — non-modal', () => {
  test.skip(({ browserName }) => browserName === 'webkit', 'queue grid is a desktop layout');

  /** Both backdrop variants carry their z-band token in the class string. */
  const BACKDROP_SELECTOR = '[class*="z-panelBackdrop"], [class*="z-detailStackBackdrop"]';

  test('opens without a scrim, scroll lock, or dialog semantics', async ({ page }) => {
    await page.goto('/dashboard?unshipped');

    const table = page.locator('[data-testid="pending-grid-body"]').first();
    await expect(table).toBeVisible({ timeout: 20_000 });

    const rows = table.locator('[data-order-row-id]');
    await expect(rows.first()).toBeVisible({ timeout: 20_000 });
    test.skip((await rows.count()) < 2, 'needs at least two pending rows');

    // Click a display-only track (Age): the editable cells (title / qty / date /
    // condition) stopPropagation to open their own in-cell editor instead.
    await rows.nth(0).locator('[data-col="title"]').click();

    const inspector = page.locator('aside[role="region"]');
    await expect(inspector).toBeVisible({ timeout: 20_000 });

    // (1) Named region, never a modal dialog.
    await expect(inspector).toHaveAttribute('aria-label', /^Order .+ details$/);
    expect(await inspector.getAttribute('aria-modal')).toBeNull();
    await expect(page.locator('aside[role="dialog"]')).toHaveCount(0);

    // (2) No dim / blur layer.
    await expect(page.locator(BACKDROP_SELECTOR)).toHaveCount(0);

    // (3) Page scroll stays live (`useBodyScrollLock` sets body overflow:hidden).
    await expect
      .poll(() => page.evaluate(() => document.body.style.overflow))
      .not.toBe('hidden');

    // (4) Nothing intercepts pointer events over the queue. Hit-test a point
    // inside the second row's identity pane (left of the inspector card, which
    // floats over the right ~432px) and expect the row itself — under the old
    // modal contract the full-viewport backdrop answered here instead.
    //
    // Probed via elementFromPoint rather than .click() so the assertion is about
    // the OVERLAY, not about which cell happens to open an in-cell editor.
    const secondRowBox = await rows.nth(1).locator('[data-col="title"]').boundingBox();
    expect(secondRowBox).not.toBeNull();
    const hit = await page.evaluate(
      ({ x, y }) => {
        const el = document.elementFromPoint(x, y);
        return {
          inRow: !!el?.closest('[data-order-row-id]'),
          inAside: !!el?.closest('aside'),
        };
      },
      {
        x: secondRowBox!.x + Math.min(40, secondRowBox!.width / 2),
        y: secondRowBox!.y + secondRowBox!.height / 2,
      },
    );
    expect(hit).toEqual({ inRow: true, inAside: false });

    // (5) The queue keyboard bridge still drives the open inspector: `j` moves to
    // the next record and the content swaps in place.
    const firstLabel = await inspector.getAttribute('aria-label');
    await page.keyboard.press('KeyJ');
    await expect(inspector).toBeVisible();
    await expect(inspector).not.toHaveAttribute('aria-label', String(firstLabel));
  });

  test('Pending opens on Documents, the question the lane exists to answer', async ({ page }) => {
    await page.goto('/dashboard?unshipped');

    const table = page.locator('[data-testid="pending-grid-body"]').first();
    await expect(table).toBeVisible({ timeout: 20_000 });
    const row = table.locator('[data-order-row-id]').first();
    await expect(row).toBeVisible({ timeout: 20_000 });

    await row.locator('[data-col="title"]').click();

    const inspector = page.locator('aside[role="region"]');
    await expect(inspector).toBeVisible({ timeout: 20_000 });
    // Still a named region, never a modal dialog — the docs-first default is a
    // tab decision, not a modality change.
    await expect(inspector).toHaveAttribute('aria-label', /^Order .+ details$/);
    expect(await inspector.getAttribute('aria-modal')).toBeNull();
    await expect(page.locator('aside[role="dialog"]')).toHaveCount(0);
    await expect(page.locator(BACKDROP_SELECTOR)).toHaveCount(0);

    await expect(page.getByRole('tab', { name: 'Documents' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(page.getByTestId('order-documents-section')).toBeVisible({ timeout: 20_000 });
    expect(new URL(page.url()).searchParams.get('openOrderId')).toBeTruthy();

    await page.keyboard.press('Escape');
    await expect(inspector).toBeHidden({ timeout: 10_000 });
  });

  test('the innermost open overlay owns Escape', async ({ page }) => {
    await page.goto('/dashboard?unshipped');

    const table = page.locator('[data-testid="pending-grid-body"]').first();
    await expect(table).toBeVisible({ timeout: 20_000 });
    const row = table.locator('[data-order-row-id]').first();
    await expect(row).toBeVisible({ timeout: 20_000 });

    await row.locator('[data-col="title"]').click();
    const inspector = page.locator('aside[role="region"]');
    await expect(inspector).toBeVisible({ timeout: 20_000 });

    // Single-select the row so its info menu (Notes · OOS · Details) is live.
    await row.getByRole('checkbox').first().check();
    const infoTrigger = row.locator('[data-row-info-menu]');
    await expect(infoTrigger).toBeVisible();

    // Wait for the panel's entrance animation to settle before touching the row.
    // This test used to pass only by RACING that animation: the inspector is a
    // non-modal float over a full-width grid (it reserves no room — see the
    // plan's open occlusion item), so once it is at rest at x=1008 it covers
    // every trailing row control — info menu (centre 1013), listing link
    // (1033), open-order (1053), condition (1212). Mid-flight the panel is
    // still right of those, which is the only window in which a real click
    // landed. Any unrelated timing change flipped the result, which is what
    // made this file look like it oscillated.
    await expect(inspector).toHaveCSS('transform', 'none', { timeout: 10_000 });

    // Open the menu directly on the element rather than by hit-testing a point
    // the float owns. What is under test is Escape OWNERSHIP (the overlay stack
    // vs. the queue's capture-phase listener), not whether the trigger is
    // clickable while covered — that is a product question tracked separately.
    await infoTrigger.dispatchEvent('click');

    const menu = page.getByRole('menu').or(page.locator('[data-row-info-menu-panel]'));
    await expect(menu.first()).toBeVisible({ timeout: 10_000 });

    // Escape #1 dismisses the MENU and leaves the inspector standing. Before the
    // overlay stack, the capture-phase queue listener swallowed this keystroke
    // and closed the inspector with the menu still on screen.
    await page.keyboard.press('Escape');
    await expect(menu.first()).toBeHidden({ timeout: 10_000 });
    await expect(inspector).toBeVisible();

    // Escape #2 now belongs to the inspector again.
    await page.keyboard.press('Escape');
    await expect(inspector).toBeHidden({ timeout: 10_000 });
  });

  test('the inspector is resizable, clamps to the derived cap, and persists', async ({ page }) => {
    // The cap leaves the queue readable beside an OPEN context rail — the right
    // edge must not auto-park the left. Derived by `resolveRightRailFrame`:
    // content row − open context cost − MIN_WORK_SURFACE_PX (floored at panel min).
    // At 1440 with the default 360 rail: max(360, 1440 − 360 − 784) = 360.
    const EXPECTED_CAP = Math.max(
      DETAIL_STACK_RESIZE.minWidthPx,
      1440 - contextRailCostPx() - MIN_WORK_SURFACE_PX - RIGHT_RAIL_GUTTER_PX * 2,
    );

    const inspector = page.locator('aside[role="region"]');
    const openFirstRow = async () => {
      const table = page.locator('[data-testid="pending-grid-body"]').first();
      await expect(table).toBeVisible({ timeout: 20_000 });
      const row = table.locator('[data-order-row-id]').first();
      await expect(row).toBeVisible({ timeout: 20_000 });
      await row.locator('[data-col="title"]').click();
      await expect(inspector).toBeVisible({ timeout: 20_000 });
    };

    await page.goto('/dashboard?unshipped');
    // Clear once (not via addInitScript — that re-runs on every navigation and
    // would wipe the very value this test is asserting survives a reload).
    await page.evaluate(() => {
      window.localStorage.removeItem('detail-inspector-width');
      window.localStorage.removeItem('detail-inspector-collapsed');
    });
    await page.goto('/dashboard?unshipped');

    await openFirstRow();
    // Default 420 may already exceed the open-left cap at 1440 — clamp on open.
    expect((await inspector.boundingBox())?.width).toBeCloseTo(
      Math.min(DETAIL_STACK_RESIZE.defaultWidthPx, EXPECTED_CAP),
      0,
    );

    // Drag the left edge well past the cap — dragging LEFT grows a right-anchored pane.
    const handle = page.getByTestId('detail-inspector-resize');
    await expect(handle).toBeVisible();
    const grip = await handle.boundingBox();
    expect(grip).not.toBeNull();
    await page.mouse.move(grip!.x + grip!.width / 2, grip!.y + grip!.height / 2);
    await page.mouse.down();
    await page.mouse.move(grip!.x - 400, grip!.y + grip!.height / 2, { steps: 12 });
    await page.mouse.up();

    await expect.poll(async () => (await inspector.boundingBox())?.width).toBeCloseTo(
      EXPECTED_CAP,
      0,
    );

    // Persisted globally, not per lane — the operator's spatial preference is
    // about their monitor, not the tab they happen to be on. Re-open after a
    // full page load rather than asserting the panel restores itself: that is a
    // separate contract (`?openOrderId=` re-resolution) and not what this covers.
    await page.goto('/dashboard?unshipped');
    await openFirstRow();
    await expect.poll(async () => (await inspector.boundingBox())?.width).toBeCloseTo(
      EXPECTED_CAP,
      0,
    );

    // Collapse parks via header `→|` (sash is drag-only — never a sash-top
    // chevron). Expand strip restores it (host-owned, not page-local).
    const collapseBtn = inspector.getByRole('button', { name: 'Hide right panel' });
    await expect(collapseBtn).toBeVisible();
    await collapseBtn.click();
    await expect(page.getByTestId('detail-inspector-expand')).toBeVisible();
    await expect(inspector).toHaveAttribute('aria-hidden', 'true');
    await page.getByTestId('detail-inspector-expand').click();
    await expect(inspector).toBeVisible();
    await expect(inspector).not.toHaveAttribute('aria-hidden', 'true');
  });

  test('record→record swap keeps the panel mounted and writes nothing', async ({ page }) => {
    const orderWrites: string[] = [];
    page.on('request', (req) => {
      const method = req.method();
      if (method === 'GET' || method === 'HEAD') return;
      if (/\/api\/orders?\b|\/api\/orders\//.test(new URL(req.url()).pathname)) {
        orderWrites.push(`${method} ${new URL(req.url()).pathname}`);
      }
    });

    await page.goto('/dashboard?unshipped');
    const table = page.locator('[data-testid="pending-grid-body"]').first();
    await expect(table).toBeVisible({ timeout: 20_000 });
    const rows = table.locator('[data-order-row-id]');
    await expect(rows.first()).toBeVisible({ timeout: 20_000 });
    test.skip((await rows.count()) < 2, 'needs at least two pending rows');

    await rows.nth(0).locator('[data-col="title"]').click();
    const inspector = page.locator('aside[role="region"]');
    await expect(inspector).toBeVisible({ timeout: 20_000 });
    const firstLabel = await inspector.getAttribute('aria-label');

    // Watch for the occupant being torn out of the DOM. Under the old per-record
    // occupant id this fired on every step: exit ~0.4s, then enter ~0.4s, with an
    // empty slot between — the cost this phase removes.
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

    const writesBeforeSwap = orderWrites.length;
    await page.keyboard.press('KeyJ');
    await expect(inspector).not.toHaveAttribute('aria-label', String(firstLabel));

    // Content swapped in place — the occupant was never unmounted.
    expect(
      await page.evaluate(() => (window as unknown as { __asideRemoved?: boolean }).__asideRemoved),
    ).toBe(false);

    // And navigating without editing must not persist anything. The notes-flush
    // guard fires only on a DIRTY draft; a misfire here would write one order's
    // note onto another.
    await page.waitForTimeout(1000);
    expect(orderWrites.slice(writesBeforeSwap)).toEqual([]);
  });

  test('the open record survives a reload (durable ?openOrderId=)', async ({ page }) => {
    await page.goto('/dashboard?unshipped');
    const table = page.locator('[data-testid="pending-grid-body"]').first();
    await expect(table).toBeVisible({ timeout: 20_000 });
    const row = table.locator('[data-order-row-id]').first();
    await expect(row).toBeVisible({ timeout: 20_000 });
    await row.locator('[data-col="title"]').click();

    const inspector = page.locator('aside[role="region"]');
    await expect(inspector).toBeVisible({ timeout: 20_000 });
    const openedId = new URL(page.url()).searchParams.get('openOrderId');
    const openedLabel = await inspector.getAttribute('aria-label');
    expect(openedId).toBeTruthy();

    // Regression: the queue's stale-selection cleanup used to treat "rows have
    // not arrived yet" as "the record left the queue", dispatch close, and strip
    // `openOrderId` — so a reload silently dropped the operator's record.
    await page.reload();

    await expect(inspector).toBeVisible({ timeout: 30_000 });
    await expect(inspector).toHaveAttribute('aria-label', String(openedLabel));
    expect(new URL(page.url()).searchParams.get('openOrderId')).toBe(openedId);
  });

  test('Enter on a focused row opens THAT row, not the first one', async ({ page }) => {
    await page.goto('/dashboard?unshipped');

    const table = page.locator('[data-testid="pending-grid-body"]').first();
    await expect(table).toBeVisible({ timeout: 20_000 });
    const rows = table.locator('[data-order-row-id]');
    await expect(rows.first()).toBeVisible({ timeout: 20_000 });
    test.skip((await rows.count()) < 3, 'needs at least three pending rows');

    // Focus a row well below the first. The capture-phase Enter branch only
    // knows how to open orderedRecords[0], so it used to hijack this keystroke.
    const target = rows.nth(2);
    const targetId = await target.getAttribute('data-order-row-id');
    await target.focus();
    await page.keyboard.press('Enter');

    await expect(page.locator('aside[role="region"]')).toBeVisible({ timeout: 20_000 });
    await expect
      .poll(() => new URL(page.url()).searchParams.get('openOrderId'))
      .toBe(targetId);
  });
});
