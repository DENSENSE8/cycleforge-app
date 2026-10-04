import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  MOBILE_V2_FBM_DESTINATIONS,
  MOBILE_V2_DESTINATIONS,
  MOBILE_V2_FULFILLMENT_DESTINATIONS,
  MOBILE_V2_NAVIGATION_FAMILIES,
  MOBILE_V2_OPERATION_GROUPS,
} from './mobile-v2-destinations';
import { DOMAIN_GROUPS } from '@/lib/nav/lanes';
import { spineParentTone } from '@/lib/nav/spine-parent-tone';
import {
  SPINE_NAVIGATION_BAND_ORDER,
  spineNavigationBandTitle,
} from '@/lib/nav/spine-navigation-band';

describe('Mobile V2 navigation contract', () => {
  it('keeps the Fulfillment hierarchy aligned with desktop', () => {
    assert.deepEqual(
      MOBILE_V2_FULFILLMENT_DESTINATIONS.map(({ id, label }) => ({ id, label })),
      [
        { id: 'fulfilled', label: 'Fulfilled' },
        { id: 'fbm', label: 'FBM' },
        { id: 'fba', label: 'FBA' },
        { id: 'label-intake', label: 'Labels & docs' },
      ],
    );
    assert.equal(MOBILE_V2_FULFILLMENT_DESTINATIONS.find(({ id }) => id === 'fbm')?.ported, undefined);
    assert.ok(
      MOBILE_V2_FULFILLMENT_DESTINATIONS
        .filter(({ id }) => id !== 'fbm')
        .every(({ ported }) => ported === false),
    );
  });

  it('has one Stock and one Products destination without adjustment forks', () => {
    const ids = MOBILE_V2_DESTINATIONS.map(({ id }) => id);
    assert.equal(ids.filter((id) => id === 'stock').length, 1);
    assert.equal(ids.filter((id) => id === 'products').length, 1);
    assert.equal(ids.includes('scan-adjust'), false);
  });

  it('exposes the live reports surface to operations viewers', () => {
    const reports = MOBILE_V2_DESTINATIONS.find(({ id }) => id === 'reports');
    assert.deepEqual(
      reports && { label: reports.label, href: reports.href, requires: reports.requires },
      { label: 'Reports', href: '/m/reports', requires: 'operations.view' },
    );
  });

  it('projects the desktop families in canonical order — Workspace · Operations · Utilities, no Management', () => {
    assert.deepEqual(
      MOBILE_V2_NAVIGATION_FAMILIES.map(({ id, label }) => ({ id, label })),
      SPINE_NAVIGATION_BAND_ORDER.map((id) => ({ id, label: spineNavigationBandTitle(id) })),
    );
    assert.deepEqual(MOBILE_V2_NAVIGATION_FAMILIES.map(({ label }) => label), ['Workspace', 'Operations', 'Utilities']);
  });

  it('uses the desktop station-first Operations branch order and domain identity', () => {
    assert.deepEqual(
      MOBILE_V2_OPERATION_GROUPS.map(({ id, label }) => ({ id, label })),
      [
        { id: 'floor', label: 'Scan Stations' },
        ...DOMAIN_GROUPS.filter(({ id }) => id !== 'support').map(({ id, label }) => ({ id, label })),
      ],
    );
    for (const group of MOBILE_V2_OPERATION_GROUPS.filter(({ id }) => id !== 'floor')) {
      const desktop = DOMAIN_GROUPS.find(({ id }) => id === group.id);
      assert.equal(group.icon, desktop?.icon);
      assert.equal(group.tone, spineParentTone(group.id).icon);
    }
  });

  it('keeps each phone leaf in one parent and FBM as the only nested task group', () => {
    const groupedIds = MOBILE_V2_OPERATION_GROUPS.flatMap(({ destinations }) =>
      destinations.map(({ id }) => id),
    );
    assert.equal(new Set(groupedIds).size, groupedIds.length);
    assert.deepEqual(MOBILE_V2_FBM_DESTINATIONS.map(({ id }) => id), ['orders']);
  });
});
