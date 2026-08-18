/**
 * Hard law: every Cycle Forge lifecycle state has a DECIDED reading in GS1
 * terms, and every term this product emits is really in the standard.
 *
 * Two failure modes, both silent without this guard:
 *
 *   1. **A hole in the feed.** Someone adds a lifecycle state and the
 *      projection quietly skips it. The feed keeps validating — EPCIS has no
 *      opinion about events you failed to send — so a partner's picture of the
 *      goods is simply missing a step, and nothing anywhere says so. The
 *      `Record<>` types in `lifecycle-cbv-map.ts` catch this at compile time
 *      for the two union-keyed maps; this guard catches it for
 *      `WORKFLOW_STAGES`, which is a `Record<string, …>` and therefore has no
 *      compile-time totality to lean on.
 *
 *   2. **A term that is not CBV.** A typo'd `bizStep` produces a URI that
 *      resolves to nothing. Partners' validators differ in how loudly they
 *      complain, and several do not, so the wrong term can travel a long way.
 *
 * The vocabulary lists themselves are pinned by COUNT as well as by content.
 * They were transcribed from GS1's `epcis-context.jsonld`, and the realistic
 * corruption is a partial re-transcription that drops the tail of a list —
 * which content assertions alone would not notice, because everything still
 * present is still correct.
 *
 * Run: `node --require ./scripts/register-server-only-shim.cjs --import tsx \
 *        --test src/lib/interop/interop-vocabulary.guard.test.ts`
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CBV_BIZ_STEPS,
  CBV_BIZ_TRANSACTION_TYPES,
  CBV_DISPOSITIONS,
  EPCIS_EVENT_TYPES,
  cbvBizTransactionUri,
  cbvUri,
  parseBizStep,
  parseDisposition,
} from './epcis-vocabulary';
import {
  EVENT_TYPE_TO_CBV,
  SERIAL_STATE_TO_CBV,
  WORKFLOW_STAGE_KEYS,
  WORKFLOW_STAGE_TO_CBV,
  cbvForEventType,
  cbvForSerialState,
  epcisActionForEventType,
  type CbvMapping,
} from './lifecycle-cbv-map';
import {
  GS1_AI_SERIAL,
  GS1_APPLICATION_IDENTIFIERS,
  GS1_KEY_TYPES,
  INTERNAL_URN_NAMESPACE,
  PLACEHOLDER_GS1_PREFIXES,
  gs1CheckDigit,
  hasCompanyPrefix,
  hasGln,
  hasValidGs1CheckDigit,
  isLicensedGln,
  isPlaceholderGs1Prefix,
  isPlaceholderGtin,
  resolveGs1Identity,
  sgtinIdentifier,
  gtinIdentifier,
  glnIdentifier,
  internalIdentifier,
  type InteropIdentifier,
} from './gs1-keys';
import {
  ASN_SHAPES,
  ASN_SHAPE_LEVELS,
  EDI_HL_LEVEL_CODES,
  EDI_HL_LEVEL_CODE_VALUES,
  numberAsnHierarchy,
  flattenAsnHierarchy,
  resolveAsnShape,
  type AsnHlNode,
} from './edi-hierarchy';
// Runtime imports of the two SoTs the map only imports as TYPES. Safe here:
// the guard runs in node behind the server-only shim, so pulling the state
// machine's DB graph costs nothing. This is the half of the check the erased
// type import cannot do.
import { SERIAL_STATES } from '@/lib/inventory/state-machine';
import { WORKFLOW_STAGES } from '@/lib/receiving/workflow-stages';
// The printed-label path, so the two halves are checked against each other.
import { locationLabelPayload } from '@/lib/barcode-routing';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BIZ_STEP_SET = new Set<string>(CBV_BIZ_STEPS);
const DISPOSITION_SET = new Set<string>(CBV_DISPOSITIONS);

// ─── The CBV lists themselves ───────────────────────────────────────────────

test('CBV vocabularies match the counts in GS1 epcis-context.jsonld', () => {
  // CBV 2.0. If a future CBV genuinely adds terms, update BOTH the list and
  // these numbers in the same change — that is the point of pinning a count.
  assert.equal(CBV_BIZ_STEPS.length, 41, 'CBV 2.0 defines 41 bizStep terms');
  assert.equal(CBV_DISPOSITIONS.length, 33, 'CBV 2.0 defines 33 disposition terms');
  assert.equal(EPCIS_EVENT_TYPES.length, 5, 'EPCIS 2.0 defines 5 event types');
});

test('CBV vocabularies contain no duplicates', () => {
  assert.equal(new Set(CBV_BIZ_STEPS).size, CBV_BIZ_STEPS.length);
  assert.equal(new Set(CBV_DISPOSITIONS).size, CBV_DISPOSITIONS.length);
});

test('CBV 2.0 additions over 1.2 are present', () => {
  // 2.0 added these three. Their absence means someone transcribed a 1.2 list.
  for (const term of ['encoding', 'sampling', 'sensor_reporting']) {
    assert.ok(BIZ_STEP_SET.has(term), `${term} is a CBV 2.0 bizStep`);
  }
});

test('both URI forms render, and they are not interchangeable', () => {
  assert.equal(
    cbvUri('bizStep', 'receiving', 'urn'),
    'urn:epcglobal:cbv:bizstep:receiving',
  );
  assert.equal(
    cbvUri('bizStep', 'receiving', 'webUri'),
    'https://ref.gs1.org/cbv/BizStep-receiving',
  );
  assert.equal(
    cbvUri('disposition', 'in_transit', 'urn'),
    'urn:epcglobal:cbv:disp:in_transit',
  );
  assert.equal(
    cbvUri('disposition', 'in_transit', 'webUri'),
    'https://ref.gs1.org/cbv/Disp-in_transit',
  );
  // The bizStep and disposition namespaces differ — a shared prefix would
  // produce URIs that resolve to the wrong code list.
  assert.notEqual(
    cbvUri('bizStep', 'shipping', 'urn').replace('shipping', ''),
    cbvUri('disposition', 'in_transit', 'urn').replace('in_transit', ''),
  );
});

test('parsing an unknown term returns null and never a default', () => {
  assert.equal(parseBizStep('not_a_step'), null);
  assert.equal(parseBizStep(''), null);
  assert.equal(parseBizStep(undefined), null);
  assert.equal(parseBizStep(null), null);
  assert.equal(parseBizStep(42), null);
  // Notably NOT coerced to CBV's `other`, which is a positive claim.
  assert.notEqual(parseBizStep('not_a_step'), 'other');
  assert.equal(parseDisposition('not_a_disposition'), null);
  assert.equal(parseDisposition('UNKNOWN'), null, 'CBV terms are lower-case');
  assert.equal(parseDisposition('unknown'), 'unknown');
});

// ─── Every Cycle Forge state is decided ─────────────────────────────────────

/** Assert a mapping is either a real CBV reading or an explained refusal. */
function assertDecided(label: string, m: CbvMapping | undefined): void {
  assert.ok(m, `${label} has no entry in its CBV map — a silent hole in the feed`);
  if (m.mapped) {
    assert.ok(
      BIZ_STEP_SET.has(m.bizStep),
      `${label} maps to bizStep "${m.bizStep}", which is not a CBV term`,
    );
    if (m.disposition !== null) {
      assert.ok(
        DISPOSITION_SET.has(m.disposition),
        `${label} maps to disposition "${m.disposition}", which is not a CBV term`,
      );
    }
  } else {
    assert.ok(
      m.reason.trim().length > 20,
      `${label} is declared unmappable with no substantive reason — "unmappable" is a decision that must be justified, not a shrug`,
    );
  }
}

test('every serial_units state has a decided CBV reading', () => {
  for (const state of SERIAL_STATES) {
    assertDecided(`SerialState.${state}`, SERIAL_STATE_TO_CBV[state]);
  }
  // And no phantom entries the state machine does not define.
  const known = new Set<string>(SERIAL_STATES);
  for (const key of Object.keys(SERIAL_STATE_TO_CBV)) {
    assert.ok(known.has(key), `SERIAL_STATE_TO_CBV maps "${key}", which is not a SerialState`);
  }
});

test('every inventory_events type has a decided CBV reading', () => {
  // The union is type-only at runtime, so the map's own keys are the list —
  // compile-time totality (Record<InventoryEventType, …>) is what guarantees
  // it is complete, and this walks what that produced.
  const keys = Object.keys(EVENT_TYPE_TO_CBV);
  assert.ok(keys.length >= 22, `expected the full event union, got ${keys.length}`);
  for (const key of keys) {
    assertDecided(`InventoryEventType.${key}`, EVENT_TYPE_TO_CBV[key as never]);
  }
});

test('every WORKFLOW_STAGES key has a decided CBV reading, and vice versa', () => {
  // This is the map with no compile-time totality — WORKFLOW_STAGES is a
  // Record<string, …>, so adding a stage there is invisible to the type
  // checker here. Both directions, so a renamed stage fails too.
  assert.deepEqual(
    [...WORKFLOW_STAGE_KEYS].sort(),
    Object.keys(WORKFLOW_STAGES).sort(),
    'the exported key list must be derived from WORKFLOW_STAGES, not a copy of it',
  );
  for (const stage of WORKFLOW_STAGE_KEYS) {
    assertDecided(`WorkflowStage.${stage}`, WORKFLOW_STAGE_TO_CBV[stage]);
  }
  for (const stage of Object.keys(WORKFLOW_STAGE_TO_CBV)) {
    assert.ok(
      stage in WORKFLOW_STAGES,
      `WORKFLOW_STAGE_TO_CBV maps "${stage}", which WORKFLOW_STAGES does not define`,
    );
  }
});

test('regression: a listing is not a supply-chain step', () => {
  // LISTED was the tempting one to map to retail_selling. It must not be:
  // that would tell a partner the unit had been SOLD and left the building.
  const listed = EVENT_TYPE_TO_CBV.LISTED;
  assert.equal(listed.mapped, false);
  assert.equal(cbvForEventType('LISTED'), null);
  assert.equal(cbvForEventType('NOTE'), null);
});

test('EPCIS action reflects the EPC lifecycle, not the row lifecycle', () => {
  assert.equal(epcisActionForEventType('RECEIVED'), 'ADD');
  assert.equal(epcisActionForEventType('SHIPPED'), 'DELETE');
  assert.equal(epcisActionForEventType('SCRAPPED'), 'DELETE');
  assert.equal(epcisActionForEventType('MOVED'), 'OBSERVE');
  assert.equal(epcisActionForEventType('TEST_PASS'), 'OBSERVE');
});

// ─── The mint gate ──────────────────────────────────────────────────────────

test('GS1 key minting is impossible without a company prefix', () => {
  assert.equal(hasCompanyPrefix({}), false);
  assert.equal(hasCompanyPrefix({ companyPrefix: '' }), false);
  assert.equal(hasCompanyPrefix({ companyPrefix: '0812345' }), true);
  assert.ok(GS1_KEY_TYPES.includes('SSCC'));
});

test('the Application Identifier digits are the standard ones', () => {
  // These are GS1 constants, not choices. A typo produces a barcode that
  // either will not parse or parses as a DIFFERENT field — and nothing else
  // in this repo would notice, because the AI never round-trips through code
  // that validates it.
  const ai: Record<string, string> = GS1_APPLICATION_IDENTIFIERS;
  assert.equal(ai.GTIN, '01');
  assert.equal(ai.SSCC, '00');
  assert.equal(ai.GLN, '414');
  assert.equal(ai.GRAI, '8003');
  assert.equal(ai.GIAI, '8004');
  assert.equal(GS1_AI_SERIAL, '21');

  // SGTIN deliberately has NO AI of its own — it is (01) + (21). An entry
  // here would be invented.
  assert.equal(ai.SGTIN, undefined);
  for (const key of Object.keys(ai)) {
    assert.ok(
      (GS1_KEY_TYPES as readonly string[]).includes(key),
      `${key} has an AI but is not a declared key type`,
    );
  }
});

test('the label printer exports no default GLN, and cannot regrow one', () => {
  // Until 2026-08-02 `barcode-routing` exported
  // `DEFAULT_GLN = '0614141000005'` — GS1's documentation GLN — and every bin
  // and rack label fell back to it. It is deleted. This asserts the deletion
  // holds, because the cheap "fix" for a blank field is to reintroduce a
  // constant, and nothing else in the codebase would notice.
  const source = readFileSync(
    join(fileURLToPath(new URL('../..', import.meta.url)), 'lib/barcode-routing.ts'),
    'utf8',
  );
  assert.doesNotMatch(
    source,
    /^\s*export\s+const\s+DEFAULT_GLN/m,
    'barcode-routing must not export a default GLN — a GLN is licensed, so there is no default',
  );

  // The historical value stays on the placeholder list regardless, because
  // stale printer configs in operators' localStorage still contain it.
  assert.equal(isPlaceholderGs1Prefix('0614141000005'), true);
  assert.ok(
    PLACEHOLDER_GS1_PREFIXES.some((p) => '0614141000005'.startsWith(p)),
    'and it must match one of the listed prefixes explicitly',
  );
});

test('a GLN with a bad check digit is refused — it would crash the encoder', () => {
  // bwip-js validates AI 414 and THROWS `GS1badChecksum` when encoding a GS1
  // DataMatrix, so a single typo in the printer's GLN field would blank every
  // label rather than degrade. Validating here turns that into a quiet
  // fallback to the bare code. (Found by location-label-encoding.guard.test.ts,
  // whose first run failed on exactly this.)
  assert.equal(gs1CheckDigit('081234500000'), 9);
  assert.equal(isLicensedGln('0812345000009'), true, 'correct check digit');
  assert.equal(isLicensedGln('0812345000005'), false, 'off-by-one check digit');

  // Sanity: the algorithm reproduces the check digit of GS1's OWN published
  // documentation GLN, which is a real, well-formed key.
  assert.equal(hasValidGs1CheckDigit('0614141000005'), true);
  // …and it is still refused, because a valid check digit is not a licence.
  assert.equal(isLicensedGln('0614141000005'), false);
});

test('the printed-label path and the interop path share ONE licensed-GLN answer', () => {
  // `locationLabelPayload` (print) and `hasGln` (EPCIS bizLocation) must agree.
  // They disagreed by construction before: the printer had its own fallback
  // constant and no notion of "licensed" at all.
  for (const gln of ['0614141000005', '', '123', '0812345000009']) {
    const printed = locationLabelPayload(
      { zone: 'A', aisle: 1, bay: 1, level: 1, position: 1 } as never,
      { gln },
    );
    assert.equal(
      printed.gln !== null,
      isLicensedGln(gln),
      `print and interop disagree about "${gln}"`,
    );
    assert.equal(hasGln({ gln }), isLicensedGln(gln));
  }
});

test('internal identifiers all sit in the declared private namespace', () => {
  for (const kind of ['carton', 'line', 'unit', 'handling-unit', 'order', 'sku', 'location', 'shipment'] as const) {
    const id: InteropIdentifier = internalIdentifier(kind, 1);
    assert.ok(
      id.uri.startsWith(`${INTERNAL_URN_NAMESPACE}:`),
      `${kind} must sit under ${INTERNAL_URN_NAMESPACE}`,
    );
    assert.equal(id.scheme, 'internal');
  }
  // A private URN is EPCIS-legal precisely because it cannot be mistaken for
  // a GS1 EPC. If this namespace ever started with `urn:epc:`, every internal
  // handle would claim to be a resolvable GS1 key.
  assert.ok(!INTERNAL_URN_NAMESPACE.startsWith('urn:epc'));
});

test('business-transaction types render in both forms', () => {
  assert.deepEqual([...CBV_BIZ_TRANSACTION_TYPES], ['po', 'desadv']);
  assert.equal(cbvBizTransactionUri('po', 'urn'), 'urn:epcglobal:cbv:btt:po');
  assert.equal(cbvBizTransactionUri('desadv', 'webUri'), 'https://ref.gs1.org/cbv/BTT-desadv');
});

test('the serial-state convenience mirrors the map, including its refusals', () => {
  assert.equal(cbvForSerialState('UNKNOWN'), null, 'unmappable stays unmappable');
  assert.equal(cbvForSerialState(null), null);
  assert.equal(cbvForSerialState(undefined), null);
  assert.equal(cbvForSerialState('NOT_A_STATE'), null);
  assert.equal(cbvForSerialState('SHIPPED')?.bizStep, 'shipping');
  assert.equal(cbvForSerialState('SHIPPED')?.disposition, 'in_transit');
});

test('the HL level-code names map to the right letters', () => {
  assert.equal(EDI_HL_LEVEL_CODES.SHIPMENT, 'S');
  assert.equal(EDI_HL_LEVEL_CODES.ORDER, 'O');
  assert.equal(EDI_HL_LEVEL_CODES.TARE, 'T', 'T is Tare (pallet), not "truck"');
  assert.equal(EDI_HL_LEVEL_CODES.PACK, 'P');
  assert.equal(EDI_HL_LEVEL_CODES.ITEM, 'I');
  assert.deepEqual(
    [...EDI_HL_LEVEL_CODE_VALUES].sort(),
    ['I', 'O', 'P', 'S', 'T'],
    'the derived value list must stay in step with the named map',
  );
});

test("the repo's own DEFAULT_GLN placeholder can never reach a projection", () => {
  // src/lib/barcode-routing.ts DEFAULT_GLN = '0614141000005' — GS1's
  // documentation GLN, printed on bin labels today. Fine internally; a
  // collision against the real licensee of 0614141 if it ever ships to a
  // partner. This is the single most important assertion in this file.
  assert.equal(isPlaceholderGs1Prefix('0614141000005'), true);
  assert.equal(isPlaceholderGs1Prefix('0614141'), true);

  const resolved = resolveGs1Identity({
    companyPrefix: '0614141',
    gln: '0614141000005',
  });
  assert.equal(resolved.companyPrefix, undefined, 'placeholder prefix must be dropped');
  assert.equal(resolved.gln, undefined, 'placeholder GLN must be dropped');
  assert.equal(hasCompanyPrefix(resolved), false);
  assert.equal(hasGln(resolved), false);
  assert.equal(glnIdentifier(resolved), null, 'no bizLocation without a real GLN');
});

test('regression: the placeholder is refused at the MINT, not only at the boundary', () => {
  // Caught by epcis-projection.test.ts on first run. `glnIdentifier` used to
  // trust that its caller had passed the identity through resolveGs1Identity,
  // so a RAW identity — which any future caller can construct — emitted GS1's
  // documentation GLN straight into an EPCIS bizLocation. The boundary check
  // only protects callers who went through the boundary.
  const raw = { gln: '0614141000005' };
  assert.equal(hasGln(raw), false, 'the predicate itself must refuse it');
  assert.equal(glnIdentifier(raw), null, 'and so must the constructor');

  // Same reasoning for trade items. A GTIN-14's company prefix starts at digit
  // TWO (digit one is the packaging indicator), so both alignments are checked
  // — 10614141000002 is a documentation GTIN a naive prefix test waves through.
  assert.equal(isPlaceholderGtin('00614141000005'), true);
  assert.equal(isPlaceholderGtin('10614141000002'), true, 'GTIN-14 indicator digit');
  assert.equal(isPlaceholderGtin('00812345000019'), false, 'a real GTIN still passes');
  assert.equal(gtinIdentifier('10614141000002'), null);
  assert.equal(sgtinIdentifier('10614141000002', 'SN-1'), null);
});

test('resolveGs1Identity drops malformed values rather than passing them through', () => {
  // A GLN is exactly 13 digits. A short one is a typo, not a GLN.
  assert.equal(resolveGs1Identity({ gln: '12345' }).gln, undefined);
  assert.equal(resolveGs1Identity({ gln: '0812345000009' }).gln, '0812345000009');
  // Non-digits are stripped, not rejected outright — admins paste with spaces.
  assert.equal(resolveGs1Identity({ companyPrefix: '08 12345' }).companyPrefix, '0812345');
  // An unrecognised URI form is dropped so the caller falls back to `urn`.
  assert.equal(resolveGs1Identity({ cbvUriForm: 'xml' as never }).cbvUriForm, undefined);
  // An absent block resolves to "this tenant has no GS1 identity", not a throw.
  assert.deepEqual(resolveGs1Identity(null), {});
  assert.deepEqual(resolveGs1Identity(undefined), {});
});

test('SGTIN composes from a GTIN the tenant already holds — no prefix needed', () => {
  // An SGTIN is not minted, it is composed: the GTIN carries its own licensed
  // prefix. This is why sgtinIdentifier does not take an identity.
  const id = sgtinIdentifier('00812345000019', 'SN-4471');
  assert.ok(id);
  assert.equal(id.scheme, 'gs1');
  assert.equal(id.keyType, 'SGTIN');
  assert.equal(id.uri, 'urn:epc:id:sgtin:00812345000019.SN-4471');
});

test('SGTIN and GTIN decline rather than improvise on a missing half', () => {
  assert.equal(sgtinIdentifier(null, 'SN-1'), null, 'no GTIN → no SGTIN');
  assert.equal(sgtinIdentifier('00812345000019', null), null, 'no serial → no SGTIN');
  assert.equal(sgtinIdentifier('123', 'SN-1'), null, 'malformed GTIN → no SGTIN');
  assert.equal(gtinIdentifier('123456'), null, 'GTIN is 8/12/13/14 digits');
  assert.ok(gtinIdentifier('00812345000019'));
});

test('internal handles are always available and never claim to be GS1', () => {
  const id = internalIdentifier('carton', 1234);
  assert.equal(id.scheme, 'internal');
  assert.equal(id.keyType, undefined);
  assert.equal(id.uri, 'urn:cycleforge:carton:1234');
  assert.ok(!id.uri.startsWith('urn:epc:'), 'must not sit in the GS1 EPC namespace');
});

// ─── EDI 856 hierarchy ──────────────────────────────────────────────────────

test('ASN shape is derived from the data, never assumed', () => {
  assert.equal(resolveAsnShape({ hasTare: false, hasPack: true }), 'SOPI');
  assert.equal(resolveAsnShape({ hasTare: false, hasPack: false }), 'SOI');
  assert.equal(resolveAsnShape({ hasTare: true, hasPack: false }), 'SOTI');
  assert.equal(resolveAsnShape({ hasTare: true, hasPack: true }), 'SOTPI');
});

test('every ASN shape nests only real HL level codes, rooted at S, leafed at I', () => {
  const legal = new Set<string>(EDI_HL_LEVEL_CODE_VALUES);
  for (const shape of ASN_SHAPES) {
    const levels = ASN_SHAPE_LEVELS[shape];
    assert.equal(levels.join(''), shape, `${shape} must spell its own level codes`);
    assert.equal(levels[0], 'S', 'the shipment is always the root');
    assert.equal(levels[levels.length - 1], 'I', 'the item is always the leaf');
    for (const l of levels) assert.ok(legal.has(l), `${l} is not an HL level code`);
  }
});

test('HL numbering is depth-first and parents precede children', () => {
  const leaf = (level: 'I'): AsnHlNode => ({
    id: 0, parentId: null, level, detail: {}, children: [],
  });
  const root: AsnHlNode = {
    id: 0,
    parentId: null,
    level: 'S',
    detail: {},
    children: [
      {
        id: 0, parentId: null, level: 'O', detail: {},
        children: [
          { id: 0, parentId: null, level: 'P', detail: {}, children: [leaf('I'), leaf('I')] },
          { id: 0, parentId: null, level: 'P', detail: {}, children: [leaf('I')] },
        ],
      },
    ],
  };

  const count = numberAsnHierarchy(root);
  assert.equal(count, 7, 'S + O + 2×P + 3×I');
  assert.equal(root.id, 1);
  assert.equal(root.parentId, null, 'only the shipment root has no HL02');

  const flat = flattenAsnHierarchy(root);
  assert.deepEqual(flat.map((n) => n.id), [1, 2, 3, 4, 5, 6, 7], 'HL01 is monotonic');
  for (const node of flat) {
    if (node.parentId === null) continue;
    assert.ok(node.parentId < node.id, 'a parent HL01 always precedes its child');
  }
  assert.deepEqual(
    flat.map((n) => n.level).join(''),
    'SOPIIPI',
    'depth-first, which is the order an 856 serializes',
  );
});
