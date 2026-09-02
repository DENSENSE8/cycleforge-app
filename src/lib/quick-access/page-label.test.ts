import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  displayQuickAccessLabel,
  resolveQuickAccessLabel,
  resolveQuickAccessLabelFromLocation,
} from './page-label';

describe('resolveQuickAccessLabel', () => {
  it('uses MasterNav L1 names, not desk tabs or stale titles', () => {
    assert.equal(resolveQuickAccessLabel('/shipping/orders'), 'Shipping');
    assert.equal(resolveQuickAccessLabel('/shipping/shipped'), 'Shipping');
    assert.equal(resolveQuickAccessLabel('/shipping/scan-out'), 'Scan out');
    assert.equal(resolveQuickAccessLabel('/ops/photos'), 'Media Library');
    assert.equal(resolveQuickAccessLabel('/test?view=testing'), 'Quality Control');
    assert.equal(resolveQuickAccessLabel('/unbox'), 'Unbox');
  });

  it('does not prefer document.title', () => {
    assert.equal(
      resolveQuickAccessLabelFromLocation('/shipping/orders', null, 'Acme'),
      'Shipping',
    );
  });

  it('repaints stored outdated pin labels from the href', () => {
    assert.equal(
      displayQuickAccessLabel('/ops/photos', 'Media'),
      'Media Library',
    );
    assert.equal(
      displayQuickAccessLabel('/shipping/orders', 'Shipping · To ship'),
      'Shipping',
    );
    assert.equal(
      displayQuickAccessLabel('/shipping/scan-out', 'Shipping'),
      'Scan out',
    );
  });
});
