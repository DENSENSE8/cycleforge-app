/**
 * Operator reply / internal-note presets for Ticket Displays.
 *
 * Bodies post through Helpdesk REST (`useSupportReply` → photo-ticket), never
 * via VendorView DOM injection. Keep copy capability-neutral (no hardcoded
 * vendor product sentences in operator-facing labels beyond the helpdesk noun
 * resolved at the call site).
 *
 * Unbox and Testing Ticket Displays opt out (`showReplyPresets={false}`).
 * Arrival · `/support` keep them on.
 */

export type TicketReplyPreset = {
  id: string;
  /** Short button label. */
  label: string;
  /** Full comment body (signed by the composer for internal notes). */
  body: string;
  /** `false` → internal note (yellow in Agent Workspace). */
  isPublic: boolean;
};

/** Dogfood presets for Testing / Arrival / Support ticket composers. */
export const TICKET_REPLY_PRESETS: readonly TicketReplyPreset[] = [
  {
    id: 'all-good-public',
    label: 'All good',
    body: 'All working, all good. Thank you!',
    isPublic: true,
  },
  {
    id: 'qc-pass-internal',
    label: 'QC passed',
    body: 'QC Summary: Unit passed diagnostics. Ready for inventory.',
    isPublic: false,
  },
  {
    id: 'qc-fail-internal',
    label: 'QC failed',
    body: 'QC Summary: Unit did not pass diagnostics. See claim / seller follow-up.',
    isPublic: false,
  },
] as const;

export function ticketReplyPresetById(id: string): TicketReplyPreset | undefined {
  return TICKET_REPLY_PRESETS.find((p) => p.id === id);
}
