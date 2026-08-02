/**
 * The single resolution point for a tenant's GS1 identity. SERVER-ONLY.
 *
 * Reads the raw block out of `organizations.settings` and hands it to
 * `resolveGs1Identity`, which is where placeholder prefixes and malformed
 * GLNs are dropped. Product code calls THIS, never `getGs1SettingsRaw`
 * directly — mirrors `resolveInboundSettings`, for the same reason: one place
 * decides what a persisted value actually means.
 *
 * Not re-exported from any barrel (it reaches the DB). Import the path.
 */

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

/**
 * Resolve the tenant's usable GS1 identity.
 *
 * A missing org, an unparseable settings blob, or a DB hiccup all resolve to
 * `{}` — "this tenant has no GS1 identity" — rather than throwing. That is the
 * degrade-not-fail rule, and here it is also the SAFE direction: an empty
 * identity means the projection omits GS1 keys, which is always a legal
 * document. There is no failure mode where guessing would be better.
 */
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
