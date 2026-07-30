/**
 * Claim-photo ticket dual-link detach (DB-free orchestration).
 *
 * Leaf — inject Deps so unit tests run without Neon / `server-only`. Live
 * defaults that touch `photo_entity_links` live in `claim-link.ts`.
 */

export type UnlinkReceivingClaimPhotosFromTicketDeps = {
  deleteTicketPhotoLinks: (args: {
    orgId: string;
    ticketId: number;
    receivingId: number;
    lineId?: number | null;
  }) => Promise<number>;
};

/**
 * Reverse of claim dual-linking for a carton/line: drop `ZENDESK_TICKET`
 * rows on photos that still belong to this receiving carton (or any of its
 * lines).
 *
 * Load-bearing for unlink UX — `getPrimarySupportTicketForReceiving` falls
 * through to photo entity links after `ticket_links` / display columns clear,
 * so leaving these rows would resurrect the orange ticket chip on the next
 * by-entity refetch. Photos themselves stay; only the ticket dual-link goes.
 */
export async function unlinkReceivingClaimPhotosFromTicket(
  args: {
    orgId: string;
    ticketId: number;
    receivingId: number;
    lineId?: number | null;
  },
  deps: UnlinkReceivingClaimPhotosFromTicketDeps,
): Promise<{ cleared: number }> {
  const cleared = await deps.deleteTicketPhotoLinks({
    orgId: args.orgId,
    ticketId: args.ticketId,
    receivingId: args.receivingId,
    lineId: args.lineId ?? null,
  });
  return { cleared };
}
