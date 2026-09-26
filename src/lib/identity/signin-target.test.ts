/** Unit gate for account sign-in workspace resolution (node:test, no I/O). */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { resolveAccountSigninTarget, type AccountMembershipRow } from './signin-target';

const A: AccountMembershipRow = { organization_id: 'org_a', organization_name: 'Alpha', staff_id: 1 };
const B: AccountMembershipRow = { organization_id: 'org_b', organization_name: 'Beta', staff_id: 2 };

describe('resolveAccountSigninTarget', () => {
  test('no memberships → no_workspace, whatever the client asks for', () => {
    assert.deepEqual(resolveAccountSigninTarget([], undefined), { kind: 'no_workspace' });
    assert.deepEqual(resolveAccountSigninTarget([], 'org_a'), { kind: 'no_workspace' });
  });

  test('single membership, no organizationId → straight into it', () => {
    assert.deepEqual(resolveAccountSigninTarget([A], undefined), { kind: 'target', target: A });
    assert.deepEqual(resolveAccountSigninTarget([A], null), { kind: 'target', target: A });
  });

  test('multiple memberships, no organizationId → needs_choice carrying all of them', () => {
    const verdict = resolveAccountSigninTarget([A, B], undefined);
    assert.deepEqual(verdict, { kind: 'needs_choice', memberships: [A, B] });
  });

  test('a matching organizationId picks exactly that membership', () => {
    assert.deepEqual(resolveAccountSigninTarget([A, B], 'org_b'), { kind: 'target', target: B });
    assert.deepEqual(resolveAccountSigninTarget([A], 'org_a'), { kind: 'target', target: A });
  });

  test('an organizationId outside the membership list is refused, not defaulted', () => {
    assert.deepEqual(resolveAccountSigninTarget([A, B], 'org_evil'), {
      kind: 'not_member',
      organizationId: 'org_evil',
    });
  });

  test('a blank organizationId is treated as absent (picker, not spoof)', () => {
    assert.deepEqual(resolveAccountSigninTarget([A, B], '   '), { kind: 'needs_choice', memberships: [A, B] });
  });
});
