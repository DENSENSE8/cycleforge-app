import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildDisplayPending,
  parseUnboxDisplayParam,
  shouldClearDisplayOnLineChange,
} from './useUnboxDisplayView';
import { UNBOX_SIDE_TAB_ORDER } from '../unbox-side-tabs';
import {
  resolveOptimisticParam,
  shouldClearOptimisticParam,
} from '@/lib/routing/optimistic-url-param';

describe('parseUnboxDisplayParam', () => {
  it('accepts every real side tab', () => {
    for (const tab of UNBOX_SIDE_TAB_ORDER) {
      assert.equal(parseUnboxDisplayParam(tab), tab);
    }
  });

  it('accepts display=index as Root Index nav', () => {
    assert.equal(parseUnboxDisplayParam('index'), 'index');
  });

  it('treats absence as closed', () => {
    assert.equal(parseUnboxDisplayParam(null), null);
    assert.equal(parseUnboxDisplayParam(''), null);
  });

  it('rejects a bogus value rather than painting an empty column', () => {
    assert.equal(parseUnboxDisplayParam('not-a-tab'), null);
    assert.equal(parseUnboxDisplayParam('Listings'), null, 'case-sensitive — ids are lowercase');
  });

  it('rejects `overview` — the carton owns the centre, it is not a display', () => {
    assert.equal(parseUnboxDisplayParam('overview'), null);
  });

  it('rejects the browse-tab vocabulary, so `?display=` cannot shadow `?unboxview=`', () => {
    for (const browseTab of ['recent', 'queue', 'viewed']) {
      assert.equal(parseUnboxDisplayParam(browseTab), null);
    }
  });

  it('accepts legacy pairing / po-note as linkage', () => {
    assert.equal(parseUnboxDisplayParam('pairing'), 'linkage');
    assert.equal(parseUnboxDisplayParam('po-note'), 'linkage');
  });

  it('accepts ticket · photos; claim canonicalizes to ticket', () => {
    assert.equal(parseUnboxDisplayParam('ticket'), 'ticket');
    assert.equal(parseUnboxDisplayParam('photos'), 'photos');
    assert.equal(parseUnboxDisplayParam('claim'), 'ticket');
  });
});

describe('shouldClearDisplayOnLineChange', () => {
  it('clears on a genuine sibling-line switch while open', () => {
    assert.equal(shouldClearDisplayOnLineChange(11, 22, true), true);
  });

  it('stays put when the column is closed', () => {
    assert.equal(shouldClearDisplayOnLineChange(11, 22, false), false);
  });

  it('keeps a deep link open when prev line is null (mount / resolve)', () => {
    assert.equal(shouldClearDisplayOnLineChange(null, 22, true), false);
  });

  it('keeps open when the line id is unchanged', () => {
    assert.equal(shouldClearDisplayOnLineChange(22, 22, true), false);
  });

  it('keeps open when the current line becomes null', () => {
    assert.equal(shouldClearDisplayOnLineChange(22, null, true), false);
  });
});

describe('buildDisplayPending (domain snapshot)', () => {
  it('snapshots nested photo / ticket intents for the same-commit paint', () => {
    const photos = buildDisplayPending('photos', { photoAction: 'send' }, null);
    assert.equal(photos.photoAction, 'send');
    const claim = buildDisplayPending(
      'ticket',
      { ticketAction: 'claim', claimMode: 'link' },
      null,
    );
    assert.equal(claim.ticketActionRaw, 'claim');
    assert.equal(claim.claimMode, 'link');
  });

  it('paints via the shared optimistic SoT (display key only)', () => {
    const pending = buildDisplayPending('index', undefined, null);
    assert.equal(resolveOptimisticParam(null, pending.display), 'index');
    assert.equal(shouldClearOptimisticParam('index', pending.display), true);
    assert.equal(
      shouldClearOptimisticParam('index', buildDisplayPending('photos', undefined, null).display),
      false,
      'index→leaf race stays on the shared SoT',
    );
  });
});
