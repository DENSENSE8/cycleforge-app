/**
 * Pending-work MODEL — types + pure ordering, with zero imports.
 *
 * Split out of `pending-work.ts` because that module reaches `@/lib/tenancy/db`
 * → `@/lib/db`, which carries `server-only`: a client component (the card, the
 * hook) importing the shape from there is one careless value-import away from a
 * build error, and the unit test cannot load it at all. Same rule as the rest of
 * the repo — pure helpers get their own dependency-free module and the heavy one
 * re-exports them (.claude/rules/build-gotchas.md → bundle altitude).
 */
export type PendingWorkSource = 'nas-archive' | 'open-exception';

/**
 * How much authority the card's button has.
 *
 * `commit` — the action is idempotent and needs no judgement, so the card may
 *   just do it (re-copying a ticket folder to the NAS).
 * `navigate` — the action is a DECISION. The card takes the operator to the
 *   record and stops. Resolving a SHORT or a DAMAGED means deciding what
 *   actually happened to someone's goods; a corner card with a one-click
 *   "Resolve" would be inviting an operator to clear a backlog without looking
 *   at it, which is worse than the backlog.
 */
export type PendingWorkAction = 'commit' | 'navigate';

interface PendingWorkBase {
  source: PendingWorkSource;
  /** Stable identity for dismissal. Includes the count, so more work re-arms. */
  key: string;
  receivingId: number;
  /** One line stating what is owed. Rendered as-is. */
  headline: string;
  ticketNumber: string | null;
  orderRef: string | null;
  count: number;
  /** Newest contributing instant — the card shows the most recent item first. */
  latestAt: string;
  /** Button face. */
  actionLabel: string;
}

/**
 * Idempotent work the card may simply DO.
 *
 * `ticketNumber` narrows to a required string: the commit path copies into a
 * ticket folder, so an item with no folder to copy into is not a commit item.
 * That removes the runtime "is there a ticket?" check the button used to carry.
 */
export interface PendingWorkCommitItem extends PendingWorkBase {
  action: 'commit';
  ticketNumber: string;
  /**
   * A commit item has nowhere to send anyone — `never` so the type system, not
   * a code review, is what stops a source from smuggling a destination onto the
   * branch that renders a do-it button.
   */
  href?: never;
}

/**
 * Work that is a DECISION. The card takes the operator to the record and stops.
 *
 * `href` is required, so the navigate branch cannot render without a
 * destination — and because the union is discriminated on `action`, the commit
 * button and the navigate link are unreachable from each other's item type.
 * This is the invariant "a navigate source never gets a one-click commit",
 * enforced by construction rather than by a test that reads the JSX.
 */
export interface PendingWorkNavigateItem extends PendingWorkBase {
  action: 'navigate';
  href: string;
}

export type PendingWorkItem = PendingWorkCommitItem | PendingWorkNavigateItem;

/**
 * Newest-first across every source — the card shows `[0]` and counts the rest,
 * so this ordering IS the promise that the thing on screen is the most recent
 * work owed. Pure and exported so it can be tested without a database.
 *
 * ISO-8601 UTC strings compare correctly lexicographically, which is why this
 * does not parse dates: `Date` construction here would be pure cost.
 */
export function orderPendingWork(items: PendingWorkItem[]): PendingWorkItem[] {
  return [...items].sort((a, b) =>
    a.latestAt < b.latestAt ? 1 : a.latestAt > b.latestAt ? -1 : 0,
  );
}
