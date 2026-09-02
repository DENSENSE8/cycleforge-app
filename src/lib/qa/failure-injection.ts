/**
 * Org-scoped, auto-expiring provider failure injections.
 *
 * Applied at the integration adapter / health-check boundary. Never used to
 * randomly corrupt database state. Consume-on-read so a "next request" profile
 * cannot linger past remaining_uses / expires_at.
 */

import { withTenantTransaction } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';

import { FAILURE_PROFILES, type FailureProfile } from './failure-profiles';

export { FAILURE_PROFILES, type FailureProfile };

export interface FailureInjection {
  id: string;
  provider: string;
  scope: string | null;
  profile: FailureProfile;
  httpStatus: number | null;
  retryAfterSeconds: number | null;
  remainingUses: number;
  expiresAt: string;
  createdAt: string;
  notes: string | null;
}

export interface ConsumedInjection {
  id: string;
  provider: string;
  profile: FailureProfile;
  httpStatus: number | null;
  retryAfterSeconds: number | null;
  errorClass: string;
  message: string;
}

const PROFILE_HTTP: Record<FailureProfile, number | null> = {
  timeout: null,
  http_400: 400,
  http_401: 401,
  http_403: 403,
  http_409: 409,
  http_429: 429,
  http_500: 500,
  malformed: 200,
  partial: 200,
  delayed: 200,
  duplicate_callback: 200,
};

const PROFILE_CLASS: Record<FailureProfile, string> = {
  timeout: 'ProviderTimeout',
  http_400: 'ProviderBadRequest',
  http_401: 'ProviderUnauthorized',
  http_403: 'ProviderForbidden',
  http_409: 'ProviderConflict',
  http_429: 'ProviderRateLimited',
  http_500: 'ProviderUnavailable',
  malformed: 'ProviderMalformedPayload',
  partial: 'ProviderPartialResponse',
  delayed: 'ProviderDelayedResponse',
  duplicate_callback: 'ProviderDuplicateCallback',
};

interface InjectionRow {
  id: string;
  provider: string;
  scope: string | null;
  profile: FailureProfile;
  http_status: number | null;
  retry_after_seconds: number | null;
  remaining_uses: number;
  expires_at: Date;
  created_at: Date;
  notes: string | null;
}

function mapRow(row: InjectionRow): FailureInjection {
  return {
    id: row.id,
    provider: row.provider,
    scope: row.scope,
    profile: row.profile,
    httpStatus: row.http_status,
    retryAfterSeconds: row.retry_after_seconds,
    remainingUses: row.remaining_uses,
    expiresAt: new Date(row.expires_at).toISOString(),
    createdAt: new Date(row.created_at).toISOString(),
    notes: row.notes,
  };
}

function describe(profile: FailureProfile, httpStatus: number | null, retryAfter: number | null): string {
  if (profile === 'timeout') return 'Injected network timeout';
  if (profile === 'http_429') {
    return `Injected HTTP 429 (Retry-After: ${retryAfter ?? 30}s)`;
  }
  if (httpStatus) return `Injected HTTP ${httpStatus}`;
  return `Injected ${profile}`;
}

export async function listFailureInjections(orgId: OrgId): Promise<FailureInjection[]> {
  return withTenantTransaction(orgId, async (client) => {
    const r = await client.query<InjectionRow>(
      `SELECT id, provider, scope, profile, http_status, retry_after_seconds,
              remaining_uses, expires_at, created_at, notes
         FROM qa_failure_injections
        WHERE organization_id = $1
          AND expires_at > now()
          AND remaining_uses > 0
        ORDER BY created_at DESC`,
      [orgId],
    );
    return r.rows.map(mapRow);
  });
}

export async function createFailureInjection(input: {
  orgId: OrgId;
  staffId: number;
  provider: string;
  scope?: string | null;
  profile: FailureProfile;
  retryAfterSeconds?: number | null;
  remainingUses?: number;
  ttlSeconds?: number;
  notes?: string | null;
}): Promise<FailureInjection> {
  const ttl = Math.max(30, Math.min(60 * 60, input.ttlSeconds ?? 15 * 60));
  const httpStatus = PROFILE_HTTP[input.profile];
  const remaining = Math.max(1, Math.min(20, input.remainingUses ?? 1));
  return withTenantTransaction(input.orgId, async (client) => {
    const r = await client.query<InjectionRow>(
      `INSERT INTO qa_failure_injections (
         organization_id, provider, scope, profile, http_status, retry_after_seconds,
         remaining_uses, expires_at, created_by_staff_id, notes
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, now() + ($8 || ' seconds')::interval, $9, $10)
       RETURNING id, provider, scope, profile, http_status, retry_after_seconds,
                 remaining_uses, expires_at, created_at, notes`,
      [
        input.orgId,
        input.provider,
        input.scope ?? null,
        input.profile,
        httpStatus,
        input.retryAfterSeconds ?? (input.profile === 'http_429' ? 30 : null),
        remaining,
        String(ttl),
        input.staffId,
        input.notes ?? null,
      ],
    );
    return mapRow(r.rows[0]!);
  });
}

export async function clearFailureInjection(orgId: OrgId, id: string): Promise<boolean> {
  return withTenantTransaction(orgId, async (client) => {
    const r = await client.query(
      `UPDATE qa_failure_injections
          SET remaining_uses = 0, expires_at = now()
        WHERE organization_id = $1 AND id = $2`,
      [orgId, id],
    );
    return (r.rowCount ?? 0) > 0;
  });
}

export async function clearAllFailureInjections(orgId: OrgId): Promise<number> {
  return withTenantTransaction(orgId, async (client) => {
    const r = await client.query(
      `UPDATE qa_failure_injections
          SET remaining_uses = 0, expires_at = now()
        WHERE organization_id = $1 AND remaining_uses > 0 AND expires_at > now()`,
      [orgId],
    );
    return r.rowCount ?? 0;
  });
}

/**
 * Consume the next matching injection for this provider (if any). Adapters and
 * the connection-health checker call this instead of corrupting state.
 */
export async function consumeFailureInjection(
  orgId: OrgId,
  provider: string,
  scope?: string | null,
): Promise<ConsumedInjection | null> {
  return withTenantTransaction(orgId, async (client) => {
    const r = await client.query<InjectionRow>(
      `SELECT id, provider, scope, profile, http_status, retry_after_seconds,
              remaining_uses, expires_at, created_at, notes
         FROM qa_failure_injections
        WHERE organization_id = $1
          AND provider = $2
          AND (scope IS NULL OR $3::text IS NULL OR scope = $3)
          AND expires_at > now()
          AND remaining_uses > 0
        ORDER BY created_at ASC
        LIMIT 1
        FOR UPDATE`,
      [orgId, provider, scope ?? null],
    );
    const row = r.rows[0];
    if (!row) return null;
    await client.query(
      `UPDATE qa_failure_injections
          SET remaining_uses = remaining_uses - 1
        WHERE organization_id = $1 AND id = $2`,
      [orgId, row.id],
    );
    const httpStatus = row.http_status ?? PROFILE_HTTP[row.profile];
    return {
      id: row.id,
      provider: row.provider,
      profile: row.profile,
      httpStatus,
      retryAfterSeconds: row.retry_after_seconds,
      errorClass: PROFILE_CLASS[row.profile],
      message: describe(row.profile, httpStatus, row.retry_after_seconds),
    };
  });
}
