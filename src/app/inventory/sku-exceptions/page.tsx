import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

/**
 * `/inventory/sku-exceptions` — Inventory › **SKU Exceptions**.
 *
 * The on-hold placeholder SKUs (`TMP-<barcode>`, or `TMP-XXXXX-XXXXX` made
 * without a barcode) an operator created on the phone — or here, through the
 * **New temp SKU** header verb — because the Zoho catalog did not know the
 * product yet, as a record ledger with a triage evidence column. `?sku=TMP-…`
 * opens that record in the column, and that URL is what staff share. Phones
 * get the same link rewritten to `/m/on-hold`.
 *
 * The frame (flush industrial bar, triage region) is the Inventory layout's
 * (`InventoryDeskFrame`). Same permission as the desk's own nav row
 * (`sku_stock.view`); the writes in the evidence column are gated by their own
 * routes.
 */
export default async function InventorySkuExceptionsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; sku?: string }>;
}) {
  const { q, sku } = await searchParams;
  const params = new URLSearchParams({ status: 'on-hold' });
  if (q?.trim()) params.set('q', q.trim());
  if (sku?.trim()) params.set('sku', sku.trim());
  redirect(`/inventory/stock?${params.toString()}`);
}
