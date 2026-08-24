/**
 * Receiving photo capture scope — which PO / line / evidence stage a capture
 * belongs to.
 *
 * Rescued out of `@/components/mobile/receiving/PhotoUploadQueue`
 * (Warehouse-OS): the upload queue itself is a React store, but this shape is
 * the contract `buildNasPhotoUrl` and the attach endpoints key off.
 */
import type { ReceivingPhotoStage } from '@/lib/receiving/photo-intent';

export interface PhotoScope {
  receivingId: number;
  receivingLineId?: number | null;
  /**
   * Human PO reference (Zoho PO number / id) used ONLY to name the file
   * object — e.g. `4421__photo_….jpg` instead of `PO_1987__photo_….jpg`. Not
   * sent to the attach endpoint (that still keys off receivingId/receivingLineId).
   * Falls back to `PO_{receivingId}` when absent.
   */
  poRef?: string | null;
  /** One-based clean filename suffix for captured photos, e.g. PO123_3.jpg. */
  fileIndex?: number | null;
  /**
   * Evidence stage this capture belongs to (stage x entity matrix:
   * `src/lib/receiving/photo-intent.ts`). Decides the stamped `photo_type`,
   * which the receive-time photo policy judges.
   */
  stage?: ReceivingPhotoStage | null;
}
