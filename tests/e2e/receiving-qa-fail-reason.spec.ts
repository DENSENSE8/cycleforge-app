import { test, expect, devices } from '@playwright/test';
import path from 'path';
import { Pool } from 'pg';
import { resolveQaOrgId, QA_FIXTURE_PO_ID } from '@/lib/tenancy/qa-org';

/**
 * The mobile QA sheet's FAIL reason is a CODE, not a note.
 *
 * It used to be a ConfirmSheet whose copy said "use the note field below to
 * capture the reason" and which had no note field — the reason was initialised
 * to `''`, never edited, and posted to `mark-received` as `notes`, i.e. the
 * operator's ITEM note (`.claude/rules/source-of-truth.md` → Note vs label
 * grain). Had anyone finished wiring that input, a phone-side fail would have
 * overwritten the desktop operator's note on every line in the carton.
 *
 * This pins the replacement's ceremony: a closed reason vocabulary, nothing
 * pre-selected, and the destructive confirm disabled until the operator picks.
 * The write side (exception row + derived verdict + notes untouched) is asserted
 * in `receiving-note-label-grain.spec.ts`; this spec deliberately does NOT
 * confirm, so it mutates nothing.
 *
 * QA org, mobile viewport — the sheet's home is `/m/r/[id]`.
 * Run: npx playwright test receiving-qa-fail-reason --project=mobile
 */

test.use({
  ...devices['iPhone 14'],
  storageState: path.join(__dirname, '..', '.auth', 'qa-admin.json'),
});

test.describe('receiving — QA fail reason picker', () => {
  let pool: Pool;
  let cartonId: number | null = null;

  test.beforeAll(async () => {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
    });
    const row = await pool.query<{ id: string }>(
      `SELECT id FROM receiving_carton
        WHERE organization_id = $1 AND zoho_purchaseorder_id = $2
        ORDER BY id DESC LIMIT 1`,
      [resolveQaOrgId(), QA_FIXTURE_PO_ID],
    );
    cartonId = row.rows[0] ? Number(row.rows[0].id) : null;
  });

  test.afterAll(async () => {
    await pool?.end();
  });

  test('a fail names a reason from a closed vocabulary, and nothing is pre-picked', async ({
    page,
  }) => {
    test.skip(
      test.info().project.name !== 'mobile',
      'the QA action sheet is the phone carton page',
    );
    test.skip(!cartonId, 'QA receiving fixture missing — run pnpm provision:qa-org');

    await page.goto(`/m/r/${cartonId}`);
    // The PWA install banner floats over the sticky footer CTA and swallows the
    // click. It is app chrome, not the surface under test.
    await page.addStyleTag({ content: '.z-banner{display:none !important}' });

    await page.getByRole('button', { name: /Update \d+ lines?/i }).click();
    await page.getByRole('button', { name: /Mark FAILED/i }).click();

    // The vocabulary is the registry's QA-fail slice, tenant labels applied. It
    // renders even on an org with no seeded `reason_codes` rows: the options walk
    // the registry and only borrow a label, so the sheet can never offer a code
    // the route would reject.
    for (const label of [/^Defective$/, /^Damaged$/, /^Missing parts$/]) {
      await expect(page.getByRole('radio', { name: label })).toBeVisible();
    }

    // A defaulted reason is a reason nobody read — same stance as the
    // photo-policy waiver sheet.
    const confirm = page.getByRole('button', { name: /Yes, return all/i });
    await expect(confirm, 'the destructive confirm must start disabled').toBeDisabled();

    await page.getByRole('radio', { name: /^Damaged$/ }).click();
    await expect(confirm).toBeEnabled();
    // The description is the claim being made — shown only after the pick.
    await expect(page.getByText(/arrived damaged/i)).toBeVisible();
  });
});
