import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { TOAST_CLASSNAMES, TOAST_DURATION } from './toast-theme';

describe('toast theme', () => {
  it('keeps success short and errors longer', () => {
    assert.ok(TOAST_DURATION.success < TOAST_DURATION.info);
    assert.ok(TOAST_DURATION.info < TOAST_DURATION.error);
    assert.equal(TOAST_DURATION.loading, Number.POSITIVE_INFINITY);
  });

  it('uses light semantic fills (not solid richColors paint)', () => {
    assert.match(TOAST_CLASSNAMES.success, /bg-surface-success/);
    assert.match(TOAST_CLASSNAMES.error, /bg-surface-danger/);
    assert.match(TOAST_CLASSNAMES.toast, /bg-surface-card/);
    assert.doesNotMatch(TOAST_CLASSNAMES.success, /bg-emerald-500|bg-green-500/);
    assert.doesNotMatch(TOAST_CLASSNAMES.error, /bg-red-500|bg-red-600/);
  });
});
