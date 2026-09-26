'use client';

/** The house hover-peek card for a rail row — dense identity + **copyable** id chips + Open →, rendered inside {@link RailPopover}. */

import { Button } from '@/design-system/primitives';
import {
  RailPeekIdentityFacts,
  type RailPeekFact,
} from '@/components/sidebar/rail-shell/RailPeekIdentityFacts';
import {
  RAIL_PEEK_PAD_CLASS,
  RAIL_PEEK_SECTION_CLASS,
} from '@/components/sidebar/rail-shell/rail-peek-chrome';

export type { RailPeekFact };

export function RailPeekCard({
  title,
  statusLabel,
  statusDotClass,
  meta,
  facts = [],
  age,
  onOpen,
}: {
  title: string;
  /** Feed-scoped status copy (same source as the row's status-dot tooltip). */
  statusLabel?: string;
  /** Tailwind bg class for the status dot — matches the open-rail row. */
  statusDotClass?: string;
  /** Free-text identity line for feeds with no typed chips (e.g. customer · qty). */
  meta?: string;
  /** Copyable identity chips — the reason this card exists. */
  facts?: RailPeekFact[];
  /** Relative age on the feed's sort axis (e.g. "3h"). */
  age?: string;
  onOpen: () => void;
}) {
  const chips = facts.filter((f) => Boolean(f.keepEmpty) || f.value.trim().length > 0);

  return (
    <div className={RAIL_PEEK_PAD_CLASS}>
      <div>
        <p className="text-sm font-semibold leading-snug text-text-default">{title}</p>
        {statusLabel ? (
          <span className="mt-1.5 inline-flex items-center gap-1.5 rounded bg-surface-sunken inset-chip text-role-eyebrow uppercase tracking-widest text-text-soft ring-1 ring-inset ring-border-soft">
            {statusDotClass ? (
              <span aria-hidden className={`block h-1.5 w-1.5 rounded-full ${statusDotClass}`} />
            ) : null}
            {statusLabel}
          </span>
        ) : null}
      </div>

      {chips.length > 0 ? (
        <RailPeekIdentityFacts facts={facts} />
      ) : meta ? (
        <p className={`truncate ${RAIL_PEEK_SECTION_CLASS} text-role-caption font-medium text-text-soft`}>
          {meta}
        </p>
      ) : null}

      <div className={`flex items-center justify-between ${RAIL_PEEK_SECTION_CLASS}`}>
        <span className="text-role-eyebrow uppercase tracking-widest text-text-faint">
          {age ? (/\bago\b/i.test(age) ? age : `${age} ago`) : '—'}
        </span>
        <Button
          variant="primary"
          size="sm"
          onClick={onOpen}
          className="h-auto rounded-md px-2.5 py-1 text-role-micro uppercase tracking-widest"
        >
          Open →
        </Button>
      </div>
    </div>
  );
}
