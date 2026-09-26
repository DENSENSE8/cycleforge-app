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
export const LABEL_PARSER_VERSION = 'v1.0.0';

export const labelIngestionUploadFieldsSchema = z.object({
  clientEventId: z.uuid(),
  observedAt: z.string().datetime({ offset: true }),
  sha256: z.string().regex(/^[0-9a-f]{64}$/).optional(),
}).strict();

export const labelIngestionApplyBodySchema = z.object({
  expectedRowVersion: z.number().int().min(0).max(2_147_483_647),
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
  };
}
