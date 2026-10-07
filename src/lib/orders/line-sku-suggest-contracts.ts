/** `/api/orders/[id]/sku-suggestions` wire shapes — see `line-sku-suggest.ts`. */

import type { ListingLink, ListingStorefront } from '@/utils/external-item-url';

/**
 * Part-number-looking tokens of a title: 5+ characters of letters, digits and
 * dashes holding at least 3 digits (`360148-0010`, `RC18T1-27`) — a 4-digit
 * year is too short to count.
 * The SKU suggestion and the paperwork suggestions both search by these.
 */
export function titlePartNumbers(title: string): string[] {
  const out = new Set<string>();
  for (const match of title.matchAll(/[A-Za-z0-9][A-Za-z0-9-]{4,}/g)) {
    const token = match[0].replace(/-+$/, '');
    if (token.length >= 5 && (token.match(/\d/g)?.length ?? 0) >= 3) out.add(token.toUpperCase());
  }
  return [...out];
}

export interface LineSkuSuggestion {
  skuCatalogId: number;
  sku: string;
  title: string;
  imageUrl: string | null;
  /** Why it is suggested: a part number from the line's title, or title similarity (as a percent). */
  reason: { kind: 'part_number' | 'title'; value: string };
  /** This SKU's listing on the order's platform (`resolveListingLink`), so the operator can check it before confirming. */
  listing: ListingLink;
}

export interface LineSkuSuggestions {
  lineId: number;
  /** Already linked — the popover shows no suggestion. */
  linkedSkuCatalogId: number | null;
  /** The order's storefront — catalog search results resolve their listing link on it. */
  storefront: ListingStorefront | null;
  suggestions: LineSkuSuggestion[];
}

export const lineSkuSuggestionsKey = (lineId: number) => ['line-sku-suggestions', lineId] as const;

export async function fetchLineSkuSuggestions(lineId: number): Promise<LineSkuSuggestions> {
  const res = await fetch(`/api/orders/${lineId}/sku-suggestions`, { credentials: 'same-origin' });
  const json = (await res.json().catch(() => ({}))) as LineSkuSuggestions & { error?: string };
  if (!res.ok) throw new Error(json.error ?? `Could not read SKU suggestions (${res.status})`);
  return json;
}

export async function confirmLineSkuHttp(lineId: number, skuCatalogId: number): Promise<{ sku: string; learned: boolean; ordersBackfilled: number }> {
  const res = await fetch(`/api/orders/${lineId}/sku-suggestions`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ skuCatalogId }),
  });
  const json = (await res.json().catch(() => ({}))) as { sku?: string; learned?: boolean; ordersBackfilled?: number; error?: string };
  if (!res.ok || !json.sku) throw new Error(json.error ?? `Could not link the SKU (${res.status})`);
  return { sku: json.sku, learned: Boolean(json.learned), ordersBackfilled: Number(json.ordersBackfilled ?? 0) };
}
