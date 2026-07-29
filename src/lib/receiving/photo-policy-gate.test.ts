import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateReceivingPhotoPolicyGate,
  isPreReceiveWorkflowStatus,
  receivingPhotoEvidenceCountsSql,
  type ReceivingPhotoEvidenceCounts,
  type ReceivingPhotoPolicyGateDeps,
} from '@/lib/receiving/photo-policy-gate';

const ORG = '00000000-0000-0000-0000-000000000001';

function fakes(counts: ReceivingPhotoEvidenceCounts) {
  const calls: Array<{ organizationId: string; receivingId: number }> = [];
  const deps: ReceivingPhotoPolicyGateDeps = {
    loadEvidenceCounts: async (input) => {
      calls.push(input);
      return counts;
    },
  };
  return { deps, calls };
}

/** Any count query on a fast path is a bug — prove it by exploding. */
const throwingDeps: ReceivingPhotoPolicyGateDeps = {
  loadEvidenceCounts: async () => {
    throw new Error('loadEvidenceCounts must not be called on this path');
  },
};

const NO_EVIDENCE: ReceivingPhotoEvidenceCounts = {
  cartonPhotoCounts: { package: 0, unboxCarton: 0 },
  linePhotoCounts: [],
};

describe('evaluateReceivingPhotoPolicyGate · fast paths (zero count queries)', () => {
  it("policy 'optional' never touches deps", async () => {
    const result = await evaluateReceivingPhotoPolicyGate(
      { organizationId: ORG, receivingId: 42, policy: 'optional' },
      throwingDeps,
    );
    assert.deepEqual(result, { ok: true, blockers: [] });
  });

  it('a corrupt/unknown policy value degrades to ok without deps', async () => {
    const result = await evaluateReceivingPhotoPolicyGate(
      {
        organizationId: ORG,
        receivingId: 42,
        policy: 'require_everything' as never,
      },
      throwingDeps,
    );
    assert.deepEqual(result, { ok: true, blockers: [] });
  });

  it('alreadyReceived skips the gate even under require_per_item', async () => {
    const result = await evaluateReceivingPhotoPolicyGate(
      {
        organizationId: ORG,
        receivingId: 42,
        policy: 'require_per_item',
        alreadyReceived: true,
      },
      throwingDeps,
    );
    assert.deepEqual(result, { ok: true, blockers: [] });
  });

  it('no resolvable carton id degrades to ok (null / NaN / non-positive)', async () => {
    for (const receivingId of [null, Number.NaN, 0, -3]) {
      const result = await evaluateReceivingPhotoPolicyGate(
        { organizationId: ORG, receivingId, policy: 'require_one' },
        throwingDeps,
      );
      assert.deepEqual(result, { ok: true, blockers: [] });
    }
  });
});

describe('evaluateReceivingPhotoPolicyGate · gated paths', () => {
  it('require_per_item with a zero-count line blocks and names the SKU', async () => {
    const { deps, calls } = fakes({
      cartonPhotoCounts: { package: 1, unboxCarton: 0 },
      linePhotoCounts: [
        { lineId: 10, sku: 'SKU-A', itemCount: 2 },
        { lineId: 11, sku: 'SKU-B', itemCount: 0 },
      ],
    });
    const result = await evaluateReceivingPhotoPolicyGate(
      { organizationId: ORG, receivingId: 42, policy: 'require_per_item' },
      deps,
    );
    assert.equal(result.ok, false);
    assert.equal(result.blockers.length, 1);
    assert.match(result.blockers[0], /SKU-B/);
    // Counts were assembled exactly once, scoped to the org + carton.
    assert.deepEqual(calls, [{ organizationId: ORG, receivingId: 42 }]);
  });

  it('require_per_item passes when every line has item evidence', async () => {
    const { deps } = fakes({
      cartonPhotoCounts: { package: 0, unboxCarton: 0 },
      linePhotoCounts: [
        { lineId: 10, sku: 'SKU-A', itemCount: 1 },
        { lineId: 11, sku: null, itemCount: 3 },
      ],
    });
    const result = await evaluateReceivingPhotoPolicyGate(
      { organizationId: ORG, receivingId: 42, policy: 'require_per_item' },
      deps,
    );
    assert.deepEqual(result, { ok: true, blockers: [] });
  });

  it('require_one passes on an arrival package shot', async () => {
    const { deps, calls } = fakes({
      cartonPhotoCounts: { package: 1, unboxCarton: 0 },
      linePhotoCounts: [],
    });
    const result = await evaluateReceivingPhotoPolicyGate(
      { organizationId: ORG, receivingId: 7, policy: 'require_one' },
      deps,
    );
    assert.deepEqual(result, { ok: true, blockers: [] });
    assert.equal(calls.length, 1);
  });

  it('require_one blocks when only non-arrival evidence exists', async () => {
    const { deps } = fakes({
      cartonPhotoCounts: { package: 0, unboxCarton: 2 },
      linePhotoCounts: [{ lineId: 10, sku: 'SKU-A', itemCount: 1 }],
    });
    const result = await evaluateReceivingPhotoPolicyGate(
      { organizationId: ORG, receivingId: 7, policy: 'require_one' },
      deps,
    );
    assert.equal(result.ok, false);
    assert.match(result.blockers[0], /arrival package photo/);
  });

  it('a fractional carton id floors before hitting deps', async () => {
    const { deps, calls } = fakes(NO_EVIDENCE);
    await evaluateReceivingPhotoPolicyGate(
      { organizationId: ORG, receivingId: 42.9, policy: 'require_one' },
      deps,
    );
    assert.deepEqual(calls, [{ organizationId: ORG, receivingId: 42 }]);
  });
});

describe('isPreReceiveWorkflowStatus', () => {
  it('pre-receive stages (and blank/unknown) gate; post-receive stages skip', () => {
    for (const status of ['EXPECTED', 'ARRIVED', 'MATCHED', ' matched ', '', null, undefined]) {
      assert.equal(isPreReceiveWorkflowStatus(status), true, `expected pre-receive: ${status}`);
    }
    for (const status of [
      'UNBOXED',
      'DONE',
      'AWAITING_TEST',
      'IN_TEST',
      'PASSED',
      'FAILED',
      'RTV',
      'SCRAP',
      'done',
    ]) {
      assert.equal(isPreReceiveWorkflowStatus(status), false, `expected already-received: ${status}`);
    }
  });
});

describe('receivingPhotoEvidenceCountsSql', () => {
  it('pins both carton stages via the intent SoT and aggregates per-line item counts', () => {
    const sql = receivingPhotoEvidenceCountsSql();
    // package arm: entity + typed package set (canonical + legacy + untyped).
    assert.match(sql, /l\.entity_type = 'RECEIVING'/);
    assert.match(sql, /COALESCE\(p\.photo_type, ''\) IN \('receiving_package', 'receiving', ''\)/);
    // unbox_carton arm: exact type pin.
    assert.match(sql, /p\.photo_type = 'receiving_unbox_carton'/);
    // line arm: entity-only item counts, aggregated for every carton line.
    assert.match(sql, /l\.entity_type = 'RECEIVING_LINE'/);
    assert.match(sql, /json_agg/);
    assert.match(sql, /rl\.receiving_id = \$2::int/);
    // Item evidence is entity-scoped — no photo_type predicate may name it.
    assert.doesNotMatch(sql, /'receiving_item'/);
    // Bind order: [organizationId, receivingId].
    assert.match(sql, /p\.organization_id = \$1/);
  });
});
