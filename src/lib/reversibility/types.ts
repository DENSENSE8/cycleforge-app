/**
 * Reversibility vocabulary — the actor model and the honest classification of
 * what can and cannot be undone.
 *
 * DEPENDENCY-FREE ON PURPOSE. The Process tool renders these types in the
 * browser, and the chokepoint writes them on the server. Nothing in this file
 * may reach `@/lib/db`, `tenancy/db`, or any other server-only graph
 * (bundle altitude). The writers live in `./apply-session-action.ts` and the
 * reader in `./ledger.ts`, which do.
 *
 * Table: `agent_mutations`, widened by
 * src/lib/migrations/2026-08-23a_agent_mutations_operator_actor.sql.
 * Spec: docs/warehouse-os/02-target-architecture.md §4 · 04-roadmap.md Phase 8.
 */

/**
 * WHO DID IT.
 *
 * Before this existed there was one shape — `proposedByStaffId` +
 * `aiChatSessionId` — and an operator action routed through the chokepoint had
 * to impersonate the assistant to get in. That is not a cosmetic problem:
 * `getMutationTrustStats` (../assistant/mutations/trust-stats.ts) computes an
 * acceptance rate per mutation kind, and that number is the evidence a human
 * weighs when promoting a kind's trust class (review → draft_scoped → auto). A
 * human parking their own session and then unparking it would land as an AI
 * proposal that got reverted — the AI's acceptance rate would fall because a
 * person changed their mind.
 *
 * So the actor is a discriminated union, and the two arms carry genuinely
 * different fields rather than one bag of optionals:
 *
 *   agent    — has a CHAT session (a transcript) and may have no staff at all.
 *   operator — has a STAFF ID, always (a person did this), and may be inside a
 *              WORK session (a unit of warehouse work). The two session ideas
 *              are unrelated and were never the same column.
 *
 * `system` is reserved at the DB level (agent_mutations_actor_kind_chk) for a
 * future job/replay writer. It is deliberately absent here: an unconstructable
 * union arm is a branch every consumer has to handle and nothing can produce.
 */
export type MutationActor =
  | {
      readonly kind: 'agent';
      /** The human in the loop, if any. NULL = a pure AI proposal. */
      readonly staffId: number | null;
      /** `ai_chat_sessions.id` — the transcript this came out of. */
      readonly aiChatSessionId: string | null;
    }
  | {
      readonly kind: 'operator';
      /** Required. An operator action without a person is not an operator action. */
      readonly staffId: number;
      /** The work session this happened inside, when there is one. */
      readonly session: SessionRef | null;
    };

/** `agent_mutations.actor_kind`. Mirrors agent_mutations_actor_kind_chk. */
export type ActorKind = MutationActor['kind'] | 'system';

/**
 * Where an action happened, denormalized the same way `ops_events` denormalizes
 * it (see 2026-08-23b): the id for the join, the type for the rollup — because
 * the classification of a past action must not change when its session row is
 * cleaned up.
 */
export interface PartialSessionRef {
  /** `work_sessions.id`. */
  readonly workSessionId: number;
  /**
   * The session's discriminator as an operator would name it: the scan type
   * ('unbox' | 'triage' | …) for a scan session, the literal 'task' for a task
   * session. Open string on purpose — `SCAN_SESSION_TYPES` widens as surfaces
   * are added, and narrowing it here would fork the vocabulary.
   *
   * NULL means "the id is known and the type is not" — the shape a reader has
   * after loading a ledger row, which stores the id and leaves the type on
   * `work_sessions`. It is not a licence to omit the type when you have it.
   */
  readonly sessionType: string | null;
}

/** A session reference with both halves known. What a WRITER must supply. */
export interface SessionRef extends PartialSessionRef {
  readonly sessionType: string;
}

/**
 * CAN THIS BE UNDONE.
 *
 * Three values, and the second is the one this whole module exists for.
 *
 * • `revertable`   — an inverse descriptor was captured at apply time.
 *                    `revertAgentMutation` can replay it.
 * • `irreversible` — no inverse EXISTS. Not "we did not write one yet" —
 *                    there is nothing to write. A serial-unit `transition()`
 *                    appends to `inventory_events`, a table with no
 *                    `reverses_event_id` column; `endSession` puts a row in a
 *                    state `resumeSession` refuses (SESSION_ALREADY_ENDED).
 *                    The tool renders these locked, with the reason. A tool
 *                    that ADMITS it cannot undo something is correct; one that
 *                    silently no-ops is a data-loss bug.
 * • `unknown`      — rows written before this classifier existed. They may
 *                    carry an inverse in `extra_audit`; `revertAgentMutation`
 *                    resolves it at read time and always did. Claiming either
 *                    answer for them would be fabrication.
 */
export type ReversibilityClass = 'revertable' | 'irreversible' | 'unknown';

/** The undo instruction captured at apply time: replay this to reverse that. */
export interface InverseDescriptor {
  readonly kind: string;
  readonly payload: Readonly<Record<string, unknown>>;
}

/**
 * What one apply decided about its own undoability.
 *
 * A union, not `{ reversibility, inverse?, reason? }`, so the two states cannot
 * be mixed: there is no slot for a reason on a revertable action and no slot
 * for an inverse on an irreversible one. `irreversible` REQUIRES a reason —
 * that is the type-level statement of the rule that we never record "cannot
 * undo" without saying why.
 */
export type ActionDisposition =
  | { readonly reversibility: 'revertable'; readonly inverse: InverseDescriptor }
  | { readonly reversibility: 'irreversible'; readonly reason: string };

/**
 * One row of the Process tool's list. The wire shape, shared by the server
 * reader and the browser component so neither can drift from the other.
 */
export interface ProcessLedgerEntry {
  readonly id: number;
  /** Registry kind ('work_session.park', 'inventory.transition', …). */
  readonly kind: string;
  /** Operator-facing name, resolved through the kind registries. */
  readonly label: string;
  readonly actorKind: ActorKind;
  readonly actorStaffId: number | null;
  readonly actorName: string | null;
  /** `agent_mutations.status` — 'applied' | 'reverted' | 'proposed' | … */
  readonly status: string;
  readonly reversibility: ReversibilityClass;
  /** Present iff `reversibility === 'irreversible'`. Display text. */
  readonly irreversibleReason: string | null;
  /** What the action pointed at, when it named one thing. */
  readonly targetRef: string | null;
  readonly occurredAt: string | null;
  /**
   * Whether the UNDO control should be live for this row RIGHT NOW.
   *
   * Not the same question as `reversibility`. A revertable action that has
   * already been reverted is still revertable-in-kind and must not offer the
   * button again; an `unknown` row from before the classifier may still carry
   * an inverse and must. The server decides this once, from the row, rather
   * than leaving each renderer to re-derive it and get it subtly different.
   */
  readonly canRevert: boolean;
}
