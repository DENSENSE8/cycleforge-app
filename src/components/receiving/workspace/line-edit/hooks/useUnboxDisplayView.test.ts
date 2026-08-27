import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildDisplayPending,
  parseUnboxDisplayParam,
  shouldClearDisplayOnRecordChange,
} from './useUnboxDisplayView';
import {
  parseUnboxLinkageAction,
  UNBOX_SIDE_TAB_ORDER,
  type UnboxLinkageAction,
} from '../unbox-side-tabs';

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

  it('rejects the browse-tab vocabulary, so display ids cannot shadow `?unboxview=`', () => {
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

describe('shouldClearDisplayOnRecordChange', () => {
  it('clears on a genuine carton→carton switch while open', () => {
    assert.equal(shouldClearDisplayOnRecordChange(11, 22, true), true);
  });

  it('stays put when the column is closed', () => {
    assert.equal(shouldClearDisplayOnRecordChange(11, 22, false), false);
  });

  it('keeps open when prev record is null (mount / resolve)', () => {
    assert.equal(shouldClearDisplayOnRecordChange(null, 22, true), false);
  });

  it('keeps open when the carton is unchanged (sibling child switch)', () => {
    // Both children of one carton pass the SAME receiving_id here, so this is
    // exactly what a sibling switch looks like — the column must NOT flash.
    assert.equal(shouldClearDisplayOnRecordChange(22, 22, true), false);
  });

  it('keeps open when the current record becomes null', () => {
    assert.equal(shouldClearDisplayOnRecordChange(22, null, true), false);
  });
});

describe('buildDisplayPending (local snapshot)', () => {
  it('snapshots nested photo / ticket intents for the same-commit paint', () => {
    const photos = buildDisplayPending('photos', { photoAction: 'send' });
    assert.equal(photos.photoAction, 'send');
    const claim = buildDisplayPending('ticket', {
      ticketAction: 'claim',
      claimMode: 'link',
    });
    assert.equal(claim.ticketActionRaw, 'claim');
    assert.equal(claim.claimMode, 'link');
  });

  it('closes to a null display with default nest', () => {
    const closed = buildDisplayPending(null, undefined);
    assert.equal(closed.display, null);
    assert.equal(closed.photoAction, 'actions');
    assert.equal(closed.claimMode, 'link');
  });

  it('defaults claimMode to link when opening claim without an explicit mode', () => {
    const claim = buildDisplayPending('ticket', { ticketAction: 'claim' });
    assert.equal(claim.ticketActionRaw, 'claim');
    assert.equal(claim.claimMode, 'link');
  });

  it('honors explicit create claimMode', () => {
    const claim = buildDisplayPending('ticket', {
      ticketAction: 'claim',
      claimMode: 'create',
    });
    assert.equal(claim.claimMode, 'create');
  });

  it('maps linkage actions list as empty nest (Back target for Link · Note)', () => {
    const actions = buildDisplayPending('linkage', { linkageAction: 'actions' });
    assert.equal(actions.display, 'linkage');
    assert.equal(actions.linkageActionRaw, null);
    const link = buildDisplayPending('linkage', { linkageAction: 'link' });
    assert.equal(link.linkageActionRaw, 'link');
  });

  /**
   * Every linkage drill must SURVIVE the round trip, or its row is a dead
   * button. `return` shipped 2026-08-19 with a parser that accepted it and a
   * leaf that rendered it, while this writer quietly mapped it to `null` — so
   * clicking Return # landed back on the actions list and looked like nothing
   * happened. Enumerating the union here means the next drill added to
   * `UnboxLinkageAction` fails until the writer knows about it.
   */
  it('every linkage drill round-trips writer → parser (no silently dropped verb)', () => {
    const gates = { hasPoNoteTab: true };
    const drills: UnboxLinkageAction[] = ['link', 'return', 'note'];
    for (const drill of drills) {
      const snap = buildDisplayPending('linkage', { linkageAction: drill });
      assert.equal(snap.display, 'linkage');
      assert.equal(
        snap.linkageActionRaw,
        drill,
        `${drill} must reach the URL snapshot — null falls back to the actions list`,
      );
      assert.equal(parseUnboxLinkageAction(snap.linkageActionRaw, gates), drill);
    }
    // `actions` is the one that legitimately writes null — it IS the fallback.
    assert.equal(
      buildDisplayPending('linkage', { linkageAction: 'actions' }).linkageActionRaw,
      null,
    );
  });

  it('maps legacy po-note raw id to linkage note nest', () => {
    const note = buildDisplayPending('linkage', undefined, 'po-note');
    assert.equal(note.display, 'linkage');
    assert.equal(note.linkageActionRaw, 'note');
  });
});
