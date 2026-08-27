import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  dashboardOrderHref,
  DEFAULT_TICKET_STATUS,
  parseSupportMode,
  parseSupportModeWire,
  parseTicketStatus,
  supportCreateTicketHref,
  supportOrdersHref,
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

describe('parseSupportModeWire', () => {
  it('keeps tickets (default deep-link) and rejects garbage', () => {
    assert.equal(parseSupportModeWire('tickets'), 'tickets');
    assert.equal(parseSupportModeWire('voicemail'), 'voicemail');
    assert.equal(parseSupportModeWire('nope'), null);
  });
});

describe('support order hrefs', () => {
  it('builds Support Inquiries deep links onto the shared To-ship desk', () => {
    assert.equal(
      supportOrdersHref(42),
      '/shipping/orders?context=support&openOrderId=42',
    );
    assert.equal(supportOrdersHref(0), '/shipping/orders?context=support');
    assert.equal(supportOrdersHref(Number.NaN), '/shipping/orders?context=support');
  });

  it('builds To-ship escape-hatch hrefs', () => {
    assert.equal(dashboardOrderHref(99), '/shipping/orders?openOrderId=99');
    assert.equal(dashboardOrderHref(-1), '/shipping/orders');
  });

  it('builds create-ticket deep links from order pk', () => {
    assert.equal(
      supportCreateTicketHref(42),
      '/shipping/orders?context=support&openOrderId=42&createTicket=1',
    );
    assert.equal(
      supportCreateTicketHref(0),
      '/shipping/orders?context=support&createTicket=1',
    );
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
