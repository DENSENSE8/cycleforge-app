/** Outbound documents — shared types (docs/outbound-documents-plan.md §4). */

/** Owner kinds a document can link to. Mirrors photo_entity_links' entity_type.
 * SKU / SERIAL_UNIT added for manuals + unit inserts (JIT pack Phase 3). */
export type DocumentEntityType = 'ORDER' | 'SHIPMENT' | 'SKU' | 'SERIAL_UNIT';

/** Outbound doc kinds this module writes. `documents.document_type` also holds
 * unrelated legacy values (e.g. 'intake_agreement', 'manual') — never assume
 * this union is exhaustive for the column. */
export type OutboundDocumentType = 'shipping_label' | 'packing_slip';

export type DocumentLinkRole = 'primary' | 'secondary';

export type PackingSlipIngestStatus = 'available' | 'processing' | 'failed';

export interface PackingSlipIngestState {
  status: PackingSlipIngestStatus;
  label: 'Available' | 'Processing' | 'Import failed';
  attemptCount: number;
  lastError: string | null;
  nextAttemptAt: string | null;
  documentId: number | null;
}

/** `documents.document_data` JSONB shape for shipping_label / packing_slip rows. */
export interface OutboundDocumentData {
  /** Resolved storage URL (NAS, GCS, or signed proxy path). */
  url: string;
  /** amazon | ebay | ecwid | walmart | fba | generated | manual */
  platform: string | null;
  /** marketplace_api | manual_upload | generated | zoho_export */
  source: string;
  /** Dedupe key: hash(platform + orderRef + document_type + stnId?). Only set
   * on marketplace-fetched docs (Phase 4); manual uploads omit it. */
  sourceHash?: string;
  mimeType?: string | null;
  carrier?: string | null;
  /** Denorm for display only; SoT is shipping_tracking_numbers via the link. */
  tracking?: string | null;
  marketplaceOrderId?: string | null;
  fetchedAt?: string | null;
  uploadedBy?: number | null;
  filename?: string | null;
  error?: string | null;
  /** `gcs` when bytes live in the photos bucket; omitted for NAS/manual URLs. */
  storageProvider?: 'gcs' | 'nas';
  bucket?: string | null;
  objectKey?: string | null;
  sha256Hex?: string | null;
  fileSizeBytes?: number | null;
  /** Cold NAS copy after GCS→NAS mirror cron (primary serve stays GCS). */
  nasUrl?: string | null;
  nasObjectKey?: string | null;
  nasMirroredAt?: string | null;
}

export interface DocumentEntityLinkRow {
  id: number;
  documentId: number;
  entityType: DocumentEntityType;
  entityId: number;
  linkRole: DocumentLinkRole;
  createdAt: string;
}

export interface OutboundDocument {
  id: number;
  documentType: OutboundDocumentType;
  data: OutboundDocumentData;
  /** Every ORDER/SHIPMENT link currently attached to this document. */
  links: Array<{ entityType: DocumentEntityType; entityId: number; linkRole: DocumentLinkRole }>;
  createdAt: string;
  updatedAt: string;
}

export function isOutboundDocumentType(value: unknown): value is OutboundDocumentType {
  return value === 'shipping_label' || value === 'packing_slip';
}

// ── Wire shapes (route responses) ───────────────────────────────────────────
// Colocated with the domain types since they're just the JSON envelope routes
// return — client components import these instead of redeclaring per-file.

/** GET /api/orders/[id]/documents response. */
export interface OutboundDocumentsResponse {
  success: boolean;
  documents: OutboundDocument[];
  packingSlipIngest: PackingSlipIngestState | null;
  nasBaseUrl: string;
  nasFolder: string;
}

/** POST /api/orders/[id]/documents/fetch response. */
export interface FetchOutboundDocumentsResponse {
  success: boolean;
  fetched: OutboundDocument[];
  failed: Array<{ type: OutboundDocumentType; error: string }>;
}
