import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  SLOT_ACTION_OVERLAY_V1_VERB,
  trackingHoverMenuHasActions,
} from './slot-action-overlay';

describe('slot-action overlay v1', () => {
  it('the only shipped verb is label', () => {
    assert.equal(SLOT_ACTION_OVERLAY_V1_VERB, 'label');
  });

  it('plain tracking with no URL and no extras stays a copy chip', () => {
    assert.equal(
      trackingHoverMenuHasActions({ trackingUrl: null, hasEdit: false, extraCount: 0 }),
      false,
    );
  });

  it('Label extra mounts the hover menu even when Open/Edit are absent', () => {
    assert.equal(
      trackingHoverMenuHasActions({ trackingUrl: null, hasEdit: false, extraCount: 1 }),
      true,
    );
  });

  it('carrier Open still mounts the menu without extras', () => {
    assert.equal(
      trackingHoverMenuHasActions({
        trackingUrl: 'https://tools.usps.com/go/TrackConfirmAction',
        hasEdit: false,
        extraCount: 0,
      }),
      true,
    );
  });
});
