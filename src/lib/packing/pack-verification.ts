/** recordPackVerificationEvent — the single writer for pack_verification_events (docs/todo/packer-review-station-plan.md Phase 3). */

import { withTenantTransaction } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import {
  canTransitionPackVerification,
  isPackVerificationOutcome,
  type PackVerificationOutcome,
} from './pack-verification-outcomes';

export interface RecordPackVerificationInput {
  organizationId: OrgId;
  /** packer_logs.id — the parent whose verification outcome this records. */
  packerLogId: number;
  outcome: PackVerificationOutcome;
  detectedOrderId?: string | null;
  detectedTracking?: string | null;
  ocrConfidence?: number | null;
  /** EOD (Phase 5). */
  shelfBoxCount?: number | null;
  /** EOD (Phase 5). */
  expectedCount?: number | null;
  /** Required (non-empty) when outcome is REVIEW_FLAGGED. */
  reviewNote?: string | null;
  /** Packer (capture) or manager (review) staff id — stamped on row + ops_event. */
  verifiedByStaffId?: number | null;
  /** Idempotency key (a retry with the same key is a no-op). */
  clientEventId?: string | null;
  meta?: Record<string, unknown> | null;
}

type RecordPackVerificationResult =
  | { ok: true; id: number; outcome: PackVerificationOutcome; duplicate: boolean }
  | { ok: false; code: 'INVALID' | 'NOT_FOUND' | 'CONFLICT'; error: string; latest?: PackVerificationOutcome | null };

interface QueryResultLike {
  rows: Array<Record<string, unknown>>;
}
export interface PackVerificationQueryExecutor {
  query(text: string, params?: ReadonlyArray<unknown>): Promise<QueryResultLike>;
}
export interface RecordPackVerificationDeps {
  runTransaction: <T>(orgId: OrgId, fn: (client: PackVerificationQueryExecutor) => Promise<T>) => Promise<T>;
}

const defaultDeps: RecordPackVerificationDeps = {
  runTransaction: (orgId, fn) => withTenantTransaction(orgId, (client) => fn(client)),
};

/** Static input validation (before opening a transaction). Returns an error
 *  string, or null when the input is shaped correctly. */
function validate(input: RecordPackVerificationInput): string | null {
  if (!input.organizationId) return 'organizationId is required';
  if (!Number.isSafeInteger(input.packerLogId) || input.packerLogId <= 0) {
    return `invalid packerLogId ${input.packerLogId}`;
  }
  if (!isPackVerificationOutcome(input.outcome)) {
    return `unknown outcome "${input.outcome}"`;
  }
  if (input.outcome === 'REVIEW_FLAGGED' && !(input.reviewNote && input.reviewNote.trim().length > 0)) {
    return 'REVIEW_FLAGGED requires a non-empty reviewNote';
  }
  return null;
}

async function writeEvent(
  client: PackVerificationQueryExecutor,
  input: RecordPackVerificationInput,
): Promise<RecordPackVerificationResult> {
  const org = input.organizationId;
  const entityType = 'PACKER_LOG';
  const entityId = input.packerLogId;

  // 1. Parent must exist in this org; grab its shipment_id (soft denormalized
  //    query assist — the caller never passes it, we derive it here).
  const parent = await client.query(
    `SELECT id, shipment_id FROM packer_logs WHERE id = $1 AND organization_id = $2::uuid LIMIT 1`,
    [entityId, org],
  );
  if (parent.rows.length === 0) {
    return { ok: false, code: 'NOT_FOUND', error: `packer_log ${entityId} not found in org` };
  }
  const shipmentId = (parent.rows[0] as { shipment_id: number | string | null }).shipment_id ?? null;

  // 2. Idempotency: a prior row with this client_event_id short-circuits to a
  //    no-op replay regardless of the transition machine (the effect already
  //    landed once). NULL keys are never deduped.
  if (input.clientEventId) {
    const dup = await client.query(
      `SELECT id, outcome FROM pack_verification_events
        WHERE organization_id = $1::uuid AND client_event_id = $2 LIMIT 1`,
      [org, input.clientEventId],
    );
    if (dup.rows.length > 0) {
      const row = dup.rows[0] as { id: number | string; outcome: string };
      return { ok: true, id: Number(row.id), outcome: row.outcome as PackVerificationOutcome, duplicate: true };
    }
  }

  // 3. Read the current latest outcome and enforce the state machine.
  const latestRes = await client.query(
    `SELECT outcome FROM pack_verification_events
      WHERE organization_id = $1::uuid AND entity_type = $2 AND entity_id = $3::bigint
      ORDER BY created_at DESC, id DESC LIMIT 1`,
    [org, entityType, entityId],
  );
  const latest = (latestRes.rows[0] as { outcome: string } | undefined)?.outcome as
    | PackVerificationOutcome
    | undefined;
  const latestOutcome = latest ?? null;
  if (!canTransitionPackVerification(latestOutcome, input.outcome)) {
    return {
      ok: false,
      code: 'CONFLICT',
      error: `cannot record ${input.outcome} when latest outcome is ${latestOutcome ?? 'none'}`,
      latest: latestOutcome,
    };
  }

  // 4. Append the outcome row. ON CONFLICT DO NOTHING is a race backstop for the
  //    partial-unique client_event_id index (the step-2 SELECT already handled
  //    the common replay); on a lost race we re-read the winner and return it.
  const inserted = await client.query(
    `INSERT INTO pack_verification_events (
       organization_id, entity_type, entity_id, shipment_id, outcome,
       detected_order_id, detected_tracking, ocr_confidence,
       shelf_box_count, expected_count, verified_by_staff_id, review_note,
       client_event_id, meta
     ) VALUES (
       $1::uuid, $2, $3::bigint, $4::bigint, $5,
       $6, $7, $8::real,
       $9::int, $10::int, $11::int, $12,
       $13, $14::jsonb
     )
     ON CONFLICT (organization_id, client_event_id) WHERE client_event_id IS NOT NULL
       DO NOTHING
     RETURNING id, outcome`,
    [
      org,
      entityType,
      entityId,
      shipmentId,
      input.outcome,
      input.detectedOrderId ?? null,
      input.detectedTracking ?? null,
      input.ocrConfidence ?? null,
      input.shelfBoxCount ?? null,
      input.expectedCount ?? null,
      input.verifiedByStaffId ?? null,
      input.reviewNote ?? null,
      input.clientEventId ?? null,
      JSON.stringify(input.meta ?? {}),
    ],
  );

  if (inserted.rows.length === 0) {
    // Lost the client_event_id race — the concurrent winner's row is the truth.
    const winner = await client.query(
      `SELECT id, outcome FROM pack_verification_events
        WHERE organization_id = $1::uuid AND client_event_id = $2 LIMIT 1`,
      [org, input.clientEventId],
    );
    if (winner.rows.length > 0) {
      const row = winner.rows[0] as { id: number | string; outcome: string };
      return { ok: true, id: Number(row.id), outcome: row.outcome as PackVerificationOutcome, duplicate: true };
    }
    return { ok: false, code: 'CONFLICT', error: 'insert conflicted without a matching row' };
  }

  const row = inserted.rows[0] as { id: number | string; outcome: string };
  const id = Number(row.id);

  // 5. Same-tx ops_events spine emission (prefer the event spine over a new SAL writer — plan §3c).
  await client.query(
    `INSERT INTO ops_events (
       organization_id, occurred_at, event_type, entity_type, entity_id,
       actor_staff_id, client_event_id, workflow_node_id, payload
     ) VALUES (
       $1::uuid, NOW(), 'pack_verification_recorded', 'other', $2::bigint,
       $3::int, $4, NULL, $5::jsonb
     )
     ON CONFLICT (client_event_id) DO NOTHING`,
    [
      org,
      entityId,
      input.verifiedByStaffId ?? null,
      `pack-verification:${id}`,
      JSON.stringify({
        verificationId: id,
        outcome: input.outcome,
        detectedTracking: input.detectedTracking ?? null,
        detectedOrderId: input.detectedOrderId ?? null,
      }),
    ],
  );

  return { ok: true, id, outcome: input.outcome, duplicate: false };
}

/**
 * Record one packer verification / review outcome. Validation failures return
 * `{ ok: false, code }` (never throw); DB errors propagate to the caller's
 * try/catch (the route maps them to 500).
 */
export async function recordPackVerificationEvent(
  input: RecordPackVerificationInput,
  deps: RecordPackVerificationDeps = defaultDeps,
): Promise<RecordPackVerificationResult> {
  const invalid = validate(input);
  if (invalid) return { ok: false, code: 'INVALID', error: invalid };
  return deps.runTransaction(input.organizationId, (client) => writeEvent(client, input));
}
