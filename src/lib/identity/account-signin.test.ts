/** Email + password sign-in decision — throttles, generic failure, workspace choice by id or slug. */

import test from 'node:test';
import assert from 'node:assert/strict';
import { authenticateAccountPassword, type AccountSigninDeps } from './account-signin';
import type { AccountRecord } from './accounts';
import type { MembershipRow } from './memberships';

const ACCOUNT: AccountRecord = { id: 'acct-1', displayName: 'Mo', passwordHash: 'hash', status: 'active' };

function membership(orgId: string, slug: string | null, staffId: number): MembershipRow {
  return {
    organization_id: orgId,
    organization_name: `Org ${orgId}`,
    organization_slug: slug,
    plan: null,
    staff_id: staffId,
    role: 'admin',
  };
}

const USAV = membership('org-usav', 'usav', 11);
const ACME = membership('org-acme', 'acme', 22);

interface Captured {
  rateKeys: string[];
  lookups: string[];
  events: { accountId: string | null; event: string }[];
}

function fakes(opts: {
  account?: AccountRecord | null;
  passwordOk?: boolean;
  memberships?: MembershipRow[];
  limitedRouteKey?: string;
} = {}) {
  const cap: Captured = { rateKeys: [], lookups: [], events: [] };
  const deps: AccountSigninDeps = {
    checkRateLimit: async (o) => {
      cap.rateKeys.push(o.routeKey);
      return o.routeKey === opts.limitedRouteKey ? { ok: false, retryAfterSec: 42 } : { ok: true };
    },
    getAccountByEmail: async (email) => {
      cap.lookups.push(email);
      return opts.account === undefined ? ACCOUNT : opts.account;
    },
    verifyPassword: async () => opts.passwordOk ?? true,
    listMemberships: async () => opts.memberships ?? [USAV],
    logAuthEvent: async (e) => {
      cap.events.push({ accountId: e.accountId, event: e.event });
    },
  };
  return { deps, cap };
}

const INPUT = {
  headers: new Headers(),
  email: 'mo@example.com',
  password: 'pw',
  ip: null,
  userAgent: null,
};

test('one workspace: signs straight in as that staff profile', async () => {
  const { deps } = fakes();
  const out = await authenticateAccountPassword(INPUT, deps);
  assert.equal(out.kind, 'ok');
  assert.ok(out.kind === 'ok');
  assert.equal(out.accountId, 'acct-1');
  assert.equal(out.target.staff_id, 11);
});

test('several workspaces and no choice: asks, listing each slug', async () => {
  const { deps } = fakes({ memberships: [USAV, ACME] });
  const out = await authenticateAccountPassword(INPUT, deps);
  assert.ok(out.kind === 'needs_org_choice');
  assert.deepEqual(
    out.memberships.map((m) => m.organizationSlug),
    ['usav', 'acme'],
  );
});

test('a workspace slug picks that membership', async () => {
  const { deps } = fakes({ memberships: [USAV, ACME] });
  const out = await authenticateAccountPassword({ ...INPUT, workspaceSlug: 'acme' }, deps);
  assert.ok(out.kind === 'ok');
  assert.equal(out.target.organization_id, 'org-acme');
  assert.equal(out.target.staff_id, 22);
});

test('a slug the account is not a member of is refused, never matched elsewhere', async () => {
  const { deps } = fakes({ memberships: [USAV, ACME] });
  const out = await authenticateAccountPassword({ ...INPUT, workspaceSlug: 'globex' }, deps);
  assert.equal(out.kind, 'not_member');
});

test('a slug that happens to equal another member org id does not select it', async () => {
  const { deps } = fakes({ memberships: [USAV, ACME] });
  const out = await authenticateAccountPassword({ ...INPUT, workspaceSlug: 'org-acme' }, deps);
  assert.equal(out.kind, 'not_member');
});

test('wrong password and unknown email fail identically and log a failed login', async () => {
  const wrong = fakes({ passwordOk: false });
  const unknown = fakes({ account: null });
  const a = await authenticateAccountPassword(INPUT, wrong.deps);
  const b = await authenticateAccountPassword(INPUT, unknown.deps);
  assert.deepEqual(a, { kind: 'invalid_credentials' });
  assert.deepEqual(b, { kind: 'invalid_credentials' });
  assert.deepEqual(wrong.cap.events, [{ accountId: 'acct-1', event: 'failed_login' }]);
  assert.deepEqual(unknown.cap.events, [{ accountId: null, event: 'failed_login' }]);
});

test('a throttled caller never reaches the account lookup', async () => {
  const { deps, cap } = fakes({ limitedRouteKey: 'auth-account-signin-email' });
  const out = await authenticateAccountPassword(INPUT, deps);
  assert.deepEqual(out, { kind: 'rate_limited', retryAfterSec: 42 });
  assert.deepEqual(cap.rateKeys, ['auth-account-signin', 'auth-account-signin-email']);
  assert.deepEqual(cap.lookups, []);
});

test('an inactive account with the right password is refused', async () => {
  const { deps } = fakes({ account: { ...ACCOUNT, status: 'suspended' } });
  const out = await authenticateAccountPassword(INPUT, deps);
  assert.equal(out.kind, 'account_not_active');
});
