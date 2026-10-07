import 'server-only';
import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
import { defaultGcsBucket, gcsAdapter } from '@/lib/photos/storage/gcs-adapter';
import { applyOrderTrackingOps } from '@/lib/neon/orders-tracking-queries';
import { normalizeTrackingNumber } from '@/lib/shipping/normalize';
import type { OrgId } from '@/lib/tenancy/constants';
import { tenantQuery, withTenantTransaction } from '@/lib/tenancy/db';
import { applyLabelIngestion } from './apply';
import { MAX_LABEL_PDF_BYTES } from './contracts';
import { findBuyerOrders, normalizeBuyerName, resolveExactLabelOrder, sameBuyer, type BuyerOrderCandidate, type LabelOrderResolution } from './exact-resolver';
import { orderLinesSql, toOrderLines, type RawOrderLine } from '@/lib/label-prints/print-queue';
import type { LabelOrderLine } from '@/lib/label-prints/contracts';
import { LabelPdfParseError, parseLabelPdf } from './pdf-parser';
import { serverOrganizationId, type ApplyLabelIngestionResult, type ExactOrderIdentity, type LabelIngestionState, type LabelQuarantineReasonCode, type ParsedLabelEvidence } from './types';

type Queryable = Pick<PoolClient, 'query'>;

export class LabelIngestionServiceError extends Error {
  constructor(readonly code: 'INVALID_PDF' | 'PAYLOAD_TOO_LARGE' | 'CLIENT_EVENT_PAYLOAD_MISMATCH' | 'INGESTION_NOT_FOUND' | 'INGESTION_NOT_ACTIONABLE' | 'INGESTION_PROCESSING_FAILED', message: string) { super(message); this.name = 'LabelIngestionServiceError'; }
}

interface LabelObjectStore {
  put(input: { organizationId: OrgId; objectKey: string; bytes: Buffer }): Promise<void>;
  get(input: { organizationId: OrgId; objectKey: string }): Promise<Buffer>;
  delete?(input: { organizationId: OrgId; objectKey: string }): Promise<void>;
}

const productionObjectStore: LabelObjectStore = {
  async put({ organizationId, objectKey, bytes }) { await gcsAdapter.putObject({ organizationId, bucket: defaultGcsBucket(), objectKey, buffer: bytes, contentType: 'application/pdf' }); },
  async get({ objectKey }) { return gcsAdapter.getObjectBytes({ bucket: defaultGcsBucket(), objectKey }); },
  async delete({ objectKey }) { await gcsAdapter.deleteObject({ bucket: defaultGcsBucket(), objectKey }); },
};

interface LabelIngestionDependencies {
  transaction<T>(organizationId: OrgId, fn: (client: Queryable) => Promise<T>): Promise<T>;
  query<T extends Record<string, unknown>>(organizationId: OrgId, text: string, values?: unknown[]): Promise<{ rows: T[] }>;
  store: LabelObjectStore;
  parse(bytes: Uint8Array): Promise<ParsedLabelEvidence>;
  resolve(client: Queryable, organizationId: OrgId, evidence: ParsedLabelEvidence, ingestionId: number | null): Promise<LabelOrderResolution>;
  /** Make a freshly paired label's tracking its order's tracking. */
  attachTracking(input: { organizationId: OrgId; orderIds: number[]; trackingNumber: string; carrier: string | null }): Promise<void>;
}

/**
 * An order with no tracking takes the label's as its primary (what a
 * ShipStation purchase does); an order that already ships on another label
 * gets this one as an additional package.
 */
async function attachPairedTracking({ organizationId, orderIds, trackingNumber, carrier }: { organizationId: OrgId; orderIds: number[]; trackingNumber: string; carrier: string | null }): Promise<void> {
  const tracked = await tenantQuery<{ id: number }>(organizationId, 'SELECT id FROM orders WHERE organization_id = $1 AND id = ANY($2::int[]) AND shipment_id IS NOT NULL', [organizationId, orderIds]);
  if (tracked.rows.length === 0) await applyOrderTrackingOps({ organizationId, orderIds, primaryTrackingNumber: trackingNumber, primaryCarrier: carrier });
  else await applyOrderTrackingOps({ organizationId, orderIds, creates: [{ trackingNumber, source: 'label-ingestion' }] });
}

const dependencies: LabelIngestionDependencies = { transaction: withTenantTransaction, query: tenantQuery, store: productionObjectStore, parse: parseLabelPdf, resolve: resolveExactLabelOrder, attachTracking: attachPairedTracking };

export interface PublicLabelIngestion {
  id: number; clientEventId: string; state: LabelIngestionState; rowVersion: number; sha256: string; fileBasename: string; byteSize: number;
  parserVersion: string | null; matchMethod: string | null; trackingNumberRaw: string | null; trackingNumberNormalized: string | null; carrier: string | null;
  quarantineReasonCode: string | null; createdAt: string; updatedAt: string;
  /** Where the bytes came from, when they were observed, and the exact order they resolved to. */
  source: string; observedAt: string; accountSource: string | null; marketplaceOrderId: string | null; matchedOrderId: number | null; appliedAt: string | null;
  /** ShipStation identity of a SHIPSTATION_API row (null for file sources). */
  shipstationShipmentId: number | null; shipstationLabelId: string | null;
  /** The recipient name read off the label (file uploads). */
  shipToName: string | null;
}

interface LedgerRow extends Record<string, unknown> {
  id: number | string; client_event_id: string; state: LabelIngestionState; row_version: number | string; sha256: string; file_basename: string; byte_size: number | string;
  parser_version: string | null; match_method: string | null; tracking_number_raw: string | null; tracking_number_normalized: string | null; carrier: string | null; quarantine_reason_code: string | null; created_at: Date | string; updated_at: Date | string; staged_object_key: string | null;
  source: string; observed_at: Date | string; matched_account_source: string | null; matched_marketplace_order_id: string | null; matched_order_id: number | string | null; applied_at: Date | string | null;
  shipstation_shipment_id?: number | string | null; shipstation_label_id?: string | null; detected_ship_to_name?: string | null;
}
function publicRow(row: LedgerRow): PublicLabelIngestion { return { id: Number(row.id), clientEventId: row.client_event_id, state: row.state, rowVersion: Number(row.row_version), sha256: row.sha256, fileBasename: row.file_basename, byteSize: Number(row.byte_size), parserVersion: row.parser_version, matchMethod: row.match_method, trackingNumberRaw: row.tracking_number_raw, trackingNumberNormalized: row.tracking_number_normalized, carrier: row.carrier, quarantineReasonCode: row.quarantine_reason_code, createdAt: new Date(row.created_at).toISOString(), updatedAt: new Date(row.updated_at).toISOString(), source: row.source, observedAt: new Date(row.observed_at).toISOString(), accountSource: row.matched_account_source, marketplaceOrderId: row.matched_marketplace_order_id, matchedOrderId: row.matched_order_id == null ? null : Number(row.matched_order_id), appliedAt: row.applied_at == null ? null : new Date(row.applied_at).toISOString(), shipstationShipmentId: row.shipstation_shipment_id == null ? null : Number(row.shipstation_shipment_id), shipstationLabelId: row.shipstation_label_id ?? null, shipToName: row.detected_ship_to_name ?? null }; }
const ledgerColumns = 'id, client_event_id, state, row_version, sha256, file_basename, byte_size, parser_version, match_method, tracking_number_raw, tracking_number_normalized, carrier, quarantine_reason_code, created_at, updated_at, staged_object_key, source, observed_at, matched_account_source, matched_marketplace_order_id, matched_order_id, applied_at, shipstation_shipment_id, shipstation_label_id, detected_ship_to_name';
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

/**
 * Parse, resolve and settle in one transaction — the resolver's per-buyer
 * lock holds until the MATCHED / QUARANTINED write commits. A paired label's
 * tracking then becomes its order's tracking (after commit, best-effort: the
 * pairing stands even if the carrier number is already claimed elsewhere).
 */
async function processStagedLabel({ organizationId, ingestionId, bytes, deps, objectKey }: { organizationId: OrgId; ingestionId: number; bytes: Buffer; deps: LabelIngestionDependencies; objectKey: string }): Promise<PublicLabelIngestion> {
  let evidence: ParsedLabelEvidence;
  try { evidence = await deps.parse(bytes); }
  catch (error) {
    const reason: LabelQuarantineReasonCode = error instanceof LabelPdfParseError && error.code === 'PDF_LIMIT_EXCEEDED' ? 'PDF_LIMIT_EXCEEDED' : 'PARSE_FAILED';
    return publicRow(await deps.transaction(organizationId, (client) => updateQuarantine(client, organizationId, ingestionId, objectKey, reason)));
  }
  const settled = await deps.transaction(organizationId, async (client) => {
    const resolution = await deps.resolve(client, organizationId, evidence, ingestionId);
    if (!resolution.exactOrder) return { row: await updateQuarantine(client, organizationId, ingestionId, objectKey, resolution.quarantineReason ?? 'PARSE_FAILED', evidence), orderIds: [] as number[] };
    return { row: (await updateMatched(client, organizationId, ingestionId, objectKey, evidence, resolution.exactOrder, resolution.orderIds[0] ?? null))!, orderIds: resolution.orderIds };
  });
  // A TRACKING_NUMBER match found the tracking already on its order.
  if (settled.orderIds.length && evidence.trackingNumberRaw && settled.row.match_method !== 'TRACKING_NUMBER') {
    try { await deps.attachTracking({ organizationId, orderIds: settled.orderIds, trackingNumber: evidence.trackingNumberRaw, carrier: evidence.carrier }); }
    catch (error) { console.warn(`[label-ingestion] ${ingestionId}: paired, tracking not attached:`, error); }
  }
  return publicRow(settled.row);
}

/** Settle an ingestion as MATCHED to its logical order (`matchedOrderId` = its lowest row). `expected` guards a re-resolution: the row
 *  must still be in that state/version, else nothing is written (null). */
async function updateMatched(client: Queryable, organizationId: OrgId, ingestionId: number, objectKey: string, evidence: ParsedLabelEvidence, exactOrder: ExactOrderIdentity, matchedOrderId: number | null, expected?: { state: LabelIngestionState; rowVersion: number }): Promise<LedgerRow | null> {
  const result = await client.query<LedgerRow>(`UPDATE label_ingestions SET state='MATCHED', parser_version=$3, match_method=$4, detected_cycleforge_reference=$5, matched_account_source=$6, matched_marketplace_order_id=$7, tracking_number_raw=$8, tracking_number_normalized=$9, carrier=$10, staged_storage_provider='gcs', staged_object_key=$11, matched_order_id=COALESCE($14::int, matched_order_id), detected_ship_to_name=COALESCE($15::text, detected_ship_to_name), quarantine_reason_code=NULL, error_code=NULL, error_detail=NULL, attempt_count=attempt_count+1, row_version=row_version+1 WHERE organization_id=$1 AND id=$2 AND ($12::text IS NULL OR (state=$12 AND row_version=$13)) RETURNING ${ledgerColumns}`, [organizationId, ingestionId, evidence.parserVersion, exactOrder.matchMethod, exactOrder.cycleforgeReference, exactOrder.accountSource, exactOrder.marketplaceOrderId, evidence.trackingNumberRaw, evidence.trackingNumberNormalized, evidence.carrier, objectKey, expected?.state ?? null, expected?.rowVersion ?? null, matchedOrderId, evidence.shipToName ?? null]);
  return result.rows[0] ?? null;
}

async function updateQuarantine(client: Queryable, organizationId: OrgId, ingestionId: number, objectKey: string, reason: LabelQuarantineReasonCode, evidence?: ParsedLabelEvidence): Promise<LedgerRow> {
  const result = await client.query<LedgerRow>(`UPDATE label_ingestions SET state='QUARANTINED', parser_version=$3, tracking_number_raw=$4, tracking_number_normalized=$5, carrier=$6, staged_storage_provider='gcs', staged_object_key=$7, quarantine_reason_code=$8, detected_ship_to_name=$9, attempt_count=attempt_count+1, row_version=row_version+1 WHERE organization_id=$1 AND id=$2 RETURNING ${ledgerColumns}`, [organizationId, ingestionId, evidence?.parserVersion ?? null, evidence?.trackingNumberRaw ?? null, evidence?.trackingNumberNormalized ?? null, evidence?.carrier ?? null, objectKey, reason, evidence?.shipToName ?? null]);
  return result.rows[0]!;
}

// ─── ShipStation API source ───────────────────────────────────────────────── Historical labels pulled from ShipStation…

/** A deterministic client event per ShipStation shipment — the same shipment
 *  always claims the same ledger identity, whichever run gets there first. */
export function shipStationClientEventId(shipmentId: number): string {
  const hex = createHash('sha256').update(`shipstation-shipment:${shipmentId}`).digest('hex');
  const variant = ((parseInt(hex[16]!, 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export interface ShipStationLabelIngestionInput {
  organizationId: OrgId;
  shipmentId: number;
  labelId: string;
  observedAt: string;
  fileBasename: string;
  bytes: Buffer;
  evidence: ParsedLabelEvidence;
  /** The exact order the adapter resolved, or null with the exception reason. */
  exactOrder: ExactOrderIdentity | null;
  quarantineReason: LabelQuarantineReasonCode | null;
}

/** CREATED: new ledger row. REPLAYED: this shipment is already in the ledger.
 *  DUPLICATE_PDF: these exact bytes are already ingested under another row. */
export type ShipStationIngestionOutcome = 'CREATED' | 'REPLAYED' | 'DUPLICATE_PDF';

export interface ShipStationIngestionRecord { ingestion: PublicLabelIngestion; outcome: ShipStationIngestionOutcome }

/** Record one ShipStation label. */
export async function recordShipStationLabelIngestion(input: ShipStationLabelIngestionInput, overrides: Partial<LabelIngestionDependencies> = {}): Promise<ShipStationIngestionRecord> {
  const deps = { ...dependencies, ...overrides };
  if (!input.bytes.length || input.bytes.length > MAX_LABEL_PDF_BYTES) throw new LabelIngestionServiceError('PAYLOAD_TOO_LARGE', 'PDF exceeds the permitted size.');
  if (input.bytes.subarray(0, 5).toString('ascii') !== '%PDF-') throw new LabelIngestionServiceError('INVALID_PDF', 'The ShipStation label is not a PDF.');
  if (!input.exactOrder === !input.quarantineReason) throw new LabelIngestionServiceError('INGESTION_PROCESSING_FAILED', 'A ShipStation label needs exactly one of an exact order or a quarantine reason.');
  const fileBasename = basename(input.fileBasename);
  const sha256 = createHash('sha256').update(input.bytes).digest('hex');
  const lookup = async (run: (text: string, values: unknown[]) => Promise<{ rows: LedgerRow[] }>) => {
    const { rows } = await run(`SELECT ${ledgerColumns} FROM label_ingestions WHERE organization_id=$1 AND (shipstation_shipment_id=$2 OR sha256=$3) ORDER BY id ASC`, [input.organizationId, input.shipmentId, sha256]);
    const sameShipment = rows.find((row) => row.shipstation_shipment_id != null && Number(row.shipstation_shipment_id) === input.shipmentId);
    if (sameShipment) return { ingestion: publicRow(sameShipment), outcome: 'REPLAYED' as const };
    return rows[0] ? { ingestion: publicRow(rows[0]), outcome: 'DUPLICATE_PDF' as const } : null;
  };
  const prior = await lookup((text, values) => deps.query<LedgerRow>(input.organizationId, text, values));
  if (prior) return prior;

  const objectKey = key(input.organizationId, sha256);
  try { await deps.store.put({ organizationId: input.organizationId, objectKey, bytes: input.bytes }); }
  catch { throw new LabelIngestionServiceError('INGESTION_PROCESSING_FAILED', 'The PDF could not be staged.'); }

  const { evidence, exactOrder } = input;
  return deps.transaction(input.organizationId, async (client) => {
    const inserted = await client.query<LedgerRow>(
      `INSERT INTO label_ingestions (organization_id, client_event_id, sha256, file_basename, byte_size, observed_at, source, state, parser_version, match_method, detected_cycleforge_reference, matched_account_source, matched_marketplace_order_id, tracking_number_raw, tracking_number_normalized, carrier, staged_storage_provider, staged_object_key, quarantine_reason_code, attempt_count, shipstation_shipment_id, shipstation_label_id)
       VALUES ($1,$2,$3,$4,$5,$6,'SHIPSTATION_API',$7,$8,$9,$10,$11,$12,$13,$14,$15,'gcs',$16,$17,1,$18,$19)
       ON CONFLICT DO NOTHING RETURNING ${ledgerColumns}`,
      [input.organizationId, shipStationClientEventId(input.shipmentId), sha256, fileBasename, input.bytes.length, input.observedAt, exactOrder ? 'MATCHED' : 'QUARANTINED', evidence.parserVersion, exactOrder?.matchMethod ?? null, exactOrder?.cycleforgeReference ?? null, exactOrder?.accountSource ?? null, exactOrder?.marketplaceOrderId ?? null, evidence.trackingNumberRaw, evidence.trackingNumberNormalized, evidence.carrier, objectKey, exactOrder ? null : input.quarantineReason, input.shipmentId, input.labelId],
    );
    if (inserted.rows[0]) return { ingestion: publicRow(inserted.rows[0]), outcome: 'CREATED' as const };
    const raced = await lookup((text, values) => client.query<LedgerRow>(text, values));
    if (!raced) throw new LabelIngestionServiceError('INGESTION_PROCESSING_FAILED', 'The ingestion ledger could not be created.');
    return raced;
  });
}

/** The ledger rows already recorded for these ShipStation shipments. */
export async function listShipStationIngestions(organizationId: OrgId, shipmentIds: readonly number[], overrides: Partial<LabelIngestionDependencies> = {}): Promise<PublicLabelIngestion[]> {
  if (shipmentIds.length === 0) return [];
  const deps = { ...dependencies, ...overrides };
  const result = await deps.query<LedgerRow>(organizationId, `SELECT ${ledgerColumns} FROM label_ingestions WHERE organization_id=$1 AND shipstation_shipment_id = ANY($2::bigint[]) ORDER BY id ASC`, [organizationId, [...shipmentIds]]);
  return result.rows.map(publicRow);
}

/** Promote a QUARANTINED ShipStation row whose order now resolves (e.g. the
 *  order landed after the first run). Null when the row moved on meanwhile. */
async function resolveQuarantinedShipStationIngestion(organizationId: OrgId, ingestion: Pick<PublicLabelIngestion, 'id' | 'rowVersion'>, evidence: ParsedLabelEvidence, exactOrder: ExactOrderIdentity, overrides: Partial<LabelIngestionDependencies> = {}): Promise<PublicLabelIngestion | null> {
  const deps = { ...dependencies, ...overrides };
  const current = await deps.query<LedgerRow>(organizationId, `SELECT ${ledgerColumns} FROM label_ingestions WHERE organization_id=$1 AND id=$2`, [organizationId, ingestion.id]);
  const row = current.rows[0];
  if (!row || row.source !== 'SHIPSTATION_API' || row.state !== 'QUARANTINED' || !row.staged_object_key) return null;
  const promoted = await deps.transaction(organizationId, (client) => updateMatched(client, organizationId, ingestion.id, row.staged_object_key!, evidence, exactOrder, null, { state: 'QUARANTINED', rowVersion: ingestion.rowVersion }));
  return promoted ? publicRow(promoted) : null;
}

/** Finalize a MATCHED ShipStation row as APPLIED once the adapter has attached its tracking (`shipmentId`, the shipping_tracking_numbers… */
export async function markShipStationIngestionApplied(organizationId: OrgId, input: { ingestionId: number; expectedRowVersion: number; orderIds: readonly number[]; shipmentId: number; documentId: number }, overrides: Partial<LabelIngestionDependencies> = {}): Promise<PublicLabelIngestion> {
  const deps = { ...dependencies, ...overrides };
  if (input.orderIds.length === 0) throw new LabelIngestionServiceError('INGESTION_NOT_ACTIONABLE', 'An applied label needs its order rows.');
  return deps.transaction(organizationId, async (client) => {
    const locked = await client.query<LedgerRow>(`SELECT ${ledgerColumns} FROM label_ingestions WHERE organization_id=$1 AND id=$2 FOR UPDATE`, [organizationId, input.ingestionId]);
    const row = locked.rows[0];
    if (!row) throw new LabelIngestionServiceError('INGESTION_NOT_FOUND', 'Label ingestion was not found.');
    if (row.state === 'APPLIED') return publicRow(row);
    if (row.source !== 'SHIPSTATION_API' || row.state !== 'MATCHED' || Number(row.row_version) !== input.expectedRowVersion) throw new LabelIngestionServiceError('INGESTION_NOT_ACTIONABLE', 'Only an unchanged MATCHED ShipStation ingestion can be finalized.');
    for (const [ordinal, orderId] of input.orderIds.entries()) {
      await client.query(`INSERT INTO label_ingestion_orders (organization_id, ingestion_id, order_id, ordinal, link_role) VALUES ($1,$2,$3,$4,'MATCHED_LINE') ON CONFLICT DO NOTHING`, [organizationId, input.ingestionId, orderId, ordinal]);
    }
    await client.query(`INSERT INTO audit_logs (actor_staff_id, organization_id, source, action, entity_type, entity_id, after_data, metadata) VALUES (NULL, $1, 'label-ingestion', 'label_ingestion.applied', 'label_ingestion', $2, $3::jsonb, $4::jsonb)`, [organizationId, String(input.ingestionId), JSON.stringify({ state: 'APPLIED', rowVersion: input.expectedRowVersion + 1 }), JSON.stringify({ via: 'shipstation-history', order_ids: input.orderIds, shipment_id: input.shipmentId, document_id: input.documentId, sha256: row.sha256, shipstation_shipment_id: row.shipstation_shipment_id == null ? null : Number(row.shipstation_shipment_id) })]);
    const finalized = await client.query<LedgerRow>(`UPDATE label_ingestions SET state='APPLIED', matched_order_id=$3, shipment_id=$4, document_id=$5, attempt_count=attempt_count+1, row_version=row_version+1, error_code=NULL, error_detail=NULL, applied_at=now() WHERE organization_id=$1 AND id=$2 AND state='MATCHED' AND row_version=$6 RETURNING ${ledgerColumns}`, [organizationId, input.ingestionId, input.orderIds[0], input.shipmentId, input.documentId, input.expectedRowVersion]);
    if (!finalized.rows[0]) throw new LabelIngestionServiceError('INGESTION_NOT_ACTIONABLE', 'Label ingestion changed during finalize.');
    return publicRow(finalized.rows[0]);
  });
}

export async function listLabelIngestions(organizationId: OrgId, state?: LabelIngestionState, limit = 50, overrides: Partial<LabelIngestionDependencies> = {}): Promise<PublicLabelIngestion[]> { const deps = { ...dependencies, ...overrides }; const result = await deps.query<LedgerRow>(organizationId, `SELECT ${ledgerColumns} FROM label_ingestions WHERE organization_id=$1 AND ($2::text IS NULL OR state=$2) ORDER BY observed_at DESC, id DESC LIMIT $3`, [organizationId, state ?? null, limit]); return result.rows.map(publicRow); }
export async function getLabelIngestion(organizationId: OrgId, ingestionId: number, overrides: Partial<LabelIngestionDependencies> = {}): Promise<PublicLabelIngestion> { const deps = { ...dependencies, ...overrides }; const result = await deps.query<LedgerRow>(organizationId, `SELECT ${ledgerColumns} FROM label_ingestions WHERE organization_id=$1 AND id=$2`, [organizationId, ingestionId]); if (!result.rows[0]) throw new LabelIngestionServiceError('INGESTION_NOT_FOUND', 'Label ingestion was not found.'); return publicRow(result.rows[0]); }

/**
 * Delete one unlinked staged label and its existing GCS object. A matched or
 * applied row is order evidence and is never legal input for the Bulk cleanup
 * path. The row is deleted first so a storage failure can only leave an
 * unreachable object, never a live ledger row whose bytes have vanished.
 */
export async function deleteUnlinkedLabelIngestion(input: {
  organizationId: OrgId;
  actorStaffId: number;
  ingestionId: number;
}, overrides: Partial<LabelIngestionDependencies> = {}): Promise<{ id: number; objectKey: string | null }> {
  const deps = { ...dependencies, ...overrides };
  const deleted = await deps.transaction(input.organizationId, async (client) => {
    const locked = await client.query<LedgerRow>(
      `SELECT ${ledgerColumns} FROM label_ingestions WHERE organization_id=$1 AND id=$2 FOR UPDATE`,
      [input.organizationId, input.ingestionId],
    );
    const row = locked.rows[0];
    if (!row) throw new LabelIngestionServiceError('INGESTION_NOT_FOUND', 'Label ingestion was not found.');
    if (row.matched_order_id != null || row.state === 'APPLIED') {
      throw new LabelIngestionServiceError('INGESTION_NOT_ACTIONABLE', 'A label linked to an order cannot be removed as unlinked.');
    }
    await client.query(
      `INSERT INTO audit_logs (actor_staff_id, organization_id, source, action, entity_type, entity_id, before_data, metadata)
       VALUES ($1, $2, 'label-ingestion', 'label_ingestion.unlinked_deleted', 'label_ingestion', $3, $4::jsonb, $5::jsonb)`,
      [
        input.actorStaffId,
        input.organizationId,
        String(input.ingestionId),
        JSON.stringify({ state: row.state, fileBasename: row.file_basename }),
        JSON.stringify({ object_key: row.staged_object_key, sha256: row.sha256 }),
      ],
    );
    await client.query(
      `DELETE FROM label_ingestions WHERE organization_id=$1 AND id=$2`,
      [input.organizationId, input.ingestionId],
    );
    return { id: input.ingestionId, objectKey: row.staged_object_key };
  });
  if (deleted.objectKey) {
    if (!deps.store.delete) throw new LabelIngestionServiceError('INGESTION_PROCESSING_FAILED', 'The label object store cannot delete staged files.');
    try {
      await deps.store.delete({ organizationId: input.organizationId, objectKey: deleted.objectKey });
    } catch {
      throw new LabelIngestionServiceError('INGESTION_PROCESSING_FAILED', 'The unlinked label row was removed, but its staged file could not be deleted.');
    }
  }
  return deleted;
}
/** The staged PDF of one ledger row — the bytes the print desk previews and prints. */
export async function readLabelIngestionPdf(organizationId: OrgId, ingestionId: number, overrides: Partial<LabelIngestionDependencies> = {}): Promise<{ bytes: Buffer; fileBasename: string }> {
  const deps = { ...dependencies, ...overrides };
  const result = await deps.query<{ staged_object_key: string | null; file_basename: string }>(organizationId, `SELECT staged_object_key, file_basename FROM label_ingestions WHERE organization_id=$1 AND id=$2`, [organizationId, ingestionId]);
  const row = result.rows[0];
  if (!row) throw new LabelIngestionServiceError('INGESTION_NOT_FOUND', 'Label ingestion was not found.');
  if (!row.staged_object_key) throw new LabelIngestionServiceError('INGESTION_NOT_ACTIONABLE', 'This label has no stored PDF yet.');
  return { bytes: await deps.store.get({ organizationId, objectKey: row.staged_object_key }), fileBasename: row.file_basename };
}
export async function retryLabelIngestion(organizationId: OrgId, ingestionId: number, overrides: Partial<LabelIngestionDependencies> = {}): Promise<PublicLabelIngestion> { const deps = { ...dependencies, ...overrides }; const current = await getLabelIngestion(organizationId, ingestionId, deps); if (!['QUARANTINED', 'FAILED'].includes(current.state)) throw new LabelIngestionServiceError('INGESTION_NOT_ACTIONABLE', 'Only quarantined or failed ingestions can be retried.'); const source = await deps.query<LedgerRow>(organizationId, `SELECT ${ledgerColumns} FROM label_ingestions WHERE organization_id=$1 AND id=$2`, [organizationId, ingestionId]); const objectKey = source.rows[0]?.staged_object_key; if (!objectKey) throw new LabelIngestionServiceError('INGESTION_NOT_ACTIONABLE', 'This ingestion has no staged PDF.'); return processStagedLabel({ organizationId, ingestionId, bytes: await deps.store.get({ organizationId, objectKey }), deps, objectKey }); }
export async function applyStoredLabelIngestion(input: { organizationId: OrgId; actorStaffId: number; ingestionId: number; expectedRowVersion: number }): Promise<ApplyLabelIngestionResult> { return applyLabelIngestion({ ...input, organizationId: serverOrganizationId(input.organizationId) }); }

// ─── Operator pairing (the confirmation exception) ──────────────────────────

/** One order an operator can pair a quarantined label to, with what it ships. */
export interface LabelPairingCandidate extends BuyerOrderCandidate {
  lines: LabelOrderLine[];
}

export interface LabelPairingCandidates {
  /** The recipient read off the label; null when none was readable. */
  shipToName: string | null;
  candidates: LabelPairingCandidate[];
}

/** The open orders whose buyer is the label's ship-to name — what the confirmation exception chooses among. */
export async function listLabelPairingCandidates(organizationId: OrgId, ingestionId: number): Promise<LabelPairingCandidates> {
  const current = await getLabelIngestion(organizationId, ingestionId);
  if (!current.shipToName) return { shipToName: null, candidates: [] };
  const shipToName = current.shipToName;
  return withTenantTransaction(organizationId, async (client) => {
    const orders = await findBuyerOrders(client, organizationId, shipToName, ingestionId);
    if (!orders.length) return { shipToName, candidates: [] };
    const lines = await client.query<{ order_id: string; order_lines: RawOrderLine[] | null }>(
      `SELECT o.order_id, ol.order_lines FROM unnest($2::text[]) AS o(order_id) LEFT JOIN LATERAL (${orderLinesSql('o.order_id')}) ol ON true`,
      [organizationId, orders.map((order) => order.orderRef)],
    );
    const byRef = new Map(lines.rows.map((row) => [row.order_id, toOrderLines(row.order_lines)]));
    const candidates = orders
      .map((order) => ({ ...order, lines: byRef.get(order.orderRef) ?? [] }))
      .sort((a, b) => Number(a.labeled) - Number(b.labeled) || (b.orderedAt ?? '').localeCompare(a.orderedAt ?? ''));
    return { shipToName, candidates };
  });
}

/**
 * The operator answers a quarantined label's exception: this label ships
 * `orderId`'s logical order. Settles MATCHED (`OPERATOR_CONFIRMED`) under the
 * label's row version, attaches its tracking, then re-resolves the buyer's
 * other BUYER_AMBIGUOUS labels — with one order now labeled, the buyer-name
 * rule pairs them to the next most recent unlabeled order on its own.
 */
export async function confirmLabelIngestionOrder(input: { organizationId: OrgId; actorStaffId: number; ingestionId: number; orderId: number; expectedRowVersion: number }): Promise<{ ingestion: PublicLabelIngestion; repaired: PublicLabelIngestion[] }> {
  const { organizationId, ingestionId } = input;
  const settled = await withTenantTransaction(organizationId, async (client) => {
    const locked = await client.query<LedgerRow>(`SELECT ${ledgerColumns} FROM label_ingestions WHERE organization_id=$1 AND id=$2 FOR UPDATE`, [organizationId, ingestionId]);
    const row = locked.rows[0];
    if (!row) throw new LabelIngestionServiceError('INGESTION_NOT_FOUND', 'Label ingestion was not found.');
    if (row.state !== 'QUARANTINED' || Number(row.row_version) !== input.expectedRowVersion) throw new LabelIngestionServiceError('INGESTION_NOT_ACTIONABLE', 'This label changed or is no longer waiting for an order. Refresh and try again.');
    if (!row.staged_object_key) throw new LabelIngestionServiceError('INGESTION_NOT_ACTIONABLE', 'This label has no stored PDF yet.');
    if (!row.tracking_number_raw || !row.tracking_number_normalized) throw new LabelIngestionServiceError('INGESTION_NOT_ACTIONABLE', 'No tracking number was read from this label — print it unpaired instead.');
    const order = await client.query<{ account_source: string | null; order_id: string | null }>(`SELECT account_source, order_id FROM orders WHERE organization_id=$1 AND id=$2`, [organizationId, input.orderId]);
    const target = order.rows[0];
    if (!target?.account_source?.trim() || !target.order_id?.trim()) throw new LabelIngestionServiceError('INGESTION_NOT_ACTIONABLE', 'That order has no channel and order number to pair to.');
    const logical = await client.query<{ id: number }>(`SELECT id FROM orders WHERE organization_id=$1 AND account_source=$2 AND order_id=$3 ORDER BY id ASC`, [organizationId, target.account_source, target.order_id]);
    const orderIds = logical.rows.map((entry) => Number(entry.id));
    const evidence: ParsedLabelEvidence = { parserVersion: row.parser_version ?? 'operator', cycleforgeReference: null, marketplaceOrderId: target.order_id, accountSource: target.account_source, trackingNumberRaw: row.tracking_number_raw, trackingNumberNormalized: row.tracking_number_normalized, carrier: row.carrier, multiPackageEvidence: false, shipToName: row.detected_ship_to_name ?? null };
    const matchedRow = await updateMatched(client, organizationId, ingestionId, row.staged_object_key, evidence, { accountSource: target.account_source, marketplaceOrderId: target.order_id, matchMethod: 'OPERATOR_CONFIRMED', cycleforgeReference: null }, orderIds[0]!, { state: 'QUARANTINED', rowVersion: input.expectedRowVersion });
    if (!matchedRow) throw new LabelIngestionServiceError('INGESTION_NOT_ACTIONABLE', 'This label changed while pairing. Refresh and try again.');
    await client.query(`INSERT INTO audit_logs (actor_staff_id, organization_id, source, action, entity_type, entity_id, after_data, metadata) VALUES ($1, $2, 'label-ingestion', 'label_ingestion.order_confirmed', 'label_ingestion', $3, $4::jsonb, $5::jsonb)`, [input.actorStaffId, organizationId, String(ingestionId), JSON.stringify({ state: 'MATCHED', matchMethod: 'OPERATOR_CONFIRMED', rowVersion: Number(matchedRow.row_version) }), JSON.stringify({ order_ids: orderIds, quarantine_reason_code: row.quarantine_reason_code, ship_to_name: row.detected_ship_to_name ?? null })]);
    return { row: matchedRow, orderIds, tracking: row.tracking_number_raw, carrier: row.carrier, shipToName: row.detected_ship_to_name ?? null };
  });
  try { await dependencies.attachTracking({ organizationId, orderIds: settled.orderIds, trackingNumber: settled.tracking, carrier: settled.carrier }); }
  catch (error) { console.warn(`[label-ingestion] ${ingestionId}: confirmed, tracking not attached:`, error); }

  const repaired: PublicLabelIngestion[] = [];
  if (settled.shipToName) {
    const buyer = normalizeBuyerName(settled.shipToName);
    const waiting = await tenantQuery<{ id: string; detected_ship_to_name: string }>(organizationId, `SELECT id, detected_ship_to_name FROM label_ingestions WHERE organization_id=$1 AND state='QUARANTINED' AND quarantine_reason_code='BUYER_AMBIGUOUS' AND detected_ship_to_name IS NOT NULL AND id <> $2 ORDER BY observed_at ASC, id ASC`, [organizationId, ingestionId]);
    for (const sibling of waiting.rows) {
      if (!sameBuyer(buyer, normalizeBuyerName(sibling.detected_ship_to_name))) continue;
      const retried = await retryLabelIngestion(organizationId, Number(sibling.id));
      if (retried.state === 'MATCHED') repaired.push(retried);
    }
  }
  return { ingestion: publicRow(settled.row), repaired };
}

/**
 * The operator's own evidence for filing a label by hand (`file-on-order`),
 * written before the ordinary confirm → apply: a tracking number TYPED for a
 * label none was read from (raw + `normalizeTrackingNumber`, carrier), and/or
 * releasing a MATCHED — never APPLIED — label from the order the resolver
 * picked, so the operator's order governs. Leaves the row QUARANTINED under
 * its row version and audits `label_ingestion.operator_entered`.
 */
export async function recordOperatorLabelEvidence(input: {
  organizationId: OrgId;
  actorStaffId: number;
  ingestionId: number;
  expectedRowVersion: number;
  tracking: { raw: string; carrier: string | null } | null;
  /** Release a MATCHED row from its resolved order. */
  release: boolean;
}): Promise<PublicLabelIngestion> {
  const { organizationId, ingestionId } = input;
  const raw = input.tracking?.raw.trim() ?? null;
  const normalized = raw ? normalizeTrackingNumber(raw) : null;
  if (input.tracking && !normalized) throw new LabelIngestionServiceError('INGESTION_NOT_ACTIONABLE', 'That is not a tracking number.');
  return withTenantTransaction(organizationId, async (client) => {
    const locked = await client.query<LedgerRow>(`SELECT ${ledgerColumns} FROM label_ingestions WHERE organization_id=$1 AND id=$2 FOR UPDATE`, [organizationId, ingestionId]);
    const row = locked.rows[0];
    if (!row) throw new LabelIngestionServiceError('INGESTION_NOT_FOUND', 'Label ingestion was not found.');
    if (Number(row.row_version) !== input.expectedRowVersion) throw new LabelIngestionServiceError('INGESTION_NOT_ACTIONABLE', 'This label changed. Refresh and try again.');
    const releasable = row.state === 'MATCHED' && input.release;
    if (row.state !== 'QUARANTINED' && !releasable) throw new LabelIngestionServiceError('INGESTION_NOT_ACTIONABLE', 'Only a label still waiting for its order can take the operator’s evidence.');
    if (normalized && row.tracking_number_normalized) throw new LabelIngestionServiceError('INGESTION_NOT_ACTIONABLE', `This label already carries tracking ${row.tracking_number_raw}.`);
    if (!normalized && !releasable) return publicRow(row);
    const updated = await client.query<LedgerRow>(
      `UPDATE label_ingestions
          SET state='QUARANTINED', match_method=NULL, matched_order_id=NULL,
              quarantine_reason_code=COALESCE(quarantine_reason_code, 'AMBIGUOUS_ORDER_MATCH'),
              tracking_number_raw=COALESCE($3::text, tracking_number_raw),
              tracking_number_normalized=COALESCE($4::text, tracking_number_normalized),
              carrier=CASE WHEN $3::text IS NULL THEN carrier ELSE $5::text END,
              row_version=row_version+1
        WHERE organization_id=$1 AND id=$2 AND row_version=$6
        RETURNING ${ledgerColumns}`,
      [organizationId, ingestionId, normalized ? raw : null, normalized, input.tracking?.carrier ?? null, input.expectedRowVersion],
    );
    const next = updated.rows[0];
    if (!next) throw new LabelIngestionServiceError('INGESTION_NOT_ACTIONABLE', 'This label changed. Refresh and try again.');
    await client.query(
      `INSERT INTO audit_logs (actor_staff_id, organization_id, source, action, entity_type, entity_id, before_data, after_data, metadata)
       VALUES ($1, $2, 'label-ingestion', 'label_ingestion.operator_entered', 'label_ingestion', $3, $4::jsonb, $5::jsonb, $6::jsonb)`,
      [
        input.actorStaffId,
        organizationId,
        String(ingestionId),
        JSON.stringify({ state: row.state, trackingNumberRaw: row.tracking_number_raw, carrier: row.carrier, matchedOrderId: row.matched_order_id == null ? null : Number(row.matched_order_id), rowVersion: Number(row.row_version) }),
        JSON.stringify({ state: next.state, trackingNumberRaw: next.tracking_number_raw, carrier: next.carrier, matchedOrderId: null, rowVersion: Number(next.row_version) }),
        JSON.stringify({ typed_tracking: normalized != null, released_from_order_id: releasable && row.matched_order_id != null ? Number(row.matched_order_id) : null }),
      ],
    );
    return publicRow(next);
  });
}
