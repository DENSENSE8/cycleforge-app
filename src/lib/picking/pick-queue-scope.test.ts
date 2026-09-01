import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resolvePickQueueStaffId } from '@/lib/picking/pick-queue-scope';

describe('resolvePickQueueStaffId', () => {
  it('uses session staff by default', () => {
    const r = resolvePickQueueStaffId({
      sessionStaffId: 12,
      staffIdParam: null,
      canInspectOther: false,
    });
    assert.deepEqual(r, { ok: true, staffId: 12 });
  });

  it('ignores ?staffId= when caller cannot inspect others', () => {
    const r = resolvePickQueueStaffId({
      sessionStaffId: 12,
      staffIdParam: '99',
      canInspectOther: false,
    });
    assert.deepEqual(r, { ok: true, staffId: 12 });
  });

  it('honors ?staffId= for admin.view_logs', () => {
    const r = resolvePickQueueStaffId({
      sessionStaffId: 12,
      staffIdParam: '99',
      canInspectOther: true,
    });
    assert.deepEqual(r, { ok: true, staffId: 99 });
  });

  it('rejects missing session staff', () => {
    const r = resolvePickQueueStaffId({
      sessionStaffId: null,
      staffIdParam: null,
      canInspectOther: false,
    });
    assert.equal(r.ok, false);
  });
});
