'use client';

/**
 * Unbox-family station chrome — bookmark tabs flush under GlobalHeader.
 *
 * Outer inset matches GlobalHeader ({@link HEADER_INSET_X}). Inner pad/gap on
 * both tabs share {@link receivingStationBookmarkPadClass} /
 * {@link receivingStationBookmarkGapClass} — one spacing integer with the
 * header icon rail.
 *
 *   1. Identity — CartonContextCard density=bar, optically centered
 *   2. More details — {@link ReceivingStationMoreDetails}, far right
 */

import type { ReactNode } from 'react';
import { cn } from '@/utils/_cn';
import { Panel } from '@/design-system/primitives';
import { HEADER_INSET_X } from '@/components/layout/header-shell';
import {
  receivingStationBookmarkPadClass,
  receivingStationBookmarkPanelClass,
} from './receiving-station-bookmark';

export function ReceivingStationContextBar({
  identity,
  moreDetails,
  className,
}: {
  /** CartonContextCard density=bar (or pack identity equivalent). */
  identity: ReactNode;
  /** {@link ReceivingStationMoreDetails} cluster — optional for identity-only hosts. */
  moreDetails?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'relative z-10 flex w-full shrink-0 items-start gap-2',
        HEADER_INSET_X,
        className,
      )}
      data-testid="receiving-station-context-bar"
    >
      <div className="flex min-w-0 flex-1 items-start justify-center overflow-visible">
        <Panel
          padding="none"
          radius="xl"
          elevation="none"
          borderless
          className={cn(
            receivingStationBookmarkPanelClass,
            receivingStationBookmarkPadClass,
            'flex min-h-10 max-w-full items-center overflow-visible',
          )}
          data-testid="receiving-station-identity"
        >
          {identity}
        </Panel>
      </div>
      {moreDetails != null ? moreDetails : null}
    </div>
  );
}
