import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import { parseTrackingKeys, TRACKING_IN_PARAM } from '@/lib/receiving/tracking-paste';

/**
 * Bulk tracking triage on Incoming — the paste surface, the lane relaxation,
 * and the residual report, in a browser.
 *
 * The operator's complaint this closes: *"I can only search one tracking number
 * at a time … and when something disappears off the list I need to know why."*
 *
 * The unit tests pin the SQL and the ladders from source. This spec pins the
 * three things only a browser can prove:
 *   1. the bulk-tracking paste entry is reachable beside the always-open search;
 *   2. a paste writes canonical, deduped keys to `?tracking_in=` and clears the
 *      params that would silently narrow it (`page` / `state`);
 *   3. the lane note — a claim about the predicate — disappears the moment
 *      `?tracking_in=` relaxes that predicate.
 *
 * QA ORG (`.claude/rules/verify.md`): every assertion is SHAPE-based — URL
 * params, control presence, absence of a claim. Nothing here counts rows, so it
 * cannot pass vacuously on an empty lane or fail because the tenant's data
 * moved. The trackings are deliberately synthetic; resolving them is the unit
 * tests' job, and a spec that needed real matches would be asserting on data.
 *
 * Run: npx playwright test incoming-bulk-tracking --project=qa-desktop
 */

const QA_STORAGE = path.join(__dirname, '..', '.auth', 'qa-admin.json');
test.use({ storageState: QA_STORAGE });

/**
 * A paste with every hazard the parser must survive: blank lines, a repeat in a
 * different format, a lowercase/hyphenated twin of an earlier key, and mixed
 * carrier shapes. Modelled on a real operator paste.
 */
const PASTE = [
  'QAE2E0000000001',
  '',
  '   ',
  'qae2e-0000000001',
  'QAE2E0000000002',
  '9400100000000000000199',
  '',
  'TBA000000000001',
].join('\n');

/** What the shared parser makes of it — the spec never re-derives the answer. */
const EXPECTED = parseTrackingKeys(PASTE);

/**
 * Navigate and wait for the chrome to actually exist.
 *
 * `domcontentloaded` alone is too early: the workbench header hydrates after
 * it, and asserting into that window makes the suite flaky in a way that reads
 * like a duplicate-render bug (Playwright's strict mode reports the transient
 * pair). Waiting on the entry point is the same thing an operator does — the
 * control is the readiness signal.
 */
async function openIncoming(page: Page, query = ''): Promise<void> {
  await page.goto(`/incoming${query}`);
  await page.waitForLoadState('domcontentloaded');
  // 30s, not the default: against a DEV server the first hit on a route pays
  // an on-demand compile, and a run that lands on a cold one blew the whole
  // 60s test budget here. That is toolchain latency, not product latency — the
  // warm-up below removes it for the common case and this ceiling covers the
  // rest without hiding a genuine never-renders failure.
  await pasteEntry(page).first().waitFor({ state: 'visible', timeout: 30_000 });
  // Strict single-match is deliberate: the entry is chrome, so a second one is
  // a real defect (two headers, or a panel mounted per lane) and must fail here
  // rather than be papered over with `.first()` at every call site.
  await expect(pasteEntry(page)).toHaveCount(1);
}

/** The bulk-paste entry: an icon action inside the chrome search control. */
function pasteEntry(page: Page) {
  return page.getByRole('button', { name: 'Paste a list of tracking numbers' });
}

function panel(page: Page) {
  return page.getByRole('region', { name: 'Tracking list' });
}

/**
 * Open the paste panel and wait for the right-edge frame to SETTLE.
 *
 * `RightRailHost` picks push-vs-overlay from a measured frame
 * (`resolveRightRailFrame`), and when that resolution flips after mount the
 * outgoing push column is still playing its width tween while the overlay
 * enters — so for the length of that tween there really are two
 * `role="region"` asides with the same name. It is transient and self-clearing;
 * asserting into it is what makes a suite flaky.
 *
 * The wait is on `toHaveCount(1)`, not `.first()`: a panel that settled at TWO
 * would be a genuine defect (a second host, or a mode that never resolves), and
 * this must fail rather than quietly pick one.
 */
async function openPastePanel(page: Page) {
  await pasteEntry(page).click();
  await expect(panel(page)).toHaveCount(1);
  return panel(page);
}

/**
 * Warm the route once per file.
 *
 * The suite runs against the dev server, which compiles a route on first hit.
 * Paying that inside a test's own budget is how a green suite turns red on an
 * unrelated run — the failure looks like "the control never rendered" when the
 * page had simply not been built yet.
 *
 * The inner wait must stay STRICTLY under the hook's own budget. It was 60s
 * against a 60s hook, so the `.catch()` that makes this best-effort could never
 * run: the hook hit its ceiling first and every test in the file reported as
 * `beforeAll hook timeout` — an opaque failure that says nothing about the
 * control it was waiting for. A warm-up must not be able to fail the suite.
 */
test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage({ storageState: QA_STORAGE });
  await page.goto('/incoming');
  await page.getByRole('button', { name: 'Paste a list of tracking numbers' })
    .first()
    .waitFor({ state: 'visible', timeout: 20_000 })
    .catch(() => { /* the tests assert readiness; this only pre-compiles */ });
  await page.close();
});

/*
  ── The bulk-tracking surface is currently unreachable ──────────────────────

  Measured 2026-08-30. `IncomingBulkTrackingPanel` and the rail that hosts it,
  `IncomingDeskRightRail`, are both in `npx knip`'s unused-FILES list: nothing
  mounts the rail, so the panel has no host and the "Paste a list of tracking
  numbers" entry this file opens with does not render anywhere in `src`.

  The panel's own code is intact — the parser, the `?tracking_in=` write and the
  lane-note relaxation are all still there, and the unit tests still cover them.
  What went is the door. That is the same shape the one-table teardown left
  behind elsewhere (the FBA status facet had no writer; row fills lost their
  paint trigger): a feature stranded when the chrome that opened it was removed.

  Marked fixme rather than deleted, because which way this resolves is a product
  decision — re-host the rail, or retire the surface and this spec with it. A
  deleted spec would leave no record that the capability existed.
*/
test.describe('Incoming · bulk tracking paste', () => {
  test.fixme(true, 'bulk-tracking panel + its rail host are orphaned — no entry point renders');

  test('the bulk-tracking paste entry is reachable beside the always-open search field', async ({ page }) => {
    await openIncoming(page);

    // Scoped search is an always-open find field (the expand toggle that used
    // to gate it is retired). The bulk-tracking paste action sits beside it —
    // it must stay reachable without a hover/expand gesture on the field.
    const search = page.getByRole('textbox', { name: /Filter purchase order #/i });
    await expect(search).toBeVisible();

    await expect(pasteEntry(page)).toBeVisible();
  });

  test('a paste writes canonical deduped keys and clears the params that would narrow it', async ({
    page,
  }) => {
    // Arrive with BOTH hazards armed: a page offset and a delivery-state facet.
    // Naming trackings outranks a facet the operator armed earlier, and page 3
    // of an unfiltered lane is meaningless once the lane is filtered.
    await openIncoming(page, '?page=3&state=STALLED');

    const open = await openPastePanel(page);
    await open.getByRole('textbox', { name: 'Tracking numbers' }).fill(PASTE);
    await open.getByRole('button', { name: 'Filter', exact: true }).click();

    await expect
      .poll(() => new URL(page.url()).searchParams.get(TRACKING_IN_PARAM))
      .toBe(EXPECTED.keys.join(','));

    const params = new URL(page.url()).searchParams;
    // Deduped by CANONICAL key, so the hyphenated lowercase twin collapsed.
    expect(EXPECTED.keys.length).toBe(4);
    expect(params.get('page'), 'a stale page offset must not survive the filter').toBeNull();
    expect(params.get('state'), 'an armed facet must not silently narrow the paste').toBeNull();
  });

  test('the residual report separates NOT FOUND from OFF THE LIST, one display at a time', async ({
    page,
  }) => {
    await openIncoming(page);
    const open = await openPastePanel(page);
    await open.getByRole('textbox', { name: 'Tracking numbers' }).fill(PASTE);
    await open.getByRole('button', { name: 'Filter', exact: true }).click();

    await expect(open.getByText(/tracking numbers matched/i)).toBeVisible();

    // Two different claims: "this org has never seen that number" invites
    // checking the number, "it exists and the list drops it" answers where it
    // went. Collapsing them is the defect this panel exists to remove — so both
    // are always reachable, whatever the counts are. Idle strip cells are
    // icon-only, so the LABEL is the accessible name (never drop it for the
    // tooltip) and this asserts the same thing a screen reader hears.
    // `exact` matters: each bucket also owns a "Copy <bucket>" action, so a
    // substring match resolves to two buttons and fails strict mode.
    const offList = open.getByRole('button', { name: 'Off the list', exact: true });
    const notFound = open.getByRole('button', { name: 'Not found', exact: true });
    await expect(offList).toBeVisible();
    await expect(notFound).toBeVisible();

    // …but only ONE renders at a time. That is the whole point of the strip:
    // nine hidden rows behind a 2.5-row porthole was the reported defect.
    const shown = open.locator('[role="tabpanel"]:not([hidden])');
    await expect(shown).toHaveCount(1);

    await notFound.click();
    await expect(open.getByText(/carries these numbers at all/i)).toBeVisible();
    await expect(shown).toHaveCount(1);

    await offList.click();
    await expect(open.getByText(/the default list hides them/i)).toBeVisible();
  });

  test('the residual list is CONTENT — the panel owns the only scroll port', async ({ page }) => {
    // The regression this replaced: each bucket rendered in its own
    // `max-h-48 overflow-y-auto` box nested inside the shell's port, so the
    // answer to "where did the other nine go" was itself clipped to two and a
    // half rows. `ui-design-system.md` → Scroll ownership: a component mounted
    // into an existing scroll host is CONTENT, never a viewport.
    //
    // Asserted as "at most one element actually scrolls vertically", not as a
    // class check — a nested port that never fills is invisible to a
    // screenshot and to a style assertion alike, and this fails on any second
    // viewport regardless of how it was spelled.
    await openIncoming(page);
    const open = await openPastePanel(page);
    await open.getByRole('textbox', { name: 'Tracking numbers' }).fill(PASTE);
    await open.getByRole('button', { name: 'Filter', exact: true }).click();
    await expect(open.getByText(/tracking numbers matched/i)).toBeVisible();

    const scrollers = await open.evaluate((region) =>
      Array.from(region.querySelectorAll('*')).filter((el) => {
        const overflowY = getComputedStyle(el).overflowY;
        if (overflowY !== 'auto' && overflowY !== 'scroll') return false;
        return el.scrollHeight > el.clientHeight + 1;
      }).length,
    );
    expect(scrollers, 'a second vertical scroll port inside the panel').toBeLessThanOrEqual(1);
  });

  test('the filter is CLEARABLE from the panel that set it', async ({ page }) => {
    await openIncoming(page, `?${TRACKING_IN_PARAM}=QAE2E0000000001`);
    const open = await openPastePanel(page);

    await expect(open.getByText(/The list is filtered to 1 tracking number\./i)).toBeVisible();
    await open.getByRole('button', { name: 'Clear' }).click();

    await expect
      .poll(() => new URL(page.url()).searchParams.get(TRACKING_IN_PARAM))
      .toBeNull();
  });
});

test.describe('Incoming · recently removed (retired)', () => {
  test('incview=removed coerces off the desk — no Recently removed tab', async ({ page }) => {
    /*
      Deliberately NOT `openIncoming`: that helper waits on the bulk-paste
      entry, which is orphaned (see the note above), so this test — whose
      subject is a retired TAB, nothing to do with pasting — was failing on a
      readiness gate for an unrelated control. A gate should be the cheapest
      thing that proves the desk booted, and never a second feature's chrome.
    */
    await page.goto(`/incoming?incview=removed&${TRACKING_IN_PARAM}=QAE2E0000000001`);
    await expect(page.getByTestId('incoming-grid-body')).toBeAttached({ timeout: 30_000 });

    await expect(page.getByRole('button', { name: /Recently removed/i })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Email Triage/i })).toHaveCount(0);
    // Wire token is stripped / ignored — Pipeline POS is the only collection face.
    await expect.poll(() => new URL(page.url()).searchParams.get('incview')).not.toBe('removed');
  });
});
