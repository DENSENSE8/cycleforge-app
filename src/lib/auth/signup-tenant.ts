/**
 * Signup tenant provisioning — the transactional core of POST /api/auth/signup.
 * Runs on the caller's client inside its transaction (owner pool, bypasses
 * RLS): org → owner account → membership → admin staff → the org's OWN system
 * roles, owner wired to that org's admin role only. Split out of the route so
 * the live-DB smoke test can run it inside BEGIN/ROLLBACK.
 */

import type { PoolClient } from 'pg';
import { hashPin } from '@/lib/auth/pin';
import { getAccountByEmail, createAccount, setAccountPassword } from '@/lib/identity/accounts';
import { ensureAdminRoleWired } from '@/lib/auth/ensure-admin-role';

export interface SignupTenantInput {
  companyName: string;
  fullName: string;
  email: string;
  password: string;
  pin?: string;
}

export async function provisionSignupTenant(
  client: PoolClient,
  slug: string,
  parsed: SignupTenantInput,
): Promise<{ orgId: string; accountId: string; staffId: number }> {
  // 1. Org
  const orgRes = await client.query<{ id: string }>(
    `INSERT INTO organizations (slug, name, plan, status, trial_ends_at, settings, billing_email)
     VALUES ($1, $2, 'trial', 'active', now() + interval '14 days', '{}'::jsonb, $3)
     RETURNING id`,
    [slug, parsed.companyName, parsed.email],
  );
  const orgId = orgRes.rows[0]!.id;

  // 2. Global identity account for the owner (email-backed; null password — they sign in via PIN below or a future magic-link).
  const existingAccount = await getAccountByEmail(parsed.email, client);
  const accountId = existingAccount
    ? existingAccount.id
    : await createAccount(
        { displayName: parsed.fullName, email: parsed.email, password: parsed.password },
        client,
      );
  // If the account already existed (invited elsewhere) but had no password,
  // set the one they chose here so they can sign in with it.
  if (existingAccount && !existingAccount.passwordHash) {
    await setAccountPassword(accountId, parsed.password, client);
  }

  // 3. Membership linking the account to the new org as an active member.
  const memRes = await client.query<{ id: string }>(
    `INSERT INTO memberships (account_id, org_id, status, joined_at)
     VALUES ($1, $2, 'active', now())
     ON CONFLICT (account_id, org_id)
     DO UPDATE SET status = 'active', joined_at = COALESCE(memberships.joined_at, now())
     RETURNING id`,
    [accountId, orgId],
  );
  const membershipId = memRes.rows[0]!.id;

  // 4. First admin staff (the per-org profile), linked to account + membership.
  // Owner authenticates by PASSWORD (auth_method='password'); the station PIN
  // is optional and only set if one was supplied at signup.
  const pinHash = parsed.pin ? await hashPin(parsed.pin) : null;
  const staffRes = await client.query<{ id: number }>(
    `INSERT INTO staff
       (name, role, active, organization_id, pin_hash, pin_set_at, status, default_home_path, email,
        account_id, membership_id, auth_method)
     VALUES ($1, 'admin', true, $2, $3::text, CASE WHEN $3::text IS NULL THEN NULL ELSE now() END,
             'active', '/', $4, $5, $6, 'password')
     RETURNING id`,
    [parsed.fullName, orgId, pinHash, parsed.email, accountId, membershipId],
  );
  const staffId = staffRes.rows[0]!.id;

  // 5. The org's own system roles; owner wired to this org's admin role only.
  if (!(await ensureAdminRoleWired(staffId, orgId, client))) {
    throw new Error('signup: admin role wiring failed');
  }


  return { orgId, accountId, staffId };
}
