/**
 * Server-side alias resolution — the built-in command a tenant's custom code
 * means, read from the DB.
 *
 * The client resolves aliases from a hydrated snapshot so a bench scan costs no
 * round-trip. This exists because that resolution is NOT trustworthy at the
 * write boundary: a `code` arriving at `/api/stations/handoff` is a wire value
 * like any other, and accepting the client's idea of what it meant would let a
 * caller name any command it liked simply by claiming an alias for it.
 *
 * So the client's resolution is a latency optimisation and this one is the
 * gate. Both must agree; only this one decides.
 */

import { tenantQuery } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';

export async function resolveAliasTargetForOrg(
  orgId: OrgId,
  rawCode: string,
): Promise<string | null> {
  const code = String(rawCode ?? '').trim().toUpperCase();
  if (!code) return null;
  try {
    const { rows } = await tenantQuery<{ target_code: string }>(
      orgId,
      `SELECT target_code
         FROM station_command_aliases
        WHERE organization_id = $1 AND code = $2 AND is_active = true
        LIMIT 1`,
      [orgId, code],
    );
    return rows[0]?.target_code ?? null;
  } catch {
    // A missing alias table or a read failure must not break a verdict that
    // used a built-in code. Falling through to the raw string is the safe
    // default: an unrecognised code is refused downstream anyway.
    return null;
  }
}
