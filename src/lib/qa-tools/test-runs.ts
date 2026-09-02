import { randomUUID } from 'node:crypto';
import { tenantQuery } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';

export const QA_RUN_ACTIONS = ['health_check', 'fixture_reseed', 'fixture_reset', 'webhook_replay'] as const;
export type QaRunAction = (typeof QA_RUN_ACTIONS)[number];

export const QA_RUN_STATUSES = ['requested', 'running', 'passed', 'failed'] as const;
export type QaRunStatus = (typeof QA_RUN_STATUSES)[number];

export interface QaTestRun {
  id: string;
  organizationId: OrgId;
  actorStaffId: number;
  action: QaRunAction;
  scenario: string;
  status: QaRunStatus;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export function createQaTestRunId(): string {
  return `qtr_${randomUUID()}`;
}

/**
 * QA traces are intentionally allow-listed. Never persist request headers,
 * tokens, credentials, raw provider payloads, or arbitrary client metadata.
 */
export function sanitizeQaRunMetadata(input: Record<string, unknown>): Record<string, unknown> {
  const safe: Record<string, unknown> = {};
  if (typeof input.provider === 'string') safe.provider = input.provider.slice(0, 80);
  if (typeof input.durationMs === 'number' && Number.isFinite(input.durationMs)) {
    safe.durationMs = Math.max(0, Math.round(input.durationMs));
  }
  if (typeof input.requestCount === 'number' && Number.isFinite(input.requestCount)) {
    safe.requestCount = Math.max(0, Math.round(input.requestCount));
  }
  if (typeof input.correlationId === 'string') safe.correlationId = input.correlationId.slice(0, 120);
  if (typeof input.ok === 'boolean') safe.ok = input.ok;
  if (typeof input.connected === 'boolean') safe.connected = input.connected;
  if (typeof input.httpStatus === 'number' && Number.isInteger(input.httpStatus)) {
    safe.httpStatus = Math.min(Math.max(input.httpStatus, 100), 599);
  }
  return safe;
}

function mapQaRun(row: {
  id: string;
  organization_id: string;
  actor_staff_id: number;
  action: QaRunAction;
  scenario: string;
  status: QaRunStatus;
  metadata: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}): QaTestRun {
  return {
    id: row.id,
    organizationId: row.organization_id,
    actorStaffId: row.actor_staff_id,
    action: row.action,
    scenario: row.scenario,
    status: row.status,
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listQaTestRuns(orgId: OrgId, limit = 25): Promise<QaTestRun[]> {
  const boundedLimit = Math.min(Math.max(Math.trunc(limit), 1), 100);
  const result = await tenantQuery(
    orgId,
    `SELECT id, organization_id, actor_staff_id, action, scenario, status,
            metadata, created_at, updated_at
       FROM qa_test_runs
      WHERE organization_id = $1
      ORDER BY created_at DESC
      LIMIT $2`,
    [orgId, boundedLimit],
  );
  return result.rows.map((row) => mapQaRun(row as Parameters<typeof mapQaRun>[0]));
}

export async function createQaTestRun(input: {
  organizationId: OrgId;
  actorStaffId: number;
  action: QaRunAction;
  scenario: string;
  status?: QaRunStatus;
  metadata?: Record<string, unknown>;
}): Promise<QaTestRun> {
  const result = await tenantQuery(
    input.organizationId,
    `INSERT INTO qa_test_runs
       (id, organization_id, actor_staff_id, action, scenario, status, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
     RETURNING id, organization_id, actor_staff_id, action, scenario, status,
               metadata, created_at, updated_at`,
    [
      createQaTestRunId(),
      input.organizationId,
      input.actorStaffId,
      input.action,
      input.scenario,
      input.status ?? 'requested',
      JSON.stringify(sanitizeQaRunMetadata(input.metadata ?? {})),
    ],
  );
  return mapQaRun(result.rows[0] as Parameters<typeof mapQaRun>[0]);
}

export async function updateQaTestRun(
  orgId: OrgId,
  runId: string,
  status: QaRunStatus,
  metadata: Record<string, unknown> = {},
): Promise<QaTestRun> {
  const result = await tenantQuery(
    orgId,
    `UPDATE qa_test_runs
        SET status = $3::text,
            metadata = metadata || $4::jsonb,
            updated_at = NOW()
      WHERE organization_id = $1 AND id = $2
      RETURNING id, organization_id, actor_staff_id, action, scenario, status,
                metadata, created_at, updated_at`,
    [orgId, runId, status, JSON.stringify(sanitizeQaRunMetadata(metadata))],
  );
  const row = result.rows[0];
  if (!row) throw new Error('QA test run not found');
  return mapQaRun(row as Parameters<typeof mapQaRun>[0]);
}
