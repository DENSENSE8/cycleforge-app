/**
 * receiveLineUnits — Step D fold tests.
 *
 * Two halves:
 *   1. resolveReceiveWorkflowTarget — the pure TS replica of the workflow CASE
 *      the legacy combined UPDATE ran in SQL. Exhaustively pins the semantics
 *      the fold must preserve: explicit DONE always wins, explicit
 *      UNBOXED/MATCHED are advance-only-guarded (scan_only's advanceOnly=false
 *      revert still rewinds), qty completion auto-advances to UNBOXED only
 *      when no explicit target is set, otherwise the line stays put.
 *   2. Source-level invariants (same style as serial-attach.test.ts): the
 *      lifecycle half must route through transitionReceivingLine() — no raw
 *      `workflow_status =` write may reappear — and the load-bearing
 *      `:workflow-<to>` client_event_id lineage must survive (batch
 *      replay-detection LIKEs on `<clientEventId>:%`; UNIQUE(client_event_id)
 *      retry idempotency keys off it).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolveReceiveWorkflowTarget } from './receive-line';

const TESTING_OR_BEYOND = ['AWAITING_TEST', 'IN_TEST', 'PASSED', 'FAILED', 'RTV', 'SCRAP', 'DONE'];

function target(args: Partial<Parameters<typeof resolveReceiveWorkflowTarget>[0]>) {
  return resolveReceiveWorkflowTarget({
    current: null,
    explicit: null,
    advanceOnly: false,
    quantityExpected: null,
    priorReceived: 0,
    effectiveUnits: 0,
    ...args,
  });
}

// ─── explicit DONE ────────────────────────────────────────────────────────────

test('explicit DONE always wins, from any state, regardless of advanceOnly', () => {
  for (const current of ['EXPECTED', 'ARRIVED', 'MATCHED', 'UNBOXED', 'IN_TEST', null]) {
    assert.equal(target({ current, explicit: 'DONE', advanceOnly: true }), 'DONE');
    assert.equal(target({ current, explicit: 'DONE', advanceOnly: false }), 'DONE');
  }
});

// ─── explicit UNBOXED (advance-only guard) ────────────────────────────────────

test('explicit UNBOXED advances pre-unbox states', () => {
  for (const current of ['EXPECTED', 'ARRIVED', 'MATCHED']) {
    assert.equal(target({ current, explicit: 'UNBOXED', advanceOnly: true }), 'UNBOXED');
  }
});

test('explicit UNBOXED + advanceOnly never walks a testing/received line back', () => {
  for (const current of TESTING_OR_BEYOND) {
    assert.equal(
      target({ current, explicit: 'UNBOXED', advanceOnly: true }),
      current,
      `advance-only UNBOXED must keep ${current}`,
    );
  }
});

test('explicit UNBOXED without advanceOnly rewinds a testing line (legacy CASE parity)', () => {
  assert.equal(target({ current: 'AWAITING_TEST', explicit: 'UNBOXED', advanceOnly: false }), 'UNBOXED');
});

test('explicit UNBOXED on a NULL-status line applies (SQL NULL IN (...) is not-matched)', () => {
  assert.equal(target({ current: null, explicit: 'UNBOXED', advanceOnly: true }), 'UNBOXED');
});

// ─── explicit MATCHED (advance-only guard + scan_only revert) ─────────────────

test('explicit MATCHED advances EXPECTED/ARRIVED', () => {
  for (const current of ['EXPECTED', 'ARRIVED']) {
    assert.equal(target({ current, explicit: 'MATCHED', advanceOnly: true }), 'MATCHED');
  }
});

test('explicit MATCHED + advanceOnly never downgrades an unboxed-or-beyond line', () => {
  for (const current of ['UNBOXED', ...TESTING_OR_BEYOND]) {
    assert.equal(
      target({ current, explicit: 'MATCHED', advanceOnly: true }),
      current,
      `advance-only MATCHED must keep ${current}`,
    );
  }
});

test('scan_only revert (advanceOnly=false) still walks UNBOXED back to MATCHED', () => {
  assert.equal(target({ current: 'UNBOXED', explicit: 'MATCHED', advanceOnly: false }), 'MATCHED');
});

// ─── auto-UNBOXED on qty completion (only with no explicit target) ────────────

test('qty completion auto-advances to UNBOXED when no explicit target', () => {
  assert.equal(
    target({ current: 'MATCHED', quantityExpected: 5, priorReceived: 3, effectiveUnits: 2 }),
    'UNBOXED',
  );
  // over-complete also advances (>=)
  assert.equal(
    target({ current: 'EXPECTED', quantityExpected: 2, priorReceived: 2, effectiveUnits: 1 }),
    'UNBOXED',
  );
});

test('qty completion does NOT fire when an explicit target already decided', () => {
  // explicit MATCHED + advance-only keep must not be overridden by completeness
  assert.equal(
    target({
      current: 'UNBOXED',
      explicit: 'MATCHED',
      advanceOnly: true,
      quantityExpected: 1,
      priorReceived: 0,
      effectiveUnits: 1,
    }),
    'UNBOXED',
  );
});

test('incomplete qty with no explicit target leaves the line unchanged', () => {
  assert.equal(
    target({ current: 'MATCHED', quantityExpected: 5, priorReceived: 1, effectiveUnits: 2 }),
    'MATCHED',
  );
  assert.equal(target({ current: 'EXPECTED', quantityExpected: null, effectiveUnits: 3 }), 'EXPECTED');
  assert.equal(target({ current: null }), null);
});

test('over-cap supplemental (effectiveUnits=0) does not fake completeness', () => {
  // priorReceived already < expected and this call counted nothing.
  assert.equal(
    target({ current: 'MATCHED', quantityExpected: 5, priorReceived: 3, effectiveUnits: 0 }),
    'MATCHED',
  );
});

// ─── Source-level invariants (Step D fold) ────────────────────────────────────

const receiveLineSrc = readFileSync(
  fileURLToPath(new URL('./receive-line.ts', import.meta.url)),
  'utf8',
);

test('receive-line has NO raw workflow_status write — lifecycle goes through the chokepoint', () => {
  // Reads (SELECT / RETURNING ... AS workflow_status) are fine; an assignment
  // anywhere in SQL (`workflow_status =` / `workflow_status = CASE`) is the
  // raw-UPDATE bypass this fold removed.
  assert.ok(
    !/workflow_status\s*=/.test(receiveLineSrc),
    'receive-line.ts must not assign workflow_status in SQL — call transitionReceivingLine()',
  );
  assert.ok(
    /transitionReceivingLine\(/.test(receiveLineSrc),
    'receive-line.ts must route the workflow transition through transitionReceivingLine()',
  );
});

test('workflow transition keeps the `:workflow-<to>` client_event_id lineage', () => {
  assert.ok(
    /:workflow-\$\{nextWorkflow\}/.test(receiveLineSrc),
    'client_event_id suffix must stay `<clientEventId>:workflow-<to>` — batch replay detection LIKEs on `<clientEventId>:%`',
  );
});

test('facts UPDATE and the chokepoint call share the same transaction client', () => {
  // The transition must be passed the tx client (executor mode) so it joins the
  // FOR UPDATE lock already held — not spawn its own transaction.
  assert.ok(
    /transitionReceivingLine\([\s\S]{0,1200}?\},\s*\n\s*client,\s*\n\s*input\.organizationId,/.test(receiveLineSrc),
    'transitionReceivingLine must receive the withTenantTransaction client + orgId',
  );
});

// ─── Wave-3 writer inversion (testing facts → receiving_line_testing) ─────────

test('qa/disposition/condition are never written to the receiving_line spine', () => {
  // The spine columns are dropped after this wave — any `col =` assignment in
  // SQL (SET list or INSERT) is a regression. Object-literal `col:` uses are fine.
  for (const col of ['qa_status', 'disposition_code', 'condition_grade']) {
    assert.ok(
      !new RegExp(`${col}\\s*=`).test(receiveLineSrc),
      `receive-line.ts must not assign ${col} in SQL — testing facts go through upsertReceivingLineTesting`,
    );
  }
  assert.ok(
    /upsertReceivingLineTesting\(/.test(receiveLineSrc),
    'receive-line.ts must route testing facts through upsertReceivingLineTesting',
  );
});

test('the testing-facts upsert is bound to the same transaction client', () => {
  // The facts write must share the FOR UPDATE lock + rollback semantics of the
  // receive transaction — never a fresh pooled connection.
  assert.ok(
    /upsertReceivingLineTesting\([\s\S]{0,600}?client\.query\(sql,/.test(receiveLineSrc),
    'upsertReceivingLineTesting must receive deps bound to the tx client',
  );
});

test('zoho_item_id is read from receiving_line_zoho, not the spine', () => {
  assert.ok(
    /LEFT JOIN receiving_line_zoho/.test(receiveLineSrc),
    'loadLineForUpdate must source zoho_item_id from receiving_line_zoho',
  );
  assert.ok(
    /FOR UPDATE OF rl/.test(receiveLineSrc),
    'the line lock must be FOR UPDATE OF rl (outer-joined rz is not lockable)',
  );
});
