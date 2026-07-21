import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  dashboardOrderHref,
  parseSupportMode,
  supportOrdersHref,
  SUPPORT_MODE_SCOPED_PARAMS,
} from './support-sidebar-shared';

describe('parseSupportMode', () => {
  it('defaults unknown / empty to tickets', () => {
    assert.equal(parseSupportMode(null), 'tickets');
    assert.equal(parseSupportMode(undefined), 'tickets');
    assert.equal(parseSupportMode(''), 'tickets');
    assert.equal(parseSupportMode('nope'), 'tickets');
  });

  it('accepts known modes including orders', () => {
    assert.equal(parseSupportMode('voicemail'), 'voicemail');
    assert.equal(parseSupportMode('calls'), 'calls');
    assert.equal(parseSupportMode('warranty'), 'warranty');
    assert.equal(parseSupportMode('issues'), 'issues');
    assert.equal(parseSupportMode('orders'), 'orders');
  });
});

describe('support order hrefs', () => {
  it('builds Support Orders deep links from order pk', () => {
    assert.equal(supportOrdersHref(42), '/support?mode=orders&openOrderId=42');
    assert.equal(supportOrdersHref(0), '/support?mode=orders');
    assert.equal(supportOrdersHref(Number.NaN), '/support?mode=orders');
  });

  it('builds Dashboard escape-hatch hrefs', () => {
    assert.equal(dashboardOrderHref(99), '/dashboard?openOrderId=99');
    assert.equal(dashboardOrderHref(-1), '/dashboard');
  });
});

describe('SUPPORT_MODE_SCOPED_PARAMS', () => {
  it('includes orders-owned URL keys', () => {
    for (const key of [
      'openOrderId',
      'ustatus',
      'attention',
      'stage',
      'staff',
      'view',
    ] as const) {
      assert.ok(
        (SUPPORT_MODE_SCOPED_PARAMS as readonly string[]).includes(key),
        `expected ${key} in SUPPORT_MODE_SCOPED_PARAMS`,
      );
    }
  });
});
