import { test, expect, type Page } from '@playwright/test';
import { QA_FIXTURE_ORDERS, QA_FIXTURE_ORDER_TITLES } from '@/lib/tenancy/qa-org';

/**
 * Omni-Command Composer — the one field on the Warehouse OS default screen
 * (docs/omni-command-composer.md). REAL data: every lookup/search below hits
 * the QA org's own API — no `page.route` mocks on the happy path.
 *
 * QA org only. The fixture order NUMBERS are stable strings
 * (`QA_FIXTURE_ORDERS`); pks are not, so rows are resolved through the app's
 * own lookup API at runtime.
 *
 *   PW_BASE_URL=http://127.0.0.1:3051 npx playwright test tests/e2e/omni-command-composer.spec.ts --project=qa-desktop
 *
 * The worktree dev server on :3051 is OPERATOR-OWNED. If it is down, or the
 * QA org is not provisioned, the file skips with instructions — it never
 * starts a server or invents an order number.
 */

const COMPOSER = '[contenteditable="true"][aria-label="Omni-command composer"]';
const CHIP = '.occ-chip';
const TYPEAHEAD = '.occ-typeahead';
const MISS_TOKEN = 'QA-TEST-DOES-NOT-EXIST-99999';

/** Boot the shell (`/` — the well + composer are the layout) or skip. */
async function bootShell(page: Page): Promise<void> {
  try {
    await page.goto('/');
  } catch {
    test.skip(
      true,
      'The Warehouse OS dev server is not answering (PW_BASE_URL / :3051). It is operator-owned — ask the operator to start the worktree server, then rerun.',
    );
  }
  await expect(page.locator(COMPOSER)).toBeVisible({ timeout: 30_000 });
}

/** Resolve a QA fixture order through the app's own lookup API, or skip. */
async function requireFixture(page: Page, orderNumber: string): Promise<number> {
  const res = await page.request.get(`/api/orders/lookup/${encodeURIComponent(orderNumber)}`);
  if (!res.ok()) {
    test.skip(
      true,
      `QA fixture order ${orderNumber} did not resolve (HTTP ${res.status()}). Run \`pnpm provision:qa-org\` against this database, then rerun.`,
    );
  }
  const id = Number(((await res.json()) as { order?: { id?: unknown } })?.order?.id);
  expect(Number.isFinite(id) && id > 0, 'lookup returned order.id').toBe(true);
  return id;
}

async function typeIntoComposer(page: Page, text: string): Promise<void> {
  const field = page.locator(COMPOSER);
  await field.click();
  await field.pressSequentially(text);
}

test.describe('Omni-Command Composer', () => {
  test('1 · mount: one field in the well, chip host ready', async ({ page }) => {
    await bootShell(page);

    // The composer is the field inside the composer box in the well.
    await expect(page.locator(`.feed-entry ${COMPOSER}`)).toBeVisible();
    await expect(page.locator('.occ-root')).toBeVisible();

    // ONE field: no second text input anywhere in the well (launcher closed).
    await expect(page.locator('.well [contenteditable="true"]')).toHaveCount(1);
    await expect(page.locator('.well input, .well textarea')).toHaveCount(0);
  });

  test('2 · complete id auto-chips, hydrates the feed, opens the orders tile', async ({ page }) => {
    await bootShell(page);
    const pk = await requireFixture(page, QA_FIXTURE_ORDERS.pending);

    const lookup = page.waitForResponse(
      (res) =>
        res.url().includes(`/api/orders/lookup/${QA_FIXTURE_ORDERS.pending}`) &&
        res.request().method() === 'GET',
      { timeout: 20_000 },
    );

    // No `#`, no Enter — the bare identifier is the scanner path.
    await typeIntoComposer(page, QA_FIXTURE_ORDERS.pending);

    const lookupRes = await lookup;
    expect(lookupRes.status()).toBe(200);
    const body = (await lookupRes.json()) as { order?: { id?: unknown } };
    expect(Number(body.order?.id)).toBe(pk);

    // The chip holds the resolved row.
    const chip = page.locator(`${CHIP}[data-order-id="${QA_FIXTURE_ORDERS.pending}"]`);
    await expect(chip).toBeVisible({ timeout: 15_000 });
    await expect(chip).toHaveAttribute('data-pk', String(pk));

    // Feed summary paints the real product title…
    await expect(page.locator('.assistant-feed')).toContainText(QA_FIXTURE_ORDER_TITLES.pending, {
      timeout: 10_000,
    });
    // …and the orders tile opened (narrated + a left-rail row).
    await expect(page.locator('.assistant-feed')).toContainText('Opened Orders.');
    await page.keyboard.press('Control+b');
    await expect(page.locator('.rail.left')).toContainText('Orders');
  });

  test('3 · # trigger lists real hits; selection commits exactly one chip', async ({ page }) => {
    await bootShell(page);
    await requireFixture(page, QA_FIXTURE_ORDERS.pending);

    await typeIntoComposer(page, '#QA-TEST');

    // Real rows from the tenant-scoped search — not empty, not mocked.
    const items = page.locator(`${TYPEAHEAD} .occ-typeahead-item`);
    await expect(items.first()).toBeVisible({ timeout: 15_000 });
    expect(await items.count()).toBeGreaterThan(0);

    // A prefix alone must not auto-chip while the menu sits open.
    await expect(page.locator(CHIP)).toHaveCount(0);

    // Enter selects the highlighted hit → one chip.
    await page.keyboard.press('Enter');
    await expect(page.locator(CHIP)).toHaveCount(1, { timeout: 15_000 });
  });

  test('4 · a unique prefix does not auto-chip', async ({ page }) => {
    await bootShell(page);
    await requireFixture(page, QA_FIXTURE_ORDERS.pending);

    await typeIntoComposer(page, 'QA-TEST-');
    // Wait well past the composer's debounce; the typeahead may show, a chip may not.
    await page.waitForTimeout(1200);
    await expect(page.locator(CHIP)).toHaveCount(0);
  });

  test('5 · /pack runs the packing action; ⌘K still belongs to the launcher', async ({ page }) => {
    await bootShell(page);

    await typeIntoComposer(page, '/pack');
    await expect(page.locator(TYPEAHEAD)).toContainText('Packing session', { timeout: 10_000 });

    // Commit — the same destination ref the launcher opens.
    await page.keyboard.press('Enter');
    const block = page.locator('.feed-block[data-state="armed"]');
    await expect(block).toBeVisible({ timeout: 10_000 });
    await expect(block).toContainText('Packing');

    // The composer did not steal the launcher's chord.
    await page.keyboard.press('Control+k');
    await expect(page.locator('.launcher.open')).toBeVisible();
    await expect(page.locator('.launcher-input')).toBeVisible();
    await page.keyboard.press('Escape');
  });

  test('6 · a complete-looking miss: no chip, no crash', async ({ page }) => {
    await bootShell(page);

    // Prove the token really 404s through the app's own API first.
    const probe = await page.request.get(`/api/orders/lookup/${encodeURIComponent(MISS_TOKEN)}`);
    test.skip(probe.ok(), `${MISS_TOKEN} unexpectedly resolves in this org — pick a new miss token`);

    await typeIntoComposer(page, MISS_TOKEN);
    await page.waitForTimeout(1200);

    await expect(page.locator(CHIP)).toHaveCount(0);
    // Typeahead has nothing real to offer for it.
    await expect(page.locator(`${TYPEAHEAD} .occ-typeahead-item`)).toHaveCount(0);
    // The shell is intact and the field still holds the token.
    await expect(page.locator(COMPOSER)).toBeVisible();
    await expect(page.locator(COMPOSER)).toContainText(MISS_TOKEN);

    // Enter-committing the miss narrates it into the feed.
    await page.keyboard.press('Enter');
    await expect(page.locator('.assistant-feed')).toContainText('No order matched', {
      timeout: 10_000,
    });
    await expect(page.locator(CHIP)).toHaveCount(0);
  });

  test('7 · Enter sends prose; Shift+Enter does not', async ({ page }) => {
    await bootShell(page);

    await typeIntoComposer(page, 'describe the work');
    await page.keyboard.press('Shift+Enter');
    // Nothing sent yet — no operator bubble.
    await expect(page.locator('.feed-msg.operator')).toHaveCount(0);

    await page.keyboard.press('Enter');
    await expect(page.locator('.feed-msg.operator').last()).toContainText('describe the work', {
      timeout: 10_000,
    });
    // The composer cleared.
    await expect(page.locator(COMPOSER)).not.toContainText('describe the work');
  });

  test('8 · hydration survives the right rail: composer and chip stay put', async ({ page }) => {
    await bootShell(page);
    await requireFixture(page, QA_FIXTURE_ORDERS.pending);

    await typeIntoComposer(page, QA_FIXTURE_ORDERS.pending);
    const chip = page.locator(`${CHIP}[data-order-id="${QA_FIXTURE_ORDERS.pending}"]`);
    await expect(chip).toBeVisible({ timeout: 20_000 });

    // Open the right rail — the well never yields the centre.
    await page.keyboard.press('Control+Shift+b');
    await expect(page.locator(COMPOSER)).toBeVisible();
    await expect(chip).toBeVisible();
  });

  test('9 · a wedge-shaped burst chips — never a chat line of raw digits', async ({ page }) => {
    await bootShell(page);
    const pk = await requireFixture(page, QA_FIXTURE_ORDERS.pending);

    // Machine-fast keydowns (< WEDGE_MAX_INTER_KEY_MS gaps) ending in the
    // terminator — the same contract useFindFieldScan.test.ts drives, through
    // the real browser. A claimed burst is stripped + committed; an unclaimed
    // one commits through the Enter identifier arm. Either way: a chip.
    const field = page.locator(COMPOSER);
    await field.click();
    await field.pressSequentially(QA_FIXTURE_ORDERS.pending, { delay: 5 });
    await page.keyboard.press('Enter');

    const chip = page.locator(`${CHIP}[data-order-id="${QA_FIXTURE_ORDERS.pending}"]`);
    await expect(chip).toBeVisible({ timeout: 15_000 });
    await expect(chip).toHaveAttribute('data-pk', String(pk));

    // Hydration, not chat: the feed shows the order summary and NO operator
    // bubble carrying the raw token.
    await expect(page.locator('.assistant-feed')).toContainText(QA_FIXTURE_ORDER_TITLES.pending, {
      timeout: 10_000,
    });
    await expect(
      page.locator('.feed-msg.operator', { hasText: QA_FIXTURE_ORDERS.pending }),
    ).toHaveCount(0);
  });
});
