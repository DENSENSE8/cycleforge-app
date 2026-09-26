/**
 * The ONE builder for a REPAIR cart line.
 * behind a hand-rolled `KioskRepairReviewCard`. Operator 2026-09-15 replaced
 */

import type { RepairPayload } from './cart-line';
import type { RepairFormData } from '@/components/repair/RepairIntakeForm';

/** A quote string (`"86"`, `"$86.00"`) → minor units. Non-numeric → 0. */
export function repairPriceToCents(price: string): number {
  const cleaned = price.replace(/[^0-9.]/g, '');
  if (!cleaned) return 0;
  const dollars = Number.parseFloat(cleaned);
  if (!Number.isFinite(dollars) || dollars < 0) return 0;
  return Math.round(dollars * 100);
}

/**
 * THE write for a repair's QUOTE, wherever it is typed — Device & quote or the
 * cart's line editor (operator 2026-09-24: "no forks, all under one cart
 */
export function repairQuotePatch(
  payload: RepairPayload,
  quote: string,
): { unitAmountCents: number; payload: RepairPayload } {
  return {
    unitAmountCents: repairPriceToCents(quote),
    payload: { ...payload, price: quote, priceAdjustment: null },
  };
}

export interface RepairLinePayloadInput {
  formData: RepairFormData;
  product: { type: string; model: string; sourceSku: string | null };
  /** Catalog price, used only when the form's own quote field is empty. */
  catalogPrice: string;
  signature: { dataUrl: string; strokes: unknown } | null;
}

/** THE repair line payload for the form as it stands. */
export function repairLinePayload(input: RepairLinePayloadInput): RepairPayload {
  const { formData, product, catalogPrice, signature } = input;
  return {
    productType: product.type || null,
    productModel: product.model,
    sourceSku: product.sourceSku ?? null,
    repairReasons: formData.repairReasons,
    repairNotes: formData.repairNotes || null,
    serialNumber: formData.serialNumber,
    passcode: null,
    imei: null,
    notes: formData.notes || null,
    price: formData.price.trim() || catalogPrice.trim(),
    signatureDataUrl: signature?.dataUrl ?? null,
    signatureStrokes: signature?.strokes ?? null,
  };
}
