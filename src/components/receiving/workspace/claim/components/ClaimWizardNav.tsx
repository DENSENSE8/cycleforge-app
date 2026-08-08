'use client';

import { useCallback, useMemo, useRef } from 'react';
import { TabDisplay } from '@/design-system/components';
import { segmentChordHint } from '@/lib/keyboard/segment-chords';
import { useSegmentChords } from '@/lib/keyboard/useSegmentChords';
import { cn } from '@/utils/_cn';
import type { ClaimModalMode } from '../claim-types';
import type { ReceivingClaimController } from '../hooks/useReceivingClaimController';

const CLAIM_MODE_TAB_IDS = ['create', 'link'] as const;

/**
 * Claim child mode (New · Link) — only on the no-ticket Claim surface.
 * Ticket topic is presence-exclusive (Claim vs Chat); there is no parent
 * Chat · Claim underline switcher.
 *
 * - `strip` — modal / body full-width segment under identity chrome.
 * - `leaf-header` — Displays sticky leaf-header trailing (same h-6 band as
 *   ← → + title). Never a second sticky row.
 *
 * Always-visible `⌥1` / `⌥2` (Alt+1/2) hints + {@link useSegmentChords}.
 * Section progress is the stacked scroll body (no ScrollSpy strip).
 */
export function ClaimWizardNav({
  c,
  placement = 'strip',
}: {
  c: ReceivingClaimController;
  placement?: 'strip' | 'leaf-header';
}) {
  const leafHeader = placement === 'leaf-header';
  const modeChangeRef = useRef(c.handleModeChange);
  modeChangeRef.current = c.handleModeChange;
  const onTabChange = useCallback((id: string) => {
    modeChangeRef.current(id as ClaimModalMode);
  }, []);

  useSegmentChords({
    enabled: true,
    tabIds: CLAIM_MODE_TAB_IDS,
    onTabChange,
  });

  const tabs = useMemo(
    () => [
      { id: 'create', label: 'New', hint: segmentChordHint(1) },
      { id: 'link', label: 'Link', hint: segmentChordHint(2) },
    ],
    [],
  );

  return (
    <div
      className={cn(
        leafHeader
          ? 'flex h-full shrink-0 items-stretch'
          : 'flex shrink-0 flex-col gap-0 border-b border-border-hairline',
      )}
      data-claim-wizard-nav={placement}
      data-testid={leafHeader ? 'claim-wizard-nav-leaf-header' : 'claim-wizard-nav-strip'}
    >
      <TabDisplay
        tabs={tabs}
        activeTab={c.mode}
        onTabChange={onTabChange}
        density="nested"
        fit={leafHeader ? 'hug' : 'fill'}
        appearance="segment"
        aria-label="Claim mode"
        className={
          leafHeader
            ? // Fill the 24px leaf band — twMerge wins over segment h-8.
              'h-full max-h-full rounded-none border-y-0 border-r-0 text-role-micro [&_button]:min-w-0 [&_button]:px-1 [&_button]:text-role-micro'
            : 'rounded-none border-x-0 border-t-0'
        }
      />
    </div>
  );
}
