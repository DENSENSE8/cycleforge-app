/**
 * The persisted half of the ONE kiosk cart — what a `kiosk_carts` row carries,
 * and the pure helpers both sides of that row need. No React, no DB, no fetch.
 *
 * ## Persistence of the cart, not a second cart
 *
 * The tablet's session store stays the only cart system. A `kiosk_carts` row is
 * that store's visit fields written down, so the counter can juggle several
 * customers at once and any paired tablet of the org can pick a cart up by its
 * `#id`. Face, consult stance and the desk-mirror fields are deliberately NOT
 * here: they describe THIS screen, not the visit, and would make a cart opened
 * on another tablet flip that tablet's customer face.
 *
 * ## Why the payload is kept whole, not re-parsed per line type
 *
 * `parseLinePayload` (`counter/session-line-payload.ts`) STRIPS unknown keys —
 * right for a line a customer display echoes, wrong for a round-trip: the
 * keypad's `custom`/`note`, a line's `priceAdjustment` and a linked repair's
 * `linkedRepairId` would vanish between two tablets. The row only stores the
 * org's own working state; the money and shape a visit COMMITS are validated
 * where they commit, at `/api/kiosk/intake`. So the envelope (id, type, title,
 * quantity, amount) is checked strictly and the payload is kept as an object.
 *
 * Callers: `kiosk-session-store` (`loadCart`), `useKioskCartSync`,
 * `kiosk-carts.server`, `/api/kiosk/carts[/…]`.
 * Affected API: `/api/kiosk/carts` bodies. Schemas: `kiosk_carts.snapshot`
 * (2026-09-24d).
 * User 2026-09-24: "recent carts for juggling multiple customers at the same
 * time, IDed for multiple devices".
 */

import { z } from 'zod';
import {
  KIOSK_LINE_MAX_QUANTITY,
  KIOSK_LINE_TYPES,
  type KioskCartLine,
} from '@/lib/kiosk/cart-line';
import { KIOSK_COMMAND_IDS, type KioskCommandId } from '@/lib/kiosk/commands';
import type { KioskTicketChoice } from '@/lib/kiosk/repair-ticket-choice';

/** A counter visit, not a warehouse order — past this a row is a bug, not a basket. */
export const KIOSK_CART_MAX_LINES = 100;

export interface KioskCartSnapshot {
  lines: KioskCartLine[];
  customerPhone: string;
  customerName: string;
  customerEmail: string;
  customerAddress: string;
  ticketChoice: KioskTicketChoice | null;
  activeCommand: KioskCommandId;
}

const LineSchema = z.object({
  id: z.string().min(1).max(80),
  type: z.enum(KIOSK_LINE_TYPES),
  title: z.string().max(300),
  quantity: z.number().int().min(1).max(KIOSK_LINE_MAX_QUANTITY),
  // Signed: a trade-in credit is negative. Bounded so a typo cannot store $10M.
  unitAmountCents: z.number().int().min(-10_000_000).max(10_000_000),
  payload: z.record(z.string(), z.unknown()),
});

const TicketChoiceSchema = z.union([
  z.object({ mode: z.literal('create') }),
  z.object({
    mode: z.literal('attach'),
    ticketId: z.number().int(),
    ticketLabel: z.string().max(200),
  }),
]);

const KioskCartSnapshotSchema = z.object({
  lines: z.array(LineSchema).max(KIOSK_CART_MAX_LINES),
  customerPhone: z.string().max(40),
  customerName: z.string().max(200),
  customerEmail: z.string().max(320),
  customerAddress: z.string().max(500),
  ticketChoice: TicketChoiceSchema.nullable(),
  activeCommand: z.enum(KIOSK_COMMAND_IDS),
});

/**
 * Validate a snapshot off the wire or out of the row. The one cast lives here:
 * the envelope is checked, and the payload is deliberately an opaque object
 * (see the module note), so zod cannot prove it is a `KioskLinePayload` union
 * member — the intake route is where a payload's shape is committed.
 */
export function parseKioskCartSnapshot(raw: unknown): KioskCartSnapshot | null {
  const parsed = KioskCartSnapshotSchema.safeParse(raw);
  return parsed.success ? (parsed.data as unknown as KioskCartSnapshot) : null;
}

/** The visit fields of a session snapshot — the only part a cart row stores. */
export function cartSnapshotOf(session: KioskCartSnapshot): KioskCartSnapshot {
  return {
    lines: session.lines,
    customerPhone: session.customerPhone,
    customerName: session.customerName,
    customerEmail: session.customerEmail,
    customerAddress: session.customerAddress,
    ticketChoice: session.ticketChoice,
    activeCommand: session.activeCommand,
  };
}

/**
 * Nothing worth an `#id` yet. The command alone does not count: every idle
 * tablet has one, and minting a row per page load would bury the real carts.
 */
export function cartSnapshotIsEmpty(s: KioskCartSnapshot): boolean {
  return (
    s.lines.length === 0 &&
    !s.customerPhone.trim() &&
    !s.customerName.trim() &&
    !s.customerEmail.trim() &&
    !s.customerAddress.trim()
  );
}

/**
 * Who a cart is for: the customer's name, else their phone masked to its last
 * four — glanceable across the counter, and a full number there is a number
 * shown to the next customer in line. Null before either is typed. Also the
 * phone companion's name for the visit (`readCompanionForPhone`).
 */
export function cartCustomerLabel(s: Pick<KioskCartSnapshot, 'customerName' | 'customerPhone'>): string | null {
  const name = s.customerName.trim();
  if (name) return name;
  const digits = s.customerPhone.replace(/\D/g, '');
  return digits.length >= 4 ? `••• ${digits.slice(-4)}` : null;
}

/** The list's name for a cart: who it is for, else what is in it. */
export function cartListLabel(s: KioskCartSnapshot): string | null {
  const customer = cartCustomerLabel(s);
  if (customer) return customer;
  const first = s.lines[0]?.title.trim();
  if (!first) return null;
  return s.lines.length > 1 ? `${first} + ${s.lines.length - 1} more` : first;
}
