import { nonSentinelTimestamp } from '@/components/dashboard/orders-queue/helpers';
import type { StateName } from '@/design-system/tokens/lifecycle';
import { CARRIER_STATUS, OUTBOUND_INTERNAL_STATUS, carrierStatusLabel } from '@/lib/status/record-status';
import type { ShippedOrder } from '@/types/orders';
import { isBuyerCancelledStatus } from './buyer-cancelled';
import { orderFulfillmentBadge, type OrderFulfillmentLine } from './order-fulfillment-badge';
import { ordersUrgentLabel } from './orders-compound-view';

export type FulfillmentSummaryLine = OrderFulfillmentLine &
  Pick<
    ShippedOrder,
    | 'is_delivered'
    | 'latest_event_at'
    | 'latest_status_category'
    | 'latest_status_description'
    | 'latest_status_label'
    | 'status'
    | 'is_urgent'
    | 'service_level'
    | 'label_service_code'
  >;

/** The order's current fulfillment status. Painted in ONE pinned tone by the record, so it carries no tone of its own. */
export interface FulfillmentCurrentStatus {
  label: string;
  detail?: string;
}

export function carrierStatusTone(category: string | null | undefined): StateName {
  const value = String(category ?? '').toUpperCase();
  if (value.includes('EXCEPTION') || value.includes('FAIL') || value.includes('RETURN')) return 'danger';
  if (value.includes('DELIVER') && !value.includes('OUT_FOR')) return 'success';
  if (value.includes('OUT_FOR_DELIVERY')) return 'warning';
  if (value.includes('LABEL') || value.includes('PRE_TRANSIT') || value.includes('UNKNOWN')) return 'neutral';
  return 'info';
}

/**
 * External fulfillment begins at physical handoff, not when a label exists.
 * A dock scan is enough to open the carrier row while it awaits its first scan;
 * carrier truth also opens it when an older order lacks CycleForge dock proof.
 */
export function hasExternalFulfillmentHandoff(lines: readonly FulfillmentSummaryLine[]): boolean {
  return lines.some(
    (line) =>
      Boolean(nonSentinelTimestamp(line.ship_confirmed_at)) ||
      line.is_shipped === true ||
      line.is_delivered === true,
  );
}

function latestCarrierLine(lines: readonly FulfillmentSummaryLine[]): FulfillmentSummaryLine | null {
  return lines
    .filter((line) => line.is_shipped === true || line.is_delivered === true)
    .reduce<FulfillmentSummaryLine | null>((latest, line) => {
      if (!latest) return line;
      const latestAt = Date.parse(String(latest.latest_event_at ?? '')) || 0;
      const lineAt = Date.parse(String(line.latest_event_at ?? '')) || 0;
      return lineAt >= latestAt ? line : latest;
    }, null);
}

/** One plain-language answer for “where is this order now?” */
export function fulfillmentCurrentStatus(lines: readonly FulfillmentSummaryLine[]): FulfillmentCurrentStatus {
  if (lines.some((line) => isBuyerCancelledStatus(line.status))) {
    return { label: OUTBOUND_INTERNAL_STATUS.buyer_cancel.label };
  }

  const delivered = lines.find((line) => line.is_delivered === true);
  if (delivered) {
    return {
      label: CARRIER_STATUS.delivered.label,
      detail: delivered.latest_status_description?.trim() || undefined,
    };
  }

  const carrierLine = latestCarrierLine(lines);
  if (carrierLine) {
    const label = carrierLine.latest_status_label?.trim() || carrierStatusLabel(carrierLine.latest_status_category) || 'With carrier';
    return {
      label,
      detail: carrierLine.latest_status_description?.trim() || undefined,
    };
  }

  if (hasExternalFulfillmentHandoff(lines)) {
    return { label: 'Awaiting carrier scan' };
  }

  return { label: orderFulfillmentBadge(lines).label };
}

/** One status the record header paints, top right: where the order is, and any flag riding on it. */
export interface OrderStatusTag extends FulfillmentCurrentStatus {
  id: 'current' | 'urgent';
}

/**
 * Every status the order wears right now, in reading order (operator
 * 2026-10-08: the current status — Buyer cancel, Urgent… — top right of the
 * record, more than one at once): where it is ({@link fulfillmentCurrentStatus}),
 * then Urgent with its word ("Next day", "Urgent") while the order has not
 * reached the carrier — after the handoff, speed is the carrier's.
 */
export function orderStatusTags(lines: readonly FulfillmentSummaryLine[]): OrderStatusTag[] {
  const tags: OrderStatusTag[] = [{ id: 'current', ...fulfillmentCurrentStatus(lines) }];
  const urgent = hasExternalFulfillmentHandoff(lines) ? null : lines.map(ordersUrgentLabel).find((label) => label != null);
  if (urgent) tags.push({ id: 'urgent', label: urgent });
  return tags;
}
