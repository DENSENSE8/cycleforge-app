/**
 * Unboxed cartons' sidebar facets — Inbound › Unboxed (`/incoming?lane=unboxed`,
 * `incoming.unboxed`) and the Unbox station (`/unbox`, `receive`). These were
 * the lists' body pills (ruling A4: a status that filters is a sidebar control):
 *
 * - Status (`?dflag=`, Unfound · Claim · Short, any-of) — the attention pills
 *   `UnboxedReceiptsLedger` cuts its cartons by (`dockedCartonFlags`): the
 *   Unboxed lane and the Unbox History tab.
 * - KPI (`?ukpi=`, one) — the Unbox tab's clickable KPIs, the rows
 *   `ReceivingLedgers` keeps through `unboxKpiRowFilter`: Unbox Queue · Recent
 *   · History. The station has no view rows, so its one context serves every
 *   `?unboxview=` tab; a group the open tab does not read offers nothing.
 *
 * A count is the CARTONS the list paints for that pick, from the list's own
 * read and steps: `readReceivingModeState` → the mode's `buildParams` →
 * `GET /api/receiving-lines`' page read, the KPI cut, the table's dedupe / PO
 * grouping / day window (`receivingVisibleRows`), Find
 * (`receivingLineMatchesQuery`), Kind (`dockedIntakeKind`, the ledger only)
 * and one carton per `receivingCartonKey`. A group never narrows its own options.
 */

import type { NavFacetsResponse } from '@/lib/nav/context/schema';
import { NAV_FACET_GROUPS, type NavFacetContext } from '@/lib/nav/facets/contexts';
import { receivingCartonKey, receivingDayWindow, receivingVisibleRows } from '@/components/station/receiving-grouping';
import { groupRowsBy } from '@/lib/group-rows';
import { DOCKED_FLAG_OPTIONS, dockedCartonFlags, dockedIntakeKind, type DockedFlag } from '@/lib/receiving/docked-record-state';
import { DOCKED_FLAG_PARAM, DOCKED_KIND_PARAM, DOCKED_KIND_VALUES, INBOUND_FIND_PARAM } from '@/lib/receiving/inbound-lane';
import { readReceivingModeState } from '@/lib/receiving/receiving-mode-state';
import { receivingFindNeedles, receivingLineMatchesQuery } from '@/lib/receiving/receiving-line-search';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import { INCOMING_SURFACE_ROUTE, UNBOX_SURFACE_ROUTE } from '@/lib/receiving/surface-path';
import { UNBOX_KPI_FILTER_PARAM, UNBOX_KPI_FILTER_WIRE_IDS, unboxKpiFilterLabel, unboxKpiRowFilter } from '@/lib/receiving/unbox-metrics';
import { parseWeekOffset, WEEK_OFFSET_PARAM } from '@/lib/station/table-url-params';
import { getUnboxWorkspaceTabFromSearch } from '@/utils/unbox-workspace-state';

type ParamReader = Pick<URLSearchParams, 'get'>;

export type UnboxFacetContext = Extract<NavFacetContext, 'incoming.unboxed' | 'receive'>;

/** The list's own read: `/api/receiving-lines` query → its rows. */
export type UnboxListReader = (listParams: URLSearchParams) => Promise<ReceivingLineRow[]>;

const FLAG_VALUES: readonly string[] = DOCKED_FLAG_OPTIONS.map((option) => option.value);
const KIND_VALUES: readonly string[] = DOCKED_KIND_VALUES;

export async function unboxFacets(context: UnboxFacetContext, params: ParamReader, readRows: UnboxListReader): Promise<NavFacetsResponse> {
  const station = context === 'receive';
  const state = readReceivingModeState(station ? UNBOX_SURFACE_ROUTE : INCOMING_SURFACE_ROUTE, params);
  // The Unbox tab's KPI cut — every tab but the foreign Inbound collection (`ReceivingLedgers`' `kpiFilteredRows`).
  const tab = station ? getUnboxWorkspaceTabFromSearch(params) : null;
  const kpiTab = tab && tab !== 'incoming' ? tab : null;
  const kpiIds = kpiTab ? UNBOX_KPI_FILTER_WIRE_IDS.filter((id) => unboxKpiRowFilter(id, kpiTab) != null) : [];
  // The Unboxed ledger (the lane, the Unbox History tab) is the one face that cuts by the pills.
  const ledger = state.isHistoryMode;

  const groups = NAV_FACET_GROUPS[context];
  const statusGroup = groups.find((group) => group.param === DOCKED_FLAG_PARAM)!;
  const kpiGroup = groups.find((group) => group.param === UNBOX_KPI_FILTER_PARAM);
  const respond = (total: number, statusCounts: ReadonlyMap<string, number> | null, kpiCounts: ReadonlyMap<string, number> | null): NavFacetsResponse => ({
    context,
    total,
    groups: [
      {
        id: statusGroup.id,
        label: statusGroup.label,
        param: statusGroup.param,
        options: statusCounts ? DOCKED_FLAG_OPTIONS.map((option) => ({ ...option, count: statusCounts.get(option.value) ?? 0 })) : [],
      },
      ...(kpiGroup
        ? [{
            id: kpiGroup.id,
            label: kpiGroup.label,
            param: kpiGroup.param,
            options: kpiCounts ? kpiIds.map((id) => ({ value: id, label: unboxKpiFilterLabel(id), count: kpiCounts.get(id) ?? 0 })) : [],
          }]
        : []),
    ],
  });
  if (!ledger && kpiIds.length === 0) return respond(0, null, null);

  const find = params.get(INBOUND_FIND_PARAM) ?? '';
  const listParams = state.mode.buildParams(state.modeContext);
  // Serials only answer Find here; without one the read skips their hydration.
  if (receivingFindNeedles(find).length === 0) listParams.delete('include');
  const rows = await readRows(listParams);

  const kindRaw = params.get(DOCKED_KIND_PARAM);
  const kind = ledger && kindRaw && KIND_VALUES.includes(kindRaw) ? kindRaw : null;
  const window = receivingDayWindow(
    state.isHistoryMode ? Math.max(0, parseWeekOffset(params.get(WEEK_OFFSET_PARAM))) : 0,
    state.modeContext.historyDateRange ?? null,
  );
  /** Each carton the list paints under the KPI pick `kpi`, as its attention pills. */
  const cartonFlags = (kpi: string | null): DockedFlag[][] => {
    const predicate = kpiTab ? unboxKpiRowFilter(kpi, kpiTab) : null;
    const visible = receivingVisibleRows({
      rows: predicate ? rows.filter(predicate) : rows,
      mode: state.mode,
      historyAxis: state.historyAxis,
      window,
      skipWeekFilter: state.skipWeekFilter,
    }).filter((row) => receivingLineMatchesQuery(row, find) && (!kind || dockedIntakeKind(row) === kind));
    return groupRowsBy(visible, receivingCartonKey).map((carton) => dockedCartonFlags(carton.rows));
  };
  // The pills' cut (`useTriageCut` over `?dflag=`): a carton passes wearing ANY picked pill.
  const picked = new Set(ledger ? (params.get(DOCKED_FLAG_PARAM) ?? '').split(',').filter((value) => FLAG_VALUES.includes(value)) : []);
  const passesPills = (flags: readonly DockedFlag[]) => picked.size === 0 || flags.some((flag) => picked.has(flag));

  const current = cartonFlags(params.get(UNBOX_KPI_FILTER_PARAM));
  const statusCounts = ledger ? new Map<string, number>() : null;
  if (statusCounts) for (const flags of current) for (const flag of flags) statusCounts.set(flag, (statusCounts.get(flag) ?? 0) + 1);
  const kpiCounts = kpiIds.length > 0 ? new Map(kpiIds.map((id) => [id, cartonFlags(id).filter(passesPills).length])) : null;
  return respond(current.filter(passesPills).length, statusCounts, kpiCounts);
}
