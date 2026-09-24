import { Suspense } from 'react';
import { requirePermission } from '@/lib/auth/page-guard';
import { ModeRegion } from '@/design-system/providers/ModeRegion';
import { SkuExceptionsWorkbench } from '@/components/inventory/sku-exceptions/SkuExceptionsWorkbench';

export const dynamic = 'force-dynamic';

/**
 * `/inventory/sku-exceptions` — Inventory › **SKU Exceptions**.
 *
 * The floor-minted placeholder SKUs (`TMP-<barcode>`) an operator created on
 * the phone because the Zoho catalog did not know the product yet. The queue
 * is a DataTable; `?sku=TMP-…` swaps it for that record's editor, and that URL
 * is what staff share. Phones get the same link rewritten to `/m/on-hold`.
 *
 * Same permission as the desk's own nav row (`sku_stock.view`); the writes
 * inside the editor are gated by their own routes.
 */
export default async function InventorySkuExceptionsPage() {
  await requirePermission('sku_stock.view');
  return (
    <ModeRegion mode="triage" className="contents">
      <Suspense
        fallback={
          <div className="flex h-full w-full items-center justify-center bg-surface-canvas">
            <p className="text-role-caption text-text-soft">Loading SKU exceptions…</p>
          </div>
        }
      >
        <SkuExceptionsWorkbench />
      </Suspense>
    </ModeRegion>
  );
}
