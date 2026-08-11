'use client';

/**
 * Stacked list-row identity — **title leads; typed keys sit on a second row**.
 *
 * SoT for every **small-width two-row** face where the scannable string is a long
 * title (product · ticket subject · sheet exception · drill parent) and the
 * durable handles are typed {@link CopyChip}s (ticket # · order # · PO ·
 * tracking · SKU) — last-8 face, bare full id on copy.
 *
 * Full-width LedgerGrid / queue sheets keep their own column anatomy. This
 * primitive is the **narrow** twin: title → keys, never a third identity grammar
 * (mono `#{id}` on the title row, or a hand-rolled `flex-col` title/meta fork).
 *
 * Golden consumers: Unbox History {@link LedgerDrillParentMap}, Move photos
 * carton targets, Orders import `SyncListRow`, Support ticket subject + `#`,
 * repair kiosk selected-product tray. Ticket pick / link lists compose thin
 * {@link TicketPickRow} on top. GlobalHeader inbox stays on
 * {@link CompactActivityRow} for the activity frame, but paints the same
 * order/tracking chips on its meta strip (never mono prose).
 *
 * Detail: `.claude/rules/source-of-truth.md` → Stacked row identity.
 */

import type { ReactNode } from 'react';
import { cn } from '@/utils/_cn';

/** Quiet mid-dot between stacked identity keys (qty · order · tracking). */
function StackedIdentityKeySep({ className }: { className?: string }) {
  return (
    <span
      className={cn('shrink-0 text-text-faint', className)}
      aria-hidden
      data-stacked-identity-key-sep=""
    >
      ·
    </span>
  );
}

/**
 * Join key nodes with {@link StackedIdentityKeySep}. Skips null / false / empty
 * strings so domain adapters never invent a local `metaSep` twin.
 */
export function joinStackedIdentityKeys(
  parts: ReadonlyArray<ReactNode | null | undefined | false>,
): ReactNode {
  const present = parts.filter((p): p is ReactNode => {
    if (p == null || p === false) return false;
    if (typeof p === 'string' && p.trim() === '') return false;
    return true;
  });
  if (present.length === 0) return null;
  const nodes: ReactNode[] = [];
  present.forEach((part, i) => {
    if (i > 0) {
      nodes.push(<StackedIdentityKeySep key={`stacked-key-sep-${i}`} />);
    }
    nodes.push(part);
  });
  return <>{nodes}</>;
}

export function StackedRowIdentity({
  title,
  keys,
  trailing,
  className,
}: {
  /**
   * Leading title / subject. Long product / sheet titles wrap
   * (`whitespace-normal break-words` — RailSelectionRoster / SyncListRow
   * grammar); truncate is not the default for those faces.
   */
  title: ReactNode;
  /**
   * Second-row typed keys — `TicketChip` · `OrderIdChip` · `PoChip` ·
   * `TrackingChip` · `SkuScanRefChip` (or a quiet qty). Omit / null when the
   * row has no durable handles yet.
   */
  keys?: ReactNode | null;
  /** Optional trailing control (select chevron, clear, status badge, price). */
  trailing?: ReactNode;
  className?: string;
}) {
  const hasKeys = keys != null && keys !== false && keys !== '';

  return (
    <div
      className={cn('flex min-w-0 w-full items-start gap-2', className)}
      data-stacked-row-identity=""
    >
      <div className="flex min-w-0 flex-1 flex-col items-start gap-1">
        <div className="min-w-0 w-full">{title}</div>
        {hasKeys ? (
          <div
            className="flex min-w-0 flex-wrap items-center gap-1.5"
            data-stacked-row-identity-keys=""
          >
            {keys}
          </div>
        ) : null}
      </div>
      {trailing ? <div className="shrink-0 pt-0.5">{trailing}</div> : null}
    </div>
  );
}
