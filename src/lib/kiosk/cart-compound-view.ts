/**
 * Kiosk cart line → {@link CompoundRowView}. Pure; no React, no hooks.
 *
 * The sixth family adapter into the single compound renderer, and the first
 * that carries MONEY — which is why the shared model grew an `amount` track
 * rather than this surface growing a private column array.
 *
 * The row it replaces was a hand-rolled `<li>`: a title, a meta line, a
 * right-aligned figure and a naked ✕ that voided a line the customer had
 * already been shown priced. It had no selection, so there was no way to void
 * or discount several lines at once, and the ✕ was the only verb a line could
 * ever have. On the shared row the cart gets bulk selection and a ⋮ menu for
 * free, and every other table gets a money column it had data for.
 *
 * Maps `counter_session_lines` (`type` · `title` · `quantity` ·
 * `unit_amount_cents` · `payload` · `voided_at`), which is the real table
 * behind the client's `KioskCartLine`.
 */

import type {
  CompoundRowView,
  CompoundStateTone,
} from '@/components/tables/compound/compound-row-model';
import type { KioskCartLine } from './cart-line';
import {
  cartLineDetail,
  cartLineIdentifiers,
  cartLineState,
  formatCartCents as formatCents,
} from './cart-card-view';

/**
 * The derivations (identifiers · detail · state) live in `cart-card-view.ts`,
 * shared with the TOUCH card the kiosk cart paints — one line cannot state
 * different facts on the tablet than on a desk. Only the tone mapping into the
 * compound model is this file's own.
 */
function stateFor(line: KioskCartLine, voided: boolean): { label: string; tone: CompoundStateTone } {
  const state = cartLineState(line, voided);
  return { label: state.label, tone: state.voided ? 'alert' : 'neutral' };
}

const identifiers = cartLineIdentifiers;
const detail = cartLineDetail;

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

  return {
    id: line.id,
    // `counter_session_lines` has no image column. A retail line could resolve
    // one from the catalog by SKU; until a caller does, the typed placeholder
    // holds the track so the cart lines up with every other table.
    thumbUrl: parts.thumbUrl ?? null,
    title: line.title,
    note: detail(line),
    orderId: ids.primary,
    tracking: ids.secondary,
    // No marketplace and no carrier — the dots fall back to their neutral
    // paint, which is honest: a walk-in sale came from no channel.
    platformValue: null,
    carrier: null,
    stateLabel: state.label,
    stateTone: state.tone,
    delay: null,
    amount: formatCents(total),
    // The WORKING, and only when it is not a restatement of the total. A
    // single-unit line showing `×1 @ $49.99` under `$49.99` is noise.
    amountNote: qty > 1 ? `×${qty} @ ${formatCents(unit)}` : null,
    // A trade-in is money going the other way. The minus sign alone is easy to
    // slide over in a column of tabular figures, and reading a −$120 credit as
    // a $120 sale is the expensive direction to be wrong in.
    amountCredit: total < 0,
  };
}
