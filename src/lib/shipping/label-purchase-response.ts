/** The success body of `POST /api/shipping/order-labels/purchase` — a fresh buy and a replay answer the same shape. */

import type { PurchasedLabel } from '@/lib/shipping/order-label-purchase';
import type { LabelPurpose } from '@/lib/shipping/label-purpose';

export interface LabelPurchaseFinish {
  shipmentId: number | null;
  labelDocumentId: number | null;
  labelIngestionId: number | null;
  warning: string | null;
}

export function labelPurchaseBody(input: {
  label: PurchasedLabel;
  finished: LabelPurchaseFinish;
  purpose: LabelPurpose;
  /** A replay of an earlier purchase under the same key — nothing was charged now. */
  idempotent: boolean;
}) {
  const { label, finished } = input;
  return {
    ok: true as const,
    ...(input.idempotent ? { idempotent: true as const } : {}),
    tracking: label.trackingNumber,
    carrier: label.carrierCode,
    service: label.serviceCode,
    cost: label.cost,
    currency: label.currency,
    labelId: label.labelId,
    labelUrl: label.labelUrl,
    shipmentId: finished.shipmentId,
    labelDocumentId: finished.labelDocumentId,
    /** The label's Labels & docs row (`label_ingestions.id`); null when it is not in the Labels view. */
    labelIngestionId: finished.labelIngestionId,
    warning: finished.warning,
    purpose: input.purpose,
    purchaseId: label.purchaseId,
  };
}
