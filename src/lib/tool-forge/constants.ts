/** Tool Forge vocabulary + the one number the whole gate turns on. */

/** The duplicate threshold. */
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
type BuildRequestStatus = (typeof BUILD_REQUEST_STATUSES)[number];

/** tool_registry.status — matches tool_registry_status_chk. */
export const TOOL_REGISTRY_STATUSES = ['active', 'deprecated', 'retired'] as const;
export type ToolRegistryStatus = (typeof TOOL_REGISTRY_STATUSES)[number];

/** approval_reviews.decision — matches approval_reviews_decision_chk. */
const APPROVAL_DECISIONS = ['approved', 'denied'] as const;
type ApprovalDecision = (typeof APPROVAL_DECISIONS)[number];

/** approval_reviews.reason_code — matches approval_reviews_reason_code_chk. */
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

/** Reason codes a MODEL is permitted to submit through submit_approval_decision. */
export const AGENT_SUBMITTABLE_REASON_CODES = [
  'out_of_scope',
  'unsafe',
  'insufficient_detail',
  'approved_novel',
] as const;
export type AgentSubmittableReasonCode = (typeof AGENT_SUBMITTABLE_REASON_CODES)[number];
