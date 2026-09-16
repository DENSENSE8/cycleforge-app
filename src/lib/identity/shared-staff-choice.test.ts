/**
 * DB-free gate: federated login on a shared-account org lands on the same
 * staff picker as email+password, never an open-redirect `next`.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  isSafeAppPath,
  resolveOAuthPostLoginPath,
  resolveSigninDoorPath,
} from './oauth-post-login-path';

describe('resolveSigninDoorPath', () => {
  test('only /m/signin is the mobile door; everything else is /signin', () => {
    assert.equal(resolveSigninDoorPath('/m/signin'), '/m/signin');
    assert.equal(resolveSigninDoorPath('/signin'), '/signin');
    assert.equal(resolveSigninDoorPath('/evil'), '/signin');
    assert.equal(resolveSigninDoorPath(null), '/signin');
  });
});

describe('isSafeAppPath', () => {
  test('rejects protocol-relative and backslash hosts', () => {
    assert.equal(isSafeAppPath('/orders'), true);
    assert.equal(isSafeAppPath('https://evil.example'), false);
    assert.equal(isSafeAppPath('//evil.example'), false);
    assert.equal(isSafeAppPath('/\\evil.example'), false);
  });
});

describe('resolveOAuthPostLoginPath', () => {
  test('individual org follows a same-origin next, else home', () => {
    assert.equal(
      resolveOAuthPostLoginPath({ sharedStaffOrg: false, next: '/orders', signinPath: '/signin' }),
      '/orders',
    );
    assert.equal(
      resolveOAuthPostLoginPath({ sharedStaffOrg: false, next: '//evil.example', signinPath: '/signin' }),
      '/',
    );
    assert.equal(
      resolveOAuthPostLoginPath({ sharedStaffOrg: false, next: null, signinPath: '/m/signin' }),
      '/',
    );
  });

  test('shared org always opens the staff picker on the sign-in door', () => {
    assert.equal(
      resolveOAuthPostLoginPath({ sharedStaffOrg: true, next: null, signinPath: '/signin' }),
      '/signin?choose_staff=1',
    );
    assert.equal(
      resolveOAuthPostLoginPath({ sharedStaffOrg: true, next: '/m/home', signinPath: '/m/signin' }),
      '/m/signin?choose_staff=1&next=%2Fm%2Fhome',
    );
  });

  test('shared org does not honor an off-origin next', () => {
    assert.equal(
      resolveOAuthPostLoginPath({
        sharedStaffOrg: true,
        next: '//evil.example',
        signinPath: '/signin',
      }),
      '/signin?choose_staff=1',
    );
  });
});
