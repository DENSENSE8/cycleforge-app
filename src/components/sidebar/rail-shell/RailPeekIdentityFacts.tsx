'use client';

/** Shared identity-chip grammar for rail hover peeks. */

import type { ReactNode } from 'react';
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
import { usePlatformMeta } from '@/hooks/useCatalog';
import { platformMetaIconTone, UNKNOWN_PLATFORM } from '@/lib/source-platform';
import {
  RAIL_PEEK_CHIP_FACE_FLUSH_CLASS,
  RAIL_PEEK_CHIP_PAIR_CLASS,
  RAIL_PEEK_CHIP_STACK_CLASS,
  RAIL_PEEK_SECTION_CLASS,
} from '@/components/sidebar/rail-shell/rail-peek-chrome';

/** Typed identity fact — tone picks the SoT chip (icon + copy history kind). */
export type RailPeekFact = {
  tone: 'order' | 'po' | 'sku' | 'tracking' | 'serial' | 'ticket' | 'bin';
  value: string;
  /** Face override; defaults to the house last-8 preview for the tone. */
  display?: string;
  /**
   * Keep the chip when `value` is blank (e.g. Receiving serial `----`
   * placeholder). Default: empty values are omitted.
   */
  keepEmpty?: boolean;
  /** Raw platform key (`account_source` / `source_platform`). Order/PO only. */
  platformValue?: string | null;
  /** Authoritative carrier when known. Tracking only. */
  carrierHint?: string | null;
};

/**
 * Peek face parity — every typed chip gets the same last-8 / fit footprint so
 * paired rows never invent a second vertical rhythm.
 */
const PEEK_FACE = {
  displayWidth: 'last8' as const,
  fitDisplayWidth: true,
};

/** Row pairs top → bottom: order·trk · sku·sn · ticket · bin. */
const STACK_PAIR_ROWS = [
  ['order', 'po', 'tracking'],
  ['sku', 'serial'],
  ['ticket'],
  ['bin'],
] as const;

type PeekTone = RailPeekFact['tone'];

function RailPeekFactChip({ fact }: { fact: RailPeekFact }) {
  const resolvePlatformMeta = usePlatformMeta();
  const value = fact.value.trim();
  const platformRaw = (fact.platformValue ?? '').trim();
  const platformMeta = platformRaw ? resolvePlatformMeta(platformRaw) : null;
  const platformLabel = platformRaw && platformMeta ? platformMeta.label : null;
  const platformIconTone = platformMeta ? platformMetaIconTone(platformMeta) : null;

  switch (fact.tone) {
    case 'order': {
      // Unfound / empty keepEmpty: paint the catalog platform label (same name
      // the order-chip hover prefixes) instead of a quiet dash.
      const platformFace =
        platformLabel && platformLabel !== UNKNOWN_PLATFORM.label ? platformLabel : '';
      const empty = !value;
      return (
        <OrderIdChip
          value={value}
          display={fact.display ?? (empty ? platformFace : getLast8(value))}
          platformLabel={platformLabel}
          iconClass={platformIconTone?.className}
          iconStyle={platformIconTone?.style}
          // Platform-name faces are variable width — don't lock last8.
          {...(empty ? { fitDisplayWidth: true as const } : PEEK_FACE)}
        />
      );
    }
    case 'po':
      return (
        <PoChip
          value={value}
          display={fact.display}
          platformLabel={platformLabel}
          iconClass={platformIconTone?.className}
          iconStyle={platformIconTone?.style}
          {...PEEK_FACE}
        />
      );
    case 'sku':
      return (
        <SkuScanRefChip
          value={value}
          display={fact.display ?? getLast8(value)}
          {...PEEK_FACE}
        />
      );
    case 'tracking':
      return (
        <TrackingChip
          value={value}
          carrierHint={fact.carrierHint ?? null}
          {...PEEK_FACE}
        />
      );
    case 'serial':
      return (
        <SerialChip
          value={value}
          display={fact.display}
          // Never the table default `w-[120px]` — peek shares last8 + fit with Order/Tracking.
          width="w-fit max-w-full shrink-0"
          {...PEEK_FACE}
        />
      );
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

function isPresent(fact: RailPeekFact): boolean {
  return Boolean(fact.keepEmpty) || fact.value.trim().length > 0;
}

function pickTone(present: RailPeekFact[], tone: PeekTone): RailPeekFact | undefined {
  return present.find((f) => f.tone === tone);
}

/**
 * Build row chips for one pair recipe.
 * Order row: order/PO start · tracking end (order always reserved — quiet
 * placeholder when empty). SKU · serial sit together. Ticket / bin solo.
 */
function chipsForPairRow(
  present: RailPeekFact[],
  tones: readonly PeekTone[],
): RailPeekFact[] {
  if (tones.includes('order') || tones.includes('po')) {
    const id = pickTone(present, 'order') ?? pickTone(present, 'po');
    const tracking = pickTone(present, 'tracking');
    return [id, tracking].filter((f): f is RailPeekFact => Boolean(f));
  }
  return tones
    .map((tone) => pickTone(present, tone))
    .filter((f): f is RailPeekFact => Boolean(f));
}

export function RailPeekIdentityFacts({
  facts,
  headerRight,
}: {
  facts: RailPeekFact[];
  /**
   * Optional end slot on the order/PO row (e.g. Receiving `FulfillmentPickupPill`)
   * when tracking is absent. Never used to place tracking.
   */
  headerRight?: ReactNode;
}) {
  const present = facts.filter(isPresent);
  const orderOrPo = pickTone(present, 'order') ?? pickTone(present, 'po');
  const tracking = pickTone(present, 'tracking');

  const pairRows = STACK_PAIR_ROWS.map((tones) => chipsForPairRow(present, tones as readonly PeekTone[])).filter(
    (chips) => chips.length > 0,
  );
  const claimed = new Set(pairRows.flat());
  const leftovers = present.filter((f) => !claimed.has(f));
  const rows: RailPeekFact[][] = [
    ...pairRows,
    ...leftovers.map((f) => [f]),
  ];

  if (rows.length === 0 && !headerRight) return null;

  // Pickup only: order + pill on one row. Tracking pairs with order when present.
  const showOrderWithPill = Boolean(orderOrPo && headerRight && !tracking);
  const listRows = showOrderWithPill
    ? rows.filter((chips) => !chips.some((c) => c.tone === 'order' || c.tone === 'po'))
    : rows;

  return (
    <div
      data-rail-peek-identity="stack"
      className={`${RAIL_PEEK_SECTION_CLASS} ${RAIL_PEEK_CHIP_FACE_FLUSH_CLASS}`}
    >
      {showOrderWithPill ? (
        <div className={`mb-1 ${RAIL_PEEK_CHIP_PAIR_CLASS}`}>
          <RailPeekFactChip fact={orderOrPo!} />
          <div className="ml-auto shrink-0">{headerRight}</div>
        </div>
      ) : null}
      {/*
        Paired list — order·trk / sku·sn / ticket. justify-between puts air
        between the pair; never ml-auto on tracking itself.
      */}
      <ul className={RAIL_PEEK_CHIP_STACK_CLASS} role="list">
        {listRows.map((chips) => (
          <li
            key={chips.map((c) => `${c.tone}:${c.value}`).join('|')}
            className={RAIL_PEEK_CHIP_PAIR_CLASS}
          >
            {chips.map((fact) => (
              <RailPeekFactChip key={`${fact.tone}:${fact.value}`} fact={fact} />
            ))}
          </li>
        ))}
      </ul>
    </div>
  );
}
