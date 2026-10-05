/**
 * Print station › FNSKU labels (owner 2026-09-29) — a manager at a desk finds an
 * Amazon FBA unit label (FNSKU) from the left contextual sidebar's Find, picks
 * the print station at the packer's table and a quantity, and it prints there
 * silently (the existing `fnsku` station job). Browser- and server-safe.
 */

import { PRINT_STATION_PATHS } from '@/lib/nav/route-tree';

/** Print station › FNSKU labels (the printing mode). */
export const PRINT_STATION_PATH = PRINT_STATION_PATHS.fnskuLabels;

/** `?fnsku=` — the open FNSKU (upper-case catalog key). */
export const PRINT_STATION_FNSKU_PARAM = 'fnsku' as const;

/** `?view=` — FNSKU labels: every FNSKU (bare) or only those already reprinted here (the damage history). */
export const PRINT_STATION_VIEW_PARAM = 'view' as const;
export const PRINT_STATION_FNSKU_VIEWS = ['reprinted'] as const;
export type PrintStationFnskuView = 'all' | (typeof PRINT_STATION_FNSKU_VIEWS)[number];

export function parsePrintStationFnskuView(raw: string | null | undefined): PrintStationFnskuView {
  return raw === 'reprinted' ? 'reprinted' : 'all';
}

/**
 * Rows the page loads at most; the list pages them on the client (`100 / page`)
 * and Find narrows on the server. Above the whole FBA catalog (247 on
 * 2026-10-04), so every FNSKU is reachable by paging, not only by Find.
 */
export const PRINT_STATION_FNSKU_ROW_CAP = 1000;

/**
 * One catalog FNSKU as the Print station lists it: its identification and the
 * label's text. No print history (owner 2026-10-04): the station finds a label
 * and prints it; the Reprinted view narrows on the server, never on the row.
 */
export interface PrintStationFnskuRow {
  fnsku: string;
  title: string | null;
  asin: string | null;
  sku: string | null;
  /** Catalog condition (`Used - Very Good`); printed on the label when set. */
  condition: string | null;
}
