import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  identificationFromScanOut,
  scanOutHistoryEntryToCarton,
} from './scan-out-face';

const ORG = 'org-1';
const EVENT = 'evt-1';

const cancelledCarton = {
  ok: true,
  matched: true,
  blocked: true,
  blockReason: 'canceled',
  orderStatus: 'canceled',
  orderRowId: 42,
  orderId: '111-222',
  message: 'Order is cancelled — do not ship. Pull this package.',
};

const missCarton = { ok: true, matched: false, message: 'No order found' };

const dupCarton = {
  ok: true,
  matched: true,
  duplicate: true,
  orderRowId: 7,
  orderId: 'ORD-7',
};

describe('identificationFromScanOut', () => {
  it('requires organizationId', () => {
    assert.throws(
      () =>
        identificationFromScanOut({
          source: 'scan',
          organizationId: '  ',
          clientEventId: EVENT,
          json: cancelledCarton,
        }),
      /organizationId required/,
    );
  });

  it('requires clientEventId', () => {
    assert.throws(
      () =>
        identificationFromScanOut({
          source: 'scan',
          organizationId: ORG,
          clientEventId: '',
          json: cancelledCarton,
        }),
      /clientEventId required/,
    );
  });

  it('maps cancelled to blocked with no SHIP_CONFIRM', () => {
    const result = identificationFromScanOut({
      source: 'scan',
      organizationId: ORG,
      clientEventId: EVENT,
      json: cancelledCarton,
    });
    assert.equal(result.face.state, 'blocked');
    assert.equal(result.face.mutate, null);
    assert.equal(result.job, 'scan_out');
    assert.equal(result.entity.kind, 'order');
    assert.equal(result.entity.id, '42');
  });

  it('maps unmatched to miss', () => {
    const result = identificationFromScanOut({
      source: 'scan',
      organizationId: ORG,
      clientEventId: EVENT,
      json: missCarton,
      requestedKey: '1Z999',
    });
    assert.equal(result.face.state, 'miss');
    assert.equal(result.face.mutate, null);
    assert.equal(result.entity.id, '1Z999');
  });

  it('maps duplicate to done', () => {
    const result = identificationFromScanOut({
      source: 'scan',
      organizationId: ORG,
      clientEventId: EVENT,
      json: dupCarton,
    });
    assert.equal(result.face.state, 'done');
    assert.equal(result.face.title, 'Already scanned out');
  });

  it('scan and claim share entity, job, and blocked state', () => {
    const scan = identificationFromScanOut({
      source: 'scan',
      organizationId: ORG,
      clientEventId: 'scan-1',
      json: cancelledCarton,
    });
    const claim = identificationFromScanOut({
      source: 'claim',
      organizationId: ORG,
      clientEventId: 'claim-1',
      json: cancelledCarton,
    });
    assert.deepEqual(
      { entity: scan.entity, job: scan.job, state: scan.face.state, mutate: scan.face.mutate },
      { entity: claim.entity, job: claim.job, state: claim.face.state, mutate: claim.face.mutate },
    );
  });

  it('history row and POST duplicate share done face', () => {
    const fromPost = identificationFromScanOut({
      source: 'scan',
      organizationId: ORG,
      clientEventId: EVENT,
      json: dupCarton,
    });
    const fromHistory = identificationFromScanOut({
      source: 'claim',
      organizationId: ORG,
      clientEventId: EVENT,
      json: scanOutHistoryEntryToCarton({
        orderId: 'ORD-7',
        shipmentId: 9,
        tracking: '1Z',
      }),
    });
    assert.equal(fromPost.face.state, 'done');
    assert.equal(fromHistory.face.state, 'done');
    assert.equal(fromHistory.entity.kind, 'order');
  });

  it('retry with the same clientEventId is a deepEqual no-op at the type layer', () => {
    const args = {
      source: 'scan' as const,
      organizationId: ORG,
      clientEventId: EVENT,
      json: cancelledCarton,
    };
    assert.deepEqual(identificationFromScanOut(args), identificationFromScanOut(args));
  });
});
