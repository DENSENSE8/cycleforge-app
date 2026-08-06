import { test, expect, type APIRequestContext } from '@playwright/test';
import path from 'path';
import { Pool } from 'pg';
import { resolveQaOrgId, QA_FIXTURE_PO_ID } from '@/lib/tenancy/qa-org';

/**
 * FBA-return claim-subject regression (2026-07-30).
 *
 * Filing a claim on a carton classified Platform=FBA + Type=Return used to
 * produce a Zendesk subject of "Unknown - Return // Return // TRK#…" instead
 * of "FBA // Return // TRK#…". Two independent bugs, both fixed this session:
 *
 *   1. `receiving_carton`'s `receiving_source_platform_chk` CHECK constraint
 *      never grew past the pre-2026-07-05d vocabulary and omitted
 *      fba/shopify/square — PATCH /api/receiving/:id with
 *      `source_platform: 'fba'` passed app-level validation (the allowlist
 *      was already fixed) but 500'd at the DB. Fixed by
 *      `src/lib/migrations/2026-07-30b_receiving_source_platform_fba.sql`.
 *   2. `resolveClaimSubjectIdentity` (src/lib/zendesk-claim-subject-identity.ts)
 *      always rendered the full "FBA Return" classify label as the first
 *      subject segment, even when the claim TYPE segment right after it was
 *      ALSO "Return" — duplicating it. Fixed: when the claim type label is
 *      "Return" and a known return classification resolves, the identity
 *      segment collapses to the PLATFORM ONLY ("FBA") via
 *      `classificationPlatformOnlyLabel()` — so the assembled subject reads
 *      "FBA // Return // TRK#…", not "FBA Return // Return // TRK#…". A
 *      non-return claim type (e.g. "Damage") still gets the full, informative
 *      "FBA Return" identity — that half is NOT over-corrected.
 *
 * Per verify.md, this asserts against the QA org, never the dogfood tenant:
 * `test.use({ storageState })` pins every fixture in this file (both `page`
 * and `request`) to `tests/.auth/qa-admin.json` regardless of which
 * `--project` invokes the spec, and the fixture carton is looked up by
 * `organization_id = resolveQaOrgId()` — the same carton
 * `scripts/provision-qa-org.ts`'s `seedReceivingFixture` seeds, matched by
 * `zoho_purchaseorder_id = QA_FIXTURE_PO_ID`. Only that row's
 * source_platform/is_return/return_platform/intake_type are mutated, and the
 * original values are snapshotted in `beforeAll` and restored in `afterAll` —
 * this never leaves the shared QA fixture mutated for the next run.
 */

const QA_STORAGE = path.join(__dirname, '..', '.auth', 'qa-admin.json');
test.use({ storageState: QA_STORAGE });

interface CartonSnapshot {
  source_platform: string | null;
  is_return: boolean | null;
  return_platform: string | null;
  intake_type: string | null;
}

let pool: Pool;
let fixture: { cartonId: number; original: CartonSnapshot } | null = null;

test.beforeAll(async () => {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  const orgId = resolveQaOrgId();
  const row = await pool.query<
    { id: number } & CartonSnapshot
  >(
    `SELECT id, source_platform, is_return, return_platform, intake_type
       FROM receiving_carton
      WHERE organization_id = $1 AND zoho_purchaseorder_id = $2
      LIMIT 1`,
    [orgId, QA_FIXTURE_PO_ID],
  );
  if (!row.rows[0]) return;

  fixture = {
    cartonId: Number(row.rows[0].id),
    original: {
      source_platform: row.rows[0].source_platform,
      is_return: row.rows[0].is_return,
      return_platform: row.rows[0].return_platform,
      intake_type: row.rows[0].intake_type,
    },
  };
});

test.afterAll(async () => {
  if (!pool) return;
  try {
    if (fixture) {
      // Restore ONLY this carton's own snapshotted columns — never leave the
      // shared QA fixture mutated for the next run.
      await pool.query(
        `UPDATE receiving_carton
            SET source_platform = $1,
                is_return = $2,
                return_platform = $3,
                intake_type = $4,
                updated_at = NOW()
          WHERE id = $5`,
        [
          fixture.original.source_platform,
          fixture.original.is_return,
          fixture.original.return_platform,
          fixture.original.intake_type,
          fixture.cartonId,
        ],
      );
    }
  } finally {
    await pool.end();
  }
});

/** Mirrors global-setup's probeSession — cheap authenticated GET to confirm the QA session actually minted. */
async function hasQaSession(request: APIRequestContext): Promise<boolean> {
  const probe = await request.get('/api/receiving-lines?view=recent&limit=1');
  return probe.ok();
}

test.describe('Zendesk claim subject — FBA return dedup regression (QA org)', () => {
  test.skip(({ isMobile }) => !!isMobile, 'API test — desktop project only');

  test('PATCH survives the CHECK constraint, GET round-trips it, and the preview subject reads "FBA" without duplicating "Return"', async ({
    request,
  }) => {
    test.skip(!fixture, 'QA receiving fixture not found (organization_id=resolveQaOrgId(), zoho_purchaseorder_id=QA_FIXTURE_PO_ID) — run pnpm provision:qa-org first.');
    test.skip(
      !(await hasQaSession(request)),
      'no QA session — tests/.auth/qa-admin.json is empty (run pnpm provision:qa-org, then re-run the Playwright suite so global-setup mints it).',
    );

    const cartonId = fixture!.cartonId;

    // ── 1. PATCH — regression check for the dropped CHECK-constraint values.
    // This used to 500 ("violates check constraint receiving_source_platform_chk")
    // even though the app-level source_platform allowlist already accepted 'fba'.
    const patchRes = await request.patch(`/api/receiving/${cartonId}`, {
      data: { source_platform: 'fba', is_return: true, return_platform: 'FBA' },
    });
    expect(patchRes.status(), await patchRes.text()).toBe(200);
    const patchBody = await patchRes.json();
    expect(patchBody.success).toBe(true);
    expect(patchBody.receiving.source_platform).toBe('fba');
    expect(patchBody.receiving.is_return).toBe(true);
    expect(patchBody.receiving.return_platform).toBe('FBA');

    // ── 2. GET — the write round-trips through the read path too.
    const getRes = await request.get(`/api/receiving/${cartonId}`);
    expect(getRes.status(), await getRes.text()).toBe(200);
    const getBody = await getRes.json();
    expect(getBody.receiving.source_platform).toBe('fba');
    expect(getBody.receiving.is_return).toBe(true);

    // ── 3. Preview, claimType='return' — the dedup fix: the classify identity
    // collapses to the platform alone ("FBA") because the claim TYPE segment
    // right after it already says "Return". Must not fall back to "Unknown"
    // (the old broken-write symptom) or duplicate "Return // Return" (the
    // subject-identity regression).
    const returnPreview = await request.post('/api/receiving/zendesk-claim/preview', {
      data: { receivingId: cartonId, lineId: null, claimType: 'return' },
    });
    expect(returnPreview.status(), await returnPreview.text()).toBe(200);
    const returnBody = await returnPreview.json();
    expect(returnBody.subject).toMatch(/FBA/i);
    expect(returnBody.subject).not.toMatch(/Unknown/i);
    expect(returnBody.subject).not.toContain('Return // Return');

    // ── 4. Preview, claimType='damage' — a non-return claim type is NOT
    // over-corrected: it keeps the full, informative "FBA Return" identity
    // segment (still distinct from the "Damage" claim-type segment).
    const damagePreview = await request.post('/api/receiving/zendesk-claim/preview', {
      data: { receivingId: cartonId, lineId: null, claimType: 'damage' },
    });
    expect(damagePreview.status(), await damagePreview.text()).toBe(200);
    const damageBody = await damagePreview.json();
    expect(damageBody.subject).toMatch(/FBA Return/i);
  });
});

/**
 * UI-level agreement check — best-effort. The API assertions above are the
 * actual regression proof; this only confirms the compose-step subject field
 * (`#claim-subject`) agrees with the API once the operator forces
 * claimType='return' via the claim-type tab strip. Any step that doesn't
 * render as expected skips cleanly rather than flaking CI — reaching the
 * claim wizard depends on chrome (the "File claim" control only renders when
 * no ticket is already linked) that this spec deliberately does not fixture
 * around.
 */
test.describe('Zendesk claim subject — UI compose step agrees with the API (best-effort)', () => {
  test.skip(({ isMobile }) => !!isMobile, 'claim wizard is a desktop workspace surface');

  test('the claim modal compose subject reads "FBA" once claimType is forced to Return', async ({ page }) => {
    test.skip(!fixture, 'QA receiving fixture not found — see the API-level describe block above.');

    await page.goto(`/unbox?openReceivingId=${fixture!.cartonId}`);
    if (new URL(page.url()).pathname === '/signin') {
      test.skip(true, 'no QA session for this project (tests/.auth/qa-admin.json is empty) — cannot reach /unbox');
    }

    const claimBtn = page.getByRole('button', { name: 'File claim' });
    try {
      await claimBtn.waitFor({ state: 'visible', timeout: 10_000 });
    } catch {
      test.skip(
        true,
        'The "File claim" control did not render for this fixture (e.g. a ticket is already linked) — ' +
          'the API-level describe block above is the regression proof; skipping the UI half.',
      );
      return;
    }
    await claimBtn.click();

    // Continuous-scroll drawer: jump to the Ticket section via scroll-spy nav
    // (no Next: Ticket paging anymore).
    const ticketSectionNav = page.getByRole('navigation', { name: /Claim sections/i }).getByRole('button', {
      name: /Ticket/i,
    });
    try {
      await ticketSectionNav.waitFor({ state: 'visible', timeout: 10_000 });
      await ticketSectionNav.click();
    } catch {
      test.skip(true, 'Claim drawer did not open with scroll-spy sections as expected — skipping the UI half.');
      return;
    }

    // Compose step: force claimType='return' via the claim-type tab strip
    // (`role="tab"`, accessible name = CLAIM_TYPE_LABEL['return'] = "Return").
    // `exact: true` matters here — "Return to sender" is a SIBLING tab and a
    // non-exact match hits both, which is a Playwright strict-mode violation.
    const returnTab = page.getByRole('tab', { name: 'Return', exact: true });
    try {
      await returnTab.waitFor({ state: 'visible', timeout: 10_000 });
      await returnTab.click();
    } catch {
      test.skip(true, 'Claim-type tab strip not found on the compose step — skipping the UI half.');
      return;
    }

    const subjectInput = page.locator('#claim-subject');
    await expect
      .poll(async () => subjectInput.inputValue(), { timeout: 10_000 })
      .toMatch(/FBA/i);
    const value = await subjectInput.inputValue();
    expect(value).not.toMatch(/Unknown/i);
    expect(value).not.toContain('Return // Return');
  });
});
