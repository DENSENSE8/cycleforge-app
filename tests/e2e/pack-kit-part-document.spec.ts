import { test, expect, type APIRequestContext } from '@playwright/test';
import { QA_FIXTURE_ORDERS, QA_FIXTURE_SKUS } from '@/lib/tenancy/qa-org';

/**
 * Pack kit-part reference documents — Candidate B, Phase 1
 * (docs/todo/step-document-reveal-RULING.md).
 *
 * Pins the three facts the ruling's shape rests on:
 *   1. a kit part carrying a document reveals the in-row disclosure strip;
 *   2. tapping View hands the full read off to the 640px `DocumentSlideOver`
 *      — there is exactly ONE viewer, and the strip is not it;
 *   3. a part WITHOUT a document renders byte-identically to before the column
 *      existed (no strip at all). That absence is the half of the contract a
 *      page-wide selector cannot prove, which is why each part row carries its
 *      own `pack-kit-part-<id>` handle.
 *
 * QA org (`verify.md`): the two parts are created here rather than assumed,
 * because the dogfood tenant's BOM changes under the test. They hang off the
 * QA speaker SKU's catalog row and are deleted in `afterAll`.
 *
 * The active order is handed to the pane through the app's OWN dispatch helper
 * (`dispatchPackActiveOrder` → the `pack-active-order-changed` event). The Pack
 * queue reaches the panel by the same event, and the queue's own membership
 * (TESTED + unshipped) is a different surface's contract — asserting it here
 * would make this spec fail for reasons that have nothing to do with inserts.
 */

// A real, public Blob pdf already served by this app (the manuals library) —
// the packer's bytes must come from a directly-fetchable url, never
// /api/documents/:id/content, because packing.* does not imply orders.view.
const INSERT_URL =
  'https://dxo1iaq12ujzkoor.public.blob.vercel-storage.com/manuals/1%20Templates/QR%20Code%20Manual.pdf';
const INSERT_TITLE = 'E2E Warranty card (insert)';
const PLAIN_PART_NAME = 'E2E Power cable (no insert)';

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

interface CreatedPart {
  id: number;
  component_name: string;
}

async function createPart(
  request: APIRequestContext,
  catalogId: number,
  body: Record<string, unknown>,
): Promise<CreatedPart> {
  const res = await request.post(`/api/sku-catalog/${catalogId}/kit-parts`, { data: body });
  expect(res.status(), `create kit part ${String(body.componentName)}`).toBe(201);
  const json = await res.json();
  return json.part as CreatedPart;
}

test.describe('Pack kit-part reference document', () => {
  let catalogId = 0;
  let orderRowId = 0;
  let docPartId = 0;
  let plainPartId = 0;

  test.beforeAll(async ({ playwright }, testInfo) => {
    test.skip(testInfo.project.name !== 'qa-desktop', 'QA org fixtures — qa-desktop project');

    const request = await playwright.request.newContext({
      baseURL: testInfo.project.use.baseURL,
      storageState: testInfo.project.use.storageState as string,
    });
    try {
      const catRes = await request.get(
        `/api/sku-catalog?q=${encodeURIComponent(QA_FIXTURE_SKUS.speaker)}&limit=5`,
      );
      expect(catRes.ok(), 'sku-catalog lookup').toBeTruthy();
      const cat = await catRes.json();
      const row = (cat.items as Array<{ id: number; sku: string }>).find(
        (i) => i.sku === QA_FIXTURE_SKUS.speaker,
      );
      expect(row, `QA fixture SKU ${QA_FIXTURE_SKUS.speaker} — run pnpm provision:qa-org`).toBeTruthy();
      catalogId = row!.id;

      const ordersRes = await request.get('/api/orders?limit=200');
      expect(ordersRes.ok(), 'orders list').toBeTruthy();
      const orders = (await ordersRes.json()).orders as Array<{ id: number; order_id: string }>;
      const order = orders.find((o) => o.order_id === QA_FIXTURE_ORDERS.awaiting);
      expect(order, `QA fixture order ${QA_FIXTURE_ORDERS.awaiting}`).toBeTruthy();
      orderRowId = Number(order!.id);

      const docPart = await createPart(request, catalogId, {
        componentName: 'E2E Quick-start guide',
        componentType: 'MANUAL',
        isCritical: true,
        sortOrder: 1,
        documentUrl: INSERT_URL,
        documentTitle: INSERT_TITLE,
        documentMime: 'pdf',
      });
      docPartId = docPart.id;

      const plainPart = await createPart(request, catalogId, {
        componentName: PLAIN_PART_NAME,
        componentType: 'CABLE',
        isCritical: false,
        sortOrder: 2,
      });
      plainPartId = plainPart.id;
    } finally {
      await request.dispose();
    }
  });

  test.afterAll(async ({ playwright }, testInfo) => {
    if (!catalogId) return;
    const request = await playwright.request.newContext({
      baseURL: testInfo.project.use.baseURL,
      storageState: testInfo.project.use.storageState as string,
    });
    try {
      for (const partId of [docPartId, plainPartId].filter(Boolean)) {
        await request
          .delete(`/api/sku-catalog/${catalogId}/kit-parts`, { data: { partId } })
          .catch(() => {});
      }
    } finally {
      await request.dispose();
    }
  });

  test('pack-checklist DTO carries the document only for the part that has one', async ({
    request,
  }) => {
    test.skip(test.info().project.name !== 'qa-desktop', 'QA org fixtures — qa-desktop project');

    const res = await request.get(`/api/orders/${orderRowId}/pack-checklist`);
    expect(res.ok(), `pack-checklist ${res.status()}`).toBeTruthy();
    const body = await res.json();

    const parts = (body.lines as Array<{ kitParts: Array<Record<string, unknown>> }>).flatMap(
      (l) => l.kitParts,
    );
    const doc = parts.find((p) => Number(p.id) === docPartId);
    const plain = parts.find((p) => Number(p.id) === plainPartId);

    expect(doc, 'document-bearing part on the checklist').toBeTruthy();
    expect(doc!.document).toMatchObject({ url: INSERT_URL, title: INSERT_TITLE, mime: 'pdf' });

    // Absence is a null, not a missing key — the row renders exactly as it did
    // before the column existed.
    expect(plain, 'plain part on the checklist').toBeTruthy();
    expect(plain!.document).toBeNull();
  });

  test('the strip shows only on the document-bearing part and View opens the slide-over', async ({
    page,
  }) => {
    test.skip(test.info().project.name !== 'qa-desktop', 'QA org fixtures — qa-desktop project');

    await page.goto('/pack');
    // The browse workbench renders before hydration; the pane's event listener
    // does not. Re-dispatching until the checklist mounts is what makes this
    // deterministic — a single evaluate() lands on an unhydrated tree and is
    // silently dropped.
    await expect(page.getByRole('button', { name: 'History' })).toBeVisible({ timeout: 30_000 });

    const pane = {
      orderRowId,
      orderId: QA_FIXTURE_ORDERS.awaiting,
      productTitle: 'QA — Unshipped AWAITING (add tracking here)',
      qty: 1,
      condition: 'New',
      tracking: '',
      sku: QA_FIXTURE_SKUS.speaker,
      scanType: 'ORDERS' as const,
    };

    await expect(async () => {
      await page.evaluate((detail) => {
        window.dispatchEvent(new CustomEvent('pack-active-order-changed', { detail }));
      }, pane);
      await expect(page.getByText('Pack checklist')).toBeVisible({ timeout: 3_000 });
    }).toPass({ timeout: 45_000 });

    // Expand the order line so its "In the box" parts render.
    await page.getByRole('button', { name: 'Expand details' }).first().click();

    const docRow = page.getByTestId(`pack-kit-part-${docPartId}`);
    const plainRow = page.getByTestId(`pack-kit-part-${plainPartId}`);
    await expect(docRow).toBeVisible({ timeout: 15_000 });
    await expect(plainRow).toBeVisible();

    const strip = docRow.getByTestId('kit-part-document-strip');
    await expect(strip).toBeVisible();
    await expect(strip).toContainText(INSERT_TITLE);
    await expect(strip.getByRole('button', { name: 'View' })).toBeVisible();
    await expect(strip.getByRole('button', { name: 'Print' })).toBeVisible();

    // The no-document part is untouched — no strip, not a hidden one.
    await expect(plainRow.getByTestId('kit-part-document-strip')).toHaveCount(0);

    // The full read hands off to the ONE viewer, not to a second in-row render.
    await strip.getByRole('button', { name: 'View' }).click();
    const slideOver = page.getByRole('dialog', { name: 'Pack inserts preview' });
    await expect(slideOver).toBeVisible();

    // It is showing THIS part's insert, from the Blob url — the permission
    // constraint the column exists for (never /api/documents/:id/content).
    const frame = slideOver.locator(`iframe[title="${INSERT_TITLE}"]`);
    await expect(frame).toHaveCount(1);
    await expect(frame).toHaveAttribute('src', new RegExp(`^${escapeRegExp(INSERT_URL)}`));
  });
});
