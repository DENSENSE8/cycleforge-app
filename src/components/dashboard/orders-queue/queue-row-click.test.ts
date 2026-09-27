import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { queueRowClickIntent } from './queue-row-click';

describe('queueRowClickIntent', () => {
  it('opens the record when nothing is checked', () => {
    assert.equal(queueRowClickIntent({ detail: 1 }, false), 'open');
    assert.equal(queueRowClickIntent(undefined, false), 'open');
  });
  it('toggles the row while a check-set is live, instead of opening', () => {
    assert.equal(queueRowClickIntent({ detail: 1 }, true), 'toggle');
    assert.equal(queueRowClickIntent(undefined, true), 'toggle');
  });
  it('drops a double-click second press so it cannot undo the toggle', () => {
    assert.equal(queueRowClickIntent({ detail: 2 }, true), 'ignore');
  });
  it('⌘ / Ctrl opens a new tab, ahead of the check-set toggle', () => {
    assert.equal(queueRowClickIntent({ metaKey: true }, true), 'new-tab');
    assert.equal(queueRowClickIntent({ ctrlKey: true }, false), 'new-tab');
  });
});
