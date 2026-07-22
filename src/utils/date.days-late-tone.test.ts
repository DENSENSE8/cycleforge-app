import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getDaysLateTone } from '@/utils/date';

describe('getDaysLateTone — progressive SLA tiers', () => {
  it('null deadline stays soft', () => {
    assert.equal(getDaysLateTone(null), 'text-text-soft');
  });

  it('on-time (0) stays muted — not emerald urgency theater', () => {
    assert.equal(getDaysLateTone(0), 'text-text-muted');
  });

  it('1–2 days mild amber', () => {
    assert.equal(getDaysLateTone(1), 'text-amber-600');
    assert.equal(getDaysLateTone(2), 'text-amber-600');
  });

  it('3–7 days elevated warning', () => {
    assert.equal(getDaysLateTone(3), 'text-text-warning');
    assert.equal(getDaysLateTone(7), 'text-text-warning');
  });

  it('8+ days critical danger', () => {
    assert.equal(getDaysLateTone(8), 'text-text-danger');
    assert.equal(getDaysLateTone(42), 'text-text-danger');
  });
});
