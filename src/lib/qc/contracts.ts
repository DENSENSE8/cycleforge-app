/**
 * `/api/qc/{sessions,readings,codes,procedures}` — the QC workspace contract the bench UI and the
 * diagnostic hub code against. Client-safe: Zod only. The same schemas validate requests on the
 * server and parse responses on the client.
 *
 * Envelope: success → `{ data: <payload> }`; failure → `{ error: string }` with 400/404/409.
 *
 * Tables: `qc_sessions` (bench sessions — unit TEST/REPAIR sessions and the repair-service ticket
 * timer), `diagnostic_codes` (per-org code catalog), `diagnostic_readings` (hub + manual readings on
 * a unit, optionally inside a session), `qc_procedure_versions` (published snapshots of a SKU's or
 * category's `qc_check_templates` steps; `tech_verifications.procedure_version_id` records which one
 * a unit's checklist step was answered against).
 *
 * Permissions: reads `tech.view`; bench writes (sessions, readings) `tech.qc_pass`; catalog +
 * procedure authoring `sku_stock.manage` (same gate as QC step authoring).
 */

import { z } from 'zod';

const id = z.number().int().positive();
const instant = z.string().datetime({ offset: true });
const queryId = z.coerce.number().int().positive();
const hubDeviceId = z.string().trim().min(1).max(128).describe('Stable id the hub reports for itself.');

// ── Vocabulary ──────────────────────────────────────────────────────────────

export const QC_SESSION_KINDS = ['TEST', 'REPAIR', 'REPAIR_SERVICE'] as const;
export type QcSessionKind = (typeof QC_SESSION_KINDS)[number];

/** Kinds opened on a serial unit through `/api/qc/sessions`. REPAIR_SERVICE is the repair-ticket timer (`/api/repair/bench-sessions`). */
export const QC_UNIT_SESSION_KINDS = ['TEST', 'REPAIR'] as const;

export const QC_SESSION_OUTCOMES = ['PASS', 'FAIL', 'RETEST', 'REPAIRED', 'NOT_REPAIRED', 'ABANDONED'] as const;
export type QcSessionOutcome = (typeof QC_SESSION_OUTCOMES)[number];

/**
 * Which outcomes close which kind. A session outcome summarizes the bench time; it is NOT a unit
 * verdict — verdicts go through `POST /api/serial-units/[id]/test` (recordTestVerdict) only.
 */
export const QC_OUTCOMES_BY_KIND: Record<QcSessionKind, readonly QcSessionOutcome[]> = {
  TEST: ['PASS', 'FAIL', 'RETEST', 'ABANDONED'],
  REPAIR: ['REPAIRED', 'NOT_REPAIRED', 'ABANDONED'],
  REPAIR_SERVICE: ['REPAIRED', 'NOT_REPAIRED', 'ABANDONED'],
};

export const DIAGNOSTIC_READING_SOURCES = ['HUB', 'MANUAL'] as const;
export type DiagnosticReadingSource = (typeof DIAGNOSTIC_READING_SOURCES)[number];

export const DIAGNOSTIC_SEVERITIES = ['INFO', 'WARNING', 'CRITICAL'] as const;
export type DiagnosticSeverity = (typeof DIAGNOSTIC_SEVERITIES)[number];

/** Reading kinds / codes are stored upper-case (`battery_health` → `BATTERY_HEALTH`). */
const token = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]*$/, 'letters, digits, _ . : - only')
    .transform((s) => s.toUpperCase());

export const QC_READINGS_BATCH_MAX = 200;

// ── Requests ────────────────────────────────────────────────────────────────

export const qcSessionStartBodySchema = z
  .object({
    kind: z.enum(QC_UNIT_SESSION_KINDS),
    serialUnitId: id,
    locationId: id.nullable().optional().describe('The bench (a DESK location) the session runs at.'),
    hubDeviceId: hubDeviceId.nullable().optional(),
  })
  .strict();
export type QcSessionStartBody = z.input<typeof qcSessionStartBodySchema>;

export const qcSessionEndBodySchema = z
  .object({
    outcome: z.enum(QC_SESSION_OUTCOMES).nullable().optional(),
    notes: z.string().trim().max(2000).nullable().optional(),
  })
  .strict();
export type QcSessionEndBody = z.input<typeof qcSessionEndBodySchema>;

export const qcSessionsQuerySchema = z.object({ unitId: queryId });

export const diagnosticReadingInputSchema = z
  .object({
    clientEventId: z
      .string()
      .trim()
      .min(8)
      .max(128)
      .describe('Idempotency key, unique per org. A retried reading with the same key is a no-op replay.'),
    serialUnitId: id,
    qcSessionId: id.nullable().optional().describe('Session the reading was taken in; must be on the same unit.'),
    source: z.enum(DIAGNOSTIC_READING_SOURCES),
    kind: token(64).describe('What was read, e.g. ERROR_CODE, BATTERY_HEALTH, CYCLE_COUNT.'),
    code: token(64).nullable().optional().describe('Diagnostic code when the reading is one (joins diagnostic_codes.code).'),
    value: z.json().default({}).describe('Raw reading payload.'),
    readAt: instant.optional().describe('When the reading was taken (hub clock). Defaults to server now.'),
    hubDeviceId: hubDeviceId.nullable().optional(),
  })
  .strict();
export type DiagnosticReadingInput = z.input<typeof diagnosticReadingInputSchema>;

export const diagnosticReadingsBodySchema = z
  .object({ readings: z.array(diagnosticReadingInputSchema).min(1).max(QC_READINGS_BATCH_MAX) })
  .strict();
export type DiagnosticReadingsBody = z.input<typeof diagnosticReadingsBodySchema>;

export const diagnosticReadingsQuerySchema = z
  .object({ unitId: queryId.optional(), sessionId: queryId.optional() })
  .refine((q) => q.unitId != null || q.sessionId != null, 'unitId or sessionId is required');

export const diagnosticCodeUpsertBodySchema = z
  .object({
    code: token(64),
    deviceFamily: z
      .string()
      .trim()
      .min(1)
      .max(120)
      .nullable()
      .optional()
      .describe('sku_catalog.category the code belongs to; null = every family.'),
    meaning: z.string().trim().min(1).max(500),
    severity: z.enum(DIAGNOSTIC_SEVERITIES),
    repairIssueTemplateId: id.nullable().optional().describe('The repair issue this code usually means.'),
    active: z.boolean().optional(),
  })
  .strict();
export type DiagnosticCodeUpsertBody = z.input<typeof diagnosticCodeUpsertBodySchema>;

export const diagnosticCodesQuerySchema = z.object({
  family: z.string().trim().min(1).max(120).optional(),
  q: z.string().trim().min(1).max(120).optional(),
  includeInactive: z.enum(['1', 'true']).optional(),
});

export type QcProcedureScope = { skuCatalogId: number; category?: undefined } | { category: string; skuCatalogId?: undefined };

export const qcProcedurePublishBodySchema = z
  .object({
    skuCatalogId: id.optional(),
    category: z.string().trim().min(1).max(120).optional(),
    notes: z.string().trim().max(1000).nullable().optional(),
  })
  .strict()
  .refine((b) => (b.skuCatalogId == null) !== (b.category == null), 'exactly one of skuCatalogId or category');
export type QcProcedurePublishBody = z.input<typeof qcProcedurePublishBodySchema>;

export const qcProceduresQuerySchema = z
  .object({ skuCatalogId: queryId.optional(), category: z.string().trim().min(1).max(120).optional() })
  .refine((q) => (q.skuCatalogId == null) !== (q.category == null), 'exactly one of skuCatalogId or category');

// ── Responses (`data`) ──────────────────────────────────────────────────────

export const qcSessionSchema = z.object({
  id: z.number().int(),
  kind: z.enum(QC_SESSION_KINDS),
  serialUnitId: z.number().int().nullable(),
  repairServiceId: z.number().int().nullable(),
  locationId: z.number().int().nullable(),
  locationName: z.string().nullable(),
  staffId: z.number().int().nullable(),
  staffName: z.string().nullable(),
  hubDeviceId: z.string().nullable(),
  startedAt: z.string(),
  endedAt: z.string().nullable(),
  outcome: z.enum(QC_SESSION_OUTCOMES).nullable(),
  notes: z.string().nullable(),
});
export type QcSession = z.infer<typeof qcSessionSchema>;

export const qcSessionsSchema = z.object({
  sessions: z.array(qcSessionSchema).describe('Newest first.'),
  open: qcSessionSchema.nullable().describe("The caller's open session on the unit, if any."),
  serverNow: z.string().describe('Server clock — the reference for a running timer.'),
});
export type QcSessions = z.infer<typeof qcSessionsSchema>;

export const qcSessionWriteSchema = z.object({
  session: qcSessionSchema,
  changed: z.boolean().describe('false when Start reused the open session / End found it already ended.'),
  serverNow: z.string(),
});
export type QcSessionWrite = z.infer<typeof qcSessionWriteSchema>;

export const diagnosticReadingSchema = z.object({
  id: z.number().int(),
  qcSessionId: z.number().int().nullable(),
  serialUnitId: z.number().int(),
  source: z.enum(DIAGNOSTIC_READING_SOURCES),
  kind: z.string(),
  code: z.string().nullable(),
  value: z.json(),
  readAt: z.string(),
  hubDeviceId: z.string().nullable(),
  recordedByStaffId: z.number().int().nullable(),
  clientEventId: z.string(),
  /** Catalog match for `code` (family-specific row wins over the any-family row). */
  codeMeaning: z.string().nullable(),
  codeSeverity: z.enum(DIAGNOSTIC_SEVERITIES).nullable(),
  repairIssueTemplateId: z.number().int().nullable(),
  createdAt: z.string(),
});
export type DiagnosticReading = z.infer<typeof diagnosticReadingSchema>;

export const diagnosticReadingsWriteSchema = z.object({
  readings: z.array(diagnosticReadingSchema).describe('One per input, in input order (replays included).'),
  created: z.number().int(),
  replayed: z.number().int(),
});
export type DiagnosticReadingsWrite = z.infer<typeof diagnosticReadingsWriteSchema>;

export const diagnosticReadingsListSchema = z.object({ readings: z.array(diagnosticReadingSchema).describe('Newest read first.') });

export const diagnosticCodeSchema = z.object({
  id: z.number().int(),
  code: z.string(),
  deviceFamily: z.string().nullable(),
  meaning: z.string(),
  severity: z.enum(DIAGNOSTIC_SEVERITIES),
  repairIssueTemplateId: z.number().int().nullable(),
  repairIssueLabel: z.string().nullable(),
  active: z.boolean(),
  updatedAt: z.string(),
});
export type DiagnosticCode = z.infer<typeof diagnosticCodeSchema>;

export const diagnosticCodesSchema = z.object({ codes: z.array(diagnosticCodeSchema) });
export const diagnosticCodeWriteSchema = z.object({ code: diagnosticCodeSchema, created: z.boolean() });

export const qcProcedureStepSchema = z.object({
  stepId: z.number().int(),
  stepLabel: z.string(),
  stepType: z.string(),
  sortOrder: z.number().int(),
  valueKind: z.string().nullable(),
  valueUnit: z.string().nullable(),
  valueEnum: z.json().nullable(),
  passMin: z.number().nullable(),
  passMax: z.number().nullable(),
  failureModeId: z.number().int().nullable(),
});
export type QcProcedureStep = z.infer<typeof qcProcedureStepSchema>;

export const qcProcedureVersionSchema = z.object({
  id: z.number().int(),
  skuCatalogId: z.number().int().nullable(),
  category: z.string().nullable(),
  version: z.number().int(),
  publishedAt: z.string(),
  publishedBy: z.number().int().nullable(),
  publishedByName: z.string().nullable(),
  supersedesId: z.number().int().nullable(),
  notes: z.string().nullable(),
  steps: z.array(qcProcedureStepSchema),
});
export type QcProcedureVersion = z.infer<typeof qcProcedureVersionSchema>;

export const qcProceduresSchema = z.object({
  versions: z.array(qcProcedureVersionSchema).describe('Newest version first.'),
  current: qcProcedureVersionSchema.nullable(),
  /** true when the live published steps differ from `current` (an unpublished edit is in force). */
  dirty: z.boolean(),
  draftSteps: z.number().int().describe('Steps authored but not yet published.'),
});
export type QcProcedures = z.infer<typeof qcProceduresSchema>;

export const qcProcedurePublishSchema = z.object({
  version: qcProcedureVersionSchema,
  changed: z.boolean().describe('false when nothing changed since the current version (no new version cut).'),
  publishedDrafts: z.number().int(),
});
