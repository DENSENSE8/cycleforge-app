/**
 * The operator-action kind registry, and the merged lookup the Process tool
 * reads.
 *
 * ── WHY A SECOND REGISTRY AND NOT MORE ROWS IN MUTATION_KINDS ───────────────
 *
 * `MUTATION_KINDS` (src/lib/surfaces/registry.ts) answers a question these
 * kinds do not have: **how much do we trust the AI to do this unreviewed**.
 * Every entry there carries a trust class, the trust classes drive a documented
 * widening protocol, and `getMutationTrustStats` measures whether a kind has
 * earned promotion. None of that applies to a person parking their own scan
 * session. There is no review queue for a thing a human is already permitted to
 * do by hand, and filing operator actions under a trust class would make the AI
 * trust numbers measure the wrong population.
 *
 * What these kinds DO need is the thing `MUTATION_KINDS` has no field for: an
 * explicit, per-kind answer to "can this be undone, and if not, why not".
 *
 * So: two registries, one LEDGER. Both write `agent_mutations`; both are read
 * through {@link resolveActionKind}. That is the split the plan actually asks
 * for — "the Process tool reads ONE ledger instead of a parallel undo stack" is
 * a statement about the table, not about the vocabulary.
 *
 * ── DEPENDENCY-FREE ─────────────────────────────────────────────────────────
 *
 * Pure module (the only import is the equally pure `surfaces/registry`), so the
 * Process tool can render a kind's label and reversibility in the browser
 * without pulling a server graph.
 */

import {
  MUTATION_KINDS,
  isMutationKind,
  type MutationKind,
} from '@/lib/surfaces/registry';

/**
 * What a kind declares about its own undoability, before any particular row
 * exists.
 *
 * `irreversible` REQUIRES a reason and `decided_at_apply` REQUIRES a note — the
 * type refuses to let a kind say "no undo" without saying why, which is the
 * whole discipline this module is here to enforce.
 */
export type DeclaredReversibility =
  | { readonly mode: 'revertable' }
  | { readonly mode: 'irreversible'; readonly reason: string }
  | { readonly mode: 'decided_at_apply'; readonly note: string };

export interface SessionActionKindDef {
  /** Operator-facing name. Shown in the Process list. */
  readonly label: string;
  /** `agent_mutation_affects.target_kind` stamped for this kind. */
  readonly targetKind: string;
  /** What it does, in a sentence, for the tool and for anyone reading this file. */
  readonly description: string;
  /**
   * The permission FLOOR — never a second gate.
   *
   * Ruled 2026-08-22: there is no per-tile permission architecture. The 969 API
   * routes stay gated by `withAuth` / `requireRoutePerm`, and that is the real
   * boundary; an operator reaches this chokepoint only through a route that has
   * already decided they may act. This field exists so the Process tool can
   * grey a control it knows will 403, and so an AI path that ever reaches these
   * kinds cannot be looser than the UI it shadows.
   *
   * `operations.view` is the honest value for all of them. A serial-unit
   * transition's real permission varies by station (`tech.qc_pass`,
   * `packing.complete_order`, `receiving.mark_received`, …), so naming any one
   * of them here would be a lie that reads like a guarantee.
   */
  readonly permission: string;
  readonly reversibility: DeclaredReversibility;
}

/**
 * The session-scoped operator actions.
 *
 * Ordered as an operator meets them: the session's own lifecycle first, then
 * the domain writes that happen inside it.
 */
export const SESSION_ACTION_KINDS = {
  'work_session.start': {
    label: 'Start session',
    targetKind: 'work_session',
    description: 'Open a work session (scan or task) and, optionally, arm it in the same transaction.',
    permission: 'operations.view',
    reversibility: {
      mode: 'irreversible',
      // Not "we could and didn't". A session row is the anchor every other row
      // in this ledger hangs off, and deleting it would orphan them; ending it
      // is a different act with a different meaning, not an undo. The Process
      // tool lists what happened INSIDE a session — offering to un-happen the
      // session from within itself is incoherent.
      reason: 'A session either happened or it did not. End it instead — that is a new act, not an undo.',
    },
  },
  'work_session.arm': {
    label: 'Arm scan session',
    targetKind: 'work_session',
    description:
      'Give this scan session the wedge, app-wide. Disarms whatever held it — the DB partial unique index makes two armed scan sessions structurally impossible.',
    permission: 'operations.view',
    // Genuinely revertable, and precisely so: armWithin returns the ids it took
    // the wedge from, so the inverse is "give it back to that one" — or, when
    // nothing held it, "disarm this one".
    reversibility: { mode: 'revertable' },
  },
  'work_session.disarm': {
    label: 'Disarm scan session',
    targetKind: 'work_session',
    description: 'Release the wedge without ending or parking the session. The tenant is left with no armed scan session.',
    permission: 'operations.view',
    reversibility: { mode: 'revertable' },
  },
  'work_session.park': {
    label: 'Park session',
    targetKind: 'work_session',
    description: 'Set a session aside without ending it. Parking always disarms — the arm belongs to live work.',
    permission: 'operations.view',
    // The inverse is resume, and it carries `rearm` so a park that took the
    // wedge away gives it back. A revert that unparked but left the operator
    // with a dead scanner would be a half-undo, which is worse than none.
    reversibility: { mode: 'revertable' },
  },
  'work_session.resume': {
    label: 'Resume session',
    targetKind: 'work_session',
    description:
      'Reopen a parked session, or renew / take over the edit lease on an open one. Resuming deliberately does not arm — call arm as its own act.',
    permission: 'operations.view',
    reversibility: {
      mode: 'decided_at_apply',
      // Two different acts wear one name. Unparking has a clean inverse (park
      // it again). Renewing a lease on an already-open session does not: the
      // previous lease had expired or been taken, and reinstating a dead lease
      // would hand the session to someone who has stopped working on it.
      note: 'Revertable when it unparked a session (inverse: park). Irreversible when it only renewed a lease — the prior lease was already gone.',
    },
  },
  'work_session.end': {
    label: 'End session',
    targetKind: 'work_session',
    description: 'End a session. Always disarms and clears the edit lease.',
    permission: 'operations.view',
    reversibility: {
      mode: 'irreversible',
      // This is the domain's rule, not ours: resumeSession returns
      // SESSION_ALREADY_ENDED for an ended row (work-sessions.ts). There is no
      // supported path back, and inventing one here — a raw UPDATE flipping
      // status and NULLing ended_at — would route around the one chokepoint
      // that owns this table's invariants.
      reason: 'Ending is terminal: resumeSession refuses an ended session (SESSION_ALREADY_ENDED). Start a new one.',
    },
  },
  'work_session.set_state': {
    label: 'Update session scratch',
    targetKind: 'work_session',
    description:
      "Replace the session's `state` JSONB (draft buffers, tile geometry). Queryable business facts are real columns; this is variant scratch only.",
    permission: 'operations.view',
    // The prior document is captured whole and written back whole. A PATCH
    // inverse would be wrong: JSON merge does not have an inverse when a key
    // was deleted, and "restore the previous state" is exactly what an operator
    // means by undo here.
    reversibility: { mode: 'revertable' },
  },

  // ── Domain writes that happen inside a session ────────────────────────────
  //
  // These are the honest hard part, and they are in the registry precisely so
  // the Process tool can show them and then refuse to undo them, with a reason,
  // instead of omitting them and letting an operator believe the list is
  // complete.
  'inventory.transition': {
    label: 'Change unit status',
    targetKind: 'serial_unit',
    description:
      'Move a serial unit to a new state through the guarded state machine, emitting one inventory_event. Runs on the caller transaction, so the ledger row and the domain write commit together or not at all.',
    permission: 'operations.view',
    reversibility: {
      mode: 'irreversible',
      // `inventory_events` has no `reverses_event_id` and no reversal
      // convention — checked against 2026-05-13_create_inventory_events.sql.
      // A "reverse" transition is therefore a NEW forward event that happens to
      // point back at the old state: the history grows, it does not shrink. We
      // could offer that, but calling it undo would misrepresent what the
      // timeline will show, and the whole point of this classification is to
      // stop doing that.
      reason:
        'inventory_events is append-only with no reversal link. Moving the unit back is a new forward event, not an undo — do it as its own transition so the timeline stays true.',
    },
  },
  'receiving_line.transition': {
    label: 'Change line status',
    targetKind: 'receiving_line',
    description:
      "Move a receiving line's workflow_status through the guarded state machine, emitting one inventory_event. Runs on the caller transaction.",
    permission: 'operations.view',
    reversibility: {
      mode: 'irreversible',
      reason:
        'inventory_events is append-only with no reversal link, and the line UPDATE also moves stage clocks and received_by. Re-transition the line forward instead.',
    },
  },
} as const satisfies Record<string, SessionActionKindDef>;

export type SessionActionKind = keyof typeof SESSION_ACTION_KINDS;
export const SESSION_ACTION_KIND_LIST = Object.keys(SESSION_ACTION_KINDS) as SessionActionKind[];

export function isSessionActionKind(v: unknown): v is SessionActionKind {
  return typeof v === 'string' && Object.hasOwn(SESSION_ACTION_KINDS, v);
}

/**
 * AI mutation kinds whose reversibility is knowable statically.
 *
 * Everything not listed is `decided_at_apply`, because that is the truth: the
 * chokepoint's per-kind dispatch decides whether an inverse can be captured for
 * THIS write (a feed-membership flip captures its prior state; a photo
 * reassignment captures each photo's own prior home), and the row records what
 * it found.
 */
const MUTATION_KIND_REVERSIBILITY: Partial<Record<MutationKind, DeclaredReversibility>> = {
  'entity_signal.insert': {
    mode: 'irreversible',
    // Stated at the dispatch site in apply-agent-mutation.ts: "Append-only fact
    // — the signal IS the action … Never revertable."
    reason: 'A signal is an append-only observation. Deleting it would edit the record of what was noticed.',
  },
};

const REVIEW_CLASS_REVERSIBILITY: DeclaredReversibility = {
  mode: 'irreversible',
  // A review-class kind never applied anything — it queued a proposal. There is
  // nothing to undo; the verb is reject, and it lives in the review UI.
  reason: 'Nothing was applied — this is a proposal awaiting review. Reject it in the review queue instead.',
};

const APPLY_TIME_REVERSIBILITY: DeclaredReversibility = {
  mode: 'decided_at_apply',
  note: 'The chokepoint captures an inverse descriptor per write; the row records whether it got one.',
};

/** One kind, resolved from whichever registry owns it. */
export interface ResolvedActionKind {
  readonly kind: string;
  readonly label: string;
  readonly description: string;
  readonly targetKind: string;
  readonly permission: string;
  /** Which registry answered — the Process tool badges agent vs operator work. */
  readonly registry: 'mutation' | 'session_action';
  readonly reversibility: DeclaredReversibility;
}

/**
 * The merged lookup. `MUTATION_KINDS` first, then `SESSION_ACTION_KINDS`.
 *
 * Order matters only as a statement of precedence: the AI registry is the older
 * and more heavily pinned of the two (registry.test.ts asserts its shape), so a
 * name collision must resolve to it rather than being silently shadowed by a
 * kind added here. The two vocabularies are disjoint today and should stay so —
 * `SESSION_ACTION_KINDS` deliberately uses prefixes (`work_session.`,
 * `inventory.`, `receiving_line.`) that `MUTATION_KINDS` does not.
 *
 * Returns null for a kind neither registry knows, which is how a row written by
 * an older deploy — or a typo — surfaces as "unrecognized" instead of crashing
 * a list render.
 */
export function resolveActionKind(kind: string): ResolvedActionKind | null {
  if (isMutationKind(kind)) {
    const def = MUTATION_KINDS[kind];
    return {
      kind,
      label: def.label,
      description: def.description,
      targetKind: def.targetKind,
      permission: def.permission,
      registry: 'mutation',
      reversibility:
        MUTATION_KIND_REVERSIBILITY[kind] ??
        (def.trust === 'review' ? REVIEW_CLASS_REVERSIBILITY : APPLY_TIME_REVERSIBILITY),
    };
  }
  if (isSessionActionKind(kind)) {
    const def = SESSION_ACTION_KINDS[kind];
    return {
      kind,
      label: def.label,
      description: def.description,
      targetKind: def.targetKind,
      permission: def.permission,
      registry: 'session_action',
      reversibility: def.reversibility,
    };
  }
  return null;
}

/**
 * True for any kind either registry knows. The chokepoint's admission check.
 *
 * Returns a plain boolean, NOT `kind is string`. A predicate that narrows to
 * `string` is a no-op on an argument already typed `string` — and worse, it
 * narrows the FALSE branch to `never`, so the caller's `!isActionKind(k) &&
 * k.startsWith(…)` fallback stopped compiling. What this answers is membership,
 * not type.
 */
export function isActionKind(kind: unknown): boolean {
  return typeof kind === 'string' && resolveActionKind(kind) !== null;
}

/**
 * The reason an already-classified irreversible kind cannot be undone, or null.
 * Used by the ledger reader to fill `irreversibleReason` for rows written
 * before the reason was stored, and by the tool to explain a locked control.
 */
export function declaredIrreversibleReason(kind: string): string | null {
  const resolved = resolveActionKind(kind);
  if (!resolved) return null;
  return resolved.reversibility.mode === 'irreversible' ? resolved.reversibility.reason : null;
}
