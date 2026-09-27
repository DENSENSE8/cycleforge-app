import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  UNBOX_RIGHT_EDGE_PARAMS,
  clearAllUnboxRightEdgeParams,
  clearPeerRightEdgeParams,
  stripStaleUnboxRightEdgeParamsFromUrl,
} from './unbox-right-edge';

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

test('Displays is the sole registered right-edge URL surface (stale-strip inventory)', () => {
  assert.deepEqual(Object.keys(UNBOX_RIGHT_EDGE_PARAMS), ['display']);
  assert.ok(UNBOX_RIGHT_EDGE_PARAMS.display.includes('display'));
  assert.ok(UNBOX_RIGHT_EDGE_PARAMS.display.includes('ticketAction'));
  assert.ok(UNBOX_RIGHT_EDGE_PARAMS.display.includes('unitsAction'));
  assert.ok(UNBOX_RIGHT_EDGE_PARAMS.display.includes('ticketView'));
  assert.ok(UNBOX_RIGHT_EDGE_PARAMS.display.includes('claimView'));
});

test('stripStaleUnboxRightEdgeParamsFromUrl uses silent replaceState', () => {
  let replaced: string | null = null;
  const prev = globalThis.window;
  // @ts-expect-error test stub
  globalThis.window = {
    location: {
      pathname: '/unbox',
      search: '?openReceivingId=7&display=photos&photoAction=send',
    },
    history: {
      state: null,
      replaceState: (_s: unknown, _t: string, url: string) => {
        replaced = url;
      },
    },
  };
  try {
    stripStaleUnboxRightEdgeParamsFromUrl();
    assert.equal(replaced, '/unbox?openReceivingId=7');
  } finally {
    globalThis.window = prev;
  }
});
