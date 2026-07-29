import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  COMPLETE_CARTON_GENERIC_BLOCKER,
  completeCartonRequestBody,
  foldSyncVerdict,
  mapCompleteCartonResponse,
} from '@/components/mobile/receiving/complete-carton';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';

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
    // DONE locally and it only had to verify against Zoho.
    const out = mapCompleteCartonResponse(200, { success: true, updated_count: 0 });
    assert.equal(out.phase, 'done');
    assert.equal(out.updatedCount, 0);
  });

  it('collects the line ids the sync will publish verdicts for', () => {
    const out = mapCompleteCartonResponse(200, {
      success: true,
      receive_intent: 'zoho_receive',
      updated_count: 2,
      receiving_lines: [{ id: 11 }, { id: 12 }],
    });
    assert.deepEqual(out.lineIds, [11, 12]);
    assert.equal(out.awaitsSync, true);
  });

  it('a local receive awaits no verdict — nothing external will publish', () => {
    // The unfound lane never calls the inventory provider, so waiting on a
    // verdict would spin forever.
    const out = mapCompleteCartonResponse(200, {
      success: true,
      receive_intent: 'local_receive',
      receiving_lines: [{ id: 11 }],
    });
    assert.equal(out.phase, 'done');
    assert.equal(out.awaitsSync, false);
  });

  it('a receive that touched no lines awaits no verdict', () => {
    const out = mapCompleteCartonResponse(200, {
      success: true,
      receive_intent: 'zoho_receive',
      receiving_lines: [],
    });
    assert.equal(out.awaitsSync, false);
  });
});

describe('foldSyncVerdict', () => {
  const lines = [11, 12];

  it('ignores events with no verdict, and the skipped verdict', () => {
    assert.equal(foldSyncVerdict('pending', lines, { rowId: 11 }), 'pending');
    assert.equal(foldSyncVerdict('pending', lines, { rowId: 11, zohoReceive: 'skipped' }), 'pending');
    assert.equal(foldSyncVerdict('pending', lines, null), 'pending');
  });

  it('ignores a verdict for a line this receive did not touch', () => {
    assert.equal(foldSyncVerdict('pending', lines, { rowId: 99, zohoReceive: 'failed' }), 'pending');
  });

  it('accepts a verdict for one of our lines (rowId arrives as a string)', () => {
    assert.equal(foldSyncVerdict('pending', lines, { rowId: '11', zohoReceive: 'ok' }), 'ok');
    assert.equal(foldSyncVerdict('pending', lines, { rowId: 12, zohoReceive: 'failed' }), 'failed');
  });

  it('failure is sticky — a later ok must not paper over a failed line', () => {
    // A carton gets one verdict per line. First-wins would report a green sync
    // for a carton that had a line fail.
    const afterFail = foldSyncVerdict('pending', lines, { rowId: 11, zohoReceive: 'failed' });
    assert.equal(afterFail, 'failed');
    assert.equal(foldSyncVerdict(afterFail, lines, { rowId: 12, zohoReceive: 'ok' }), 'failed');
  });

  it('a failed line still wins when an ok arrived first', () => {
    const afterOk = foldSyncVerdict('pending', lines, { rowId: 11, zohoReceive: 'ok' });
    assert.equal(afterOk, 'ok');
    assert.equal(foldSyncVerdict(afterOk, lines, { rowId: 12, zohoReceive: 'failed' }), 'failed');
  });
});
