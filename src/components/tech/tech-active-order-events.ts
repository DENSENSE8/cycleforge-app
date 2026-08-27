/**
 * Shipping scan-station active-order close — Back to list must clear the
 * scan controller, not only the overlay. The controller republishes
 * `tech-active-order-changed` whenever `activeOrder` / manuals change; a
 * pane-only `setActiveOrderPane(null)` loses that race and the order snaps
 * back (same class of bug as Unbox MRU vs `?unboxdesk=1`).
 */

export const TECH_CLOSE_ACTIVE_ORDER_EVENT = 'tech-close-active-order';

export function dispatchTechCloseActiveOrder(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(TECH_CLOSE_ACTIVE_ORDER_EVENT));
}
