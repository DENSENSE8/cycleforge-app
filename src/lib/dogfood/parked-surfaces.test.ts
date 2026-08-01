import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PARKED_SURFACE_KEYS,
  PARKED_SURFACE_META,
  PARKED_SIDEBAR_NAV_IDS,
  getParkedSurfaceMeta,
  isParkedSurfaceKey,
  isParkedSurfaceLive,
} from '@/lib/dogfood/parked-surfaces';

test('every parked key has complete meta', () => {
  for (const key of PARKED_SURFACE_KEYS) {
    const meta = getParkedSurfaceMeta(key);
    assert.equal(meta.key, key);
    assert.ok(meta.label.trim().length > 0, `${key} label`);
    assert.ok(meta.href.startsWith('/'), `${key} href`);
    assert.ok(meta.blurb.trim().length > 0, `${key} blurb`);
    assert.ok(meta.primaryCta.href.startsWith('/'), `${key} primary href`);
    assert.ok(meta.primaryCta.label.trim().length > 0, `${key} primary label`);
  }
  assert.equal(Object.keys(PARKED_SURFACE_META).length, PARKED_SURFACE_KEYS.length);
});

test('PARKED_SIDEBAR_NAV_IDS matches PARKED_SURFACE_KEYS', () => {
  assert.equal(PARKED_SIDEBAR_NAV_IDS.size, PARKED_SURFACE_KEYS.length);
  for (const key of PARKED_SURFACE_KEYS) {
    assert.equal(isParkedSurfaceKey(key), true);
    assert.equal(PARKED_SIDEBAR_NAV_IDS.has(key), true);
  }
  assert.equal(isParkedSurfaceKey('dashboard'), false);
});

test('isParkedSurfaceLive: default parked; only explicit flags unlock', () => {
  const saved = {
    DOGFOOD_FULL_SURFACE: process.env.DOGFOOD_FULL_SURFACE,
    NEXT_PUBLIC_DOGFOOD_FULL_SURFACE: process.env.NEXT_PUBLIC_DOGFOOD_FULL_SURFACE,
  };

  const clear = () => {
    delete process.env.DOGFOOD_FULL_SURFACE;
    delete process.env.NEXT_PUBLIC_DOGFOOD_FULL_SURFACE;
  };

  try {
    clear();
    assert.equal(isParkedSurfaceLive(), false, 'default is parked');

    process.env.DOGFOOD_FULL_SURFACE = '1';
    assert.equal(isParkedSurfaceLive(), true, 'DOGFOOD_FULL_SURFACE unlocks');

    clear();
    process.env.NEXT_PUBLIC_DOGFOOD_FULL_SURFACE = 'true';
    assert.equal(isParkedSurfaceLive(), true, 'NEXT_PUBLIC override unlocks');

    clear();
    process.env.DOGFOOD_FULL_SURFACE = '0';
    assert.equal(isParkedSurfaceLive(), false, 'explicit false stays parked');
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
});

test('isParkedSurfaceBlocked is true for parked keys when locked', async () => {
  const { isParkedSurfaceBlocked } = await import('@/lib/dogfood/parked-surfaces');
  const saved = process.env.DOGFOOD_FULL_SURFACE;
  const savedPub = process.env.NEXT_PUBLIC_DOGFOOD_FULL_SURFACE;
  try {
    delete process.env.DOGFOOD_FULL_SURFACE;
    delete process.env.NEXT_PUBLIC_DOGFOOD_FULL_SURFACE;
    assert.equal(isParkedSurfaceBlocked('fba'), true);
    assert.equal(isParkedSurfaceBlocked('dashboard'), false);
    process.env.DOGFOOD_FULL_SURFACE = '1';
    assert.equal(isParkedSurfaceBlocked('fba'), false);
  } finally {
    if (saved === undefined) delete process.env.DOGFOOD_FULL_SURFACE;
    else process.env.DOGFOOD_FULL_SURFACE = saved;
    if (savedPub === undefined) delete process.env.NEXT_PUBLIC_DOGFOOD_FULL_SURFACE;
    else process.env.NEXT_PUBLIC_DOGFOOD_FULL_SURFACE = savedPub;
  }
});
