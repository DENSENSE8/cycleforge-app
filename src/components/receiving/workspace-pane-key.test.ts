/**
 * Contract for the receiving carton overlay's presence identity.
 *
 * Run: `npx tsx --test src/components/receiving/workspace-pane-key.test.ts`
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveWorkspacePaneSlot,
  scanSlotKey,
  type WorkspacePaneRow,
  type WorkspacePaneSlot,
} from './workspace-pane-key';

const TRK = '1Z999AA10123456784';

/** Pre-resolve optimistic pane stub — no carton yet. */
const paneStub: WorkspacePaneRow = { id: -12345, receiving_id: null, tracking_number: TRK };
/** Matched stub from lookup-po — real carton + real line id. */
const matchedStub: WorkspacePaneRow = { id: 8801, receiving_id: 482, tracking_number: TRK };
/** Hydrated row from `include=serials` — same carton, same line. */
const hydrated: WorkspacePaneRow = { id: 8801, receiving_id: 482, tracking_number: TRK };
/** The same carton reached by clicking its rail row instead of scanning. */
const railRow: WorkspacePaneRow = { id: 8801, receiving_id: 482, tracking_number: TRK };

function walk(rows: WorkspacePaneRow[]): WorkspacePaneSlot[] {
  const out: WorkspacePaneSlot[] = [];
  let slot: WorkspacePaneSlot | null = null;
  for (const row of rows) {
    slot = resolveWorkspacePaneSlot(slot, row);
    out.push(slot);
  }
  return out;
}

test('scanSlotKey normalizes so formatting variants are one identity', () => {
  assert.equal(scanSlotKey(' po-1234 '), scanSlotKey('PO 1234'));
  assert.equal(scanSlotKey(''), null);
  assert.equal(scanSlotKey(null), null);
  assert.equal(scanSlotKey('   '), null);
});

test('scan resolution never changes the key (bug A: mid-scan remount)', () => {
  const keys = walk([paneStub, matchedStub, hydrated]).map((s) => s.key);
  assert.equal(new Set(keys).size, 1, `expected one stable key, got ${JSON.stringify(keys)}`);
});

test('the pending slot adopts the carton it resolves into', () => {
  const [pending, resolved] = walk([paneStub, matchedStub]);
  assert.equal(pending.cartonId, null);
  assert.equal(resolved.cartonId, 482);
  assert.equal(resolved.key, pending.key);
});

test('entry route does not change the key (bug B: scan then rail-click)', () => {
  const keys = walk([paneStub, matchedStub, railRow]).map((s) => s.key);
  assert.equal(new Set(keys).size, 1, `expected one stable key, got ${JSON.stringify(keys)}`);
});

test('a different carton still gets a different key (crossfade preserved)', () => {
  const other: WorkspacePaneRow = { id: 9002, receiving_id: 999, tracking_number: 'TBA777000111' };
  const [, resolved, next] = walk([paneStub, matchedStub, other]);
  assert.notEqual(next.key, resolved.key);
  assert.equal(next.cartonId, 999);
});

test('two cartons sharing a tracking number still crossfade', () => {
  // Nothing enforces one carton per tracking at the DB level, so the adopt rule
  // must not collapse them into one slot.
  const twin: WorkspacePaneRow = { id: 9100, receiving_id: 999, tracking_number: TRK };
  const [, resolved, next] = walk([paneStub, matchedStub, twin]);
  assert.equal(resolved.key, `scan:${normalized(TRK)}`);
  assert.equal(next.key, 'carton:999');
});

test('a scan landing on a NEW carton still remounts the shell', () => {
  // The empty-pane-first policy: scanning box B while box A is open must not
  // reuse box A's shell.
  const otherStub: WorkspacePaneRow = { id: -777, receiving_id: null, tracking_number: 'TBA777000111' };
  const [, open, rescan] = walk([paneStub, matchedStub, otherStub]);
  assert.notEqual(rescan.key, open.key);
});

test('resolve is idempotent under repeated application (StrictMode safety)', () => {
  const rows = [paneStub, matchedStub, hydrated, railRow];
  let slot: WorkspacePaneSlot | null = null;
  for (const row of rows) {
    const once = resolveWorkspacePaneSlot(slot, row);
    const twice = resolveWorkspacePaneSlot(once, row);
    assert.deepEqual(twice, once, `not idempotent for row ${JSON.stringify(row)}`);
    slot = once;
  }
});

test('a lineless row with no tracking falls back to its own id', () => {
  const orphan: WorkspacePaneRow = { id: 4242, receiving_id: null, tracking_number: null };
  assert.equal(resolveWorkspacePaneSlot(null, orphan).key, 'line:4242');
});

test('a non-positive receiving_id is treated as no carton', () => {
  const bogus: WorkspacePaneRow = { id: 5, receiving_id: 0, tracking_number: TRK };
  assert.equal(resolveWorkspacePaneSlot(null, bogus).cartonId, null);
});

/** Mirror of normalizeScanKey for the expectation above. */
function normalized(v: string): string {
  return v.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}
