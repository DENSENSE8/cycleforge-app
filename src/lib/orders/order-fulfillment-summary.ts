import { nonSentinelTimestamp } from '@/components/dashboard/orders-queue/helpers';
import type { StateName } from '@/design-system/tokens/lifecycle';
import { sentenceCaseLabel } from '@/lib/text/sentence-case-label';
import type { ShippedOrder } from '@/types/orders';
import {
  orderFulfillmentBadge,
  type OrderFulfillmentLine,
  type OrderFulfillmentTone,
} from './order-fulfillment-badge';

export type FulfillmentSummaryLine = OrderFulfillmentLine &
  Pick<
    ShippedOrder,
    | 'is_delivered'
    | 'latest_event_at'
    | 'latest_status_category'
    | 'latest_status_description'
    | 'latest_status_label'
  >;

export interface FulfillmentCurrentStatus {
  label: string;
  tone: StateName;
  detail?: string;
}

const INTERNAL_TONE: Readonly<Record<OrderFulfillmentTone, StateName>> = {
  attention: 'warning',
  info: 'info',
  warning: 'warning',
  critical: 'danger',
  success: 'success',
};

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
  const delivered = lines.find((line) => line.is_delivered === true);
  if (delivered) {
    return {
      label: 'Delivered',
      tone: 'success',
      detail: delivered.latest_status_description?.trim() || undefined,
    };
  }

  const carrierLine = latestCarrierLine(lines);
  if (carrierLine) {
    const category = carrierLine.latest_status_category?.trim() || null;
    const label =
      carrierLine.latest_status_label?.trim() ||
      sentenceCaseLabel(category) ||
      'With carrier';
    return {
      label,
      tone: carrierStatusTone(category),
      detail: carrierLine.latest_status_description?.trim() || undefined,
    };
  }

  if (hasExternalFulfillmentHandoff(lines)) {
    return { label: 'Awaiting carrier scan', tone: 'neutral' };
  }

  const internal = orderFulfillmentBadge(lines);
  return { label: internal.label, tone: INTERNAL_TONE[internal.tone] };
}
