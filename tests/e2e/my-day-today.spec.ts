import { test, expect, type Page } from '@playwright/test';

/**
 * Home → Today (`/`, the `MyDayWorkspace` region) — the workbench contract.
 *
 * Covers the F0 rebuild's hand-checked invariants plus the four chrome-parity
 * controls added 2026-08-01 (saved-views rail · scoped search · Fields · KPI
 * band). Before this file those were verified by throwaway scripts that were
 * never committed, so every regression here was silent.
 *
 * **Why the feed is stubbed, and what that costs.** `verify.md`'s rule is about
 * which TENANT a spec asserts against — this runs on `qa-desktop`, so auth,
 * permissions and org scoping are the QA org's, and no dogfood row count can
 * drift under it. What is stubbed is the BFF's *response body*, because the QA
 * org provisions no `work_assignments` and Today's four lanes and three due
 * horizons cannot all be populated from fixtures that do not exist. Every
 * assertion below is about chrome, URL state and grid wiring, none of which
 * `aggregateMyDayFeed` participates in.
 *
 * What this therefore does NOT cover: the aggregator itself. The pure half —
 * lane assignment, the search predicate, the civil-day due horizon — is unit
 * tested in `src/lib/my-day/my-day-tasks.test.ts`. Seeding real
 * `work_assignments` into `scripts/provision-qa-org.ts` would close the rest and
 * is the honest follow-up; it is not done here.
 */

const GRID = '[data-testid="my-day-grid-body"]';
const INSPECTOR = '[role="region"][aria-label="Task details"]';

/** Fixed civil days relative to the run, so the horizon buckets are deterministic. */
function isoDaysFromNow(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  // 20:00Z is mid-afternoon Pacific on the same civil day year-round, so the
  // bucket does not flip with daylight saving.
  d.setUTCHours(20, 0, 0, 0);
  return d.toISOString();
}

const FEED = {
  doNext: {
    id: 'wo-next',
    title: 'Pack the amplifier',
    subtitle: 'Order QA-1001',
    queueLabel: 'Orders',
    recordLabel: 'QA-1001',
    orderId: 'QA-1001',
    status: 'pending',
    deadlineAt: isoDaysFromNow(-2), // overdue
    updatedAt: isoDaysFromNow(-2),
    assignedAt: isoDaysFromNow(-2),
  },
  assigned: [
    {
      id: 'wo-mine-1',
      title: 'Test the receiver',
      subtitle: 'Bench 2',
      queueLabel: 'Testing',
      recordLabel: 'QA-1002',
      orderId: 'QA-1002',
      status: 'in_progress',
      deadlineAt: isoDaysFromNow(0), // due today
      updatedAt: isoDaysFromNow(0),
      assignedAt: isoDaysFromNow(0),
    },
    {
      id: 'wo-mine-2',
      title: 'Label the pallet',
      subtitle: 'Dock A',
      queueLabel: 'Orders',
      recordLabel: 'QA-1003',
      orderId: 'QA-1003',
      status: 'pending',
      deadlineAt: isoDaysFromNow(3), // upcoming
      updatedAt: isoDaysFromNow(0),
      assignedAt: isoDaysFromNow(0),
    },
  ],
  interrupts: [
    {
      id: 'int-1',
      kind: 'support_followup',
      title: 'Reply to the buyer',
      subtitle: 'Ticket 5150',
      href: '/support',
      createdAtMs: Date.now(),
      ticketId: 5150,
    },
  ],
  queueCards: [
    { key: 'orders', label: 'Orders', count: 7, href: '/dashboard', permission: 'orders.view' },
  ],
  counts: { assigned: 2, interrupts: 1, unassigned: 4 },
};

async function openToday(page: Page, search = '') {
  await page.route('**/api/my-day', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(FEED) });
  });
  await page.goto(`/${search}`);
  await expect(page.locator(GRID).first()).toBeVisible({ timeout: 30_000 });
}

const row = (page: Page, title: string) =>
  page.locator(`[role="button"][aria-label="Task ${title}"]`).first();

test.describe('Home → Today workbench', () => {
  test.skip(({ browserName }) => browserName === 'webkit', 'desktop workbench chrome');

  test('lane tab writes ?scope= and changes the row count', async ({ page }) => {
    await openToday(page);
    await expect(row(page, 'Pack the amplifier')).toBeVisible();
    await expect(row(page, 'Reply to the buyer')).toBeVisible();

    await page.getByRole('button', { name: /^Needs attention\b/ }).first().click();
    await expect(page).toHaveURL(/[?&]scope=attention\b/);

    // The lane is a real filter, not just a lit tab.
    await expect(row(page, 'Reply to the buyer')).toBeVisible();
    await expect(row(page, 'Pack the amplifier')).toHaveCount(0);
  });

  test('row click writes ?task= and opens a non-modal region — never a dialog', async ({ page }) => {
    await openToday(page);
    await row(page, 'Test the receiver').click();

    await expect(page).toHaveURL(/[?&]task=wo-mine-1\b/);
    await expect(page.locator(INSPECTOR)).toBeVisible();
    // Navigators push, inspectors float: the record plane must not claim modality
    // it does not enforce (`source-of-truth.md` → Right-rail modality).
    await expect(page.locator('[role="dialog"][aria-label="Task details"]')).toHaveCount(0);
  });

  test('a deep link reproduces lane, selection and column sort together', async ({ page }) => {
    await openToday(page, '?scope=assigned&task=wo-mine-2&colsort=due&coldir=asc');

    // Assert the lane's EFFECT, not the tab's markup: the strip styles its
    // active pill rather than carrying aria-selected, so a markup assertion here
    // would be testing TabSwitch's internals instead of whether the deep link
    // reproduced the view.
    await expect(row(page, 'Test the receiver')).toBeVisible();
    await expect(row(page, 'Reply to the buyer')).toHaveCount(0);

    await expect(page.locator(INSPECTOR)).toBeVisible();
    await expect(
      page.getByRole('columnheader', { name: /Due/ }).first(),
    ).toHaveAttribute('aria-sort', 'ascending');
  });

  test('selection does not change a row’s height', async ({ page }) => {
    await openToday(page);
    const target = row(page, 'Test the receiver');
    const sibling = row(page, 'Label the pallet');

    const before = (await target.boundingBox())!.height;
    await target.click();
    await expect(page.locator(INSPECTOR)).toBeVisible();
    const after = (await target.boundingBox())!.height;

    expect(after).toBe(before);
    expect(after).toBe((await sibling.boundingBox())!.height);
  });

  // ── chrome parity, 2026-08-01 ───────────────────────────────────────────────

  test('search is collapsed at rest, and filtering writes ?q=', async ({ page }) => {
    await openToday(page);

    // Collapsed at rest — Today's search REFINES the list on screen, so it is
    // not one of the two always-open entry-path exceptions.
    const trigger = page.getByRole('button', { name: /Filter tasks/i }).first();
    await expect(trigger).toBeVisible();

    await trigger.click();
    await page.getByPlaceholder('Filter tasks…').fill('amplifier');

    await expect(page).toHaveURL(/[?&]q=amplifier\b/);
    await expect(row(page, 'Pack the amplifier')).toBeVisible();
    await expect(row(page, 'Label the pallet')).toHaveCount(0);
  });

  test('no-match reads differently from no-data', async ({ page }) => {
    await openToday(page, '?q=zzzznothingmatches');
    // "No matches" names the control that would widen it; the all-clear copy
    // ("Nothing needs you right now") would claim the day is empty.
    await expect(page.getByText(/No tasks match/i)).toBeVisible();
    await expect(page.getByText(/Nothing needs you right now/i)).toHaveCount(0);
  });

  test('the KPI band buckets by due horizon and each tile filters to its own count', async ({
    page,
  }) => {
    await openToday(page);

    const tile = (label: string) =>
      page.locator('section').filter({ hasText: label }).getByText(label).first();

    await expect(tile('Overdue')).toBeVisible();
    await expect(tile('Due today')).toBeVisible();
    await expect(tile('Upcoming')).toBeVisible();

    // One overdue task in the fixture (`wo-next`) — clicking must produce
    // exactly it, which is the promise a faceted count makes.
    await tile('Overdue').click();
    await expect(page).toHaveURL(/[?&]filter=overdue\b/);
    await expect(row(page, 'Pack the amplifier')).toBeVisible();
    await expect(row(page, 'Label the pallet')).toHaveCount(0);
    // The interrupt has no deadline, so it belongs to no horizon at all.
    await expect(row(page, 'Reply to the buyer')).toHaveCount(0);

    // The lit tile is its own escape hatch.
    await tile('Overdue').click();
    await expect(page).not.toHaveURL(/[?&]filter=/);
  });

  test('Fields hides an optional track and the header loses the column', async ({ page }) => {
    await openToday(page);

    // Assert the TRACK by `data-col`, not by accessible name. The Fields
    // listbox stays open across toggles by design, and querying the header
    // through the a11y tree while a popover is open is answering a different
    // question than "does the column exist" (it returned nothing on the
    // dogfood org for exactly that reason). `data-col` is what the header SoT
    // actually renders.
    const queueHeader = page.locator('[role="columnheader"][data-col="queue"]');

    // `queue` ships `optional`, so it starts hidden and Fields is how it comes back.
    await expect(queueHeader).toHaveCount(0);

    await page.getByRole('button', { name: /^Fields/ }).first().click();
    // The menu is keyed by pref key (`hideKey`), which is the unit a staffer
    // actually toggles — matching on the visible label would break the moment
    // the column SoT reworded it.
    const queueField = page.locator('[data-field-key="queue"]');
    await queueField.click();
    await expect(queueField).toHaveAttribute('aria-selected', 'true');
    await expect(queueHeader).toHaveCount(1);

    // …and back off again, so the assertion is about the toggle, not about one
    // lucky direction.
    await queueField.click();
    await expect(queueField).toHaveAttribute('aria-selected', 'false');
    await expect(queueHeader).toHaveCount(0);
  });

  test('the saved-views rail is resident and reserves its own column', async ({ page }) => {
    await openToday(page);
    const panel = page.locator('main [data-context-panel]');
    await expect(panel).toBeVisible();
    // By landmark, not by text — the section's own accessible name, so the empty
    // hint's prose cannot collide with the heading.
    await expect(panel.getByRole('region', { name: 'Saved views' })).toBeVisible();
    // Save is disabled until something is actually narrowed — a view that
    // captures the default view is not a view.
    await expect(page.getByRole('button', { name: /Save current view/i })).toBeDisabled();
  });

  test('saving a view captures the narrowed URL, and applying it restores that URL', async ({
    page,
  }) => {
    await openToday(page, '?scope=assigned&colsort=due&coldir=asc');

    const save = page.getByRole('button', { name: /Save current view/i });
    await expect(save).toBeEnabled();
    await save.click();
    await page.getByPlaceholder('Name this view…').fill('Assigned by due date');
    await page.getByRole('button', { name: /^Save$/ }).click();

    // Exact — the row's sibling is `Delete view <name>`, which a loose regex
    // also matches.
    const view = page.getByRole('button', { name: 'Assigned by due date', exact: true });
    await expect(view).toBeVisible({ timeout: 15_000 });

    // Walk away from the view, then apply it: the params must come back.
    await page.getByRole('button', { name: /^Everything\b/ }).first().click();
    await expect(page).not.toHaveURL(/[?&]scope=assigned\b/);

    await view.click();
    await expect(page).toHaveURL(/[?&]scope=assigned\b/);
    await expect(page).toHaveURL(/[?&]colsort=due\b/);

    // Delete it again, so the suite is idempotent against the QA org rather
    // than leaving a row that makes the next run assert on its own residue.
    //
    // Wait for the DELETE to actually land, not just for the row to vanish:
    // `removeView` is optimistic, so the list empties before the request
    // resolves. Ending the test there tears the context down mid-flight and the
    // row survives on the server — a green test that silently accumulates rows
    // (observed on the dogfood org 2026-08-01).
    const deleted = page.waitForResponse(
      (r) => /\/api\/saved-views\/\d+$/.test(r.url()) && r.request().method() === 'DELETE',
    );
    await page.getByRole('button', { name: 'Delete view Assigned by due date' }).click();
    expect((await deleted).ok()).toBe(true);
    await expect(view).toHaveCount(0);

    // …and it is gone from the SERVER, not just the optimistic list.
    await page.reload();
    await expect(page.locator(GRID).first()).toBeVisible({ timeout: 30_000 });
    await expect(view).toHaveCount(0);
  });

  test('a queue link in the chrome leaves for that queue’s page', async ({ page }) => {
    await openToday(page);
    await page.getByRole('link', { name: /Orders/ }).first().click();
    await expect(page).toHaveURL(/\/dashboard/);
  });
});
