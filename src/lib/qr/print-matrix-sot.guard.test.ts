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
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { encodePrintMatrix } from './platform-link';
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

test('as-listed + ticket faces read their matrix from the SoT', () => {
  const asListed = { disclosure: 'Cracked screen', conditionCode: 'USED_C', corner: 'PO-9', receivingLineId: 12 };
  assert.equal(asListedPayloadToFace(asListed).matrix.value, asListedLabelMatrix(asListed).value);
  assert.equal(asListedPayloadToFace(asListed).hri, 'L-12');

  const ticket = { ticketDigits: '#9395' };
  assert.equal(ticketPayloadToFace(ticket).matrix.value, ticketLabelMatrix(ticket).value);
  assert.equal(ticketLabelMatrix(ticket).value, 'T-9395');
});
