/** Shipping scan-station active-order close — Back to list must clear the scan controller, not only the overlay. */

export const TECH_CLOSE_ACTIVE_ORDER_EVENT = 'tech-close-active-order';

export function dispatchTechCloseActiveOrder(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(TECH_CLOSE_ACTIVE_ORDER_EVENT));
}
