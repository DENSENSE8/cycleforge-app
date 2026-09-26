/**
 * KioskStepTitleRow — a checkout step's ONE bold display header, top-left, with the running `N · $total` on the same row at the right edge.
 * (operator 2026-09-24). The repair flow wears the cart's row exactly
 * (operator 2026-09-24: "Device & quote … must be displayed at the top exactly
 * open without leaving it (operator 2026-09-24: "IDed for multiple devices").
 */

import { formatCartCents } from '@/lib/kiosk/cart-card-view';

export function KioskStepTitleRow({
  title,
  count,
  totalCents,
  meta,
  testId,
}: {
  title: string;
  /** Whole units on the visit (a line of two cables counts as two). */
  count: number;
  totalCents: number;
  /** Short identifier after the title, e.g. `#42`. Omitted → the title alone. */
  meta?: string | null;
  /** `data-testid` on the `N · $total` figure. */
  testId: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 px-4 pb-3 pt-5">
      <h2 className="min-w-0 truncate text-left text-role-display font-bold text-text-default">
        {title}
        {meta ? (
          <span className="ml-2 font-semibold tabular-nums text-text-soft" data-testid="kiosk-step-title-meta">
            {meta}
          </span>
        ) : null}
      </h2>
      <p className="shrink-0 text-role-title font-semibold tabular-nums" data-testid={testId}>
        <span className="text-text-default">{count} ·</span>{' '}
        <span className="text-text-success">{formatCartCents(totalCents)}</span>
      </p>
    </div>
  );
}
