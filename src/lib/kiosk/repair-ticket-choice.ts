/**
 * The visit's helpdesk-ticket decision: create a fresh ticket, or attach this
 * drop-off to one that already exists. Pure; no React, no DB, no fetch.
 *
 * ## Why this is a VISIT fact, not a line fact
 *
 * `CounterTransactionInput.ticketWork` is transaction-level — one decision per
 * submit, and `submitCounterTransaction` fans it out to one outbox row PER
 * repair (`src/lib/counter/submit-counter-transaction.ts`). So a per-device
 * choice would be a shape the write path cannot honour: two devices with two
 * different existing tickets have nowhere to land. The choice therefore lives
 * on the session root beside the contact trio, which is the same ruling
 * `KioskRepairPane` already applies to the customer's address.
 *
 * ## Why `null` is a real state
 *
 * `null` is UNDECIDED, and it is what the step's progress segment counts (PG6 —
 * a count of satisfied units). Defaulting to `{ mode: 'create' }` would fill
 * that segment on an empty form, which is exactly the "paging to the last step
 * reads N/N" defect the progression law forbids. The customer (or the staffer)
 * has to say which it is.
 *
 * An undecided visit still SUBMITS as a create — see {@link kioskTicketWork}.
 * The decision is a step gate, never a new way for a signed drop-off to end up
 * with no conversation attached to it.
 *
 * Callers: `KioskTicketStep`, `KioskRepairPane` (step gate), `KioskCartLedger`
 * (submit body), `kioskSessionStore`.
 * Affected API: POST `/api/kiosk/intake` (`ticketWork`). Schemas: none.
 * User 2026-09-15: *"after the customer has submitted their signature it should
 * display with a link existing ticket or create new ticket."*
 */

import type { CounterTicketWorkInput } from '@/lib/counter/counter-transaction-types';

/**
 * What the counter decided about the helpdesk ticket for THIS visit.
 *
 * `attach` carries the label as well as the id because the kiosk has to keep
 * saying which ticket it picked after the candidate list has been re-queried
 * away (a search refresh drops the result set, not the decision).
 */
export type KioskTicketChoice =
  | { mode: 'create' }
  | { mode: 'attach'; ticketId: number; ticketLabel: string };

/**
 * Has the counter answered the question? `attach` without a positive id is NOT
 * an answer: it is a half-finished search, and treating it as one would post
 * `{ mode: 'attach' }` with a ticket id the route's zod rejects.
 *
 * This is the strict reading — `null` counts as unanswered — and it is what
 * anything DISPLAYING the decision should use.
 */
export function isKioskTicketChoiceComplete(choice: KioskTicketChoice | null): boolean {
  if (choice === null) return false;
  if (choice.mode === 'create') return true;
  return Number.isInteger(choice.ticketId) && choice.ticketId > 0;
}

/**
 * Is the decision SETTLED enough to commit? This is the gate's reading, and it
 * differs from {@link isKioskTicketChoiceComplete} in exactly one place:
 * `null` is settled.
 *
 * Operator 2026-09-15: *"automatically select create new ticket."* The slider
 * therefore opens on Create, and an untouched control means the visit files a
 * new ticket — which is also what `kioskTicketWork` posts for `null`, so the
 * default position and the submitted payload are the same fact rather than two.
 *
 * What is still refused is the HALF-FINISHED state: slid to Link with no
 * ticket picked. That is a question left open on screen, not a default.
 */
export function isKioskTicketChoiceSettled(choice: KioskTicketChoice | null): boolean {
  return choice === null || isKioskTicketChoiceComplete(choice);
}

/**
 * The `ticketWork` this visit posts.
 *
 * `hasService` is the gate the server also applies: with no repair line there
 * is no entity for a ticket to be about, and `submitCounterTransaction` would
 * only push a warning ("No service line — no helpdesk ticket was created").
 * A retail-only cart therefore states `none` rather than asking for work that
 * cannot be done.
 *
 * An incomplete choice on a service visit falls back to `create`, which is the
 * behaviour every kiosk submit had before this decision existed.
 */
export function kioskTicketWork(
  choice: KioskTicketChoice | null,
  hasService: boolean,
): CounterTicketWorkInput {
  if (!hasService) return { mode: 'none' };
  if (choice?.mode === 'attach' && isKioskTicketChoiceComplete(choice)) {
    return { mode: 'attach', ticketId: choice.ticketId };
  }
  return { mode: 'create' };
}

/** Operator-facing one-liner for the decision, for the review floor. */
export function kioskTicketChoiceLabel(choice: KioskTicketChoice | null): string | null {
  if (!isKioskTicketChoiceComplete(choice) || choice === null) return null;
  return choice.mode === 'create' ? 'A new ticket will be filed' : `Linking ${choice.ticketLabel}`;
}
