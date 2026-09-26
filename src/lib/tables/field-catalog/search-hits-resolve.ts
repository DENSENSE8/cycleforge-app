/** Search-hit slot resolvers — pure. */

import type { CompoundSlotValue } from '@/components/tables/compound/compound-row-model';
import type { AiSearchHit } from '@/lib/search/ai-search-client';
import { orderIdFromHit, unitSerialFromHit } from '@/lib/search/search-result-identity';

function str(value: string | number | null | undefined): string | null {
  const s = String(value ?? '').trim();
  return s || null;
}

/** The VERIFIABLE handle an operator reads off this row and keys into a scanner. */
export function searchHitIdentifier(hit: AiSearchHit): string {
  const order = str(orderIdFromHit(hit));
  if (order) return order;
  const serial = str(unitSerialFromHit(hit));
  if (serial) return serial;
  const facets = hit.facets ?? {};
  const po = str(facets.po_number) ?? str(facets.source_order_id);
  if (po) return po;
  const tracking = str(facets.tracking_number);
  if (tracking) return tracking;
  return String(hit.id);
}

/** Entity noun as the TYPE column's word — the discriminator of a mixed list. */
function searchHitEntityLabel(hit: AiSearchHit): string {
  const raw = String(hit.entityType ?? '').trim();
  if (!raw) return 'Record';
  const words = raw.split('_').join(' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function resolveSearchHitsSlotValue(
  hit: AiSearchHit,
  fieldId: string,
): CompoundSlotValue | null {
  const facets = hit.facets ?? {};
  switch (fieldId) {
    case 'search-hits.identifier':
      return { kind: 'value', text: searchHitIdentifier(hit) };
    case 'search-hits.entity':
      return { kind: 'value', text: searchHitEntityLabel(hit) };
    case 'search-hits.status':
      return { kind: 'value', text: str(facets.status) };
    case 'search-hits.description':
      return { kind: 'value', text: str(hit.title) };
    case 'search-hits.channel':
      return { kind: 'value', text: str(facets.source_platform) };
    case 'search-hits.tracking':
      return { kind: 'value', text: str(facets.tracking_number) };
    case 'search-hits.serial':
      return { kind: 'value', text: str(facets.serial_number) };
    case 'search-hits.condition':
      return { kind: 'value', text: str(facets.condition_grade) };
    case 'search-hits.matched':
      return { kind: 'value', text: str(hit.matchField) };
    case 'search-hits.when':
      return { kind: 'value', text: str(facets.happened_at) };
    default:
      return null;
  }
}
