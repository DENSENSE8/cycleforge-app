/** The single resolution point for a tenant's GS1 identity. */

import pool from '@/lib/db';
import { parseOrgSettings, getGs1SettingsRaw } from '@/lib/tenancy/settings';
import { resolveGs1Identity, type Gs1OrgIdentity } from './gs1-keys';

export interface OrgGs1Deps {
  query: <T extends Record<string, unknown>>(
    text: string,
    params: unknown[],
  ) => Promise<{ rows: T[] }>;
}

const defaultDeps: OrgGs1Deps = {
  query: (text, params) => pool.query(text, params) as never,
};

/** Resolve the tenant's usable GS1 identity. */
export async function resolveOrgGs1Identity(
  orgId: string | null | undefined,
  deps: OrgGs1Deps = defaultDeps,
): Promise<Gs1OrgIdentity> {
  if (!orgId) return {};
  try {
    const { rows } = await deps.query<{ settings: unknown }>(
      `SELECT settings FROM organizations WHERE id = $1 LIMIT 1`,
      [orgId],
    );
    if (rows.length === 0) return {};
    return resolveGs1Identity(getGs1SettingsRaw(parseOrgSettings(rows[0]?.settings ?? {})));
  } catch {
    return {};
  }
}
