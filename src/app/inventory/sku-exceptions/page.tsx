import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

/** `/inventory/sku-exceptions` — Inventory › **SKU Exceptions**. */
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
