/**
 * Tool Forge vocabulary + the one number the whole gate turns on.
 *
 * Every literal here has a matching named CHECK in
 * src/lib/migrations/2026-08-22c_tool_forge.sql. When a vocabulary grows, the
 * CHECK is REDEFINED with the full union (docs/rules/polymorphic-tables.md) and
 * the union here changes in the same commit — otherwise the DB and the type
 * disagree and the disagreement surfaces as a 500 at write time.
 */

/**
 * The duplicate threshold. A request whose prompt matches an existing tool
 * with cosine similarity STRICTLY GREATER than this is denied.
 *
 * This is a COSINE SIMILARITY in [0,1] — `1 - (embedding <=> query)` — not a
 * rank score. It is emphatically NOT comparable to SearchHit.score from
 * src/lib/search/hybrid-retrieval.ts, which is an RRF rank artifact
 * (Math.round(rrfScore * 3050)) whose own comment calls it "a readable 0..100
 * band". Thresholding on that number would deny and approve at random. If you
 * ever find yourself passing a hybridSearch score in here, that is the bug.
 */
export const DUPLICATE_DENY_THRESHOLD = 0.9;

/** build_requests.status — matches build_requests_status_chk. */
export const BUILD_REQUEST_STATUSES = [
  'pending_triage',
  'denied',
  'approved',
  'building',
  'build_failed',
  'committed',
  'deployed',
  'failed',
] as const;
export type BuildRequestStatus = (typeof BUILD_REQUEST_STATUSES)[number];

/** tool_registry.status — matches tool_registry_status_chk. */
export const TOOL_REGISTRY_STATUSES = ['active', 'deprecated', 'retired'] as const;
export type ToolRegistryStatus = (typeof TOOL_REGISTRY_STATUSES)[number];

/** approval_reviews.decision — matches approval_reviews_decision_chk. */
export const APPROVAL_DECISIONS = ['approved', 'denied'] as const;
export type ApprovalDecision = (typeof APPROVAL_DECISIONS)[number];

/**
 * approval_reviews.reason_code — matches approval_reviews_reason_code_chk.
 *
 * Three of these are structurally constrained in the DB and cannot be used
 * freely:
 *   duplicate_tool    → decision MUST be 'denied' AND duplicate_tool_id NOT NULL
 *   could_not_measure → decision MUST be 'denied'
 *   manual_override   → decided_by MUST be 'human' with a staff id
 */
export const APPROVAL_REASON_CODES = [
  'duplicate_tool',
  'could_not_measure',
  'out_of_scope',
  'unsafe',
  'insufficient_detail',
  'approved_novel',
  'manual_override',
] as const;
export type ApprovalReasonCode = (typeof APPROVAL_REASON_CODES)[number];

/** approval_reviews.decided_by — matches approval_reviews_decided_by_chk. */
export const DECIDED_BY_KINDS = ['system', 'agent', 'human'] as const;
export type DecidedByKind = (typeof DECIDED_BY_KINDS)[number];

/**
 * Reason codes a MODEL is permitted to submit through submit_approval_decision.
 *
 * duplicate_tool and could_not_measure are excluded on purpose: those two are
 * the deterministic gate's own verdicts, produced by triageBuildRequest before
 * the model is consulted. Letting a model assert them would let it manufacture
 * — or launder — the exact outcomes the gate exists to compute. manual_override
 * is excluded because the DB requires decided_by='human' for it.
 */
export const AGENT_SUBMITTABLE_REASON_CODES = [
  'out_of_scope',
  'unsafe',
  'insufficient_detail',
  'approved_novel',
] as const;
export type AgentSubmittableReasonCode = (typeof AGENT_SUBMITTABLE_REASON_CODES)[number];
