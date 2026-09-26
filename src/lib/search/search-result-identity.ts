/**
 * search-result-identity — pure helpers for the comfortable /search Id track.
 * Keeps OrderIdChip / SerialChip / TrackingChip selection out of the React
 * row so unit tests can lock the precedence without rendering.
 */

import type { AiSearchHit } from '@/lib/search/ai-search-client';
import { receivingOrderIdFromParts } from '@/lib/search/receiving-search-title';

type SearchIdentityKind = 'order' | 'serial' | 'empty';

/** Left-chip identity string: */
export function orderIdFromHit(hit: AiSearchHit): string {
  const fromFacet = hit.facets?.order_id?.trim() ?? '';
  if (fromFacet) return fromFacet;
  if (hit.entityType === 'receiving') {
    const fromParts = receivingOrderIdFromParts(
      hit.facets?.po_number,
      hit.facets?.source_order_id,
    );
    if (fromParts) return fromParts;
    // Doc-arm subtitle leads with orderId after buildReceivingDoc. Skip
    // carrier-only leads (USPS / FedEx have no digits).
    const lead = (hit.subtitle ?? '').split(' · ')[0]?.trim() || '';
    return lead && /\d/.test(lead) ? lead : '';
  }
  // Order subtitles are `order_id · serial · sku · platform`.
  if (hit.entityType !== 'order') return '';
  return (hit.subtitle ?? '').split(' · ')[0]?.trim() || '';
}

export function unitSerialFromHit(hit: AiSearchHit): string {
  const fromFacet = hit.facets?.serial_number?.trim() ?? '';
  if (fromFacet) return fromFacet;
  if (hit.entityType !== 'unit') return '';
  return (hit.subtitle ?? '').split(' · ')[0]?.trim() || '';
}

/**
 * Left Id track kind. Tracking never leads — it always sits on the right
 * Tracking track when present. Receiving with a PO/order id uses 'order'.
 */
export function identityKindFor(
  hit: AiSearchHit,
  orderId: string,
  serial: string,
  _tracking: string | null,
): SearchIdentityKind {
  if (orderId && (hit.entityType === 'order' || hit.entityType === 'receiving' || hit.entityType === 'import_exception')) {
    return 'order';
  }
  if (serial && hit.entityType === 'unit') return 'serial';
  return 'empty';
}

/** Subtitle with the leading order-id segment stripped when Id already shows it. */
export function matchMetaFromHit(
  hit: AiSearchHit,
  identityKind: SearchIdentityKind,
  orderId: string,
): string {
  const sub = hit.subtitle?.trim() || '';
  if (!sub) return '';
  if (identityKind === 'order' && orderId && sub.startsWith(orderId)) {
    return sub.slice(orderId.length).replace(/^\s*·\s*/, '').trim();
  }
  if (identityKind === 'serial' && serialLead(hit) && sub.startsWith(serialLead(hit))) {
    return sub.slice(serialLead(hit).length).replace(/^\s*·\s*/, '').trim();
  }
  return sub;
}

function serialLead(hit: AiSearchHit): string {
  return (hit.subtitle ?? '').split(' · ')[0]?.trim() || '';
}

/** ORDER subtitle SoT — first segment is marketplace order_id. */
export function orderIdFromSubtitle(subtitle: string | null | undefined): string | null {
  const first = (subtitle ?? '').split(' · ')[0]?.trim() || '';
  return first || null;
}
