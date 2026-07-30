/**
 * Unit tests for the loss write-off domain (Phase 3 of
 * docs/todo/ebay-delivered-not-unboxed-PLAN.md). DB-free via injected fakes.
 *
 * The load-bearing assertions:
 *   1. the narrow vocabulary — an OS&D code cannot write a carton off,
 *   2. absence is an ERROR here (unlike the photo-policy override),
 *   3. the justification is server-assembled; the body cannot supply it,
 *   4. reopen resolves ONLY loss codes, never a sibling DAMAGED/SHORT finding,
 *   5. the feed's exit predicate keys on OPEN status, which is what makes the
 *      write-off reversible.
 *
 * Run: `npx tsx --test src/lib/receiving/loss-writeoff.test.ts`
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  LOSS_WRITEOFF_INVALID_CODE,
  lossWriteoffInvalidBody,
  normalizeLossNote,
  parseLossCode,
  recordLossWriteoff,
  reopenLossWriteoff,
} from './loss-writeoff';
import {
  LOSS_EXCEPTION_CODES,
  NO_OPEN_LOSS_EXCEPTION_PREDICATE,
} from './exception-codes';

const ORG = 'org-1' as never;

function fakes() {
  const recorded: Array<Record<string, unknown>> = [];
  const resolveCalls: Array<{ lineId: number; code: string | null | undefined }> = [];
  return {
    recorded,
    resolveCalls,
    deps: {
      recordException: async (_org: never, input: Record<string, unknown>) => {
        recorded.push(input);
        return { id: 900 + recorded.length };
      },
      resolveExceptions: async (
        _org: never,
        lineId: number,
        opts: { exceptionCode?: string | null } = {},
      ) => {
        resolveCalls.push({ lineId, code: opts.exceptionCode });
        // Pretend exactly the LOST_IN_TRANSIT row was open.
        return opts.exceptionCode === 'LOST_IN_TRANSIT' ? 1 : 0;
      },
    } as never,
  };
}

// ── 1. vocabulary is narrow ────────────────────────────────────────────────────

test('parseLossCode accepts only the loss slice', () => {
  for (const code of LOSS_EXCEPTION_CODES) {
    assert.deepEqual(parseLossCode(code), { state: 'valid', code });
  }
});

test('parseLossCode rejects OS&D and photo-waiver codes', () => {
  // Valid receiving-exception codes, but not write-off reasons.
  for (const code of ['SHORT', 'OVER', 'DAMAGED', 'NO_PO', 'PHOTO_WAIVED_DEFERRED']) {
    assert.equal(parseLossCode(code).state, 'invalid', `${code} must not write a carton off`);
  }
});

test('parseLossCode rejects non-strings and unknown text', () => {
  for (const raw of [42, {}, [], true, 'LOST', 'lost_in_transit']) {
    assert.equal(parseLossCode(raw).state, 'invalid');
  }
});

// ── 2. absence is an error on THIS path ────────────────────────────────────────

test('absent / blank code is `absent`, and the route treats it as a 400', () => {
  for (const raw of [undefined, null, '', '   ']) {
    assert.equal(parseLossCode(raw).state, 'absent');
  }
  // Only `valid` proceeds — both other states 400 (see the route's `!== 'valid'`).
  const body = lossWriteoffInvalidBody();
  assert.equal(body.error, LOSS_WRITEOFF_INVALID_CODE);
  assert.deepEqual([...body.allowed], [...LOSS_EXCEPTION_CODES]);
  assert.equal(body.success, false);
});

// ── 3. the justification is server-assembled ──────────────────────────────────

test('reason is assembled from the code + delivery facts, never from the note', async () => {
  const { recorded, deps } = fakes();
  await recordLossWriteoff(
    ORG,
    {
      code: 'STOLEN',
      receivingLineId: 7,
      receivingId: 3,
      deliveredAt: '2026-07-01 09:00:00-07',
      note: 'TOTALLY LEGIT JUSTIFICATION',
      staffId: 11,
    },
    deps,
  );
  const row = recorded[0];
  assert.equal(row.exceptionCode, 'STOLEN');
  // Server text derives from the registry label + the delivery instant…
  assert.match(String(row.reason), /^Written off at receiving: Stolen \(carrier delivered /);
  // …and the operator's text never leaks into it.
  assert.ok(!String(row.reason).includes('TOTALLY LEGIT'));
  // The note is kept, but as separate evidence.
  assert.equal(row.supportNotes, 'TOTALLY LEGIT JUSTIFICATION');
  assert.equal(row.createdBy, 11);
  assert.equal(row.receivingLineId, 7);
  assert.equal(row.receivingId, 3);
});

test('reason omits the delivery clause when there is no delivered_at', async () => {
  const { recorded, deps } = fakes();
  await recordLossWriteoff(
    ORG,
    { code: 'EMPTY_BOX', receivingLineId: 1, receivingId: null, staffId: null },
    deps,
  );
  assert.equal(recorded[0].reason, 'Written off at receiving: Empty box');
  assert.equal(recorded[0].supportNotes, null);
});

test('notes are trimmed, blank-to-null, and length-capped', () => {
  assert.equal(normalizeLossNote('  hi  '), 'hi');
  assert.equal(normalizeLossNote('   '), null);
  assert.equal(normalizeLossNote(undefined), null);
  assert.equal(normalizeLossNote(123), null);
  const long = normalizeLossNote('x'.repeat(900));
  assert.equal(long?.length, 500);
  assert.ok(long?.endsWith('…'));
});

test('one write-off writes exactly one exception row', async () => {
  const { recorded, deps } = fakes();
  const { exceptionId } = await recordLossWriteoff(
    ORG,
    { code: 'MISDELIVERED', receivingLineId: 5, receivingId: 2, staffId: 1 },
    deps,
  );
  assert.equal(recorded.length, 1);
  assert.equal(exceptionId, 901);
});

// ── 4. reopen is scoped to loss codes ─────────────────────────────────────────

test('reopen resolves each loss code explicitly, never the resolve-all form', async () => {
  const { resolveCalls, deps } = fakes();
  const { resolved } = await reopenLossWriteoff(ORG, 42, 9, deps);

  assert.equal(resolved, 1); // only LOST_IN_TRANSIT was open
  assert.deepEqual(
    resolveCalls.map((c) => c.code),
    [...LOSS_EXCEPTION_CODES],
  );
  // The null form would close an unrelated DAMAGED/SHORT finding as a side-effect
  // of reopening — it must never be used here.
  assert.ok(
    resolveCalls.every((c) => c.code != null),
    'reopen must not pass exceptionCode: null (resolves EVERY open exception)',
  );
  assert.ok(resolveCalls.every((c) => c.lineId === 42));
});

test('reopen with nothing written off returns 0 (the route maps that to 404)', async () => {
  const deps = {
    recordException: async () => ({ id: 1 }),
    resolveExceptions: async () => 0,
  } as never;
  const { resolved } = await reopenLossWriteoff(ORG, 42, null, deps);
  assert.equal(resolved, 0);
});

// ── 5. the exit predicate is what makes this reversible ───────────────────────

test('feed exit predicate keys on OPEN status and only loss codes', () => {
  const sql = NO_OPEN_LOSS_EXCEPTION_PREDICATE;
  assert.match(sql, /NOT EXISTS/);
  assert.match(sql, /receiving_exceptions/);
  // OPEN-scoped is the reversibility mechanism: resolving returns the row.
  assert.match(sql, /status = 'OPEN'/);
  // Org-scoped correlation, not a global lookup.
  assert.match(sql, /re_loss\.organization_id = rl\.organization_id/);
  for (const code of LOSS_EXCEPTION_CODES) {
    assert.ok(sql.includes(`'${code}'`), `predicate must list ${code}`);
  }
  // Must NOT leak OS&D codes — a DAMAGED line stays in the lane (goods arrived).
  for (const code of ['SHORT', 'DAMAGED', 'NO_PO']) {
    assert.ok(!sql.includes(`'${code}'`), `predicate must not exclude ${code} lines`);
  }
});
