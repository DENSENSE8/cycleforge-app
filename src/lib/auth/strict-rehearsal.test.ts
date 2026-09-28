import test from 'node:test';
import assert from 'node:assert/strict';
import type { AuthContext } from './auth-context';
import type { PermissionString } from './permissions-shared';
import {
  isProspectiveStrictDenial,
  loadStrictRehearsalReport,
  recordProspectiveStrictDenial,
} from './strict-rehearsal';

const ORG = '00000000-0000-0000-0000-000000000001';
const MISSING = 'admin.manage_roles' as PermissionString;

function context(mode: 'strict' | 'authenticated-only', stored: PermissionString[]): AuthContext {
  return {
    user: {
      roles: [{ key: 'receiver' }],
    },
    staffId: 42,
    organizationId: ORG,
    role: 'receiver',
    authorizationMode: mode,
    storedPermissions: new Set(stored),
  } as unknown as AuthContext;
}

test('prospective denial exists only for auth-only permissions absent from stored access', () => {
  assert.equal(isProspectiveStrictDenial({
    mode: 'authenticated-only',
    storedPermissions: new Set(),
    permission: MISSING,
  }), true);
  assert.equal(isProspectiveStrictDenial({
    mode: 'strict',
    storedPermissions: new Set(),
    permission: MISSING,
  }), false);
  assert.equal(isProspectiveStrictDenial({
    mode: 'authenticated-only',
    storedPermissions: new Set([MISSING]),
    permission: MISSING,
  }), false);
});

test('recorder writes an actor- and tenant-scoped rehearsal signal without denying', async () => {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const recorded = await recordProspectiveStrictDenial(
    {
      query: async (sql, params = []) => {
        calls.push({ sql, params });
        return { rows: [{ id: 7 }] };
      },
    },
    context('authenticated-only', []),
    {
      headers: new Headers({ 'user-agent': 'strict-rehearsal-test' }),
      method: 'GET',
      nextUrl: new URL('http://localhost/api/admin/roles'),
    } as never,
    MISSING,
  );

  assert.equal(recorded, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.params[0], 42);
  assert.equal(calls[0]?.params[2], ORG);
  assert.equal(calls[0]?.params[4], 'authorization.prospective_denial');
  assert.equal(calls[0]?.params[6], MISSING);
  assert.deepEqual(JSON.parse(String(calls[0]?.params[13])), {
    method: 'system',
    authorization_mode: 'authenticated-only',
    path: '/api/admin/roles',
    request_method: 'GET',
    role_keys: ['receiver'],
  });
});

test('recorder does not write in strict mode or when stored access already allows the request', async () => {
  let writes = 0;
  const db = {
    query: async () => {
      writes += 1;
      return { rows: [] };
    },
  };
  const req = {
    headers: new Headers(),
    method: 'GET',
    nextUrl: new URL('http://localhost/api/admin/roles'),
  } as never;

  assert.equal(await recordProspectiveStrictDenial(db, context('strict', []), req, MISSING), false);
  assert.equal(await recordProspectiveStrictDenial(db, context('authenticated-only', [MISSING]), req, MISSING), false);
  assert.equal(writes, 0);
});

test('report maps tenant aggregation and clamps the observation window', async () => {
  let seenOrg = '';
  let seenParams: ReadonlyArray<unknown> = [];
  const report = await loadStrictRehearsalReport(async (org, _sql, params) => {
    seenOrg = org;
    seenParams = params ?? [];
    return {
      rows: [{
        permission: MISSING,
        actor_staff_id: 42,
        staff_name: 'Receiver One',
        actor_role: 'receiver',
        path: '/api/admin/roles',
        request_method: 'GET',
        request_count: 3,
        first_seen_at: '2026-09-26T10:00:00.000Z',
        last_seen_at: '2026-09-27T10:00:00.000Z',
        total_requests: 3,
        permission_count: 1,
        affected_staff_count: 1,
      }],
    };
  }, ORG, 999);

  assert.equal(seenOrg, ORG);
  assert.equal(seenParams[2], 90);
  assert.equal(report.windowDays, 90);
  assert.equal(report.totalRequests, 3);
  assert.equal(report.permissionCount, 1);
  assert.equal(report.affectedStaffCount, 1);
  assert.equal(report.issues[0]?.staffName, 'Receiver One');
});
