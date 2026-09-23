/**
 * Kiosk cart line → the facts a TOUCH card paints. Pure; no React, no hooks.
 *
 * The cart used to render `CompoundRow` — the desk compound table row that
 * Unbox, Incoming, To-Ship and Tasks share. That was the wrong tier for a
 * counter tablet, and `SURFACE_LAW` §5 says so outright: lists on a
 * phone-shaped surface are CARDS, never a DataTable. Operator 2026-09-14: the
 * cart "should display a mobile-like chip display component with a rounded
 * corner radius and kind of pills and buttons".
 *
 * These derivations are the single interpretation of `counter_session_lines`
 * (`type` · `title` · `quantity` · `unit_amount_cents` · `payload` ·
 * `voided_at`) for every cart face.
 */

import {
  isBuybackPayload,
  isRepairPayload,
  type KioskCartLine,
} from './cart-line';

/** Minor units → a display string. Sign is carried by the figure AND the tone. */
export function formatCartCents(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  return `${sign}$${(Math.abs(cents) / 100).toFixed(2)}`;
}

/**
 * The line's IDENTIFIERS.
 *
 * A retail line has a SKU, a repair has the device serial, a buyback has the
 * IMEI — the numbers a dispute is settled with, so they get a chip rather than
 * a buried note.
 */
export function cartLineIdentifiers(
  line: KioskCartLine,
): { primary: string | null; secondary: string | null } {
  const p = line.payload;
  if (isRepairPayload(p)) {
    return {
      primary: p.sourceSku?.trim() || null,
      secondary: p.serialNumber?.trim() || p.imei?.trim() || null,
    };
  }
  if (isBuybackPayload(p)) {
    return { primary: null, secondary: p.imei?.trim() || null };
  }
  return { primary: p.sku?.trim() || null, secondary: p.variationId?.trim() || null };
}

/** The qualifier under the title — what makes THIS line different. */
export function cartLineDetail(line: KioskCartLine): string | null {
  const p = line.payload;
  if (isRepairPayload(p)) {
    const reasons = (p.repairReasons ?? []).filter(Boolean);
    return reasons.length > 0 ? reasons.join(' · ') : (p.productModel?.trim() || null);
  }
  if (isBuybackPayload(p)) {
    return p.grade ? `Grade ${p.grade}` : (p.notes?.trim() || null);
  }
  return null;
}

/**
 * VOIDED outranks the line type.
 *
 * A void is a soft delete by design — "a line the customer already saw is
 * evidence, not a delete" — so the line stays and has to say why it is struck.
 */
export function cartLineState(
  line: KioskCartLine,
  voided: boolean,
): { label: string; voided: boolean } {
  if (voided) return { label: 'Voided', voided: true };
  if (line.type === 'REPAIR') return { label: 'Repair', voided: false };
  if (line.type === 'BUYBACK') return { label: 'Buyback', voided: false };
  return { label: 'Retail', voided: false };
}

export interface CartCardView {
  id: string;
  title: string;
  /** Reasons / model / grade — the line's qualifier, or null. */
  detail: string | null;
  /** State chip text: Repair · Retail · Buyback, or Voided. */
  stateLabel: string;
  voided: boolean;
  /** SKU-ish identifier chip, or null. */
  primaryId: string | null;
  /** Serial / IMEI chip, or null. */
  secondaryId: string | null;
  /** Clamped whole units. */
  quantity: number;
  /** `×N @ $u` — only when it is not a restatement of the total. */
  unitNote: string | null;
  /** Line total, formatted. */
  amount: string;
  /** A trade-in is money going the other way; the minus sign alone is missable. */
  credit: boolean;
}

export function cartLineCardView(
  line: KioskCartLine,
  parts: { voided?: boolean } = {},
): CartCardView {
  const quantity = Number.isFinite(line.quantity) ? Math.max(0, Math.trunc(line.quantity)) : 0;
  const unit = Number.isFinite(line.unitAmountCents) ? Math.trunc(line.unitAmountCents) : 0;
  const total = quantity * unit;
  const ids = cartLineIdentifiers(line);
  const state = cartLineState(line, Boolean(parts.voided));

  return {
    id: line.id,
    title: line.title,
    detail: cartLineDetail(line),
    stateLabel: state.label,
    voided: state.voided,
    primaryId: ids.primary,
    secondaryId: ids.secondary,
    quantity,
    unitNote: quantity > 1 ? `×${quantity} @ ${formatCartCents(unit)}` : null,
    amount: formatCartCents(total),
    credit: total < 0,
  };
}
