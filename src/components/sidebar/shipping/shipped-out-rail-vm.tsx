/**
 * Dense Testing-parity rail VM for personal ship-out rows — title + qty·condition
 * only (no empty eyebrow / chevron band that inflates selection height).
 */

import type { Order } from '@/components/station/upnext/upnext-types';
import type { RailRowVM } from '@/components/sidebar/rail-shell/RailRowBody';
import { stripConditionPrefix } from '@/utils/upnext-helpers';

export function shippedOutRailTitle(order: Order): string {
  const title = stripConditionPrefix(order.product_title, order.condition).trim();
  return title || 'Unknown Product';
}

/**
 * Same density as Testing {@link RecentActivityRailBase} ReceivingRowMain:
 * title + meta only — selection hug hugs the text.
 */
export function shippedOutToDenseRailVM(order: Order): RailRowVM {
  const title = shippedOutRailTitle(order);
  const qty = Math.max(1, parseInt(String(order.quantity || '1'), 10) || 1);
  const condition = String(order.condition || '').trim() || 'N/A';
  return {
    title,
    titleAttr: title,
    meta: (
      <span className="block truncate font-semibold uppercase tracking-widest text-text-soft">
        {qty} · {condition}
      </span>
    ),
  };
}

export function getShippedOutStatusDot(): string {
  return 'bg-emerald-500';
}

export function getShippedOutStatusDotLabel(): string {
  return 'Shipped';
}
