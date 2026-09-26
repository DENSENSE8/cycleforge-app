/**
 * Pure helpers for Support ticket create from order/tracking/serial linkages.
 * Kept DB-free so unit tests cover anchor selection without Neon.
 */

import type { OrderLinkage } from '@/lib/order-linkage';
import type { TicketLinkAnchorInput } from '@/lib/support/ticket-link';

export interface SupportTicketLinkages {
  order?: string | null;
  tracking?: string | null;
  serial?: string | null;
}

interface LinkageAnchorPlan {
  /** Primary ticket_links anchor (or null when nothing resolved). */
  anchor: TicketLinkAnchorInput | null;
  /**
   * Extra tracking numbers to attach as SHIPMENT *references* after the primary
   * anchor is linked (skips the primary STN / typed tracking used as anchor).
   */
  extraTrackingRefs: string[];
}

function trackingStrings(linkage: OrderLinkage): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const t of linkage.trackings) {
    const raw = (t.tracking ?? '').trim();
    if (!raw) continue;
    const key = raw.toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(raw);
  }
  return out;
}

/** Choose the primary create-anchor + extra STN refs from an optional explicit anchor and a resolved closed-loop linkage. */
export function pickAnchorFromLinkage(args: {
  explicitAnchor?: TicketLinkAnchorInput | null;
  linkages?: SupportTicketLinkages | null;
  resolved?: OrderLinkage | null;
}): LinkageAnchorPlan {
  const explicit = args.explicitAnchor ?? null;
  const linkages = args.linkages ?? null;
  const resolved = args.resolved ?? null;
  const typedTracking = (linkages?.tracking ?? '').trim() || null;
  const allTrackings = resolved ? trackingStrings(resolved) : typedTracking ? [typedTracking] : [];

  const skipKeys = new Set<string>();

  if (explicit) {
    if (explicit.type === 'tracking') {
      skipKeys.add(explicit.trackingNumber.trim().toUpperCase());
    }
    // Order/shipment anchors already pin the primary STN via the link waist —
    // skip the primary tracking from the resolved loop so we don't double-ref.
    if ((explicit.type === 'order' || explicit.type === 'shipment') && resolved) {
      const primary =
        resolved.trackings.find((t) => t.isPrimary)?.tracking ??
        resolved.trackings[0]?.tracking ??
        null;
      if (primary) skipKeys.add(primary.trim().toUpperCase());
    }
    return {
      anchor: explicit,
      extraTrackingRefs: allTrackings.filter((t) => !skipKeys.has(t.toUpperCase())),
    };
  }

  if (resolved?.order?.id) {
    const primary =
      resolved.trackings.find((t) => t.isPrimary)?.tracking ??
      resolved.trackings[0]?.tracking ??
      null;
    if (primary) skipKeys.add(primary.trim().toUpperCase());
    return {
      anchor: { type: 'order', orderId: resolved.order.id },
      extraTrackingRefs: allTrackings.filter((t) => !skipKeys.has(t.toUpperCase())),
    };
  }

  if (typedTracking) {
    skipKeys.add(typedTracking.toUpperCase());
    return {
      anchor: { type: 'tracking', trackingNumber: typedTracking },
      extraTrackingRefs: allTrackings.filter((t) => !skipKeys.has(t.toUpperCase())),
    };
  }

  const firstTracking = allTrackings[0] ?? null;
  if (firstTracking) {
    skipKeys.add(firstTracking.toUpperCase());
    return {
      anchor: { type: 'tracking', trackingNumber: firstTracking },
      extraTrackingRefs: allTrackings.filter((t) => !skipKeys.has(t.toUpperCase())),
    };
  }

  return { anchor: null, extraTrackingRefs: [] };
}

/** Deterministic subject seed from resolved facts (claim/Hermes fact-line shape). */
export function buildSupportTicketSubjectFromLinkage(linkage: OrderLinkage): string | null {
  const parts: string[] = ['Support'];
  if (linkage.order?.orderId) {
    parts.push(`Order #${linkage.order.orderId}`);
  }
  const trk =
    linkage.trackings.find((t) => t.isPrimary)?.tracking ??
    linkage.trackings[0]?.tracking ??
    null;
  if (trk) parts.push(`TRK#${trk}`);
  const serial = linkage.serials[0]?.serial ?? null;
  if (serial) parts.push(`SN ${serial}`);
  return parts.length > 1 ? parts.join(' // ') : null;
}

export function hasSupportTicketLinkages(linkages?: SupportTicketLinkages | null): boolean {
  if (!linkages) return false;
  return Boolean(
    (linkages.order && linkages.order.trim()) ||
      (linkages.tracking && linkages.tracking.trim()) ||
      (linkages.serial && linkages.serial.trim()),
  );
}
