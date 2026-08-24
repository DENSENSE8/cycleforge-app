import type { ReceivingDetailsLog } from '@/lib/receiving/receiving-details-log';

type CartonApiRow = ReceivingDetailsLog & {
  id?: number | string;
  receiving_tracking_number?: string | null;
  source?: string | null;
  local_pickup_order_id?: number | string | null;
  carrier?: string | null;
  created_at?: string | null;
};

type LineApiRow = {
  zoho_purchaseorder_id?: string | null;
  zoho_purchaseorder_number?: string | null;
  listing_url?: string | null;
};

/** Minimal log for instant overlay mount — enriched async afterward. */
export function receivingDetailsInstantSeed(
  receivingId: number,
  seed?: Partial<ReceivingDetailsLog>,
): ReceivingDetailsLog {
  const id = String(receivingId);
  const timestamp =
    seed?.timestamp ??
    seed?.received_at ??
    new Date().toISOString();

  return {
    ...seed,
    id,
    timestamp,
  };
}

export function buildReceivingDetailsLogFromApi(
  receivingId: number,
  carton: CartonApiRow,
  lines: LineApiRow[],
): ReceivingDetailsLog {
  const first = lines[0];
  const trackingRaw = String(carton.tracking ?? carton.receiving_tracking_number ?? '').trim();

  return {
    ...carton,
    id: String(carton.id ?? receivingId),
    timestamp:
      carton.timestamp ??
      carton.received_at ??
      carton.created_at ??
      new Date().toISOString(),
    tracking: trackingRaw || carton.tracking,
    status: carton.status ?? carton.carrier ?? undefined,
    zoho_purchaseorder_id:
      first?.zoho_purchaseorder_id != null && String(first.zoho_purchaseorder_id).trim()
        ? String(first.zoho_purchaseorder_id).trim()
        : carton.zoho_purchaseorder_id ?? null,
    zoho_purchaseorder_number:
      first?.zoho_purchaseorder_number != null && String(first.zoho_purchaseorder_number).trim()
        ? String(first.zoho_purchaseorder_number).trim()
        : carton.zoho_purchaseorder_number ?? null,
    listing_url:
      first?.listing_url != null && String(first.listing_url).trim()
        ? String(first.listing_url).trim()
        : carton.listing_url ?? null,
  };
}

export type ReceivingDetailsEnrichResult =
  | { kind: 'details'; log: ReceivingDetailsLog }
  | { kind: 'local_pickup'; orderId: number }
  | { kind: 'missing' };

export async function fetchReceivingDetailsEnrich(
  receivingId: number,
): Promise<ReceivingDetailsEnrichResult> {
  const res = await fetch(`/api/receiving/${receivingId}`, { cache: 'no-store' });
  const data = await res.json().catch(() => null);
  if (!data?.success || !data.receiving) {
    return { kind: 'missing' };
  }

  const carton = data.receiving as CartonApiRow;
  if (carton.source === 'local_pickup') {
    const lpoId = Number(carton.local_pickup_order_id);
    if (Number.isFinite(lpoId) && lpoId > 0) {
      return { kind: 'local_pickup', orderId: lpoId };
    }
    return { kind: 'missing' };
  }

  const lines = Array.isArray(data.lines) ? (data.lines as LineApiRow[]) : [];
  return {
    kind: 'details',
    log: buildReceivingDetailsLogFromApi(receivingId, carton, lines),
  };
}
