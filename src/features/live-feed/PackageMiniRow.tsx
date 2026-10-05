'use client';

/**
 * A package as one compact row — stage glyph, title, the order number's
 * last-8 face, stage — that opens it. Find's matches and a box's other orders
 * paint the same row.
 */

import { formatOrderIdDisplay } from '@/lib/copy-chip-format';
import { PACKAGE_STAGE_META } from '@/lib/live-feed/stages';
import type { PackageCard } from '@/lib/live-feed/types';
import { cn } from '@/utils/_cn';
import { STAGE_LOOK } from './stage-look';

export function PackageMiniRow({ card, current, onOpen }: { card: PackageCard; current: boolean; onOpen: (card: PackageCard) => void }) {
  const look = STAGE_LOOK[card.stage];
  return (
    // ds-raw-button: a whole record face (stage glyph, title, id, stage) that opens the package — no Button size fits a record row.
    <button
      type="button"
      onClick={() => onOpen(card)}
      data-package-row={card.orderRowId}
      aria-current={current ? 'true' : undefined}
      className={cn(
        'flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left text-sm hover:bg-slate-50',
        'outline-none focus-visible:bg-slate-100',
        current && 'bg-slate-100',
      )}
    >
      <span className={cn('flex size-6 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset', look.tile)}>
        <look.Icon className="size-3.5" />
      </span>
      <span className="min-w-0 flex-1 truncate font-medium text-slate-900">{card.title}</span>
      <span className="shrink-0 font-mono text-xs tabular-nums text-slate-500">{formatOrderIdDisplay(card.orderNumber)}</span>
      <span className={cn('shrink-0 text-xs font-medium', look.ink)}>{PACKAGE_STAGE_META[card.stage].label}</span>
    </button>
  );
}
