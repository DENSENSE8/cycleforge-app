/**
 * Global Add intents — a surface parks one, the owning desk consumes it on
 * mount (Incoming leaves, Support create). The header `+` itself is
 * `GlobalHeaderAdd` (new sales order).
 */

/** Which Incoming intake a Global Add lands on (`IncomingDeskAddAction`). */
export type GlobalAddIncomingLeaf =
  | 'index'
  | 'add-po'
  | 'add-return'
  | 'import-returns';

export const GLOBAL_ADD_INTENT_EVENT = 'cycleforge:global-add' as const;
const GLOBAL_ADD_INTENT_KEY = 'cf:global-add-intent';

export type GlobalAddIntent =
  | { kind: 'incoming-add'; leaf: GlobalAddIncomingLeaf }
  | { kind: 'incoming-import-zoho' }
  | { kind: 'incoming-import-ebay' }
  | { kind: 'support-create-ticket' };

export function consumeGlobalAddIntent(): GlobalAddIntent | null {
  try {
    const raw = sessionStorage.getItem(GLOBAL_ADD_INTENT_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(GLOBAL_ADD_INTENT_KEY);
    return JSON.parse(raw) as GlobalAddIntent;
  } catch {
    return null;
  }
}
