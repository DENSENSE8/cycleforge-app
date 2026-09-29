/**
 * Print station › FNSKU labels (owner 2026-09-29) — a manager at a desk finds an
 * Amazon FBA unit label (FNSKU) from the left contextual sidebar's Find, picks
 * the print station at the packer's table and a quantity, and it prints there
 * silently (the existing `fnsku` station job). Browser- and server-safe.
 */

export const PRINT_STATION_PATH = '/print-station' as const;

/** `?fnsku=` — the open FNSKU (upper-case catalog key). */
export const PRINT_STATION_FNSKU_PARAM = 'fnsku' as const;

/** `?view=` — FNSKU labels: every FNSKU (bare) or only those already reprinted here (the damage history). */
export const PRINT_STATION_VIEW_PARAM = 'view' as const;
export const PRINT_STATION_FNSKU_VIEWS = ['reprinted'] as const;
export type PrintStationFnskuView = 'all' | (typeof PRINT_STATION_FNSKU_VIEWS)[number];

export function parsePrintStationFnskuView(raw: string | null | undefined): PrintStationFnskuView {
  return raw === 'reprinted' ? 'reprinted' : 'all';
}

/** Rows the page loads — Find narrows on the server. */
export const PRINT_STATION_FNSKU_ROW_CAP = 100;

/** One catalog FNSKU as the Print station lists it, with its reprint history. */
export interface PrintStationFnskuRow {
  fnsku: string;
  title: string | null;
  asin: string | null;
  sku: string | null;
  /** Catalog condition (`Used - Very Good`); printed on the label when set. */
  condition: string | null;
  /** Reprint jobs logged (`label_print_jobs`, template `fba_fnsku`). */
  printJobs: number;
  /** Stickers across those jobs. */
  copiesPrinted: number;
  lastPrintedAt: string | null;
  /** Stickers in the last job and who ran it (the printing station's staffer). */
  lastCopies: number | null;
  lastPrintedBy: string | null;
}
