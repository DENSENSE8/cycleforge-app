import { z } from 'zod';
import {
  LABEL_INGESTION_STATES,
  LABEL_MATCH_METHODS,
  LABEL_QUARANTINE_REASON_CODES,
} from './types';

/** The bounded manual-upload contract. Tenant, actor, device and source are server-owned. */
export const MAX_LABEL_PDF_BYTES = 5 * 1024 * 1024;
export const MAX_LABEL_PDF_PAGES = 10;
export const MAX_LABEL_EXTRACTED_TEXT_CHARS = 32 * 1024;
export const MAX_LABEL_PARSE_MS = 5_000;
export const LABEL_PARSER_VERSION = 'v2.0.0';

export const labelIngestionUploadFieldsSchema = z.object({
  clientEventId: z.uuid(),
  observedAt: z.string().datetime({ offset: true }),
  sha256: z.string().regex(/^[0-9a-f]{64}$/).optional(),
}).strict();

export const labelIngestionApplyBodySchema = z.object({
  expectedRowVersion: z.number().int().min(0).max(2_147_483_647),
}).strict();

/** `POST /api/v1/label-ingestions/{id}/confirm-order` — the operator's answer to a quarantined label. */
export const labelIngestionConfirmOrderBodySchema = z.object({
  orderId: z.number().int().positive().max(2_147_483_647),
  expectedRowVersion: z.number().int().min(0).max(2_147_483_647),
}).strict();

/** `POST /api/v1/label-ingestions/{id}/unpair` — take a filed label back off its order; `remove` then deletes it. */
export const labelIngestionUnpairBodySchema = z.object({
  expectedRowVersion: z.number().int().min(0).max(2_147_483_647),
  remove: z.boolean().optional(),
}).strict();

export const labelIngestionListQuerySchema = z.object({
  state: z.enum(LABEL_INGESTION_STATES).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
}).strict();


/** Label-ingestion error codes, merged into the published v1 `Error.code` enum. */
export const LABEL_INGESTION_ERROR_CODES = [
  'INVALID_REQUEST',
  'INVALID_PDF',
  'PAYLOAD_TOO_LARGE',
  'CLIENT_EVENT_PAYLOAD_MISMATCH',
  'INGESTION_NOT_FOUND',
  'INGESTION_NOT_ACTIONABLE',
  'ROW_VERSION_CONFLICT',
  'INGESTION_APPLY_CONFLICT',
  'INGESTION_PROCESSING_FAILED',
  /** The DB still treats APPLIED as terminal (guard_label_ingestion_transition) — unpair needs its migration. */
  'LABEL_APPLIED_TERMINAL',
  /** `file-on-order` needs the operator's answer (tracking / collision / existing); `error.check` + `error.needs` say which. */
  'FILING_ANSWER_REQUIRED',
] as const;

export type LabelIngestionErrorCode = (typeof LABEL_INGESTION_ERROR_CODES)[number];

export function buildLabelIngestionComponents(): Record<string, unknown> {
  return {
    LabelIngestionState: { type: 'string', enum: LABEL_INGESTION_STATES },
    LabelMatchMethod: { type: 'string', enum: LABEL_MATCH_METHODS },
    LabelQuarantineReason: { type: 'string', enum: LABEL_QUARANTINE_REASON_CODES },
  };
}

/**
 * A deliberately small hand-authored projection of the Zod contract.  Keeping
 * it beside the runtime validators prevents a Swift generator from treating
 * tenant or actor identity as client input.
 */
export function buildLabelIngestionOpenApi(): Record<string, unknown> {
  const error = { $ref: '#/components/schemas/Error' };
  return {
    '/api/v1/label-ingestions': {
      get: { responses: { '200': { description: 'Tenant-scoped ledger list' }, '400': { description: 'Invalid query', content: { 'application/json': { schema: error } } } } },
      post: { requestBody: { required: true, content: { 'multipart/form-data': { schema: { type: 'object', required: ['file', 'clientEventId', 'observedAt'], properties: { file: { type: 'string', format: 'binary' }, clientEventId: { type: 'string', format: 'uuid' }, observedAt: { type: 'string', format: 'date-time' }, sha256: { type: 'string', pattern: '^[0-9a-f]{64}$' } } } } } }, responses: { '201': { description: 'Created or byte-idempotent replay' }, '400': { description: 'Rejected', content: { 'application/json': { schema: error } } } } },
    },
    '/api/v1/label-ingestions/{id}': { get: { parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer', minimum: 1 } }], responses: { '200': { description: 'Tenant-scoped ledger resource' }, '404': { description: 'Not found', content: { 'application/json': { schema: error } } } } } },
    '/api/v1/label-ingestions/{id}/apply': { post: { parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer', minimum: 1 } }], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['expectedRowVersion'], properties: { expectedRowVersion: { type: 'integer', minimum: 0 } } } } } }, responses: { '200': { description: 'Applied or idempotent replay' }, '409': { description: 'State or row-version conflict', content: { 'application/json': { schema: error } } } } } },
    '/api/v1/label-ingestions/{id}/retry': { post: { parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer', minimum: 1 } }], responses: { '200': { description: 'Reprocessed staged PDF' }, '409': { description: 'Not retryable', content: { 'application/json': { schema: error } } } } } },
    '/api/v1/label-ingestions/{id}/candidates': { get: { parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer', minimum: 1 } }], responses: { '200': { description: "The ship-to name read off the label and the open orders whose buyer it names (unlabeled first), each with its product lines" }, '404': { description: 'Not found', content: { 'application/json': { schema: error } } } } } },
    '/api/v1/label-ingestions/{id}/confirm-order': { post: { parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer', minimum: 1 } }], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['orderId', 'expectedRowVersion'], properties: { orderId: { type: 'integer', minimum: 1 }, expectedRowVersion: { type: 'integer', minimum: 0 } } } } } }, responses: { '200': { description: "Paired MATCHED (OPERATOR_CONFIRMED); `repaired` lists the buyer's other waiting labels the buyer-name rule then paired" }, '404': { description: 'Not found', content: { 'application/json': { schema: error } } }, '409': { description: 'Not quarantined, stale row version, no tracking, or order without channel/number', content: { 'application/json': { schema: error } } } } } },
    '/api/v1/label-ingestions/{id}/unpair-check': { get: { parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer', minimum: 1 } }], responses: { '200': { description: 'What an unpair takes off the order: the tracking that comes off and the scan-out on that tracking, if any' }, '404': { description: 'Not found', content: { 'application/json': { schema: error } } }, '409': { description: 'Not on an order', content: { 'application/json': { schema: error } } } } } },
    '/api/v1/label-ingestions/{id}/unpair': { post: { parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer', minimum: 1 } }], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['expectedRowVersion'], properties: { expectedRowVersion: { type: 'integer', minimum: 0 }, remove: { type: 'boolean' } } } } } }, responses: { '200': { description: 'Unpaired back to the waiting pool (QUARANTINED); `ingestion` is null when `remove` also deleted it' }, '404': { description: 'Not found', content: { 'application/json': { schema: error } } }, '409': { description: 'Stale row version, not on an order, or a unit moved on', content: { 'application/json': { schema: error } } } } } },
    '/api/v1/label-ingestions/{id}/unpair/undo': { post: { parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer', minimum: 1 } }], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['expectedRowVersion'], properties: { expectedRowVersion: { type: 'integer', minimum: 0 } } } } } }, responses: { '200': { description: "Put back exactly what the label's latest unpair took off; `ingestion` is the restored row" }, '404': { description: 'Not found', content: { 'application/json': { schema: error } } }, '409': { description: 'Changed since the unpair, nothing to undo, or its tracking is now on another order', content: { 'application/json': { schema: error } } } } } },
    '/api/v1/label-ingestions/{id}/file-check': { get: { parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer', minimum: 1 } }, { name: 'orderId', in: 'query', required: true, schema: { type: 'integer', minimum: 1 } }, { name: 'tracking', in: 'query', required: false, schema: { type: 'string', maxLength: 64 } }], responses: { '200': { description: 'What filing this label on that order would do: { tracking, carrier, source (label | typed | null), otherOrders[], orderTracking[], sameAlready }' }, '404': { description: 'Label or order not found', content: { 'application/json': { schema: error } } } } } },
    '/api/v1/label-ingestions/{id}/file-on-order': { post: { parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer', minimum: 1 } }], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['orderId', 'expectedRowVersion'], properties: { orderId: { type: 'integer', minimum: 1 }, expectedRowVersion: { type: 'integer', minimum: 0 }, tracking: { type: 'string', maxLength: 64 }, carrier: { type: 'string', maxLength: 32 }, withoutTracking: { type: 'boolean' }, collision: { type: 'string', enum: ['move', 'keep'] }, existing: { type: 'string', enum: ['replace', 'add'] } } } } } }, responses: { '200': { description: 'Filed: applied on the order (`mode: applied`), or stored as its shipping-label document with no tracking (`mode: withoutTracking`)' }, '404': { description: 'Label or order not found', content: { 'application/json': { schema: error } } }, '409': { description: 'FILING_ANSWER_REQUIRED (error.check + error.needs), stale row version, filed elsewhere, or an apply conflict', content: { 'application/json': { schema: error } } } } } },
  };
}
