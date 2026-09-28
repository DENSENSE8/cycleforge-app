/**
 * The To-ship queue's URL facets — what `UnshippedTable` and its filter menu
 * (`useToShipChrome` → `applyToShipTriageFacet`) read and write. Every route
 * that mounts that table owns this set, or hygiene strips a facet the moment
 * the operator picks it.
 */

import { ORDER_ROW_FLAG_IDS } from '@/lib/orders/order-row-flags';
import { paramEnum, paramFlag, paramText } from './route-params';

export const TO_SHIP_QUEUE_FACET_PARAMS = {
  /** Coarse lifecycle stage (`pending` · `picked` · `packed`). */
  stage: paramText,
  /** Ship-by aging bucket: overdue, today, upcoming, or unscheduled. */
  aging: paramEnum(['overdue', 'today', 'upcoming', 'unscheduled'] as const),
  /** Urgent-only (`orders.is_urgent`); the wire name predates the meaning. */
  attention: paramFlag,
  /** Must-ship — due today or late. */
  late: paramFlag,
  /** Exact derived fulfillment state (`BLOCKED`, …) from the status legend. */
  ustatus: paramText,
  /** Operator row-flag refine; the Awaiting-customer facet writes `awaiting_customer`. */
  rowFlag: paramEnum(ORDER_ROW_FLAG_IDS),
  /** Caged facet — shows the held set instead of the live one. */
  cage: paramFlag,
} as const;
