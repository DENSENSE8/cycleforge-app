/** GS1 Core Business Vocabulary (CBV) 2.0 — the controlled term lists. */

/** Every `bizStep` term in CBV 2.0, in the artefact's own order. */
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

/** Every `disposition` term in CBV 2.0, in the artefact's own order. */
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

/** Which spelling of a CBV term to emit. */
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
function parseBizStep(value: unknown): CbvBizStep | null {
  if (typeof value !== 'string') return null;
  const v = value.trim();
  return BIZ_STEP_SET.has(v) ? (v as CbvBizStep) : null;
}

/** `null` on anything not in the normative list. No default. */
function parseDisposition(value: unknown): CbvDisposition | null {
  if (typeof value !== 'string') return null;
  const v = value.trim();
  return DISPOSITION_SET.has(v) ? (v as CbvDisposition) : null;
}

/** The five EPCIS 2.0 event types. */
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

/** Business-transaction types (CBV §7.3), the `why` dimension's identifiers. */
const CBV_BIZ_TRANSACTION_TYPES = ['po', 'desadv'] as const;

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
