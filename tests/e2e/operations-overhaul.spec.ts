import { test, expect } from '@playwright/test';

/**
 * Operations Live — slim Monitor smoke (dashboard-ops-ux plan, Slices 2–3 + 8).
 *
 * Live is a **Monitor**: Goal → KPIs → Exceptions → Pipeline → Feed (+ modal).
 * The demoted sections (Agents, StaffGoals, Inventory, Velocity, Matrix/
 * PerformanceGoals, Support) and the `PendingOrdersTable` order ledger were
 * unmounted from Live — a ledger is a Workbench, the wrong archetype on a
 * Monitor. This spec asserts the surviving pillars render in order AND that the
 * order ledger is gone.
 *
 * Read-only: it never mutates and takes no build lock (mirrors
 * design-demo-showcase.spec.ts). Desktop project only.
 */

test.describe('Operations Live (slim Monitor)', () => {
  test('goal hero is first, live stats + feed render, no order ledger', async ({ page }) => {
    test.skip(test.info().project.name === 'mobile', 'Desktop operations surface');

    await page.goto('/operations');

    // ── A. Goal-first: the goal hero ── (eyebrow is the top section)
    await expect(page.getByText("Today's goal", { exact: false }).first()).toBeVisible();

    // ── B. Live stats: the KPI snapshot + live feed ──
    await expect(page.getByRole('heading', { name: 'Numbers at a glance' })).toBeVisible();
    await expect(
      page.getByRole('heading', { name: /What.s happening on the floor/i }),
    ).toBeVisible();

    // Goal hero is ABOVE the KPI snapshot in the DOM (goal-first ordering).
    const goalEyebrow = page.getByText("Today's goal", { exact: false }).first();
    const snapshot = page.getByRole('heading', { name: 'Numbers at a glance' });
    const order = await goalEyebrow.evaluate((goal, snap) => {
      const pos = goal.compareDocumentPosition(snap as Node);
      // DOCUMENT_POSITION_FOLLOWING (4) ⇒ snapshot comes after the goal.
      return (pos & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
    }, await snapshot.elementHandle());
    expect(order, 'goal hero should precede the KPI snapshot').toBeTruthy();

    // ── Slim: the order ledger ("Outbound pending orders") is NOT on Live ──
    // A pending-orders table is a Workbench (durable selection + edit); it lives
    // on /dashboard, not on the Monitor. Its section header must not render here.
    await expect(page.getByText('Outbound pending orders', { exact: false })).toHaveCount(0);
  });
});
