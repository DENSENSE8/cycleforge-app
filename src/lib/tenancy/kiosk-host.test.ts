/**
 * kiosk-host SoT — hostname parsing + origin builders for
 * `{slug}.kiosk.app.cycleforge.ai`.
 */

import { test } from 'node:test';
import { deepStrictEqual, strictEqual, throws } from 'node:assert';
import {
  getKioskHostSuffix,
  isBareKioskPlatformHost,
  isKioskHost,
  isKioskHostAllowedPath,
  isStaffAppHost,
  kioskOriginForSlug,
  normalizeKioskRequestHost,
  parseKioskHost,
  staffKioskRedirectOrigin,
  staffOriginForSlug,
} from '@/lib/tenancy/kiosk-host';

function withEnv(vars: Record<string, string | undefined>, fn: () => void): void {
  const prev: Record<string, string | undefined> = {};
  for (const key of Object.keys(vars)) {
    prev[key] = process.env[key];
    const next = vars[key];
    if (next === undefined) delete process.env[key];
    else process.env[key] = next;
  }
  try {
    fn();
  } finally {
    for (const key of Object.keys(vars)) {
      if (prev[key] === undefined) delete process.env[key];
      else process.env[key] = prev[key];
    }
  }
}

test('normalizeKioskRequestHost strips port and picks first x-forwarded-host', () => {
  strictEqual(normalizeKioskRequestHost('USAV.kiosk.app.cycleforge.ai:443'), 'usav.kiosk.app.cycleforge.ai');
  strictEqual(
    normalizeKioskRequestHost('usav.kiosk.app.cycleforge.ai, other.example'),
    'usav.kiosk.app.cycleforge.ai',
  );
});

test('parseKioskHost — production dogfood shape', () => {
  withEnv(
    {
      NEXT_PUBLIC_KIOSK_HOST_SUFFIX: 'kiosk.app.cycleforge.ai',
      NEXT_PUBLIC_APP_URL: 'https://app.cycleforge.ai',
    },
    () => {
      deepStrictEqual(parseKioskHost('usav.kiosk.app.cycleforge.ai'), { slug: 'usav' });
      deepStrictEqual(parseKioskHost('Acme-1.kiosk.app.cycleforge.ai'), { slug: 'acme-1' });
      strictEqual(parseKioskHost('kiosk.app.cycleforge.ai'), null);
      strictEqual(parseKioskHost('usav.app.cycleforge.ai'), null);
      strictEqual(parseKioskHost('app.cycleforge.ai'), null);
      strictEqual(isKioskHost('usav.kiosk.app.cycleforge.ai'), true);
      strictEqual(isBareKioskPlatformHost('kiosk.app.cycleforge.ai'), true);
      strictEqual(isBareKioskPlatformHost('usav.kiosk.app.cycleforge.ai'), false);
    },
  );
});

test('parseKioskHost — local kiosk.localhost suffix', () => {
  withEnv(
    {
      NEXT_PUBLIC_KIOSK_HOST_SUFFIX: 'kiosk.localhost',
      NEXT_PUBLIC_APP_URL: undefined,
      APP_URL: undefined,
      VERCEL_URL: undefined,
    },
    () => {
      deepStrictEqual(parseKioskHost('usav.kiosk.localhost'), { slug: 'usav' });
      strictEqual(parseKioskHost('kiosk.localhost'), null);
      strictEqual(getKioskHostSuffix(), 'kiosk.localhost');
    },
  );
});

test('getKioskHostSuffix derives from NEXT_PUBLIC_APP_URL when unset', () => {
  withEnv(
    {
      NEXT_PUBLIC_KIOSK_HOST_SUFFIX: undefined,
      NEXT_PUBLIC_APP_URL: 'https://app.cycleforge.ai',
      APP_URL: undefined,
      VERCEL_URL: undefined,
    },
    () => {
      strictEqual(getKioskHostSuffix(), 'kiosk.app.cycleforge.ai');
    },
  );
});

test('kioskOriginForSlug / staffOriginForSlug', () => {
  withEnv(
    {
      NEXT_PUBLIC_KIOSK_HOST_SUFFIX: 'kiosk.app.cycleforge.ai',
      NEXT_PUBLIC_APP_URL: 'https://app.cycleforge.ai',
    },
    () => {
      strictEqual(kioskOriginForSlug('usav'), 'https://usav.kiosk.app.cycleforge.ai');
      strictEqual(staffOriginForSlug('usav'), 'https://usav.app.cycleforge.ai');
      throws(() => kioskOriginForSlug('kiosk'));
    },
  );

  withEnv(
    {
      NEXT_PUBLIC_KIOSK_HOST_SUFFIX: 'kiosk.localhost',
      NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
    },
    () => {
      strictEqual(kioskOriginForSlug('usav', { port: '3000' }), 'http://usav.kiosk.localhost:3000');
    },
  );
});

test('isStaffAppHost', () => {
  withEnv(
    {
      NEXT_PUBLIC_KIOSK_HOST_SUFFIX: 'kiosk.app.cycleforge.ai',
      NEXT_PUBLIC_APP_URL: 'https://app.cycleforge.ai',
    },
    () => {
      strictEqual(isStaffAppHost('usav.app.cycleforge.ai'), true);
      strictEqual(isStaffAppHost('app.cycleforge.ai'), true);
      strictEqual(isStaffAppHost('usav.kiosk.app.cycleforge.ai'), false);
      strictEqual(isStaffAppHost('localhost'), true);
    },
  );
});

test('isKioskHostAllowedPath allowlist', () => {
  strictEqual(isKioskHostAllowedPath('/'), true);
  strictEqual(isKioskHostAllowedPath('/kiosk'), true);
  strictEqual(isKioskHostAllowedPath('/kiosk/'), true);
  strictEqual(isKioskHostAllowedPath('/api/kiosk/pair'), true);
  strictEqual(isKioskHostAllowedPath('/api/kiosk/intake'), true);
  strictEqual(isKioskHostAllowedPath('/api/kiosk/repair/submit'), true);
  strictEqual(isKioskHostAllowedPath('/api/kiosk/repair/favorites'), true);
  strictEqual(isKioskHostAllowedPath('/api/kiosk/enroll'), false);
  strictEqual(isKioskHostAllowedPath('/api/kiosk/revoke'), false);
  strictEqual(isKioskHostAllowedPath('/api/kiosk/devices'), false);
  strictEqual(isKioskHostAllowedPath('/settings'), false);
  strictEqual(isKioskHostAllowedPath('/receiving'), false);
  strictEqual(isKioskHostAllowedPath('/_next/static/chunk.js'), true);
});

test('staffKioskRedirectOrigin — slug host, prod apex bridge, fail-closed', () => {
  withEnv(
    {
      NEXT_PUBLIC_KIOSK_HOST_SUFFIX: 'kiosk.app.cycleforge.ai',
      NEXT_PUBLIC_APP_URL: 'https://app.cycleforge.ai',
    },
    () => {
      strictEqual(
        staffKioskRedirectOrigin({ tenantSlug: 'usav', isProduction: true }),
        'https://usav.kiosk.app.cycleforge.ai',
      );
      strictEqual(
        staffKioskRedirectOrigin({
          tenantSlug: null,
          defaultTenantSlug: 'usav',
          isProduction: true,
        }),
        'https://usav.kiosk.app.cycleforge.ai',
      );
      // Non-prod apex keeps serving /kiosk for local E2E even when a bridge is set.
      strictEqual(
        staffKioskRedirectOrigin({
          tenantSlug: null,
          defaultTenantSlug: 'usav',
          isProduction: false,
        }),
        null,
      );
      strictEqual(
        staffKioskRedirectOrigin({
          tenantSlug: null,
          defaultTenantSlug: '',
          isProduction: true,
        }),
        null,
      );
      strictEqual(
        staffKioskRedirectOrigin({
          tenantSlug: 'kiosk',
          isProduction: true,
        }),
        null,
      );
    },
  );
});
