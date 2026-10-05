/**
 * Deliveries › Docked (`incoming.docked`) facet counts. The list is
 * `ReceivingLedgers` → `DockedPackagesLedger`: the URL parses through
 * `readReceivingModeState` (`useReceivingModeContext`), the docked descriptor
 * builds the `GET /api/receiving-lines` query (`view=scanned`, Find as a
 * tracking search, `?staff=`), then the browser narrows — `receiving-grouping`
 * (unfound dedupe, PO groups, the `?dateFrom=`/`?dateTo=` window when set) and
 * the ledger (Find via `receivingLineMatchesQuery`, Kind via
 * `dockedIntakeKind`) — and paints one card per carton. Every carton's status
 * key is DOCKED (`DOCKED_STATUS_OPTIONS`), so the Status option count is that
 * carton count. This module runs the same parse, read and steps.
 */

import type { NavFacetsResponse } from '@/lib/nav/context/schema';
import { computeFacets } from '@/lib/nav/facets/compute';
import { NAV_FACET_GROUPS } from '@/lib/nav/facets/contexts';
import { receivingCartonKey, receivingDayWindow, receivingVisibleRows } from '@/components/station/receiving-grouping';
import { DOCKED_KIND_OPTIONS, DOCKED_STATUS_OPTIONS, dockedIntakeKind } from '@/lib/receiving/docked-record-state';
import { DOCKED_KIND_PARAM, INBOUND_FIND_PARAM } from '@/lib/receiving/inbound-lane';
import { readReceivingModeState, type ReceivingModeState } from '@/lib/receiving/receiving-mode-state';
import { receivingLineMatchesQuery } from '@/lib/receiving/receiving-line-search';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import { INCOMING_SURFACE_ROUTE } from '@/lib/receiving/surface-path';

type ParamReader = Pick<URLSearchParams, 'get'>;

/** The docked list's own read: `/api/receiving-lines` query → its rows. */
export type DockedListReader = (listParams: URLSearchParams) => Promise<ReceivingLineRow[]>;

const KIND_VALUES = new Set<string>(DOCKED_KIND_OPTIONS.map((option) => option.value));
const STATUS_VALUES = new Set<string>(DOCKED_STATUS_OPTIONS.map((option) => option.value));

/** `useReceivingModeContext` on `/incoming?lane=docked` — the same parse, pinned to the Docked lane. */
function dockedModeState(params: ParamReader): ReceivingModeState {
  return readReceivingModeState(INCOMING_SURFACE_ROUTE, {
    get: (key) => (key === 'lane' ? 'docked' : params.get(key)),
  });
}

/** The cartons the docked list paints for these params (before its status cut). */
export function dockedCartonCount(rows: readonly ReceivingLineRow[], params: ParamReader): number {
  const { mode, historyAxis, skipWeekFilter, modeContext } = dockedModeState(params);
  // `ReceivingLedgers`: Docked's week offset is session-local (0); only the date window ever slices it.
  const window = receivingDayWindow(0, modeContext.historyDateRange ?? null);
  const visible = receivingVisibleRows({ rows, mode, historyAxis, window, skipWeekFilter });
  // `DockedPackagesLedger`: Find and Kind over the visible rows, one card per carton.
  const find = params.get(INBOUND_FIND_PARAM) ?? '';
  const kindRaw = params.get(DOCKED_KIND_PARAM);
  const kind = kindRaw && KIND_VALUES.has(kindRaw) ? kindRaw : null;
  const cartons = new Set<string>();
  for (const row of visible) {
    if (receivingLineMatchesQuery(row, find) && (!kind || dockedIntakeKind(row) === kind)) cartons.add(receivingCartonKey(row));
  }
  return cartons.size;
}

export async function incomingDockedFacets(params: ParamReader, readRows: DockedListReader): Promise<NavFacetsResponse> {
  const { mode, modeContext } = dockedModeState(params);
  const rows = await readRows(mode.buildParams(modeContext));
  const decl = NAV_FACET_GROUPS['incoming.docked'].find((group) => group.id === 'status')!;
  // `useTriageCut` keeps only known keys from the param; anything else is no cut.
  const picked = (params.get(decl.param) ?? '').split(',').filter((value) => STATUS_VALUES.has(value));
  const { total, groups } = computeFacets(
    [{ n: dockedCartonCount(rows, params), status: DOCKED_STATUS_OPTIONS[0].value }],
    [
      {
        groupId: decl.id,
        label: decl.label,
        param: decl.param,
        options: DOCKED_STATUS_OPTIONS.map((option) => ({ value: option.value, label: option.label })),
        matches: (row, value) => value.split(',').includes(row.status),
      },
    ],
    { [decl.id]: picked.length > 0 ? picked.join(',') : null },
  );
  return { context: 'incoming.docked', total, groups };
}
