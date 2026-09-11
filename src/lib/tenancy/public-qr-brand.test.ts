/**
 * Unit tests for public QR brand mapping (no DB).
 * Run: `node --import tsx --test src/lib/tenancy/public-qr-brand.test.ts`
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { parseOrgSettings } from './settings';
import {
  EMPTY_PUBLIC_QR_BRAND,
  publicQrBrandFromOrg,
} from './public-qr-brand-map';

test('publicQrBrandFromOrg prefers brand.name then org name then slug', () => {
  assert.equal(
    publicQrBrandFromOrg({
      slug: 'acme',
      name: 'Acme Fulfillment',
      settings: parseOrgSettings({}),
    }).brandName,
    'Acme Fulfillment',
  );
  assert.equal(
    publicQrBrandFromOrg({
      slug: 'acme',
      name: 'Acme Fulfillment',
      settings: parseOrgSettings({ brand: { name: 'Acme Shop' } }),
    }).brandName,
    'Acme Shop',
  );
});

test('publicQrBrandFromOrg never falls back to a dogfood storefront', () => {
  const brand = publicQrBrandFromOrg({
    slug: 'acme',
    name: 'Acme',
    settings: parseOrgSettings({}),
  });
  assert.equal(brand.publicLandingUrl, '');
  assert.equal(brand.logoUrl, null);
});

test('publicQrBrandFromOrg copies valid landing URL and logo', () => {
  const brand = publicQrBrandFromOrg({
    slug: 'acme',
    name: 'Acme',
    settings: parseOrgSettings({
      brand: {
        logoUrl: 'https://cdn.example.com/logo.png',
        publicLandingUrl: 'https://shop.example.com/home',
      },
    }),
  });
  assert.equal(brand.logoUrl, 'https://cdn.example.com/logo.png');
  assert.equal(brand.publicLandingUrl, 'https://shop.example.com/home');
});

test('empty brand payload is unbranded Cycle Forge shell', () => {
  assert.equal(EMPTY_PUBLIC_QR_BRAND.brandName, 'Cycle Forge');
  assert.equal(EMPTY_PUBLIC_QR_BRAND.publicLandingUrl, '');
});
