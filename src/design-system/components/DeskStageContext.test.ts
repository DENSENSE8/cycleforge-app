import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isDeskFloorChord } from './DeskStageContext';

const key = (over: Partial<KeyboardEvent>) => ({
  key: 'F',
  code: 'KeyF',
  metaKey: false,
  ctrlKey: false,
  shiftKey: true,
  altKey: false,
  ...over,
});

describe('floor chord (owner 2026-09-26: ⌘/Ctrl+Shift+F, Ctrl/⌘+F stays browser find)', () => {
  it('fires on ⌘+Shift+F and Ctrl+Shift+F', () => {
    assert.equal(isDeskFloorChord(key({ metaKey: true })), true);
    assert.equal(isDeskFloorChord(key({ ctrlKey: true })), true);
  });

  it('leaves ⌘F / Ctrl+F to the browser find bar', () => {
    assert.equal(isDeskFloorChord(key({ ctrlKey: true, shiftKey: false, key: 'f' })), false);
    assert.equal(isDeskFloorChord(key({ metaKey: true, shiftKey: false, key: 'f' })), false);
  });

  it('never fires on a key a wedge scanner can type (no ⌘/Ctrl)', () => {
    assert.equal(isDeskFloorChord(key({})), false);
    assert.equal(isDeskFloorChord(key({ altKey: true })), false);
  });

  it('is not an Alt chord (Ctrl+Alt+Shift+F is someone else’s)', () => {
    assert.equal(isDeskFloorChord(key({ ctrlKey: true, altKey: true })), false);
  });

  it('matches the physical F key on a non-Latin layout', () => {
    assert.equal(isDeskFloorChord(key({ ctrlKey: true, key: 'А' })), true);
  });
});
