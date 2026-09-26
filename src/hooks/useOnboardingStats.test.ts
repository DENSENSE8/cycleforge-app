/**
 * DB-free unit tests for the first-run predicate behind the To-ship queue's teaching state.
 * The defect this pins (operator 2026-09-14): `/shipping/orders` showed
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { orgHasActivity } from './useOnboardingStats';
import { EMPTY_ONBOARDING_STATS, type OnboardingStats } from '@/lib/onboarding/steps';

function stats(overrides: Partial<OnboardingStats> = {}): OnboardingStats {
  return { ...EMPTY_ONBOARDING_STATS, ...overrides };
}

test('a brand-new org has no activity — the only state that may teach setup', () => {
  assert.equal(orgHasActivity(stats()), false);
});

test('one ingested order is activity, however empty the queue is today', () => {
  // The reported case: orders exist, the to-ship lane has simply drained.
  assert.equal(orgHasActivity(stats({ orders: 4422 })), true);
  assert.equal(orgHasActivity(stats({ orders: 1 })), true);
});

test('a connected channel is activity before the first order arrives', () => {
  // An org mid-setup that has linked eBay must not be told to connect a
  // channel — it did. Its empty queue means "nothing synced yet".
  assert.equal(orgHasActivity(stats({ integrationsConnected: 1 })), true);
});

test('inbound-only activity counts — a receiving-first org is not fresh', () => {
  assert.equal(orgHasActivity(stats({ receivingLines: 12 })), true);
});

test('UNKNOWN is not new: undefined stats answer undefined, never false', () => {
  // Loading and failed reads both land here. Returning `false` would make a
  // network blip teach an established org to set itself up — the exact defect.
  assert.equal(orgHasActivity(undefined), undefined);
});

test('staff alone is not order activity', () => {
  // Staff exist the moment an org is provisioned, so counting them would make
  // every org look active and the teaching state unreachable.
  assert.equal(orgHasActivity(stats({ staff: 9 })), false);
});
