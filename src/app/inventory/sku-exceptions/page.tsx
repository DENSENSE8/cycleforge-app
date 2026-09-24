import { Suspense } from 'react';
import { requirePermission } from '@/lib/auth/page-guard';
import { SkuExceptionsLedger } from '@/components/inventory/sku-exceptions/SkuExceptionsLedger';

export const dynamic = 'force-dynamic';

/**
 * `/inventory/sku-exceptions` — Inventory › **SKU Exceptions**.
 *
 * The floor-minted placeholder SKUs (`TMP-<barcode>`) an operator created on
 * the phone because the Zoho catalog did not know the product yet, as a record
 * ledger with a triage evidence column. `?sku=TMP-…` opens that record in the
 * column, and that URL is what staff share. Phones get the same link rewritten
 * to `/m/on-hold`.
 *
 * The frame (flush industrial bar, triage region) is the Inventory layout's
 * (`InventoryDeskFrame`). Same permission as the desk's own nav row
 * (`sku_stock.view`); the writes in the evidence column are gated by their own
 * routes.
 */
export default async function InventorySkuExceptionsPage() {
  await requirePermission('sku_stock.view');
  return (
    <Suspense fallback={null}>
      <SkuExceptionsLedger />
    </Suspense>
  );
}
