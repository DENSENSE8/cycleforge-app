/**
 * Pure visibility / data-path resolution for {@link WorkspaceTimelineTab}.
 * Unit-tested DB-free — no React.
 */

import type { TimelineItem } from '@/lib/timeline/types';

export type WorkspaceTimelineAnchor = {
  /** PO-scoped carrier fetch (Unbox/Testing receiving rows). */
  poId?: string | null;
  tracking?: string | null;
  /** Explicit serial list — skips carton fetch when non-empty. */
  serials?: string[];
  receivingId?: number | null;
  /** Order-scoped fallback for Shipping/Packing (business order id). */
  orderId?: string | null;
  /**
   * Optional Activity spine (Support station) — merged support-context events.
   * When set, Timeline prefers Activity as the lead tab (before Units / Tracking).
   */
  activity?: {
    items: TimelineItem[];
    loading?: boolean;
  } | null;
};

export type CarrierDataPath = 'po' | 'tracking' | 'order' | null;

export type TimelineSectionsPlan = {
  showCarrier: boolean;
  showSerials: boolean;
  showActivity: boolean;
  carrierVia: CarrierDataPath;
  /** Fetch carton serials when no explicit list and receivingId is set. */
  fetchCartonSerials: boolean;
  /** Tab should be visible when any section can render. */
  hasContent: boolean;
};

function trim(value: string | null | undefined): string {
  return String(value ?? '').trim();
}

export function normalizeExplicitSerials(serials: string[] | undefined): string[] {
  if (!serials?.length) return [];
  return [...new Set(serials.map((s) => s.trim()).filter(Boolean))];
}

export function resolveTimelineSections(anchor: WorkspaceTimelineAnchor): TimelineSectionsPlan {
  const poId = trim(anchor.poId);
  const tracking = trim(anchor.tracking);
  const orderId = trim(anchor.orderId);
  const explicit = normalizeExplicitSerials(anchor.serials);
  const receivingId = Number(anchor.receivingId);
  const hasReceiving = Number.isFinite(receivingId) && receivingId > 0;
  const showActivity = anchor.activity != null;

  let carrierVia: CarrierDataPath = null;
  if (poId) carrierVia = 'po';
  else if (tracking) carrierVia = 'tracking';
  else if (orderId) carrierVia = 'order';

  const showCarrier = carrierVia != null;
  const fetchCartonSerials = explicit.length === 0 && hasReceiving;
  const showSerials = explicit.length > 0 || fetchCartonSerials;

  return {
    showCarrier,
    showSerials,
    showActivity,
    carrierVia,
    fetchCartonSerials,
    hasContent: showCarrier || showSerials || showActivity,
  };
}
