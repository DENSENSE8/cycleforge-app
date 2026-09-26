/** The claim's photo share pack — how it is built and where its link goes. */

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

/** Build the claim's photo share pack. */
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

/** The claim's OPENING comment — description with the share pack folded in. */
export function claimOpeningBody(description: string, shareUrl: string | null): string {
  if (!shareUrl) return description;
  return `${description}\n\nPhoto share pack: ${shareUrl}`;
}
