/**
 * Round-trip guard for printed handles: every `*Handle()` factory must scan
 * back through `routeScan()` to the right entity type. This test is the
 * standing guard for the "if I can generate it I can scan it back" invariant —
 * if someone adds a new handle prefix without a matching `routeScan` branch,
 * the `every generated handle round-trips` test fails.
 */

import { test } from 'node:test';
import { strictEqual, deepStrictEqual, ok } from 'node:assert';

import {
  routeScan,
  routeScanPaired,
  decodedHandle,
  scannedSscc,
  scannedCarrierTracking,
  type ScanType,
  receivingHandle,
  receivingLineHandle,
  serialUnitHandle,
  handlingUnitHandle,
  repairHandle,
  ticketHandle,
  scannedUnitKey,
  scannedReceivingId,
  unwrapScannedLocation,
  unwrapScannedSerial,
  locationLabelPayload,
  type LocationSegments,
} from './barcode-routing';
import { encodePrintMatrix } from '@/lib/qr/platform-link';

test('every generated handle round-trips to its entity type (not bin/sku fallback)', () => {
  const cases: Array<[string, string]> = [
    [receivingHandle(42), 'receiving'],
    [receivingLineHandle(900), 'receiving-line'],
    [serialUnitHandle(451), 'serial-unit'],
    [handlingUnitHandle(12), 'handling-unit'],
    [repairHandle(33), 'receiving'], // repair routes via the mobile repair page
    [ticketHandle(9395), 'support-ticket'],
  ];
  for (const [payload, expectedType] of cases) {
    const r = routeScan(payload);
    ok(r, `${payload} should route`);
    strictEqual(r!.type, expectedType, `${payload} → type`);
  }
});

// ─── THE payload-form table — one SoT for every symbol in the wild ───────────
//
// Every payload form this app has ever printed, in one place, asserted in both
// directions. Nothing is re-printed when the encoder changes, so a warehouse
// full of stickers is the installed base: a form leaves this table only when
// the last label carrying it is off the racks, which is never.
//
// `mint` is the CURRENT encoder expression, or null for a form we no longer
// emit but must keep resolving. A new form with no `mint` and no stated reason
// is a fork; a new `mint` with no row here is an unpinned payload.

const SLUG = 'usav';
const GTIN = '00012345678905';
/**
 * An INTERNALLY-MINTED gtin — `'02' + 11-digit sku_catalog.id` + check digit,
 * the form `generateInternalGtin` stamps onto `sku_catalog.gtin` for any tenant
 * without GS1 membership. It is a restricted-circulation number, so it is the
 * gtin most units in this installed base actually carry.
 */
const INTERNAL_RCN_GTIN = '02000000000107';

const BIN: LocationSegments = { zone: 'A', aisle: 1, bay: 1, level: 1, position: 1 };
const RACK: LocationSegments = { zone: 'A', aisle: 1, bay: 1, level: 1, position: 0 };

/** GS1's documentation GLN — what every location label used to fall back to. */
const PLACEHOLDER_GLN = '0614141000005';
/** Licensed-SHAPED GLN: not a real registration, just not an example prefix. */
const LICENSED_GLN = '0812345000009';

/** The FNC1 (GS, 0x1D) byte an industrial scanner emits between AIs. */
const FNC1 = String.fromCharCode(0x1d);

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

interface WildForm {
  /** Row label — mirrors the docs table. */
  what: string;
  /** Which rung of the encode ladder this form sits on (platform-link.ts). */
  rung: 1 | 2 | 3 | 4;
  /** Current encoder expression, or null when the form is legacy-only. */
  mint: (() => string) | null;
  /** The exact bytes on the sticker. */
  value: string;
  type: ScanType;
  redirect?: string;
}

/**
 * Rung 1 — GS1 Digital Link URI. Reachable ONLY with a licensed GS1 key.
 * Rung 2 — GS1 element string (licensed key, no tenant host).
 * Rung 3 — platform Digital Link (no GS1 key, but the path has an anon landing).
 * Rung 4 — bare handle / flat code.
 */
const WILD_PAYLOAD_FORMS: WildForm[] = [
  // ── Rung 1 · true GS1 Digital Link ────────────────────────────────────────
  {
    what: 'GS1 Digital Link — unit',
    rung: 1,
    mint: () =>
      encodePrintMatrix({ kind: 'unit', orgSlug: SLUG, sku: 'SKU-1', gtin: GTIN, serialNumber: 'SN123' }).value,
    value: `https://usav.app.cycleforge.ai/01/${GTIN}/21/SN123`,
    type: 'serial-unit',
    redirect: `/01/${GTIN}/21/SN123`,
  },
  {
    // OPEN RULING, pinned as it behaves TODAY (2026-08-02): the encoder does not
    // consult `isRestrictedCirculationGtin`, so a unit whose gtin was minted
    // internally still climbs to rung 1. That is defensible — it is the
    // tenant's own host and this app's own scanner, and an RCN collides with
    // nobody — but rung 1 is defined as "a LICENSED GS1 key", and this is not
    // one. The row exists either way: these stickers are already on units, so
    // the decode must keep working no matter how the ruling lands. If the
    // encoder is later dropped to rung 3/4, this becomes `mint: null` with the
    // reason, exactly like the borrowed-GLN rows below.
    // See docs/todo/gs1-internal-gtin-rcn-HANDOFF.md → F1.
    what: 'GS1 Digital Link — unit on an INTERNAL restricted-circulation gtin',
    rung: 1,
    mint: () =>
      encodePrintMatrix({
        kind: 'unit', orgSlug: SLUG, sku: 'SKU-1',
        gtin: INTERNAL_RCN_GTIN, serialNumber: 'SN123',
      }).value,
    value: `https://usav.app.cycleforge.ai/01/${INTERNAL_RCN_GTIN}/21/SN123`,
    type: 'serial-unit',
    redirect: `/01/${INTERNAL_RCN_GTIN}/21/SN123`,
  },
  {
    what: 'GS1 Digital Link — location (licensed GLN + tenant host)',
    rung: 1,
    mint: () =>
      encodePrintMatrix({ kind: 'location', orgSlug: SLUG, segments: BIN, gln: LICENSED_GLN }).value,
    value: `https://usav.app.cycleforge.ai/414/${LICENSED_GLN}/254/A0101101`,
    type: 'bin',
    redirect: '/inventory?bin=A0101101',
  },
  {
    what: 'GS1 Digital Link — location, rack (position=00)',
    rung: 1,
    mint: () =>
      encodePrintMatrix({ kind: 'location', orgSlug: SLUG, segments: RACK, gln: LICENSED_GLN }).value,
    value: `https://usav.app.cycleforge.ai/414/${LICENSED_GLN}/254/A0101100`,
    type: 'bin',
    redirect: '/inventory/locations?tab=racks&code=A0101100',
  },
  {
    what: 'legacy location Digital Link — pre-DataMatrix printer, borrowed GLN',
    rung: 1,
    // Same GRAMMAR as the row above; only the GLN differs. The old printer's
    // form did not need retiring — the licensed mint converged onto it.
    mint: null,
    value: `/414/${PLACEHOLDER_GLN}/254/A0101100`,
    type: 'bin',
    redirect: '/inventory/locations?tab=racks&code=A0101100',
  },

  // ── Rung 2 · GS1 element string (licensed key, no host to resolve it) ─────
  {
    what: 'GS1 element string — unit (no tenant slug)',
    rung: 2,
    mint: () =>
      encodePrintMatrix({ kind: 'unit', orgSlug: null, sku: 'SKU-1', gtin: GTIN, serialNumber: 'SN123' }).value,
    value: `(01)${GTIN}(21)SN123`,
    type: 'serial-unit',
    redirect: `/01/${GTIN}/21/SN123`,
  },
  {
    what: 'GS1 element string — location (licensed GLN, no tenant slug)',
    rung: 2,
    mint: () => encodePrintMatrix({ kind: 'location', orgSlug: null, segments: BIN, gln: LICENSED_GLN }).value,
    value: `(414)${LICENSED_GLN}(254)A0101101`,
    type: 'bin',
    redirect: '/inventory?bin=A0101101',
  },
  {
    what: 'GS1 element string — location, legacy borrowed GLN',
    rung: 2,
    mint: null, // never mintable again — isLicensedGln refuses the example prefix
    value: `(414)${PLACEHOLDER_GLN}(254)A0101101`,
    type: 'bin',
    redirect: '/inventory?bin=A0101101',
  },
  {
    what: 'FNC1 form — what an industrial scanner re-emits for either element string',
    rung: 2,
    mint: null, // the SCANNER produces this shape, not us
    value: `414${PLACEHOLDER_GLN}${FNC1}254A0101100`,
    type: 'bin',
    redirect: '/inventory/locations?tab=racks&code=A0101100',
  },
  {
    what: 'FNC1 form — unit',
    rung: 2,
    mint: null,
    value: `01${GTIN}${FNC1}21SN123`,
    type: 'serial-unit',
    redirect: `/01/${GTIN}/21/SN123`,
  },

  // ── Rung 3 · platform Digital Link (internal identity, anon landing) ──────
  {
    what: 'platform Digital Link — carton',
    rung: 3,
    mint: () => encodePrintMatrix({ kind: 'carton', orgSlug: SLUG, receivingId: 1234 }).value,
    value: 'https://usav.app.cycleforge.ai/m/r/1234',
    type: 'receiving',
    redirect: '/m/r/1234',
  },

  {
    // NOT a form we mint — it is the rung-3 carton row above as delivered by an
    // HID wedge running the wrong keyboard country: every separator dropped and
    // the rest upper-cased. It is in the wild the moment a bench has one such
    // scanner, and it decoded to `bin`-with-no-redirect until 2026-08-19, which
    // made the receiving bar intake a duplicate carton on every scan.
    what: 'platform Digital Link — carton, punctuation stripped by the wedge',
    rung: 3,
    mint: null,
    value: 'HTTPSUSAVAPPCYCLEFORGEAIMR1234',
    type: 'receiving',
    redirect: '/m/r/1234',
  },
  {
    what: 'platform Digital Link — carton, colon eaten but slashes intact',
    rung: 3,
    mint: null,
    value: 'https//usav.app.cycleforge.ai/m/r/1234',
    type: 'receiving',
    redirect: '/m/r/1234',
  },
  {
    what: 'platform Digital Link — line, punctuation stripped by the wedge',
    rung: 3,
    mint: null,
    value: 'HTTPSUSAVAPPCYCLEFORGEAIML77',
    type: 'receiving-line',
    redirect: '/m/l/77',
  },

  // ── Rung 4 · bare handles + the flat location code ────────────────────────
  {
    what: 'bare flat location code — no licensed GLN',
    rung: 4,
    mint: () => encodePrintMatrix({ kind: 'location', orgSlug: SLUG, segments: BIN }).value,
    value: 'A0101101',
    type: 'bin',
    redirect: '/inventory?bin=A0101101',
  },
  {
    what: 'bare flat location code — rack',
    rung: 4,
    mint: () => encodePrintMatrix({ kind: 'location', orgSlug: SLUG, segments: RACK }).value,
    value: 'A0101100',
    type: 'bin',
    redirect: '/inventory/locations?tab=racks&code=A0101100',
  },
  {
    what: 'bare handle — carton (no tenant slug)',
    rung: 4,
    mint: () => encodePrintMatrix({ kind: 'carton', orgSlug: null, receivingId: 1234 }).value,
    value: 'R-1234',
    type: 'receiving',
    redirect: '/m/r/1234',
  },
  {
    what: 'bare handle — receiving line (as-listed)',
    rung: 4,
    mint: () => encodePrintMatrix({ kind: 'as_listed', orgSlug: SLUG, receivingLineId: 567 }).value,
    value: 'L-567',
    type: 'receiving-line',
    redirect: '/m/l/567',
  },
  {
    what: 'bare handle — unit, alphanumeric serial (no GTIN)',
    rung: 4,
    mint: () => encodePrintMatrix({ kind: 'unit', orgSlug: SLUG, sku: 'SKU-1', serialNumber: 'CN1A2B3' }).value,
    value: 'U-CN1A2B3',
    type: 'serial-unit',
    redirect: '/m/u/CN1A2B3',
  },
  {
    what: 'bare handle — ticket',
    rung: 4,
    mint: () => encodePrintMatrix({ kind: 'ticket', orgSlug: SLUG, ticketDigits: '#9395' }).value,
    value: 'T-9395',
    type: 'support-ticket',
    redirect: '/support?ticket=9395',
  },
  {
    what: 'bare handle — handling unit / LPN',
    rung: 4,
    mint: () => handlingUnitHandle(12),
    value: 'H-12',
    type: 'handling-unit',
    redirect: '/m/h/12',
  },
  {
    what: 'bare handle — repair',
    rung: 4,
    mint: () => repairHandle(89),
    value: 'REP-89',
    type: 'receiving',
    redirect: '/m/rs/89',
  },
  {
    what: 'bare handle — kit manifest',
    rung: 4,
    mint: null, // minted by printManifestLabel from a manifest_uid, not a factory
    value: 'KIT-SKU1-2601-000042',
    type: 'manifest',
  },
  {
    what: 'bare handle — legacy carton (pre-DataMatrix)',
    rung: 4,
    mint: null,
    value: 'RCV-123',
    type: 'receiving',
    redirect: '/m/r/123',
  },
  {
    what: 'bare minted unit id — what the products label carries with no GS1',
    rung: 4,
    mint: null, // minted upstream as serial_units.unit_uid
    value: 'IPH13-128-BLU-2601-000042',
    type: 'serial-unit',
    redirect: '/m/u/IPH13-128-BLU-2601-000042',
  },
];

test('EVERY payload form in the wild decodes to the right entity', () => {
  withAppHost(() => {
    for (const f of WILD_PAYLOAD_FORMS) {
      const r = routeScan(f.value);
      ok(r, `${f.what}: "${f.value}" should route`);
      strictEqual(r!.type, f.type, `${f.what} → type`);
      if (f.redirect) strictEqual(r!.redirect, f.redirect, `${f.what} → redirect`);
    }
  });
});

test('a flattened link is matched right-to-left — a slug with an "m" cannot steal the path', () => {
  withAppHost(() => {
    // `mycompany` contains the letter the `/m/` segment is anchored on. Greedy
    // matching takes the LAST candidate, so the path segment still wins.
    const r = routeScan('HTTPSMYCOMPANYAPPCYCLEFORGEAIMR1234');
    strictEqual(r?.type, 'receiving');
    strictEqual(r?.redirect, '/m/r/1234');
  });
});

test('EVERY form we still mint comes out of the one encoder, byte for byte', () => {
  withAppHost(() => {
    for (const f of WILD_PAYLOAD_FORMS) {
      if (!f.mint) continue;
      strictEqual(f.mint(), f.value, `${f.what}: the encoder no longer emits the pinned form`);
    }
  });
});

test('the table covers all four rungs, and rung 1 is GS1-only', () => {
  const rungs = new Set(WILD_PAYLOAD_FORMS.map((f) => f.rung));
  for (const r of [1, 2, 3, 4]) ok(rungs.has(r as 1), `no form pinned at rung ${r}`);

  // Rung 1 is a *licensed* GS1 Digital Link. Every row there must carry a real
  // GS1 AI path — `/01/` or `/414/` — and never an internal `/m/` path. This is
  // the line that stops "make it all one Digital Link" from becoming "mint GS1
  // keys we do not hold": a carton has no licensed key, so it cannot be here.
  for (const f of WILD_PAYLOAD_FORMS.filter((x) => x.rung === 1)) {
    ok(/\/(01|414)\//.test(f.value), `${f.what}: rung 1 must be a GS1 AI path`);
    ok(!f.value.includes('/m/'), `${f.what}: an internal path is rung 3, not rung 1`);
  }

  // Rung 3 is the mirror claim: a platform link is NOT GS1 and must not pretend.
  for (const f of WILD_PAYLOAD_FORMS.filter((x) => x.rung === 3)) {
    ok(!/\/(01|414)\//.test(f.value), `${f.what}: rung 3 must not wear a GS1 AI path`);
  }
});

test('KNOWN LIMIT: a sku-only unit label is not distinguishable from a bin barcode', () => {
  // `encodePrintMatrix('unit')`'s last-resort branch — no gtin, no serial —
  // encodes the bare SKU, and a bare letter-leading token is exactly what a
  // legacy bin barcode looks like (`A12`). routeScan cannot tell them apart,
  // and widening rule 6 to try would break every bin sticker in the warehouse.
  //
  // This is pinned rather than fixed because the honest fix is upstream: a
  // sku-only label carries no unique identity, so there is nothing to scan
  // back TO. Do not "repair" this by loosening the bin fallback.
  const skuOnly = encodePrintMatrix({ kind: 'unit', orgSlug: 'usav', sku: 'SKU-1' });
  strictEqual(skuOnly.value, 'SKU-1');
  strictEqual(routeScan(skuOnly.value)!.type, 'bin');

  // A colon-form SKU — the shape routeScan CAN recognise — round-trips.
  const colon = encodePrintMatrix({ kind: 'unit', orgSlug: 'usav', sku: '1809:A03' });
  strictEqual(routeScan(colon.value)!.type, 'sku');
});

// ─── The unwrap helpers every "type or scan" input composes ──────────────────

test('scannedReceivingId reads a carton id out of EVERY printed carton form', () => {
  withAppHost(() => {
    const url = encodePrintMatrix({ kind: 'carton', orgSlug: SLUG, receivingId: 1234 }).value;
    strictEqual(url, 'https://usav.app.cycleforge.ai/m/r/1234');
    // The defect this closes: the printed sticker is the URL, and every
    // consumer of `parsePoListSearch` only knew the bare handle.
    strictEqual(scannedReceivingId(url), 1234);
  });
  strictEqual(scannedReceivingId('R-1234'), 1234);
  // A leading `#` is scanner chrome, not a payload — `parsePoListSearch`
  // strips it, so the decoder is right to refuse it and let the text helper run.
  strictEqual(scannedReceivingId('#R-1234'), null);
  strictEqual(scannedReceivingId('RCV-1234'), 1234);
  strictEqual(scannedReceivingId('/m/r/1234'), 1234);
});

test('scannedReceivingId refuses everything that is NOT a carton', () => {
  // A repair label types as `receiving` but redirects to /m/rs/ — a repair
  // order is not a carton, and anchoring on the redirect is what separates them.
  strictEqual(scannedReceivingId(repairHandle(33)), null);
  strictEqual(scannedReceivingId('L-567'), null);
  strictEqual(scannedReceivingId('A0101101'), null);
  strictEqual(scannedReceivingId('PO-9912'), null, 'a typed PO number stays text search');
  strictEqual(scannedReceivingId(''), null);
});

test('unwrapScannedSerial unwraps a printed unit label but passes typed text through', () => {
  withAppHost(() => {
    const dl = encodePrintMatrix({
      kind: 'unit', orgSlug: SLUG, sku: 'SKU-1', gtin: GTIN, serialNumber: 'SN123',
    }).value;
    strictEqual(unwrapScannedSerial(dl), 'SN123');
  });
  strictEqual(unwrapScannedSerial('(01)00012345678905(21)SN123'), 'SN123');
  strictEqual(unwrapScannedSerial('U-SN123'), 'SN123');
  // A hand-typed serial must survive untouched — scannedUnitKey rejects it by
  // design (it is a camera gate), so the pass-through is load-bearing.
  strictEqual(unwrapScannedSerial('  sn123  '), 'sn123');
  strictEqual(unwrapScannedSerial('12345'), '12345');
});

test('unwrapScannedLocation unwraps every location form, typed codes untouched', () => {
  strictEqual(unwrapScannedLocation('A0101101'), 'A0101101');
  strictEqual(unwrapScannedLocation('a0101101'), 'A0101101', 'normalised like the GS1 form');
  strictEqual(unwrapScannedLocation(`(414)${LICENSED_GLN}(254)A0101101`), 'A0101101');
  // The borrowed-GLN stickers on the racks today — all three legacy forms.
  strictEqual(unwrapScannedLocation(`(414)${PLACEHOLDER_GLN}(254)A0101101`), 'A0101101');
  strictEqual(unwrapScannedLocation(`414${PLACEHOLDER_GLN}${FNC1}254A0101100`), 'A0101100');
  strictEqual(unwrapScannedLocation(`/414/${PLACEHOLDER_GLN}/254/A0101100`), 'A0101100');
  strictEqual(unwrapScannedLocation('A-01-01-1-01'), 'A0101101', 'the dashed human code');
  // Short legacy bin barcodes and free-text bin NAMES pass through unchanged —
  // routeScan's leading-letter arm is a guess, not a decode.
  strictEqual(unwrapScannedLocation('A12'), 'A12');
  strictEqual(unwrapScannedLocation('  Overflow shelf '), 'Overflow shelf');
});

test('T-{id} ticket label scans to Support deep-link', () => {
  const r = routeScan(ticketHandle(9395));
  strictEqual(r!.redirect, '/support?ticket=9395');
});

test('REP-{id} repair label scans back to the working /m/rs/{id} page (not the dead /repair/{id})', () => {
  const r = routeScan(repairHandle(33));
  strictEqual(r!.redirect, '/m/rs/33');
});

test('U- unit handle resolves an ALPHANUMERIC serial (regression: used to mis-route to /inventory)', () => {
  const phys = routeScan(serialUnitHandle('CN1A2B3'));
  strictEqual(phys!.type, 'serial-unit');
  strictEqual(phys!.redirect, '/m/u/CN1A2B3', 'prefix stripped, serial preserved');

  const numeric = routeScan(serialUnitHandle('451'));
  strictEqual(numeric!.redirect, '/m/u/451');

  // U- wrapping a minted unit_uid strips the prefix so the API resolves by unit_uid.
  const uid = routeScan(serialUnitHandle('00098-2621-000142'));
  strictEqual(uid!.type, 'serial-unit');
  strictEqual(uid!.redirect, '/m/u/00098-2621-000142');
});

test('zone-letter location codes are NOT swallowed by the broadened U- handle parser', () => {
  // U-zone bin/location codes must still classify as bins (the location guard).
  strictEqual(routeScan('U-01-02-3')!.type, 'bin');
  strictEqual(routeScan('U-01-02-3-04')!.type, 'bin');
  // A plain leading-letter bin is unaffected too.
  strictEqual(routeScan('A-01-01-1')!.type, 'bin');
});

test('bare minted unit-id (no prefix) still routes to the unit page', () => {
  const r = routeScan('00098-2621-000142');
  strictEqual(r!.type, 'serial-unit');
});

// ── scannedUnitKey — the packer testing-photo scan gate ──────────────────────
// Fire the phone camera ONLY on a genuine printed unit label; extract the
// resolvable key (bare serial / minted unit_uid) for /api/serial-units/[id].

test('scannedUnitKey extracts the bare serial from a U- handle', () => {
  strictEqual(scannedUnitKey('U-SN12345'), 'SN12345');
  // The prefix-stripped handle a printed unit label carries.
  strictEqual(scannedUnitKey(serialUnitHandle('SN999')), 'SN999');
});

test('scannedUnitKey extracts the minted unit_uid from a bare minted-id label', () => {
  strictEqual(scannedUnitKey('00098-2621-000142'), '00098-2621-000142');
});

test('scannedUnitKey extracts the serial from a GS1 (01)(21) unit frame', () => {
  strictEqual(scannedUnitKey('(01)00860008260013(21)SN12345'), 'SN12345');
});

test('scannedUnitKey returns null for a non-unit-label scan (the gate)', () => {
  // A bare/partial serial the tech types at the bench must NOT trip the camera.
  strictEqual(scannedUnitKey('12345'), null);
  // A zone-letter location code is a bin, not a unit.
  strictEqual(scannedUnitKey('U-01-02-3'), null);
  // A SKU-with-colon is a SKU, not a unit.
  strictEqual(scannedUnitKey('1809:A03'), null);
  // Empty input.
  strictEqual(scannedUnitKey(''), null);
});

// ─── Location labels: the borrowed-GLN fix ──────────────────────────────────


test('with no GLN a location label emits the bare code, never a borrowed AI 414', () => {
  const p = locationLabelPayload(BIN);
  strictEqual(p.symbology, 'datamatrix', 'plain DataMatrix, not gs1datamatrix');
  strictEqual(p.value, 'A0101101', 'the internal code, encoded as an internal code');
  strictEqual(p.gln, null, 'the label asserts no GLN at all');
  ok(!p.value.includes('414'), 'AI 414 means GLN — never emit it without one');
});

test('the placeholder GLN is refused even when explicitly configured', () => {
  // The regression that matters: DEFAULT_GLN is gone, but an admin — or a
  // stale localStorage printer config written before this change — can still
  // hand the old value in.
  const p = locationLabelPayload(BIN, { gln: PLACEHOLDER_GLN });
  strictEqual(p.symbology, 'datamatrix');
  strictEqual(p.gln, null);
  strictEqual(p.value, 'A0101101');
});

test('a licensed GLN produces a proper GS1 location label', () => {
  const p = locationLabelPayload(BIN, { gln: LICENSED_GLN });
  strictEqual(p.symbology, 'gs1datamatrix');
  strictEqual(p.value, `(414)${LICENSED_GLN}(254)A0101101`);
  strictEqual(p.gln, LICENSED_GLN);
});

test('a malformed GLN degrades to the bare code rather than printing garbage', () => {
  for (const gln of ['', '   ', '123', 'not-a-gln', '08123450000099999']) {
    const p = locationLabelPayload(BIN, { gln });
    strictEqual(p.symbology, 'datamatrix', `"${gln}" must not produce an AI 414`);
    strictEqual(p.gln, null);
  }
});

test('both label forms scan back to the SAME destination — bin', () => {
  const bare = locationLabelPayload(BIN);
  const gs1 = locationLabelPayload(BIN, { gln: LICENSED_GLN });
  const a = routeScan(bare.value);
  const b = routeScan(gs1.value);
  strictEqual(a?.type, 'bin');
  strictEqual(a?.value, 'A0101101');
  strictEqual(a?.redirect, '/inventory?bin=A0101101');
  strictEqual(a?.redirect, b?.redirect, 'dropping the GLN must not change where a scan lands');
});

test('both label forms scan back to the SAME destination — rack (position=00)', () => {
  // The defect this closes: a bare rack code used to fall through to the
  // letter fallback, which returns NO redirect — so a rack sticker opened the
  // bin view. Rack-vs-bin is decided by the code, never by the symbology.
  const bare = locationLabelPayload(RACK);
  const gs1 = locationLabelPayload(RACK, { gln: LICENSED_GLN });
  const a = routeScan(bare.value);
  const b = routeScan(gs1.value);
  strictEqual(a?.redirect, '/inventory/locations?tab=racks&code=A0101100');
  strictEqual(a?.redirect, b?.redirect);
});

test('a flat code is case-normalised, like the GS1 form always was', () => {
  const r = routeScan('a0101101');
  strictEqual(r?.value, 'A0101101');
  strictEqual(r?.redirect, '/inventory?bin=A0101101');
});

test('labels ALREADY on the racks keep scanning — all three legacy forms', () => {
  // A warehouse full of stickers carries the borrowed GLN. Nothing is
  // re-printed by this change, so the parser must keep resolving them.
  strictEqual(
    routeScan(`(414)${PLACEHOLDER_GLN}(254)A0101101`)?.redirect,
    '/inventory?bin=A0101101',
  );
  strictEqual(
    routeScan(`414${PLACEHOLDER_GLN}${FNC1}254A0101100`)?.redirect,
    '/inventory/locations?tab=racks&code=A0101100',
  );
  strictEqual(
    routeScan(`/414/${PLACEHOLDER_GLN}/254/A0101100`)?.redirect,
    '/inventory/locations?tab=racks&code=A0101100',
  );
});

test('short legacy bin barcodes are untouched by the flat-code branch', () => {
  // `A12` / `B04` predate the flat code and must keep their old behaviour.
  const r = routeScan('A12');
  strictEqual(r?.type, 'bin');
  strictEqual(r?.value, 'A12');
  strictEqual(r?.redirect, undefined);
});

test('the flat-code branch does not swallow other printed handles', () => {
  strictEqual(routeScan('R-1234')?.type, 'receiving');
  strictEqual(routeScan('U-CN1A2B3')?.type, 'serial-unit');
  strictEqual(routeScan('H-12')?.type, 'handling-unit');
  strictEqual(routeScan('T-9395')?.type, 'support-ticket');
  strictEqual(routeScan('IPH13-128-BLU-2601-000042')?.type, 'serial-unit');
});

// ─── Foreign labels — carrier tracking, SSCC, bin-paired-to-order ────────────
//
// Three classes added 2026-09-04 for the scan dispatch table. Everything above
// this line is the installed vocabulary and must read identically afterwards,
// which is what the last test in this block pins.

test('a carrier tracking number classes as carrier-tracking, with its carrier', () => {
  // Printed in human groups; an HID wedge forwards the spaces verbatim.
  const ups = routeScan('1Z 999 AA1 01 2345 4471');
  strictEqual(ups?.type, 'carrier-tracking');
  strictEqual(ups?.value, '1Z999AA10123454471', 'normalised — the key a caller stores');
  strictEqual(ups?.carrier, 'UPS');

  strictEqual(routeScan('123456789012')?.carrier, 'FedEx', '12-digit FedEx Express');
  strictEqual(routeScan('1234567890')?.type, 'carrier-tracking', '10-digit DHL Express');
  strictEqual(routeScan('9400111899223197428490')?.type, 'carrier-tracking', '22-digit USPS');
  strictEqual(routeScan('92612345678901234567')?.type, 'carrier-tracking', '20-digit FedEx');

  // A shape that reads as tracking but that no carrier pattern claims still
  // classes — `Unknown` is the honest carrier, not a reason to refuse the class.
  // (15 digits that start with neither 96 nor 7: FedEx Ground's shape, but no
  // carrier pattern owns those digits.)
  strictEqual(routeScan('123456789012345')?.type, 'carrier-tracking');
  strictEqual(scannedCarrierTracking('123456789012345')?.carrier, 'Unknown');
});

test('a GS1 SSCC classes as sscc in all three printed forms', () => {
  const digits = '123456789012345678';
  strictEqual(routeScan(`(00)${digits}`)?.type, 'sscc');
  strictEqual(routeScan(`${FNC1}00${digits}`)?.type, 'sscc');
  strictEqual(routeScan(digits)?.type, 'sscc');
  // The value is the bare 18 digits in every form — same precedent as a
  // location label, which returns the flat code rather than the raw payload.
  strictEqual(routeScan(`(00)${digits}`)?.value, digits);
  strictEqual(scannedSscc(`  (00)${digits}  `), digits);
});

test('an 18-digit run is a licence plate, not a tracking number', () => {
  // USPS's broadest IMpb pattern also matches an 18-digit run starting with 9,
  // which is why `scannedSscc` runs first. None of the six carrier shapes is 18
  // digits long, so putting SSCC first costs the carrier arm nothing.
  strictEqual(routeScan('940011189922319742')?.type, 'sscc');
  strictEqual(scannedCarrierTracking('940011189922319742'), null);
});

test('neither foreign class carries a redirect — decodedHandle still refuses them', () => {
  // This is what keeps every existing `decodedHandle` consumer answering what
  // it answered before these classes existed.
  strictEqual(routeScan('1Z999AA10123454471')?.redirect, undefined);
  strictEqual(decodedHandle('1Z999AA10123454471'), null);
  strictEqual(decodedHandle('123456789012345678'), null);
});

test('bin-paired-order comes ONLY from the injected lookup, never from the bytes', () => {
  // A state-free decode still answers `bin` — that is why the class is safe.
  strictEqual(routeScan('A12')?.type, 'bin');
  strictEqual(routeScanPaired('A12', () => null)?.type, 'bin');

  const paired = routeScanPaired('A12', (code) => (code === 'A12' ? '04-1234' : null));
  strictEqual(paired?.type, 'bin-paired-order');
  strictEqual(paired?.value, 'A12');
  strictEqual(paired?.orderRef, '04-1234');

  // Every other class passes through untouched, lookup or no lookup.
  strictEqual(routeScanPaired('H-12', () => '04-1234')?.type, 'handling-unit');
  strictEqual(routeScanPaired('T-9395', () => '04-1234')?.type, 'support-ticket');
  strictEqual(routeScanPaired('', () => '04-1234'), null);

  // The lookup is handed the DECODED code, not the raw scan.
  const seen: string[] = [];
  routeScanPaired('a0101101', (code) => { seen.push(code); return null; });
  deepStrictEqual(seen, ['A0101101']);
});

test('the eight installed classes answer exactly what they answered before', () => {
  // The three new arms are decided after every existing branch has had its say.
  // Nothing above rule 6 can reach them, and rule 6's letter fallback is
  // digit-free by construction — so the only arm they drew from is rule 7's
  // bare `sku` shrug.
  const unchanged: Array<[string, ScanType]> = [
    ['1809:A03', 'sku'],
    ['A12', 'bin'],
    ['R-1234', 'receiving'],
    ['L-567', 'receiving-line'],
    ['U-CN1A2B3', 'serial-unit'],
    ['H-12', 'handling-unit'],
    ['KIT-SKU1-2601-000042', 'manifest'],
    ['T-9395', 'support-ticket'],
    // Digit-leading payloads the existing branches already claimed, above 6b.
    ['A0101101', 'bin'],
    [`(01)${GTIN}(21)SN123`, 'serial-unit'],
    ['00098-2621-000142', 'serial-unit'],
    // A hand-typed serial that is not a tracking length still shrugs to sku.
    ['12345', 'sku'],
  ];
  for (const [payload, type] of unchanged) {
    strictEqual(routeScan(payload)?.type, type, `${payload} → ${type}`);
  }
});
