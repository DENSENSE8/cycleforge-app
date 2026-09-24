import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { claimOverlay, hasOpenOverlay } from './store';

describe('claimOverlay topmost', () => {
  it('only the newest held claim is topmost; releasing it hands Escape back to the one below', () => {
    const sheet = claimOverlay();
    const confirm = claimOverlay();
    assert.equal(sheet.isTopmost(), false);
    assert.equal(confirm.isTopmost(), true);

    confirm.release();
    assert.equal(confirm.isTopmost(), false);
    assert.equal(sheet.isTopmost(), true);

    sheet.release();
    assert.equal(hasOpenOverlay(), false);
  });

  it('releasing a lower claim out of order keeps the top claim on top', () => {
    const a = claimOverlay();
    const b = claimOverlay();
    const c = claimOverlay();
    b.release();
    assert.equal(c.isTopmost(), true);
    c.release();
    assert.equal(a.isTopmost(), true);
    a.release();
    b.release();
    assert.equal(hasOpenOverlay(), false);
  });
});
