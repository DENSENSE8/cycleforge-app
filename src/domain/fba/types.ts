/** Domain types for the FBA "condense FNSKU" operation. */

export type CondenseAction = 'condensed' | 'incremented' | 'created';

export interface AddFnskuResult {
  action: CondenseAction;
  itemId: number;
  newQty: number;
  /** Set when action is 'condensed' — the plan the item was moved from. */
  fromPlanId?: number;
}
