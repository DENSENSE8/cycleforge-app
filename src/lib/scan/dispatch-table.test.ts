/**
 * The dispatch table is the phone's whole navigation model, so this file is
 * the table itself, asserted row by row: every line of
 * docs/warehouse-os/PLAN-scan-shell-mobile.md → "Dispatch (mobile subset)",
 * both preview-vs-act rules, and the one genuine tie.
 *
 * A row that stops being asserted here is a row an operator will hit on the
 * floor with no Card behind it — which the plan's hand gate names exactly:
 * "every 'I wanted a menu' is a missing dispatch row".
 */

import { test } from 'node:test';
import { strictEqual, deepStrictEqual, ok } from 'node:assert';

import { dispatchScan, type ScanCard } from './dispatch-table';
import { routeScan, routeScanPaired } from '../barcode-routing';

// ─── The payloads, one per class ────────────────────────────────────────────

/** UPS — `1Z` + 16 alphanumerics. Printed in human groups; the wedge forwards them. */
const UPS = '1Z 999 AA1 01 2345 4471';
/** FedEx Express — bare 12 digits. */
const FEDEX = '123456789012';
/** USPS IMpb — 22 digits. */
const USPS = '9400111899223197428490';
/** DHL Express — 10 digits. */
const DHL = '1234567890';
/** GS1 SSCC — AI 00 + 18 digits, the licence plate of a foreign logistic unit. */
const SSCC = '(00)123456789012345678';
/** Our own licence plate. */
const LPN = 'H-12';
const BIN = 'A12';
const SERIAL = 'U-SN123';
const SKU = '1809:A03';
const KIT = 'KIT-SKU1-2601-000042';
const TICKET = 'T-9395';

const ORDER = '04-1234';

// ─── Row 1 · carrier tracking, never seen → the door ─────────────────────────

test('carrier tracking never seen opens the Arrival Card and titles the session', () => {
  const d = dispatchScan({ scan: UPS, state: { trackingSeen: false } });
  strictEqual(d.card, 'arrival');
  strictEqual(d.title, 'Intake · UPS 4471');
  strictEqual(d.destination, 'the door');
  strictEqual(d.mode, 'preview', 'nothing armed, so it previews');
});

test('an unknown state is the same as never seen — the honest answer, not a wrong one', () => {
  strictEqual(dispatchScan({ scan: UPS }).card, 'arrival');
  strictEqual(dispatchScan({ scan: FEDEX }).title, 'Intake · FedEx 9012');
  strictEqual(dispatchScan({ scan: USPS }).card, 'arrival');
  strictEqual(dispatchScan({ scan: DHL }).card, 'arrival');
});

// ─── Row 2 · carrier tracking, known carton → the carton's stage ────────────

test('PRIOR STATE WINS: a tracking number with a carton opens the carton, not Arrival', () => {
  const d = dispatchScan({ scan: UPS, state: { trackingSeen: true } });
  strictEqual(d.card, 'carton');
  strictEqual(d.title, null, 'the carton keeps its existing session title');
  strictEqual(d.destination, 'the carton');
});

// ─── Row 3 · LPN / SSCC with open QC → QC ───────────────────────────────────

test('an LPN with an open QC opens the QC Card', () => {
  const d = dispatchScan({ scan: LPN, state: { qcOpen: true } });
  strictEqual(d.card, 'qc');
  strictEqual(d.title, 'QC · LPN 12');
  strictEqual(d.destination, 'QC');
});

test('a foreign SSCC with an open QC opens the same QC Card', () => {
  const d = dispatchScan({ scan: SSCC, state: { qcOpen: true } });
  strictEqual(d.card, 'qc');
  strictEqual(d.title, 'QC · LPN 5678', 'the tail printed large on the label');
});

// ─── Row 4 · LPN staged for pack → Pack ─────────────────────────────────────

test('an LPN staged for pack opens the Pack Card', () => {
  const d = dispatchScan({ scan: LPN, state: { stagedForPack: true } });
  strictEqual(d.card, 'pack');
  strictEqual(d.destination, 'Pack');
});

// ─── Row 5 · bin paired to a pending order → Pack ───────────────────────────

test('a bin paired to a pending order opens Pack and titles it with the order', () => {
  const d = dispatchScan({ scan: BIN, state: { binOrderId: ORDER } });
  strictEqual(d.card, 'pack');
  strictEqual(d.title, 'Pack · 04-1234');
});

test('the pairing may arrive on the route instead of the state (routeScanPaired)', () => {
  const paired = routeScanPaired(BIN, (code) => (code === BIN ? ORDER : null));
  strictEqual(paired?.type, 'bin-paired-order');
  strictEqual(paired?.orderRef, ORDER);

  // No `state` at all: the injected lookup already ran, so the route IS the state.
  const d = dispatchScan({ scan: paired! });
  strictEqual(d.card, 'pack');
  strictEqual(d.title, 'Pack · 04-1234');
});

// ─── Row 6 · bin unpaired → preview ─────────────────────────────────────────

test('an unpaired bin previews and starts nothing', () => {
  const d = dispatchScan({ scan: BIN });
  strictEqual(d.card, 'preview');
  strictEqual(d.title, null);
  strictEqual(d.parks, false);

  // The state-free decode still says `bin` — the new class took nothing from it.
  strictEqual(routeScan(BIN)?.type, 'bin');
});

// ─── Row 7 · serial / SKU / kit / ticket → preview ──────────────────────────

test('serial, SKU, kit and ticket all preview their existing page', () => {
  for (const payload of [SERIAL, SKU, KIT, TICKET]) {
    const d = dispatchScan({ scan: payload });
    strictEqual(d.card, 'preview', `${payload} → preview`);
    strictEqual(d.title, null, `${payload} → no new session title`);
    strictEqual(d.destination, 'a preview');
  }
});

test('a licence plate with nothing outstanding previews too', () => {
  strictEqual(dispatchScan({ scan: LPN }).card, 'preview');
  strictEqual(dispatchScan({ scan: SSCC }).card, 'preview');
});

// ─── Preview vs act ─────────────────────────────────────────────────────────

test('NO ARMED SESSION: every scan previews, whatever Card it opens', () => {
  const scans = [UPS, LPN, BIN, SERIAL, SKU, KIT, TICKET, SSCC];
  for (const scan of scans) {
    const d = dispatchScan({ scan, state: { qcOpen: true, binOrderId: ORDER } });
    strictEqual(d.mode, 'preview', `${scan} previews with nothing armed`);
    strictEqual(d.parks, false);
  }
});

test('ARMED SESSION: an expected class acts', () => {
  const d = dispatchScan({
    scan: LPN,
    state: { qcOpen: true },
    armedSession: { expects: ['handling-unit', 'sscc'], title: 'QC · LPN 12' },
  });
  strictEqual(d.mode, 'act');
  strictEqual(d.card, 'qc');
  strictEqual(d.parks, true);
});

test('ARMED SESSION: any other class previews over it and PARKS NOTHING', () => {
  const d = dispatchScan({
    scan: BIN,
    state: { binOrderId: ORDER },
    armedSession: { expects: ['handling-unit', 'sscc'], title: 'QC · LPN 12' },
  });
  strictEqual(d.mode, 'preview');
  strictEqual(d.card, 'pack', 'the Card is still the right one — only the mode changes');
  strictEqual(d.parks, false, 'an unexpected scan must never enqueue itself');
  ok(/not what this session is waiting for/.test(d.reason), d.reason);
});

test('a bin that turned out to be paired still satisfies a session armed for bins', () => {
  const paired = routeScanPaired(BIN, () => ORDER)!;
  const d = dispatchScan({ scan: paired, armedSession: { expects: ['bin'] } });
  strictEqual(d.mode, 'act', 'pairing is a fact the session did not have when it armed');
  strictEqual(d.parks, true);
});

// ─── The tie ────────────────────────────────────────────────────────────────

test('A TIE ASKS: an LPN both in QC and staged for pack names both candidates', () => {
  const d = dispatchScan({
    scan: LPN,
    state: { qcOpen: true, stagedForPack: true },
    armedSession: { expects: ['handling-unit'] },
  });
  strictEqual(d.mode, 'ask', 'neither row is more true than the other');
  deepStrictEqual([...(d.candidates ?? [])], ['qc', 'pack']);
  strictEqual(d.parks, false, 'an ask parks nothing either');
  strictEqual(d.destination, 'two Cards — pick one');
});

test('ONE stateful row is not a tie — a paired bin just opens Pack', () => {
  // Only a second stateful row naming a DIFFERENT Card can ask. A paired bin
  // matches one; the class-default rows below it never get a say.
  const d = dispatchScan({ scan: BIN, state: { binOrderId: ORDER } });
  strictEqual(d.mode, 'preview');
  strictEqual(d.card, 'pack');
  strictEqual(d.candidates, undefined);

  // Neither does a class default that happens to agree with nothing else.
  strictEqual(dispatchScan({ scan: UPS }).candidates, undefined);
});

// ─── Invariants ─────────────────────────────────────────────────────────────

test('every dispatch names its destination in words before acting', () => {
  const cases = [
    { scan: UPS, state: {} },
    { scan: UPS, state: { trackingSeen: true } },
    { scan: LPN, state: { qcOpen: true } },
    { scan: LPN, state: { stagedForPack: true } },
    { scan: LPN, state: { qcOpen: true, stagedForPack: true } },
    { scan: SSCC, state: { qcOpen: true } },
    { scan: BIN, state: { binOrderId: ORDER } },
    { scan: BIN, state: {} },
    { scan: SERIAL, state: {} },
    { scan: SKU, state: {} },
    { scan: KIT, state: {} },
    { scan: TICKET, state: {} },
  ];
  const seen = new Set<ScanCard>();
  for (const c of cases) {
    const d = dispatchScan(c);
    ok(d.destination.length > 0, `${c.scan} → destination`);
    ok(d.reason.length > 0, `${c.scan} → reason`);
    ok(['act', 'preview', 'ask'].includes(d.mode), `${c.scan} → one of three modes`);
    seen.add(d.card);
  }
  deepStrictEqual(
    [...seen].sort(),
    ['arrival', 'carton', 'pack', 'preview', 'qc'],
    'every Card in the table is reachable',
  );
});

test('an empty scan previews rather than guessing', () => {
  const d = dispatchScan({ scan: '' });
  strictEqual(d.card, 'preview');
  strictEqual(d.mode, 'preview');
  strictEqual(d.title, null);
});
