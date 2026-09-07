import { test, expect, type Page } from '@playwright/test';

/**
 * TEMPORARY verification harness for handoff task B (roll the new default order
 * onto existing operators without overwriting their arrangement).
 * Delete after human verification.
 */

const NAV_COLUMN_OPEN = '[data-sidebar-nav-column][data-open="true"]';

async function openSpine(page: Page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.locator('main').first().waitFor({ state: 'visible', timeout: 45_000 });
  await page.waitForTimeout(2_000);
  if ((await page.locator(NAV_COLUMN_OPEN).count()) === 0) {
    await page.locator('header button').first().click();
  }
  await expect(page.locator(NAV_COLUMN_OPEN)).toBeVisible();
}

async function putPrefs(page: Page, patch: unknown) {
  const res = await page.request.put('/api/staff-preferences', { data: patch });
  expect(res.ok(), await res.text()).toBeTruthy();
}

async function readPrefs(page: Page) {
  const res = await page.request.get('/api/staff-preferences');
  expect(res.ok()).toBeTruthy();
  const body = (await res.json()) as {
    prefs: { spineSlots?: string[] | null; spineSlotsVersion?: number | null };
  };
  return body.prefs;
}

/** Where each spine section label sits in reading order. */
async function navOrder(page: Page) {
  const text = await page.locator(NAV_COLUMN_OPEN).innerText();
  const flat = text.replace(/\s+/g, ' ');
  return {
    automations: flat.indexOf('Automations'),
    stations: flat.indexOf('Stations'),
    workspaces: flat.indexOf('Workspaces'),
    flat,
  };
}

test('a saved order is floated once, respected after, and resettable', async ({ page }) => {
  test.setTimeout(180_000);
  await openSpine(page);

  // ── An operator who arranged their spine BEFORE the new default shipped:
  //    Automations last, no version stamp.
  await putPrefs(page, { spineSlots: ['desks', 'floor', 'studio'], spineSlotsVersion: null });
  await openSpine(page);
  await page.waitForTimeout(2_500);

  const floated = await navOrder(page);
  console.log(`[verify] after float: ${floated.flat.slice(0, 220)}`);
  expect(floated.automations).toBeGreaterThan(-1);
  expect(floated.automations).toBeLessThan(floated.stations);
  expect(floated.automations).toBeLessThan(floated.workspaces);
  await page.locator(NAV_COLUMN_OPEN).screenshot({
    path: 'tests/.artifacts/task-b-1-automations-floated.png',
  });

  // The float is PERSISTED and STAMPED — order preserved apart from the lead.
  const stamped = await readPrefs(page);
  console.log(`[verify] stamped prefs: ${JSON.stringify(stamped)}`);
  expect(stamped.spineSlotsVersion).toBe(1);
  // The lead moved; their relative order (desks before floor) is untouched.
  // Hydrate also appends catalog ids that appeared since they last saved.
  expect(stamped.spineSlots?.[0]).toBe('studio');
  expect(stamped.spineSlots?.indexOf('desks')).toBeLessThan(
    stamped.spineSlots?.indexOf('floor') ?? -1,
  );

  // ── The operator deliberately drags Automations back down, on this version.
  await putPrefs(page, { spineSlots: ['floor', 'desks', 'studio'], spineSlotsVersion: 1 });
  await openSpine(page);
  await page.waitForTimeout(2_500);

  const kept = await navOrder(page);
  console.log(`[verify] after their own reorder: ${kept.flat.slice(0, 220)}`);
  expect(kept.automations).toBeGreaterThan(kept.stations);
  const unchanged = await readPrefs(page);
  expect(unchanged.spineSlots?.slice(0, 3)).toEqual(['floor', 'desks', 'studio']);
  await page.locator(NAV_COLUMN_OPEN).screenshot({
    path: 'tests/.artifacts/task-b-2-arrangement-respected.png',
  });

  // ── Agency: Reset nav order re-derives the current default.
  await page.getByRole('button', { name: 'Account details' }).click();
  // The dev reskin HUD is fixed bottom-left and overlaps the footer menu.
  await page.addStyleTag({ content: '[data-design-lab-hud]{display:none !important}' });
  const menu = page.getByRole('menu', { name: 'Account details' });
  await expect(menu).toBeVisible();
  await menu.screenshot({ path: 'tests/.artifacts/task-b-3-reset-affordance.png' });
  await menu.getByRole('menuitem', { name: 'Reset nav order' }).click();
  await expect(page.getByText('Nav order reset to the default')).toBeVisible({ timeout: 10_000 });

  await page.waitForTimeout(1_500);
  const reset = await readPrefs(page);
  console.log(`[verify] after reset: ${JSON.stringify(reset)}`);
  expect(reset.spineSlots ?? null).toBeNull();
  const back = await navOrder(page);
  expect(back.automations).toBeLessThan(back.stations);
  await page.screenshot({ path: 'tests/.artifacts/task-b-4-after-reset.png' });

  // Leave prefs clean for the next run.
  await putPrefs(page, { spineSlots: null, spineSlotsVersion: null });
});
