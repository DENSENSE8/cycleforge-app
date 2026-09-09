/**
 * COMMITMENT LAW — the invariants for a write that spends money or speaks to
 * the outside world.
 *
 * Written 2026-09-07, before the purchase-order feature, deliberately. The
 * owner asked for tenant-authored automation that can order stock: "if below
 * this price for this item number, if back in stock, order". That is the first
 * write in this product whose blast radius is a bank balance rather than a row,
 * so the rule is stated before the code exists rather than reverse-engineered
 * from whatever the first implementation happened to do.
 *
 * ## Why these particular rules
 *
 * They are not invented here. They are the settled shape of B2B purchasing,
 * taken from two places and translated to this codebase:
 *
 * 1. **Amazon Vendor Central / ANSI X12 EDI.** A purchase order (850) is never
 *    answered with a blanket yes. The acknowledgment (855) carries a status per
 *    LINE — accepted, accepted-with-changes, or rejected with a reason code —
 *    inside a hard SLA (typically 24 h), and a mismatch between what you
 *    acknowledged and what you shipped is charged back automatically. The
 *    lesson worth stealing: an acknowledgment is a COMMITMENT, per line, on a
 *    clock. Not a receipt, and not a single button.
 *
 * 2. **Procurement controls (delegation of authority).** Approval limits attach
 *    to ROLES, not people, so turnover cannot orphan an approval. Thresholds
 *    come from actual spend history rather than round numbers. The requester is
 *    never the approver. Repeated sub-threshold orders to one vendor are
 *    flagged, because splitting an order is the standard way to walk around a
 *    limit. Unanswered approvals escalate instead of rotting.
 *
 * ## What this costs us: nothing, because the machinery exists
 *
 * `MutationTrustClass` (`registry.ts:254`) already has `auto` /
 * `draft_scoped` / `review`, and `applyAgentMutation` already lands a `review`
 * mutation as `status='proposed'` in `agent_mutations` instead of applying it
 * (`apply-agent-mutation.ts:348-370`). `recordAudit` already timestamps the
 * trail. `zoho.ts:539 createPurchaseOrder` already implements the pattern
 * end-to-end for the PO-mailbox — its own comment reads "system prepares the
 * draft from extracted email fields, human reviews + publishes".
 *
 * So this law mostly forbids re-inventing what is built, and names the one
 * genuine hole: there is no route that APPLIES a `status='proposed'` row. Only
 * `/revert` exists. Until that lands, `review` is a queue nobody can answer.
 *
 * ## The segregation-of-duties dividend
 *
 * Worth stating because it is the nicest property of this design: when the
 * agent is the requester, two-person approval is FREE. The model cannot be its
 * own approver — it has no session, no role and no permission — so the audit
 * requirement that one actor may not both raise and approve a commitment is
 * satisfied by construction rather than by policy.
 *
 * Adding an invariant here means adding its check in `commitment-law.test.ts`.
 * An invariant with no check is a comment.
 */

export const COMMITMENT_LAW = {
  commitmentIsTwoPhase:
    'A mutation that commits money or transmits to an external party is trust "review", never "auto" and never "draft_scoped". The agent PROPOSES and a human DISPOSES: the write lands as status="proposed" in agent_mutations and applies only when a permitted human answers it. An automation that can spend unattended is a liability; one that drafts spending for one-click approval is the product.',
  acknowledgePerLine:
    'A commitment is confirmed per LINE ITEM, never as a blanket document-level accept. Each line resolves to accepted | accepted_with_changes (quantity, price or date) | rejected with a reason code — the EDI 855 shape. One "Approve" button over N lines is not a confirmation, because the human cannot have read what they committed to.',
  requesterIsNeverApprover:
    'The actor who raises a commitment may never be the actor who approves it, and this is enforced on the proposal row (proposed_by_staff_id) rather than trusted to a UI. A delegate may not approve their own request and may not exceed the authority of the role that delegated to them.',
  authorityBindsToRole:
    'Approval thresholds attach to ROLE permissions in permission-registry.ts, never to a staff id. Turnover must not orphan an approval path, and a threshold is derived from spend history rather than a round number. A per-tenant override is data on the org, never a branch in code.',
  splitsAreDetected:
    'Repeated sub-threshold commitments to one vendor inside a window are flagged as one logical commitment for approval purposes. Order splitting is the standard route around a limit, so a control that ignores cardinality is not a control.',
  silenceEscalates:
    'An unanswered proposal escalates on a timer to a named fallback role; it never expires silently and never auto-applies on timeout. A commitment queue whose default outcome is "nothing happened" is safe; one whose default is "it went through" is not.',
  automationProposesNeverPlaces:
    'A rule in automation_rules emits a PROPOSAL as its action (then_json), never an outward write. The trigger and the condition may be fully automatic; the commitment is not. This keeps every tenant-authored loop inside the same audit trail and the same trust tier as an agent-authored one.',
} as const;

export type CommitmentLawId = keyof typeof COMMITMENT_LAW;

/**
 * Mutation-kind name fragments that mark a commitment.
 *
 * The tripwire greps `MUTATION_KINDS` for these and asserts none of them is
 * registered at `auto` or `draft_scoped`. Deliberately matched on the KIND
 * NAME: a kind called `purchase_order.create` that quietly ships at `auto` is
 * exactly the regression this file exists to catch, and a name is the one part
 * a reviewer reads.
 */
export const COMMITMENT_KIND_MARKERS = [
  'purchase_order',
  'purchase.',
  'payment',
  'payout',
  'refund',
  'invoice',
  'vendor_order',
  'reorder',
] as const;

/**
 * The hole this law names, kept as data so it shows up in a plan and in a diff
 * rather than only in a paragraph.
 *
 * The tripwire asserts the gap is either OPEN and recorded here, or CLOSED and
 * deleted from here — never silently forgotten with the `review` tier still
 * pointing at a queue that has no answer route.
 */
export const COMMITMENT_GAPS: readonly { what: string; why: string; closes: string }[] = [
  {
    what: 'no apply route for agent_mutations.status = "proposed"',
    why: 'applyAgentMutation lands review-tier mutations as proposed, and only /revert exists. Nothing can approve one, so the review tier is currently a dead letter box and any commitment routed to it silently never happens.',
    closes: 'POST /api/assistant/mutations/[id]/apply — permission-gated, refuses when approver === proposer, records the decision.',
  },
  {
    what: 'SelectionAction has no declarative confirm',
    why: 'Every verb hand-wires requestConfirm inside run(), so a dangerous verb ships without a confirmation by omission rather than by decision. Confirmation is a property of the verb, not of the caller.',
    closes: 'confirm?: { description: string; confirmLabel?: string; tone?: "primary" | "danger" } on SelectionAction, executed by the engine before run().',
  },
] as const;

export const COMMITMENT_ACCEPTANCE =
  'A tenant can author a rule that watches price and stock and drafts a purchase order, and no line of that path can move money without a permitted human answering a per-line proposal they did not raise themselves.' as const;
