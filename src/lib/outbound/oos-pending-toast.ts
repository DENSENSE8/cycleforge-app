/** Bottom-right toast after marking order(s) out of stock. */

import { toast } from '@/lib/toast';
import { deskViewHref } from '@/lib/outbound/desk-views';

export const OOS_PENDING_TOAST_DURATION_MS = 6000;

/**
 * Where an out-of-stock order lives: FBM › Exceptions. Its fulfillment list
 * holds EVERY out-of-stock order, label or not (`sqlOrderInExceptionQueue`,
 * the "Out of stock · Mark in stock" row); Allocate's Stock filter only sees
 * the labeled ones.
 */
export const OOS_ORDERS_HREF = deskViewHref('exceptions');

type OosPendingToastArgs = {
  count: number;
  /** Short SKU when a single-line identity exists. */
  sku?: string | null;
  qtyShort?: number | null;
  /**
   * When true the row stays packed (lifecycle packed wins over BLOCKED) —
   * confirm the hold without claiming a move to Exceptions.
   */
  staysPacked?: boolean;
  /** Navigate to {@link OOS_ORDERS_HREF}. Caller supplies router.push. */
  onViewExceptions: () => void;
};

export function showOosPendingToast(args: OosPendingToastArgs): void {
  if (args.staysPacked) {
    toast.success(args.count === 1 ? 'Marked out of stock' : `${args.count} orders marked out of stock`);
    return;
  }

  const title =
    args.count === 1 ? 'Moved to Exceptions' : `${args.count} orders moved to Exceptions`;
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
      label: 'View Exceptions',
      onClick: args.onViewExceptions,
    },
  });
}
