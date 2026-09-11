/**
 * The object-state resolver is the read that lights the dispatch table's
 * stateful rows, so this file asserts the wiring law it exists under:
 *
 *   - every handling-unit status maps to exactly the state facts the table's
 *     rows predicate on (`staged-for-pack`, `qc-open`), and nothing more;
 *   - an unknown object answers `known: false` with an EMPTY state — the
 *     honest default, never a guessed "staged" that would hijack the phone
 *     to Pack;
 *   - only classes that can turn on state touch the deps at all.
 *
 * A row that stops being asserted here is a tote an operator will scan on the
 * floor with a Card that lies about what is outstanding on it.
 */

import { test } from 'node:test';
import { strictEqual, deepStrictEqual, ok } from 'node:assert';

import {
  objectStateForHandlingUnitStatus,
  resolveScanObjectState,
  type ScanObjectStateDeps,
} from './object-state';
import { dispatchScan } from './dispatch-table';
import type { HandlingUnitStatus } from '@/lib/neon/handling-unit-queries';

// ─── The fixture: a deps fake that records every lookup ─────────────────────

/** LPN id → stored status. Absent id = no such box. */
function depsFor(
  boxes: Map<number, HandlingUnitStatus>,
): ScanObjectStateDeps & { calls: number[] } {
  const calls: number[] = [];
  return {
    calls,
    getHandlingUnitStatus: async (id) => {
      calls.push(id);
      return boxes.get(id) ?? null;
    },
  };
}

/** Our own licence plate, and the absolute URL its printed QR carries. */
const LPN = 'H-12';
const LPN_QR = 'https://usavshop.com/m/h/12';
/** GS1 SSCC — a foreign plate; the house stores no SSCC on any row. */
const SSCC = '(00)123456789012345678';
const BIN = 'A12';
const SKU = '1809:A03';

// ─── Status → state facts, one row per stored status ────────────────────────

test('STAGED maps to stagedForPack — the operator set this tote up for pack-out', () => {
  deepStrictEqual(objectStateForHandlingUnitStatus('STAGED'), {
    stagedForPack: true,
    qcOpen: false,
  });
});

test('IN_TEST maps to qcOpen — members are mid-testing, the QC check is genuinely open', () => {
  deepStrictEqual(objectStateForHandlingUnitStatus('IN_TEST'), {
    stagedForPack: false,
    qcOpen: true,
  });
});

test('OPEN and CLOSED map to nothing outstanding — an untouched or finished box is not in QC', () => {
  deepStrictEqual(objectStateForHandlingUnitStatus('OPEN'), {
    stagedForPack: false,
    qcOpen: false,
  });
  deepStrictEqual(objectStateForHandlingUnitStatus('CLOSED'), {
    stagedForPack: false,
    qcOpen: false,
  });
});

// ─── The resolver: handle form and printed-URL form name the same row ───────

test('an H- handle resolves its box by the id the redirect carries', async () => {
  const deps = depsFor(new Map([[12, 'STAGED']]));
  const r = await resolveScanObjectState(LPN, deps);
  ok(r);
  strictEqual(r.known, true);
  deepStrictEqual(deps.calls, [12]);
  deepStrictEqual(r.state, { stagedForPack: true, qcOpen: false });
});

test('the printed QR URL resolves the SAME box as the bare handle', async () => {
  const deps = depsFor(new Map([[12, 'IN_TEST']]));
  const r = await resolveScanObjectState(LPN_QR, deps);
  ok(r);
  strictEqual(r.known, true);
  deepStrictEqual(deps.calls, [12], 'the absolute URL and the handle are one decode');
  deepStrictEqual(r.state, { stagedForPack: false, qcOpen: true });
});

test('an unknown box id answers known:false with an EMPTY state — never a guess', async () => {
  const deps = depsFor(new Map());
  const r = await resolveScanObjectState('H-404', deps);
  ok(r);
  strictEqual(r.type, 'handling-unit');
  strictEqual(r.known, false);
  deepStrictEqual(r.state, {});
});

// ─── Classes that cannot turn on state never touch the deps ─────────────────

test('a foreign SSCC is unknown by construction — no row stores it, none is asked', async () => {
  const deps = depsFor(new Map());
  const r = await resolveScanObjectState(SSCC, deps);
  ok(r);
  strictEqual(r.type, 'sscc');
  strictEqual(r.known, false);
  deepStrictEqual(r.state, {});
  deepStrictEqual(deps.calls, [], 'no lookup for a plate with no local row');
});

test('a bin is honest-unpaired until an order-book producer exists', async () => {
  const deps = depsFor(new Map());
  const r = await resolveScanObjectState(BIN, deps);
  ok(r);
  strictEqual(r.type, 'bin');
  strictEqual(r.known, false);
  deepStrictEqual(r.state, {});
  deepStrictEqual(deps.calls, []);
});

test('a SKU never reaches the deps — its Card cannot turn on object state', async () => {
  const deps = depsFor(new Map());
  const r = await resolveScanObjectState(SKU, deps);
  ok(r);
  strictEqual(r.type, 'sku');
  deepStrictEqual(deps.calls, []);
});

// ─── End to end: resolver output feeds the table and the right row fires ─────

test('a STAGED tote scans straight to the pack Card — the whole point of the read', async () => {
  const r = await resolveScanObjectState(LPN, depsFor(new Map([[12, 'STAGED']])));
  ok(r);
  const d = dispatchScan({ scan: LPN, state: r.state });
  strictEqual(d.card, 'pack');
  strictEqual(d.title, 'Pack · 12');
  strictEqual(d.reason, 'this licence plate is staged for pack');
});

test('an IN_TEST tote scans to the QC Card with its LPN title', async () => {
  const r = await resolveScanObjectState(LPN_QR, depsFor(new Map([[12, 'IN_TEST']])));
  ok(r);
  const d = dispatchScan({ scan: LPN_QR, state: r.state });
  strictEqual(d.card, 'qc');
  strictEqual(d.title, 'QC · LPN 12');
});

test('an OPEN tote previews — nothing outstanding, so the class default answers', async () => {
  const r = await resolveScanObjectState(LPN, depsFor(new Map([[12, 'OPEN']])));
  ok(r);
  const d = dispatchScan({ scan: LPN, state: r.state });
  strictEqual(d.card, 'preview');
  strictEqual(d.reason, 'nothing outstanding on this object');
});

test('an unknown tote previews — the empty state is the table’s honest default', async () => {
  const r = await resolveScanObjectState('H-404', depsFor(new Map()));
  ok(r);
  const d = dispatchScan({ scan: 'H-404', state: r.state });
  strictEqual(d.card, 'preview');
});
