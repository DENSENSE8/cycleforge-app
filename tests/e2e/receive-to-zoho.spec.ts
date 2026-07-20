import { test } from '@playwright/test';

/**
 * SUPERSEDED — see `unbox-receive-zoho-push.spec.ts`.
 *
 * This spec waited for a POST to `/api/zoho/purchase-orders/receive`. That
 * endpoint is no longer on the receive path: the Zoho purchase receive now runs
 * inside `mark-received-po`'s `after()` via
 * `getInventoryProvider().markPurchaseOrderReceived()` (Integrations-as-SoT
 * Wave B1). No such request ever fires from the browser, so the old assertion
 * could only pass by silently catching the never-resolving `waitForRequest`.
 *
 * The correct, architecture-faithful coverage lives in
 * `unbox-receive-zoho-push.spec.ts` (asserts the optimistic 200 contract, then
 * polls UNBOXED → DONE as the observable proof of `zohoReceive: 'ok'`, with an
 * automatic `debug-receive` capture on failure).
 */
test.describe('Receive PO → Zoho Inventory update (superseded)', () => {
  test.skip('moved to unbox-receive-zoho-push.spec.ts', () => {});
});
