/**
 * "Act as staff" authorization decision (SHARED-account umbrella avenue).
 *
 * Pure, DB-free: proves the shared-account gate, the same-org gate, and the
 * failure ordering that keeps a per-email org from probing staff ids.
 */

import { test } from 'node:test';
import { strictEqual, deepStrictEqual } from 'node:assert';
import { evaluateActAs, actAsErrorStatus } from '@/lib/auth/act-as-staff';

const ORG_A = '00000000-0000-0000-0000-000000000001';
const ORG_B = '00000000-0000-0000-0000-000000000002';

test('allows acting as an active staff in the same shared-account org', () => {
  deepStrictEqual(
    evaluateActAs({ sharedAccountEnabled: true, callerOrgId: ORG_A, target: { orgId: ORG_A, active: true } }),
    { ok: true },
  );
});

test('denies when the org is not a shared-account workspace (even for a valid target)', () => {
  deepStrictEqual(
    evaluateActAs({ sharedAccountEnabled: false, callerOrgId: ORG_A, target: { orgId: ORG_A, active: true } }),
    { ok: false, error: 'NOT_SHARED_ORG' },
  );
});

test('non-shared org check wins BEFORE target existence (no staff-id probing)', () => {
  // target is null, but a per-email org must not learn that — NOT_SHARED_ORG first.
  deepStrictEqual(
    evaluateActAs({ sharedAccountEnabled: false, callerOrgId: ORG_A, target: null }),
    { ok: false, error: 'NOT_SHARED_ORG' },
  );
});

test('denies a missing target', () => {
  deepStrictEqual(
    evaluateActAs({ sharedAccountEnabled: true, callerOrgId: ORG_A, target: null }),
    { ok: false, error: 'TARGET_NOT_FOUND' },
  );
});

test('denies a cross-org target (masqueraded as 404)', () => {
  const d = evaluateActAs({ sharedAccountEnabled: true, callerOrgId: ORG_A, target: { orgId: ORG_B, active: true } });
  deepStrictEqual(d, { ok: false, error: 'CROSS_ORG' });
  strictEqual(actAsErrorStatus('CROSS_ORG'), 404);
});

test('denies a deactivated target in the same org', () => {
  deepStrictEqual(
    evaluateActAs({ sharedAccountEnabled: true, callerOrgId: ORG_A, target: { orgId: ORG_A, active: false } }),
    { ok: false, error: 'TARGET_INACTIVE' },
  );
});

test('error → status mapping', () => {
  strictEqual(actAsErrorStatus('NOT_SHARED_ORG'), 403);
  strictEqual(actAsErrorStatus('TARGET_INACTIVE'), 403);
  strictEqual(actAsErrorStatus('TARGET_NOT_FOUND'), 404);
  strictEqual(actAsErrorStatus('CROSS_ORG'), 404);
});

test('permission ceiling: denies when the target holds a permission the caller lacks', () => {
  const d = evaluateActAs({
    sharedAccountEnabled: true,
    callerOrgId: ORG_A,
    target: { orgId: ORG_A, active: true },
    callerPermissions: new Set(['orders.view']),
    targetPermissions: new Set(['orders.view', 'admin.manage_staff']),
  });
  deepStrictEqual(d, { ok: false, error: 'TARGET_EXCEEDS_CALLER' });
  strictEqual(actAsErrorStatus('TARGET_EXCEEDS_CALLER'), 403);
});

test('permission ceiling: allows when the target set is a subset of the caller set', () => {
  deepStrictEqual(
    evaluateActAs({
      sharedAccountEnabled: true,
      callerOrgId: ORG_A,
      target: { orgId: ORG_A, active: true },
      callerPermissions: new Set(['orders.view', 'admin.manage_staff']),
      targetPermissions: new Set(['orders.view']),
    }),
    { ok: true },
  );
});

test('permission ceiling: equal sets and absent sets both pass', () => {
  const perms = new Set(['orders.view']);
  deepStrictEqual(
    evaluateActAs({
      sharedAccountEnabled: true, callerOrgId: ORG_A,
      target: { orgId: ORG_A, active: true },
      callerPermissions: perms, targetPermissions: new Set(['orders.view']),
    }),
    { ok: true },
  );
  // No permission sets supplied (legacy callers / unit path) → gate is a no-op.
  deepStrictEqual(
    evaluateActAs({ sharedAccountEnabled: true, callerOrgId: ORG_A, target: { orgId: ORG_A, active: true } }),
    { ok: true },
  );
});
