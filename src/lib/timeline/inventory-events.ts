import type { TimelineItem, TimelineTone } from './types';

/**
 * Normalized inventory_events row, as returned by
 * `readInventorySpine` (src/lib/audit-log/inventory-spine.ts). Kept structurally
 * compatible (a subset) so callers can pass spine rows straight through.
 */
export interface InventoryTimelineRow {
  id: number;
  occurred_at: string | null;
  event_type: string;
  actor_name: string | null;
  /** `inventory_events.actor_staff_id` — resolves the actor's avatar. */
  actor_staff_id?: number | null;
  serial_number: string | null;
  sku: string | null;
  prev_status: string | null;
  next_status: string | null;
  /**
   * `inventory_events.notes` — what a person actually wrote.
   *
   * The spine reader has always selected this; the adapter dropped it, so a
   * NOTE row rendered as the literal word "Note" and the sentence someone
   * recorded ("Unmatched return serial … — no order match") was visible
   * nowhere on the journey. A note whose text you cannot read is not a note.
   */
  notes?: string | null;
  /** Bin barcode (locations.barcode) when the event carried a bin_id. */
  bin_barcode?: string | null;
  bin_name?: string | null;
  payload?: Record<string, unknown> | null;
}

/**
 * event_type → display. The `inventory_events` spine is the cross-station
 * lifecycle log (RECEIVED, TEST_*, PUTAWAY, …); this is the single curated
 * title/tone map for rendering those through the shared {@link EventTimeline}.
 * Unmapped types fall back to a prettified label + muted tone, so a new engine
 * event type still renders (just without a custom color).
 */
const EVENT_MAP: Record<string, { title: string; tone: TimelineTone }> = {
  RECEIVED: { title: 'Received', tone: 'info' },
  TRIAGED: { title: 'Triaged', tone: 'muted' },
  TEST_START: { title: 'Testing started', tone: 'info' },
  TEST_PASS: { title: 'Tested — Pass', tone: 'success' },
  TEST_FAIL: { title: 'Tested — Fail', tone: 'danger' },
  DATA_WIPED: { title: 'Data wiped', tone: 'info' },
  GRADED: { title: 'Graded', tone: 'info' },
  REPAIR_STARTED: { title: 'Repair started', tone: 'warning' },
  REPAIR_COMPLETED: { title: 'Repair completed', tone: 'success' },
  PUTAWAY: { title: 'Put away', tone: 'muted' },
  MOVED: { title: 'Moved', tone: 'muted' },
  LABELED: { title: 'Labeled', tone: 'info' },
  STAGED: { title: 'Staged', tone: 'muted' },
  HELD: { title: 'Held', tone: 'warning' },
  RELEASED_HOLD: { title: 'Hold released', tone: 'info' },
  ALLOCATED: { title: 'Allocated to order', tone: 'info' },
  RELEASED: { title: 'Allocation released', tone: 'warning' },
  PICKED: { title: 'Picked', tone: 'info' },
  PACKED: { title: 'Packed', tone: 'success' },
  SHIPPED: { title: 'Shipped', tone: 'success' },
  RETURNED: { title: 'Returned', tone: 'warning' },
  SCRAPPED: { title: 'Scrapped', tone: 'danger' },
  ADJUSTED: { title: 'Adjusted', tone: 'muted' },
  LISTED: { title: 'Listed', tone: 'info' },
  NOTE: { title: 'Note', tone: 'muted' },
};

/** Events where the in-row chip should be the bin (serial stays in the band header). */
const BIN_REF_EVENTS = new Set(['PUTAWAY', 'MOVED']);

/** Events whose whole content is the operator's sentence — see the title note below. */
const NOTE_TITLED_EVENTS = new Set(['NOTE', 'NOTE_ADDED']);

function pretty(eventType: string): string {
  const s = eventType.replace(/[._-]+/g, ' ').trim();
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

function binHref(barcode: string): string {
  return `/inventory?bin=${encodeURIComponent(barcode)}`;
}

/**
 * Map `inventory_events` spine rows → {@link TimelineItem}s for the shared
 * `EventTimeline`. The secondary line carries the unit (serial/SKU) and the
 * prev→next status transition when present, so a verdict reads
 * "Tested — Pass · IN_TEST → TESTED · SERIAL123".
 *
 * PUTAWAY / MOVED prefer a bin chip (deep-link to the inventory shell's bin
 * view) when a barcode is present — the serial already bands the Trace.
 */
export function inventoryEventsToTimeline(rows: InventoryTimelineRow[]): TimelineItem[] {
  return rows.map((r) => {
    const mapped = EVENT_MAP[r.event_type];
    const tone = mapped?.tone ?? 'muted';

    // On a NOTE the text IS the event, so it is the title. The KIND is already
    // said by the rail glyph (paper), so the word "Note" adds nothing and the
    // sentence adds everything.
    //
    // Deliberately NOT applied to the other event types: their `notes` carry
    // machine text ("Serial 049331F81860251AE" on a RECEIVED), and letting it
    // win would replace the curated "Received" with a restatement of the chip
    // beside it.
    const noteText = NOTE_TITLED_EVENTS.has(r.event_type) ? r.notes?.trim() : null;
    const title = noteText || mapped?.title || pretty(r.event_type);

    const statusTrail =
      r.prev_status && r.next_status && r.prev_status !== r.next_status
        ? `${r.prev_status} → ${r.next_status}`
        : undefined;
    const binLabel = r.bin_name?.trim() || r.bin_barcode?.trim() || null;
    const subtitle = [statusTrail, binLabel && BIN_REF_EVENTS.has(r.event_type) ? binLabel : null]
      .filter(Boolean)
      .join(' · ') || undefined;

    let ref: TimelineItem['ref'];
    const barcode = r.bin_barcode?.trim();
    if (BIN_REF_EVENTS.has(r.event_type) && barcode) {
      ref = { value: barcode, kind: 'bin', href: binHref(barcode) };
    } else if (r.serial_number) {
      ref = { value: r.serial_number, kind: 'serial' };
    } else if (r.sku) {
      ref = { value: r.sku, kind: 'sku' };
    }

    return {
      id: `inv:${r.id}`,
      at: r.occurred_at,
      title,
      tone,
      subtitle,
      ref,
      actor: r.actor_name ?? undefined,
      actorStaffId: r.actor_staff_id ?? null,
      sourceEventType: r.event_type,
    };
  });
}
