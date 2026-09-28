import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  getPackWorkspaceTabFromSearch,
  normalizePackWorkspaceTabParams,
} from './pack-workspace-state';

describe('pack-workspace-state', () => {
  it('defaults absent packview to queue', () => {
    assert.equal(getPackWorkspaceTabFromSearch(new URLSearchParams()), 'queue');
  });

  it('reads history from packview', () => {
    assert.equal(
      getPackWorkspaceTabFromSearch(new URLSearchParams('packview=history')),
      'history',
    );
  });

  it('queue normalize defaults ustatus=PICKED and omits packview', () => {
    const params = new URLSearchParams('packview=history&ustatus=PENDING');
    const tab = normalizePackWorkspaceTabParams(params, 'queue');
    assert.equal(tab, 'queue');
    assert.equal(params.has('packview'), false);
    // Keep an existing valid ustatus when switching back to queue
    assert.equal(params.get('ustatus'), 'PENDING');
  });

  it('queue normalize sets PICKED when ustatus absent', () => {
    const params = new URLSearchParams();
    normalizePackWorkspaceTabParams(params, 'queue');
    assert.equal(params.get('ustatus'), 'PICKED');
  });

  it('history normalize clears fulfillment filters', () => {
    const params = new URLSearchParams('ustatus=PICKED&stage=picked&attention=1');
    const tab = normalizePackWorkspaceTabParams(params, 'history');
    assert.equal(tab, 'history');
    assert.equal(params.get('packview'), 'history');
    assert.equal(params.has('ustatus'), false);
    assert.equal(params.has('stage'), false);
    assert.equal(params.has('attention'), false);
  });
});
