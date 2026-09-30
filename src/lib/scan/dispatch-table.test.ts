/** The dispatch table is the phone's whole navigation model, so this file is the table itself, asserted row by row: */

import { test } from 'node:test';
import { strictEqual, deepStrictEqual, ok } from 'node:assert';

import { dispatchScan, QC_SCAN_SESSION, type ScanCard } from './dispatch-table';
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

// ─── The scan kernel armed to RUN QC (`/m/scan?work=qc`) ────────────────────

test('ARMED FOR QC: every unit label unbox prints opens QC on that unit and parks', () => {
  const labels: Array<[string, string]> = [
    [SERIAL, 'QC · Unit SN123'],
    ['(01)00012345678905(21)CN1A2B3', 'QC · Unit CN1A2B3'],
    ['https://usav.app.cycleforge.ai/01/00012345678905/21/CN1A2B3', 'QC · Unit CN1A2B3'],
    ['IPH13-128-BLU-2601-000042', 'QC · Unit IPH13-128-BLU-2601-000042'],
  ];
  for (const [label, title] of labels) {
    strictEqual(routeScan(label)?.type, 'serial-unit', `${label} is a unit label`);
    const d = dispatchScan({ scan: label, armedSession: QC_SCAN_SESSION });
    strictEqual(d.card, 'qc', `${label} → qc`);
    strictEqual(d.mode, 'act', `${label} → the station takes it`);
    strictEqual(d.parks, true, `${label} → parks`);
    strictEqual(d.title, title);
    strictEqual(d.destination, 'QC');
    ok(/running QC on units/.test(d.reason), d.reason);
  }
});

test('a unit label outside a QC session still previews — the row needs the armed work', () => {
  strictEqual(dispatchScan({ scan: SERIAL }).card, 'preview', 'nothing armed');

  // Armed for units but doing some OTHER job: the unit acts, but not as QC.
  const other = dispatchScan({ scan: SERIAL, armedSession: { expects: ['serial-unit'] } });
  strictEqual(other.card, 'preview');
  strictEqual(other.mode, 'act');
  strictEqual(other.title, null);

  const pack = dispatchScan({ scan: SERIAL, armedSession: { expects: ['serial-unit'], work: 'pack' } });
  strictEqual(pack.card, 'preview', 'a session armed for Pack does not open QC');
});

test('ARMED FOR QC: an LPN keeps qc-open semantics and is not taken as a unit', () => {
  const open = dispatchScan({ scan: LPN, state: { qcOpen: true }, armedSession: QC_SCAN_SESSION });
  strictEqual(open.card, 'qc');
  strictEqual(open.title, 'QC · LPN 12', 'the LPN title, not a unit title');
  strictEqual(open.mode, 'preview', 'the unit station does not expect licence plates');
  strictEqual(open.parks, false);

  // With nothing open the plate previews, whatever the session is running.
  strictEqual(dispatchScan({ scan: LPN, armedSession: QC_SCAN_SESSION }).card, 'preview');

  // And the LPN tie is untouched by the new row.
  const tie = dispatchScan({
    scan: LPN,
    state: { qcOpen: true, stagedForPack: true },
    armedSession: { ...QC_SCAN_SESSION, expects: ['handling-unit'] },
  });
  strictEqual(tie.mode, 'ask');
  deepStrictEqual([...(tie.candidates ?? [])], ['qc', 'pack']);
});

test('ARMED FOR QC: a bin or a tracking number previews and parks nothing', () => {
  for (const scan of [BIN, UPS]) {
    const d = dispatchScan({ scan, armedSession: QC_SCAN_SESSION });
    strictEqual(d.mode, 'preview', `${scan} is not what a QC station takes`);
    strictEqual(d.parks, false);
    ok(/not what this session is waiting for/.test(d.reason), d.reason);
  }
  // A paired bin still names its own Card — only the mode refuses it.
  strictEqual(dispatchScan({ scan: BIN, state: { binOrderId: ORDER }, armedSession: QC_SCAN_SESSION }).card, 'pack');
});

test('ARMED FOR QC: a line label opens QC to pick one of its units', () => {
  for (const [scan, title] of [
    ['L-77', 'QC · Line L-77'],
    ['https://usav.app.cycleforge.ai/m/l/77', 'QC · Line L-77'],
  ] as const) {
    const d = dispatchScan({ scan, armedSession: QC_SCAN_SESSION });
    strictEqual(d.card, 'qc', scan);
    strictEqual(d.mode, 'act', 'the station expects line labels');
    strictEqual(d.parks, true);
    strictEqual(d.title, title);
  }

  // Outside a QC session a line label is the plain preview it always was.
  strictEqual(dispatchScan({ scan: 'L-77' }).card, 'preview');

  // A station that does not expect lines refuses it like any other stray class.
  const unitsOnly = dispatchScan({ scan: 'L-77', armedSession: { ...QC_SCAN_SESSION, expects: ['serial-unit'] } });
  strictEqual(unitsOnly.mode, 'preview');
  strictEqual(unitsOnly.parks, false);
});

test('ARMED FOR QC: a carton label opens QC to pick one of its units', () => {
  for (const scan of ['R-77', 'r-77', 'r/77', 'RCV-77', 'https://usav.app.cycleforge.ai/m/r/77/qc']) {
    const d = dispatchScan({ scan, armedSession: QC_SCAN_SESSION });
    strictEqual(d.card, 'qc', scan);
    strictEqual(d.mode, 'act', scan);
    strictEqual(d.parks, true, scan);
    strictEqual(d.title, 'QC · Carton R-77', scan);
  }
});

test('UNARMED: the unbox carton label still opens QC, but only previews — nothing parks', () => {
  for (const scan of ['R-77', 'https://usav.app.cycleforge.ai/m/r/77/qc', 'https://usav.app.cycleforge.ai/m/r/77']) {
    const d = dispatchScan({ scan });
    strictEqual(d.card, 'qc', scan);
    strictEqual(d.mode, 'preview', scan);
    strictEqual(d.parks, false, scan);
  }
  // A session armed for other work refuses the carton like any stray class.
  const pack = dispatchScan({ scan: 'R-77', armedSession: { expects: ['bin'], work: 'pack' } });
  strictEqual(pack.card, 'qc');
  strictEqual(pack.parks, false);
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
