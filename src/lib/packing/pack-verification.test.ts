import test from 'node:test';
import assert from 'node:assert/strict';
import {
  recordPackVerificationEvent,
  type RecordPackVerificationDeps,
  type RecordPackVerificationInput,
  type PackVerificationQueryExecutor,
} from './pack-verification';
import {
  canTransitionPackVerification,
  isPackVerificationOutcome,
  PACK_VERIFICATION_OUTCOMES,
} from './pack-verification-outcomes';

const ORG = '00000000-0000-0000-0000-000000000001';

interface CapturedQuery {
  sql: string;
  params: unknown[];
}

/** Capturing fake tenant client. Routes each query by SQL shape and returns
 *  canned rows; the race re-read is distinguished from the idempotency check by
 *  whether an INSERT has already been attempted. */
function fakes(
  opts: {
    parentExists?: boolean;
    shipmentId?: number | null;
    existingDup?: { id: number; outcome: string } | null;
    latest?: string | null;
    insertedId?: number;
    insertConflict?: boolean;
    raceWinner?: { id: number; outcome: string } | null;
  } = {},
) {
  const parentExists = opts.parentExists ?? true;
  const cap: { queries: CapturedQuery[]; ranTransaction: boolean } = {
    queries: [],
    ranTransaction: false,
  };
  let insertAttempted = false;

  const client: PackVerificationQueryExecutor = {
    async query(text, params = []) {
      const p = [...(params as unknown[])];
      cap.queries.push({ sql: text, params: p });
      const t = text.replace(/\s+/g, ' ').trim();

      if (t.includes('FROM packer_logs')) {
        return parentExists
          ? { rows: [{ id: p[0], shipment_id: opts.shipmentId ?? null }] }
          : { rows: [] };
      }
      if (t.includes('SELECT id, outcome FROM pack_verification_events') && t.includes('client_event_id = $2')) {
        // Before the insert → the idempotency short-circuit; after → the race re-read.
        if (!insertAttempted) return opts.existingDup ? { rows: [opts.existingDup] } : { rows: [] };
        return opts.raceWinner ? { rows: [opts.raceWinner] } : { rows: [] };
      }
      if (t.includes('SELECT outcome FROM pack_verification_events') && t.includes('ORDER BY created_at DESC')) {
        return opts.latest != null ? { rows: [{ outcome: opts.latest }] } : { rows: [] };
      }
      if (t.startsWith('INSERT INTO pack_verification_events')) {
        insertAttempted = true;
        return opts.insertConflict ? { rows: [] } : { rows: [{ id: opts.insertedId ?? 1, outcome: p[4] }] };
      }
      if (t.startsWith('INSERT INTO ops_events')) {
        return { rows: [] };
      }
      return { rows: [] };
    },
  };

  const deps: RecordPackVerificationDeps = {
    runTransaction: async (_org, fn) => {
      cap.ranTransaction = true;
      return fn(client);
    },
  };
  return { deps, cap };
}

const baseInput = (over: Partial<RecordPackVerificationInput> = {}): RecordPackVerificationInput => ({
  organizationId: ORG,
  packerLogId: 7,
  outcome: 'VERIFIED',
  verifiedByStaffId: 3,
  ...over,
});

function pveInsert(cap: { queries: CapturedQuery[] }) {
  return cap.queries.find((q) => q.sql.replace(/\s+/g, ' ').trim().startsWith('INSERT INTO pack_verification_events'));
}
function opsInsert(cap: { queries: CapturedQuery[] }) {
  return cap.queries.find((q) => q.sql.replace(/\s+/g, ' ').trim().startsWith('INSERT INTO ops_events'));
}

// ── The transition machine (plan §3c) ───────────────────────────────────────

test('canTransition: capture outcomes are legal from none or another capture', () => {
  assert.equal(canTransitionPackVerification(null, 'VERIFIED'), true);
  assert.equal(canTransitionPackVerification('UNVERIFIED', 'VERIFIED'), true);
  assert.equal(canTransitionPackVerification('VERIFIED', 'ERROR_MISSING_TRACKING'), true);
  assert.equal(canTransitionPackVerification('ERROR_OCR_FAILED', 'VERIFIED'), true);
  // …but not after a review/EOD outcome closed capture.
  assert.equal(canTransitionPackVerification('REVIEW_APPROVED', 'VERIFIED'), false);
  assert.equal(canTransitionPackVerification('REVIEW_FLAGGED', 'VERIFIED'), false);
});

test('canTransition: review outcomes are legal only from VERIFIED or ERROR_*', () => {
  assert.equal(canTransitionPackVerification('VERIFIED', 'REVIEW_APPROVED'), true);
  assert.equal(canTransitionPackVerification('ERROR_MISSING_TRACKING', 'REVIEW_FLAGGED'), true);
  assert.equal(canTransitionPackVerification('ERROR_COUNT_MISMATCH', 'REVIEW_APPROVED'), true);
  assert.equal(canTransitionPackVerification(null, 'REVIEW_APPROVED'), false);
  assert.equal(canTransitionPackVerification('UNVERIFIED', 'REVIEW_APPROVED'), false);
  assert.equal(canTransitionPackVerification('REVIEW_APPROVED', 'REVIEW_FLAGGED'), false);
});

test('canTransition: EOD outcomes are legal only from REVIEW_APPROVED', () => {
  assert.equal(canTransitionPackVerification('REVIEW_APPROVED', 'READY'), true);
  assert.equal(canTransitionPackVerification('REVIEW_APPROVED', 'ERROR_COUNT_MISMATCH'), true);
  assert.equal(canTransitionPackVerification('VERIFIED', 'READY'), false);
  assert.equal(canTransitionPackVerification('REVIEW_FLAGGED', 'READY'), false);
});

test('outcome vocabulary is the 8-value union (pins the DB CHECK)', () => {
  assert.deepEqual([...PACK_VERIFICATION_OUTCOMES].sort(), [
    'ERROR_COUNT_MISMATCH',
    'ERROR_MISSING_TRACKING',
    'ERROR_OCR_FAILED',
    'READY',
    'REVIEW_APPROVED',
    'REVIEW_FLAGGED',
    'UNVERIFIED',
    'VERIFIED',
  ]);
  assert.equal(isPackVerificationOutcome('VERIFIED'), true);
  assert.equal(isPackVerificationOutcome('NOPE'), false);
});

// ── recordPackVerificationEvent ─────────────────────────────────────────────

test('capture VERIFIED from empty: inserts the row + emits the ops_event', async () => {
  const { deps, cap } = fakes({ latest: null, insertedId: 42, shipmentId: 555 });
  const out = await recordPackVerificationEvent(
    baseInput({ outcome: 'VERIFIED', detectedTracking: '1Z999', clientEventId: 'ce-1' }),
    deps,
  );

  assert.deepEqual(out, { ok: true, id: 42, outcome: 'VERIFIED', duplicate: false });

  const ins = pveInsert(cap);
  assert.ok(ins, 'a pack_verification_events INSERT fired');
  assert.equal(ins!.params[0], ORG, 'org threaded into the insert, not defaulted');
  assert.equal(ins!.params[1], 'PACKER_LOG', 'entity_type is PACKER_LOG');
  assert.equal(ins!.params[2], 7, 'entity_id is the packerLogId');
  assert.equal(ins!.params[3], 555, 'shipment_id derived from the packer_log, not the caller');
  assert.equal(ins!.params[4], 'VERIFIED');
  assert.equal(ins!.params[6], '1Z999', 'detected_tracking mapped to its column');

  const ops = opsInsert(cap);
  assert.ok(ops, 'the ops_events spine emission fired');
  assert.equal(ops!.params[3], `pack-verification:42`, 'ops_event idempotency key is derived from the row id');
});

test('illegal transition (REVIEW_APPROVED from empty): 409 CONFLICT, no insert', async () => {
  const { deps, cap } = fakes({ latest: null });
  const out = await recordPackVerificationEvent(baseInput({ outcome: 'REVIEW_APPROVED' }), deps);

  assert.equal(out.ok, false);
  assert.equal(out.ok === false && out.code, 'CONFLICT');
  assert.equal(out.ok === false && out.latest, null);
  assert.equal(pveInsert(cap), undefined, 'no row inserted on an illegal transition');
  assert.equal(opsInsert(cap), undefined, 'no ops_event on an illegal transition');
});

test('packer_log not found: 404 NOT_FOUND, no writes', async () => {
  const { deps, cap } = fakes({ parentExists: false });
  const out = await recordPackVerificationEvent(baseInput(), deps);

  assert.equal(out.ok, false);
  assert.equal(out.ok === false && out.code, 'NOT_FOUND');
  assert.equal(pveInsert(cap), undefined);
});

test('idempotent replay: a prior client_event_id short-circuits to a no-op', async () => {
  const { deps, cap } = fakes({ existingDup: { id: 99, outcome: 'VERIFIED' } });
  const out = await recordPackVerificationEvent(
    baseInput({ outcome: 'VERIFIED', clientEventId: 'dup-key' }),
    deps,
  );

  assert.deepEqual(out, { ok: true, id: 99, outcome: 'VERIFIED', duplicate: true });
  assert.equal(pveInsert(cap), undefined, 'replay does not insert a second row');
  assert.equal(opsInsert(cap), undefined, 'replay does not re-emit the ops_event');
});

test('REVIEW_FLAGGED without a note: INVALID before any DB work', async () => {
  const { deps, cap } = fakes();
  const out = await recordPackVerificationEvent(baseInput({ outcome: 'REVIEW_FLAGGED', reviewNote: '  ' }), deps);

  assert.equal(out.ok, false);
  assert.equal(out.ok === false && out.code, 'INVALID');
  assert.equal(cap.ranTransaction, false, 'validation fails before opening a transaction');
});

test('REVIEW_APPROVED from VERIFIED: legal, inserts with the manager staff id', async () => {
  const { deps, cap } = fakes({ latest: 'VERIFIED', insertedId: 50 });
  const out = await recordPackVerificationEvent(
    baseInput({ outcome: 'REVIEW_APPROVED', verifiedByStaffId: 9 }),
    deps,
  );

  assert.deepEqual(out, { ok: true, id: 50, outcome: 'REVIEW_APPROVED', duplicate: false });
  const ins = pveInsert(cap)!;
  assert.equal(ins.params[10], 9, 'verified_by_staff_id mapped');
});

test('REVIEW_FLAGGED with a note from VERIFIED: legal, note threaded', async () => {
  const { deps, cap } = fakes({ latest: 'VERIFIED', insertedId: 51 });
  const out = await recordPackVerificationEvent(
    baseInput({ outcome: 'REVIEW_FLAGGED', reviewNote: 'slip mismatch' }),
    deps,
  );
  assert.equal(out.ok, true);
  assert.equal(pveInsert(cap)!.params[11], 'slip mismatch', 'review_note mapped to its column');
});

test('EOD READY only follows REVIEW_APPROVED', async () => {
  const ok = await recordPackVerificationEvent(
    baseInput({ outcome: 'READY' }),
    fakes({ latest: 'REVIEW_APPROVED', insertedId: 60 }).deps,
  );
  assert.equal(ok.ok, true);

  const bad = await recordPackVerificationEvent(
    baseInput({ outcome: 'READY' }),
    fakes({ latest: 'VERIFIED' }).deps,
  );
  assert.equal(bad.ok, false);
  assert.equal(bad.ok === false && bad.code, 'CONFLICT');
});

test('race backstop: an insert conflict re-reads and returns the winning row', async () => {
  const { deps } = fakes({ latest: null, insertConflict: true, raceWinner: { id: 77, outcome: 'VERIFIED' } });
  const out = await recordPackVerificationEvent(
    baseInput({ outcome: 'VERIFIED', clientEventId: 'ce-race' }),
    deps,
  );
  assert.deepEqual(out, { ok: true, id: 77, outcome: 'VERIFIED', duplicate: true });
});

test('org scoping: organizationId is threaded into every scoped query', async () => {
  const { deps, cap } = fakes({ latest: null, insertedId: 1 });
  await recordPackVerificationEvent(baseInput({ outcome: 'VERIFIED' }), deps);
  const scoped = cap.queries.filter((q) => /organization_id/.test(q.sql));
  assert.ok(scoped.length >= 3, 'parent, latest, and insert are all org-scoped');
  for (const q of scoped) {
    assert.ok(q.params.includes(ORG), `org bound as a param for: ${q.sql.replace(/\s+/g, ' ').slice(0, 48)}`);
  }
});
