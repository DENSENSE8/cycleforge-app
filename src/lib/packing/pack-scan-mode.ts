/**
 * Packing scan modes — the station's manual lookup override. Un-armed is
 * `'auto'` (tote → unit → tracking, FNSKU by shape); an armed mode searches
 * that one identifier kind and nothing else:
 *
 *   tracking → `POST /api/packing-logs` tracking ladder only (no tote / unit resolve)
 *   tote     → `POST /api/packing-logs` tote resolve only
 *   serial   → `POST /api/packing-logs` unit (label / serial) resolve only
 *   fnsku    → `POST /api/fba/items/scan` only
 *
 * Packing never scans a SKU — an Ecwid `SKU:…` scan is refused, not logged.
 */

export const PACK_SCAN_MODES = ['tracking', 'tote', 'serial', 'fnsku'] as const;

export type PackScanMode = (typeof PACK_SCAN_MODES)[number];

/** The modes `POST /api/packing-logs` serves (FNSKU goes to the FBA scan). */
export type PackingLogsScanMode = 'auto' | Exclude<PackScanMode, 'fnsku'>;

export const PACK_SKU_REFUSAL = 'Packing scans FNSKU, not SKU';

/** `body.mode` → a mode the route serves; null when unknown. Absent = auto. */
export function parsePackingLogsScanMode(raw: unknown): PackingLogsScanMode | null {
  if (raw == null || raw === '' || raw === 'auto') return 'auto';
  return raw === 'tracking' || raw === 'tote' || raw === 'serial' ? raw : null;
}
