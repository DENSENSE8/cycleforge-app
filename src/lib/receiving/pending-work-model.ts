/** Pending-work MODEL — types + pure ordering, with zero imports. */
type PendingWorkSource = 'nas-archive' | 'open-exception';



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

/** Idempotent work the card may simply DO. */
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

/** Work that is a DECISION. */
export interface PendingWorkNavigateItem extends PendingWorkBase {
  action: 'navigate';
  href: string;
}

export type PendingWorkItem = PendingWorkCommitItem | PendingWorkNavigateItem;

/** Newest-first across every source — the card shows `[0]` and counts the rest, so this ordering IS the promise that the thing on screen is… */
export function orderPendingWork(items: PendingWorkItem[]): PendingWorkItem[] {
  return [...items].sort((a, b) =>
    a.latestAt < b.latestAt ? 1 : a.latestAt > b.latestAt ? -1 : 0,
  );
}
