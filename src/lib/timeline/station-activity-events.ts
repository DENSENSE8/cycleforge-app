import { LIFECYCLE } from '@cycleforge/design-tokens';
import type { TimelineItem, TimelineTone } from './types';

/** One `station_activity_logs` (SAL) row, keyed to a shipment. */
export interface StationActivityRow {
  id: number;
  created_at: string | null;
  station: string | null;
  activity_type: string;
  actor_name: string | null;
  /** `station_activity_logs.staff_id` — resolves the actor's avatar. */
  actor_staff_id?: number | null;
  scan_ref: string | null;
  tech_serial_number_id?: number | null;
  serial_number?: string | null;
  serial_type?: string | null;
  metadata?: Record<string, unknown> | null;
}

/** activity_type → display. Unmapped types fall back to a prettified label. */
const ACTIVITY_MAP: Record<string, { title: string; tone: TimelineTone }> = {
  TRACKING_SCANNED: { title: 'Testing scanned', tone: 'info' },
  FNSKU_SCANNED: { title: 'Amazon SKU scanned', tone: 'info' },
  SERIAL_ADDED: { title: 'Serial added', tone: 'muted' },
  PACK_COMPLETED: { title: 'Packed', tone: LIFECYCLE.packed.tone },
  PACK_SCAN: { title: 'Pack scan', tone: 'muted' },
  PACK_SHIPPED: { title: 'Shipped', tone: LIFECYCLE.shipped.tone },
  SHIP_CONFIRM: { title: 'Scanned out', tone: LIFECYCLE.shipped.tone },
  FBA_READY: { title: 'FBA ready', tone: 'info' },
  LABEL_PRINTED: { title: 'Label printed', tone: 'info' },
};

function pretty(activityType: string): string {
  const s = activityType.replace(/[._-]+/g, ' ').trim();
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

/** FIND / timeline face title. Station names stay captions, not titles. */
export function stationActivityTitle(activityType: string): string {
  return ACTIVITY_MAP[activityType]?.title ?? pretty(activityType);
}

function serialSourceSubtitle(row: StationActivityRow): string | undefined {
  if (row.activity_type !== 'SERIAL_ADDED') return undefined;

  const method = String(row.metadata?.source_method ?? '').trim().toUpperCase();
  const sourceSku = String(row.metadata?.source_sku_code ?? '').trim();
  if (method === 'SKU_PULL') {
    return sourceSku ? `Added from SKU ${sourceSku}` : 'Added from SKU';
  }
  if (method === 'SCAN') return 'Scanned serial';

  const serialType = String(row.serial_type ?? '').trim().toUpperCase();
  return serialType && serialType !== 'SERIAL' ? serialType : undefined;
}

/**
 * Map SAL rows → {@link TimelineItem}s for the shared `EventTimeline`. The
 * event's concrete identifier is kept as a raw ref so EventTimeline can render
 * it through the correct CopyChip variant.
 */
export function stationActivityToTimeline(rows: StationActivityRow[]): TimelineItem[] {
  return rows.map((r) => {
    const mapped = ACTIVITY_MAP[r.activity_type];
    const title = mapped?.title ?? pretty(r.activity_type);
    const tone = mapped?.tone ?? 'muted';

    // The scan ref (tracking / FNSKU / serial) renders as a last-8 CopyChip.
    const serialNumber = String(
      r.serial_number ?? r.metadata?.serial ?? '',
    ).trim();
    const scanRef = String(r.scan_ref ?? '').trim();
    let ref: TimelineItem['ref'];
    if (r.activity_type === 'SERIAL_ADDED' && serialNumber) {
      ref = { value: serialNumber, kind: 'serial' };
    } else if (scanRef) {
      const kind =
        r.activity_type === 'FNSKU_SCANNED'
          ? 'fnsku'
          : 'tracking';
      ref = { value: scanRef, kind };
    }

    return {
      id: `sal:${r.id}`,
      at: r.created_at,
      title,
      tone,
      subtitle: serialSourceSubtitle(r),
      ref,
      actor: r.actor_name ?? undefined,
      actorStaffId: r.actor_staff_id ?? null,
      sourceEventType: r.activity_type,
    };
  });
}
