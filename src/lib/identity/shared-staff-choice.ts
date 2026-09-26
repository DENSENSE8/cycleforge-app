/** Shared-account (umbrella) staff picker — the same roster email+password sign-in returns, reused after Google/Apple so federated login is… */

import pool from '@/lib/db';
import { parseOrgSettings, isSharedStaffAccountOrg } from '@/lib/tenancy/settings';

export {
  isSafeAppPath,
  resolveOAuthPostLoginPath,
  resolveSigninDoorPath,
} from './oauth-post-login-path';

interface SharedStaffChoiceRow {
  id: number;
  name: string;
  role: string | null;
  color_hex: string | null;
  has_pin: boolean;
}

interface SharedStaffChoice {
  organizationName: string;
  staff: SharedStaffChoiceRow[];
}

export async function loadSharedStaffChoices(
  orgId: string,
  umbrellaStaffId: number,
): Promise<SharedStaffChoice | null> {
  try {
    const orgRes = await pool.query<{ name: string; settings: unknown }>(
      `SELECT name, settings FROM organizations WHERE id = $1 LIMIT 1`,
      [orgId],
    );
    const org = orgRes.rows[0];
    if (!org || !isSharedStaffAccountOrg(parseOrgSettings(org.settings))) {
      return null;
    }
    const staffRes = await pool.query<SharedStaffChoiceRow>(
      `SELECT id, name, role, color_hex, (pin_hash IS NOT NULL) AS has_pin
         FROM staff
        WHERE organization_id = $1
          AND id <> $2
          AND COALESCE(status, 'active') IN ('active', 'invited')
          AND COALESCE(active, true) = true
        ORDER BY name ASC`,
      [orgId, umbrellaStaffId],
    );
    return { organizationName: org.name, staff: staffRes.rows };
  } catch {
    return null;
  }
}
