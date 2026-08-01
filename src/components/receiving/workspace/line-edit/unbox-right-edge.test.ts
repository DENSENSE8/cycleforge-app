import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clearUnboxPeerRightEdgeSurfaces } from './unbox-right-edge';

test('clearUnboxPeerRightEdgeSurfaces closes open Claim and Ticket', () => {
  let claim = true;
  let ticket = true;
  let detailsClosed = 0;
  const prev = globalThis.window;
  // @ts-expect-error test stub
  globalThis.window = {
    dispatchEvent: (e: Event) => {
      if (e.type === 'receiving-close-details-overlay') detailsClosed += 1;
      return true;
    },
  };
  try {
    clearUnboxPeerRightEdgeSurfaces({
      claimView: claim,
      ticketView: ticket,
      setClaimView: (on) => {
        claim = on;
      },
      setTicketView: (on) => {
        ticket = on;
      },
    });
    assert.equal(claim, false);
    assert.equal(ticket, false);
    assert.equal(detailsClosed, 1);
  } finally {
    globalThis.window = prev;
  }
});

test('clearUnboxPeerRightEdgeSurfaces still suspends details when peers already closed', () => {
  let detailsClosed = 0;
  const prev = globalThis.window;
  // @ts-expect-error test stub
  globalThis.window = {
    dispatchEvent: (e: Event) => {
      if (e.type === 'receiving-close-details-overlay') detailsClosed += 1;
      return true;
    },
  };
  try {
    clearUnboxPeerRightEdgeSurfaces({
      claimView: false,
      ticketView: false,
      setClaimView: () => {
        assert.fail('should not clear closed Claim');
      },
      setTicketView: () => {
        assert.fail('should not clear closed Ticket');
      },
    });
    assert.equal(detailsClosed, 1);
  } finally {
    globalThis.window = prev;
  }
});
