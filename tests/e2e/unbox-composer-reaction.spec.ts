import { test, expect, type APIRequestContext, type Page } from '@playwright/test';

/**
 * Live Unbox mouth: Receive welds WeldedFeedbackPanel onto StationComposerHost
 * `reaction` — not a sibling card, not a corner toast.
 */

const uniq = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;

async function createCarton(request: APIRequestContext): Promise<number> {
  const res = await request.post('/api/receiving-entry', {
    data: { trackingNumber: `E2E-REACT-${uniq()}`, skipZohoMatch: true, source: 'unmatched' },
  });
  expect(res.ok(), `receiving-entry ${res.status()}: ${await res.text()}`).toBeTruthy();
  return Number((await res.json())?.record?.id);
}

async function addLine(request: APIRequestContext, receivingId: number): Promise<number> {
  const res = await request.post('/api/receiving/add-unmatched-line', {
    data: { receiving_id: receivingId, sku: `E2E-RX-${uniq()}`, item_name: 'Reaction fixture' },
  });
  expect(res.ok(), `add-unmatched-line ${res.status()}: ${await res.text()}`).toBeTruthy();
  return Number((await res.json())?.line?.id);
}

async function openUnbox(page: Page, receivingId: number, lineId: number) {
  await page.goto(`/unbox?openReceivingId=${receivingId}&lineId=${lineId}`);
  await expect(page.getByTestId('receiving-workspace')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('station-composer-host')).toBeVisible({ timeout: 30_000 });
}

test.describe('unbox composer reaction', () => {
  test.skip(({ isMobile }) => !!isMobile, 'Unbox workbench is desktop-only');

  test('Receive locally welds the panel inside the station mouth', async ({ request, page }) => {
    test.setTimeout(90_000);
    const receivingId = await createCarton(request);
    const lineId = await addLine(request, receivingId);
    await openUnbox(page, receivingId, lineId);

    const host = page.getByTestId('station-composer-host');
    await expect(host.getByTestId('welded-feedback-panel')).toHaveCount(0);

    const dock = page.locator('[data-unbox-dock-float]');
    await expect(dock.getByRole('button', { name: /^Receive locally$/i })).toBeVisible({
      timeout: 20_000,
    });
    // Primary is print-then-receive. Split "Receive" / "Receive all" is mouth-only.
    await dock
      .getByRole('button', { name: /Print only, or receive all locally/i })
      .click();
    await page.getByRole('menuitem', { name: /^(Receive|Receive all)$/ }).click();

    const panel = host.getByTestId('welded-feedback-panel');
    await expect(panel).toBeVisible({ timeout: 20_000 });
    await expect(panel).toContainText(/Received locally|Receiving/i);

    await expect(page.locator('[data-composer-weld-top="true"]')).toHaveCount(1);
    const toast = page.locator('[data-sonner-toast]');
    await expect(
      toast,
      (await toast.count())
        ? `unexpected toast: ${((await toast.first().innerText()) || '').trim()}`
        : 'no corner toast',
    ).toHaveCount(0);

    // Ticket with no accessory still keeps the receive reaction (?? falls through).
    await page.getByTestId('composer-mode-ticket').click();
    await expect(host).toHaveAttribute('data-composer-mode', 'ticket');
    await expect(panel).toBeVisible();

    await page.getByTestId('composer-mode-unbox').click();
    await expect(host).toHaveAttribute('data-composer-mode', 'unbox');
    await expect(panel).toBeVisible();

    await page.screenshot({
      path: '/tmp/unbox-composer-reaction.png',
      fullPage: false,
    });
  });
});
