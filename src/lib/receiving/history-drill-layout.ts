/**
 * Unbox History drill URL contract — thin domain binding over the WMS-wide
 * LedgerGrid drill SoT (`@/design-system/components/grid` ledger-drill-layout).
 *
 * - `hlayout=list` (default when omitted) — classic single folded LedgerGrid
 * - `hlayout=drill` — linked dual panes
 * - `drillPo` — durable selected {@link ReceivingPoGroup} key
 *
 * Orthogonal to TradingView compare (`clayout` / `c0`…`c3`).
 */

import type { ReceivingPoGroup } from '@/components/station/receiving-lines-table-helpers';
import {
  flattenSectionedParents,
  parseLedgerDrillLayout,
  parseLedgerDrillParentKey,
  writeLedgerDrillParams,
  type LedgerDrillLayout,
  type LedgerDrillUrlContract,
} from '@/design-system/components/grid';

export const HISTORY_DRILL_LAYOUT_PARAM = 'hlayout';
export const HISTORY_DRILL_PO_PARAM = 'drillPo';

export type HistoryDrillLayout = LedgerDrillLayout;

const HISTORY_DRILL_URL: LedgerDrillUrlContract = {
  layoutParam: HISTORY_DRILL_LAYOUT_PARAM,
  parentParam: HISTORY_DRILL_PO_PARAM,
  defaultLayout: 'list',
};

/**
 * History default is list (folded single grid). Explicit `drill` opts into
 * linked dual panes.
 */
export function parseHistoryDrillLayout(
  raw: string | null | undefined,
): HistoryDrillLayout {
  return parseLedgerDrillLayout(raw, HISTORY_DRILL_URL);
}

export function parseHistoryDrillPo(
  raw: string | null | undefined,
): string | null {
  return parseLedgerDrillParentKey(raw);
}

/** Mutate URLSearchParams for History drill chrome. */
export function writeHistoryDrillParams(
  params: URLSearchParams,
  layout: HistoryDrillLayout,
  drillPo: string | null,
): void {
  writeLedgerDrillParams(params, HISTORY_DRILL_URL, layout, drillPo);
}

interface HistoryDrillParentEntry {
  day: string;
  group: ReceivingPoGroup;
}

/** Flatten day-banded PO groups newest-day-first for the drill parent map. */
export function flattenDrillParents(
  filteredGroupedRecords: Record<string, ReceivingPoGroup[]>,
): HistoryDrillParentEntry[] {
  return flattenSectionedParents(filteredGroupedRecords).map(
    ({ section, group }) => ({ day: section, group }),
  );
}
