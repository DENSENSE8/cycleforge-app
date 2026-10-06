/** SKU-level paperwork, client side — reach of a SKU-scope pair and the SKU's Not required flag. */

import type { SkuPaperworkReach, SkuPaperworkRequiredBody } from '@/lib/label-prints/order-packet-contracts';

async function readJson<T>(res: Response, fallback: string): Promise<T> {
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(body?.error || fallback);
  return body;
}

/** `GET /api/sku-catalog/[id]/paperwork-reach` — open orders with a line on this SKU. */
export async function fetchSkuPaperworkReach(skuCatalogId: number): Promise<SkuPaperworkReach> {
  return readJson<SkuPaperworkReach>(
    await fetch(`/api/sku-catalog/${skuCatalogId}/paperwork-reach`, { credentials: 'same-origin', cache: 'no-store' }),
    'Could not read how many open orders this SKU reaches.',
  );
}

/** `PATCH /api/sku-catalog/[id]/paperwork-required` — mark the SKU as never shipping with product paperwork (or undo it). */
export async function setSkuPaperworkRequired(skuCatalogId: number, notRequired: boolean): Promise<void> {
  const body: SkuPaperworkRequiredBody = { notRequired };
  await readJson<{ success: boolean }>(
    await fetch(`/api/sku-catalog/${skuCatalogId}/paperwork-required`, {
      method: 'PATCH',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    'Could not update whether this SKU needs paperwork.',
  );
}
