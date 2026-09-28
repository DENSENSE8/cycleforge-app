/**
 * Browser half of the intake product search — `GET /api/orders/intake/products`
 * (title words, SKU, item #, FNSKU, UPC or a phrase → catalog products).
 * Shared by the desk and phone order faces.
 */

import type { IntakeProductHit } from '@/lib/orders/intake-product-search';

export async function searchProducts(q: string, signal?: AbortSignal): Promise<IntakeProductHit[]> {
  const res = await fetch(`/api/orders/intake/products?q=${encodeURIComponent(q)}&limit=8`, {
    credentials: 'same-origin',
    signal,
  });
  const data = (await res.json().catch(() => null)) as { products?: IntakeProductHit[] } | null;
  return data?.products ?? [];
}
