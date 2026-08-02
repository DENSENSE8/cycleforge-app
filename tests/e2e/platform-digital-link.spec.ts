import { test, expect, request as pwRequest } from '@playwright/test';
import path from 'path';
import { Pool } from 'pg';
import { resolveQaOrgId, QA_ORG_SLUG, QA_FIXTURE_PO_ID } from '@/lib/tenancy/qa-org';

/**
 * Platform Digital Links — the dual-audience contract, in a browser.
 *
 * One printed sticker, two audiences, ONE URL:
 *
 *   staff wedge / signed-in phone → internal ops (host ignored, path routed)
 *   anonymous customer phone      → the tenant's branded interstitial, with a
 *                                   button to THAT workspace's own website
 *
 * The anon half is what this spec exists for. `/01/…` used to 302 straight to
 * `NEXT_PUBLIC_STOREFRONT_URL` (defaulting to the dogfood tenant's shop), which
 * is a single-tenant assumption that only becomes visibly wrong once labels
 * mint on `{slug}.app.cycleforge.ai`: workspace A's sticker would have sent a
 * customer to workspace B's storefront. That is invisible to every unit test —
 * the redirect was internally consistent — so it has to be asserted end to end.
 *
 * The ENCODE half (which string goes in the matrix, which symbology, which HRI)
 * is pinned in `src/lib/qr/print-matrix-sot.guard.test.ts`, not here: a
 * DataMatrix is an SVG, so the payload cannot be read back out of the DOM. What
 * this spec can honestly assert about print is the HRI text under the matrix,
 * which is the operator-visible half of the same decision.
 *
 * QA ORG ONLY (`.claude/rules/verify.md`). It writes the QA org's
 * `brand.publicLandingUrl` through the real settings API, which is exactly the
 * setting a tenant configures for this feature.
 *
 * Run:
 *   pnpm provision:qa-org
 *   npx playwright test platform-digital-link --project=qa-desktop
 */

const QA_STORAGE = path.join(__dirname, '..', '.auth', 'qa-admin.json');
const TENANT_HEADER = 'x-tenant-slug';

/** Unique per run so a re-run can never pass on a stale saved value. */
const RUN = Date.now().toString(36);
const LANDING_URL = `https://shop.qa-${RUN}.example.com/`;

test.use({ storageState: QA_STORAGE });

let db: Pool | null = null;
let cartonId: number | null = null;

/** The QA fixture carton's numeric receiving id — the `/m/r/{id}` subject. */
async function loadQaCartonId(): Promise<number | null> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) return null;
  db = new Pool({ connectionString, ssl: { rejectUnauthorized: false } });
  const { rows } = await db.query<{ id: string }>(
    `SELECT id FROM receiving_carton
      WHERE organization_id = $1 AND zoho_purchaseorder_id = $2
      ORDER BY id DESC LIMIT 1`,
    [resolveQaOrgId(), QA_FIXTURE_PO_ID],
  );
  return rows[0] ? Number(rows[0].id) : null;
}

/** A request context with NO staff cookie — a customer's phone. */
async function anonContext(baseURL: string) {
  return pwRequest.newContext({
    baseURL,
    storageState: { cookies: [], origins: [] },
    // Local hosts cannot carry a tenant subdomain (`extractTenantSlug` needs
    // three labels, and `cycleforge-qa.localhost` has two), so the slug is
    // supplied the same way global-setup and the lighthouse/photos scripts
    // already do it. In production the proxy derives it from the host.
    extraHTTPHeaders: { [TENANT_HEADER]: QA_ORG_SLUG },
  });
}

test.beforeAll(async ({ baseURL }) => {
  cartonId = await loadQaCartonId();

  // Configure the tenant's outbound website through the real settings API —
  // the one thing a tenant owns in this feature. Cycle Forge owns the QR host.
  const ctx = await pwRequest.newContext({ baseURL, storageState: QA_STORAGE });
  try {
    const res = await ctx.patch('/api/admin/organization/profile', {
      headers: { [TENANT_HEADER]: QA_ORG_SLUG },
      data: { brand: { publicLandingUrl: LANDING_URL } },
    });
    expect(
      res.ok(),
      `could not set brand.publicLandingUrl (HTTP ${res.status()}): ${await res.text()}`,
    ).toBeTruthy();
  } finally {
    await ctx.dispose();
  }

  // `getOrganizationBySlug` caches per process for 30s. `updateOrgSettings`
  // invalidates it, but only within its OWN module instance — and under
  // Turbopack dev the API route and the RSC page are separate entry graphs, so
  // the page can still be serving the pre-write org. Wait for the write to
  // become visible on the surface under test rather than racing it; a fixed
  // sleep would either flake or waste 30s on every run.
  const anon = await anonContext(baseURL!);
  try {
    await expect
      .poll(
        async () => (await anon.get('/qr', { maxRedirects: 0 })).text(),
        {
          message: 'anon landing never picked up the configured publicLandingUrl',
          timeout: 45_000,
          intervals: [500, 1_000, 2_000, 5_000],
        },
      )
      .toContain(LANDING_URL);
  } finally {
    await anon.dispose();
  }
});

test.afterAll(async () => {
  await db?.end();
});

test.describe('anonymous scan → tenant interstitial', () => {
  test('carton /m/r/{id} shows the tenant brand and links to its own website', async ({
    baseURL,
  }) => {
    test.skip(!cartonId, 'QA fixture carton not provisioned — run pnpm provision:qa-org');

    const ctx = await anonContext(baseURL!);
    try {
      const res = await ctx.get(`/m/r/${cartonId}`, { maxRedirects: 0 });

      // Not bounced to /signin, and not redirected off-platform.
      expect(res.status(), 'anon carton scan must render, not redirect').toBe(200);
      const html = await res.text();

      expect(html).toContain('Receiving carton');
      expect(html).toContain(LANDING_URL);
      expect(html).toContain('Continue to website');
      // The single most important negative: never another tenant's storefront.
      expect(html).not.toContain('usavshop.com');
      // And never internal ops chrome for an anonymous caller.
      expect(html).not.toContain('data-station-scan-bar');
    } finally {
      await ctx.dispose();
    }
  });

  test('unit /01/{gtin}/21/{serial} renders the interstitial, not a storefront 302', async ({
    baseURL,
  }) => {
    const ctx = await anonContext(baseURL!);
    try {
      const res = await ctx.get('/01/00012345678905/21/QA-SERIAL-1', { maxRedirects: 0 });

      // The regression this replaces: a 302 whose Location was the hardcoded
      // dogfood storefront, served to every tenant's customers alike.
      expect(
        res.status(),
        `expected a rendered interstitial, got ${res.status()} → ${res.headers()['location'] ?? '(no location)'}`,
      ).toBe(200);
      const html = await res.text();
      expect(html).toContain(LANDING_URL);
      expect(html).not.toContain('usavshop.com');
    } finally {
      await ctx.dispose();
    }
  });

  test('a code with no resolvable entity still lands on the tenant, not a foreign host', async ({
    baseURL,
  }) => {
    const ctx = await anonContext(baseURL!);
    try {
      const res = await ctx.get('/qr', { maxRedirects: 0 });
      expect(res.status()).toBe(200);
      const html = await res.text();
      expect(html).toContain(LANDING_URL);
      expect(html).not.toContain('usavshop.com');
    } finally {
      await ctx.dispose();
    }
  });

  test('an unknown slug fails closed — shell, no CTA, no default tenant', async ({ baseURL }) => {
    const ctx = await pwRequest.newContext({
      baseURL,
      storageState: { cookies: [], origins: [] },
      extraHTTPHeaders: { [TENANT_HEADER]: 'no-such-workspace-zzz' },
    });
    try {
      const res = await ctx.get('/qr', { maxRedirects: 0 });
      expect(res.status()).toBe(200);
      const html = await res.text();
      // Fails closed: it must not leak whichever tenant happens to be first.
      expect(html).not.toContain(LANDING_URL);
      expect(html).not.toContain('usavshop.com');
      expect(html).toContain('Website not configured');
    } finally {
      await ctx.dispose();
    }
  });
});

test.describe('staff scan → internal ops', () => {
  test('the same carton URL opens ops for a signed-in staffer', async ({ page }) => {
    test.skip(!cartonId, 'QA fixture carton not provisioned — run pnpm provision:qa-org');

    await page.goto(`/m/r/${cartonId}`);

    // Staff must never see the consumer surface on the same URL.
    await expect(page.getByText('Continue to website')).toHaveCount(0);
    await expect(page.getByText('Powered by Cycle Forge')).toHaveCount(0);
    // Carton ops identifies the record it opened.
    await expect(page.locator('body')).toContainText(/RCV-\d+|Carton|Receiving/i, {
      timeout: 15_000,
    });
  });
});

test.describe('printed face', () => {
  test('the carton label HRI stays the typeable handle, not the URL', async ({ page }) => {
    test.skip(!cartonId, 'QA fixture carton not provisioned — run pnpm provision:qa-org');

    await page.goto(`/unbox?openReceivingId=${cartonId}`);

    // The matrix encodes an absolute Digital Link; the HRI under it must stay
    // `R-{id}` so an operator with a smudged sticker can key it into the scan
    // bar. Those are two halves of one decision in `encodePrintMatrix`.
    const hri = page.getByText(new RegExp(`^R-${cartonId}$`));
    await expect(hri.first()).toBeVisible({ timeout: 20_000 });
  });
});
