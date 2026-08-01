import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  UNBOX_RIGHT_EDGE_PARAMS,
  clearPeerRightEdgeParams,
  clearUnboxPeerRightEdgeSurfaces,
} from './unbox-right-edge';

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

test('clearPeerRightEdgeParams drops every peer surface but keeps the one opening', () => {
  // The regression this exists for: opening Claim left `?display=` behind, so a
  // reload reopened two right-edge surfaces at once.
  const params = new URLSearchParams(
    'openReceivingId=7&display=classify&ticketView=1&claimView=1&claimMode=link',
  );
  clearPeerRightEdgeParams(params, 'claim');
  assert.equal(params.get('display'), null);
  assert.equal(params.get('ticketView'), null);
  // Its own params are untouched — the caller sets them around this call.
  assert.equal(params.get('claimView'), '1');
  assert.equal(params.get('claimMode'), 'link');
  // Unrelated params survive: this is an exclusion, not a URL reset.
  assert.equal(params.get('openReceivingId'), '7');
});

test('clearPeerRightEdgeParams is symmetric across all three surfaces', () => {
  for (const keep of ['ticket', 'claim', 'display'] as const) {
    const params = new URLSearchParams('display=units&ticketView=1&claimView=1&claimMode=link');
    clearPeerRightEdgeParams(params, keep);
    const open = [
      params.has('display') ? 'display' : null,
      params.has('ticketView') ? 'ticket' : null,
      params.has('claimView') ? 'claim' : null,
    ].filter(Boolean);
    assert.deepEqual(open, [keep], `${keep}: exactly one right-edge surface may stay in the URL`);
  }
});

test('every right-edge surface is registered — a fourth cannot be added silently', () => {
  // A new push column that forgets to register here would not be cleared by its
  // peers, which is precisely how two columns end up open at once.
  assert.deepEqual(Object.keys(UNBOX_RIGHT_EDGE_PARAMS).sort(), ['claim', 'display', 'ticket']);
});
