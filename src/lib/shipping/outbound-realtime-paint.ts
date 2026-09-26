/** Invisible, versioned observability seam for the Outbound realtime path. */

export const OUTBOUND_REALTIME_PAINT_EVENT = 'cf:outbound-realtime-received' as const;
export const OUTBOUND_REALTIME_PAINT_SCHEMA_VERSION = 1 as const;

export type OutboundRealtimePaintReceipt = {
  schemaVersion: typeof OUTBOUND_REALTIME_PAINT_SCHEMA_VERSION;
  orderId: number | null;
  receivedAt: number;
};

export function publishOutboundRealtimePaintReceipt(orderId: unknown): void {
  if (typeof window === 'undefined') return;
  const numericOrderId = Number(orderId);
  const detail: OutboundRealtimePaintReceipt = {
    schemaVersion: OUTBOUND_REALTIME_PAINT_SCHEMA_VERSION,
    orderId: Number.isFinite(numericOrderId) && numericOrderId > 0 ? numericOrderId : null,
    receivedAt: performance.now(),
  };
  window.dispatchEvent(new CustomEvent(OUTBOUND_REALTIME_PAINT_EVENT, { detail }));
}
