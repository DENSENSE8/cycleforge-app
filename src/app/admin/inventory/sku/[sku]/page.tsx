import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

/**
 * Legacy admin SKU ops dump — five `AdminTable`s lived here. The canonical
 * home is the inventory shell (`/inventory?sku=`), same redirect as
 * `/inventory/sku/[sku]` and `/admin/inventory/units/[ref]`.
 */
export default async function LegacyAdminSkuRedirect({
  params,
}: {
  params: Promise<{ sku: string }>;
}) {
  const { sku: rawSku } = await params;
  const sku = decodeURIComponent(rawSku || '').trim();
  redirect(sku ? `/inventory?sku=${encodeURIComponent(sku)}` : '/inventory');
}
