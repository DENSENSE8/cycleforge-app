/**
 * Client helpers for the unfound empty-carton return-serial scan path:
 * optimistic line + serial chip before the create-line → scan-serial chain
 * resolves, then remap / confirm / rollback.
 *
 * Pure + DB-free so unit tests and the UI controller share one SoT.
 */

import {
  mintOptimisticSerialId,
  type LineSerial,
} from '@/lib/receiving/optimistic-serials';

export type OptimisticReturnLine = {
  id: number;
  sku: string | null;
  item_name: string | null;
  quantity_expected: number | null;
  quantity_received: number | null;
  condition_grade: string;
  workflow_status: string | null;
  listing_reference: string | null;
  location_code: string | null;
  image_url?: string | null;
  serials?: LineSerial[];
  receiving_id?: number;
  receiving_source?: string;
  receiving_type?: string;
};

export function mintOptimisticLineId(): number {
  return -(Date.now() % 1_000_000_000) - Math.floor(Math.random() * 1000);
}

export function buildOptimisticReturnLine(args: {
  receivingId: number;
  serial: string;
  condition: string;
  tempLineId?: number;
  tempSerialId?: number;
}): OptimisticReturnLine {
  const serial = args.serial.trim();
  const tempLineId = args.tempLineId ?? mintOptimisticLineId();
  const tempSerialId = args.tempSerialId ?? mintOptimisticSerialId();
  return {
    id: tempLineId,
    receiving_id: args.receivingId,
    sku: null,
    item_name: serial ? `Return serial ${serial}` : 'Return serial',
    quantity_expected: 1,
    quantity_received: 0,
    condition_grade: args.condition || 'USED_A',
    workflow_status: 'MATCHED',
    listing_reference: null,
    location_code: null,
    image_url: null,
    receiving_source: 'unmatched',
    receiving_type: 'RETURN',
    serials: serial
      ? [{ id: tempSerialId, serial_number: serial, _optimistic: 'adding' }]
      : [],
  };
}

/**
 * Replace a temp (negative) line id with the server line, preserving the
 * optimistic serials array when the real line does not yet carry serials.
 */
export function remapOptimisticLineId<L extends { id: number; serials?: LineSerial[] | null }>(
  lines: L[],
  tempLineId: number,
  realLine: L,
): L[] {
  const withoutTemp = lines.filter((l) => l.id !== tempLineId);
  const temp = lines.find((l) => l.id === tempLineId);
  const merged: L = {
    ...realLine,
    serials:
      realLine.serials != null && realLine.serials.length > 0
        ? realLine.serials
        : (temp?.serials ?? realLine.serials ?? []),
  };
  const idx = withoutTemp.findIndex((l) => l.id === realLine.id);
  if (idx === -1) return [...withoutTemp, merged];
  const next = withoutTemp.slice();
  next[idx] = { ...next[idx], ...merged };
  return next;
}

/** Drop the optimistic line (and any sibling with the same temp id). */
export function rollbackOptimisticReturnLine<L extends { id: number }>(
  lines: L[],
  tempLineId: number,
): L[] {
  return lines.filter((l) => l.id !== tempLineId);
}

/**
 * True when a metadata refetch's serials field should NOT overwrite a richer
 * cache entry. Empty arrays from an unpopulated `serial_projection` are treated
 * as unknown — the same as `null`.
 */
export function shouldPreserveCachedSerials(
  incoming: LineSerial[] | null | undefined,
  cached: LineSerial[] | undefined,
): boolean {
  if (!cached?.length) return false;
  if (incoming == null) return true;
  if (incoming.length === 0) return true;
  return false;
}

type LineWithSerials = { id: number; serials?: LineSerial[] | null };

/**
 * Merge a `GET /api/receiving/:id` lines snapshot into local unfound state
 * without wiping in-flight optimistic serial chips (Testing paints from this
 * local array — unlike Unbox, which reads the siblings cache).
 *
 * - Empty `incoming` is never authoritative over a non-empty `prev` (mid-create
 *   race / degrade-not-fail 404). Intentional clears use `setLines` directly.
 * - Per-id: keep `prev.serials` when {@link shouldPreserveCachedSerials} says so.
 * - Orphan temp (negative-id) lines: if the server already returned real rows,
 *   fold their serials onto the first empty-serial incoming line; otherwise
 *   they survive via the empty-incoming keep-prev path above.
 */
export function mergeUnfoundLinesWithPreserve<L extends LineWithSerials>(
  prev: L[],
  incoming: L[],
): L[] {
  if (incoming.length === 0) {
    return prev;
  }

  const prevById = new Map(prev.map((l) => [l.id, l]));

  let merged: L[] = incoming.map((inc) => {
    const cached = prevById.get(inc.id);
    if (
      cached &&
      shouldPreserveCachedSerials(inc.serials ?? null, cached.serials ?? undefined)
    ) {
      return { ...inc, serials: cached.serials };
    }
    return { ...inc };
  });

  const orphanTemps = prev.filter(
    (l) => l.id < 0 && !incoming.some((i) => i.id === l.id),
  );
  for (const temp of orphanTemps) {
    const tempSerials = temp.serials;
    if (!tempSerials?.length) continue;
    const idx = merged.findIndex((l) =>
      shouldPreserveCachedSerials(l.serials ?? null, tempSerials),
    );
    if (idx >= 0) {
      merged = merged.slice();
      merged[idx] = { ...merged[idx], serials: tempSerials };
    }
  }

  return merged;
}
