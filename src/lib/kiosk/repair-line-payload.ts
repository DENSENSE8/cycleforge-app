/**
 * The ONE builder for a REPAIR cart line. Pure; no React, no hooks.
 *
 * ## Why this exists
 *
 * The payload was an object literal inside `KioskRepairPane.saveToCart`, so
 * nothing else could ask what the cart was about to receive — and the shape
 * the cart stores had no name. Now it does, and `saveToCart` and the quote →
 * cents conversion read from the same place.
 *
 * ## What used to be here, and why it is gone
 *
 * This module briefly also built a review SUMMARY for the signature step,
 * behind a hand-rolled `KioskRepairReviewCard`. Operator 2026-09-15 replaced
 * that outright: *"it should just display the paperwork instead of the
 * hand-rolled review component. The paperwork is better because it displays
 * exactly what's going to be printed out."* The summary was a SECOND rendering
 * of the agreement and could disagree with the sheet the customer signs, so the
 * step now mounts `RepairServiceForm` (the print route's own wording) fed by
 * `buildRepairIntakeReceiptProps`. The summary, its row model and the
 * saved/unsaved dirty check went with the card rather than being left as dead
 * exports.
 *
 * Callers: `KioskRepairPane`, `KioskCartLineEditor` (via {@link repairQuotePatch}).
 * Affected API: none. Schemas: `counter_session_lines.payload` (REPAIR).
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
 * system"). The text on the paperwork (`payload.price`, printed from
 * `repair_service.price`) and the money on the line (`unitAmountCents`, what
 * the totals are built from) move together, or the agreement and the total
 * disagree.
 *
 * A typed quote is the repair's price, not a deviation from a catalog price,
 * so it needs no PIN (`verifyLinePrices` accepts an unapproved repair quote) —
 * and it clears any earlier authorized re-quote, whose approval named the old
 * figure and would be refused at submit.
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
