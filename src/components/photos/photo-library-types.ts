/**
 * `LibraryPhoto` — a photo row rendered in the photo library. Extracted into a
 * leaf module so `PhotoLibraryGrid` and the `usePhotoLibrary` hook can reference
 * it without importing `PhotoLibraryPage` (which imports them back, forming a
 * cycle). `PhotoLibraryPage` re-exports it for backwards compatibility.
 */
import type { PhotoLibrarySourceScope } from '@/lib/photos/library-filter-state';
import type { PhotoEvidenceStage } from '@/lib/photos/stages';

/** A label chip carried on a library photo (subset of PhotoLabel for rendering). */
export interface LibraryPhotoLabel {
  id: number;
  key: string;
  label: string;
  /** Semantic token name ('blue','rose',…) — resolved to chip classes client-side. */
  color: string | null;
  icon?: string | null;
}

/**
 * PO-adjacent evidence identity resolved by the library query (display join
 * only — no SKU dual-links are written). Carried on `LibraryPhoto` and threaded
 * into the fullscreen viewer's context-panel meta so the panel can render
 * SKU · serial · stage without a second fetch.
 */
export interface PhotoIdentityMeta {
  /** Resolved SKU — receiving line first (item evidence), then serialized unit. */
  sku?: string | null;
  /** Serial of the directly linked unit (testing / packing captures). */
  serialNumber?: string | null;
  /** USAV-minted unit identity, when the linked unit carries one. */
  unitUid?: string | null;
  /** Evidence stage derived via `stageFromPhotoType` — label via `photoStageLabel`. */
  stage?: PhotoEvidenceStage | null;
}

export interface LibraryPhoto extends PhotoIdentityMeta {
  id: number;
  /** `document` when this row is an outbound PDF/label (negative id = document table id). */
  kind?: 'photo' | 'document';
  photoType: string | null;
  poRef: string | null;
  /** Outbound documents — shipping_label | packing_slip. */
  documentType?: 'shipping_label' | 'packing_slip';
  tracking?: string | null;
  platform?: string | null;
  filename?: string | null;
  mimeType?: string | null;
  /** Labels assigned to this photo (many-to-many; one type, many labels). */
  labels?: LibraryPhotoLabel[];
  /** Linked Zendesk ticket id (claims scope), surfaced for folder grouping/labels. */
  ticketId?: number | null;
  takenByStaffId?: number | null;
  /** Resolved name of the uploader (joined from `staff`), for the viewer panel. */
  takenByStaffName?: string | null;
  createdAt: string;
  /**
   * Device-reported capture instant (`photos.client_captured_at`) — when the
   * shutter fired, as opposed to `createdAt`, which is when the server INSERTed
   * the row. They diverge by minutes-to-hours whenever a mobile upload queued
   * offline and drained later, and a carrier concealed-damage dispute turns on
   * the former.
   *
   * NOT server-attested (it is the operator's device clock) and null for every
   * desktop/legacy row that had no usable timestamp — render it as a distinct,
   * clearly-labelled fact, never as a substitute for `createdAt`.
   */
  clientCapturedAt?: string | null;
  displayUrl: string;
  thumbUrl: string;
  damageDetected?: boolean | null;
  hasAnalysis?: boolean | null;
  caption?: string | null;
  /**
   * Derived source scope (`unboxing` | `local_pickup` | `packing` | `repair` |
   * `claims`) from the photo's entity links — lets the sidebar highlight the
   * image-type a folder's photos belong to even under the "All photos" scope.
   */
  sourceScope?: PhotoLibrarySourceScope | null;
}

export function isLibraryDocument(photo: LibraryPhoto): boolean {
  return photo.kind === 'document' || photo.id < 0;
}

export function libraryDocumentId(photo: LibraryPhoto): number {
  return Math.abs(photo.id);
}
