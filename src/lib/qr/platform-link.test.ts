import test from 'node:test';
import assert from 'node:assert/strict';
import { receivingPlatformLink, platformQrOriginForSlug, unitPlatformDigitalLink } from './platform-link';
import { resolveReceivingQrValue } from '@/lib/print/printReceivingLabel';
import { routeScan } from '@/lib/barcode-routing';
import { getPublicLandingUrl, parseOrgSettings } from '@/lib/tenancy/settings';

test('platformQrOriginForSlug builds tenant staff origin', () => {
  const prevApp = process.env.NEXT_PUBLIC_APP_URL;
  process.env.NEXT_PUBLIC_APP_URL = 'https://app.cycleforge.ai';
  try {
    assert.equal(platformQrOriginForSlug('usav'), 'https://usav.app.cycleforge.ai');
    assert.equal(platformQrOriginForSlug(''), null);
    assert.equal(platformQrOriginForSlug(null), null);
  } finally {
    if (prevApp === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
    else process.env.NEXT_PUBLIC_APP_URL = prevApp;
  }
});

test('receivingPlatformLink mints /m/r/{id} on slug host', () => {
  const prevApp = process.env.NEXT_PUBLIC_APP_URL;
  process.env.NEXT_PUBLIC_APP_URL = 'https://app.cycleforge.ai';
  try {
    assert.equal(
      receivingPlatformLink(42, 'acme'),
      'https://acme.app.cycleforge.ai/m/r/42',
    );
    assert.equal(receivingPlatformLink(42, null), 'R-42');
  } finally {
    if (prevApp === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
    else process.env.NEXT_PUBLIC_APP_URL = prevApp;
  }
});

test('resolveReceivingQrValue prefers platform link and keeps bare-handle override path', () => {
  const prevApp = process.env.NEXT_PUBLIC_APP_URL;
  process.env.NEXT_PUBLIC_APP_URL = 'https://app.cycleforge.ai';
  try {
    assert.equal(
      resolveReceivingQrValue({
        receivingId: 7,
        orgSlug: 'usav',
        scanValue: 'RCV-7',
        platform: 'eBay',
        notes: '',
        conditionCode: 'BRAND_NEW',
        date: '8/1/26',
      }),
      'https://usav.app.cycleforge.ai/m/r/7',
    );
    assert.equal(
      resolveReceivingQrValue({
        receivingId: 7,
        scanValue: 'RCV-7',
        platform: 'eBay',
        notes: '',
        conditionCode: 'BRAND_NEW',
        date: '8/1/26',
        qrValue: 'R-7',
      }),
      'R-7',
    );
  } finally {
    if (prevApp === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
    else process.env.NEXT_PUBLIC_APP_URL = prevApp;
  }
});

test('routeScan accepts platform Digital Link and bare R- handle', () => {
  const fromUrl = routeScan('https://usav.app.cycleforge.ai/m/r/99');
  assert.ok(fromUrl);
  assert.equal(fromUrl.type, 'receiving');
  assert.equal(fromUrl.redirect, '/m/r/99');

  const fromHandle = routeScan('R-99');
  assert.ok(fromHandle);
  assert.equal(fromHandle.type, 'receiving');
  assert.equal(fromHandle.redirect, '/m/r/99');
});

test('unitPlatformDigitalLink uses slug host for /01/…', () => {
  const prevApp = process.env.NEXT_PUBLIC_APP_URL;
  process.env.NEXT_PUBLIC_APP_URL = 'https://app.cycleforge.ai';
  try {
    assert.equal(
      unitPlatformDigitalLink({ orgSlug: 'usav', gtin: '00012345678905', serial: 'ABC' }),
      'https://usav.app.cycleforge.ai/01/00012345678905/21/ABC',
    );
  } finally {
    if (prevApp === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
    else process.env.NEXT_PUBLIC_APP_URL = prevApp;
  }
});

test('getPublicLandingUrl does not fall back to dogfood storefront', () => {
  assert.equal(getPublicLandingUrl(parseOrgSettings({})), '');
  assert.equal(
    getPublicLandingUrl(
      parseOrgSettings({ brand: { publicLandingUrl: 'https://shop.example.com/home' } }),
    ),
    'https://shop.example.com/home',
  );
  assert.equal(
    getPublicLandingUrl(parseOrgSettings({ brand: { publicLandingUrl: 'not-a-url' } })),
    '',
  );
});
