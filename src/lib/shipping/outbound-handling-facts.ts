/**
 * Governed outbound handling facts.
 *
 * These are product-level warehouse instructions, not prose inferred from an
 * order note. The catalog owns their truth; Orders, Picks, Packing and station
 * projections consume the same closed vocabulary. Unknown values deliberately
 * disappear at the boundary so an old integration cannot invent a new hazard
 * banner without first extending this law and its database constraint.
 */

export const OUTBOUND_HANDLING_FACTS = [
  'hazmat',
  'oversized',
  'two_person_lift',
] as const;

export type OutboundHandlingFact = (typeof OUTBOUND_HANDLING_FACTS)[number];

export type OutboundHandlingFace = {
  id: OutboundHandlingFact;
  label: string;
  /** Semantic alert treatment, selected from operational risk rather than a renderer palette. */
  tone: 'warning' | 'destructive';
};

const HANDLING_FACE: Record<OutboundHandlingFact, OutboundHandlingFace> = {
  hazmat: { id: 'hazmat', label: 'Hazmat', tone: 'destructive' },
  oversized: { id: 'oversized', label: 'Oversized', tone: 'warning' },
  two_person_lift: { id: 'two_person_lift', label: 'Two-person lift', tone: 'warning' },
};

function isOutboundHandlingFact(value: string): value is OutboundHandlingFact {
  return (OUTBOUND_HANDLING_FACTS as readonly string[]).includes(value);
}

/**
 * Normalizes a database `text[]` / API payload at the product boundary.
 * Duplicate or unknown values cannot paint duplicate or arbitrary warnings.
 */
export function normalizeOutboundHandlingFacts(value: unknown): OutboundHandlingFact[] {
  if (!Array.isArray(value)) return [];
  const facts = value
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim().toLowerCase())
    .filter(isOutboundHandlingFact);
  return [...new Set(facts)];
}

/** The one rendering projection shared by phone, desk and station consumers. */
export function outboundHandlingFactFaces(value: unknown): OutboundHandlingFace[] {
  return normalizeOutboundHandlingFacts(value).map((fact) => HANDLING_FACE[fact]);
}
