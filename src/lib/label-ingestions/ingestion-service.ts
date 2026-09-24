import 'server-only';
import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
import { defaultGcsBucket, gcsAdapter } from '@/lib/photos/storage/gcs-adapter';
import type { OrgId } from '@/lib/tenancy/constants';
import { tenantQuery, withTenantTransaction } from '@/lib/tenancy/db';
import { applyLabelIngestion } from './apply';
import { MAX_LABEL_PDF_BYTES } from './contracts';
import { resolveExactLabelOrder } from './exact-resolver';
import { LabelPdfParseError, parseLabelPdf } from './pdf-parser';
import { serverOrganizationId, type ApplyLabelIngestionResult, type LabelIngestionState, type LabelQuarantineReasonCode, type ParsedLabelEvidence } from './types';

type Queryable = Pick<PoolClient, 'query'>;

export class LabelIngestionServiceError extends Error {
  constructor(readonly code: 'INVALID_PDF' | 'PAYLOAD_TOO_LARGE' | 'CLIENT_EVENT_PAYLOAD_MISMATCH' | 'INGESTION_NOT_FOUND' | 'INGESTION_NOT_ACTIONABLE' | 'INGESTION_PROCESSING_FAILED', message: string) { super(message); this.name = 'LabelIngestionServiceError'; }
}

export interface LabelObjectStore {
  put(input: { organizationId: OrgId; objectKey: string; bytes: Buffer }): Promise<void>;
  get(input: { organizationId: OrgId; objectKey: string }): Promise<Buffer>;
}

const productionObjectStore: LabelObjectStore = {
  async put({ organizationId, objectKey, bytes }) { await gcsAdapter.putObject({ organizationId, bucket: defaultGcsBucket(), objectKey, buffer: bytes, contentType: 'application/pdf' }); },
  async get({ objectKey }) { return gcsAdapter.getObjectBytes({ bucket: defaultGcsBucket(), objectKey }); },
};

export interface LabelIngestionDependencies {
  transaction<T>(organizationId: OrgId, fn: (client: Queryable) => Promise<T>): Promise<T>;
  query<T extends Record<string, unknown>>(organizationId: OrgId, text: string, values?: unknown[]): Promise<{ rows: T[] }>;
  store: LabelObjectStore;
  parse(bytes: Uint8Array): Promise<ParsedLabelEvidence>;
  resolve(client: Queryable, organizationId: OrgId, evidence: ParsedLabelEvidence): ReturnType<typeof resolveExactLabelOrder>;
}

const dependencies: LabelIngestionDependencies = { transaction: withTenantTransaction, query: tenantQuery, store: productionObjectStore, parse: parseLabelPdf, resolve: resolveExactLabelOrder };

export interface PublicLabelIngestion {
  id: number; clientEventId: string; state: LabelIngestionState; rowVersion: number; sha256: string; fileBasename: string; byteSize: number;
  parserVersion: string | null; matchMethod: string | null; trackingNumberRaw: string | null; trackingNumberNormalized: string | null; carrier: string | null;
  quarantineReasonCode: string | null; createdAt: string; updatedAt: string;
  /** Where the bytes came from, when they were observed, and the exact order they resolved to. */
  source: string; observedAt: string; accountSource: string | null; marketplaceOrderId: string | null; matchedOrderId: number | null; appliedAt: string | null;
}

interface LedgerRow extends Record<string, unknown> {
  id: number | string; client_event_id: string; state: LabelIngestionState; row_version: number | string; sha256: string; file_basename: string; byte_size: number | string;
  parser_version: string | null; match_method: string | null; tracking_number_raw: string | null; tracking_number_normalized: string | null; carrier: string | null; quarantine_reason_code: string | null; created_at: Date | string; updated_at: Date | string; staged_object_key: string | null;
  source: string; observed_at: Date | string; matched_account_source: string | null; matched_marketplace_order_id: string | null; matched_order_id: number | string | null; applied_at: Date | string | null;
}
function publicRow(row: LedgerRow): PublicLabelIngestion { return { id: Number(row.id), clientEventId: row.client_event_id, state: row.state, rowVersion: Number(row.row_version), sha256: row.sha256, fileBasename: row.file_basename, byteSize: Number(row.byte_size), parserVersion: row.parser_version, matchMethod: row.match_method, trackingNumberRaw: row.tracking_number_raw, trackingNumberNormalized: row.tracking_number_normalized, carrier: row.carrier, quarantineReasonCode: row.quarantine_reason_code, createdAt: new Date(row.created_at).toISOString(), updatedAt: new Date(row.updated_at).toISOString(), source: row.source, observedAt: new Date(row.observed_at).toISOString(), accountSource: row.matched_account_source, marketplaceOrderId: row.matched_marketplace_order_id, matchedOrderId: row.matched_order_id == null ? null : Number(row.matched_order_id), appliedAt: row.applied_at == null ? null : new Date(row.applied_at).toISOString() }; }
const ledgerColumns = 'id, client_event_id, state, row_version, sha256, file_basename, byte_size, parser_version, match_method, tracking_number_raw, tracking_number_normalized, carrier, quarantine_reason_code, created_at, updated_at, staged_object_key, source, observed_at, matched_account_source, matched_marketplace_order_id, matched_order_id, applied_at';
function basename(input: string): string { const value = input.trim(); if (!value || value.length > 255 || value.includes('/') || value.includes('\\')) throw new LabelIngestionServiceError('INVALID_PDF', 'A safe PDF filename is required.'); return value; }
function key(org: OrgId, hash: string): string { return `label-ingestions/${org}/${hash.slice(0, 2)}/${hash}.pdf`; }

export async function createLabelIngestion(input: { organizationId: OrgId; actorStaffId: number; clientEventId: string; observedAt: string; fileBasename: string; bytes: Buffer; expectedSha256?: string }, overrides: Partial<LabelIngestionDependencies> = {}): Promise<{ ingestion: PublicLabelIngestion; replayed: boolean }> {
  const deps = { ...dependencies, ...overrides };
  if (!input.bytes.length || input.bytes.length > MAX_LABEL_PDF_BYTES) throw new LabelIngestionServiceError('PAYLOAD_TOO_LARGE', 'PDF exceeds the permitted size.');
  if (input.bytes.subarray(0, 5).toString('ascii') !== '%PDF-') throw new LabelIngestionServiceError('INVALID_PDF', 'The uploaded file is not a PDF.');
  const fileBasename = basename(input.fileBasename); const sha256 = createHash('sha256').update(input.bytes).digest('hex');
  if (input.expectedSha256 && input.expectedSha256 !== sha256) throw new LabelIngestionServiceError('CLIENT_EVENT_PAYLOAD_MISMATCH', 'The supplied checksum does not match the PDF bytes.');
  const existing = await deps.query<LedgerRow>(input.organizationId, `SELECT ${ledgerColumns} FROM label_ingestions WHERE organization_id = $1 AND (sha256 = $2 OR client_event_id = $3) ORDER BY id ASC`, [input.organizationId, sha256, input.clientEventId]);
  if (existing.rows.length) {
    const sameEventDifferentBytes = existing.rows.some((row) => row.client_event_id === input.clientEventId && row.sha256 !== sha256);
    if (sameEventDifferentBytes) throw new LabelIngestionServiceError('CLIENT_EVENT_PAYLOAD_MISMATCH', 'This client event was already used for different bytes.');
    const sameHash = existing.rows.find((row) => row.sha256 === sha256);
    if (sameHash) return { ingestion: publicRow(sameHash), replayed: true };
  }
  const received = await deps.transaction(input.organizationId, async (client) => {
    const result = await client.query<LedgerRow>(`INSERT INTO label_ingestions (organization_id, actor_staff_id, client_event_id, sha256, file_basename, byte_size, observed_at, source, state) VALUES ($1,$2,$3,$4,$5,$6,$7,'MANUAL_UPLOAD','RECEIVED') ON CONFLICT DO NOTHING RETURNING ${ledgerColumns}`, [input.organizationId, input.actorStaffId, input.clientEventId, sha256, fileBasename, input.bytes.length, input.observedAt]);
    if (result.rows[0]) return { row: result.rows[0], replayed: false };
    const concurrent = await client.query<LedgerRow>(`SELECT ${ledgerColumns} FROM label_ingestions WHERE organization_id=$1 AND (sha256=$2 OR client_event_id=$3) ORDER BY id ASC`, [input.organizationId, sha256, input.clientEventId]);
    const sameEventDifferentBytes = concurrent.rows.some((row) => row.client_event_id === input.clientEventId && row.sha256 !== sha256);
    if (sameEventDifferentBytes) throw new LabelIngestionServiceError('CLIENT_EVENT_PAYLOAD_MISMATCH', 'This client event was already used for different bytes.');
    const sameHash = concurrent.rows.find((row) => row.sha256 === sha256);
    if (!sameHash) throw new LabelIngestionServiceError('INGESTION_PROCESSING_FAILED', 'The ingestion ledger could not be created.');
    return { row: sameHash, replayed: true };
  });
  if (received.replayed) return { ingestion: publicRow(received.row), replayed: true };
  const objectKey = key(input.organizationId, sha256);
  try { await deps.store.put({ organizationId: input.organizationId, objectKey, bytes: input.bytes }); }
  catch { await deps.transaction(input.organizationId, async (client) => { await client.query(`UPDATE label_ingestions SET state='FAILED', error_code='STAGING_FAILED', error_detail='Object staging failed', attempt_count=attempt_count+1, row_version=row_version+1 WHERE organization_id=$1 AND id=$2`, [input.organizationId, received.row.id]); }); throw new LabelIngestionServiceError('INGESTION_PROCESSING_FAILED', 'The PDF could not be staged.'); }
  return { ingestion: await processStagedLabel({ organizationId: input.organizationId, ingestionId: Number(received.row.id), bytes: input.bytes, deps, objectKey }), replayed: false };
}

async function processStagedLabel({ organizationId, ingestionId, bytes, deps, objectKey }: { organizationId: OrgId; ingestionId: number; bytes: Buffer; deps: LabelIngestionDependencies; objectKey: string }): Promise<PublicLabelIngestion> {
  let evidence: ParsedLabelEvidence;
  try { evidence = await deps.parse(bytes); }
  catch (error) { const reason: LabelQuarantineReasonCode = error instanceof LabelPdfParseError && error.code === 'PDF_LIMIT_EXCEEDED' ? 'PDF_LIMIT_EXCEEDED' : 'PARSE_FAILED'; return updateQuarantine(deps, organizationId, ingestionId, objectKey, reason); }
  const resolution = await deps.transaction(organizationId, async (client) => deps.resolve(client, organizationId, evidence));
  if (!resolution.exactOrder) return updateQuarantine(deps, organizationId, ingestionId, objectKey, resolution.quarantineReason ?? 'PARSE_FAILED', evidence);
  const exactOrder = resolution.exactOrder;
  const result = await deps.transaction(organizationId, async (client) => client.query<LedgerRow>(`UPDATE label_ingestions SET state='MATCHED', parser_version=$3, match_method=$4, detected_cycleforge_reference=$5, matched_account_source=$6, matched_marketplace_order_id=$7, tracking_number_raw=$8, tracking_number_normalized=$9, carrier=$10, staged_storage_provider='gcs', staged_object_key=$11, quarantine_reason_code=NULL, error_code=NULL, error_detail=NULL, attempt_count=attempt_count+1, row_version=row_version+1 WHERE organization_id=$1 AND id=$2 RETURNING ${ledgerColumns}`, [organizationId, ingestionId, evidence.parserVersion, exactOrder.matchMethod, exactOrder.cycleforgeReference, exactOrder.accountSource, exactOrder.marketplaceOrderId, evidence.trackingNumberRaw, evidence.trackingNumberNormalized, evidence.carrier, objectKey]));
  return publicRow(result.rows[0]!);
}

async function updateQuarantine(deps: LabelIngestionDependencies, organizationId: OrgId, ingestionId: number, objectKey: string, reason: LabelQuarantineReasonCode, evidence?: ParsedLabelEvidence): Promise<PublicLabelIngestion> {
  const result = await deps.transaction(organizationId, async (client) => client.query<LedgerRow>(`UPDATE label_ingestions SET state='QUARANTINED', parser_version=$3, tracking_number_raw=$4, tracking_number_normalized=$5, carrier=$6, staged_storage_provider='gcs', staged_object_key=$7, quarantine_reason_code=$8, attempt_count=attempt_count+1, row_version=row_version+1 WHERE organization_id=$1 AND id=$2 RETURNING ${ledgerColumns}`, [organizationId, ingestionId, evidence?.parserVersion ?? null, evidence?.trackingNumberRaw ?? null, evidence?.trackingNumberNormalized ?? null, evidence?.carrier ?? null, objectKey, reason]));
  return publicRow(result.rows[0]!);
}

export async function listLabelIngestions(organizationId: OrgId, state?: LabelIngestionState, limit = 50, overrides: Partial<LabelIngestionDependencies> = {}): Promise<PublicLabelIngestion[]> { const deps = { ...dependencies, ...overrides }; const result = await deps.query<LedgerRow>(organizationId, `SELECT ${ledgerColumns} FROM label_ingestions WHERE organization_id=$1 AND ($2::text IS NULL OR state=$2) ORDER BY observed_at DESC, id DESC LIMIT $3`, [organizationId, state ?? null, limit]); return result.rows.map(publicRow); }
export async function getLabelIngestion(organizationId: OrgId, ingestionId: number, overrides: Partial<LabelIngestionDependencies> = {}): Promise<PublicLabelIngestion> { const deps = { ...dependencies, ...overrides }; const result = await deps.query<LedgerRow>(organizationId, `SELECT ${ledgerColumns} FROM label_ingestions WHERE organization_id=$1 AND id=$2`, [organizationId, ingestionId]); if (!result.rows[0]) throw new LabelIngestionServiceError('INGESTION_NOT_FOUND', 'Label ingestion was not found.'); return publicRow(result.rows[0]); }
export async function retryLabelIngestion(organizationId: OrgId, ingestionId: number, overrides: Partial<LabelIngestionDependencies> = {}): Promise<PublicLabelIngestion> { const deps = { ...dependencies, ...overrides }; const current = await getLabelIngestion(organizationId, ingestionId, deps); if (!['QUARANTINED', 'FAILED'].includes(current.state)) throw new LabelIngestionServiceError('INGESTION_NOT_ACTIONABLE', 'Only quarantined or failed ingestions can be retried.'); const source = await deps.query<LedgerRow>(organizationId, `SELECT ${ledgerColumns} FROM label_ingestions WHERE organization_id=$1 AND id=$2`, [organizationId, ingestionId]); const objectKey = source.rows[0]?.staged_object_key; if (!objectKey) throw new LabelIngestionServiceError('INGESTION_NOT_ACTIONABLE', 'This ingestion has no staged PDF.'); return processStagedLabel({ organizationId, ingestionId, bytes: await deps.store.get({ organizationId, objectKey }), deps, objectKey }); }
export async function applyStoredLabelIngestion(input: { organizationId: OrgId; actorStaffId: number; ingestionId: number; expectedRowVersion: number }): Promise<ApplyLabelIngestionResult> { return applyLabelIngestion({ ...input, organizationId: serverOrganizationId(input.organizationId) }); }
