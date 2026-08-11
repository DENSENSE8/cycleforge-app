import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  TICKET_REPLY_PRESETS,
  ticketReplyPresetById,
} from '@/lib/support/ticket-reply-presets';

describe('ticket-reply-presets', () => {
  it('includes public All-good and internal QC presets', () => {
    const allGood = ticketReplyPresetById('all-good-public');
    const qcPass = ticketReplyPresetById('qc-pass-internal');
    const qcFail = ticketReplyPresetById('qc-fail-internal');
    assert.ok(allGood?.isPublic === true);
    assert.ok(qcPass?.isPublic === false);
    assert.ok(qcFail?.isPublic === false);
    assert.ok(TICKET_REPLY_PRESETS.length >= 3);
  });
});
