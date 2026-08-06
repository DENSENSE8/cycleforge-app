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

test('clearUnboxPeerRightEdgeSurfaces suspends details', () => {
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
    clearUnboxPeerRightEdgeSurfaces();
    assert.equal(detailsClosed, 1);
  } finally {
    globalThis.window = prev;
  }
});

test('clearPeerRightEdgeParams keeps display surface params when keep=display', () => {
  const params = new URLSearchParams(
    'openReceivingId=7&display=claim&claimMode=link&photoAction=move&ticketView=1&claimView=1',
  );
  clearPeerRightEdgeParams(params, 'display');
  // Only one surface — display — so keep leaves display params alone.
  assert.equal(params.get('display'), 'claim');
  assert.equal(params.get('claimMode'), 'link');
  assert.equal(params.get('openReceivingId'), '7');
});

test('clearAllUnboxRightEdgeParams drops display · nested · legacy peers', () => {
  const params = new URLSearchParams(
    'openReceivingId=7&display=classify&ticketView=1&claimView=1&claimMode=link&photoAction=send&linkageAction=note&unitsAction=prebox',
  );
  clearAllUnboxRightEdgeParams(params);
  assert.equal(params.get('display'), null);
  assert.equal(params.get('ticketView'), null);
  assert.equal(params.get('claimView'), null);
  assert.equal(params.get('claimMode'), null);
  assert.equal(params.get('photoAction'), null);
  assert.equal(params.get('linkageAction'), null);
  assert.equal(params.get('unitsAction'), null);
  assert.equal(params.get('openReceivingId'), '7');
});

test('Displays is the sole registered right-edge URL surface', () => {
  assert.deepEqual(Object.keys(UNBOX_RIGHT_EDGE_PARAMS), ['display']);
  assert.ok(UNBOX_RIGHT_EDGE_PARAMS.display.includes('display'));
  assert.ok(UNBOX_RIGHT_EDGE_PARAMS.display.includes('ticketAction'));
  assert.ok(UNBOX_RIGHT_EDGE_PARAMS.display.includes('unitsAction'));
  assert.ok(UNBOX_RIGHT_EDGE_PARAMS.display.includes('ticketView'));
  assert.ok(UNBOX_RIGHT_EDGE_PARAMS.display.includes('claimView'));
});

test('yieldUnboxStationPushesOnAssistantOpen clears URL once', () => {
  let urlClears = 0;
  let displayClears = 0;
  yieldUnboxStationPushesOnAssistantOpen({
    clearAllUrl: () => {
      urlClears += 1;
    },
    clearDisplay: () => {
      displayClears += 1;
    },
  });
  assert.equal(urlClears, 1);
  assert.equal(displayClears, 1);
});

test('LineEditPanel wires assistant open through yieldUnboxStationPushesOnAssistantOpen', () => {
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
    src.includes('useAssistantDockOpen'),
    'LineEditPanel must also reconcile cold localStorage hydrate via dock open',
  );
  assert.ok(
    src.includes('clearAllUnboxRightEdgeParams') || src.includes('setDisplay(null)'),
    'AI yield must clear Displays URL params',
  );
});
