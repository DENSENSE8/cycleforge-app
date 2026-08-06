'use client';

/**
 * The house hover-peek card for a rail row — dense identity + **copyable** id
 * chips + Open →, rendered inside {@link RailPopover}.
 *
 * Receiving's rail publishes its own richer popover (`renderPopover`, with qty
 * progress + condition badges); every other feed composes THIS card so a parked
 * collapse-strip pin peeks the same anatomy and the same copy affordances
 * instead of a text-only tooltip. One card, one grammar — never a per-rail twin.
 */

import { Button } from '@/design-system/primitives';
import {
  BinChip,
  OrderIdChip,
  PoChip,
  SerialChip,
  SkuScanRefChip,
  TicketChip,
  TrackingChip,
  getLast8,
} from '@/components/ui/CopyChip';

/** Typed identity fact — tone picks the SoT chip (icon + copy history kind). */
export type RailPeekFact = {
  tone: 'order' | 'po' | 'sku' | 'tracking' | 'serial' | 'ticket' | 'bin';
  value: string;
  /** Face override; defaults to the house last-8 preview for the tone. */
  display?: string;
};

function RailPeekFactChip({ fact }: { fact: RailPeekFact }) {
  const value = fact.value.trim();
  switch (fact.tone) {
    case 'order':
      return <OrderIdChip value={value} display={fact.display ?? getLast8(value)} />;
    case 'po':
      return <PoChip value={value} display={fact.display} />;
    case 'sku':
      return <SkuScanRefChip value={value} display={fact.display ?? getLast8(value)} />;
    case 'tracking':
      return <TrackingChip value={value} />;
    case 'serial':
      return <SerialChip value={value} display={fact.display} width="w-fit shrink-0" />;
    case 'ticket':
      return (
        <TicketChip
          value={value.replace(/^#/, '')}
          display={fact.display ?? value.replace(/^#/, '')}
        />
      );
    case 'bin':
      return <BinChip value={value} display={fact.display} />;
  }
}

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
  const chips = facts.filter((f) => f.value.trim().length > 0);

  return (
    <div className="space-y-3 p-3.5">
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
        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-2 border-t border-border-hairline pt-3 [&>*]:shrink-0">
          {chips.map((fact) => (
            <RailPeekFactChip key={`${fact.tone}:${fact.value}`} fact={fact} />
          ))}
        </div>
      ) : meta ? (
        <p className="truncate border-t border-border-hairline pt-3 text-role-caption font-medium text-text-soft">
          {meta}
        </p>
      ) : null}

      <div className="flex items-center justify-between border-t border-border-hairline pt-2.5">
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
