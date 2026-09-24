import type { OrgId } from '@/lib/tenancy/constants';

export const LABEL_INGESTION_STATES = [
  'RECEIVED',
  'STAGED',
  'PARSED',
  'MATCHED',
  'QUARANTINED',
  'APPLYING',
  'APPLIED',
  'FAILED',
] as const;

export type LabelIngestionState = (typeof LABEL_INGESTION_STATES)[number];

export const LABEL_INGESTION_SOURCES = [
  'WATCHED_FOLDER',
  'BROWSER_FIXTURE',
  'MANUAL_UPLOAD',
] as const;

export type LabelIngestionSource = (typeof LABEL_INGESTION_SOURCES)[number];

/** V1 deliberately has no fuzzy/AI/address match discriminator. */
export const LABEL_MATCH_METHODS = [
  'CYCLEFORGE_REFERENCE',
  'MARKETPLACE_ORDER_ID',
] as const;

export type LabelMatchMethod = (typeof LABEL_MATCH_METHODS)[number];

export const LABEL_QUARANTINE_REASON_CODES = [
  'PARSE_FAILED',
  'PDF_LIMIT_EXCEEDED',
  'TRACKING_ONLY',
  'MISSING_ACCOUNT_CONTEXT',
  'CYCLEFORGE_REFERENCE_UNMAPPED',
  'ORDER_NOT_FOUND',
  'AMBIGUOUS_ORDER_MATCH',
  'UNSUPPORTED_CARRIER',
  'MULTI_PACKAGE_EVIDENCE',
  'STAGING_FAILED',
] as const;

export type LabelQuarantineReasonCode = (typeof LABEL_QUARANTINE_REASON_CODES)[number];

export type ServerOrganizationId = OrgId & {
  readonly __source: 'authenticated-server-session';
};

/**
 * Brand the organization identity after authentication has resolved it.
 * API code must call this with `ctx.organizationId`, never request JSON.
 */
export function serverOrganizationId(value: OrgId): ServerOrganizationId {
  if (!/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(value)) {
    throw new Error('Authenticated organization id is not a UUID');
  }
  return value as ServerOrganizationId;
}

export interface ExactOrderIdentity {
  accountSource: string;
  marketplaceOrderId: string;
  matchMethod: LabelMatchMethod;
  cycleforgeReference: string | null;
}

export interface StagedLabelObject {
  storageProvider: string;
  objectKey: string;
  mimeType: 'application/pdf';
  sha256: string;
  byteSize: number;
  fileBasename: string;
}

/** Text-derived evidence only. Raw PDF text is never persisted. */
export interface ParsedLabelEvidence {
  parserVersion: string;
  cycleforgeReference: string | null;
  marketplaceOrderId: string | null;
  accountSource: string | null;
  trackingNumberRaw: string | null;
  trackingNumberNormalized: string | null;
  carrier: string | null;
  multiPackageEvidence: boolean;
}

export interface LabelIngestionRecord {
  id: number;
  organizationId: string;
  deviceId: number | null;
  actorStaffId: number | null;
  clientEventId: string;
  state: LabelIngestionState;
  rowVersion: number;
  exactOrder: ExactOrderIdentity | null;
  trackingNumberRaw: string | null;
  trackingNumberNormalized: string | null;
  carrier: string | null;
  stagedObject: StagedLabelObject | null;
  matchedOrderId: number | null;
  shipmentId: number | null;
  documentId: number | null;
  appliedAt: string | null;
}

export interface ApplyLabelIngestionInput {
  organizationId: ServerOrganizationId;
  ingestionId: number;
  actorStaffId: number;
  expectedRowVersion: number;
}

export const APPLY_CONFLICT_CODES = [
  'INGESTION_NOT_FOUND',
  'INGESTION_NOT_MATCHED',
  'STALE_ROW_VERSION',
  'ACTOR_NOT_FOUND',
  'EXACT_IDENTITY_INCOMPLETE',
  'ORDER_NOT_FOUND',
  'ORDER_SET_CHANGED',
  'NO_ACTIVE_ALLOCATIONS',
  'ALLOCATION_NOT_PACKED',
  'SERIAL_UNIT_NOT_FOUND',
  'SERIAL_UNIT_NOT_PACKED',
  'MULTI_PACKAGE_CONFLICT',
  'TRACKING_OWNED_BY_OTHER_ORDER',
  'TRACKING_TENANT_CONFLICT',
  'TRANSITION_CONFLICT',
] as const;

export type ApplyConflictCode = (typeof APPLY_CONFLICT_CODES)[number];

export interface AppliedLabelIngestionResult {
  ok: true;
  replayed: boolean;
  ingestionId: number;
  orderIds: number[];
  serialUnitIds: number[];
  inventoryEventIds: number[];
  shipmentId: number;
  documentId: number;
  rowVersion: number;
}

export interface ConflictedLabelIngestionResult {
  ok: false;
  code: ApplyConflictCode;
  ingestionId: number;
  message: string;
}

export type ApplyLabelIngestionResult =
  | AppliedLabelIngestionResult
  | ConflictedLabelIngestionResult;
