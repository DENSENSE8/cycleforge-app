/** Build-request persistence: */

import { withTenantTransaction } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import type { PoolClient } from 'pg';
import { searchToolRegistry } from './dedupe';
import { triageBuildRequest, type DedupeOutcome, type TriageDecision } from './triage';
import type { ApprovalReasonCode, DecidedByKind } from './constants';

export interface SubmitBuildRequestInput {
  targetScope: string;
  prompt: string;
  requestedByStaffId: number | null;
  /** Optional double-submit guard; org-led unique in the DB. */
  idempotencyKey?: string | null;
}

export interface BuildRequestRecord {
  id: number;
  status: string;
  targetScope: string;
  prompt: string;
  exactReason: string | null;
  duplicateToolId: number | null;
  similarity: number | null;
  createdAt: string;
}

export interface SubmitBuildRequestResult {
  request: BuildRequestRecord;
  decision: TriageDecision;
  /** True when an existing row was returned for a repeated idempotency key. */
  replayed: boolean;
  /** Populated when the denial points at an existing tool, for the deep link. */
  duplicateTool: { id: number; toolKey: string; name: string; sourcePath: string | null } | null;
}

export interface ToolForgeDeps {
  dedupe: (orgId: OrgId, prompt: string) => Promise<DedupeOutcome>;
  tx: <T>(orgId: OrgId, fn: (client: PoolClient) => Promise<T>) => Promise<T>;
}

const defaultDeps: ToolForgeDeps = {
  dedupe: (orgId, prompt) => searchToolRegistry(orgId, prompt),
  tx: withTenantTransaction,
};

export async function submitBuildRequest(
  orgId: OrgId,
  input: SubmitBuildRequestInput,
  deps: Partial<ToolForgeDeps> = {},
): Promise<SubmitBuildRequestResult> {
  const { dedupe, tx } = { ...defaultDeps, ...deps };
  const idempotencyKey = input.idempotencyKey?.trim() || null;

  // ── 1. Land the pending row ────────────────────────────────────────────── ON CONFLICT on the org-led partial unique makes a…
  const inserted = await tx(orgId, async (client) => {
    const { rows } = await client.query(
      `INSERT INTO build_requests
         (organization_id, requested_by_staff_id, target_scope, prompt, status, idempotency_key)
       VALUES ($1, $2, $3, $4, 'pending_triage', $5)
       ON CONFLICT (organization_id, idempotency_key) WHERE idempotency_key IS NOT NULL
       DO UPDATE SET updated_at = now()
       RETURNING id, status, target_scope, prompt, exact_reason, duplicate_tool_id,
                 similarity, created_at, (xmax <> 0) AS was_existing`,
      [orgId, input.requestedByStaffId, input.targetScope, input.prompt, idempotencyKey],
    );
    return rows[0] as Record<string, unknown>;
  });

  const requestId = Number(inserted.id);

  // A replay of an already-triaged request must not be re-triaged: the
  // decision is a fact about that request, not something to recompute.
  if (inserted.was_existing === true && String(inserted.status) !== 'pending_triage') {
    const record = toRecord(inserted);
    return {
      request: record,
      decision: {
        decision: String(inserted.status) === 'denied' ? 'denied' : 'approved',
        reasonCode: (String(inserted.status) === 'denied' ? 'duplicate_tool' : 'approved_novel') as ApprovalReasonCode,
        exactReason: record.exactReason ?? '',
        duplicateToolId: record.duplicateToolId,
        similarity: record.similarity,
      },
      replayed: true,
      duplicateTool: null,
    };
  }

  // ── 2. Measure, with no connection held ──────────────────────────────────
  const outcome = await dedupe(orgId, input.prompt);

  // ── 3. Decide and record, atomically ─────────────────────────────────────
  const decision = triageBuildRequest(outcome);

  const finalized = await tx(orgId, async (client) => {
    const { rows } = await client.query(
      `UPDATE build_requests
          SET status = $1,
              exact_reason = $2,
              duplicate_tool_id = $3,
              similarity = $4,
              updated_at = now()
        WHERE organization_id = $5
          AND id = $6
      RETURNING id, status, target_scope, prompt, exact_reason, duplicate_tool_id,
                similarity, created_at`,
      [
        decision.decision === 'denied' ? 'denied' : 'approved',
        decision.exactReason,
        decision.duplicateToolId,
        decision.similarity,
        orgId,
        requestId,
      ],
    );

    await insertReview(client, orgId, {
      buildRequestId: requestId,
      decision: decision.decision,
      reasonCode: decision.reasonCode,
      exactReason: decision.exactReason,
      duplicateToolId: decision.duplicateToolId,
      similarity: decision.similarity,
      // The deterministic gate decided this one, not a model and not a person.
      decidedBy: 'system',
      decidedByStaffId: null,
    });

    let duplicateTool: SubmitBuildRequestResult['duplicateTool'] = null;
    if (decision.duplicateToolId != null) {
      const dup = await client.query(
        `SELECT id, tool_key, name, source_path
           FROM tool_registry
          WHERE organization_id = $1 AND id = $2`,
        [orgId, decision.duplicateToolId],
      );
      const d = dup.rows[0];
      if (d) {
        duplicateTool = {
          id: Number(d.id),
          toolKey: String(d.tool_key),
          name: String(d.name),
          sourcePath: d.source_path == null ? null : String(d.source_path),
        };
      }
    }

    return { row: rows[0] as Record<string, unknown>, duplicateTool };
  });

  return {
    request: toRecord(finalized.row),
    decision,
    replayed: false,
    duplicateTool: finalized.duplicateTool,
  };
}

export interface RecordReviewInput {
  buildRequestId: number;
  decision: 'approved' | 'denied';
  reasonCode: ApprovalReasonCode;
  exactReason: string;
  duplicateToolId: number | null;
  similarity: number | null;
  decidedBy: DecidedByKind;
  decidedByStaffId: number | null;
}

/** Append one decision to the ledger. */
export async function insertReview(
  client: PoolClient,
  orgId: OrgId,
  input: RecordReviewInput,
): Promise<number> {
  const { rows } = await client.query(
    `INSERT INTO approval_reviews
       (organization_id, build_request_id, decision, reason_code, exact_reason,
        duplicate_tool_id, similarity, decided_by, decided_by_staff_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING id`,
    [
      orgId,
      input.buildRequestId,
      input.decision,
      input.reasonCode,
      input.exactReason,
      input.duplicateToolId,
      input.similarity,
      input.decidedBy,
      input.decidedByStaffId,
    ],
  );
  return Number(rows[0].id);
}

/** Record a decision made by a model or an operator, outside the automatic gate. */
export async function recordApprovalDecision(
  orgId: OrgId,
  input: RecordReviewInput,
  deps: Partial<Pick<ToolForgeDeps, 'tx'>> = {},
): Promise<{ ok: true; reviewId: number } | { ok: false; error: string }> {
  const tx = deps.tx ?? defaultDeps.tx;
  return tx(orgId, async (client) => {
    const { rows } = await client.query(
      `SELECT id, status, duplicate_tool_id
         FROM build_requests
        WHERE organization_id = $1 AND id = $2
        FOR UPDATE`,
      [orgId, input.buildRequestId],
    );
    const req = rows[0];
    if (!req) {
      return { ok: false as const, error: `Build request ${input.buildRequestId} not found` };
    }
    if (req.duplicate_tool_id != null && input.decision === 'approved') {
      return {
        ok: false as const,
        error:
          `Build request ${input.buildRequestId} was denied as a duplicate of tool ` +
          `${req.duplicate_tool_id} and cannot be approved. Withdraw the duplicate link first.`,
      };
    }

    const reviewId = await insertReview(client, orgId, input);
    await client.query(
      `UPDATE build_requests
          SET status = $1, exact_reason = $2, updated_at = now()
        WHERE organization_id = $3 AND id = $4`,
      [input.decision === 'denied' ? 'denied' : 'approved', input.exactReason, orgId, input.buildRequestId],
    );
    return { ok: true as const, reviewId };
  });
}

function toRecord(row: Record<string, unknown>): BuildRequestRecord {
  return {
    id: Number(row.id),
    status: String(row.status),
    targetScope: String(row.target_scope),
    prompt: String(row.prompt),
    exactReason: row.exact_reason == null ? null : String(row.exact_reason),
    duplicateToolId: row.duplicate_tool_id == null ? null : Number(row.duplicate_tool_id),
    similarity: row.similarity == null ? null : Number(row.similarity),
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
  };
}
