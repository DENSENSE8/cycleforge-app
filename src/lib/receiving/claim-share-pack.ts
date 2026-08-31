/**
 * The claim's photo share pack — how it is built and where its link goes.
 *
 * Its own module, deliberately: {@link fileReceivingClaim} imports the database
 * at load, so anything living beside it can only be tested against a live
 * connection. These two are the rules the operator actually cares about, so
 * they sit where a unit test can reach them and take their collaborators as
 * arguments rather than importing the real ones.
 */

/** Just enough of `createSharePack` / `listAllReceivingPhotoIds` to call them. */
type CreatePack = (
  input: {
    organizationId: string;
    staffId: number;
    photoIds: number[];
    title: string;
    packType?: 'claim' | 'manual' | 'customer';
    receivingId?: number | null;
    zendeskTicketId?: number | null;
    filenamePrefix?: string;
  },
  appOrigin: string,
) => Promise<{ packId: number; shareUrl: string }>;

type ListPhotoIds = (orgId: string, receivingId: number) => Promise<number[]>;

/**
 * Build the claim's photo share pack.
 *
 * Called BEFORE the ticket exists so its link can ride in the opening comment —
 * Zendesk cannot edit a comment after the fact, so a pack built afterwards can
 * only arrive as a second one. The pack is therefore named by the CARTON and
 * carries no `zendeskTicketId`; the caller backfills that once the ticket has
 * an id.
 *
 * The operator's **Test create** runs this same function: a dry run that
 * skipped the pack would prove nothing about the one thing it exists to prove.
 *
 * Returns `null` when there is nothing to share, no origin, no staff, or the
 * pack fails. A claim is never blocked on its photo link.
 */
export async function buildClaimSharePack({
  orgId,
  staffId,
  receivingId,
  photoIds,
  origin,
  createPack,
  listPhotos,
}: {
  orgId: string;
  staffId: number | null;
  receivingId: number;
  /** Explicit attach set; empty falls back to every photo on the carton. */
  photoIds: number[];
  origin: string | null | undefined;
  createPack: CreatePack;
  listPhotos: ListPhotoIds;
}): Promise<{ packId: number; shareUrl: string; photoIds: number[] } | null> {
  if (!origin || staffId == null) return null;
  try {
    const ids = photoIds.length > 0 ? photoIds : await listPhotos(orgId, receivingId);
    if (ids.length === 0) return null;
    const pack = await createPack(
      {
        organizationId: orgId,
        staffId,
        photoIds: ids,
        title: `Claim — carton ${receivingId}`,
        packType: 'claim',
        receivingId,
        filenamePrefix: `Claim_R${receivingId}`,
      },
      origin,
    );
    return { packId: pack.packId, shareUrl: pack.shareUrl, photoIds: ids };
  } catch (shareErr) {
    console.warn('[claim] share pack failed', shareErr);
    return null;
  }
}

/**
 * The claim's OPENING comment — description with the share pack folded in.
 *
 * ONE message, one place to look. The pack used to be posted as a second
 * internal comment after the ticket was created, so anyone opening the claim
 * got two messages and two links for one event — and the pack was the one they
 * actually needed.
 */
export function claimOpeningBody(description: string, shareUrl: string | null): string {
  if (!shareUrl) return description;
  return `${description}\n\nPhoto share pack: ${shareUrl}`;
}
