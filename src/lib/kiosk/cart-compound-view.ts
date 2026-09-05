/**
 * Kiosk cart line → {@link CompoundRowView}. Pure; no React, no hooks.
 *
 * The sixth family adapter into the single compound renderer. Line money
 * lives under the Item title with qty (`ensureLineMoneySubtitle` / subtitle
 * parts) — the shared skeleton has no Amount column.
 *
 * The row it replaces was a hand-rolled `<li>`: a title, a meta line, a
 * right-aligned figure and a naked ✕ that voided a line the customer had
 * already been shown priced. It had no selection, so there was no way to void
 * or discount several lines at once, and the ✕ was the only verb a line could
 * ever have. On the shared row the cart gets bulk selection and title-hover
 * verbs. Line money sits under the title with qty, same as every staff desk.
 *
 * Maps `counter_session_lines` (`type` · `title` · `quantity` ·
 * `unit_amount_cents` · `payload` · `voided_at`), which is the real table
 * behind the client's `KioskCartLine`.
 */

import type {
  CompoundRowView,
  CompoundStateTone,
} from '@/components/tables/compound/compound-row-model';
import {
  isBuybackPayload,
  isRepairPayload,
  type KioskCartLine,
} from './cart-line';
import { lineMoneySubtitlePart } from '@/lib/tables/slot-table-line-money';
import { lineQtySubtitlePart } from '@/lib/tables/slot-table-line-qty';

/** Minor units → a display string. Sign is carried by the figure AND the tone. */
function formatCents(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  return `${sign}$${(Math.abs(cents) / 100).toFixed(2)}`;
}

/**
 * The line's IDENTIFIERS, for the ids track.
 *
 * A cart line genuinely has them, which is why this family fills a column that
 * Tasks and Daily leave empty: a retail line has a SKU, a repair has the device
 * serial, a buyback has the IMEI. They are the numbers a dispute is settled
 * with, so they belong in the identity column rather than buried in a note.
 */
function identifiers(line: KioskCartLine): { primary: string | null; secondary: string | null } {
  const p = line.payload;
  if (isRepairPayload(p)) {
    return { primary: p.sourceSku?.trim() || null, secondary: p.serialNumber?.trim() || p.imei?.trim() || null };
  }
  if (isBuybackPayload(p)) {
    return { primary: null, secondary: p.imei?.trim() || null };
  }
  return { primary: p.sku?.trim() || null, secondary: p.variationId?.trim() || null };
}

/** The qualifier under the title — what makes THIS line different. */
function detail(line: KioskCartLine): string | null {
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
 * evidence, not a delete" — so the row stays on the table and has to say why it
 * is struck. Which KIND of line it was matters less, at that point, than the
 * fact it is no longer being charged.
 */
function stateFor(line: KioskCartLine, voided: boolean): { label: string; tone: CompoundStateTone } {
  if (voided) return { label: 'Voided', tone: 'alert' };
  if (line.type === 'REPAIR') return { label: 'Repair', tone: 'neutral' };
  if (line.type === 'BUYBACK') return { label: 'Buyback', tone: 'neutral' };
  return { label: 'Retail', tone: 'neutral' };
}

export interface CartCompoundParts {
  /** `counter_session_lines.voided_at` is set — the line is struck, not gone. */
  voided?: boolean;
  /** Catalog photo for the SKU, when the caller has resolved one. */
  thumbUrl?: string | null;
}

export function cartLineCompoundView(
  line: KioskCartLine,
  parts: CartCompoundParts = {},
): CompoundRowView {
  const qty = Number.isFinite(line.quantity) ? Math.max(0, Math.trunc(line.quantity)) : 0;
  const unit = Number.isFinite(line.unitAmountCents) ? Math.trunc(line.unitAmountCents) : 0;
  const total = qty * unit;
  const ids = identifiers(line);
  const state = stateFor(line, Boolean(parts.voided));

  const lineDetail = detail(line);
  return {
    id: line.id,
    // `counter_session_lines` has no image column. A retail line could resolve
    // one from the catalog by SKU; until a caller does, the typed placeholder
    // holds the track so the cart lines up with every other table.
    thumbUrl: parts.thumbUrl ?? null,
    title: line.title,
    note: null,
    orderId: ids.primary,
    tracking: ids.secondary,
    platformValue: null,
    carrier: null,
    stateLabel: state.label,
    stateTone: state.tone,
    delay: null,
    // Line money lives in `subtitleParts` (`cart.amount`), not a bound amount track.
    amount: null,
    subtitleParts: [
      lineQtySubtitlePart('cart.qty', String(qty)),
      lineMoneySubtitlePart('cart.amount', formatCents(total)),
      ...(lineDetail ? [{ text: lineDetail, key: 'cart.detail' }] : []),
    ],
  };
}
