import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  emitIdentificationCompleted,
  type EmitIdentificationCompletedDeps,
} from './emit-identification-completed';
import { identificationFromScanOut } from '@/lib/identification/scan-out-face';
import type { ListingAutomationFacts } from '@/lib/automations/listing-match';

const ORG = 'org-alpha';

function fakes(facts: ListingAutomationFacts | null = { item_number: 'ABC' }) {
  const cap: {
    load: Array<{ org: string; orderId: number }>;
    apply: Array<{ org: string; orderId: number; triggerKey: string }>;
  } = { load: [], apply: [] };
  const deps: EmitIdentificationCompletedDeps = {
    loadFacts: async (organizationId, orderId) => {
      cap.load.push({ org: organizationId, orderId });
      return facts;
    },
    apply: async (input) => {
      cap.apply.push({
        org: input.organizationId,
        orderId: input.orderId,
        triggerKey: input.triggerKey,
      });
      return { status: 'skipped', ruleId: null, actionsApplied: [], reason: 'no_actions_for_trigger' };
    },
  };
  return { deps, cap };
}

const shipped = identificationFromScanOut({
  source: 'scan',
  organizationId: ORG,
  clientEventId: 'evt-1',
  json: { ok: true, matched: true, orderRowId: 88 },
});

describe('emitIdentificationCompleted', () => {
  it('threads org + identification.completed and skips when facts miss the org', async () => {
    const { deps, cap } = fakes({ item_number: '9M52' });
    const status = await emitIdentificationCompleted(
      { organizationId: ORG, result: shipped, actorStaffId: 3 },
      deps,
    );
    assert.equal(status, 'emitted');
    assert.deepEqual(cap.load, [{ org: ORG, orderId: 88 }]);
    assert.equal(cap.apply.length, 1);
    assert.equal(cap.apply[0].triggerKey, 'identification.completed');
    assert.equal(cap.apply[0].org, ORG);

    const missOrg = fakes(null);
    const skipped = await emitIdentificationCompleted(
      { organizationId: ORG, result: shipped },
      missOrg.deps,
    );
    assert.equal(skipped, 'skipped');
    assert.equal(missOrg.cap.apply.length, 0);
  });

  it('does not apply when org on the result disagrees', async () => {
    const { deps, cap } = fakes();
    const status = await emitIdentificationCompleted(
      { organizationId: 'other-org', result: shipped },
      deps,
    );
    assert.equal(status, 'skipped');
    assert.equal(cap.apply.length, 0);
    assert.equal(cap.load.length, 0);
  });
});
