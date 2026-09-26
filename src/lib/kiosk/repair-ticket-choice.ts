/** The visit's helpdesk-ticket decision: */

import type { CounterTicketWorkInput } from '@/lib/counter/counter-transaction-types';

/** What the counter decided about the helpdesk ticket for THIS visit. */
export type KioskTicketChoice =
  | { mode: 'create' }
  | { mode: 'attach'; ticketId: number; ticketLabel: string };

/** Has the counter answered the question? */
export function isKioskTicketChoiceComplete(choice: KioskTicketChoice | null): boolean {
  if (choice === null) return false;
  if (choice.mode === 'create') return true;
  return Number.isInteger(choice.ticketId) && choice.ticketId > 0;
}

/**
 * Is the decision SETTLED enough to commit?
 * Operator 2026-09-15: *"automatically select create new ticket."* The slider
 */
export function isKioskTicketChoiceSettled(choice: KioskTicketChoice | null): boolean {
  return choice === null || isKioskTicketChoiceComplete(choice);
}

/** The `ticketWork` this visit posts. */
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
