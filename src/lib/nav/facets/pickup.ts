/**
 * Local Pickup (`/pickup`) facet counts. The workbench fetches the LCPU lines
 * once (`listLocalPickupLines`, same bounds as `usePickupLines`) and narrows by
 * status in memory with `pickupLineMatchesStatus`; the facet does exactly that
 * — the same read and the same predicate — so its counts are the grid's.
 */

import type { NavFacetsResponse } from '@/lib/nav/context/schema';
import { computeFacets, type FacetCombo } from '@/lib/nav/facets/compute';
import { NAV_FACET_GROUPS } from '@/lib/nav/facets/contexts';
import type { LocalPickupLineRow, LocalPickupLinesQuery } from '@/lib/local-pickup/pickup-lines-query';
import {
  parsePickupStatusTab,
  pickupLineMatchesStatus,
  type PickupLineStatusFacts,
} from '@/lib/local-pickup/order-status';
import type { OrgId } from '@/lib/tenancy/constants';

/** The workbench's page when it is not searching (`usePickupLines`). */
const PICKUP_PAGE_LINES = 500;

const STATUS_OPTIONS = [
  { value: 'process', label: 'Need to process' },
  { value: 'draft', label: 'Draft' },
  { value: 'done', label: 'Done' },
] as const;

type PickupLineCombo = PickupLineStatusFacts & FacetCombo;

export async function pickupFacets(
  orgId: OrgId,
  params: Pick<URLSearchParams, 'get'>,
  listLines: (orgId: OrgId, query: LocalPickupLinesQuery) => Promise<LocalPickupLineRow[]>,
): Promise<NavFacetsResponse> {
  const q = String(params.get('q') ?? '').trim();
  const lines = await listLines(orgId, { status: '', q, limit: PICKUP_PAGE_LINES });
  const rows: PickupLineCombo[] = lines.map((l) => ({ order_status: l.order_status, receiving_id: l.receiving_id, n: 1 }));
  const tab = parsePickupStatusTab(params.get('status'));
  const decl = NAV_FACET_GROUPS.pickup[0];
  const { total, groups } = computeFacets(
    rows,
    [
      {
        groupId: decl.id,
        label: decl.label,
        param: decl.param,
        options: STATUS_OPTIONS,
        matches: (row, value) => pickupLineMatchesStatus(row, parsePickupStatusTab(value)),
      },
    ],
    { [decl.id]: tab === 'all' ? null : tab },
  );
  return { context: 'pickup', total, groups };
}
