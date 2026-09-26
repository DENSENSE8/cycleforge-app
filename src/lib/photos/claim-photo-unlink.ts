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

/** Reverse of claim dual-linking for a carton/line: */
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
