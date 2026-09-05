/**
 * Exceptions queue verbs. Header owns **Resolve**. **Paste item #** lives on
 * the row Morphing menu and commits against that row (listing URL or id →
 * catalog match / pair).
 */

import { itemNumberFromPaste } from '@/lib/inventory/listing-candidate';
import { matchCatalogHits, type CatalogPasteHit } from '@/lib/inventory/catalog-paste-match';

export type ExceptionsPasteTarget = {
  id: number;
  itemNumber: string | null;
  accountSource: string | null;
};

export type ExceptionsPasteResult =
  | { ok: false; error: string }
  | { ok: true; outcome: 'ambiguous' }
  | { ok: true; outcome: 'saved-item' }
  | { ok: true; outcome: 'matched'; sku: string; ordersUpdated: number };

async function postJson(url: string, body: unknown, method = 'POST') {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || data.success === false || data.ok === false) {
    throw new Error(String(data.error || `Request failed (${res.status})`));
  }
  return data;
}

export async function commitExceptionsItemPaste(
  raw: string,
  targets: readonly ExceptionsPasteTarget[],
): Promise<ExceptionsPasteResult> {
  const itemNumber = itemNumberFromPaste(raw);
  if (!itemNumber) {
    return { ok: false, error: 'Paste an item number or listing URL.' };
  }
  if (targets.length === 0) {
    return { ok: false, error: 'Nothing in the queue to match.' };
  }

  try {
    const params = new URLSearchParams({
      q: itemNumber,
      limit: '15',
      searchField: 'zoho_catalog',
    });
    const res = await fetch(`/api/sku-catalog/search?${params}`, {
      credentials: 'same-origin',
    });
    if (!res.ok) throw new Error('Could not search the catalog.');
    const body = (await res.json()) as { items?: CatalogPasteHit[] };
    const hits = Array.isArray(body.items) ? body.items : [];
    const match = matchCatalogHits(hits, itemNumber);

    if (match.kind === 'ambiguous') {
      return { ok: true, outcome: 'ambiguous' };
    }

    if (match.kind === 'none') {
      for (const target of targets) {
        await postJson(`/api/orders/${target.id}`, { itemNumber }, 'PATCH');
      }
      return { ok: true, outcome: 'saved-item' };
    }

    let ordersUpdated = 0;
    for (const target of targets) {
      const listingKey =
        match.kind === 'exact' ? (target.itemNumber || itemNumber).trim() : itemNumber;
      if (!target.itemNumber || target.itemNumber !== listingKey) {
        await postJson(`/api/orders/${target.id}`, { itemNumber: listingKey }, 'PATCH');
      }
      const data = await postJson('/api/sku-catalog/pair', {
        skuCatalogId: match.hit.id,
        itemNumber: listingKey,
        platform: (target.accountSource || 'manual').toLowerCase(),
      });
      ordersUpdated += Number(data.ordersUpdated ?? 0);
    }
    return {
      ok: true,
      outcome: 'matched',
      sku: match.hit.sku,
      ordersUpdated,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Could not match that item number.',
    };
  }
}
