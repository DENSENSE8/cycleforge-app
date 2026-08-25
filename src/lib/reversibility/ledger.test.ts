/**
 * DB-free tests for the reversibility classification and the Process tool's
 * read.
 *
 * These pin BEHAVIOUR, not shape: what an operator is told about a row they
 * cannot undo, and what happens to the rows that already existed before this
 * classification did. A fake `tenantQuery` captures the SQL and scripts the
 * rows; nothing opens a connection.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SESSION_ACTION_KINDS,
  SESSION_ACTION_KIND_LIST,
  resolveActionKind,
} from './action-kinds';
import { discardLedgerEntry, readSessionLedger, toLedgerEntry } from './ledger';
import type { LedgerDeps } from './ledger';

const ORG = '11111111-2222-3333-4444-555555555555';

/** A `tenantQuery` stand-in that records calls and replays scripted rows. */
function fakeQuery(rows: (sql: string) => Array<Record<string, unknown>> = () => []) {
  const calls: Array<{ sql: string; params: ReadonlyArray<unknown> }> = [];
  const deps: LedgerDeps = {
    query: (async (_orgId: string, sql: string, params: ReadonlyArray<unknown> = []) => {
      calls.push({ sql, params });
      return { rows: rows(sql), rowCount: rows(sql).length };
    }) as unknown as LedgerDeps['query'],
  };
  return { deps, calls };
}

function row(over: Record<string, unknown> = {}) {
  return {
    id: 12,
    mutation_kind: 'work_session.park',
    status: 'applied',
    actor_kind: 'operator',
    proposed_by_staff_id: 9,
    actor_name: 'Sam',
    reversibility: 'revertable',
    extra_audit: { inverse: { kind: 'work_session.resume', payload: { sessionId: 77 } } },
    created_at: '2026-08-23T10:00:00.000Z',
    target_ref: 'work_session:entity:77',
    ...over,
  };
}

// ─── the classification ──────────────────────────────────────────────────────

test('every kind that declares itself irreversible also says why', () => {
  // The whole discipline in one assertion: a kind may refuse undo, but it may
  // not refuse silently. A blank reason renders as a locked control with no
  // explanation, which is the failure this module exists to prevent.
  for (const kind of SESSION_ACTION_KIND_LIST) {
    const declared = SESSION_ACTION_KINDS[kind].reversibility;
    if (declared.mode === 'irreversible') {
      assert.ok(declared.reason.trim().length > 20, `${kind} needs a real reason, got "${declared.reason}"`);
    }
    if (declared.mode === 'decided_at_apply') {
      assert.ok(declared.note.trim().length > 20, `${kind} needs a real note`);
    }
  }
});

test('resolveActionKind answers from both registries and names which one', () => {
  const operatorKind = resolveActionKind('work_session.park');
  assert.equal(operatorKind?.registry, 'session_action');
  assert.equal(operatorKind?.targetKind, 'work_session');

  const agentKind = resolveActionKind('feed_membership.set_state');
  assert.equal(agentKind?.registry, 'mutation');

  // An unrecognized kind is null, not a throw — a row written by a newer deploy
  // must still render as "something happened" rather than crash the list.
  assert.equal(resolveActionKind('not_a_kind'), null);
});

test('an append-only agent kind keeps its declared reason', () => {
  const signal = resolveActionKind('entity_signal.insert');
  assert.equal(signal?.reversibility.mode, 'irreversible');
});

// ─── the reader ──────────────────────────────────────────────────────────────

test('a legacy row (reversibility=unknown) is resolved from its captured inverse', () => {
  // Rows written before 2026-08-23a default to 'unknown'. The column cannot
  // answer for them, but extra_audit.inverse can — and it is the same signal
  // revertAgentMutation has always used, so the tool and the reverter agree.
  const withInverse = toLedgerEntry(row({ reversibility: 'unknown' }) as never);
  assert.equal(withInverse.reversibility, 'revertable');
  assert.equal(withInverse.canRevert, true);

  const withoutInverse = toLedgerEntry(
    row({ reversibility: 'unknown', extra_audit: { inverse: null } }) as never,
  );
  assert.equal(withoutInverse.reversibility, 'irreversible');
  assert.equal(withoutInverse.canRevert, false);
  assert.ok(withoutInverse.irreversibleReason, 'an irreversible row always carries a reason');
});

test('an already-reverted row is still revertable-in-kind but offers no button', () => {
  // Two different questions. Conflating them offers Undo on something already
  // undone, and the second press either 409s or — worse — re-applies.
  const entry = toLedgerEntry(row({ status: 'reverted' }) as never);
  assert.equal(entry.reversibility, 'revertable');
  assert.equal(entry.canRevert, false);
});

test('a proposal offers no undo — it never applied anything', () => {
  const entry = toLedgerEntry(row({ status: 'proposed', extra_audit: {} }) as never);
  assert.equal(entry.canRevert, false);
});

test('an unrecognized kind renders as its raw string rather than a blank row', () => {
  const entry = toLedgerEntry(row({ mutation_kind: 'from.the.future' }) as never);
  assert.equal(entry.label, 'from.the.future');
  assert.equal(entry.actorKind, 'operator');
});

test('readSessionLedger reads ONE table, scoped by org AND session', async () => {
  const { deps, calls } = fakeQuery((sql) => (sql.includes('FROM agent_mutations') ? [row()] : []));
  const entries = await readSessionLedger(ORG, 77, deps);

  assert.equal(entries.length, 1);
  assert.equal(entries[0]!.label, 'Park session');
  // The Process tool must not become a fourteenth journey spine.
  assert.equal(calls.length, 1);
  assert.match(calls[0]!.sql, /FROM agent_mutations/);
  assert.match(calls[0]!.sql, /m\.organization_id = \$1/);
  assert.match(calls[0]!.sql, /m\.work_session_id = \$2/);
});

// ─── discard ─────────────────────────────────────────────────────────────────

test('discard refuses an APPLIED row and says to undo it instead', async () => {
  // Deleting the record of a change that happened leaves a changed database
  // with no trace of who changed it — the exact failure this phase prevents.
  const { deps, calls } = fakeQuery((sql) => (sql.includes('SELECT status') ? [{ status: 'applied' }] : []));
  const out = await discardLedgerEntry(ORG, 12, deps);

  assert.equal(out.ok, false);
  assert.equal(out.ok === false && out.status, 409);
  assert.match(out.ok === false ? out.error : '', /Undo it instead/);
  // Read only — nothing was written.
  assert.ok(!calls.some((c) => c.sql.includes('UPDATE agent_mutations')));
});

test('discard of a proposal marks it rejected, the status the schema already has for it', async () => {
  const { deps, calls } = fakeQuery((sql) => (sql.includes('SELECT status') ? [{ status: 'proposed' }] : []));
  const out = await discardLedgerEntry(ORG, 12, deps);

  assert.equal(out.ok, true);
  const update = calls.find((c) => c.sql.includes('UPDATE agent_mutations'));
  assert.ok(update, 'the proposal is rejected');
  assert.match(update!.sql, /status = 'rejected'/);
  // Belt and braces: the UPDATE itself refuses applied/reverted rows, so a
  // racing apply between the read and the write cannot be erased.
  assert.match(update!.sql, /status NOT IN \('applied', 'reverted'\)/);
});
