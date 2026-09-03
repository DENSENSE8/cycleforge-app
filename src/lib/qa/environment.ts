/**
 * Organization environment — sandbox vs customer.
 *
 * This is the isolation boundary for the QA Console. It is NOT a setting, NOT
 * a feature flag, and NOT an entitlement. Customer orgs stay 'customer' even
 * if someone grants developer.qa_tools.* on a role.
 */

import pool from '@/lib/db';
import { QA_ORG_ID } from '@/lib/tenancy/constants';

export const ORG_ENVIRONMENTS = ['sandbox', 'customer'] as const;
export type OrgEnvironment = (typeof ORG_ENVIRONMENTS)[number];

export function parseOrgEnvironment(value: unknown): OrgEnvironment {
  return value === 'sandbox' ? 'sandbox' : 'customer';
}

export function isSandboxEnvironment(value: unknown): boolean {
  return parseOrgEnvironment(value) === 'sandbox';
}

/**
 * Read organizations.environment. If the column is not applied yet, the known
 * QA org UUID is treated as sandbox so the rest of the app still boots.
 */
export async function loadOrgEnvironment(orgId: string): Promise<OrgEnvironment> {
  try {
    const r = await pool.query<{ environment: string | null }>(
      `SELECT environment FROM organizations WHERE id = $1 LIMIT 1`,
      [orgId],
    );
    if (!r.rows[0]) return 'customer';
    return parseOrgEnvironment(r.rows[0].environment);
  } catch {
    return orgId === QA_ORG_ID ? 'sandbox' : 'customer';
  }
}
