/** Timeline rail glyph SoT — maps `TimelineItem.sourceEventType` → a stable glyph id + HoverTooltip label (mode family), never a color. */

export type TimelineGlyphId =
  | 'unbox'
  | 'tracking-scan'
  | 'support'
  // A NOTE and a MESSAGE are different acts, so they are different glyphs (split 2026-08-02).
  | 'team-note'
  | 'thread-message'
  | 'packing'
  | 'shipping'
  | 'testing'
  | 'repair'
  | 'labeling'
  | 'fba'
  | 'receiving'
  | 'carrier'
  | 'signal';

interface TimelineGlyphSpec {
  id: TimelineGlyphId;
  /** Mode / family noun for HoverTooltip — not a duplicate of the row title. */
  tooltip: string;
}

const EXACT: Record<string, TimelineGlyphSpec> = {
  // Ops / receiving dock
  UNBOX_CONFIRMED: { id: 'unbox', tooltip: 'Unbox' },
  UNBOX_SCAN_OPENED: { id: 'unbox', tooltip: 'Unbox' },
  TRACKING_SCANNED: { id: 'tracking-scan', tooltip: 'Tracking scan' },

  // Support linkage
  TICKET_LINKED: { id: 'support', tooltip: 'Support' },
  TICKET_UNLINKED: { id: 'support', tooltip: 'Support' },
  THREAD_MESSAGE: { id: 'thread-message', tooltip: 'Message' },

  // SAL / packing / shipping
  FNSKU_SCANNED: { id: 'tracking-scan', tooltip: 'Amazon SKU scan' },
  // Picker-desk order pick — same family as inventory PICKED.
  PICK_SCANNED: { id: 'shipping', tooltip: 'Shipping' },
  SERIAL_ADDED: { id: 'receiving', tooltip: 'Receiving' },
  PACK_COMPLETED: { id: 'packing', tooltip: 'Packing' },
  PACK_SCAN: { id: 'packing', tooltip: 'Packing' },
  PACK_SHIPPED: { id: 'shipping', tooltip: 'Shipping' },
  SHIP_CONFIRM: { id: 'shipping', tooltip: 'Shipping' },
  FBA_READY: { id: 'fba', tooltip: 'Amazon Prep' },
  LABEL_PRINTED: { id: 'labeling', tooltip: 'Labels' },
  'orders.label.printed': { id: 'labeling', tooltip: 'Labels' },
  'orders.tracking.added': { id: 'tracking-scan', tooltip: 'Tracking scan' },
  'shipment.scan_out': { id: 'shipping', tooltip: 'Shipping' },

  // Inventory lifecycle
  RECEIVED: { id: 'receiving', tooltip: 'Receiving' },
  TRIAGED: { id: 'receiving', tooltip: 'Receiving' },
  TEST_START: { id: 'testing', tooltip: 'Testing' },
  TEST_PASS: { id: 'testing', tooltip: 'Testing' },
  TEST_FAIL: { id: 'testing', tooltip: 'Testing' },
  SERIAL_TESTED: { id: 'testing', tooltip: 'Testing' },
  DATA_WIPED: { id: 'testing', tooltip: 'Testing' },
  GRADED: { id: 'testing', tooltip: 'Testing' },
  REPAIR_STARTED: { id: 'repair', tooltip: 'Repair' },
  REPAIR_COMPLETED: { id: 'repair', tooltip: 'Repair' },
  PUTAWAY: { id: 'receiving', tooltip: 'Receiving' },
  MOVED: { id: 'receiving', tooltip: 'Receiving' },
  LABELED: { id: 'labeling', tooltip: 'Labels' },
  STAGED: { id: 'shipping', tooltip: 'Shipping' },
  HELD: { id: 'receiving', tooltip: 'Receiving' },
  RELEASED_HOLD: { id: 'receiving', tooltip: 'Receiving' },
  ALLOCATED: { id: 'shipping', tooltip: 'Shipping' },
  RELEASED: { id: 'shipping', tooltip: 'Shipping' },
  PICKED: { id: 'shipping', tooltip: 'Shipping' },
  PACKED: { id: 'packing', tooltip: 'Packing' },
  SHIPPED: { id: 'shipping', tooltip: 'Shipping' },
  RETURNED: { id: 'receiving', tooltip: 'Receiving' },
  SCRAPPED: { id: 'signal', tooltip: 'Signal' },
  ADJUSTED: { id: 'signal', tooltip: 'Signal' },
  LISTED: { id: 'signal', tooltip: 'Signal' },
  NOTE: { id: 'team-note', tooltip: 'Team note' },

  // Tech QC audit actions
  'tech.qc.pass': { id: 'testing', tooltip: 'Testing' },
  'tech.qc.fail': { id: 'testing', tooltip: 'Testing' },
  'tech.qc.retest': { id: 'testing', tooltip: 'Testing' },

  // Warranty (support-adjacent)
  CREATED: { id: 'support', tooltip: 'Support' },
  STATUS_CHANGED: { id: 'support', tooltip: 'Support' },
  NOTE_ADDED: { id: 'team-note', tooltip: 'Team note' },
  QUOTE_SENT: { id: 'support', tooltip: 'Support' },
  QUOTE_ACCEPTED: { id: 'support', tooltip: 'Support' },
  QUOTE_DECLINED: { id: 'support', tooltip: 'Support' },
  RESOLVED: { id: 'support', tooltip: 'Support' },
  CLOSED: { id: 'support', tooltip: 'Support' },

  // Carrier spine (synthetic)
  CARRIER_EVENT: { id: 'carrier', tooltip: 'Carrier' },

  // Entity signals
  return_reason: { id: 'signal', tooltip: 'Signal' },
  warranty_denial: { id: 'signal', tooltip: 'Signal' },
  exception_why: { id: 'signal', tooltip: 'Signal' },
  triage_outcome: { id: 'signal', tooltip: 'Signal' },
  test_fail_reason: { id: 'signal', tooltip: 'Signal' },
  buyer_note: { id: 'team-note', tooltip: 'Team note' },
  SIGNAL_RECORDED: { id: 'signal', tooltip: 'Signal' },
  UNIT_SUBSTITUTED: { id: 'shipping', tooltip: 'Shipping' },
  // Photo-evidence spine (src/lib/photos/stages.ts). Arrival is the pre-unbox
  // package shot, so it rides the receiving glyph rather than unbox.
  ARRIVAL_PHOTOS: { id: 'receiving', tooltip: 'Arrival' },
  UNBOX_PHOTOS: { id: 'unbox', tooltip: 'Unbox' },
  TEST_PHOTOS: { id: 'testing', tooltip: 'Testing' },
  PACK_PHOTOS: { id: 'packing', tooltip: 'Packing' },
  CALL_INBOUND: { id: 'support', tooltip: 'Support' },
  CALL_OUTBOUND: { id: 'support', tooltip: 'Support' },
  CALL_MISSED: { id: 'support', tooltip: 'Support' },
};

const DEFAULT: TimelineGlyphSpec = { id: 'signal', tooltip: 'Signal' };

/** `inventory_events.station` → the same glyph vocabulary. */
const STATION: Record<string, TimelineGlyphSpec> = {
  RECEIVING: { id: 'unbox', tooltip: 'Receiving' },
  TRIAGE: { id: 'receiving', tooltip: 'Arrival' },
  TESTING: { id: 'testing', tooltip: 'Testing' },
  TECH: { id: 'testing', tooltip: 'Testing' },
  PACKING: { id: 'packing', tooltip: 'Packing' },
  PACKER: { id: 'packing', tooltip: 'Packing' },
  SHIPPING: { id: 'shipping', tooltip: 'Shipping' },
  REPAIR: { id: 'repair', tooltip: 'Repair' },
  SUPPORT: { id: 'support', tooltip: 'Support' },
};

export function resolveStationGlyph(station?: string | null): TimelineGlyphSpec | null {
  const key = (station ?? '').trim().toUpperCase();
  if (!key) return null;
  return STATION[key] ?? null;
}

/**
 * Resolve the rail glyph for a timeline row. Prefer exact `sourceEventType`;
 * then light prefix heuristics; else the quiet signal fallback.
 */
export function resolveTimelineGlyph(
  sourceEventType?: string | null,
): TimelineGlyphSpec {
  const raw = (sourceEventType ?? '').trim();
  if (!raw) return DEFAULT;

  const exact = EXACT[raw];
  if (exact) return exact;

  const upper = raw.toUpperCase();
  if (upper.startsWith('UNBOX')) return { id: 'unbox', tooltip: 'Unbox' };
  if (upper.includes('TRACKING') || upper.includes('SCAN')) {
    return { id: 'tracking-scan', tooltip: 'Tracking scan' };
  }
  if (upper.includes('TICKET') || upper.includes('ZENDESK')) {
    return { id: 'support', tooltip: 'Support' };
  }
  if (upper.startsWith('PACK') || upper.includes('PACK')) {
    return { id: 'packing', tooltip: 'Packing' };
  }
  if (upper.includes('SHIP') || upper.includes('SCAN_OUT')) {
    return { id: 'shipping', tooltip: 'Shipping' };
  }
  if (upper.includes('TEST') || upper.includes('QC')) {
    return { id: 'testing', tooltip: 'Testing' };
  }
  if (upper.includes('REPAIR')) return { id: 'repair', tooltip: 'Repair' };
  if (upper.includes('LABEL') || upper.includes('PRINT')) {
    return { id: 'labeling', tooltip: 'Labels' };
  }
  if (upper.includes('FBA')) return { id: 'fba', tooltip: 'FBA' };
  if (upper.includes('CARRIER') || upper.includes('DELIVER')) {
    return { id: 'carrier', tooltip: 'Carrier' };
  }
  // NOTE before MESSAGE: `NOTE_ADDED` is written-down, `THREAD_MESSAGE` is said.
  if (upper.includes('NOTE')) return { id: 'team-note', tooltip: 'Team note' };
  if (upper.includes('THREAD') || upper.includes('MESSAGE')) {
    return { id: 'thread-message', tooltip: 'Message' };
  }
  if (upper.includes('SIGNAL') || raw.includes('signal') || raw.includes('_reason')) {
    return { id: 'signal', tooltip: 'Signal' };
  }

  return DEFAULT;
}
