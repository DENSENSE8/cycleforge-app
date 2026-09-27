/** Email + password account sign-in — the credential half shared by the cookie route and `/api/v1/session`. */

import pool from '@/lib/db';
import { audit } from '@/lib/auth/audit';
import type { SessionRow } from '@/lib/auth/session';
import { checkRateLimitAsync } from '@/lib/api-guard';
import { getAccountByEmail, type AccountRecord } from '@/lib/identity/accounts';
import { verifyPassword } from '@/lib/identity/password';
import { listMembershipsForAccount, logAuthEvent, type MembershipRow } from '@/lib/identity/memberships';
import { resolveAccountSigninTarget, type AccountMembershipRow } from '@/lib/identity/signin-target';
import { recordStaffLogin, type StaffLogin } from '@/lib/auth/record-staff-login';

interface AccountSigninInput {
  headers: Headers;
  email: string;
  password: string;
  /** Web picker: the org UUID. */
  organizationId?: string;
  /** Native picker: the workspace slug (the tenant subdomain) — v1 never takes an org UUID as input. */
  workspaceSlug?: string;
  ip: string | null;
  userAgent: string | null;
}

type AccountSigninResult =
  | { kind: 'rate_limited'; retryAfterSec: number | undefined }
  | { kind: 'invalid_credentials' }
  | { kind: 'account_not_active' }
  | { kind: 'no_workspace' }
  | { kind: 'not_member' }
  | {
      kind: 'needs_org_choice';
      memberships: { organizationId: string; organizationName: string; organizationSlug: string | null }[];
    }
  | { kind: 'ok'; accountId: string; target: MembershipRow };

const WINDOW_MS = 10 * 60 * 1000;

/** The IO the credential check reaches — injectable so the decision is testable without a DB. */
export interface AccountSigninDeps {
  checkRateLimit: typeof checkRateLimitAsync;
  getAccountByEmail: (email: string) => Promise<AccountRecord | null>;
  verifyPassword: typeof verifyPassword;
  listMemberships: typeof listMembershipsForAccount;
  logAuthEvent: typeof logAuthEvent;
}

const defaultDeps: AccountSigninDeps = {
  checkRateLimit: checkRateLimitAsync,
  getAccountByEmail: (email) => getAccountByEmail(email),
  verifyPassword,
  listMemberships: listMembershipsForAccount,
  logAuthEvent,
};

/** Throttle, verify, and resolve the workspace. Never reveals whether the email exists. */
export async function authenticateAccountPassword(
  input: AccountSigninInput,
  deps: AccountSigninDeps = defaultDeps,
): Promise<AccountSigninResult> {
  // Per-IP throttle against credential stuffing.
  const rl = await deps.checkRateLimit({
    headers: input.headers,
    routeKey: 'auth-account-signin',
    limit: 20,
    windowMs: WINDOW_MS,
  });
  if (!rl.ok) return { kind: 'rate_limited', retryAfterSec: rl.retryAfterSec };

  // Per-email throttle so one targeted account can't be brute-forced across IPs.
  const emailRl = await deps.checkRateLimit({
    headers: input.headers,
    routeKey: 'auth-account-signin-email',
    scope: input.email.toLowerCase(),
    limit: 10,
    windowMs: WINDOW_MS,
  });
  if (!emailRl.ok) return { kind: 'rate_limited', retryAfterSec: emailRl.retryAfterSec };

  const account = await deps.getAccountByEmail(input.email);
  const ok = account ? await deps.verifyPassword(input.password, account.passwordHash) : false;
  if (!account || !ok) {
    await deps.logAuthEvent({
      accountId: account?.id ?? null,
      orgId: null,
      event: 'failed_login',
      ip: input.ip,
      userAgent: input.userAgent,
    });
    return { kind: 'invalid_credentials' };
  }
  if (account.status !== 'active') return { kind: 'account_not_active' };

  const memberships = await deps.listMemberships(account.id);
  // A slug resolves only against this account's own memberships, and only by slug —
  // it never falls through to org-id matching (v1 must not accept a tenant UUID as input).
  let wantedOrgId = input.organizationId;
  if (input.workspaceSlug) {
    const bySlug = memberships.find((m) => m.organization_slug === input.workspaceSlug);
    if (!bySlug) return memberships.length === 0 ? { kind: 'no_workspace' } : { kind: 'not_member' };
    wantedOrgId = bySlug.organization_id;
  }
  const decision = resolveAccountSigninTarget(memberships, wantedOrgId);
  switch (decision.kind) {
    case 'no_workspace':
      return { kind: 'no_workspace' };
    case 'not_member':
      return { kind: 'not_member' };
    case 'needs_choice':
      return {
        kind: 'needs_org_choice',
        memberships: decision.memberships.map((m) => ({
          organizationId: m.organization_id,
          organizationName: m.organization_name,
          organizationSlug: m.organization_slug,
        })),
      };
    case 'target':
      return { kind: 'ok', accountId: account.id, target: decision.target };
  }
}

/** The stamps every successful account sign-in leaves: last login (account + staff), audit row, auth event. Returns the staff login (landing inputs). */
export async function recordAccountSignin(args: {
  accountId: string;
  target: AccountMembershipRow;
  session: SessionRow;
  event: 'signin.account' | 'signin.v1';
  ip: string | null;
  userAgent: string | null;
}): Promise<StaffLogin> {
  void pool
    .query(`UPDATE accounts SET last_login_at = now() WHERE id = $1`, [args.accountId])
    .catch(() => {});
  const login = await recordStaffLogin(pool, args.target.staff_id);
  await audit({
    staffId: args.target.staff_id,
    sid: args.session.sid,
    event: args.event,
    result: 'ok',
    ip: args.ip,
    userAgent: args.userAgent,
    detail: {
      accountId: args.accountId,
      orgId: args.target.organization_id,
      persistent: args.session.persistent,
      deviceKind: args.session.deviceKind,
    },
  });
  await logAuthEvent({
    accountId: args.accountId,
    orgId: args.target.organization_id,
    event: 'login',
    ip: args.ip,
    userAgent: args.userAgent,
  });
  return login;
}
