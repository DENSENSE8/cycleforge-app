import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  dashboardOrderHref,
  DEFAULT_TICKET_STATUS,
  parseSupportMode,
  parseTicketStatus,
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
    ] as const) {
      assert.ok(
        (SUPPORT_MODE_SCOPED_PARAMS as readonly string[]).includes(key),
        `expected ${key} in SUPPORT_MODE_SCOPED_PARAMS`,
      );
    }
    assert.equal(
      (SUPPORT_MODE_SCOPED_PARAMS as readonly string[]).includes('view'),
      false,
      'board|grid ?view= retired — not in scoped params',
    );
  });

  it('includes tickets workbench URL keys', () => {
    for (const key of ['ticket', 'tstatus', 'tq'] as const) {
      assert.ok(
        (SUPPORT_MODE_SCOPED_PARAMS as readonly string[]).includes(key),
        `expected ${key} in SUPPORT_MODE_SCOPED_PARAMS`,
      );
    }
  });
});

describe('parseTicketStatus', () => {
  it('defaults unknown / empty to open', () => {
    assert.equal(parseTicketStatus(null), DEFAULT_TICKET_STATUS);
    assert.equal(parseTicketStatus(undefined), 'open');
    assert.equal(parseTicketStatus(''), 'open');
    assert.equal(parseTicketStatus('nope'), 'open');
  });

  it('accepts known ticket status tabs', () => {
    assert.equal(parseTicketStatus('pending'), 'pending');
    assert.equal(parseTicketStatus('hold'), 'hold');
    assert.equal(parseTicketStatus('solved'), 'solved');
    assert.equal(parseTicketStatus('all'), 'all');
    assert.equal(parseTicketStatus('open'), 'open');
  });
});
