/** Presence identity for a receiving carton overlay (`AnimatePresence` key). */

import { normalizeScanKey } from '@/lib/receiving/scan/normalize';

/** The only row fields the identity depends on. */
export interface WorkspacePaneRow {
  id: number;
  receiving_id?: number | null;
  tracking_number?: string | null;
}

export interface WorkspacePaneSlot {
  /** The `AnimatePresence` key currently occupying the overlay slot. */
  key: string;
  /** Carton this slot resolved to, once known. `null` while a scan is pending. */
  cartonId: number | null;
}

/**
 * Pre-resolve identity for a scanned value — the same normal form the rail's
 * pending stub reconciles on, so the pane and the rail agree on what "this
 * scan" means.
 */
export function scanSlotKey(trackingNumber: string | null | undefined): string | null {
  const trimmed = (trackingNumber ?? '').trim();
  if (!trimmed) return null;
  const normalized = normalizeScanKey(trimmed);
  return normalized ? `scan:${normalized}` : null;
}

/** True for a real, openable carton id (stubs carry `null`). */
function cartonIdOf(row: WorkspacePaneRow): number | null {
  if (row.receiving_id == null) return null;
  const id = Number(row.receiving_id);
  return Number.isFinite(id) && id > 0 ? id : null;
}

/**
 * Advance the overlay slot for `row`, given the slot it currently holds.
 * Pass `null` for `prev` when the overlay is closed (a fresh open starts clean).
 */
export function resolveWorkspacePaneSlot(
  prev: WorkspacePaneSlot | null,
  row: WorkspacePaneRow,
): WorkspacePaneSlot {
  const scanKey = scanSlotKey(row.tracking_number);
  const cartonId = cartonIdOf(row);

  // Still resolving — identity is the scanned value itself.
  if (cartonId == null) {
    return { key: scanKey ?? `line:${row.id}`, cartonId: null };
  }

  // The pending scan slot adopts the carton it just resolved into:
  if (
    prev != null &&
    scanKey != null &&
    prev.key === scanKey &&
    (prev.cartonId == null || prev.cartonId === cartonId)
  ) {
    return { key: prev.key, cartonId };
  }

  return { key: `carton:${cartonId}`, cartonId };
}
