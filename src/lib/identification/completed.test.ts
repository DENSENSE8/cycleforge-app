import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { shouldEmitIdentificationCompleted } from './completed';
import { identificationFromScanOut } from './scan-out-face';
import { identificationFromPick } from './pick-face';

const ORG = 'org-1';

describe('shouldEmitIdentificationCompleted', () => {
  it('emits on matched scan-out including blocked and duplicate', () => {
    const blocked = identificationFromScanOut({
      source: 'scan',
      organizationId: ORG,
      clientEventId: 'e1',
      json: { ok: true, matched: true, blocked: true, orderRowId: 42, blockReason: 'canceled' },
    });
    const dup = identificationFromScanOut({
      source: 'scan',
      organizationId: ORG,
      clientEventId: 'e2',
      json: { ok: true, matched: true, duplicate: true, orderRowId: 7 },
    });
    const shipped = identificationFromScanOut({
      source: 'scan',
      organizationId: ORG,
      clientEventId: 'e3',
      json: { ok: true, matched: true, duplicate: false, orderRowId: 9 },
    });
    assert.equal(shouldEmitIdentificationCompleted(blocked), true);
    assert.equal(shouldEmitIdentificationCompleted(dup), true);
    assert.equal(shouldEmitIdentificationCompleted(shipped), true);
  });

  it('does not emit on miss or marketplace-only entity id', () => {
    const miss = identificationFromScanOut({
      source: 'scan',
      organizationId: ORG,
      clientEventId: 'e4',
      json: { ok: true, matched: false },
      requestedKey: '1Z999',
    });
    const market = identificationFromScanOut({
      source: 'scan',
      organizationId: ORG,
      clientEventId: 'e5',
      json: { ok: true, matched: true, orderId: '111-222' },
    });
    assert.equal(shouldEmitIdentificationCompleted(miss), false);
    assert.equal(shouldEmitIdentificationCompleted(market), false);
  });

  it('emits on pick ready; not on pick miss', () => {
    const ready = identificationFromPick({
      source: 'claim',
      organizationId: ORG,
      clientEventId: 'p1',
      json: { ok: true, orderId: 12, tasks: [{ currentState: 'ALLOCATED' }] },
    });
    const miss = identificationFromPick({
      source: 'claim',
      organizationId: ORG,
      clientEventId: 'p2',
      json: { ok: false, error: 'not found' },
    });
    assert.equal(shouldEmitIdentificationCompleted(ready), true);
    assert.equal(shouldEmitIdentificationCompleted(miss), false);
  });
});
