/**
 * Platform returns enter CycleForge exactly as an uploaded return report does:
 * as a file (headers + rows) in one of the inbound import presets
 * (`amazon_returns`, `amazon_fba_returns`, `ebay_returns` — `po-columns.ts`),
 * run through `runPoCsvImport` → `ingestInboundOrder` (the one inbound
 * writer). An API sync therefore never maps a return field by hand: each
 * platform fetcher only renders its API payload into its preset's file shape,
 * and the stored reason lands in `receiving_line_return.return_reason` keyed
 * to the order number — which every order record reads (`order-returns.ts`).
 */

import type { PoPresetId } from '@/lib/inbound/po-columns';

/** One platform-rendered return report, ready for `runPoCsvImport`. */
export interface ReturnReportFile {
  /** Shown in the import log, e.g. `ebay-returns 2026-09-01..2026-10-01`. */
  fileName: string;
  preset: Extract<PoPresetId, 'amazon_returns' | 'amazon_fba_returns' | 'ebay_returns'>;
  headers: string[];
  rows: Record<string, string>[];
}

/** The window a fetcher reads — returns created / reported in [since, until). */
export interface ReturnWindow {
  since: Date;
  until: Date;
}

/** Platforms with a returns fetcher. */
export type ReturnsProvider = 'ebay' | 'amazon';
