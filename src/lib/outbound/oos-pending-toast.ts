/**
 * Bottom-right toast after marking order(s) out of stock.
 *
 * Pending is the Shipping peer desk `/shipping/shortage` (sidebar label
 * Pending) — not To-ship `?stage=pending`. Do not auto-navigate; the CTA is
 * how the operator identifies the move.
 *
 * Callers: MorphingRowActionMenu (after OOS commit).
 * Affected: AppToaster bottom-right via @/lib/toast; navigates to SHIPPING_SHORTAGE_PATH.
 * User: "Implement the plan as specified... Out of stock identity + Pending-tab toast"
 */

import { toast } from '@/lib/toast';
import { SHIPPING_SHORTAGE_PATH } from '@/lib/shipping/orders-desk';

export const OOS_PENDING_TOAST_DURATION_MS = 6000;

export type OosPendingToastArgs = {
  count: number;
  /** Short SKU when a single-line identity exists. */
  sku?: string | null;
  qtyShort?: number | null;
  /**
   * When true the row stays packed (lifecycle packed wins over BLOCKED) —
   * confirm the hold without claiming a Pending-tab move.
   */
  staysPacked?: boolean;
  /** Navigate to the Pending desk. Caller supplies router.push. */
  onViewPending: () => void;
};

export function showOosPendingToast(args: OosPendingToastArgs): void {
  if (args.staysPacked) {
    toast.success(args.count === 1 ? 'Marked out of stock' : `${args.count} orders marked out of stock`);
    return;
  }

  const title =
    args.count === 1 ? 'Moved to Pending' : `${args.count} orders moved to Pending`;
  const sku = String(args.sku || '').trim();
  const qty = Number(args.qtyShort);
  const description =
    sku && Number.isFinite(qty) && qty > 0
      ? `${sku} · short ${qty}`
      : sku
        ? sku
        : undefined;

  toast.success(title, {
    description,
    duration: OOS_PENDING_TOAST_DURATION_MS,
    closeButton: true,
    action: {
      label: 'View Pending',
      onClick: args.onViewPending,
    },
  });
}

export function pendingDeskHref(): string {
  return SHIPPING_SHORTAGE_PATH;
}
