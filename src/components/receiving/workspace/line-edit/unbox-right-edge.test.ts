import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  UNBOX_RIGHT_EDGE_PARAMS,
  clearAllUnboxRightEdgeParams,
  clearPeerRightEdgeParams,
  clearUnboxPeerRightEdgeSurfaces,
  yieldUnboxStationPushesOnAssistantOpen,
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

test('clearAllUnboxRightEdgeParams drops ticket · claim · display', () => {
  const params = new URLSearchParams(
    'openReceivingId=7&display=classify&ticketView=1&claimView=1&claimMode=link',
  );
  clearAllUnboxRightEdgeParams(params);
  assert.equal(params.get('display'), null);
  assert.equal(params.get('ticketView'), null);
  assert.equal(params.get('claimView'), null);
  assert.equal(params.get('claimMode'), null);
  assert.equal(params.get('openReceivingId'), '7');
});

test('every right-edge surface is registered — a fourth cannot be added silently', () => {
  // A new push column that forgets to register here would not be cleared by its
  // peers, which is precisely how two columns end up open at once.
  assert.deepEqual(Object.keys(UNBOX_RIGHT_EDGE_PARAMS).sort(), ['claim', 'display', 'ticket']);
});

test('yieldUnboxStationPushesOnAssistantOpen closes Ticket · Claim · display · tool', () => {
  let urlClears = 0;
  let displayClears = 0;
  let toolCloses = 0;
  yieldUnboxStationPushesOnAssistantOpen({
    clearAllUrl: () => {
      urlClears += 1;
    },
    clearDisplay: () => {
      displayClears += 1;
    },
    closeToolPush: () => {
      toolCloses += 1;
    },
  });
  assert.equal(urlClears, 1);
  assert.equal(displayClears, 1);
  assert.equal(toolCloses, 1);
});

test('yieldUnboxStationPushesOnAssistantOpen still clears display + tool when URL peers closed', () => {
  let urlClears = 0;
  let displayClears = 0;
  let toolCloses = 0;
  yieldUnboxStationPushesOnAssistantOpen({
    clearAllUrl: () => {
      urlClears += 1;
    },
    clearDisplay: () => {
      displayClears += 1;
    },
    closeToolPush: () => {
      toolCloses += 1;
    },
  });
  assert.equal(urlClears, 1, 'always one URL write (clearAllUnboxRightEdgeParams)');
  assert.equal(displayClears, 1);
  assert.equal(toolCloses, 1);
});

test('LineEditPanel wires assistant open through yieldUnboxStationPushesOnAssistantOpen', () => {
  // A local re-implementation of the yield (or dropping the helper) is how dual
  // right columns come back. Pin the call site, not just the pure helper.
  const src = readFileSync(
    resolve(import.meta.dirname, '../LineEditPanel.tsx'),
    'utf8',
  );
  assert.ok(
    src.includes('yieldUnboxStationPushesOnAssistantOpen'),
    'LineEditPanel must call yieldUnboxStationPushesOnAssistantOpen on AI open',
  );
  assert.ok(
    src.includes('ASSISTANT_DOCK_OPEN_EVENT'),
    'LineEditPanel must listen for ASSISTANT_DOCK_OPEN_EVENT (Sparkles / ⌘J)',
  );
  assert.ok(
    src.includes('setClaimView(false)'),
    'AI yield must clear Claim via setClaimView(false) (same path as →|)',
  );
  assert.ok(
    src.includes('useAssistantDockOpen'),
    'LineEditPanel must also reconcile cold localStorage hydrate via dock open',
  );
});
