import { test, expect, type Page } from '@playwright/test';
import { QA_FIXTURE_MY_DAY } from '@/lib/tenancy/qa-org';

/**
 * Home → Today (`/`, the `MyDayWorkspace` region) — the workbench contract.
 *
 * Covers the F0 rebuild's hand-checked invariants plus the four chrome-parity
 * controls added 2026-08-01 (saved views · scoped search · Fields ·
 * due-horizon refine — the last of which moved from a body KPI band into the
 * chrome band in the same pass, which is why its test asserts ALTITUDE as well
 * as behaviour: a chip that filters correctly from the wrong altitude is the
 * regression, and only a geometry check catches it).
 *
 * **Runs against real QA fixtures — the BFF stub is gone (2026-08-02.)** This
 * spec used to `page.route` `GET /api/my-day` and fulfil a hand-written feed,
 * because the QA org provisioned no `work_assignments`. That stub stayed green
 * through a real bug: `myDayTasksFromFeed` emitted the top work order TWICE on
 * any genuine feed, because `doNext` is a POINTER into `assigned` rather than a
 * disjoint bucket — and every hand-written fixture gave `doNext` an id no other
 * row used, so the collision could not occur. It surfaced only as a React
 * duplicate-key error on a dogfood run.
 *
 * The general lesson, now enforced here: **a stubbed BFF response proves the
 * chrome, never the read model.** `scripts/provision-qa-org.ts` seeds three TEST
 * assignments (one per due horizon) plus an undated support follow-up; see
 * `QA_FIXTURE_MY_DAY` for why `doNext` is derived rather than seeded.
 *
 * Assertions name specific rows rather than totals: the QA org's other fixtures
 * may legitimately add work to the signed-in admin's lanes, and a count
 * assertion would make this spec fail for someone else's seed. The one place a
 * count IS the assertion is the duplicate-row check, which is the whole point.
 */

const GRID = '[data-testid="my-day-grid-body"]';
const INSPECTOR = '[role="region"][aria-label="Task details"]';

const OVERDUE = QA_FIXTURE_MY_DAY.overdue.title;
const DUE_TODAY = QA_FIXTURE_MY_DAY.dueToday.title;
const UPCOMING = QA_FIXTURE_MY_DAY.upcoming.title;
const INTERRUPT = QA_FIXTURE_MY_DAY.interruptTitle;

async function openToday(page: Page, search = '') {
  await page.goto(`/${search}`);
  await expect(page.locator(GRID).first()).toBeVisible({ timeout: 30_000 });
}

const row = (page: Page, title: string) =>
  page.locator(`[role="button"][aria-label="Task ${title}"]`).first();

/**
 * The work-order id for a fixture title, read from the live feed.
 *
 * Ids are `ORDER:<row id>` — assigned by the database, so a spec cannot hardcode
 * them the way it could with a stub. Reading them back from the same endpoint
 * the page uses keeps the deep-link test honest about what it is reproducing.
 */
async function taskIdByTitle(page: Page, title: string): Promise<string> {
  const res = await page.request.get('/api/my-day');
  expect(res.ok(), `GET /api/my-day → ${res.status()}`).toBe(true);
  const feed = (await res.json()) as {
    doNext: { id: string; title: string } | null;
    assigned: Array<{ id: string; title: string }>;
  };
  const hit = [feed.doNext, ...feed.assigned].find((r) => r && r.title === title);
  expect(hit, `no work order titled "${title}" — re-run \`pnpm provision:qa-org\``).toBeTruthy();
  return hit!.id;
}

test.describe('Home → Today workbench', () => {
  test.skip(({ browserName }) => browserName === 'webkit', 'desktop workbench chrome');

  test('the do-next task appears EXACTLY once, not twice', async ({ page }) => {
    // The regression the stub could never catch. `aggregateMyDayFeed` returns
    // the same work order as `doNext` AND as `assigned[0]`, so a concat without
    // a dedupe renders it twice — duplicate React key, doubled row, lane and
    // due-horizon counts inflated by one.
    const res = await page.request.get('/api/my-day');
    expect(res.ok()).toBe(true);
    const feed = (await res.json()) as {
      doNext: { id: string; title: string } | null;
      assigned: Array<{ id: string }>;
    };

    // Precondition: the fixtures really do put doNext inside assigned. If this
    // ever stops holding, the test below is passing for the wrong reason.
    expect(feed.doNext, 'no doNext — re-run `pnpm provision:qa-org`').toBeTruthy();
    expect(feed.assigned.map((r) => r.id)).toContain(feed.doNext!.id);

    await openToday(page);
    await expect(
      page.locator(`[role="button"][aria-label="Task ${feed.doNext!.title}"]`),
    ).toHaveCount(1);
  });

  test('lane tab writes ?scope= and changes the row count', async ({ page }) => {
    await openToday(page);
    await expect(row(page, OVERDUE)).toBeVisible();
    await expect(row(page, INTERRUPT)).toBeVisible();

    await page.getByRole('button', { name: /^Needs attention\b/ }).first().click();
    await expect(page).toHaveURL(/[?&]scope=attention\b/);

    // The lane is a real filter, not just a lit tab.
    await expect(row(page, INTERRUPT)).toBeVisible();
    await expect(row(page, OVERDUE)).toHaveCount(0);
  });

  test('row click writes ?task= and opens a non-modal region — never a dialog', async ({ page }) => {
    const id = await taskIdByTitle(page, DUE_TODAY);
    await openToday(page);
    await row(page, DUE_TODAY).click();

    await expect(page).toHaveURL(new RegExp(`[?&]task=${encodeURIComponent(id)}\\b`));
    await expect(page.locator(INSPECTOR)).toBeVisible();
    // Navigators push, inspectors float: the record plane must not claim modality
    // it does not enforce (`source-of-truth.md` → Right-rail modality).
    await expect(page.locator('[role="dialog"][aria-label="Task details"]')).toHaveCount(0);
  });

  test('a deep link reproduces lane, selection and column sort together', async ({ page }) => {
    const id = await taskIdByTitle(page, UPCOMING);
    await openToday(
      page,
      `?scope=assigned&task=${encodeURIComponent(id)}&colsort=due&coldir=asc`,
    );

    // Assert the lane's EFFECT, not the tab's markup: the strip styles its
    // active pill rather than carrying aria-selected, so a markup assertion here
    // would be testing TabSwitch's internals instead of whether the deep link
    // reproduced the view.
    await expect(row(page, DUE_TODAY)).toBeVisible();
    await expect(row(page, INTERRUPT)).toHaveCount(0);

    await expect(page.locator(INSPECTOR)).toBeVisible();
    await expect(
      page.getByRole('columnheader', { name: /Due/ }).first(),
    ).toHaveAttribute('aria-sort', 'ascending');
  });

  test('selection does not change a row’s height', async ({ page }) => {
    await openToday(page);
    const target = row(page, DUE_TODAY);
    const sibling = row(page, UPCOMING);

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
    // The needle is the ORDER ID — what an operator would actually type at a row
    // they can see. It must be the `-3` suffixed one: the search is a substring
    // match, and the unsuffixed `QA-TEST-UNSHIP-PENDING` is a PREFIX of the other
    // two, so it would match all three and prove nothing.
    const needle = QA_FIXTURE_MY_DAY.upcoming.orderId;
    await page.getByPlaceholder('Filter tasks…').fill(needle);

    await expect(page).toHaveURL(new RegExp(`[?&]q=${encodeURIComponent(needle)}`));
    await expect(row(page, UPCOMING)).toBeVisible();
    await expect(row(page, OVERDUE)).toHaveCount(0);
  });

  test('no-match reads differently from no-data', async ({ page }) => {
    await openToday(page, '?q=zzzznothingmatches');
    // "No matches" names the control that would widen it; the all-clear copy
    // ("Nothing needs you right now") would claim the day is empty.
    await expect(page.getByText(/No tasks match/i)).toBeVisible();
    await expect(page.getByText(/Nothing needs you right now/i)).toHaveCount(0);
  });

  test('the due-horizon chips live in the chrome and each filters to its own bucket', async ({
    page,
  }) => {
    await openToday(page);

    // Scoped to the chip group, not the whole page: "Today" is a common word on
    // this route, and an unscoped accessible-name match would be asserting
    // against whatever else happens to carry it.
    const chips = page.getByTestId('my-day-due-horizon');
    const chip = (name: RegExp) => chips.getByRole('button', { name });

    await expect(chip(/^Overdue\b/)).toBeVisible();
    await expect(chip(/^Today\b/)).toBeVisible();
    await expect(chip(/^Upcoming\b/)).toBeVisible();

    // The refine is CHROME now, not a body band — it must sit inside the
    // workbench header, above and outside the grid's own scroll port. This is
    // the altitude assertion; the bucket assertions below are the behaviour.
    const chipsBox = (await chips.boundingBox())!;
    const gridBox = (await page.locator(GRID).first().boundingBox())!;
    expect(chipsBox.y + chipsBox.height).toBeLessThanOrEqual(gridBox.y);

    // The horizons must actually partition: the overdue fixture shows, and
    // neither the upcoming one nor the undated interrupt leaks into the bucket.
    await chip(/^Overdue\b/).click();
    await expect(page).toHaveURL(/[?&]filter=overdue\b/);
    await expect(chip(/^Overdue\b/)).toHaveAttribute('aria-pressed', 'true');
    await expect(row(page, OVERDUE)).toBeVisible();
    await expect(row(page, UPCOMING)).toHaveCount(0);
    await expect(row(page, DUE_TODAY)).toHaveCount(0);
    // The interrupt has no deadline, so it belongs to no horizon at all —
    // `myDayDueHorizon` returns null rather than folding it into `upcoming`.
    await expect(row(page, INTERRUPT)).toHaveCount(0);

    // The lit chip is its own escape hatch.
    await chip(/^Overdue\b/).click();
    await expect(page).not.toHaveURL(/[?&]filter=/);
    await expect(chip(/^Overdue\b/)).toHaveAttribute('aria-pressed', 'false');
  });

  test('column display opens from the grid’s own header — no chrome Fields survives', async ({
    page,
  }) => {
    await openToday(page);

    // Retargeted 2026-08-02 (chrome Fields deleted), then again 2026-08-08:
    // the card-corner hover-reveal float is DELETED codebase-wide. ▦ is now
    // portal-or-nothing, and My Day portals it into its Band-3 controls slot
    // (`MyDayWorkspace` controlsSlotRef → columnTriggerPortalTarget), so the
    // control is RESIDENT — there is nothing to hover.
    const triggerHost = page.locator('[data-grid-column-details-trigger]');
    const lip = triggerHost.getByRole('button', { name: 'Column display' });
    const rail = page.getByRole('region', { name: 'Column display' });

    // **Scope: the DOOR, not the mechanics.** Toggling a track and asserting
    // the header gains/loses it is `grid-column-fields-lip.spec.ts`'s job, and
    // it does it properly — with a `restoreDefaults` in both hooks, because
    // those toggles persist a per-staff delta to the DATABASE and leak into
    // every later spec that asserts default columns. Re-running the mechanics
    // here would buy no new information about the lip and would need that same
    // cleanup apparatus to avoid poisoning Today's other tests. What is
    // Today-specific — and what this pass changed — is which door exists.
    await expect(page.getByRole('button', { name: /^Fields/ })).toHaveCount(0);
    // Resident, not revealed: visible with the pointer parked off the grid.
    await page.mouse.move(0, 0);
    await expect(triggerHost).toBeVisible();

    await lip.click();
    await expect(rail).toBeVisible();
    // The rail knows it is Today's grid, not some other surface's.
    await expect(
      rail.locator('[role="option"][data-column-details-key="queue"]'),
    ).toHaveCount(1);

    // Leave no delta behind: this test never toggles, so Reset should not even
    // render — but if an earlier run died mid-toggle, clear it rather than
    // letting Today's default-column assumptions rot.
    const reset = rail.getByRole('button', { name: /Reset/i });
    if (await reset.count()) {
      await reset.click();
      await page.waitForTimeout(250);
    }

    await rail.getByRole('button', { name: 'Done' }).click();
    await expect(rail).toHaveCount(0);
    await expect(page.locator('[role="columnheader"][data-col="queue"]')).toHaveCount(0);
  });

  test('home is rail-less; saved views live on Band 3', async ({ page }) => {
    await openToday(page);
    await expect(page.locator('main [data-context-panel]')).toHaveCount(0);
    const views = page.getByRole('button', { name: /Saved views/i });
    await expect(views).toBeVisible();
    await views.click();
    // Save is disabled until something is actually narrowed — a view that
    // captures the default view is not a view.
    await expect(page.getByRole('button', { name: /Save current view/i })).toBeDisabled();
  });

  test('saving a view captures the narrowed URL, and applying it restores that URL', async ({
    page,
  }) => {
    await openToday(page, '?scope=assigned&colsort=due&coldir=asc');

    await page.getByRole('button', { name: /Saved views/i }).click();
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
    // Lane tabs close the Views popover — reopen before applying / deleting.
    await page.getByRole('button', { name: /^All\b/ }).first().click();
    await expect(page).not.toHaveURL(/[?&]scope=assigned\b/);

    await page.getByRole('button', { name: /Saved views/i }).click();
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
    // Applying the view leaves the popover open — do not toggle it closed.
    const deleted = page.waitForResponse(
      (r) => /\/api\/saved-views\/\d+$/.test(r.url()) && r.request().method() === 'DELETE',
    );
    await page.getByRole('button', { name: 'Delete view Assigned by due date' }).click();
    expect((await deleted).ok()).toBe(true);
    await expect(view).toHaveCount(0);

    // …and it is gone from the SERVER, not just the optimistic list.
    await page.reload();
    await expect(page.locator(GRID).first()).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: /Saved views/i }).click();
    await expect(view).toHaveCount(0);
  });

  test('the chrome band carries no queue doors — it controls the rows below it', async ({
    page,
  }) => {
    await openToday(page);

    // Inverted 2026-08-01. This used to assert the queue link WAS in the chrome
    // and navigated; the chrome-altitude pass removed it, because a link that
    // leaves the surface is navigation, and the band's one job is controlling
    // the data mounted below it. Kept as the inverse rather than deleted: an
    // assertion that a control is absent from a band is the only thing that
    // stops it drifting back in the next time someone needs somewhere to put a
    // count.
    //
    // Located by HREF, not by accessible name — the spine and the integrations
    // settings both carry links whose names contain "Orders", so a name regex
    // proves nothing about the chrome. The href is the SoT (`QUEUE_SURFACE_LINKS`
    // in `aggregate-my-day.ts`).
    const chrome = page.locator('main').getByRole('button', { name: /^All\b/ });
    await expect(chrome.first()).toBeVisible();

    const chromeBox = (await chrome.first().boundingBox())!;
    const queueDoor = page.locator(`a[href="/dashboard?unshipped"]`);
    for (const link of await queueDoor.all()) {
      const box = await link.boundingBox();
      if (!box) continue;
      // A surviving link may legitimately live in the MasterNav spine (its
      // destination — see `MyDayWorkspace`), which is to the LEFT of the band.
      // What must not exist is one sharing the band's row.
      const sharesBandRow =
        box.y < chromeBox.y + chromeBox.height && box.y + box.height > chromeBox.y;
      expect(
        sharesBandRow && box.x > chromeBox.x,
        'a queue door reappeared in the Today chrome band',
      ).toBe(false);
    }
  });

  test('flush sheet grid + Add watch CTA live in the chrome trailing cluster', async ({
    page,
  }) => {
    await openToday(page);

    // Sheets flush — no framed island; Unbox golden port.
    await expect(page.locator(`${GRID}[data-table-surface="sheet"]`).first()).toBeVisible();

    const add = page.getByRole('button', { name: 'Watch a ticket or tracking number' });
    await expect(add).toBeVisible();

    // Shares the chrome band row with All (trailing cluster, top-right).
    const allTab = page.locator('main').getByRole('button', { name: /^All\b/ }).first();
    const allBox = (await allTab.boundingBox())!;
    const addBox = (await add.boundingBox())!;
    const sharesBandRow =
      addBox.y < allBox.y + allBox.height &&
      addBox.y + addBox.height > allBox.y;
    expect(sharesBandRow, 'Add CTA must sit on the chrome band row').toBe(true);
    expect(addBox.x > allBox.x, 'Add CTA must be trailing (right of tabs)').toBe(true);

    await add.click();
    await expect(page).toHaveURL(/[?&]watch=1\b/);
    await expect(page.getByRole('region', { name: 'Watch ticket or tracking' })).toBeVisible();
    await expect(page.getByLabel('Ticket number')).toBeVisible();
  });

  test('Add → Watch ticket appends to the Ticket list and stays open', async ({ page }) => {
    const ticketId = 991122;
    let tickets = [] as Array<{ ticketId: number; subject: string | null; updatedAtMs: number }>;

    await page.route('**/api/my-day/watch', async (route) => {
      const method = route.request().method();
      if (method === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ ok: true, tickets, tracking: [] }),
        });
        return;
      }
      if (method !== 'POST') {
        await route.continue();
        return;
      }
      const body = route.request().postDataJSON() as { kind: string; value: string };
      expect(body.kind).toBe('ticket');
      tickets = [
        {
          ticketId,
          subject: `Watched ticket #${ticketId}`,
          updatedAtMs: Date.now(),
        },
      ];
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          kind: 'ticket',
          ticketId,
          subject: `Watched ticket #${ticketId}`,
          taskId: `support-${ticketId}`,
        }),
      });
    });

    await openToday(page);
    await page.getByRole('button', { name: 'Watch a ticket or tracking number' }).click();
    await expect(page.getByRole('region', { name: 'Watch ticket or tracking' })).toBeVisible();
    // Icon density strip names the selected display (Ticket).
    await expect(page.getByRole('button', { name: 'Ticket' })).toBeVisible();
    await page.getByLabel('Ticket number').fill(String(ticketId));
    await page.getByRole('button', { name: /^Watch$/ }).click();

    // Stays on the Watch rail — Displays pattern (append to list, do not select task).
    await expect(page).toHaveURL(/[?&]watch=1\b/);
    await expect(page).not.toHaveURL(/[?&]task=/);
    await expect(page.getByRole('list', { name: 'Watched ticket list' })).toBeVisible();
    await expect(page.getByText(`#${ticketId}`)).toBeVisible();
    await expect(page.getByRole('button', { name: /^Stop$/ })).toBeVisible();
  });

  test('Stop watching clears the assignment and closes the inspector', async ({ page }) => {
    const feedRes = await page.request.get('/api/my-day');
    expect(feedRes.ok()).toBe(true);
    const feed = (await feedRes.json()) as {
      interrupts: Array<{ id: string; kind: string; ticketId?: number; title: string }>;
    };
    const interrupt = feed.interrupts.find((i) => i.kind === 'support_followup' && i.ticketId);
    test.skip(!interrupt, 'QA org has no support_followup — re-run provision:qa-org');

    const ticketId = interrupt!.ticketId!;
    let cleared = false;
    await page.route(`**/api/zendesk/tickets/${ticketId}/assign`, async (route) => {
      if (route.request().method() !== 'POST') {
        await route.continue();
        return;
      }
      const body = route.request().postDataJSON() as { staffId: number | null };
      expect(body.staffId).toBeNull();
      cleared = true;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, assignment: null }),
      });
    });

    await openToday(page, `?task=${encodeURIComponent(interrupt!.id)}`);
    await expect(page.locator(INSPECTOR)).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: 'Stop watching' }).click();
    expect(cleared).toBe(true);
    await expect(page.locator(INSPECTOR)).toHaveCount(0);
  });
});
