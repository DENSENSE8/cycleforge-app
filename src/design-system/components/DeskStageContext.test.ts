import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isDeskSplitChord } from './DeskStageContext';

const key = (over: Partial<KeyboardEvent>) => ({
  key: 'S',
  code: 'KeyS',
  metaKey: false,
  ctrlKey: false,
  shiftKey: true,
  altKey: false,
  ...over,
});

describe('split chord (⌘/Ctrl+Shift+S, ⌘/Ctrl+S stays the browser save)', () => {
  it('fires on ⌘+Shift+S and Ctrl+Shift+S', () => {
    assert.equal(isDeskSplitChord(key({ metaKey: true })), true);
    assert.equal(isDeskSplitChord(key({ ctrlKey: true })), true);
  });

  it('leaves ⌘S / Ctrl+S alone', () => {
    assert.equal(isDeskSplitChord(key({ ctrlKey: true, shiftKey: false, key: 's' })), false);
    assert.equal(isDeskSplitChord(key({ metaKey: true, shiftKey: false, key: 's' })), false);
  });

  it('never fires on a key a wedge scanner can type (no ⌘/Ctrl)', () => {
    assert.equal(isDeskSplitChord(key({})), false);
    assert.equal(isDeskSplitChord(key({ altKey: true })), false);
  });

  it('is not an Alt chord', () => {
    assert.equal(isDeskSplitChord(key({ ctrlKey: true, altKey: true })), false);
  });

  it('matches the physical S key on a non-Latin layout', () => {
    assert.equal(isDeskSplitChord(key({ ctrlKey: true, key: 'Ы' })), true);
  });
});
