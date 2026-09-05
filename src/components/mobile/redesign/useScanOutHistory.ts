'use client';

/**
 * What this operator already sent out, from the server.
 *
 * The station's tape is a SESSION tape — it exists only in memory, which is the
 * right shape while scanning and the wrong one the moment the phone reloads,
 * gets handed over, or comes back from a break. The screen then opened on empty
 * canvas above the sheet, which told the operator nothing and made "did I
 * already do that one?" unanswerable without walking to a desk.
 *
 * So the tape starts seeded from `GET /api/shipped/scan-out` and the live scans
 * push onto the same list. A history row and a fresh row are deliberately the
 * same {@link StationTapeEntry} shape, so one component renders both and there
 * is no second row chrome to keep in sync.
 */

import { useQuery } from '@tanstack/react-query';
import type { StationTapeEntry } from '@/components/mobile/station/station-tape';
import { stationDedupeKey } from '@/components/mobile/station/station-tape';
import { SCAN_OUT_DEDUPE_KIND, SCAN_OUT_TAPE_LABEL } from './mobile-scan-out-tape';

interface ScanOutHistoryRow {
  id: number;
  shipmentId: number | null;
  confirmedAt: string | null;
  tracking: string | null;
  orderId: string | null;
  productTitle: string | null;
  sku: string | null;
  condition: string | null;
  quantity: number | null;
  imageUrl: string | null;
  staffId: number | null;
  staffName: string | null;
}

const trimmed = (value: unknown): string | null => {
  const s = String(value ?? '').trim();
  return s ? s : null;
};

/**
 * A past confirm, in the tape's shape.
 *
 * Tone is `ok`, never `dup`: these all left the building, and the amber
 * "stop and look" reading belongs to a RE-READ in this session, not to
 * yesterday's work being yesterday's work.
 */
function historyEntry(row: ScanOutHistoryRow): StationTapeEntry {
  return {
    id: `scan-out-history-${row.id}`,
    tone: 'ok',
    verb: SCAN_OUT_TAPE_LABEL.ok.verb,
    title: trimmed(row.productTitle),
    identifier: trimmed(row.tracking),
    recordId: trimmed(row.orderId),
    conditionGrade: trimmed(row.condition),
    imageUrl: trimmed(row.imageUrl),
    actor: trimmed(row.staffName),
    actorId: row.staffId != null && row.staffId > 0 ? Number(row.staffId) : null,
    message: null,
    at: row.confirmedAt ?? new Date().toISOString(),
    dedupeKey: stationDedupeKey(SCAN_OUT_DEDUPE_KIND, row.shipmentId),
    // Seeded, not scanned here: no undo. It may be another operator's work, or
    // a previous shift's, and the server refuses those anyway.
    live: false,
  };
}

export function useScanOutHistory(limit = 25) {
  const query = useQuery({
    queryKey: ['outbound', 'scan-out-recent', limit],
    queryFn: async (): Promise<StationTapeEntry[]> => {
      const res = await fetch(`/api/shipped/scan-out?limit=${limit}`);
      // The route now answers 503 when the query fails rather than pretending
      // the shift was empty, so a throw here is a real failure to surface.
      if (!res.ok) throw new Error(`scan-out history failed (${res.status})`);
      const body = (await res.json()) as { entries?: ScanOutHistoryRow[] };
      return (body.entries ?? []).map(historyEntry);
    },
    // The seed is a starting point, not a live feed: once the operator is
    // scanning, THIS session is the truth and a refetch would fight it.
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  return {
    history: query.data ?? [],
    isLoading: query.isLoading,
    /** True when the seed could not be read — NOT the same as an empty shift. */
    isError: query.isError,
    retry: query.refetch,
  };
}
