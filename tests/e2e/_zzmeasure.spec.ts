import { test, expect, type APIRequestContext, type Page } from '@playwright/test';

const uniq = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;

async function createCarton(request: APIRequestContext): Promise<number> {
  const res = await request.post('/api/receiving-entry', {
    data: { trackingNumber: `E2E-MEAS-${uniq()}`, skipZohoMatch: true, source: 'unmatched' },
  });
  const id = Number((await res.json())?.record?.id);
  return id;
}
async function addLine(request: APIRequestContext, receivingId: number): Promise<number> {
  const res = await request.post('/api/receiving/add-unmatched-line', {
    data: { receiving_id: receivingId, sku: `E2E-MEAS-${uniq()}`, item_name: 'Measure fixture' },
  });
  return Number((await res.json())?.line?.id);
}
async function openUnbox(page: Page, receivingId: number, lineId: number) {
  await page.goto(`/unbox?openReceivingId=${receivingId}&lineId=${lineId}`);
  await expect(page.getByTestId('receiving-workspace')).toBeVisible({ timeout: 30_000 });
}

async function openDisplaysLeaf(page: Page, label: string) {
  await page.getByTestId('unbox-displays-pane-toggle').click();
  await expect(page.getByTestId('receiving-displays-push')).toBeVisible({ timeout: 15_000 });
  const displays = page.getByTestId('receiving-displays-push');
  const onStrip = displays.getByRole('button', { name: new RegExp(`^${label}\\b`, 'i') });
  if ((await onStrip.count()) > 0) {
    await onStrip.first().click();
  } else {
    await displays.getByRole('button', { name: /more displays/i }).click();
    await page.getByRole('menuitem', { name: new RegExp(label, 'i') }).click();
  }
}

async function dump(page: Page, tag: string) {
  const g = await page.evaluate(() => {
    const box = (el: Element | null) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.x), r: Math.round(r.right), w: Math.round(r.width) };
    };
    const ws = document.querySelector('[data-testid="receiving-workspace"]');
    return {
      viewport: window.innerWidth,
      workspace: box(ws),
      center: box(document.querySelector('[data-testid="unbox-station-center"]')),
      measure: box(ws?.querySelector('.max-w-\\[720px\\]') ?? null),
      displays: box(document.querySelector('[data-testid="receiving-displays-push"]')),
      claim: box(document.querySelector('[data-testid="receiving-claim-panel"]')),
      ring: box(document.querySelector('[data-testid="unbox-displays-expand-button"]')),
      close: box(document.querySelector('[data-testid="unbox-push-close"]')),
      peek: box(document.querySelector('[data-testid="photo-peek"]')),
      contextBar: box(document.querySelector('[data-testid="station-context-bar"]')),
      identityMeasure: box(document.querySelector('[data-testid="station-identity-measure"]')),
    };
  });
  console.log(`\n### ${tag}\n` + JSON.stringify(g, null, 0));
}

test('MEASURE unbox geometry', async ({ page, request }) => {
  const receivingId = await createCarton(request);
  const lineId = await addLine(request, receivingId);

  await openUnbox(page, receivingId, lineId);
  await dump(page, 'CLOSED (no displays)');

  await openDisplaysLeaf(page, 'Classify');
  await expect(page.getByTestId('receiving-displays-push')).toBeVisible({ timeout: 15_000 });
  await dump(page, 'OPEN @default');

  // Seed a wide persisted width then re-open.
  await page.evaluate(() => window.localStorage.setItem('unbox-displays-push-width', '900'));
  await page.getByTestId('unbox-push-close').click();
  await openDisplaysLeaf(page, 'Classify');
  await expect(page.getByTestId('receiving-displays-push')).toBeVisible({ timeout: 15_000 });
  await dump(page, 'OPEN @seed900');

  await page.evaluate(() => window.localStorage.setItem('unbox-displays-push-width', '300'));
  await page.getByTestId('unbox-push-close').click();
  await openDisplaysLeaf(page, 'Classify');
  await expect(page.getByTestId('receiving-displays-push')).toBeVisible({ timeout: 15_000 });
  await dump(page, 'OPEN @seed300');

  await page.getByRole('button', { name: /File claim|claim/i }).first().click();
  await expect(page.getByTestId('receiving-claim-panel')).toBeVisible({ timeout: 15_000 });
  await dump(page, 'CLAIM open');
});
