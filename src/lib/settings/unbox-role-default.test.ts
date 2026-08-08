import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { OrgSettings } from '@/lib/tenancy/settings';
import {
  getReceivingUnboxDefaultPins,
  getReceivingUnboxRoleDefaultPins,
} from './accessors';
import { resolveUnboxPinnedTabs } from '@/lib/receiving/unbox-default-pins';

const org = (o: Record<string, unknown>) => o as unknown as OrgSettings;

/** The server fold: role → org → []. */
const nonStaffDefault = (s: OrgSettings, role: string) =>
  resolveUnboxPinnedTabs({
    roleDefault: getReceivingUnboxRoleDefaultPins(s, role),
    orgDefault: getReceivingUnboxDefaultPins(s),
  });

test('org toggle resolves to the pin list', () => {
  assert.deepEqual(getReceivingUnboxDefaultPins(org({})), []);
  assert.deepEqual(
    getReceivingUnboxDefaultPins(org({ 'receiving.unboxDefaultPinnedExtraTabs': true })),
    ['incoming'],
  );
});

test('a per-role override wins over the org default (D9 server fold)', () => {
  const s = org({
    'receiving.unboxDefaultPinnedExtraTabs': false, // org OFF
    'receiving.unboxDefaultPinnedByRole.receiver': 'on', // receiver ON
    'receiving.unboxDefaultPinnedByRole.packer': 'off', // packer explicitly OFF
  });
  assert.deepEqual(nonStaffDefault(s, 'receiver'), ['incoming']); // role on beats org off
  assert.deepEqual(nonStaffDefault(s, 'receiving'), ['incoming']); // legacy alias → receiver key
  assert.deepEqual(nonStaffDefault(s, 'packer'), []); // explicit role off
  assert.deepEqual(nonStaffDefault(s, 'technician'), []); // inherit → org off
});

test('inherit (default / unset role) falls through to the org default', () => {
  const s = org({ 'receiving.unboxDefaultPinnedExtraTabs': true });
  assert.equal(getReceivingUnboxRoleDefaultPins(s, 'technician'), undefined); // inherit
  assert.deepEqual(nonStaffDefault(s, 'technician'), ['incoming']); // org ON
});

test('a role off beats an org on', () => {
  const s = org({
    'receiving.unboxDefaultPinnedExtraTabs': true, // org ON
    'receiving.unboxDefaultPinnedByRole.viewer': 'off', // viewer opted out
  });
  assert.deepEqual(nonStaffDefault(s, 'viewer'), []);
  assert.deepEqual(nonStaffDefault(s, 'receiver'), ['incoming']); // inherit → org on
});
