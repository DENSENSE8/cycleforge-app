/**
 * Packer KPI — the operator's acceptance run. `npm run test:e2e:packer-kpi`.
 *
 * NOT a CI gate, and deliberately not wired into `verify`: it reads the LIVE
 * lane's packing history, so what it can assert depends on what the floor
 * actually packed. Each test therefore branches on the data it found and says
 * so on stdout. The invariant coverage lives in
 * `src/lib/packing/pack-standard-stops.test.ts`, which needs no database.
 *
 * What it proves against `:3050` (operator DoD, 2026-09-15):
 *   1. Time to pack is settable on the Products desk record and PERSISTS, with
 *      the tier derived from the minutes.
 *   2. `/m/reports` → Packing lists every packer for a chosen day, walks days,
 *      and a tap drills into WHAT that packer packed — order ref, item number,
 *      SKU, and that SKU's time to pack (or the unpaired fallback, named).
 *   3. The DESK read is `/reports?tab=packer` — one row per pack, with the
 *      day stepper, the `Basis` column and the Fields menu the registered
 *      table engine provides. `/operations?mode=analytics` was RETIRED
 *      2026-09-16, so this test also pins that its door is gone.
 *   4. Monitor and Automations are PARKED — no sidebar row on any surface,
 *      while both routes still resolve.
 */

import { test, expect } from '@playwright/test';

test('DoD 1 — Products desk record sets and persists time to pack', async ({ page }) => {
  const list = await page.request.get('/api/sku-catalog?limit=1');
  expect(list.ok(), `sku-catalog list should answer (got ${list.status()})`).toBeTruthy();
  const body = (await list.json()) as { items?: Array<{ id: number; sku: string }> };
  const sku = body.items?.[0]?.sku;
  expect(sku, 'need at least one catalog SKU to verify against').toBeTruthy();

  const detail = await page.request.get(`/api/products/${encodeURIComponent(sku!)}`);
  const detailBody = (await detail.json()) as {
    packProfile?: { minutes: number; tier: string; source: string };
  };
  expect(detailBody.packProfile, 'record payload carries packProfile').toBeTruthy();
  const before = detailBody.packProfile!.minutes;
  // eslint-disable-next-line no-console
  console.log('sku', sku, 'packProfile before', detailBody.packProfile);

  await page.goto(`/products/sku/${encodeURIComponent(sku!)}`);
  const card = page.locator('section').filter({ hasText: 'Time to pack' }).first();
  await expect(card).toBeVisible({ timeout: 30_000 });

  const slider = card.getByRole('slider', { name: 'Time to pack' });
  await expect(slider).toBeVisible();

  /*
   * Aim at a stop the SKU is NOT already on: `Save` is disabled when the draft
   * equals the stored value (no no-op writes), so a fixed target makes the
   * test pass once and then hang on a disabled button.
   * PACK_STANDARD_MINUTE_STOPS = [1,2,3,5,8,10,15,20,25,30,45,60].
   */
  const target = before === 3 ? { minutes: 5, steps: 3 } : { minutes: 3, steps: 2 };
  await slider.focus();
  await slider.press('Home');
  for (let i = 0; i < target.steps; i += 1) await slider.press('ArrowRight');
  await expect(card.getByText(`${target.minutes} min`)).toBeVisible();

  await card.getByRole('button', { name: 'Save' }).click();

  /*
   * Poll the record API rather than reading it once: `Save` reports disabled
   * for the in-flight `saving` state too, so a single read right after the
   * click can land BEFORE the PATCH commits and see the old standard.
   */
  await expect
    .poll(
      async () => {
        const res = await page.request.get(`/api/products/${encodeURIComponent(sku!)}`);
        const b = (await res.json()) as { packProfile?: { minutes: number } };
        return b.packProfile?.minutes ?? null;
      },
      { timeout: 30_000 },
    )
    .toBe(target.minutes);

  const after = await page.request.get(`/api/products/${encodeURIComponent(sku!)}`);
  const afterBody = (await after.json()) as {
    packProfile: { minutes: number; tier: string; source: string };
  };
  // eslint-disable-next-line no-console
  console.log('packProfile after', afterBody.packProfile);
  // Tier is DERIVED from minutes — both targets are SMALL (< 9.5 min).
  expect(afterBody.packProfile.tier).toBe('SMALL');
  expect(afterBody.packProfile.source).toBe('profile');
  // eslint-disable-next-line no-console
  console.log('was', before, 'min → now', afterBody.packProfile.minutes, 'min');

  await page.screenshot({ path: 'test-results/pk-products-desk.png' });
});

test('DoD 2 — /m/reports Packing lists packers, walks days, drills into packs', async ({ page }) => {
  // Phone viewport on Chromium: the repo's `mobile` project is WebKit and this
  // host is missing its system libs. `/m/reports` is a real route, so a narrow
  // Chromium viewport exercises the same component tree.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/m/reports');

  const packingTab = page.getByRole('button', { name: 'Packing', exact: true });
  await expect(packingTab).toBeVisible({ timeout: 30_000 });
  /*
   * Retry the click until the Packing body paints. The first click can land
   * before hydration attaches the handler, which silently leaves the
   * Checklist tab mounted — and the Checklist roster row's aria-label
   * (`Ana, 0 of 8 checked`) is close enough to a packer row's that a stale tab
   * reads as a found packer. Asserting on Packing-only copy closes that.
   */
  await expect(async () => {
    await packingTab.click();
    await expect(page.getByText(/capacity/).first()).toBeVisible({ timeout: 4_000 });
  }).toPass({ timeout: 60_000 });

  /*
   * Walk back to a day that has PAIRED packs — the operator's DoD is the time
   * to pack "for that SKU that has already been paired within the system", so
   * a day of unpaired tracking scans proves only the fallback copy. Falls back
   * to any day with packs, then to the empty state.
   */
  type Kpi = {
    ok: boolean;
    day: string;
    by_packer: Array<{ staff_id: number; staff_name: string | null; weighted_minutes: number }>;
  };
  const dayBack = (day: string, n: number) => {
    const d = new Date(`${day}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - n);
    return d.toISOString().slice(0, 10);
  };
  const readKpi = async (day?: string) =>
    (await (
      await page.request.get(`/api/packing/kpi${day ? `?day=${day}` : ''}`)
    ).json()) as Kpi;
  const pairedCount = async (day: string) => {
    const res = await page.request.get(`/api/packing/reports/export?format=json&day=${day}`);
    const b = (await res.json()) as { rows: Array<{ sku: string | null }> };
    return b.rows.filter((r) => r.sku).length;
  };

  const today = (await readKpi()).day;
  let kpi = await readKpi();
  let backSteps = 0;
  let anyPacks: { kpi: Kpi; backSteps: number } | null =
    kpi.by_packer.length > 0 ? { kpi, backSteps: 0 } : null;
  for (let n = 0; n <= 14; n += 1) {
    const day = dayBack(today, n);
    kpi = await readKpi(day);
    if (kpi.by_packer.length === 0) continue;
    if (!anyPacks) anyPacks = { kpi, backSteps: n };
    if ((await pairedCount(day)) > 0) {
      backSteps = n;
      break;
    }
    if (n === 14 && anyPacks) {
      kpi = anyPacks.kpi;
      backSteps = anyPacks.backSteps;
    }
  }
  // eslint-disable-next-line no-console
  console.log('day read:', kpi.day, 'packers:', kpi.by_packer.length, 'back steps:', backSteps);

  // Walk the stepper back the same number of days the API walked.
  for (let i = 0; i < backSteps; i += 1) {
    await page.getByRole('button', { name: 'Previous day' }).click();
  }

  if (kpi.by_packer.length === 0) {
    await expect(page.getByText('Nobody packed that day.')).toBeVisible();
    // eslint-disable-next-line no-console
    console.log('no packed days in the last 10 — empty state verified instead');
    return;
  }

  /*
   * Pick the packer who actually has a PAIRED pack that day. The day can hold
   * one paired row out of fifty while the busiest packer's are all unpaired
   * tracking scans — drilling into them would only ever prove the fallback.
   */
  type ItemRows = {
    rows: Array<{ sku: string | null; itemNumber: string | null; estimatedMinutes: number }>;
  };
  const rowsFor = async (staffId: number) =>
    (await (
      await page.request.get(
        `/api/packing/reports/export?format=json&day=${kpi.day}&packerId=${staffId}`,
      )
    ).json()) as ItemRows;

  let first = kpi.by_packer[0];
  for (const candidate of kpi.by_packer) {
    const r = await rowsFor(candidate.staff_id);
    if (r.rows.some((x) => x.sku)) {
      first = candidate;
      break;
    }
  }
  const label = first.staff_name || `Staff #${first.staff_id}`;
  // `N packed` is the packer row's aria-label shape and the Checklist row's is
  // `N of M checked` — anchoring on it cannot match the other tab.
  const row = page.getByRole('button', { name: new RegExp(`^${label}, \\d+ packed`) });
  await expect(row).toBeVisible({ timeout: 20_000 });
  await page.screenshot({ path: 'test-results/pk-mobile-packers.png' });

  await row.click();

  // The drill-down: what they packed, with the SKU's time to pack.
  const itemsBody = await rowsFor(first.staff_id);
  // eslint-disable-next-line no-console
  console.log('their packs:', itemsBody.rows.length, itemsBody.rows.slice(0, 3));

  await expect(page.getByText(/standard$/).first()).toBeVisible({ timeout: 20_000 });
  if (itemsBody.rows.length > 0) {
    await expect(page.getByText(/packs? ·/).first()).toBeVisible();
    const paired = itemsBody.rows.filter((r) => r.sku).length;
    // eslint-disable-next-line no-console
    console.log('paired rows:', paired, 'of', itemsBody.rows.length);
    if (paired > 0) {
      // A paired SKU links to its product record, where its standard is set.
      const link = page.getByText('Time to pack for this SKU').first();
      await expect(link).toBeVisible();
      await link.scrollIntoViewIfNeeded();
    } else {
      // Nothing paired: the sheet must SAY the standard is a default, not imply
      // somebody set it.
      await expect(page.getByText(/Not paired to a catalog SKU/).first()).toBeVisible();
    }
  }
  await page.screenshot({ path: 'test-results/pk-mobile-packer-items.png' });
});

test('DoD 3 — /reports?tab=packer is the desk read, one row per pack', async ({ page }) => {
  /*
   * Find a day with packs BEFORE asserting the grid: the engine paints no
   * column headers over an empty feed, so an early-morning run would fail on
   * "no Product column" when the honest answer is "nothing packed yet".
   */
  await page.goto('/reports?tab=packer');
  const readDay = async (day?: string) => {
    const res = await page.request.get(
      `/api/packing/reports/export?format=json${day ? `&day=${day}` : ''}`,
    );
    return (await res.json()) as { rows: Array<{ sku: string | null }> };
  };
  const dayBack = (day: string, n: number) => {
    const d = new Date(`${day}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - n);
    return d.toISOString().slice(0, 10);
  };
  const today = new Date().toISOString().slice(0, 10);
  let steps = 0;
  let rows = (await readDay()).rows;
  while (rows.length === 0 && steps < 14) {
    steps += 1;
    rows = (await readDay(dayBack(today, steps))).rows;
  }
  // eslint-disable-next-line no-console
  console.log('desk day: back', steps, 'days ·', rows.length, 'packs');

  const grid = page.locator('[data-testid="report-packer-day-grid-body"]');
  const empty = page.getByText('No packs recorded on this day.');
  await expect(grid.or(empty).first()).toBeVisible({ timeout: 60_000 });

  // Walk the desk stepper to that day. Retry: the first click can land before
  // hydration attaches the handler.
  for (let i = 0; i < steps; i += 1) {
    await expect(async () => {
      const before = await page.getByText(/rows$/).first().innerText();
      await page.getByRole('button', { name: '‹ Earlier' }).click();
      await expect(page.getByText(/rows$/).first()).not.toHaveText(before, { timeout: 5_000 });
    }).toPass({ timeout: 30_000 });
  }

  if (rows.length === 0) {
    // eslint-disable-next-line no-console
    console.log('no packed day in the last 14 — empty state verified instead');
    await expect(empty).toBeVisible();
    await page.screenshot({ path: 'test-results/pk-reports-packer.png' });
    return;
  }

  // The engine's columns, not a hand-rolled table: Product · Packed at · Basis
  // plus the three bound slot tracks (Item # · SKU · Time to pack).
  for (const header of ['Product', 'Packed at', 'Basis', 'Item #', 'SKU', 'Time to pack']) {
    await expect(
      page.getByRole('columnheader', { name: header, exact: false }).first(),
    ).toBeVisible({ timeout: 20_000 });
  }
  // The footnote that keeps the number honest — standard, not measured pace.
  await expect(page.getByText(/standard minutes/)).toBeVisible();

  await page.screenshot({ path: 'test-results/pk-reports-packer.png' });
});

test('DoD 4 — Monitor and Automations are parked: no door, routes still resolve', async ({
  page,
}) => {
  await page.goto('/reports?tab=packer');

  /*
   * The spine collapses per operator preference and the state persists, so the
   * nav landmark can be hidden on load. Open it first — a collapsed sidebar
   * would make this test pass for the wrong reason (every row absent).
   */
  const show = page.getByRole('button', { name: 'Show navigation' });
  if (await show.isVisible().catch(() => false)) await show.click();

  const sidebar = page.getByRole('navigation', { name: 'Sidebar' });
  await expect(sidebar).toBeVisible({ timeout: 60_000 });

  /*
   * Parking removes the DOOR on every surface (`LANE_MOBILE_FIRST` →
   * 'hidden'), so neither lane may paint a row or a group header. Sales and
   * Support are asserted alongside them because they share the mechanism — a
   * regression in the gate would take all four back at once.
   */
  for (const name of ['Operations', 'Automations', 'Sales', 'Support']) {
    await expect(
      sidebar.getByRole('button', { name: new RegExp(`^(Go to )?${name}`) }),
    ).toHaveCount(0);
  }
  // The lanes that were KEPT still paint — the gate must not eat the spine.
  for (const name of ['Inbound', 'Outbound', 'Inventory', 'Products']) {
    await expect(sidebar.getByRole('button', { name: new RegExp(`^${name}`) }).first()).toBeVisible();
  }
  await page.screenshot({ path: 'test-results/pk-parked-sidebar.png' });

  // Hiding a door is not deleting a surface: both routes still answer.
  for (const path of ['/operations', '/studio']) {
    const res = await page.goto(path);
    expect(res?.status(), `${path} must still resolve`).toBeLessThan(400);
  }
});
