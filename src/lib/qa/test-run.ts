/**
 * QA test-run ledger — durable run ids and redacted traces.
 *
 * A useful log record looks like:
 *   provider: ebay  operation: importOrders  status: 429  durationMs: 812
 *   requestHash: …  idempotencyKey: …  errorClass: ProviderRateLimited
 * Never the raw credential-bearing request.
 */

import { withTenantTransaction } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import { redactRecord } from './redact';
import { generateTestRunId } from './test-run-id';

export { generateTestRunId, hashPayload } from './test-run-id';

export type QaRunKind =
  | 'health_check'
  | 'dry_run'
  | 'fixture_reset'
  | 'fixture_reseed'
  | 'failure_inject'
  | 'webhook_replay'
  | 'job_control'
  | 'role_preview'
  | 'scenario';

export type QaRunStatus = 'running' | 'passed' | 'failed' | 'cancelled';

export interface QaTestRun {
  id: string;
  runId: string;
  kind: QaRunKind;
  status: QaRunStatus;
  scenarioId: string | null;
  connectionProvider: string | null;
  connectionScope: string | null;
  actorStaffId: number | null;
  startedAt: string;
  completedAt: string | null;
  providerRequestCount: number;
  internalWrites: number;
  jobsCreated: number;
  correlationId: string | null;
  result: Record<string, unknown>;
  errorClass: string | null;
}

export interface QaTestRunEvent {
  seq: number;
  at: string;
  provider: string | null;
  operation: string | null;
  httpStatus: number | null;
  durationMs: number | null;
  requestHash: string | null;
  idempotencyKey: string | null;
  errorClass: string | null;
  redacted: Record<string, unknown>;
}



interface StartRunInput {
  orgId: OrgId;
  staffId: number;
  kind: QaRunKind;
  scenarioId?: string | null;
  connectionProvider?: string | null;
  connectionScope?: string | null;
  correlationId?: string | null;
  runId?: string;
}

interface RunRow {
  id: string;
  run_id: string;
  kind: QaRunKind;
  status: QaRunStatus;
  scenario_id: string | null;
  connection_provider: string | null;
  connection_scope: string | null;
  actor_staff_id: number | null;
  started_at: Date;
  completed_at: Date | null;
  provider_request_count: number;
  internal_writes: number;
  jobs_created: number;
  correlation_id: string | null;
  result: Record<string, unknown> | null;
  error_class: string | null;
}

function mapRun(row: RunRow): QaTestRun {
  return {
    id: row.id,
    runId: row.run_id,
    kind: row.kind,
    status: row.status,
    scenarioId: row.scenario_id,
    connectionProvider: row.connection_provider,
    connectionScope: row.connection_scope,
    actorStaffId: row.actor_staff_id,
    startedAt: new Date(row.started_at).toISOString(),
    completedAt: row.completed_at ? new Date(row.completed_at).toISOString() : null,
    providerRequestCount: row.provider_request_count,
    internalWrites: row.internal_writes,
    jobsCreated: row.jobs_created,
    correlationId: row.correlation_id,
    result: row.result ?? {},
    errorClass: row.error_class,
  };
}

export async function startQaTestRun(input: StartRunInput): Promise<QaTestRun> {
  const runId = input.runId ?? generateTestRunId();
  return withTenantTransaction(input.orgId, async (client) => {
    const r = await client.query<RunRow>(
      `INSERT INTO qa_test_runs (
         organization_id, run_id, actor_staff_id, scenario_id,
         connection_provider, connection_scope, kind, status, correlation_id
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'running', $8)
       RETURNING id, run_id, kind, status, scenario_id, connection_provider, connection_scope,
                 actor_staff_id, started_at, completed_at, provider_request_count,
                 internal_writes, jobs_created, correlation_id, result, error_class`,
      [
        input.orgId,
        runId,
        input.staffId,
        input.scenarioId ?? null,
        input.connectionProvider ?? null,
        input.connectionScope ?? null,
        input.kind,
        input.correlationId ?? runId,
      ],
    );
    return mapRun(r.rows[0]!);
  });
}

export async function appendQaTestRunEvent(
  orgId: OrgId,
  runUuid: string,
  event: Omit<QaTestRunEvent, 'seq' | 'at' | 'idempotencyKey'> & {
    at?: Date;
    idempotencyKey?: string | null;
  },
): Promise<void> {
  const redacted = redactRecord(event.redacted);
  await withTenantTransaction(orgId, async (client) => {
    await client.query(
      `INSERT INTO qa_test_run_events (
         organization_id, run_uuid, seq, at, provider, operation, http_status,
         duration_ms, request_hash, idempotency_key, error_class, redacted
       )
       SELECT $1, $2,
              COALESCE((SELECT max(seq) FROM qa_test_run_events
                         WHERE organization_id = $1 AND run_uuid = $2), 0) + 1,
              $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb`,
      [
        orgId,
        runUuid,
        event.at ?? new Date(),
        event.provider,
        event.operation,
        event.httpStatus,
        event.durationMs,
        event.requestHash,
        event.idempotencyKey ?? null,
        event.errorClass,
        JSON.stringify(redacted),
      ],
    );
  });
}

export async function completeQaTestRun(
  orgId: OrgId,
  runUuid: string,
  patch: {
    status: Exclude<QaRunStatus, 'running'>;
    result?: unknown;
    errorClass?: string | null;
    providerRequestCount?: number;
    internalWrites?: number;
    jobsCreated?: number;
  },
): Promise<QaTestRun> {
  const result = redactRecord(patch.result ?? {});
  return withTenantTransaction(orgId, async (client) => {
    const r = await client.query<RunRow>(
      `UPDATE qa_test_runs
          SET status = $3,
              completed_at = now(),
              result = $4::jsonb,
              error_class = $5,
              provider_request_count = COALESCE($6, provider_request_count),
              internal_writes = COALESCE($7, internal_writes),
              jobs_created = COALESCE($8, jobs_created)
        WHERE organization_id = $1 AND id = $2
        RETURNING id, run_id, kind, status, scenario_id, connection_provider, connection_scope,
                  actor_staff_id, started_at, completed_at, provider_request_count,
                  internal_writes, jobs_created, correlation_id, result, error_class`,
      [
        orgId,
        runUuid,
        patch.status,
        JSON.stringify(result),
        patch.errorClass ?? null,
        patch.providerRequestCount ?? null,
        patch.internalWrites ?? null,
        patch.jobsCreated ?? null,
      ],
    );
    const row = r.rows[0];
    if (!row) throw new Error('qa_test_run not found');
    return mapRun(row);
  });
}

export async function listQaTestRuns(
  orgId: OrgId,
  opts: { limit?: number } = {},
): Promise<QaTestRun[]> {
  const limit = Math.max(1, Math.min(100, opts.limit ?? 40));
  return withTenantTransaction(orgId, async (client) => {
    const r = await client.query<RunRow>(
      `SELECT id, run_id, kind, status, scenario_id, connection_provider, connection_scope,
              actor_staff_id, started_at, completed_at, provider_request_count,
              internal_writes, jobs_created, correlation_id, result, error_class
         FROM qa_test_runs
        WHERE organization_id = $1
        ORDER BY started_at DESC
        LIMIT $2`,
      [orgId, limit],
    );
    return r.rows.map(mapRun);
  });
}

export async function getQaTestRun(
  orgId: OrgId,
  runId: string,
): Promise<{ run: QaTestRun; events: QaTestRunEvent[] } | null> {
  return withTenantTransaction(orgId, async (client) => {
    const r = await client.query<RunRow>(
      `SELECT id, run_id, kind, status, scenario_id, connection_provider, connection_scope,
              actor_staff_id, started_at, completed_at, provider_request_count,
              internal_writes, jobs_created, correlation_id, result, error_class
         FROM qa_test_runs
        WHERE organization_id = $1 AND run_id = $2
        LIMIT 1`,
      [orgId, runId],
    );
    const row = r.rows[0];
    if (!row) return null;
    const events = await client.query<{
      seq: number;
      at: Date;
      provider: string | null;
      operation: string | null;
      http_status: number | null;
      duration_ms: number | null;
      request_hash: string | null;
      idempotency_key: string | null;
      error_class: string | null;
      redacted: Record<string, unknown> | null;
    }>(
      `SELECT seq, at, provider, operation, http_status, duration_ms, request_hash,
              idempotency_key, error_class, redacted
         FROM qa_test_run_events
        WHERE organization_id = $1 AND run_uuid = $2
        ORDER BY seq ASC`,
      [orgId, row.id],
    );
    return {
      run: mapRun(row),
      events: events.rows.map((e) => ({
        seq: e.seq,
        at: new Date(e.at).toISOString(),
        provider: e.provider,
        operation: e.operation,
        httpStatus: e.http_status,
        durationMs: e.duration_ms,
        requestHash: e.request_hash,
        idempotencyKey: e.idempotency_key,
        errorClass: e.error_class,
        redacted: e.redacted ?? {},
      })),
    };
  });
}
