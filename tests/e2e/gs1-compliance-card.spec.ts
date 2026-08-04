import { test, expect } from '@playwright/test';

/**
 * Settings → Organization → Product identity (GS1).
 *
 * Pins the three behaviours the card exists for
 * (docs/todo/gs1-compliance-onboarding-PLAN.md → P2), all of which are easy to
 * regress into something that looks fine:
 *
 *  1. **Unanswered is a visible third state.** Neither Yes nor No is pressed on
 *     a fresh org. If this ever renders as two unchecked toggles, one Save
 *     stamps `answeredAt` and silently completes the onboarding step for a
 *     tenant who never read the question.
 *  2. **The key prompt is gated on the answers; the GLN is NOT.** A GLN answers
 *     to an EDI/EPCIS partner, not to Amazon — gating it would tell a refurb
 *     reseller they need a warehouse identifier to sell a used laptop.
 *  3. **`unmet` needs BOTH answers, and a bare 'prefix' claim does not clear
 *     it.** "Has not finished answering" must never read as non-compliance.
 *
 * Read-only: it never clicks Save, so it asserts on the QA org without writing
 * to it.
 */
test('GS1 product-identity card: unanswered, gating, and the unmet verdict', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  await page.goto('/settings/organization');
  const card = page.locator('#gs1');
  await expect(card).toBeVisible({ timeout: 20_000 });

  const yes = card.getByRole('button', { name: 'Yes' });
  const no = card.getByRole('button', { name: 'No' });
  const gtinPicker = card.getByText('How do you get product identifiers (GTINs)?');
  const nag = card.getByText(/will need a GTIN/);

  // 1 — unanswered: nothing pressed, no key prompt.
  await expect(yes).toHaveCount(2);
  for (const btn of [...(await yes.all()), ...(await no.all())]) {
    expect(await btn.getAttribute('aria-pressed'), 'a fresh org has no answer').toBe('false');
  }
  await expect(gtinPicker).toHaveCount(0);

  // 2 — the GLN is visible from the start, ungated.
  await expect(card.getByText('GLN (Global Location Number) — optional')).toBeVisible();

  // 3 — one "yes" reveals the picker but does NOT yet accuse anyone.
  await yes.first().click();
  await expect(gtinPicker).toBeVisible();
  await expect(nag, 'half-answered is not unmet').toHaveCount(0);

  // Both answered + no key on file → unmet.
  await no.nth(1).click();
  await expect(nag).toBeVisible();

  // Claiming 'prefix' with an empty prefix field is STILL unmet — the exact
  // state this flow exists to surface.
  await card.locator('select').selectOption('prefix');
  await expect(card.getByText('GS1 Company Prefix', { exact: true })).toBeVisible();
  await expect(nag, 'an empty prefix claim does not clear the requirement').toBeVisible();

  // 'exempt' stores nothing org-level and legitimately clears it — a brand
  // owner must not be nagged forever.
  await card.locator('select').selectOption('exempt');
  await expect(nag).toHaveCount(0);
  await expect(card.getByText('GS1 Company Prefix', { exact: true })).toHaveCount(0);

  expect(errors, `console errors: ${errors.join(' | ')}`).toEqual([]);
});
