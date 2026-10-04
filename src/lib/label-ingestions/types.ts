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
  /** A quarantined ShipStation label an operator paired to an order (Link label). */
  'LINKED',
] as const;

export type LabelIngestionState = (typeof LABEL_INGESTION_STATES)[number];

const LABEL_INGESTION_SOURCES = [
  'WATCHED_FOLDER',
  'BROWSER_FIXTURE',
  'MANUAL_UPLOAD',
  /** Historical labels pulled from ShipStation's API (sources/shipstation-history.ts). */
  'SHIPSTATION_API',
] as const;

type LabelIngestionSource = (typeof LABEL_INGESTION_SOURCES)[number];

/** How a label reached its order. Auto methods only ever pick ONE logical order. */
export const LABEL_MATCH_METHODS = [
  'CYCLEFORGE_REFERENCE',
  'MARKETPLACE_ORDER_ID',
  /** The label's tracking is already on exactly one logical order. */
  'TRACKING_NUMBER',
  /** The ship-to name names exactly one open logical order. */
  'BUYER_NAME',
  /** The buyer has several open orders and the others already hold labels → the most recent unlabeled one. */
  'BUYER_NAME_NEXT_UNLABELED',
  /** An operator confirmed a buyer-name exception (or paired an unreadable label). */
  'OPERATOR_CONFIRMED',
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
  /** A ship-to name was read, but no open order carries that buyer. */
  'BUYER_NOT_FOUND',
  /** Several open orders carry this buyer and none can be picked by rule — the confirmation exception. */
  'BUYER_AMBIGUOUS',
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

interface StagedLabelObject {
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
  /** The recipient name printed on the label (file uploads); absent for API sources. */
  shipToName?: string | null;
}

interface LabelIngestionRecord {
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
