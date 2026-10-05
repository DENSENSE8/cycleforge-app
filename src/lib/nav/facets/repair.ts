/**
 * Repair desk facet counts — `/repair` (`repair.<view>`) and Sales › Repair
 * service (`sales.repairs-<view>`). The list is `GET /api/repair-service`
 * (`buildRepairListSql`): Status (`?tab=`, unset = the surface's default),
 * `?channel=`, `?needsLabel=1` and Find (`?search=`) decide what loads; the
 * stage picks (`?repairStatus=`, any-of) and Exclude status (`?hide=`) cut the
 * loaded tickets client-side by `repairStatusChipKey`. The counts wrap the
 * list's own statement and group its rows the same way.
 */

import type { NavFacetsResponse } from '@/lib/nav/context/schema';
import { computeFacets, type FacetDimension } from '@/lib/nav/facets/compute';
import { NAV_FACET_GROUPS, REPAIR_FACET_CONTEXTS, type NavFacetContext, type RepairFacetContextId } from '@/lib/nav/facets/contexts';
import type { FacetSqlRunner } from '@/lib/nav/facets/outbound';
import { buildRepairListSql, REPAIR_SEARCH_LIMIT } from '@/lib/neon/repair-service-queries';
import { parseRepairChannel, REPAIR_CHANNEL_PARAM } from '@/lib/repair/repair-channel';
import {
  REPAIR_DESK_LIST_LIMIT,
  REPAIR_STATUS_CHIP_KEYS,
  REPAIR_STATUS_CHIP_OPTIONS,
  repairStatusChipKey,
} from '@/lib/repair/repair-status-chips';
import type { OrgId } from '@/lib/tenancy/constants';
import { DEFAULT_REPAIR_TAB, DEFAULT_SALES_REPAIR_TAB, parseRepairTab } from '@/lib/walk-in/history-modes';

type ParamReader = Pick<URLSearchParams, 'get'>;

export function isRepairFacetContext(context: NavFacetContext): context is RepairFacetContextId {
  return (REPAIR_FACET_CONTEXTS as readonly string[]).includes(context);
}

interface RepairStageCombo {
  stage: string;
  n: number;
}

/** A comma list of stage keys, unknown keys dropped (`useTriageCut`'s parse). */
function stageList(raw: string | null): string[] {
  const picked = new Set((raw ?? '').split(','));
  return REPAIR_STATUS_CHIP_KEYS.filter((key) => picked.has(key));
}

/** One statement: the list's rows, counted per stored status. */
export function buildRepairFacetSql(context: RepairFacetContextId, orgId: OrgId, params: ParamReader) {
  const search = (params.get('search') ?? '').trim();
  const list = buildRepairListSql(
    'rs.status',
    {
      tab: parseRepairTab(params.get('tab'), context.startsWith('sales.') ? DEFAULT_SALES_REPAIR_TAB : DEFAULT_REPAIR_TAB),
      needsLabel: params.get('needsLabel') === '1',
      channel: parseRepairChannel(params.get(REPAIR_CHANNEL_PARAM)),
      q: search || null,
      limit: search ? REPAIR_SEARCH_LIMIT : REPAIR_DESK_LIST_LIMIT,
    },
    orgId,
  );
  return { sql: `SELECT listed.status, COUNT(*)::int AS n FROM (${list.sql}) listed GROUP BY listed.status`, params: list.params };
}

export async function repairFacets(
  context: RepairFacetContextId,
  orgId: OrgId,
  params: ParamReader,
  run: FacetSqlRunner,
): Promise<NavFacetsResponse> {
  const { sql, params: bind } = buildRepairFacetSql(context, orgId, params);
  // Exclude status hides its stages from every count, as it hides their cards.
  const hidden = new Set(stageList(params.get('hide')));
  const combos = (await run(sql, bind))
    .map((row): RepairStageCombo => ({ stage: repairStatusChipKey(row.status == null ? null : String(row.status)), n: Number(row.n) || 0 }))
    .filter((combo) => !hidden.has(combo.stage));
  const group = NAV_FACET_GROUPS[context].find((g) => g.id === 'repairStatus');
  if (!group) throw new Error(`${context} declares no repairStatus group`);
  const dimensions: FacetDimension<RepairStageCombo>[] = [
    {
      groupId: group.id,
      label: group.label,
      param: group.param,
      options: REPAIR_STATUS_CHIP_OPTIONS,
      matches: (row, value) => value.split(',').includes(row.stage),
    },
  ];
  const picked = stageList(params.get(group.param));
  const { total, groups } = computeFacets(combos, dimensions, { [group.id]: picked.length ? picked.join(',') : null });
  return { context, total, groups };
}
