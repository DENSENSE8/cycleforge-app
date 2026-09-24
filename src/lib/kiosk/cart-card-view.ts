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
  KIOSK_LINE_MAX_QUANTITY,
  isBuybackPayload,
  isRepairPayload,
  lineIsCustom,
  linePriceAdjustment,
  type KioskCartLine,
} from './cart-line';

/** Minor units → a display string. Sign is carried by the figure AND the tone. */
export function formatCartCents(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  return `${sign}$${(Math.abs(cents) / 100).toFixed(2)}`;
}

/** One identifier, NAMED — a bare `670156893` chip is a number nobody can place. */
export interface CartLineId {
  label: string;
  value: string;
}

function id(label: string, value: string | null | undefined): CartLineId | null {
  const v = value?.trim();
  return v ? { label, value: v } : null;
}

/**
 * The line's IDENTIFIERS, each with the word that says what it is.
 *
 * A sale has the catalog SKU, a repair has its
 * service SKU and the device serial, a trade-in has the IMEI — the numbers a
 * dispute is settled with, so they get a chip rather than a buried note. The
 * chips used to print the bare values (`04767`, `670156893`), which left the
 * operator guessing which was the SKU (operator 2026-09-23: *"the numbers
 * should have an identification what numbers they are"*).
 */
export function cartLineIdentifiers(
  line: KioskCartLine,
): { primary: CartLineId | null; secondary: CartLineId | null } {
  const p = line.payload;
  if (isRepairPayload(p)) {
    // A linked repair is identified by the ticket it points at — that is the
    // number the customer quotes and the desk looks up — so it takes the
    // primary chip in place of the service SKU.
    const linked = p.linkedRepairId != null
      ? id('Linked', p.linkedTicketNumber || `RS-${p.linkedRepairId}`)
      : null;
    return {
      primary: linked ?? id('SKU', p.sourceSku),
      secondary: id('SN', p.serialNumber) ?? id('IMEI', p.imei),
    };
  }
  if (isBuybackPayload(p)) {
    return { primary: null, secondary: id('IMEI', p.imei) };
  }
  // The storefront listing id is not printed: nobody at the counter reads it
  // (operator 2026-09-23: "Remove the item ID").
  return { primary: id('SKU', p.sku), secondary: null };
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
  // A sale's qualifier is its item note (Square prints it under the item).
  return p.note?.trim() || null;
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
  // A comp is still on the bill, at $0 with its reason — that is what it IS
  // now, so it outranks the line type (Square prints "Comp").
  if (linePriceAdjustment(line)?.kind === 'comp') return { label: 'Comp', voided: false };
  if (line.type === 'REPAIR') return { label: 'Repair', voided: false };
  // Shown as "Trade-in" — the retail word (Best Buy, Apple, GameStop) a
  // customer recognises; BUYBACK stays the stored line type.
  if (line.type === 'BUYBACK') return { label: 'Trade-in', voided: false };
  // "Sale", matching the Sales mode and History's per-record Sale chip.
  return { label: 'Sale', voided: false };
}

/** What one press of the card's `−` / `+` does. */
export type CartQuantityStep =
  | { kind: 'set'; quantity: number }
  /** `−` at 1: ask before the line goes (Square's qty 0 → Remove). */
  | { kind: 'confirm-remove' };

export function stepCartQuantity(current: number, delta: 1 | -1): CartQuantityStep {
  const from = Number.isFinite(current) ? Math.max(1, Math.trunc(current)) : 1;
  const next = from + delta;
  if (next < 1) return { kind: 'confirm-remove' };
  return { kind: 'set', quantity: Math.min(KIOSK_LINE_MAX_QUANTITY, next) };
}

export interface CartCardView {
  id: string;
  title: string;
  /** Reasons / model / grade — the line's qualifier, or null. */
  detail: string | null;
  /** State chip text: Repair · Sale · Trade-in, or Voided. */
  stateLabel: string;
  voided: boolean;
  /** SKU identifier chip, or null. */
  primaryId: CartLineId | null;
  /** Serial / IMEI chip, or null. */
  secondaryId: CartLineId | null;
  /** A keypad line: the card wears a `Custom` chip so it reads apart from the catalog. */
  custom: boolean;
  /**
   * The catalog unit price, struck beside the new amount (`~~$5.59~~ 1 · $4.00`),
   * when a price adjustment changed it. Null otherwise — a comp names its
   * reason instead, and a custom amount had no catalog price.
   */
  adjustedFrom: string | null;
  /** Why a comped line is $0 (`Comp · Goodwill`), or null. */
  compReason: string | null;
  /**
   * A sale line carries the `−  N  +` stepper. A repair is one device and a
   * trade-in one IMEI, so neither ever has a quantity (handoff Law 6).
   */
  steppable: boolean;
  /** Clamped whole units — printed as `qty · amount` at the card's right. */
  quantity: number;
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
  const adjustment = linePriceAdjustment(line);

  return {
    id: line.id,
    title: line.title,
    detail: cartLineDetail(line),
    stateLabel: state.label,
    voided: state.voided,
    primaryId: ids.primary,
    secondaryId: ids.secondary,
    custom: lineIsCustom(line),
    adjustedFrom:
      adjustment?.kind === 'adjust' && adjustment.originalUnitAmountCents != null
        ? formatCartCents(adjustment.originalUnitAmountCents)
        : null,
    compReason: adjustment?.kind === 'comp' ? adjustment.reason : null,
    steppable: line.type === 'RETAIL' && !state.voided,
    quantity,
    amount: formatCartCents(total),
    credit: total < 0,
  };
}
