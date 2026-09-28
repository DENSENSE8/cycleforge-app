import 'server-only';

import { tenantQuery } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import {
  buildPossibleDuplicatesSql,
  DUPLICATE_WINDOW_DEFAULT_DAYS,
  mapPossibleDuplicateRow,
  type PossibleDuplicateMatch,
  type PossibleDuplicateRow,
} from './possible-duplicates';

export interface PossibleDuplicatesResult {
  /** When this order was placed (ISO); null when no match was found. */
  orderDate: string | null;
  matches: PossibleDuplicateMatch[];
}

/** Orders by the same buyer carrying the same SKU within `days` of this one (see {@link buildPossibleDuplicatesSql}). */
export async function findPossibleDuplicateOrders(
  orgId: OrgId,
  orderRowId: number,
  days: number = DUPLICATE_WINDOW_DEFAULT_DAYS,
): Promise<PossibleDuplicatesResult> {
  const { text, values } = buildPossibleDuplicatesSql(orgId, orderRowId, days);
  const { rows } = await tenantQuery<PossibleDuplicateRow>(orgId, text, values);
  const first = rows[0]?.this_order_date;
  const orderDate = first == null ? null : new Date(first);
  return {
    orderDate: orderDate && Number.isFinite(orderDate.getTime()) ? orderDate.toISOString() : null,
    matches: rows.map(mapPossibleDuplicateRow),
  };
}
