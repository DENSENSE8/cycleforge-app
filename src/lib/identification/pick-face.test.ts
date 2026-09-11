import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { identificationFromPick } from './pick-face';
import { getIdentificationJob, listIdentificationJobs } from './jobs';

const ORG = 'org-1';
const readyJson = {
  ok: true,
  orderId: 42,
  orderLabel: '#111',
  tasks: [{ currentState: 'ALLOCATED', productTitle: 'Bike', serialNumber: null }],
};

describe('identification job registry', () => {
  it('lists house scan_out and pick', () => {
    const ids = listIdentificationJobs().map((j) => j.id);
    assert.deepEqual(ids, ['scan_out', 'pick']);
  });

  it('pick claim path is /m/id/pick/{id}, session stays /m/pick/{id}', () => {
    const pick = getIdentificationJob('pick');
    assert.equal(pick?.claimPath('42'), '/m/id/pick/42');
    assert.equal(pick?.sessionPath('42'), '/m/pick/42');
    assert.equal(getIdentificationJob('tenant.custom'), null);
  });
});

describe('identificationFromPick', () => {
  it('requires organizationId and clientEventId', () => {
    assert.throws(
      () =>
        identificationFromPick({
          source: 'claim',
          organizationId: '',
          clientEventId: 'e',
          json: readyJson,
        }),
      /organizationId required/,
    );
    assert.throws(
      () =>
        identificationFromPick({
          source: 'claim',
          organizationId: ORG,
          clientEventId: '  ',
          json: readyJson,
        }),
      /clientEventId required/,
    );
  });

  it('maps an open task list to ready + PICK_CONFIRM', () => {
    const result = identificationFromPick({
      source: 'claim',
      organizationId: ORG,
      clientEventId: 'claim:pick:42',
      json: readyJson,
    });
    assert.equal(result.job, 'pick');
    assert.equal(result.entity.kind, 'order');
    assert.equal(result.entity.id, '42');
    assert.equal(result.face.state, 'ready');
    assert.equal(result.face.mutate, 'PICK_CONFIRM');
  });

  it('scan and claim share entity, job, and ready state', () => {
    const scan = identificationFromPick({
      source: 'scan',
      organizationId: ORG,
      clientEventId: 'scan-1',
      json: readyJson,
    });
    const claim = identificationFromPick({
      source: 'claim',
      organizationId: ORG,
      clientEventId: 'claim-1',
      json: readyJson,
    });
    assert.deepEqual(
      { entity: scan.entity, job: scan.job, state: scan.face.state, mutate: scan.face.mutate },
      { entity: claim.entity, job: claim.job, state: claim.face.state, mutate: claim.face.mutate },
    );
  });

  it('maps all-picked tasks to done with no mutate', () => {
    const result = identificationFromPick({
      source: 'claim',
      organizationId: ORG,
      clientEventId: 'e',
      json: {
        ok: true,
        orderId: 9,
        tasks: [{ currentState: 'PICKED' }, { currentState: 'PACKED' }],
      },
    });
    assert.equal(result.face.state, 'done');
    assert.equal(result.face.mutate, null);
  });

  it('maps 404-shaped JSON to miss', () => {
    const result = identificationFromPick({
      source: 'claim',
      organizationId: ORG,
      clientEventId: 'e',
      json: { ok: false, error: 'order not found' },
      requestedKey: '99',
    });
    assert.equal(result.face.state, 'miss');
    assert.equal(result.entity.id, '99');
  });
});
