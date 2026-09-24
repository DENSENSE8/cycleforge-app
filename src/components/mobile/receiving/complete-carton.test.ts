import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  COMPLETE_CARTON_GENERIC_BLOCKER,
  COMPLETE_CARTON_IDLE,
  completeCartonRequestBody,
  mapCompleteCartonResponse,
} from '@/components/mobile/receiving/complete-carton';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';

function row(overrides: Partial<ReceivingLineRow> = {}): ReceivingLineRow {
  return {
    id: 1,
    receiving_id: 42,
    receiving_source: 'zoho_po',
    zoho_purchaseorder_id: 'PO-1',
    ...overrides,
  } as ReceivingLineRow;
}

describe('completeCartonRequestBody', () => {
  it('is carton-scoped and tags the phone as the station', () => {
    const body = completeCartonRequestBody(row(), 42, 'key-1');
    assert.equal(body.receiving_id, 42);
    assert.equal(body.station, 'MOBILE');
    assert.equal(body.client_event_id, 'key-1');
  });

  it('receives a PO carton against inventory', () => {
    assert.equal(completeCartonRequestBody(row(), 42, 'k').receive_intent, 'zoho_receive');
  });

  it('receives an unmatched carton locally — there is no PO to reconcile', () => {
    const unfound = row({
      receiving_source: 'unmatched',
      zoho_purchaseorder_id: null,
      zoho_purchaseorder_number: null,
    });
    assert.equal(completeCartonRequestBody(unfound, 42, 'k').receive_intent, 'local_receive');
  });
});

describe('mapCompleteCartonResponse', () => {
  it('treats 409 PHOTO_POLICY as a fixable block, not an error', () => {
    // The whole reason this button is worth building: the receive-time evidence
    // gate finally has somewhere to speak on the phone.
    const out = mapCompleteCartonResponse(409, {
      success: false,
      error: 'PHOTO_POLICY',
      blockers: ['2 lines need item photos: SKU-A, SKU-B'],
    });
    assert.equal(out.phase, 'blocked');
    assert.deepEqual(out.blockers, ['2 lines need item photos: SKU-A, SKU-B']);
    assert.equal(out.error, null);
  });

  it('falls back to a readable blocker when the gate sends none', () => {
    const out = mapCompleteCartonResponse(409, { success: false, error: 'PHOTO_POLICY' });
    assert.equal(out.phase, 'blocked');
    assert.deepEqual(out.blockers, [COMPLETE_CARTON_GENERIC_BLOCKER]);
  });

  it('drops blank blocker entries', () => {
    const out = mapCompleteCartonResponse(409, {
      success: false,
      error: 'PHOTO_POLICY',
      blockers: ['  ', '', 'needs a package photo'],
    });
    assert.deepEqual(out.blockers, ['needs a package photo']);
  });

  it('§4: with NO override, a 409 PHOTO_POLICY still blocks — the default is unchanged', () => {
    // The soft block only relaxes the gate when the operator supplies a
    // PHOTO_WAIVED_* code. The DEFAULT body carries none — `useCompleteCarton`
    // spreads `photoPolicyOverrideField(...)` on top only when the operator
    // picks a reason — so the phone's plain "Complete carton" must keep landing
    // on `blocked`. A waiver leaking into the default body would silently
    // disable the gate for every receive.
    const body = completeCartonRequestBody(row(), 42, 'k') as Record<string, unknown>;
    assert.equal(
      body.photo_policy_override,
      undefined,
      'the phone sends no override today — a stray one would silently waive the gate',
    );
    const out = mapCompleteCartonResponse(409, {
      success: false,
      error: 'PHOTO_POLICY',
      blockers: ['carton needs an arrival package photo'],
    });
    assert.equal(out.phase, 'blocked');
  });

  it('§4: a waived receive (200 + warnings) completes, but is NOT a clean success', () => {
    // The third outcome. The receive happened, so the phase is `done` and the
    // counts are unchanged — but `waiver` is set, because the carton is
    // received carrying an open exception and the bench is the last place that
    // can still say so.
    const out = mapCompleteCartonResponse(200, {
      success: true,
      updated_count: 2,
      receive_intent: 'zoho_receive',
      receiving_lines: [{ id: 11 }, { id: 12 }],
      warnings: [
        {
          code: 'PHOTO_POLICY',
          reason_code: 'PHOTO_WAIVED_UPLOAD_FAILED',
          blockers: ['carton needs an arrival package photo'],
        },
      ],
    });
    assert.equal(out.phase, 'done');
    assert.equal(out.error, null);
    assert.deepEqual(out.blockers, []);
    assert.equal(out.updatedCount, 2);
    assert.deepEqual(out.waiver, {
      reasonCode: 'PHOTO_WAIVED_UPLOAD_FAILED',
      blockers: ['carton needs an arrival package photo'],
    });
  });

  it('§4: an ordinary receive reports no waiver', () => {
    const out = mapCompleteCartonResponse(200, { success: true, updated_count: 1 });
    assert.equal(out.waiver, null);
    assert.equal(COMPLETE_CARTON_IDLE.waiver, null);
  });

  it('§4: a warning naming a code outside the vocabulary is NOT read as a waiver', () => {
    // The reason code drives operator-facing copy; trusting arbitrary server
    // text here would put an unvalidated string on the receipt.
    for (const reason_code of ['NO_PO', 'PHOTO_WAIVED_LOL', '', 42]) {
      const out = mapCompleteCartonResponse(200, {
        success: true,
        updated_count: 1,
        warnings: [{ code: 'PHOTO_POLICY', reason_code, blockers: ['x'] }],
      });
      assert.equal(out.waiver, null, `reason_code: ${String(reason_code)}`);
    }
  });

  it('§4: a non-policy warning is ignored', () => {
    const out = mapCompleteCartonResponse(200, {
      success: true,
      updated_count: 1,
      warnings: [{ code: 'ZOHO_CIRCUIT_OPEN' }],
    });
    assert.equal(out.waiver, null);
  });

  it('§4: a forged override answers 400 INVALID_PHOTO_POLICY_OVERRIDE — an error, never a block', () => {
    // A waiver we cannot name must not read as "shoot more photos and retry";
    // that would loop the operator forever on a client bug.
    const out = mapCompleteCartonResponse(400, {
      success: false,
      error: 'INVALID_PHOTO_POLICY_OVERRIDE',
      allowed: ['PHOTO_WAIVED_NO_DEVICE'],
    });
    assert.equal(out.phase, 'error');
    assert.equal(out.error, 'INVALID_PHOTO_POLICY_OVERRIDE');
    assert.deepEqual(out.blockers, []);
  });

  it('a NON-policy 409 is still an error (idempotency / conflict)', () => {
    const out = mapCompleteCartonResponse(409, { success: false, error: 'conflict' });
    assert.equal(out.phase, 'error');
    assert.equal(out.error, 'conflict');
  });

  it('surfaces the server reason on failure, else the status', () => {
    assert.equal(mapCompleteCartonResponse(403, { error: 'Forbidden' }).error, 'Forbidden');
    assert.equal(mapCompleteCartonResponse(500, null).error, 'Receive failed (500)');
  });

  it('a 200 with success:false is a failure, not a receive', () => {
    const out = mapCompleteCartonResponse(200, { success: false, error: 'no open lines' });
    assert.equal(out.phase, 'error');
  });

  it('reports the received line count', () => {
    const out = mapCompleteCartonResponse(200, { success: true, updated_count: 3 });
    assert.equal(out.phase, 'done');
    assert.equal(out.updatedCount, 3);
  });

  it('a verify/replay pass still succeeds with no line count', () => {
    // mark-received-po returns updated_count: 0 when every line was already
    // DONE locally and it only had to verify the carton.
    const out = mapCompleteCartonResponse(200, { success: true, updated_count: 0 });
    assert.equal(out.phase, 'done');
    assert.equal(out.updatedCount, 0);
  });
});
