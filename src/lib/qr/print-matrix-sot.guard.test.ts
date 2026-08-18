/**
 * Guard — `encodePrintMatrix` is the ONLY encode path for a printable matrix.
 *
 * Every printable barcode that leaves this app is three coupled decisions:
 * the encoded string, the symbology, and the typeable HRI under it. Before
 * 2026-08-01 those were decided in five places and had already drifted twice:
 *
 *   • `workspaceLabelToFace('unit')` inlined `qrPayload || serial || sku`, so
 *     the workspace preview showed a bare serial while the printer encoded an
 *     absolute Digital Link — the operator could not tell from the screen what
 *     the sticker would say.
 *   • `productLabelCommands.productFieldsFor` dropped `orgSlug`, so the raw
 *     TSPL/ZPL lane encoded a GS1 element string and the HTML lane encoded the
 *     platform URL. Same sticker, two payloads, decided by which printer the
 *     bench happened to have paired.
 *
 * Both were invisible to type-checking and to every existing test, because
 * each path was internally consistent. This guard pins the structure instead:
 * the adapters must delegate, and preview must equal print by construction.
 *
 * Ratchets shrink only. A genuinely bare kind carries an allowlist entry that
 * says WHY it is bare — never a raised baseline.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { encodePrintMatrix } from './platform-link';
import { locationLabelPayload, rackToLocation, routeScan, type LocationSegments } from '@/lib/barcode-routing';
import {
  receivingLabelMatrix,
  receivingPayloadToFace,
  type ReceivingLabelPayload,
} from '@/lib/print/printReceivingLabel';
import { buildUnitPayload } from '@/lib/print/unitLabelCore';
import { workspaceLabelToFace } from '@/lib/print/workspace-label-kinds';
import { asListedLabelMatrix, asListedPayloadToFace } from '@/lib/print/printAsListedLabel';
import { ticketLabelMatrix, ticketPayloadToFace } from '@/lib/print/printTicketLabel';

const REPO_ROOT = path.resolve(__dirname, '../../..');
const read = (rel: string) => readFileSync(path.join(REPO_ROOT, rel), 'utf8');

/** Modules that own a printable matrix for an in-scope kind. */
const ENCODE_ADAPTERS = [
  'src/lib/print/printReceivingLabel.ts',
  'src/lib/print/unitLabelCore.ts',
  'src/lib/print/printAsListedLabel.ts',
  'src/lib/print/printTicketLabel.ts',
  // Location labels (bin + rack). Folded in 2026-08-02: they had their own
  // `{ value, symbology }` decision (`locationLabelPayload`), which is the
  // shape this guard exists to prevent even when the behaviour is right.
  // Both a PRINT surface and its PREVIEW appear here on purpose — a preview
  // that encodes differently from the printer is the original fork.
  'src/components/barcode/bin-label-printer/PrintLabel.tsx',
  'src/components/barcode/bin-label-printer/LivePreviewBody.tsx',
  'src/components/barcode/bin-label-printer/GiantPreviewPanel.tsx',
  'src/components/barcode/rack-printer/RackPrintLabel.tsx',
  'src/components/barcode/rack-printer/LivePreviewBody.tsx',
  'src/components/barcode/rack-printer/GiantRackPreviewPanel.tsx',
] as const;

/**
 * Kinds that still encode a BARE handle, each because the path it would point
 * at has no anonymous landing — a printed URL that dumps a consumer phone on
 * `/signin` is worse than a handle the staff wedge resolves. Shrink this list
 * by shipping the landing, never by hardcoding a URL at the call site.
 */
const BARE_KIND_ALLOWLIST: ReadonlyArray<{ file: string; why: string }> = [
  { file: 'src/lib/print/printRepairLabel.ts', why: 'REP-… → /repair is staff-only' },
  { file: 'src/lib/print/printHandlingUnitLabel.ts', why: 'H-… tote/LPN is internal-only' },
  { file: 'src/lib/print/printManifestLabel.ts', why: 'KIT-… manifest is internal-only' },
];

/**
 * Object-literal `symbology: 'datamatrix'` — a hand-made encode decision.
 * The negative lookahead skips TYPE positions (`symbology: 'gs1datamatrix' |
 * 'datamatrix'`), which declare the vocabulary rather than pick from it.
 */
const HARDCODED_SYMBOLOGY_RE = /symbology:\s*'(?:gs1)?datamatrix'(?!\s*\|)/g;

test('the encode adapters all delegate to the platform-link SoT', () => {
  for (const rel of ENCODE_ADAPTERS) {
    const src = read(rel);
    assert.match(
      src,
      /from '@\/lib\/qr\/platform-link'/,
      `${rel} must import the encode SoT — a print module that decides its own matrix is the fork this guard exists to prevent`,
    );
    assert.match(
      src,
      /encodePrintMatrix\(/,
      `${rel} imports the SoT but never calls encodePrintMatrix`,
    );
  }
});

test('no encode adapter hardcodes a symbology', () => {
  for (const rel of ENCODE_ADAPTERS) {
    const hits = read(rel).match(HARDCODED_SYMBOLOGY_RE) ?? [];
    assert.equal(
      hits.length,
      0,
      `${rel} hardcodes ${hits.length} symbology literal(s) — resolve it through encodePrintMatrix`,
    );
  }
});

test('the workspace registry never inlines a matrix', () => {
  // This file is where the unit preview fork lived: it built its own
  // `{ value, symbology }` instead of calling the unit encode path.
  const src = read('src/lib/print/workspace-label-kinds.ts');
  const hits = src.match(HARDCODED_SYMBOLOGY_RE) ?? [];
  assert.equal(
    hits.length,
    0,
    'workspace-label-kinds.ts must delegate every face to its adapter / buildUnitPayload',
  );
  assert.match(src, /buildUnitPayload\(/, 'the unit face must go through buildUnitPayload');
});

test('the raw thermal command path uses the same unit encode as the face', () => {
  const src = read('src/lib/print/productLabelCommands.ts');
  assert.match(src, /buildUnitPayload\(/);
  assert.match(
    src,
    /orgSlug:\s*input\.orgSlug/,
    'productLabelCommands must forward orgSlug — dropping it makes raw TSPL/ZPL encode a different string than the preview',
  );
});

test('bare-handle kinds are allowlisted with a stated reason (shrink only)', () => {
  for (const { file, why } of BARE_KIND_ALLOWLIST) {
    assert.ok(why.trim().length > 0, `${file} needs a reason, not just an entry`);
    const hits = read(file).match(HARDCODED_SYMBOLOGY_RE) ?? [];
    assert.ok(
      hits.length > 0,
      `${file} no longer hardcodes a symbology — remove it from BARE_KIND_ALLOWLIST rather than leaving a stale escape`,
    );
  }
  assert.equal(
    BARE_KIND_ALLOWLIST.length,
    3,
    'BARE_KIND_ALLOWLIST shrinks only — a new bare kind means a new fork',
  );
});

/**
 * `locationLabelPayload` is `encodePrintMatrix`'s private helper — it is only
 * exported because `barcode-routing` cannot import the encode SoT back. A
 * component calling it directly is a second encoder wearing a helper's name,
 * which is exactly what shipped on 2026-08-01 and what P1 folded back in.
 */
const LOCATION_PAYLOAD_OWNERS = new Set([
  'src/lib/barcode-routing.ts', // the definition itself
  'src/lib/qr/platform-link.ts', // the ONE consumer
]);

function walkSourceFiles(dirRel: string, out: string[] = []): string[] {
  for (const entry of readdirSync(path.join(REPO_ROOT, dirRel), { withFileTypes: true })) {
    const rel = `${dirRel}/${entry.name}`;
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.next') continue;
      walkSourceFiles(rel, out);
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      out.push(rel);
    }
  }
  return out;
}

test('only the encode SoT reads locationLabelPayload', () => {
  // Call sites only — a docblock that names the helper is documentation, not a
  // fork, and `{@link locationLabelPayload}` references are load-bearing prose.
  const CALL_RE = /\blocationLabelPayload\s*\(/;
  const offenders = walkSourceFiles('src')
    .filter((rel) => !/\.test\.tsx?$/.test(rel)) // tests may exercise the helper's GLN decision
    .filter((rel) => !LOCATION_PAYLOAD_OWNERS.has(rel))
    .filter((rel) => CALL_RE.test(read(rel)));

  assert.deepEqual(
    offenders,
    [],
    `these call locationLabelPayload directly instead of encodePrintMatrix({ kind: 'location' }): ${offenders.join(', ')}`,
  );
});

// ─── Behavioural: preview ≡ print, by construction ───────────────────────────

const CARTON: ReceivingLabelPayload = {
  receivingId: 7,
  orgSlug: 'usav',
  scanValue: 'RCV-7',
  platform: 'eBay',
  notes: '',
  conditionCode: 'BRAND_NEW',
  date: '8/1/26',
};

function withAppHost<T>(fn: () => T): T {
  const prev = process.env.NEXT_PUBLIC_APP_URL;
  process.env.NEXT_PUBLIC_APP_URL = 'https://app.cycleforge.ai';
  try {
    return fn();
  } finally {
    if (prev === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
    else process.env.NEXT_PUBLIC_APP_URL = prev;
  }
}

test('carton: face matrix === encode SoT, and HRI stays typeable', () => {
  withAppHost(() => {
    const sot = encodePrintMatrix({
      kind: 'carton',
      orgSlug: 'usav',
      receivingId: 7,
      fallbackValue: 'RCV-7',
    });
    const face = receivingPayloadToFace(CARTON);

    assert.equal(sot.value, 'https://usav.app.cycleforge.ai/m/r/7');
    assert.equal(face.matrix.value, sot.value);
    assert.equal(face.matrix.symbology, sot.symbology);
    // The matrix carries a URL; the printed HRI must stay the handle an
    // operator can key into the scan bar.
    assert.equal(face.hri, 'R-7');
    assert.equal(receivingLabelMatrix(CARTON).value, sot.value);
  });
});

test('carton: no slug falls back to the bare handle, never a foreign host', () => {
  withAppHost(() => {
    const face = receivingPayloadToFace({ ...CARTON, orgSlug: null });
    assert.equal(face.matrix.value, 'R-7');
    assert.doesNotMatch(face.matrix.value, /usavshop/);
  });
});

test('unit: workspace preview matrix === print matrix (the shipped fork)', () => {
  withAppHost(() => {
    const unitInput = {
      sku: 'SKU-1',
      title: 'Widget',
      serialNumber: 'SN123',
      gtin: '00012345678905',
      orgSlug: 'usav',
    };

    const printed = buildUnitPayload({
      sku: unitInput.sku,
      serialNumber: unitInput.serialNumber,
      gtin: unitInput.gtin,
      orgSlug: unitInput.orgSlug,
      qrPayload: null,
    });

    const face = workspaceLabelToFace('unit', {
      hasCarton: false,
      scanValue: '',
      sku: unitInput.sku,
      receivingType: null,
      disclosureNote: null,
      ticketDigits: null,
      unitInput,
    });

    assert.ok(face, 'unit face should render for a SKU-bearing input');
    assert.equal(printed.value, 'https://usav.app.cycleforge.ai/01/00012345678905/21/SN123');
    // Pre-fix this was 'SN123' — the bare serial — while the printer encoded the URL.
    assert.equal(face.matrix.value, printed.value);
    assert.equal(face.matrix.symbology, printed.symbology);
  });
});

test('unit: a GS1 element-string override still draws as GS1 DataMatrix', () => {
  const payload = buildUnitPayload({
    sku: 'SKU-1',
    serialNumber: 'SN1',
    qrPayload: '(01)00012345678905(21)SN1',
  });
  assert.equal(payload.symbology, 'gs1datamatrix');
});

// ─── Location: the fold-in is behaviour-preserving ───────────────────────────

const BIN: LocationSegments = { zone: 'A', aisle: 1, bay: 1, level: 1, position: 1 };
const RACK_AS_LOCATION = rackToLocation({ zone: 'A', aisle: 1, bay: 1, level: 1 });
/** Licensed-SHAPED GLN: not a real registration, just not an example prefix. */
const LICENSED_GLN = '0812345000009';

test('location: with no tenant host the fold-in changed nothing (rungs 2 + 4)', () => {
  for (const segments of [BIN, RACK_AS_LOCATION]) {
    for (const gln of [undefined, LICENSED_GLN, '0614141000005', 'not-a-gln']) {
      const sot = encodePrintMatrix({ kind: 'location', segments, gln });
      const legacy = locationLabelPayload(segments, { gln });
      assert.equal(sot.value, legacy.value, 'the fold-in must not change any printed payload');
      assert.equal(sot.symbology, legacy.symbology);
      // The HRI is the flat code on EVERY rung — typeable, and the exact
      // string `routeScan` resolves, so a smudged sticker stays keyable.
      assert.equal(sot.hri, legacy.code);
    }
  }
});

test('location: a licensed GLN + a tenant host promotes to a GS1 Digital Link (rung 1)', () => {
  withAppHost(() => {
    const sot = encodePrintMatrix({
      kind: 'location', orgSlug: 'usav', segments: BIN, gln: LICENSED_GLN,
    });
    assert.equal(sot.value, `https://usav.app.cycleforge.ai/414/${LICENSED_GLN}/254/A0101101`);
    // A Digital Link is a URI, not an AI string — `gs1datamatrix` would frame
    // it as one and bwip-js rejects a payload with no AIs.
    assert.equal(sot.symbology, 'datamatrix');
    assert.equal(sot.hri, 'A0101101');
    // Same promotion the unit kind already makes — that symmetry IS the point.
    assert.match(
      encodePrintMatrix({ kind: 'unit', orgSlug: 'usav', sku: 'S', gtin: '00012345678905', serialNumber: 'SN1' }).value,
      /^https:\/\/usav\.app\.cycleforge\.ai\/01\//,
    );
  });
});

test('location: an UNLICENSED GLN can never reach the Digital Link rung', () => {
  withAppHost(() => {
    // The whole reason rung 1 is gated: AI 414 asserts a licensed GLN, and a
    // URL form would launder the same false claim through a nicer grammar.
    for (const gln of ['0614141000005', 'not-a-gln', '', '123']) {
      const sot = encodePrintMatrix({ kind: 'location', orgSlug: 'usav', segments: BIN, gln });
      assert.equal(sot.value, 'A0101101', `"${gln}" must stay on the bare-code rung`);
      assert.doesNotMatch(sot.value, /414/, 'AI 414 means GLN — never emit it without one');
    }
  });
});

test('location: both symbologies scan back to the same destination', () => {
  const bare = encodePrintMatrix({ kind: 'location', segments: BIN });
  const gs1 = encodePrintMatrix({ kind: 'location', segments: BIN, gln: LICENSED_GLN });
  assert.equal(routeScan(bare.value)?.redirect, '/inventory?bin=A0101101');
  assert.equal(routeScan(gs1.value)?.redirect, routeScan(bare.value)?.redirect);

  // position=00 is a RACK — decided by the code, never by the symbology.
  const rack = encodePrintMatrix({ kind: 'location', segments: RACK_AS_LOCATION });
  assert.equal(routeScan(rack.value)?.redirect, '/inventory/locations?tab=racks&code=A0101100');
});

test('as-listed + ticket faces read their matrix from the SoT', () => {
  const asListed = { disclosure: 'Cracked screen', conditionCode: 'USED_C', corner: 'PO-9', receivingLineId: 12 };
  assert.equal(asListedPayloadToFace(asListed).matrix.value, asListedLabelMatrix(asListed).value);
  assert.equal(asListedPayloadToFace(asListed).hri, 'L-12');

  const ticket = { ticketDigits: '#9395' };
  assert.equal(ticketPayloadToFace(ticket).matrix.value, ticketLabelMatrix(ticket).value);
  assert.equal(ticketLabelMatrix(ticket).value, 'T-9395');
});
