import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  evaluateReceivingPhotoPolicyGate,
  isPreReceiveWorkflowStatus,
  receivingPhotoEvidenceCountsSql,
  type ReceivingPhotoEvidenceCounts,
  type ReceivingPhotoPolicyGateDeps,
} from '@/lib/receiving/photo-policy-gate';
import {
  parsePhotoPolicyOverride,
  photoPolicyOverrideInvalidBody,
  photoPolicyOverrideWarning,
  recordPhotoPolicyOverride,
} from '@/lib/receiving/photo-policy-override';
import {
  PHOTO_POLICY_OVERRIDE_CODES,
  RECEIVING_EXCEPTION_CODES,
} from '@/lib/receiving/exception-codes';

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

  it("policy 'optional' runs ZERO evidence queries (counted, not just non-throwing)", async () => {
    // §4 regression guard. The soft-block work only changed what a route does
    // with a `!ok` verdict — the default tier must still cost nothing. A
    // throwing dep proves "not called on the happy path"; a counter proves it
    // for every shape of call, including one that swallows its own error.
    const { deps, calls } = fakes(NO_EVIDENCE);
    for (const receivingId of [42, 1, 999]) {
      const result = await evaluateReceivingPhotoPolicyGate(
        { organizationId: ORG, receivingId, policy: 'optional' },
        deps,
      );
      assert.deepEqual(result, { ok: true, blockers: [] });
    }
    assert.deepEqual(calls, [], 'optional must assemble no evidence counts at all');
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

// ─── §4 soft block — the override half ──────────────────────────────────────
//
// The gate above is deliberately UNCHANGED by §4: it still returns the same
// verdict, and `evaluateReceivingPhotoPolicyGate` knows nothing about an
// override. What changed is only what a receive route does with a `!ok`
// verdict, which lives in the sibling `./photo-policy-override.ts`. These
// suites cover that module (pure + Deps-injected, so DB-free) and then assert
// the two route call sites are actually wired to it.

describe('parsePhotoPolicyOverride · the override is a vocabulary, not free text', () => {
  it('accepts every PHOTO_WAIVED_* system code (and trims)', () => {
    for (const code of PHOTO_POLICY_OVERRIDE_CODES) {
      assert.deepEqual(parsePhotoPolicyOverride(code), { state: 'valid', code });
      assert.deepEqual(parsePhotoPolicyOverride(`  ${code} `), { state: 'valid', code });
    }
  });

  it('absent / blank is NOT an error — the gate simply stays a hard 409', () => {
    // The vast majority of receives never touch the gate; requiring the field
    // would have made every legacy client 400.
    for (const raw of [undefined, null, '', '   ']) {
      assert.deepEqual(parsePhotoPolicyOverride(raw), { state: 'absent' }, `raw: ${String(raw)}`);
    }
  });

  it('rejects a forged / unknown code', () => {
    for (const raw of [
      'PHOTO_WAIVED_LOL',
      'photo_waived_no_device', // case must match — this is a code, not a label
      'PHOTO_WAIVED',
      'ANY',
      '*',
    ]) {
      assert.deepEqual(parsePhotoPolicyOverride(raw), { state: 'invalid' }, `raw: ${raw}`);
    }
  });

  it('rejects an OS&D code — a shipment exception is not a photo waiver', () => {
    // The two sub-vocabularies share `flow_context = 'receiving_exception'`, so
    // the narrow slice is the only thing stopping `NO_PO` from waiving the gate.
    for (const code of RECEIVING_EXCEPTION_CODES.filter(
      (c) => !(PHOTO_POLICY_OVERRIDE_CODES as readonly string[]).includes(c),
    )) {
      assert.deepEqual(parsePhotoPolicyOverride(code), { state: 'invalid' }, `raw: ${code}`);
    }
    assert.ok(
      RECEIVING_EXCEPTION_CODES.length > PHOTO_POLICY_OVERRIDE_CODES.length,
      'the OS&D half must be non-empty or the assertion above is vacuous',
    );
  });

  it('rejects a non-string body value (no truthy coercion)', () => {
    for (const raw of [true, 1, {}, [], ['PHOTO_WAIVED_NO_DEVICE']]) {
      assert.deepEqual(parsePhotoPolicyOverride(raw), { state: 'invalid' }, `raw: ${JSON.stringify(raw)}`);
    }
  });

  it('the 400 body names the allowed set', () => {
    const body = photoPolicyOverrideInvalidBody();
    assert.equal(body.success, false);
    assert.equal(body.error, 'INVALID_PHOTO_POLICY_OVERRIDE');
    assert.deepEqual([...body.allowed], [...PHOTO_POLICY_OVERRIDE_CODES]);
  });
});

describe('photoPolicyOverrideWarning · a waived receive still says what it waived', () => {
  it('mirrors the 409 payload so one client renderer serves both shapes', () => {
    const blockers = ['2 lines need item photos: SKU-A, SKU-B'];
    const warning = photoPolicyOverrideWarning('PHOTO_WAIVED_UPLOAD_FAILED', blockers);
    assert.deepEqual(warning, {
      code: 'PHOTO_POLICY', // ≡ the 409 `error`
      reason_code: 'PHOTO_WAIVED_UPLOAD_FAILED',
      blockers,
    });
  });

  it('copies the blockers — a later mutation of the gate array cannot rewrite the response', () => {
    const blockers = ['needs an arrival package photo'];
    const warning = photoPolicyOverrideWarning('PHOTO_WAIVED_DEFERRED', blockers);
    blockers.push('injected after the fact');
    assert.deepEqual(warning.blockers, ['needs an arrival package photo']);
  });
});

function exceptionFakes() {
  const calls: Array<{ orgId: string; input: Record<string, unknown> }> = [];
  let nextId = 500;
  const deps = {
    recordException: async (orgId: string, input: Record<string, unknown>) => {
      calls.push({ orgId, input });
      return { id: nextId++ };
    },
  } as unknown as Parameters<typeof recordPhotoPolicyOverride>[2];
  return { deps, calls };
}

describe('recordPhotoPolicyOverride · an override without a trail is worse than no gate', () => {
  it('writes ONE open receiving_exceptions row per received line, carrying the code', async () => {
    const { deps, calls } = exceptionFakes();
    const out = await recordPhotoPolicyOverride(
      ORG as never,
      {
        code: 'PHOTO_WAIVED_NO_DEVICE',
        blockers: ['carton needs an arrival package photo'],
        receivingId: 42,
        receivingLineIds: [11, 12],
        staffId: 7,
      },
      deps,
    );
    assert.deepEqual(out.exceptionIds, [500, 501]);
    assert.equal(calls.length, 2);
    assert.deepEqual(
      calls.map((c) => c.input.receivingLineId),
      [11, 12],
    );
    for (const call of calls) {
      assert.equal(call.orgId, ORG);
      assert.equal(call.input.exceptionCode, 'PHOTO_WAIVED_NO_DEVICE');
      assert.equal(call.input.receivingId, 42);
      assert.equal(call.input.createdBy, 7);
    }
  });

  it('assembles the reason from the GATE blockers — the request body never contributes text', async () => {
    const { deps, calls } = exceptionFakes();
    await recordPhotoPolicyOverride(
      ORG as never,
      {
        code: 'PHOTO_WAIVED_NOT_APPLICABLE',
        blockers: ['1 line needs an item photo: SKU-A', 'carton needs an arrival package photo'],
        receivingId: 42,
        receivingLineIds: [11],
        staffId: null,
      },
      deps,
    );
    const reason = String(calls[0].input.reason);
    assert.match(reason, /^Photo policy waived at receive: /);
    assert.match(reason, /SKU-A/);
    assert.match(reason, /arrival package photo/);
    assert.equal(calls[0].input.createdBy, null);
  });

  it('a blocker-less waiver still records a readable reason', async () => {
    const { deps, calls } = exceptionFakes();
    await recordPhotoPolicyOverride(
      ORG as never,
      {
        code: 'PHOTO_WAIVED_DEFERRED',
        blockers: [],
        receivingId: null,
        receivingLineIds: [11],
        staffId: 7,
      },
      deps,
    );
    assert.match(String(calls[0].input.reason), /photo-evidence policy not satisfied/);
    assert.equal(calls[0].input.receivingId, null);
  });

  it('caps the assembled reason (the column is unbounded text)', async () => {
    const { deps, calls } = exceptionFakes();
    await recordPhotoPolicyOverride(
      ORG as never,
      {
        code: 'PHOTO_WAIVED_DEFERRED',
        blockers: [`SKU-${'X'.repeat(2000)}`],
        receivingId: 42,
        receivingLineIds: [11],
        staffId: null,
      },
      deps,
    );
    assert.ok(String(calls[0].input.reason).length <= 500);
    assert.match(String(calls[0].input.reason), /…$/);
  });

  it('normalizes line ids (dedupes, drops junk) so one line never gets two rows', async () => {
    const { deps, calls } = exceptionFakes();
    await recordPhotoPolicyOverride(
      ORG as never,
      {
        code: 'PHOTO_WAIVED_NO_DEVICE',
        blockers: [],
        receivingId: 42,
        receivingLineIds: [11, 11, 0, -3, Number.NaN, 12.9],
        staffId: null,
      },
      deps,
    );
    assert.deepEqual(
      calls.map((c) => c.input.receivingLineId),
      [11, 12],
    );
  });

  it('no resolvable line writes nothing (the route still audits, so it is never silent)', async () => {
    const { deps, calls } = exceptionFakes();
    const out = await recordPhotoPolicyOverride(
      ORG as never,
      {
        code: 'PHOTO_WAIVED_NO_DEVICE',
        blockers: [],
        receivingId: 42,
        receivingLineIds: [],
        staffId: null,
      },
      deps,
    );
    assert.deepEqual(out.exceptionIds, []);
    assert.deepEqual(calls, []);
  });
});

// ─── Route wiring guard ─────────────────────────────────────────────────────
//
// The two receive routes cannot be imported into a DB-free unit test (they pull
// `withAuth`, the pool, and the whole Zoho graph). The behavior that matters is
// still assertable from source: that the 409 is now conditional on the override
// being absent, that the PO route still RELEASES its idempotency claim on that
// unchanged 409 path, and that a waived receive persists + audits + warns.
// Same technique as `lookup-scan-wiring.guard.test.ts`.

const ROUTES = {
  'mark-received': join(process.cwd(), 'src/app/api/receiving/mark-received/route.ts'),
  'mark-received-po': join(process.cwd(), 'src/app/api/receiving/mark-received-po/route.ts'),
} as const;

describe('§4 wiring · both receive routes read, persist, audit and report the override', () => {
  for (const [name, path] of Object.entries(ROUTES)) {
    it(`${name}: 409 is conditional on NO valid override; a waiver is persisted, audited, and warned`, () => {
      const src = readFileSync(path, 'utf8');

      // Read from the shared body key, via the shared parser.
      assert.match(src, /parsePhotoPolicyOverride\(body\?\.\[PHOTO_POLICY_OVERRIDE_BODY_KEY\]\)/);
      // Forged value → 400 before any mutation.
      assert.match(src, /photoPolicyOverride\.state === 'invalid'/);
      assert.match(src, /photoPolicyOverrideInvalidBody\(\)[\s\S]{0,40}status: 400/);
      // (b) absent override → the byte-identical 409.
      assert.match(src, /photoPolicyOverride\.state !== 'valid'/);
      assert.match(
        src,
        /error: 'PHOTO_POLICY', blockers: gate\.blockers \}[\s\S]{0,40}status: 409/,
      );
      // (a) valid override → persist + audit + warn.
      assert.match(src, /recordPhotoPolicyOverride\(/);
      assert.match(src, /AUDIT_ACTION\.RECEIVING_PHOTO_POLICY_OVERRIDE/);
      assert.match(src, /photoPolicyOverrideWarning\(/);
      assert.match(src, /warnings: \[/);
    });
  }

  it('mark-received-po still releases its idempotency claim on the (still-409) no-override path', () => {
    // A released claim is what lets the same client_event_id retry once the
    // photos land. A waived receive is a real effect and must KEEP its claim.
    const src = readFileSync(ROUTES['mark-received-po'], 'utf8');
    const guarded = src.match(
      /if \(photoPolicyOverride\.state !== 'valid'\) \{[\s\S]*?status: 409[\s\S]*?\n\s*\}/,
    );
    assert.ok(guarded, 'expected the 409 to sit inside the no-valid-override guard');
    assert.match(guarded[0], /releaseIdempotencyClaim\(pool, ownedClaim\)/);
    assert.match(guarded[0], /ownedClaim = null/);
  });

  it('neither route accepts free-text as an override (no bare non-empty-string check)', () => {
    for (const [name, path] of Object.entries(ROUTES)) {
      const src = readFileSync(path, 'utf8');
      assert.doesNotMatch(
        src,
        /photo_policy_override[^\n]*(String\(|\.trim\(\)\s*(!==|\|\|))/,
        `${name} must not read the override as raw text — it is a system vocabulary`,
      );
    }
  });
});
