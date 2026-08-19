import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import { Pool } from 'pg';
import { resolveQaOrgId, QA_FIXTURE_PO_ID, QA_FIXTURE_PO_NUMBER } from '@/lib/tenancy/qa-org';

/**
 * Unbox PREVIEW stance — the behavioural half of the read-only contract.
 *
 * Preview answers *"what is this?"* by opening the station read-only. The
 * source guard (`preview-scan.guard.test.ts`) pins the WIRING — which module
 * may write, which stance may drive which. This spec drives the real bar in a
 * browser and asserts the three writes the scan path performs and Preview must
 * never perform:
 *
 *   receiving_scans row          → the carton enters scan history
 *   receiving_unbox.opened_at    → counts as unboxing, and enters the Unbox
 *                                  recent rail (`view=unbox_opened` sorts on
 *                                  exactly that column)
 *   unmatched carton INSERT      → a preview of a typo mints a carton
 *
 * It also pins the two ratified constraints the stance rests on:
 *
 *   A. No cross-linkage — Preview and Scan share the bar and nothing else.
 *      Enter re-previews and never commits; the lock band carries Close only;
 *      the bar's scan display face never appears for a preview.
 *   B. No microcopy in the bar — no stance label, no status word, no
 *      placeholder prose while Preview is armed.
 *
 * QA ORG ONLY (`.claude/rules/verify.md`). The fixture carton is opened
 * read-only and nothing is mutated, so this spec is safe to re-run and safe
 * beside the specs that DO burn its lines.
 *
 * Entry is the scan bar itself, not `?openReceivingId=` — the point under test
 * is the stance the bar is in, so a deep link would skip the mechanism.
 *
 * Run: pnpm provision:qa-org && npx playwright test unbox-preview-stance --project=qa-desktop
 */

const QA_STORAGE = path.join(__dirname, '..', '.auth', 'qa-admin.json');
test.use({ storageState: QA_STORAGE });

interface Baseline {
  openedAt: string | null;
  scanCount: number;
  cartonCount: number;
}

let pool: Pool;
let cartonId: number | null = null;
/**
 * A carton with NO `receiving_line` rows — the case that made ~48% of dogfood
 * previews silently do nothing. Created by this spec (and dropped afterwards)
 * rather than added to the shared QA fixtures: it exists only to prove the
 * line-less open, and a permanent empty carton would sit at the top of every
 * other spec's Unboxed rail.
 */
let emptyCartonId: number | null = null;
const EMPTY_PO = `QA-PO-EMPTY-${Date.now().toString(36).toUpperCase()}`;

/** A value shaped like a scan that resolves to NOTHING — the mint-a-carton probe. */
const MISS_VALUE = `QA-PO-NOSUCH-${Date.now().toString(36).toUpperCase()}`;

async function readBaseline(): Promise<Baseline> {
  const org = resolveQaOrgId();
  const opened = await pool.query<{ opened_at: string | null }>(
    `SELECT opened_at FROM receiving_unbox
      WHERE organization_id = $1 AND receiving_id = $2`,
    [org, cartonId],
  );
  const scans = await pool.query<{ count: number }>(
    `SELECT count(*)::int AS count FROM receiving_scans
      WHERE organization_id = $1 AND receiving_id = $2`,
    [org, cartonId],
  );
  const cartons = await pool.query<{ count: number }>(
    `SELECT count(*)::int AS count FROM receiving_carton WHERE organization_id = $1`,
    [org],
  );
  return {
    openedAt: opened.rows[0]?.opened_at ?? null,
    scanCount: scans.rows[0]?.count ?? 0,
    cartonCount: cartons.rows[0]?.count ?? 0,
  };
}

/**
 * Arm Preview the way it durably lives — the stance store is localStorage
 * (`scan:station-stance`), which is what the left `ScanHotkeyControl` writes.
 * Seeding it before load is the same fact the operator's own toggle sets, and
 * it survives the app's first paint.
 */
async function armPreview(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem('scan:station-stance', 'preview');
  });
}

async function scanInto(page: Page, value: string) {
  const input = page.locator('[data-station-scan-input]').first();
  await expect(input).toBeVisible();
  await input.click();
  await input.fill(value);
  await input.press('Enter');
}

test.beforeAll(async () => {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  const carton = await pool.query<{ id: string }>(
    `SELECT id FROM receiving_carton
      WHERE organization_id = $1 AND zoho_purchaseorder_id = $2
      ORDER BY id DESC LIMIT 1`,
    [resolveQaOrgId(), QA_FIXTURE_PO_ID],
  );
  cartonId = carton.rows[0] ? Number(carton.rows[0].id) : null;

  const empty = await pool.query<{ id: string }>(
    `INSERT INTO receiving_carton (organization_id, source, zoho_purchaseorder_number)
     VALUES ($1, 'zoho_po', $2) RETURNING id`,
    [resolveQaOrgId(), EMPTY_PO],
  );
  emptyCartonId = empty.rows[0] ? Number(empty.rows[0].id) : null;
});

test.afterAll(async () => {
  if (emptyCartonId != null) {
    await pool.query(`DELETE FROM receiving_carton WHERE id = $1 AND organization_id = $2`, [
      emptyCartonId,
      resolveQaOrgId(),
    ]);
  }
  await pool?.end();
});

test.describe('Unbox — Preview stance opens read-only and writes nothing', () => {
  test.skip(({ isMobile }) => !!isMobile, 'the Unbox bench is desktop-only');

  test('a preview opens the station, and none of the three writes happen', async ({ page }) => {
    test.skip(!cartonId, 'QA receiving fixture missing — run pnpm provision:qa-org');
    const before = await readBaseline();

    await armPreview(page);
    await page.goto('/unbox');
    await scanInto(page, QA_FIXTURE_PO_NUMBER);

    // The station opened: the read-only band is the stance naming itself, once,
    // on the surface that actually opened.
    const lock = page.locator('[data-unbox-preview-lock]');
    await expect(lock).toBeVisible({ timeout: 20_000 });

    // …and the plane beneath it is inert, which is what enforces read-only.
    // A band without `inert` is a label over a working editor.
    await expect(page.locator('[data-unbox-preview-plane]')).toHaveAttribute('inert', '');

    // ── The three writes ────────────────────────────────────────────────────
    const after = await readBaseline();
    expect(after.openedAt, 'a preview must not stamp receiving_unbox.opened_at').toBe(
      before.openedAt,
    );
    expect(after.scanCount, 'a preview must not write receiving_scans').toBe(before.scanCount);

    // …and the rail that sorts on that column must not have gained the carton.
    // This is the membership query the Unbox recent rail actually runs, so it
    // cannot pass while the rail disagrees.
    const rail = await page.request.get(
      '/api/receiving-lines?view=unbox_opened&limit=100',
    );
    expect(rail.ok(), 'the recent-rail feed must answer').toBeTruthy();
    const railJson = (await rail.json()) as {
      receiving_lines?: Array<{ receiving_id?: number | null }>;
    };
    const ids = (railJson.receiving_lines ?? []).map((r) => r.receiving_id);
    expect(ids, 'a previewed carton must not enter the Unbox recent rail').not.toContain(
      cartonId,
    );
  });

  test('a preview of a value that resolves to nothing mints no carton', async ({ page }) => {
    test.skip(!cartonId, 'QA receiving fixture missing — run pnpm provision:qa-org');
    const before = await readBaseline();

    await armPreview(page);
    await page.goto('/unbox');
    await scanInto(page, MISS_VALUE);

    // A miss keeps the pane shut — but it must not be SILENT. The surface that
    // would have opened says so (never the bar, per constraint B); an Enter that
    // does nothing visible reads as a broken field.
    await expect(page.getByText(/nothing on file/i).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('[data-unbox-preview-lock]')).toHaveCount(0);
    await page.waitForTimeout(1_500);

    const after = await readBaseline();
    expect(
      after.cartonCount,
      'previewing a typo must not mint an unmatched carton',
    ).toBe(before.cartonCount);
  });

  test('A — Preview cannot become a Scan: Enter re-previews, the band only closes', async ({
    page,
  }) => {
    test.skip(!cartonId, 'QA receiving fixture missing — run pnpm provision:qa-org');
    const before = await readBaseline();

    await armPreview(page);
    await page.goto('/unbox');
    await scanInto(page, QA_FIXTURE_PO_NUMBER);
    await expect(page.locator('[data-unbox-preview-lock]')).toBeVisible({ timeout: 20_000 });

    // The lock band commits nothing. Committing is the operator switching the
    // stance themselves and scanning again — a button that flips the stance
    // under them is the linkage this constraint removes.
    const lock = page.locator('[data-unbox-preview-lock]');
    await expect(lock.getByRole('button', { name: /scan it/i })).toHaveCount(0);
    await expect(lock.getByRole('button', { name: 'Close' })).toBeVisible();

    // A SECOND Enter on the same value re-previews. It used to promote to a
    // real scan, which made a preview one keypress from an unbox.
    const input = page.locator('[data-station-scan-input]').first();
    await input.press('Enter');
    await expect(page.locator('[data-unbox-preview-lock]')).toBeVisible();
    await page.waitForTimeout(1_500);

    const after = await readBaseline();
    expect(after.openedAt, 'a second Enter must not commit the preview').toBe(before.openedAt);
    expect(after.scanCount, 'a second Enter must not record a scan').toBe(before.scanCount);

    // A#5 — Preview shares no state with Scan. The scan's non-editable display
    // face must never appear for a preview; the bar keeps its editable value.
    await expect(page.locator('[data-station-scan-display]')).toHaveCount(0);
    await expect(input).toHaveValue(QA_FIXTURE_PO_NUMBER);
  });

  test('B — the scan bar authors no microcopy while Preview is armed', async ({ page }) => {
    await armPreview(page);
    await page.goto('/unbox');

    const input = page.locator('[data-station-scan-input]').first();
    await expect(input).toBeVisible();
    // No stance label, no "would search", no prose. The bar renders the value
    // and the chrome; the stance is named once, by the surface that opened.
    await expect(input).toHaveAttribute('placeholder', '');
  });

  /**
   * The regression this spec exists for, reported from the bench: Enter did
   * nothing, or landed somebody else's carton.
   *
   * Root cause was a race, not a missing wire. The station-first MRU auto-open
   * (bare `/unbox` reopens the Unboxed rail's newest carton) resolves through
   * its own async chain, and so does the preview open — so on the DEFAULT Queue
   * tab the MRU regularly won and replaced the previewed carton with the rail's
   * most recent. It is a Scan-stance affordance, so it now stands down in
   * Preview entirely.
   *
   * Every tab, because the failure was tab-dependent and the first pass of this
   * spec tested only the default one — and passed, because the rail happened to
   * be empty at that moment.
   */
  for (const [label, url] of [
    ['Queue (default)', '/unbox'],
    ['Inbound', '/unbox?unboxview=incoming'],
    ['Recent', '/unbox?unboxview=viewed'],
    ['History', '/unbox?unboxview=history'],
  ] as const) {
    test(`a preview opens THE PREVIEWED carton from ${label}`, async ({ page }) => {
      test.skip(!cartonId, 'QA receiving fixture missing — run pnpm provision:qa-org');

      await armPreview(page);
      await page.goto(url);
      await scanInto(page, QA_FIXTURE_PO_NUMBER);

      await expect(page.locator('[data-unbox-preview-lock]')).toBeVisible({ timeout: 20_000 });
      // The URL names the carton the operator asked about — not the rail's MRU.
      await expect(page).toHaveURL(new RegExp(`openReceivingId=${cartonId}\\b`));
    });
  }

  /**
   * The other half of the bench report, and the bigger half: on the dogfood
   * tenant **1361 of 2839 cartons carry no `receiving_line` rows** — a carton
   * that is docked but not yet itemised is the commonest thing an operator
   * previews. The open path used to bail on exactly that shape and return the
   * hit unopened, so resolution succeeded and nothing rendered.
   *
   * The bail's own reasoning was "the band keeps the answer" — true when the
   * scan bar still had a preview band, and false the moment constraint B
   * deleted it. A retired surface left a live code path pointing at it.
   */
  test('a carton with NO lines still opens the station, like a scan', async ({ page }) => {
    test.skip(!emptyCartonId, 'could not seed the line-less carton');

    await armPreview(page);
    await page.goto('/unbox');
    await scanInto(page, EMPTY_PO);

    await expect(page.locator('[data-unbox-preview-lock]')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('[data-unbox-preview-plane]')).toHaveAttribute('inert', '');
    await expect(page).toHaveURL(new RegExp(`openReceivingId=${emptyCartonId}\\b`));
  });

  /**
   * Closing the read-only lock means *done looking* — the bench goes back to
   * Scan with an empty bar.
   *
   * The stance is sticky (localStorage), so a preview that ended in Preview left
   * the operator's next real scan silently not unboxing: the bar looks armed and
   * records nothing. This is NOT the banned promotion — nothing is submitted,
   * nothing opens, and the value is cleared rather than carried, so the next
   * Enter cannot commit the carton that was only being inspected.
   */
  test('Close returns the bench to Scan with an empty bar', async ({ page }) => {
    test.skip(!cartonId, 'QA receiving fixture missing — run pnpm provision:qa-org');
    const before = await readBaseline();

    await armPreview(page);
    await page.goto('/unbox');
    await scanInto(page, QA_FIXTURE_PO_NUMBER);

    const lock = page.locator('[data-unbox-preview-lock]');
    await expect(lock).toBeVisible({ timeout: 20_000 });
    await lock.getByRole('button', { name: 'Close' }).click();

    await expect(lock).toHaveCount(0);
    // Back to Scan…
    await expect
      .poll(() => page.evaluate(() => window.localStorage.getItem('scan:station-stance')))
      .toBe('scan');
    // …with nothing left on the bar to commit by accident.
    await expect(page.locator('[data-station-scan-input]').first()).toHaveValue('');

    // Closing is still not a commit.
    const after = await readBaseline();
    expect(after.openedAt, 'closing a preview must not open the carton').toBe(before.openedAt);
    expect(after.scanCount, 'closing a preview must not record a scan').toBe(before.scanCount);
  });
});
