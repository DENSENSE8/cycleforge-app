'use client';

/**
 * FloatingActionFooter — the bottom action band for Displays / panel columns.
 *
 * Bottom buttons FLOAT (owner 2026-10-03): no ground (no `bg-*`), no rule (no
 * `border-t`) — only opaque buttons, separated by gaps, inset from the column
 * edges, with air above them (`ACTION_DOCK_TOP_GAP`, so the content's last row
 * never meets a button's top edge) and a lift below (`ACTION_DOCK_LIFT`, so
 * they never sit flush on the bottom edge). Callers hand it opaque `Button`s
 * (a solid variant; `depth` on the primary CTA) and compose
 * `FLOATING_ACTION_DISABLED_FACE` so a disabled verb stays opaque.
 */

import type { ReactNode } from 'react';
import { ACTION_DOCK_LIFT, ACTION_DOCK_TOP_GAP } from '@/design-system/tokens/dock-clearance';
import { cn } from '@/utils/_cn';

type FloatingActionFooterLayout = 'bleed' | 'cluster' | 'spread';

const FLOATING_ACTION_FOOTER_CLASS = cn('shrink-0 px-4', ACTION_DOCK_TOP_GAP, ACTION_DOCK_LIFT);

/**
 * Equal-width spread peer — fills its column of the `layout="spread"` row
 * (gapped from its neighbours, never a flush full-bleed cell). Use on every
 * control in that row (`IconButton size="fill"`, the floor Delete).
 */
export const FLOATING_FOOTER_SPREAD_PEER_CLASS =
  'flex h-full min-h-0 w-full min-w-0 flex-1 items-center justify-center self-stretch p-0';

/**
 * Glyph size paired with {@link FLOATING_FOOTER_SPREAD_PEER_CLASS} /
 * `IconButton size="fill"` on the h-11 spread row (same rung as `touch`).
 * Never hand `h-4 w-4` on spread peers — that leaves dead air in the column.
 */
export const FLOATING_FOOTER_SPREAD_GLYPH_CLASS = 'h-5 w-5';

/** Spread row: equal gapped columns; every direct peer + nested button fills its column. */
const FLOATING_FOOTER_SPREAD_ROW_CLASS = cn(
  'flex h-11 w-full items-stretch gap-2',
  // Peers grow equally; keep glyphs centered (never items-stretch — that pins
  // SVGs to the top edge and clips stroke tips).
  '[&>*]:flex [&>*]:min-w-0 [&>*]:flex-1 [&>*]:items-center [&>*]:justify-center [&>*]:self-stretch',
  '[&_button]:flex [&_button]:h-full [&_button]:min-h-0 [&_button]:w-full [&_button]:min-w-0 [&_button]:items-center [&_button]:justify-center',
  // Glyph height SoT — fill peers paint touch-rung icons, never micro h-4.
  // overflow-visible so stroke tips are not sheared at the viewBox edge.
  '[&_svg]:!h-5 [&_svg]:!w-5 [&_svg]:overflow-visible',
);

export function FloatingActionFooter({
  children,
  leading,
  layout = 'cluster',
  className,
  'data-testid': testId = 'floating-action-footer',
}: {
  children: ReactNode;
  /** Left-side context (backup note, selection count). Cluster only. */
  leading?: ReactNode;
  /** `bleed` one full-width primary · `cluster` leading + right-aligned buttons · `spread` equal-width icon peers. */
  layout?: FloatingActionFooterLayout;
  className?: string;
  'data-testid'?: string;
}) {
  if (layout === 'bleed') {
    return (
      <div
        className={cn(FLOATING_ACTION_FOOTER_CLASS, 'flex w-full', className)}
        data-testid={testId}
        data-action-band="bleed"
      >
        <div className="flex min-w-0 flex-1 gap-2 [&_button]:w-full">{children}</div>
      </div>
    );
  }

  if (layout === 'spread') {
    return (
      <div
        className={cn(FLOATING_ACTION_FOOTER_CLASS, className)}
        data-testid={testId}
        data-action-band="spread"
      >
        <div className={FLOATING_FOOTER_SPREAD_ROW_CLASS}>{children}</div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        FLOATING_ACTION_FOOTER_CLASS,
        'flex items-center gap-2',
        leading ? 'justify-between' : 'justify-end',
        className,
      )}
      data-testid={testId}
      data-action-band="cluster"
    >
      {leading}
      <div className="flex shrink-0 items-center justify-end gap-2">{children}</div>
    </div>
  );
}
