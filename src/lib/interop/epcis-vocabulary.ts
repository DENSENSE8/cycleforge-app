/**
 * GS1 Core Business Vocabulary (CBV) 2.0 — the controlled term lists.
 *
 * Pure and client-safe: no DB, no server-only imports. Sibling of
 * `./lifecycle-cbv-map.ts`, which translates Cycle Forge's own vocabularies
 * into these terms and never restates either side.
 *
 * ## Provenance — these lists were NOT hand-typed
 *
 * Both unions are transcribed from the normative GS1 artefact
 * `epcis-context.jsonld` in the `gs1/EPCIS` repository (the JSON-LD context
 * that ships with EPCIS 2.0 / CBV 2.0, both ratified June 2022), which
 * enumerates every `bizStep` and `disposition` shorthand the standard defines.
 * `interop-vocabulary.guard.test.ts` pins the counts (41 / 33) so a partial
 * re-transcription fails loudly rather than silently narrowing what this
 * product can say about itself.
 *
 * CBV 1.2's list is a strict SUBSET — 2.0 added `encoding`, `sampling` and
 * `sensor_reporting`. Do not "clean up" the extras to match an older
 * integration guide.
 *
 * ## Two URI forms, and why neither is the global default
 *
 * EPCIS 2.0 permits two spellings of the same term:
 *
 *   legacy URN (1.2 and 2.0):  urn:epcglobal:cbv:bizstep:receiving
 *   Web URI (2.0 only):        https://ref.gs1.org/cbv/BizStep-receiving
 *
 * A partner still on 1.2 REJECTS the Web URI form. So `cbvUri()` takes the
 * form as a required argument and there is no module-level default: picking
 * one globally would produce a feed that is technically valid and unreadable
 * by half the partners it is aimed at. The form belongs to the connection,
 * not to this module.
 *
 * ## Parsing returns null, never a default
 *
 * `parseBizStep` / `parseDisposition` return `null` on an unknown value. A
 * CBV term is a CLAIM about what happened to someone else's goods, which
 * makes it a safety classification in the sense of
 * `.claude/rules/backend-patterns.md` — and a defaulted classification is a
 * bug this repo has now paid for three times (`intakeSurface` defaulting to
 * `'triage'`, `scanKind` defaulting to `'work'`, and the photo-aspect
 * vocabulary that was written to avoid repeating them). A caller that cannot
 * name the term emits none.
 */

/**
 * Every `bizStep` term in CBV 2.0, in the artefact's own order.
 *
 * This is the WHOLE standard, not the subset this product emits. Keeping it
 * complete is what lets the guard assert that every term Cycle Forge maps to
 * is a real CBV term — a check that is vacuous against a list trimmed to the
 * terms we already use.
 */
export const CBV_BIZ_STEPS = [
  'accepting',
  'arriving',
  'assembling',
  'collecting',
  'commissioning',
  'consigning',
  'creating_class_instance',
  'cycle_counting',
  'decommissioning',
  'departing',
  'destroying',
  'disassembling',
  'dispensing',
  'encoding',
  'entering_exiting',
  'holding',
  'inspecting',
  'installing',
  'killing',
  'loading',
  'other',
  'packing',
  'picking',
  'receiving',
  'removing',
  'repackaging',
  'repairing',
  'replacing',
  'reserving',
  'retail_selling',
  'sampling',
  'sensor_reporting',
  'shipping',
  'staging_outbound',
  'stock_taking',
  'stocking',
  'storing',
  'transporting',
  'unloading',
  'unpacking',
  'void_shipping',
] as const;

export type CbvBizStep = (typeof CBV_BIZ_STEPS)[number];

/**
 * Every `disposition` term in CBV 2.0, in the artefact's own order.
 *
 * This is NOT a tenant reason vocabulary and must never migrate into
 * `reason_codes`. Those are per-tenant, operator-authored and customizable by
 * design; a CBV disposition is a fixed term in an external standard GS1
 * ratified in June 2022. A tenant cannot add one, and the guard that pins this
 * list to 33 entries exists precisely to stop it drifting from the standard —
 * making it tenant-editable would let one org emit a "disposition" no
 * partner's system can resolve.
 */
// reason-codes-hardcoded — an external standard's fixed list, never tenant vocabulary.
export const CBV_DISPOSITIONS = [
  'active',
  'available',
  'completeness_verified',
  'completeness_inferred',
  'conformant',
  'container_closed',
  'container_open',
  'damaged',
  'destroyed',
  'dispensed',
  'disposed',
  'encoded',
  'expired',
  'in_progress',
  'in_transit',
  'inactive',
  'mismatch_instance',
  'mismatch_class',
  'mismatch_quantity',
  'needs_replacement',
  'no_pedigree_match',
  'non_conformant',
  'non_sellable_other',
  'partially_dispensed',
  'recalled',
  'reserved',
  'retail_sold',
  'returned',
  'sellable_accessible',
  'sellable_not_accessible',
  'stolen',
  'unavailable',
  'unknown',
] as const;

export type CbvDisposition = (typeof CBV_DISPOSITIONS)[number];

/**
 * Which spelling of a CBV term to emit.
 *
 * `urn` is the safe default for an unknown partner and is what a connection
 * gets until someone says otherwise — every EPCIS 1.2 and 2.0 implementation
 * accepts it. `webUri` is 2.0-only.
 */
export type CbvUriForm = 'urn' | 'webUri';

/**
 * Which CBV code list a term belongs to. The two namespaces differ.
 *
 * Not exported: the public `cbvUri` overloads take the literal, so a caller
 * never needs to name this union.
 */
type CbvVocabulary = 'bizStep' | 'disposition';

const URN_PREFIX: Record<CbvVocabulary, string> = {
  bizStep: 'urn:epcglobal:cbv:bizstep:',
  disposition: 'urn:epcglobal:cbv:disp:',
};

const WEB_URI_PREFIX: Record<CbvVocabulary, string> = {
  bizStep: 'https://ref.gs1.org/cbv/BizStep-',
  disposition: 'https://ref.gs1.org/cbv/Disp-',
};

const BIZ_STEP_SET: ReadonlySet<string> = new Set(CBV_BIZ_STEPS);
const DISPOSITION_SET: ReadonlySet<string> = new Set(CBV_DISPOSITIONS);

/**
 * Render a CBV term in the requested URI form.
 *
 * The term is typed, so an unknown string cannot reach here — parse first
 * with `parseBizStep` / `parseDisposition` when the value came from outside.
 */
export function cbvUri(
  vocabulary: 'bizStep',
  term: CbvBizStep,
  form: CbvUriForm,
): string;
export function cbvUri(
  vocabulary: 'disposition',
  term: CbvDisposition,
  form: CbvUriForm,
): string;
export function cbvUri(
  vocabulary: CbvVocabulary,
  term: string,
  form: CbvUriForm,
): string {
  const prefix = form === 'urn' ? URN_PREFIX[vocabulary] : WEB_URI_PREFIX[vocabulary];
  return `${prefix}${term}`;
}

/** `null` on anything not in the normative list. No default. */
export function parseBizStep(value: unknown): CbvBizStep | null {
  if (typeof value !== 'string') return null;
  const v = value.trim();
  return BIZ_STEP_SET.has(v) ? (v as CbvBizStep) : null;
}

/** `null` on anything not in the normative list. No default. */
export function parseDisposition(value: unknown): CbvDisposition | null {
  if (typeof value !== 'string') return null;
  const v = value.trim();
  return DISPOSITION_SET.has(v) ? (v as CbvDisposition) : null;
}

/**
 * The five EPCIS 2.0 event types.
 *
 * `AssociationEvent` is the 2.0 addition — a permanent or semi-permanent
 * attachment (a unit fixed into a tote, a sensor onto an asset), as opposed
 * to `AggregationEvent`'s reversible pack/unpack.
 */
export const EPCIS_EVENT_TYPES = [
  'ObjectEvent',
  'AggregationEvent',
  'TransactionEvent',
  'TransformationEvent',
  'AssociationEvent',
] as const;

export type EpcisEventType = (typeof EPCIS_EVENT_TYPES)[number];

/**
 * EPCIS `action` — what the event says about the objects' lifecycle.
 * ADD (they now exist / joined), OBSERVE (seen, unchanged), DELETE (gone).
 */
export const EPCIS_ACTIONS = ['ADD', 'OBSERVE', 'DELETE'] as const;
export type EpcisAction = (typeof EPCIS_ACTIONS)[number];

/**
 * Business-transaction types (CBV §7.3), the `why` dimension's identifiers.
 *
 * Only the two this product can honestly assert are listed: a purchase order
 * (`po` — the Zoho PO a carton arrives against) and a despatch advice
 * (`desadv` — the ASN of P3). The rest of the CBV list is omitted on purpose:
 * an unused term here is a term someone will reach for and populate with the
 * wrong id.
 */
export const CBV_BIZ_TRANSACTION_TYPES = ['po', 'desadv'] as const;

/** Not exported — callers pass the literal, same as `CbvVocabulary` above. */
type CbvBizTransactionType = (typeof CBV_BIZ_TRANSACTION_TYPES)[number];

export function cbvBizTransactionUri(
  type: CbvBizTransactionType,
  form: CbvUriForm,
): string {
  return form === 'urn'
    ? `urn:epcglobal:cbv:btt:${type}`
    : `https://ref.gs1.org/cbv/BTT-${type}`;
}
