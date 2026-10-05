'use client';

/**
 * The Units cell on the Pasted list: units received / expected over the
 * number's receiving lines (Σ quantity_received / Σ quantity_expected —
 * `facts.units`). Operator rule (2026-10-04): an UNBOXED number reads green,
 * anything else muted — never orange on a Received row. A 2px underline fills
 * by the same ratio in the same tone, so half-received reads at a glance. The
 * words claim nothing the data does not hold (no "short" / "over": there is
 * no unbox count or missing-units record, only the PO lines).
 */

import type { NavLocateFacts } from '@/lib/nav/context/schema';
import { cn } from '@/utils/_cn';

export function PastedListUnits({ facts }: { facts: NavLocateFacts }) {
  const units = facts.units;
  if (!units) return null;
  const unboxed = Boolean(facts.unboxedAt);
  const expected = units.expected;
  const ratio = expected ? Math.min(1, units.received / expected) : units.received > 0 ? 1 : 0;
  const duplicates = facts.duplicates?.length ?? 0;
  const title = [
    expected != null
      ? `Received ${units.received} of ${expected} on the PO lines`
      : `Received ${units.received} on the PO lines (a line has no expected quantity)`,
    duplicates > 0 ? `${duplicates} duplicate import line${duplicates === 1 ? '' : 's'} left out` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <span data-pasted-units={unboxed ? 'unboxed' : 'open'} title={title} className="relative inline-flex min-w-0 flex-col items-end">
      <span className={cn('tabular-nums', unboxed ? 'text-text-success' : 'text-text-faint')}>
        {units.received}/{expected ?? '?'}
      </span>
      <span aria-hidden className="h-0.5 w-full overflow-hidden rounded-full bg-border-hairline">
        <span
          className={cn('block h-full origin-left rounded-full', unboxed ? 'bg-text-success' : 'bg-text-faint')}
          style={{ transform: `scaleX(${ratio})` }}
        />
      </span>
    </span>
  );
}
