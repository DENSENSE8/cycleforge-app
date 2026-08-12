/**
 * Wire shape for a receiving photo, and the row→wire mapper.
 *
 * Extracted verbatim from `src/app/api/receiving-photos/route.ts` (where both
 * were module-private) so a SERVER caller can build the same payload without an
 * HTTP round trip to its own API. The `/unbox` paint seed is that caller: the
 * self-fetch cost ~1s of TTFB — auth, plus the NAS-picker resolution the peek
 * does not read — and TTFB lands straight on LCP because the seed blocks the
 * shell.
 *
 * Pure: no I/O, no tenancy. One implementation, so a seeded row cannot drift
 * from a fetched one.
 */
export interface PhotoRow {
  id: number;
  receivingId: number | null;
  receivingLineId: number | null;
  photoUrl: string;
  /**
   * Downscaled variant for tiles (the photo peek's corner/fan), when storage
   * has one. Absent → callers fall back to {@link PhotoRow.photoUrl}.
   *
   * Kept as a SECOND field rather than lowering `photoUrl`: the fullscreen
   * viewer zooms and pans off the same payload and must stay full-resolution.
   */
  thumbUrl?: string;
  /**
   * Legacy alias of {@link PhotoRow.photoType} — kept because five readers parse
   * it AS the stage, including the server-side receive gate. See the field docs
   * on `ReceivingPhotoListRow`. New readers take `photoType`.
   */
  caption: string | null;
  /** `photos.photo_type` under its real name — the stage half of stage × aspect. */
  photoType: string | null;
  uploadedBy: number | null;
  createdAt: string;
  /** Shutter clock (`photos.client_captured_at`), beside the server-INSERT time. */
  clientCapturedAt: string | null;
  /**
   * What this shot SHOWS, within its stage (`@/lib/photos/photo-aspects`).
   * NULL = unclassified evidence — the value every pre-2026-08-01b row carries,
   * and never a reason to treat the photo as missing.
   */
  photoAspect: string | null;
  /** Carries a secondary `claim_evidence` link (a filed Zendesk claim). */
  hasClaimEvidence: boolean;
  /** Carries a secondary `insurance_share` link (carrier / external share pack). */
  hasInsuranceShare: boolean;
}

export function mapReceivingPhotoRow(row: {
  id: number;
  entityType: string;
  entityId: number;
  receivingIdResolved: number | null;
  url: string;
  caption: string | null;
  photoType: string | null;
  uploadedBy: number | null;
  createdAt: string;
  clientCapturedAt: string | null;
  photoAspect: string | null;
  hasClaimEvidence: boolean;
  hasInsuranceShare: boolean;
}): PhotoRow {
  const isLine = row.entityType === 'RECEIVING_LINE';
  return {
    id: row.id,
    receivingId: row.receivingIdResolved,
    receivingLineId: isLine ? row.entityId : null,
    photoUrl: row.url,
    caption: row.caption || null,
    photoType: row.photoType || null,
    uploadedBy: row.uploadedBy,
    createdAt: row.createdAt,
    clientCapturedAt: row.clientCapturedAt ?? null,
    photoAspect: row.photoAspect ?? null,
    hasClaimEvidence: row.hasClaimEvidence,
    hasInsuranceShare: row.hasInsuranceShare,
  };
}
