import { test, expect, type Page, type Route } from '@playwright/test';
import {
  UNFOUND_GRID_COLUMNS,
  type UnfoundGridColumnKey,
} from '@/components/receiving/unfound/grid/unfound-grid-layout';

/**
 * Admin › PO Mailbox / Unfound — hand-rolled `<table>` → `LedgerGridSurface`
 * migration (thin-ledger-adapters Wave 1).
 *
 * Deterministic + DB-independent: `/api/receiving/unfound-queue` is route-mocked
 * so the surface, in-cell PATCH, and detail open are exercised against known
 * rows instead of whatever the tenant's mailbox holds today.
 */

interface MockRow {
  kind: 'email_po' | 'unmatched_receiving';
  source_id: string;
  organization_id: string;
  product_title: string | null;
  serial_numbers: string | null;
  context: string | null;
  created_at: string;
  zendesk_ticket_id: string | null;
  zendesk_synced_at: string | null;
  usa_team_note: string | null;
  vietnam_team_note: string | null;
  follow_up_at: string | null;
  checked: boolean;
  checked_at: string | null;
}

function makeRow(i: number, overrides: Partial<MockRow> = {}): MockRow {
  return {
    kind: i % 2 === 0 ? 'unmatched_receiving' : 'email_po',
    source_id: `src-${9000 + i}`,
    organization_id: 'org-e2e',
    product_title: `E2E Unfound Item ${i}`,
    serial_numbers: i % 2 === 0 ? `SNU${1000 + i}` : null,
    context:
      i % 2 === 0
        ? `1Z999AA1012345678${i}`
        : `PO email subject · PO: 19-14668-49${100 + i}`,
    created_at: `2026-07-${10 + (i % 5)}T15:00:00.000Z`,
    zendesk_ticket_id: null,
    zendesk_synced_at: null,
    usa_team_note: i === 0 ? 'Waiting on vendor' : null,
    vietnam_team_note: null,
    follow_up_at: null,
    checked: false,
    checked_at: null,
    ...overrides,
  };
}

const ROWS: MockRow[] = [
  makeRow(0, { product_title: 'Zulu Carton', usa_team_note: 'Waiting on vendor' }),
  makeRow(1, { product_title: 'Alpha Mailbox', kind: 'email_po' }),
  makeRow(2, { product_title: 'Mid Tracking', kind: 'unmatched_receiving' }),
];

async function mockUnfoundQueue(page: Page, rows: MockRow[] = ROWS) {
  await page.route(
    (url) => url.pathname === '/api/receiving/unfound-queue',
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, rows, total: rows.length }),
      });
    },
  );
}

const gridBody = (page: Page) => page.getByTestId('unfound-grid-body');
const rows = (page: Page) => gridBody(page).locator('[data-unfound-row-id]');
const headerCell = (page: Page, key: UnfoundGridColumnKey) =>
  gridBody(page).locator(`[data-grid-col-header] [data-col="${key}"]`).first();

test.describe('Admin · Unfound / PO Mailbox grid', () => {
  test.skip(({ browserName }) => browserName === 'webkit', 'ledger grid is a desktop layout');

  test('renders the LedgerGrid surface — not a hand-rolled table', async ({ page }) => {
    await mockUnfoundQueue(page);
    await page.goto('/admin?section=po_mailbox', { waitUntil: 'domcontentloaded' });

    const body = gridBody(page);
    await expect(body).toBeVisible({ timeout: 20_000 });
    await expect(rows(page)).toHaveCount(ROWS.length);
    await expect(body.locator('table')).toHaveCount(0);
    await expect(body.getByRole('table', { name: 'Unfound queue' })).toBeVisible();
  });

  test('every core column owns a track, labelled from the layout SoT', async ({ page }) => {
    await mockUnfoundQueue(page);
    await page.goto('/admin?section=po_mailbox', { waitUntil: 'domcontentloaded' });
    await expect(rows(page).first()).toBeVisible({ timeout: 20_000 });

    for (const col of UNFOUND_GRID_COLUMNS) {
      if (col.tier === 'optional') continue;
      if (col.key === 'select') continue;
      await expect(headerCell(page, col.key)).toHaveCount(1);
    }
  });

  test('clicking a row opens the detail plane', async ({ page }) => {
    await mockUnfoundQueue(page);
    await page.goto('/admin?section=po_mailbox', { waitUntil: 'domcontentloaded' });
    const first = rows(page).first();
    await expect(first).toBeVisible({ timeout: 20_000 });

    await first.click();

    await expect(first).toHaveAttribute('aria-pressed', 'true');
    // Detail panel mounts via AnimatePresence at the host — close control proves it.
    await expect(page.getByRole('button', { name: 'Close' })).toBeVisible({
      timeout: 10_000,
    });
  });

  test('in-cell edit PATCHes the unfound-queue row', async ({ page }) => {
    await mockUnfoundQueue(page);

    let patched: { url: string; body: unknown } | null = null;
    await page.route(
      (url) =>
        url.pathname.startsWith('/api/receiving/unfound-queue/') &&
        !url.pathname.endsWith('/push-to-zendesk'),
      async (route: Route) => {
        if (route.request().method() !== 'PATCH') {
          await route.fallback();
          return;
        }
        patched = {
          url: route.request().url(),
          body: route.request().postDataJSON(),
        };
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true }),
        });
      },
    );

    await page.goto('/admin?section=po_mailbox', { waitUntil: 'domcontentloaded' });
    const first = rows(page).first();
    await expect(first).toBeVisible({ timeout: 20_000 });

    const ticketCell = first.locator('[data-col="ticket"]');
    await ticketCell.click();
    const editor = ticketCell.getByRole('textbox', { name: 'Edit ticket id' });
    await expect(editor).toBeVisible();
    await editor.fill('5150');
    await editor.press('Enter');

    await expect
      .poll(() => patched, { timeout: 5_000 })
      .not.toBeNull();
    expect(patched!.url).toContain('/api/receiving/unfound-queue/');
    expect(patched!.body).toEqual({ zendesk_ticket_id: '5150' });
  });

  test('column sort is URL-durable on ?colsort=', async ({ page }) => {
    await mockUnfoundQueue(page);
    await page.goto('/admin?section=po_mailbox', { waitUntil: 'domcontentloaded' });
    await expect(rows(page).first()).toBeVisible({ timeout: 20_000 });

    await headerCell(page, 'title').click();
    await expect(page).toHaveURL(/[?&]colsort=title(&|$)/);

    const firstTitle = async () =>
      (await rows(page).first().locator('[data-col="title"]').innerText()).trim();
    expect(await firstTitle()).toContain('Alpha Mailbox');
  });
});
