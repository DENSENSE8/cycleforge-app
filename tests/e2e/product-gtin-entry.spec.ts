import { test, expect } from '@playwright/test';
import { QA_FIXTURE_SKUS } from '../../src/lib/tenancy/qa-org';

/**
 * Product record → GTIN entry (`sku_catalog.gtin`).
 *
 * The slot this field writes into is frequently ALREADY FULL of a machine-minted
 * restricted-circulation number (`getOrCreateInternalGtin` stamps `02…` the first
 * time a unit label needs one), so the two things worth pinning are the refusals
 * and the round trip — a field that silently accepted a malformed or borrowed
 * GTIN would look completely correct in a screenshot.
 *
 * Refusals run client-side through the SAME `classifyGtinEntry` the route uses,
 * so each assertion below also pins that the two call sites agree.
 *
 * This spec WRITES, so it restores the field to empty at the end. It runs on the
 * QA org (`qa-desktop`), never the dogfood tenant.
 */

const PRODUCT_URL = `/products/sku/${encodeURIComponent(QA_FIXTURE_SKUS.speaker)}`;

/** Licensed prefix 0812345, check digit 6. Accepted by every rung. */
const LICENSED_GTIN = '00812345000016';
/** GS1's own documentation prefix — belongs to their examples, not to a tenant. */
const PLACEHOLDER_GTIN = '0614141000005';
/** What generateInternalGtin stamps for sku_catalog id 10. */
const MINTED_GTIN = '02000000000107';
/** LICENSED_GTIN with the last body digit bumped — check digit no longer matches. */
const BAD_CHECK_DIGIT = '00812345000096';

test('GTIN entry: refuses what a tenant may not claim, stores what it may', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  await page.goto(PRODUCT_URL);

  // The record fetches client-side, so wait for the card itself before looking
  // for a control inside it — otherwise a cold route compile reads as "the
  // pencil is missing" rather than "the page has not rendered yet".
  await expect(page.getByText('Attributes')).toBeVisible({ timeout: 60_000 });

  const openEditor = page.getByRole('button', { name: /GTIN/ });
  await expect(openEditor).toBeVisible({ timeout: 20_000 });
  await openEditor.click();

  // By ROLE, not by label text: the read row's pencil is `aria-label="Edit GTIN"`,
  // which `getByLabel('GTIN')` also matches — so a label-based locator stays
  // "visible" after the editor closes and silently fails a closed-editor check.
  const field = page.getByRole('textbox', { name: 'GTIN' });
  const save = page.getByRole('button', { name: 'Save' });
  await expect(field).toBeVisible();

  // ─ Refusals. Each must name its own reason: a single generic "invalid GTIN"
  //   would leave an operator with a real licensed number unable to tell a typo
  //   from a number the product refuses on principle.
  const refusals: Array<[string, RegExp]> = [
    ['123', /8, 12, 13 or 14 digits/],
    [BAD_CHECK_DIGIT, /check digit/i],
    [PLACEHOLDER_GTIN, /documentation prefix/i],
    [MINTED_GTIN, /clear the field/i],
  ];
  for (const [value, message] of refusals) {
    await field.fill(value);
    await save.click();
    await expect(page.getByText(message), `refusal for ${value}`).toBeVisible();
    // Still in the editor — a refused save must not close and look like it took.
    await expect(field).toBeVisible();
  }

  // ─ The accept path.
  await field.fill(LICENSED_GTIN);
  await save.click();
  await expect(field).toBeHidden();
  await expect(page.getByText(LICENSED_GTIN)).toBeVisible();
  // A licensed key is NOT the internal kind, so the chip must be gone.
  await expect(page.getByText('Internal', { exact: true })).toHaveCount(0);

  // ─ It is actually persisted, not just optimistic local state.
  await page.reload();
  await expect(page.getByText(LICENSED_GTIN)).toBeVisible({ timeout: 20_000 });

  // ─ Restore: blank + save clears back to no licensed GTIN.
  await page.getByRole('button', { name: /GTIN/ }).click();
  await page.getByRole('textbox', { name: 'GTIN' }).fill('');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText(LICENSED_GTIN)).toHaveCount(0);

  expect(errors, `console errors: ${errors.join(' | ')}`).toEqual([]);
});

/**
 * The state an operator most often arrives at: the slot already holds a number,
 * and it is one this app minted rather than one the tenant licensed. Read-only —
 * it never saves, so the fixture survives.
 *
 * The earbuds fixture is seeded with the exact form `getOrCreateInternalGtin`
 * stamps for its own row id (scripts/provision-qa-org.ts), because the field
 * REFUSES a typed restricted-circulation number by design — so this state is
 * unreachable through the UI and can only come from a fixture.
 */
test('an internally-minted GTIN is marked, and the editor opens blank', async ({ page }) => {
  await page.goto(`/products/sku/${encodeURIComponent(QA_FIXTURE_SKUS.earbuds)}`);
  await expect(page.getByText('Attributes')).toBeVisible({ timeout: 60_000 });

  // The chip is DERIVED from the digits, never a stored flag.
  await expect(page.getByText('Internal', { exact: true })).toBeVisible();
  await expect(page.getByText(/^02\d{12}$/)).toBeVisible();

  // Opening seeds BLANK: the operator came to type what they licensed, not to
  // edit ours. Seeding the minted value would invite them to "correct" a digit.
  await page.getByRole('button', { name: /GTIN/ }).click();
  await expect(page.getByRole('textbox', { name: 'GTIN' })).toHaveValue('');
});
